import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, realpathSync, writeFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { patchedExpoConfigSource } from './patch-toolchain.mjs';

const require = createRequire(import.meta.url);
const expoRequire = createRequire(require.resolve('expo/package.json'));
const cliRoot = dirname(expoRequire.resolve('@expo/cli/package.json'));
const cliRequire = createRequire(join(cliRoot, 'package.json'));
const configPackage = require.resolve('@expo/config/package.json');
const configRequire = createRequire(configPackage);
const merge = configRequire('deepmerge')({ symbols: true });

test('Fastify replacement blocks prototype poisoning from both inputs', () => {
  assert.equal(configRequire('deepmerge/package.json').name, '@fastify/deepmerge');
  assert.equal(configRequire('deepmerge/package.json').version, '3.2.4');
  const payload = JSON.parse('{"__proto__":{"admin":true},"safe":1}');
  for (const target of [null, undefined, false, 0, '', {}, Object.create(null)]) {
    const result = merge(target, payload);
    assert.equal(Object.getPrototypeOf(result), Object.prototype);
    assert.equal(result.admin, undefined);
    assert.equal(result.safe, 1);
    const nested = merge({ session: target }, { session: payload });
    assert.equal(nested.session.admin, undefined);
    assert.equal(Object.getPrototypeOf(nested.session), Object.prototype);
  }
  for (const result of [merge(payload, {}), merge({ session: payload }, {})]) {
    assert.equal(result.admin, undefined);
    assert.equal(result.session?.admin, undefined);
  }
  const constructorPayload = JSON.parse('{"constructor":{"prototype":{"admin":true}}}');
  assert.equal(merge({}, constructorPayload).admin, undefined);
  assert.equal(merge({ session: null }, { session: constructorPayload }).session.admin, undefined);
  assert.equal(Object.prototype.admin, undefined);
});

test('Fastify retains config merge semantics without sharing mutable branches', () => {
  const symbol = Symbol('config');
  const target = { ios: { flag: true }, plugins: ['a'], [symbol]: 4 };
  const result = merge(target, { ios: { other: 2 }, plugins: ['b'] });
  assert.deepEqual(result, { ios: { flag: true, other: 2 }, plugins: ['a', 'b'], [symbol]: 4 });
  assert.notEqual(result.ios, target.ios);
  const original = { untouched: { value: 1 }, items: [{ value: 1 }], optional: 1 };
  const combined = merge(original, { items: [{ value: 2 }], optional: undefined });
  assert.deepEqual(combined.items, [{ value: 1 }, { value: 2 }]);
  assert.equal(combined.optional, undefined);
  combined.untouched.value = 3;
  combined.items[0].value = 4;
  assert.equal(original.untouched.value, 1);
  assert.equal(original.items[0].value, 1);
});

test('Expo import adaptation is present, idempotent and rejects unreviewed source', () => {
  const source = readFileSync(join(dirname(configPackage), 'build/Config.js'), 'utf8');
  assert.equal(patchedExpoConfigSource(source), source);
  assert.throws(() => patchedExpoConfigSource(source + '\n// changed'), /Unrecognized/);
});

test('Expo uses patched Zod and accepts/rejects DevTools schemas correctly', () => {
  assert.equal(cliRequire('zod/package.json').version, '4.6.7');
  const { PluginSchema, DevToolsPluginOutputSchema } = cliRequire(
    './build/src/start/server/DevToolsPlugin.schema.js',
  );
  const { createMCPDevToolsExtensionSchema } = cliRequire(
    './build/src/start/server/createMCPDevToolsExtensionSchema.js',
  );
  const plugin = {
    packageName: 'synthetic-plugin',
    packageRoot: '/tmp/synthetic-plugin',
    cliExtensions: {
      description: 'Synthetic toolchain check',
      entryPoint: './index.js',
      commands: [
        {
          name: 'inspect',
          title: 'Inspect',
          environments: ['cli', 'mcp'],
          parameters: [
            { name: 'label', type: 'text' },
            { name: 'count', type: 'number' },
            { name: 'confirm', type: 'confirm' },
          ],
        },
      ],
    },
  };
  assert.deepEqual(PluginSchema.parse(plugin), plugin);
  assert.equal(PluginSchema.safeParse({ ...plugin, packageName: 1 }).success, false);
  const schema = createMCPDevToolsExtensionSchema(plugin);
  assert.equal(
    schema.safeParse({ command: 'inspect', label: 'test', count: 1, confirm: true }).success,
    true,
  );
  for (const input of [
    { command: 'invalid' },
    { command: 'inspect', count: '1' },
    { command: 'inspect', unknown: 1 },
  ]) {
    assert.equal(schema.safeParse(input).success, false);
  }
  assert.equal(
    DevToolsPluginOutputSchema.safeParse([{ type: 'text', text: 'ok', level: 'info' }]).success,
    true,
  );
  assert.equal(
    DevToolsPluginOutputSchema.safeParse([{ type: 'image', url: 'invalid' }]).success,
    false,
  );
});

