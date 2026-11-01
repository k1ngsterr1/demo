# Исправления зависимостей — 31.10.2026

Перед публикацией 01.11.2026 полный audit повторён: **0 уязвимостей**. Актуальный итог — [public-verification.json](public-verification.json).

**Текущий полный `npm audit` из `client`: 0 уязвимостей** — включая dev/optional dependencies, без фильтрации severity, исключений advisory или отключения audit. Исходный JSON после исправления; до исправления: 17 moderate / 6 low.

Expo 55.0.32, React Native 0.83.10, React 19.2.0 и версии нативных библиотек сохранены. Адаптация затрагивает package.json/lockfile и скрипты toolchain. Текущие результаты перед публикацией: [public-verification.json](public-verification.json).

## Настоящая замена движка слияния

У старого `deepmerge@4.3.1` нет исправленного релиза для [GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4). Ранее применялся локальный source backport, который защищал код, но не устранял warning по версии. Этот backport удалён вместе со старой реализацией.

Теперь scoped npm override `@expo/config > deepmerge` разрешается в **`npm:@fastify/deepmerge@3.2.4`**. В установленном package.json указаны настоящие имя `@fastify/deepmerge` и версия 3.2.4; lockfile содержит registry URL и integrity именно этого пакета. Это другой поддерживаемый движок с собственной защитой clone/merge от `__proto__`, `constructor` и `prototype`. [Документация Fastify](https://github.com/fastify/deepmerge), [официальный механизм npm overrides](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#overrides).

У Expo config два стандартных двухаргументных вызова merge: конфигурация и существующие plugin options. Fastify экспортирует фабрику; `scripts/patch-toolchain.mjs` адаптирует единственный импорт к `require("deepmerge")({ symbols: true })`. Сохранены рекурсивное слияние records, конкатенация/копирование массивов, enumerable symbols и запись source `undefined`. Тесты проверяют независимость изменяемых ветвей результата от исходных объектов.

Адаптация ограничена **@expo/config 55.0.21** и точным SHA-256 его исходного `build/Config.js`. Перед записью проверяются версия Expo config, реальная идентичность Fastify 3.2.4 и исходный hash. Повторное применение допускается только когда отмена нашей точной правки восстанавливает проверенный upstream hash. Неизвестная версия, другой движок или постороннее изменение файла останавливают процесс. При обновлении Expo нужно заново проверить его merge-вызовы, семантику и hash; автоматического обновления разрешённых хешей нет.

## Удаление legacy minimatch-цепочек

| Цепочка                                                   | Изменение                                                                | Фактический проверяемый контракт                                                                                                                    |
| --------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| React Native / codegen → glob 7                           | glob 14.0.2                                                              | Оба потребителя используют `glob.sync`; тест вызывает настоящий RN `generateSchemaInfo`, находит podspec и получает TurboModule-схему из TypeScript |
| Istanbul → test-exclude 6                                 | Scoped test-exclude 7.0.2; glob 10 → 14.0.2; minimatch 10 → 11.0.1       | Include/exclude, выход за cwd, sync/async glob и настоящая Babel-инструментация с выполнением счётчика покрытия                                     |
| RN dev-middleware → Edge launcher 0.2 → rimraf 3 → glob 7 | Scoped chromium-edge-launcher 0.3.0                                      | Прежний CJS `Launcher.getFirstInstallation` и загрузка реального DefaultBrowserLauncher без запуска браузера; rimraf-цепочка исчезла                |
| Современные Expo tools                                    | Сохранены glob 13 → 14.0.2, minimatch 10 → 11.0.1 и Zod 4.6.7 в Expo CLI | Matching/AbortSignal, fingerprint ignore/negation, реальные DevTools schemas и ограничение oversized array                                          |

В lockfile и установленном дереве отсутствуют glob 7/10, minimatch 3/9/10 и старая реализация deepmerge: npm ls. Движок сопоставления glob 14 — minimatch 11.0.3; отдельные потребители закреплены на исправленном 11.0.1. [Advisory minimatch](https://github.com/advisories/GHSA-g3hv-75wg-m249).

Некоторые overrides выходят за semver-диапазоны родителей. Совместимость подтверждается конкретными потребителями данного проекта и закреплённым lockfile; это локальная адаптация, которую нужно сопровождать. Node-диапазон проекта уточнён до **20.19.4–20.x или 22+**, поскольку современные glob/minimatch не заявляют поддержку Node 21. Повышать минимальную версию до Node 22 ради test-exclude 8 не потребовалось.

## Установка и проверки

Обычный `npm ci` запускает адаптацию через postinstall; стандартные `npm start`, `npm run ios/android/prebuild` повторяют проверку. После намеренного `npm ci --ignore-scripts` перед прямым Expo/Gradle/Xcode выполнить из `client`:

```sh
node scripts/patch-toolchain.mjs
npm run check:toolchain
```

Проверено:

- Основное дерево: npm ci с автоматической адаптацией и 0 vulnerabilities, 11/11 focused checks, npm ls без invalid dependencies.
- Минимальный поддерживаемый Node 20.19.4: 11/11 toolchain tests PASS.
- Основной checkout: полный check PASS, включая клиентские и toolchain tests, форматирование, TypeScript и архитектуру. Итоговые результаты: [public-verification.json](public-verification.json).
- Оригинальный mock: 6/6 PASS; 9 исходных файлов kit неизменны.
- Отдельная копия без node_modules/native projects: npm ci PASS, полный check PASS, prebuild iOS/Android PASS, raw audit 0.

Release-компиляция из изолированной копии: Android ARM64 / R8 PASS, iOS Simulator PASS. Android APK прошёл проверку подписи и выравнивания 16 KiB.
