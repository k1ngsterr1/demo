import { readdir, readFile } from 'node:fs/promises';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = resolve(root, 'src');
const files = [];
async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await collect(path);
    else if (['.ts', '.tsx'].includes(extname(path))) files.push(path);
  }
}
await collect(sourceRoot);
files.push(resolve(root, 'App.tsx'));
const errors = [];
const uiPackages = new Set(['react', 'react-native', 'react-native-safe-area-context', 'phosphor-react-native', 'react-native-svg']);
const navigationPackages = new Set(['@react-navigation/native', '@react-navigation/native-stack']);
const parts = path => relative(sourceRoot, path).split(sep);

for (const file of files) {
  const [layer, feature] = parts(file);
  const ast = ts.createSourceFile(file, await readFile(file, 'utf8'), ts.ScriptTarget.Latest, true);
  function inspect(node) {
    let specifier;
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      specifier = node.moduleSpecifier.text;
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
      specifier = node.argument.literal.text;
    } else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
      ts.isIdentifier(node.expression) && node.expression.text === 'require') && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
      specifier = node.arguments[0].text;
    }
    if (specifier) {
      let allowed = false;
      if (specifier.startsWith('.')) {
        const target = parts(resolve(dirname(file), specifier));
        if (file === resolve(root, 'App.tsx')) allowed = target[0] === 'app';
        else if (layer === 'app') allowed = true;
        else if (layer === 'core') allowed = target[0] === 'core';
        else if (layer === 'native') allowed = ['core', 'native'].includes(target[0]);
        else if (layer === 'ui') allowed = target[0] === 'ui';
        else if (layer === 'features') allowed = ['core', 'ui'].includes(target[0]) || target[0] === 'features' && target[1] === feature;
      } else {
        if (layer === 'app') allowed = true;
        else if (layer === 'native') allowed = !navigationPackages.has(specifier);
        else if (layer === 'features') allowed = uiPackages.has(specifier) || navigationPackages.has(specifier);
        else if (layer === 'ui') allowed = uiPackages.has(specifier);
      }
      if (!allowed) {
        const line = ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1;
        errors.push(relative(root, file) + ':' + line + ' forbidden dependency: ' + specifier);
      }
    }
    ts.forEachChild(node, inspect);
  }
  inspect(ast);
}
if (errors.length) {
  process.stderr.write(errors.join('\n') + '\n');
  process.exitCode = 1;
} else {
  process.stdout.write('Architecture boundaries passed: ' + files.length + ' source files.\n');
}