test('Zod rejects oversized constrained arrays before validating each item', () => {
  const { z } = cliRequire('zod');
  let visited = 0;
  const schema = z
    .array(
      z.any().transform(() => {
        visited += 1;
      }),
    )
    .max(1);
  assert.equal(schema.safeParse(Array(10_000).fill(null)).success, false);
  assert.equal(visited, 0);
});

test('modern glob/minimatch preserve file matching and respect pre-aborted signals', async () => {
  const glob = cliRequire('glob');
  assert.equal(cliRequire('glob/package.json').version, '14.0.2');
  const root = mkdtempSync(join(tmpdir(), 'statement-toolchain-'));
  try {
    writeFileSync(join(root, 'sample.ts'), '');
    writeFileSync(join(root, 'other.txt'), '');
    assert.deepEqual(glob.globSync('*.ts', { cwd: root }), ['sample.ts']);
    assert.deepEqual(await glob.glob('*.ts', { cwd: root }), ['sample.ts']);
    const controller = new AbortController();
    controller.abort(new Error('cancelled glob'));
    await assert.rejects(
      glob.glob('**/*', { cwd: root, signal: controller.signal }),
      /cancelled glob/,
    );
    const fingerprintRequire = createRequire(expoRequire.resolve('@expo/fingerprint/package.json'));
    assert.equal(fingerprintRequire('minimatch/package.json').version, '11.0.1');
    const { Minimatch } = fingerprintRequire('minimatch');
    assert.equal(new Minimatch('**/*.ts', { dot: true }).match('src/file.ts'), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('React Native discovers podspecs and generates schemas with modern glob', () => {
  const rnRequire = createRequire(require.resolve('react-native/package.json'));
  const codegenRequire = createRequire(require.resolve('@react-native/codegen/package.json'));
  assert.equal(rnRequire('glob/package.json').version, '14.0.2');
  assert.equal(codegenRequire('glob/package.json').version, '14.0.2');
  const root = mkdtempSync(join(tmpdir(), 'statement-codegen-'));
  try {
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'Audit.podspec'), 'spec.platforms = { :ios => "15.1" }');
    writeFileSync(
      join(root, 'src/NativeAuditModule.ts'),
      `
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';
export interface Spec extends TurboModule { getLabel(): string; }
export default TurboModuleRegistry.getEnforcing<Spec>('AuditModule');
`,
    );
    const { generateSchemaInfo } = rnRequire(
      './scripts/codegen/generate-artifacts-executor/generateSchemaInfos.js',
    );
    const result = generateSchemaInfo(
      {
        libraryPath: root,
        config: { name: 'AuditSpec', jsSrcsDir: 'src' },
      },
      'ios',
    );
    assert.equal(result.supportedApplePlatforms.ios, true);
    assert.equal(result.supportedApplePlatforms.tvos, false);
    assert.equal(result.schema.modules.NativeAuditModule.type, 'NativeModule');
    assert.equal(result.schema.modules.NativeAuditModule.moduleName, 'AuditModule');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Istanbul upgraded exclusions preserve matching and actual instrumentation', async () => {
  const coverageRequire = createRequire(require.resolve('babel-plugin-istanbul/package.json'));
  assert.equal(coverageRequire('test-exclude/package.json').version, '7.0.2');
  const TestExclude = coverageRequire('test-exclude');
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'statement-coverage-')));
  try {
    mkdirSync(join(root, 'src'));
    const file = join(root, 'src/kept.js');
    writeFileSync(file, 'const checked = 1;');
    writeFileSync(join(root, 'src/kept.test.js'), '');
    const exclude = new TestExclude({
      cwd: root,
      include: ['src/**'],
      exclude: ['**/*.test.js'],
      extension: ['.js'],
    });
    assert.equal(exclude.shouldInstrument(file), true);
    assert.equal(exclude.shouldInstrument(join(root, 'src/kept.test.js')), false);
    assert.equal(exclude.shouldInstrument(join(root, '../outside.js')), false);
    assert.deepEqual(exclude.globSync(), ['src/kept.js']);
    assert.deepEqual(await exclude.glob(), ['src/kept.js']);
    const { transformSync } = require('@babel/core');
    const transformed = transformSync(readFileSync(file, 'utf8'), {
      filename: file,
      configFile: false,
      babelrc: false,
      plugins: [
        [require('babel-plugin-istanbul'), { cwd: root, include: ['src/**'], exclude: [] }],
      ],
    });
    const sandbox = {};
    runInNewContext(transformed.code, sandbox);
    assert.ok(Object.values(sandbox.__coverage__[file].s).some(count => count > 0));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('React Native browser launcher loads its existing CommonJS Edge API', () => {
  const middlewareRequire = createRequire(
    require.resolve('@react-native/dev-middleware/package.json'),
  );
  assert.equal(middlewareRequire('chromium-edge-launcher/package.json').version, '0.3.0');
  assert.equal(
    typeof middlewareRequire('chromium-edge-launcher').Launcher.getFirstInstallation,
    'function',
  );
  const launcher = middlewareRequire('./dist/utils/DefaultBrowserLauncher.js').default;
  assert.equal(typeof launcher.launchDebuggerAppWindow, 'function');
});

test('Expo config modification merges nested values and existing plugin options', async () => {
  const { modifyConfigAsync } = require('@expo/config');
  const root = mkdtempSync(join(tmpdir(), 'statement-config-'));
  try {
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ name: 'synthetic-config', version: '1.0.0' }),
    );
    writeFileSync(
      join(root, 'app.json'),
      JSON.stringify({
        expo: {
          name: 'Synthetic',
          slug: 'synthetic',
          sdkVersion: '55.0.0',
          ios: { supportsTablet: true },
          plugins: [['synthetic-plugin', { enabled: true }]],
        },
      }),
    );
    const { type, config } = await modifyConfigAsync(
      root,
      {
        ios: { bundleIdentifier: 'dev.synthetic.test' },
        plugins: [['synthetic-plugin', { label: 'test' }]],
      },
      { skipPlugins: true },
      { dryRun: true },
    );
    assert.equal(type, 'success');
    assert.deepEqual(config.ios, { supportsTablet: true, bundleIdentifier: 'dev.synthetic.test' });
    assert.deepEqual(config.plugins, [['synthetic-plugin', { enabled: true, label: 'test' }]]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Expo fingerprint keeps ignore/negation and directory matching semantics', () => {
  const root = dirname(expoRequire.resolve('@expo/fingerprint/package.json'));
  const { isIgnoredPath, buildPathMatchObjects, buildDirMatchObjects } = require(
    join(root, 'build/utils/Path.js'),
  );
  const patterns = ['**/node_modules/**', '!**/node_modules/synthetic/keep.ts'];
  assert.equal(isIgnoredPath('../node_modules/other/index.js', patterns), true);
  assert.equal(isIgnoredPath('../node_modules/synthetic/keep.ts', patterns), false);
  assert.equal(isIgnoredPath('src/index.ts', patterns), false);
  const directories = buildDirMatchObjects(buildPathMatchObjects(['build/**/*', 'assets/']));
  assert.equal(
    directories.some(matcher => matcher.match('build')),
    true,
  );
  assert.equal(
    directories.some(matcher => matcher.match('assets')),
    true,
  );
});
