# Statement Import

React Native + TypeScript, Expo development build. Импорт синтетической PDF/CSV выписки через локальный HTTP mock: выбор файла → подтверждение → обработка → два регулярных списания → удаление.

[APK](https://github.com/k1ngsterr1/demo/releases/tag/v1.0.0) · [Результаты проверок](docs/FINAL_ACCEPTANCE.md) · [Release note](docs/RELEASE_NOTES.md) · [Self-review](docs/SELF_REVIEW.md)

Полные видео: [Android, 3:52](https://drive.google.com/file/d/1mBM1orUnzbHBUSt_FnedM5aSCPQS0-rm/view) · [iOS, 2:51](https://drive.google.com/file/d/15o8xGI7Fy9xSRT5JNf8zjzyE60wqLRmA/view).

## Запуск из чистой копии

Нужны Node.js 20.19.4–20.x или 22+, npm. Для iOS — macOS, Xcode 26.2+ и CocoaPods; для Android — Android SDK 36 и JDK 17. Первая установка и сборка требуют интернета. Expo/EAS аккаунт не нужен.

```sh
git clone --branch codex/demo https://github.com/k1ngsterr1/demo.git
cd demo
npm --prefix client ci
npm run verify:kit
npm run fixtures:oversize
npm run mock
```

Mock работает на `http://127.0.0.1:8787`. Оставьте терминал открытым. В новом терминале из корня репозитория запустите нужную платформу.

**iOS Simulator:**

```sh
cd client
npm run ios -- --device
```

Выберите Simulator. Для физического iPhone нужна собственная подпись.

**Android Emulator:** сначала запустите эмулятор через Android Studio.

```sh
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$ANDROID_HOME/platform-tools:$PATH"
adb reverse tcp:8787 tcp:8787
cd client
npm run android
```

Путь `ANDROID_HOME` выше указан для macOS. Используется нативное приложение, не Expo Go и не web. Автономные Release-сборки и команды UI-тестов — в [TESTING.md](docs/TESTING.md).

## Проверка импорта

Перенесите файлы из `kit/fixtures/` в Files на iOS или Downloads на Android ([команды](docs/TESTING.md#подготовка-файлов)). В приложении выберите файл, проверьте имя/размер/формат и подтвердите отправку.

- `statement.csv` и `statement.pdf` → два списания, всего **151.99 AUD/мес**, карточки с суммой и датой.
- `spoofed.pdf` и `oversize.csv` → локальный отказ **до POST**.
- Удаление завершено только после ответа сервера `status=deleted`.

Для физического телефона укажите в настройках приложения частный LAN IPv4 компьютера; телефон и компьютер должны быть в одной сети. Запустите mock с этим IP, например `HOST=192.168.1.10 npm run mock`. USB сам по себе не даёт iPhone доступ к localhost компьютера.

## Сценарии сбоев

В отдельном терминале переключайте `mode` без изменения исходников:

```sh
curl -X POST http://127.0.0.1:8787/__test/scenario \
  -H 'Content-Type: application/json' -d '{"mode":"lost_ack"}'
curl http://127.0.0.1:8787/__test/state
```

| Mode             | Что проверить                                                                                   |
| ---------------- | ----------------------------------------------------------------------------------------------- |
| `happy`          | `queued` → `processing` → `ready`, результат берётся с сервера                                  |
| `lost_ack`       | Отправить файл, закрыть и запустить приложение: тот же job, без автоматического повторного POST |
| `stale_status`   | После `ready/revision 3` ответ `processing/revision 2` не откатывает UI                         |
| `delete_failure` | DELETE 503 не означает удаление; переключить в `happy` и повторить до `deleted`                 |

Для независимого прогона сравнивайте счётчики до/после: `lost_ack` создаёт ровно один новый job, плохие файлы не увеличивают `createRequests`. Не сбрасывайте mock при незавершённом импорте. Полная матрица и проверка HTTP-контракта — в [TESTING.md](docs/TESTING.md).

## Тесты и платформы

Из корня репозитория:

```sh
npm test
npm run check
npm run verify:kit
npm --prefix client audit
```

Зафиксированный результат от 01.11.2026: **95 клиентских, 11 toolchain и 6 mock-тестов прошли; audit — 0 уязвимостей; 9 исходных файлов kit совпадают по SHA-256**. [Отчёт](docs/TEST_RESULTS.md).

| Платформа                             | Фактически проверено                                                                                                |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| iOS Simulator, iOS 26.4               | Системный picker, CSV/PDF, импорт, карточки, recovery/relaunch, stale status, отказ удаления и повтор, плохие файлы |
| Android Emulator, Android 15 / API 35 | Те же сценарии; отдельно маленький экран и крупный системный шрифт                                                  |

Даты, записи и границы отдельных прогонов — в [отчёте приёмки](docs/FINAL_ACCEPTANCE.md). Видео сняты на симуляторе/эмуляторе; полный видеопрогон физического iPhone не заявляется.

## Ограничения

Один импорт за раз, только синтетические файлы из набора. Валидация читает файл блоками, отправка буферизует до 10 МиБ. Системный picker может создать копию до проверки размера; ОС может очистить cache. Ключ операции сохраняется до POST, повтор требует подтверждения, свои временные копии очищаются отдельно от серверного удаления.

HTTP разрешён для локального mock. APK использует тестовую подпись и ARM64; публикация в магазинах не требуется. Разрешения, очистка данных, production-риски и необходимость нового бинарника описаны в [release note](docs/RELEASE_NOTES.md).
