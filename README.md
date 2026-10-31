# Statement Import — React Native / TypeScript

Нативный клиент для выданного Mobile Engineer задания. Один импорт за раз, реальные байты через HTTP, durable idempotency keys, восстановление неопределённого POST, монотонные revisions, асинхронное удаление. Данные только синтетические.

- Публичный репозиторий: [k1ngsterr1/demo](https://github.com/k1ngsterr1/demo).
- APK, mapping и записи сценариев: [Demo 1.0.0](https://github.com/k1ngsterr1/demo/releases/tag/v1.0.0).
- Актуальные проверки и границы видео: [docs/FINAL_ACCEPTANCE.md](docs/FINAL_ACCEPTANCE.md).

- Дизайн, референсы и splash: [docs/DESIGN.md](docs/DESIGN.md).
- Подробный план и критерии: [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md).
- Финальная приёмка и видео: [docs/FINAL_ACCEPTANCE.md](docs/FINAL_ACCEPTANCE.md).
- Разрешения, очистка и релизные ограничения: [docs/RELEASE_NOTES.md](docs/RELEASE_NOTES.md).
- Решения и компромиссы: [docs/SELF_REVIEW.md](docs/SELF_REVIEW.md).
- Оригинальный набор: [kit/README.md](kit/README.md); исходные 9 файлов проверяются по SHA-256.

## Clean checkout

Нужны Node.js 20.19.4–20.x или 22+, npm, Xcode 26.2+ / CocoaPods для iOS, Android SDK 36 / JDK 17 для Android. Сборка не требует Expo/EAS аккаунта. Установка зависимостей и первый native build требуют интернета; mock работает полностью локально. Версии клиента закреплены в `client/package-lock.json` (Expo 55.0.32 / React Native 0.83.10 / React 19.2.0).

Из корня этой папки:

```sh
npm --prefix client ci
npm run verify:kit
npm run fixtures:oversize
npm test
npm run check
```

`npm test` запускает 6 оригинальных mock tests и клиентские тесты. `npm run check` дополнительно проверяет форматирование, границы архитектуры, regression-тесты toolchain и TypeScript. Точные результаты отдельных прогонов приведены в отчётах приёмки. Клиентские HTTP-тесты создают отдельные mock instances на случайных loopback-портах и временные state-файлы; не сбрасывают состояние ручного mock на 8787.

В первом терминале:

```sh
npm run mock
```

Во втором:

```sh
cd client
npm run ios -- --device
```

Для Android сначала запустить emulator и указать путь к SDK:

```sh
export ANDROID_HOME="$HOME/Library/Android/sdk"
adb reverse tcp:8787 tcp:8787
cd client
npm run android
```

При полном запуске показывается фирменная заставка примерно на 1,1 секунды, затем основной экран. Обычный возврат уже запущенного приложения из фона не повторяет заставку.

Используется собственный нативный бинарник с dev client. Expo Go и web не являются проверкой задания. При отдельном запуске Metro: `cd client && npm start`. В запущенном dev client выбрать локальный сервер разработки.

Для автономной сборки с JS bundle внутри, без Metro:

```sh
cd client
npm run prebuild
npm run ios -- --configuration Release --device
# Android, после настройки ANDROID_HOME и запуска emulator:
npm run android -- --variant release
```

`ios/` и `android/` генерируются из app.json и versioned config plugin; они не входят в исходную сдачу. После изменения native config заново выполнить prebuild и собрать приложение. iOS signing для Simulator не нужен. Для физического iPhone потребуется собственная локальная подпись.

`npm ci` устанавливает поддерживаемый `@fastify/deepmerge` вместо старого движка и применяет проверяемую по версии и SHA адаптацию его импорта в Expo config. Стандартные Expo-скрипты повторно проверяют адаптацию перед запуском. Старые glob/minimatch-цепочки заменены; полный `npm audit` из `client` показывает **0 уязвимостей**, включая dev dependencies. `npm run check` включает regression-тесты настоящих потребителей инструментов сборки. Подробности, ограничения и команды: [DEPENDENCY_SECURITY.md](docs/DEPENDENCY_SECURITY.md).

Android release включает R8 и resource shrinking через закреплённый `expo-build-properties@55.0.18`. Плагин `withAndroidReleaseOptimization.cjs` выбирает `proguard-android-optimize.txt` и включает оптимизированное удаление ресурсов для AGP 8.12. Два точечных правила в `extraProguardRules` сохраняют Expo `Record` и `Field`: это обратный перенос исправлений [expo/expo#46852](https://github.com/expo/expo/pull/46852) и [#51206](https://github.com/expo/expo/pull/51206), необходимых для reflection в SDK 55. Без них minified release падает при настройке splash screen. Упаковка нативных библиотек и Hermes остаётся стандартной.

Чтобы воспроизвести выдаваемый APK для ARM64:

```sh
cd client
npm run prebuild -- --platform android --no-install
cd android
./gradlew :app:assembleRelease -PreactNativeArchitectures=arm64-v8a --max-workers=2
```

APK: `client/android/app/build/outputs/apk/release/app-release.apk`. Вместе с каждой сборкой сохранять её `client/android/app/build/outputs/mapping/release/mapping.txt` для расшифровки нативных ошибок. Эта локальная сборка использует debug signing key; публикация в магазине требует отдельной release-подписи. Оптимизацию проверять на самом release APK, включая splash, picker, filesystem, upload/recovery и удаление.

## Адрес API и файлы

По умолчанию `http://127.0.0.1:8787`: iOS Simulator достигает host loopback напрямую, Android использует `adb reverse`. Адрес можно изменить через кнопку настроек в шапке или задать `EXPO_PUBLIC_MOCK_URL` при сборке. Для физического устройства явно выбрать частный LAN IPv4; mock запускать на выбранном интерфейсе через HOST. Не выставлять этот API в интернет. Публичные URL, credentials и HTTP redirects отвергаются клиентом. Адрес текущей операции сохраняется вместе с её ключом и не меняется при редактировании поля следующего импорта.

Скопировать kit fixtures в системные Files/Downloads, затем выбрать **системным picker**:

```sh
adb push kit/fixtures/statement.csv /sdcard/Download/statement.csv
adb push kit/fixtures/statement.pdf /sdcard/Download/statement.pdf
adb push kit/fixtures/spoofed.pdf /sdcard/Download/spoofed.pdf
adb push kit/fixtures/oversize.csv /sdcard/Download/oversize.csv
```

На iOS импортировать fixture в Files через Finder/Simulator или доступного Files provider. Не использовать реальные банковские документы. `X-File-Name` кодируется для допустимого HTTP-заголовка; UI показывает исходное имя только до завершения выбора/создания.

## Матрица ручной приёмки

Переключение сценария не требует изменения исходников:

```sh
curl -X POST http://127.0.0.1:8787/__test/scenario \
  -H 'Content-Type: application/json' -d '{"mode":"happy"}'
curl http://127.0.0.1:8787/__test/state
```

Доступные mode: `happy`, `lost_ack`, `stale_status`, `delete_failure`.

| Сценарий | Действия | Проверка |
|---|---|---|
| happy CSV/PDF | Выбрать fixture, проверить имя/размер/формат, подтвердить | queued/processing, затем StreamBeam 19.99 и BrightGrid 132.00; итог 151.99 AUD/мес; «Подробнее» открывает карточку |
| lost_ack/relaunch | Включить lost_ack до POST; после сообщения о сети принудительно закрыть и запустить приложение | GET по сохранённому ключу возвращает job; дельта newJobs=1, createRequests=1; POST автоматически не повторяется |
| recovery 404 | Остановить mock до отправки, подтвердить; запустить mock и проверить статус, затем нажать явный повтор | До повтора нет нового job; повтор использует тот же ключ и файл |
| stale_status | Включить stale_status, создать импорт, дождаться двух GET | После ready/3 ответ processing/2 не откатывает отчёт; это также проверяется автоматикой |
| delete_failure | На готовом импорте включить delete_failure, удалить | Нет сообщения об удалении; переключить happy, повторить; deleting до последующего GET deleted |
| spoofed + oversize | Записать createRequests, выбрать оба файла | Локальная ошибка; createRequests не меняется; своей копии не остаётся |
| cancel during POST/timeout | «Отменить отправку» при busy или после timeout, затем relaunch | Home доступен, копия удалена; исходный key сохранён отдельно; фоновая проверка удаляет запись только после GET deleted |
| local cancel | Выбрать допустимый файл и отменить до POST | Нет POST, своя копия удалена |
| lifecycle | Уйти в фон, вернуться, relaunch | Состояние восстановлено; нет скрытой повторной отправки |
| accessibility | Увеличить системный шрифт, использовать небольшой экран | Действия доступны через прокрутку, подписи переносятся |

Для независимых прогонов можно сбросить **только локальные синтетические данные mock**:

```sh
curl -X POST http://127.0.0.1:8787/__test/reset
```

Не сбрасывать mock, пока в приложении есть незавершённая операция: это уничтожит соответствие сохранённого ключа серверу. Сначала удалить импорт и дождаться deleted или переустановить клиент вместе с осознанным сбросом mock.

## Поведение при сбоях

POST intent сохраняется до сети. При сетевой ошибке UI говорит о неизвестном исходе. Кнопка «Проверить статус» выполняет только GET. Кнопка повтора сначала ищет по ключу; только при 404 повторяет POST с прежним ключом и приватной копией. Relaunch автоматически выполняет исключительно GET. Известный job больше не требует файл, поэтому копия удаляется сразу после durable сохранения jobId.

Каждый HTTP-запрос имеет независимый deadline 12 секунд, включающий подготовку native body, ожидание headers и чтение JSON. Promise завершается с `timeout`, даже если транспорт игнорирует AbortSignal; spinner останавливается, действия восстановления становятся доступны. Таймаут POST сохраняет uncertain и прежний ключ, DELETE — delete_failed и прежний deleteKey. Поздний ответ не применяется к controller; поздно подготовленный body не начинает POST после deadline. Таймаут не доказывает, что сервер не принял запрос: восстановление остаётся через GET.

«Отменить отправку» доступна и во время запроса, и после timeout. Она немедленно завершает локальное ожидание через отдельный AbortSignal. После подтверждения сохраняются только key/baseUrl/deleteKey и job metadata (без имени, файла и списаний), затем удаляется временная копия и очищается текущая операция. Можно выбрать другой файл. На свободном главном экране проверка отмен запускается автоматически после boot, новой отмены и возврата приложения в foreground. До трёх проходов с интервалом 1,5 с; network/HTTP/storage fault останавливает повторы до явной «Повторить» либо следующего открытия. Поиск пока не найденного job остаётся незаметным и не удаляет recovery metadata. Выбор файла прерывает проверку и ждёт освобождения контроллера; при уходе приложения в background проверка также останавливается. Активный импорт и его polling имеют приоритет. DELETE использует прежний отдельный ключ. Только GET deleted удаляет запись; 404, timeout и ответ DELETE её сохраняют. При сбое между шагами boot завершает локальную очистку до открытия Submit. До 32 записей, без eviction; при заполнении новый выбор блокируется с объяснением и повтором. Фоновые ошибки отменённых импортов не показываются на главном экране. Отдельного раздела фоновых удалений в настройках нет; сохранённая очередь восстанавливается автоматически при следующем открытии или возврате приложения на экран. На главном экране остаётся объяснение только при заполнении очереди, когда новый выбор действительно заблокирован. Ошибка явного удаления текущего импорта по-прежнему остаётся на его экране до подтверждения сервера. Автоматических POST нет; это foreground recovery, а не системная фоновая задача.

Фоновое восстановление старых отмен и проверки на маленьком экране описаны в [приёмке](docs/FINAL_ACCEPTANCE.md).

DELETE intent и отдельный ключ тоже сохраняются до сети. Ошибка/503 оставляет возможность повтора тем же ключом. 202 не означает удаление. Только последующий GET deleted создаёт tombstone. Ревизии меньше/равные принятой и поздние ответы старого контроллера не меняют UI.

Если копия исчезла до подтверждения отправки, экран предлагает выбрать файл заново или отменить выбор, а не отправить недоступный файл. Отмена отсутствующего файла идемпотентна. Если cache потерян после неопределённого POST, сохраняются прежний ключ и возможность GET; автоматическая повторная отправка не выполняется. Для нового выбора доступна явная отмена с сохранением отдельной проверки сервера. Если journal повреждён, клиент блокируется: не очищает запись молча. Для лабораторного восстановления сначала сохранить/сверить серверное синтетическое состояние и выполнить GET по известному ключу; затем осознанно сбросить обе стороны. В production нужны резервируемый журнал и recovery tooling.

## Архитектура и приватность

Входной App.tsx экспортирует app/AppRoot. AppRoot собирает native зависимости, один NavigationContainer, foreground/Reduce Motion и startup overlay. Feature import получает ImportServices через props. Один ImportFlowProvider над обоими native stacks владеет useImportFlow: controller, boot/dispose, подписка, picker и polling не пересоздаются при переходах между экранами.

React Navigation native-stack разделён на два уровня:

- Внутренний flow stack: Restore, ImportHome, Confirmation, Processing, Report, Cleanup. Каждый экран — отдельный компонент в features/import/screens/. Canonical screen вычисляется чистой getImportRoute из Snapshot. Завершённые шаги уходят из history: Back не показывает старое подтверждение и не повторяет POST.
- Внешний stack: ImportFlow и modal routes Settings/Details. Настройки остаются открытыми при обновлении статуса под ними; Details доступен только для ready и получает itemId, а не копию отчёта. Оба modal закрываются native Back/swipe или кнопкой.

Обработчик Android Back установлен на постоянном Root.ImportFlow до открытия picker и не пересоздаётся при смене шага. Назад на Confirmation вызывает реальный cancelSelection, включая асинхронное удаление копии; экран сменится только после успешного сохранения отмены. Если selected ещё занят сохранением, запрос отмены ждёт освобождения controller и привязан к ключу операции; переход к uncertain или другой key его сбрасывает. Во время POST/deletion нет навигационного возврата в picker. Android Back из корня может отправить приложение в фон, сохранив операцию. iOS interactive swipe для шагов flow выключен: отмена до POST — явное действие. Навигационное состояние отдельно не сохраняется: после relaunch journal снова определяет экран.

presentation.ts вычисляет отображение из единственного Snapshot, без второго durable store. Общие кнопки, строки и SheetLayout находятся в ui/. SheetLayout отвечает только за layout; native presentation и dismiss принадлежат navigator.

Направление зависимостей: app → features/ui/native; features → core/ui; native → core. Core не импортирует React/Expo, feature не импортирует native adapters, общие UI-компоненты не знают об импорте или navigation. Эти ограничения проверяет npm --prefix client run check:architecture через TypeScript AST, включая type imports и статические dynamic imports/require. React Navigation разрешён только app/features, не core/native-independent UI.

Для переиспользования feature достаточно передать другой ImportServices: фабрику controller, picker, удаление принятой копии и начальный endpoint. Конструктор controller уже принимает Store/Files/Api/UUID. Один mounted feature обслуживает один journal namespace. Глобальный mutable store и DI container не добавлялись. Установлены React Navigation native 7.5.1, native-stack 7.21.0 и совместимый с Expo SDK55 react-native-screens 4.23.0; нужен новый native binary.

Контроллер создаётся внутри committed effect. Повтор setup/cleanup/setup создаёт свежий экземпляр; старый dispose блокирует продолжение boot после внешних await. Это проверено на отложенных load/sweep. Это lifecycle-контракт, а не отдельный React-renderer тест StrictMode.

Core не зависит от React Native; native adapters внедряются через интерфейсы. Все изменения journal сериализованы. Runtime проверяет HTTP-ответы и сохранённую запись. После проверки файл размером не более 10 МиБ передаётся в expo/fetch как Uint8Array с application/octet-stream, без base64/multipart. Expo буферизует upload; это не streaming. Uint8Array сохраняет явный Content-Type, который Expo переопределяет у File по расширению. Проверка читает <=64 КиБ за шаг и <=10 МиБ + 1 всего. Picker копирует через системный файловый слой, затем приложение перемещает файл под случайным именем в cache.

Journal хранит `stagedId` вида `<uuid>.bin`, а не абсолютный sandbox URI. Native adapter каждый раз разрешает ID относительно текущего `Paths.cache/statement-import`; sweep сравнивает ID. Старые записи с URI мигрируются только из распознанных private cache roots и сохраняются до sweep. Исходный URI после миграции не используется для файловых операций; traversal и неизвестные пути отклоняются. Это позволяет пережить смену абсолютного пути sandbox, если сама копия сохранилась.

Нет прикладных console logs, analytics или crash SDK. Ошибки преобразуются в фиксированные коды, не содержащие URI/байты/имя/описания. Network inspector dev client отключён native config plugin. Android backup отключён; байты находятся в cache и не предназначены для backup. AsyncStorage содержит минимальную synthetic operation metadata и ready-результат, а не байты файла.

Известный компромисс: системный picker успевает скопировать большой файл на диск до JS size check. JS не загружает большой документ целиком; для жёсткого лимита диска нужен собственный native bounded-copy flow. Это упражнение не является безопасным парсером произвольных PDF/CSV.

## Проверка изменений

```sh
npm run verify:kit
npm test
npm run check
cd client
npx expo install --check
```

Фактические версии ОС, завершённые native checks и ограничения приведены в TEST_RESULTS, а не выводятся из успешной JS-сборки. Исходники и проверочный APK опубликованы на GitHub; в магазины приложение не отправлялось.

## Нативные UI-тесты

Использовать отдельный пустой QA Simulator/Emulator: тесты выбирают fixture и создают/удаляют только синтетические импорты в запущенном mock. Сначала установить release-клиент командами выше и подготовить oversize fixture. В mock должен быть доступен порт 8787; незавершённой операции в клиенте быть не должно.

iOS: XCTest проходит CSV, PDF, lost_ack с terminate/relaunch и проверкой newJobs/createRequests, stale_status, delete_failure/retry, spoofed/oversize без POST, Dynamic Type XXXL и отмену. Для генерации небольшого test-runner project нужен Ruby gem `xcodeproj` (проверена версия 1.27.0):

```sh
# Из корня, QA_IOS_DEVICE — UUID отдельно созданного и запущенного Simulator:
node scripts/seed-ios-fixtures.mjs "$QA_IOS_DEVICE"
cd client
ruby native-tests/ios/make-project.rb
xcodebuild test -project native-tests/ios/Runner.xcodeproj \
  -scheme StatementImportUITests -destination "id=$QA_IOS_DEVICE" \
  -derivedDataPath ios/build -parallel-testing-enabled NO -jobs 2 \
  -only-testing:StatementImportUITests/StatementImportUITests/test13HappyAcceptance \
  -only-testing:StatementImportUITests/StatementImportUITests/test02LostAckAndRelaunch \
  -only-testing:StatementImportUITests/StatementImportUITests/test03PDFStaleStatusAndDeleteFailure \
  -only-testing:StatementImportUITests/StatementImportUITests/test04BadFilesBeforePOST \
  -collect-test-diagnostics never \
  CODE_SIGNING_ALLOWED=NO \
  CC="$PWD/../scripts/clang-probe.py" CPLUSPLUS="$PWD/../scripts/clang-probe.py"
```

`seed-ios-fixtures.mjs` подготавливает файлы в Files provider выделенного Simulator, а выбор выполняется настоящим system picker. Скрипт откажется перезаписывать отличающееся содержимое. `clang-probe.py` обходит наблюдавшийся SwiftBuild probe-pipe deadlock Xcode 26 на этом хосте: аргументы компиляции не меняются, stderr probe дренируется отдельно. При обычной сборке без этого сбоя wrapper не нужен. Xcode 16.4 недостаточен для установленных Expo modules.

Тесты 07/08 требуют отдельных начальных состояний. Для них создать отдельный Simulator с именем `Statement File Recovery QA`, установить release-клиент и seed fixtures. Перед тестом 07 выполнить `node scripts/seed-ios-recovery.mjs "$QA_IOS_DEVICE" relocated`, перед 08 — ту же команду с `missing`. Каждый запускать отдельно через `-only-testing:StatementImportUITests/StatementImportUITests/<полное имя теста>` вместо списка `-only-testing` выше. Seed-скрипт работает только с этим выделенным booted Simulator: подставляет старый sandbox URI и либо сохраняет синтетическую CSV-копию в текущем контейнере, либо оставляет её отсутствующей. Проверяются реальный upload после миграции и повторный выбор/отмена без POST после потери файла.

Тесты 09–12 проверяют deadline и отмену через настоящий expo/fetch. В отдельных терминалах из корня запустить собственный loopback mock с отдельным state-файлом и два QA proxy:

```sh
node --input-type=module -e 'import {createMockServer} from "./kit/mock-server.mjs"; createMockServer({statePath:"/tmp/statement-deadline-qa.json"}).listen(8787,"127.0.0.1");'
node scripts/qa-hanging-proxy.mjs 8789 headers
node scripts/qa-hanging-proxy.mjs 8790 body
```

На отдельном пустом QA Simulator с fixtures запустить нужные методы через `-only-testing:StatementImportUITests/StatementImportUITests/<полное имя теста>` вместо списка `-only-testing`. Proxy пересылает синтетический CSV в loopback mock и оставляет POST без headers либо с незавершённым JSON. GET/DELETE проходят обычным образом. Тесты 09/10 проверяют timeout и GET recovery; 11/12 — отмену при busy и после timeout, relaunch, новый выбор и отдельное серверное удаление. Каждый сценарий доказывает ровно один POST/job/112 байт. Не направлять proxy на пользовательский LAN mock; остановить свои процессы после проверки. Тест 90 запускать только для явного read-only наблюдения текущей операции на физическом телефоне: он не выбирает файл и не нажимает Cancel/DELETE.

Если обычный Expo build завис именно на `clang -v -E -dM`, после prebuild и `pod install` можно собрать теми же параметрами, что использовались при проверке:

```sh
cd client/ios
xcodebuild -workspace StatementImport.xcworkspace -scheme StatementImport \
  -configuration Release -sdk iphonesimulator -destination "id=$QA_IOS_DEVICE" \
  -derivedDataPath build -jobs 2 ONLY_ACTIVE_ARCH=YES CODE_SIGNING_ALLOWED=NO \
  CC="$PWD/../../scripts/clang-probe.py" CPLUSPLUS="$PWD/../../scripts/clang-probe.py"
xcrun simctl install "$QA_IOS_DEVICE" build/Build/Products/Release-iphonesimulator/StatementImport.app
```

Android: optional Gradle init script подключает отдельный UIAutomator test module. Runner работает в собственном процессе и управляет обычным minified release APK: тестовые зависимости не требуют keep rules в приложении. Проверки приватного cache требуют выделенного userdebug emulator с `su 0`; они читают cache именно приложения, а не runner. Подготовить Downloads командами выше, запустить только целевой emulator, установить приложение:

```sh
cd client/android
./gradlew -I ../native-tests/android/init.gradle :native-ui-tests:assembleRelease \
  -PreactNativeArchitectures=arm64-v8a --max-workers=2
adb install -r app/build/outputs/apk/release/app-release.apk
adb install -r -t ../native-tests/android/build/outputs/apk/release/native-ui-tests-release.apk
adb reverse tcp:8787 tcp:8787
adb shell am instrument -w \
  -e class dev.synthetic.qa.ImportUITest#nativePickerRawImportDetailsAndDeletion \
  dev.synthetic.qa/androidx.test.runner.AndroidJUnitRunner
```

При нескольких Android устройствах указывать `adb -s <serial>` для каждого вызова. Этот UIAutomator-тест использует английские подписи системного DocumentsUI (проверенный emulator — en-US); прикладной UI русский. Другие локали picker требуют адаптации test selectors, а не изменения клиента.

Для воспроизведения отдельного PDF-прогона с увеличенным шрифтом на выделенном QA emulator:

```sh
adb shell wm size 720x1280
adb shell wm density 320
adb shell settings put system font_scale 1.5
adb shell am force-stop dev.synthetic.statementimport
adb shell am instrument -w -e fixture statement.pdf -e expectedBytes 33882 \
  -e class dev.synthetic.qa.ImportUITest#nativePickerRawImportDetailsAndDeletion \
  dev.synthetic.qa/androidx.test.runner.AndroidJUnitRunner
# Вернуть настройки этого QA emulator после проверки:
adb shell wm size reset
adb shell wm density reset
adb shell settings put system font_scale 1.0
```

Тест пишет отдельные before/after counters и снимки в собственную директорию `Android/data/dev.synthetic.qa/files/native-qa-*`. Перед следующим прогоном забрать их через `adb pull`, чтобы не перезаписать доказательства. Видео и итоговая матрица находятся в `evidence/` и [TEST_RESULTS](docs/TEST_RESULTS.md).

Дополнительные R8-сценарии запускать по одному через `-e class dev.synthetic.qa.ImportUITest#<method>`, на собственном loopback mock. `invalidFilesRejectedBeforePost` начинает с домашнего экрана и проверяет ложный PDF/oversize без POST. `acceptedPostTimeoutKeepsRecoveryAvailable` использует proxy 8789 (см. выше и `adb reverse tcp:8789 tcp:8789`) и оставляет неопределённую операцию. После `adb shell am force-stop dev.synthetic.statementimport` метод `recoverExistingImportWithoutResubmission` восстанавливает её без повторного POST, удаляет job через UI и возвращает endpoint 8787. Этот же метод проверяет сохранённую операцию после установки нового APK поверх старого. `cancelAcceptedPostClearsFilesAndDeletesServerJob` начинает с домашнего экрана, проверяет отмену после timeout; аргумент `-e waitForTimeout false` проверяет отмену во время ожидания. Финальный `status=deleted` сверять с `GET /__test/state`. Не запускать весь класс разом: recovery намеренно зависит от операции предыдущего процесса.

## Проверка фактического HTTP-контракта

Для дополнительных отказных случаев используется test-only proxy; исходный kit не изменяется. Запустить отдельный loopback mock на 8787, затем из корня (trace-файл должен быть новым):

```sh
node scripts/qa-contract-proxy.mjs 8991 8787 /tmp/statement-contract-trace.jsonl
# Только для Android:
adb reverse tcp:8991 tcp:8991
```

На iOS по одному запустить `test14HTTPProgressErrorAndStableDeletionKey` и `test15HTTP404RetryAndMalformedResponseRecovery` указанной выше XCTest-командой. На Android — `httpProgressErrorAndStableDeletionKey` и `http404RetryAndMalformedResponseRecovery` через `am instrument -e class ...#method`. Каждый тест начинается на Home и возвращает настройку адреса 8787. Не запускать обе платформы одновременно против одного mock/proxy: тесты переключают режимы. Для параллельного запуска нужны независимые mock, proxy и Android reverse mappings.

Proxy пропускает настоящий POST в исходный mock и позволяет наблюдать задержанные queued/processing/deleting. Дополнительные режимы: серверный `error`, разрыв первого POST до mock (GET 404, затем явный повтор с тем же ключом/байтами), принятый POST с некорректным `status: ["queued"]` (GET recovery без нового POST). Это инъекция HTTP-ответов тестовым proxy, не собственные режимы исходного kit. Режим меняется по `POST /__qa/mode`, фактические запросы доступны в `GET /__qa/state` и append-only trace.

Native assertions проверяют полученные сервером `Content-Type: application/octet-stream`, 112 байт, SHA-256 оригинального CSV, наличие X-File-Name, стабильность create/delete keys. Trace содержит хеш ключа, число байтов и SHA-256, но не имя или исходные байты. После проверки остановить свои proxy и убрать QA-only reverse mapping. Приложение и kit между сценариями не редактируются.

## Финальная проверка на маленьком экране

iOS: отдельный iPhone SE (3rd generation), 375×667 pt, iOS 26.4.1. Для максимального системного размера:

```sh
xcrun simctl ui "$QA_IOS_DEVICE" content_size accessibility-extra-extra-extra-large
```

`test05LargeFontSelectionAndCancel` дополнительно задаёт AX XXXL через launch argument и проверяет ширину <=375 pt. Тест проходит picker, оба способа отмены выбора, подтверждение, отчёт/карточку, удаление, recovery controls и отмену после lost ACK. Системный Files переключается в List, чтобы имя документа было целиком доступно на узком экране. Основные действия приложения остаются в прокручиваемом содержимом. После проверки вернуть `content_size large`.

Для видео основной матрицы запускать по одному `test13HappyAcceptance`, `test02LostAckAndRelaunch`, `test03PDFStaleStatusAndDeleteFailure`, а для локального отклонения — `test04BadFilesBeforePOST`. Они работают с обычным release app и реальным системным picker. Полная команда XCTest выше; выбрать метод через `-only-testing`, добавить `-collect-test-diagnostics never` (на этом хосте сбор sysdiagnose после failures зависал). Завершить один XCTest-процесс перед следующим.

Android, отдельный QA emulator API 35:

```sh
adb shell wm size 640x1280
adb shell wm density 320
adb shell settings put system font_scale 2.0
adb shell am instrument -w -e expectedWidthDp 320 \
  -e fixture statement.pdf -e expectedBytes 33882 \
  -e class dev.synthetic.qa.ImportUITest#nativePickerRawImportDetailsAndDeletion \
  dev.synthetic.qa/androidx.test.runner.AndroidJUnitRunner
```

Аргумент `expectedWidthDp` проверяет реальную конфигурацию 320 dp и fontScale=2.0. Также отдельно запустить `cancelAcceptedPostClearsFilesAndDeletesServerJob` с QA proxy. После каждого прогона проверять строку `OK (1 test)`: команда `adb am instrument` может вернуть exit code 0 даже при failed assertions. Затем восстановить `wm size reset`, `wm density reset`, `font_scale 1.0`.

На обычном размере новые методы `lostAckRelaunchKeepsOneJob` и `staleStatusAndFailedDeletionKeepTruthfulUI` воспроизводят оставшуюся матрицу mock и сохраняют screenshots/counters. Не запускать обе ОС одновременно против одного mock: проверки используют before/after counters. Для параллельной проверки Android допустим отдельный loopback mock, `adb reverse tcp:8787 tcp:8792`, и отдельный proxy `QA_MOCK_PORT=8792 node scripts/qa-hanging-proxy.mjs 8794 headers`, `adb reverse tcp:8789 tcp:8794`.

## Запись и комплект сдачи

`python3 scripts/record-ui-test.py ios "$QA_IOS_DEVICE" /absolute/path/video.mp4 -- xcodebuild ...` или `... android emulator-5554 /absolute/path/video.mp4 -- adb ...` записывает реальный native test без ускорения и пропуска действий. Для Android нужны `adb` в PATH и `ffmpeg`; записи длиннее 180 секунд соединяются по порядку. Неуспешные диагностические записи не считать подтверждением приёмки.

GitHub содержит исходники, тесты, неизменённый kit и публичную документацию. APK, соответствующий mapping и записи сценариев доступны в [Release](https://github.com/k1ngsterr1/demo/releases/tag/v1.0.0). Generated native projects, node_modules, mock state, локальные логи и частные записи в репозиторий не входят. Команды сборки приведены выше; список публичных артефактов и SHA-256 — в [приёмке](docs/FINAL_ACCEPTANCE.md).

`scripts/package-submission.py` оставлен для локального комплекта с явно заданным JSON-списком evidence. Диагностические `evidence/` и `deliverables/` не входят в Git. Сборщик исключает generated native projects, build caches и исторические отчёты и записывает SHA-256 в `SUBMISSION_MANIFEST.json`.
