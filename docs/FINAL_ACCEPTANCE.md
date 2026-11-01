# Проверки и комплект demo — 01.11.2026

Исходники, оригинальный kit, тесты и инструкции находятся в [репозитории](https://github.com/k1ngsterr1/demo). APK и записи сценариев — в [Release v1.0.0](https://github.com/k1ngsterr1/demo/releases/tag/v1.0.0). Локальные диагностические логи, mock state, подписи iOS и личные записи телефона в публикацию не входят.

## Свежие проверки публикуемых исходников

| Команда                         | Результат                                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------------ |
| `npm run verify:kit`            | SHA-256 всех 9 исходных файлов kit совпадают                                                     |
| `npm run check`                 | Prettier, границы архитектуры (40 файлов), TypeScript, 95 client tests и 11 toolchain tests PASS |
| `npm --prefix kit test`         | 6/6 исходных mock tests PASS                                                                     |
| `cd client && npm audit --json` | 0 vulnerabilities, включая dev/optional dependencies                                             |

Машиночитаемый итог и хеши входов последнего APK: [public-verification.json](public-verification.json). Эти проверки повторены перед Git-публикацией; они не заменяют native UI-тесты.

## APK

- [Android ARM64 Release](https://github.com/k1ngsterr1/demo/releases/download/v1.0.0/StatementImport-Android-Release-arm64-20261031T144355Z.apk), 21 676 363 байта; Android 7.0 / API 24+, target API 36.
- SHA-256: `1c0e57871adcceab0775c761b2aede0e577d7c36f3fd5a8d114d4405dfe017f5`.
- [R8 mapping](https://github.com/k1ngsterr1/demo/releases/download/v1.0.0/StatementImport-Android-Release-arm64-20261031T144355Z-mapping.txt.gz) и [файл SHA-256](https://github.com/k1ngsterr1/demo/releases/download/v1.0.0/StatementImport-Android-Release-arm64-20261031T144355Z.apk.sha256).
- R8 и resource shrinking включены. Это тестовая debug-подпись; файл предназначен для проверки задания.
- 56 отслеживаемых входных файлов приложения совпадают с зафиксированными входами этой сборки. Ранее проверены signature, 16 KiB alignment и установка/запуск этого APK на ARM64 Android 15 / API 35. При Git-публикации native-сборка и device matrix заново не запускались.

## Полные видео от 01.11.2026

Реальные записи Release-приложения, системного picker и локального HTTP mock. Действия выполнены через Computer Use. В монтаже сохранена скорость 1×, сокращены паузы, добавлены рамка и пояснения. Счётчики POST и ревизии показаны отдельно как диагностика mock.

| Платформа                             | Полное видео                                                                                                  | Таймкоды                                                                                                          |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Android Emulator, Android 15 / API 35 | [3:52](https://github.com/k1ngsterr1/demo/releases/download/v1.0.0/StatementImport-Android-Demo-20261101.mp4) | [TXT](https://github.com/k1ngsterr1/demo/releases/download/v1.0.0/StatementImport-Android-Timecodes-20261101.txt) |
| iPhone 16 Pro Max Simulator, iOS 26.4 | [2:51](https://github.com/k1ngsterr1/demo/releases/download/v1.0.0/StatementImport-iOS-Demo-20261101.mp4)     | [TXT](https://github.com/k1ngsterr1/demo/releases/download/v1.0.0/StatementImport-iOS-Timecodes-20261101.txt)     |

Оба ролика показывают импорт и карточки списаний, отклонение spoofed/oversize до POST, lost ACK с холодным запуском без нового POST, ошибку удаления и повтор до deleted, игнорирование устаревшей revision. Android дополнительно показывает выбор PDF, прокрутку подтверждения и отмену до POST на экране 320×640 dp со шрифтом 200%. Новый iOS-ролик не подтверждает полный прогон на маленьком экране с максимальным шрифтом.

Оба файла проверены полным декодированием. Формат H.264, 1920×1080, 30 fps. [SHA-256 видео и таймкодов](https://github.com/k1ngsterr1/demo/releases/download/v1.0.0/SHA256SUMS-DEMO-20261101.txt).

## Дополнительные автоматизированные прогоны от 31.10.2026

Видео ниже записаны 31.10.2026 на iOS Simulator и Android Emulator во время XCTest/UIAutomator. Это нативные Release-приложения, системный picker и реальный HTTP mock. Они показывают функциональные прогоны зафиксированных на тот момент сборок. После них обновлялись зависимости и визуальные элементы; полная повторная видеоматрица последнего UI не заявляется.

| Видео                                                                                                                          | Что показано                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| [iOS matrix](https://github.com/k1ngsterr1/demo/releases/download/v1.0.0/ios-core-matrix.mp4)                                  | Happy, lost ACK/relaunch, stale status/delete failure, invalid files и маленький экран с крупным шрифтом |
| [Android happy CSV](https://github.com/k1ngsterr1/demo/releases/download/v1.0.0/android-happy-csv.mp4)                         | Выбор, подтверждение, результат, детали и удаление                                                       |
| [Android lost ACK/relaunch](https://github.com/k1ngsterr1/demo/releases/download/v1.0.0/android-lost-ack.mp4)                  | Восстановление принятого POST без повторной отправки                                                     |
| [Android stale/delete failure](https://github.com/k1ngsterr1/demo/releases/download/v1.0.0/android-stale-delete.mp4)           | Ready не откатывается; ошибка DELETE и подтверждённый повтор                                             |
| [Android invalid files](https://github.com/k1ngsterr1/demo/releases/download/v1.0.0/android-invalid.mp4)                       | Ложный PDF и oversized файл отклоняются до POST                                                          |
| [Android small screen / 200%](https://github.com/k1ngsterr1/demo/releases/download/v1.0.0/android-small-pdf.mp4)               | Основные действия с PDF на 320 dp / fontScale 2.0                                                        |
| [Android background recovery](https://github.com/k1ngsterr1/demo/releases/download/v1.0.0/android-quiet-background-repeat.mp4) | Старая отмена восстанавливается без технического блока настроек                                          |

Прогоны создают и удаляют только синтетические job в отдельном локальном mock. Исходные fixture остаются неизменными. Полный прогон с физического iPhone не записан; тестовый захват начального экрана не включён в приёмочные видео. VoiceOver/TalkBack этим комплектом не подтверждены.

## Критерии и воспроизведение

- PDF/CSV выбираются системным picker; имя, размер и формат доступны до подтверждения. Содержимое и лимит 10 МиБ проверяются до POST.
- Подтверждённый POST отправляет реальные байты. Queued/processing/ready/error имеют отдельные состояния. Неопределённый POST восстанавливается по durable key; автоматической повторной отправки нет.
- Результат mock содержит две вымышленные позиции в AUD с датами. «Подробнее» открывает карточку.
- Удаление имеет отдельный стабильный ключ. Успех доступен только после GET `status=deleted`; свои копии очищаются отдельно.
- Предусмотрены deadlines, отмена, stale revisions, потеря cache и возврат после завершения процесса.

Быстрый запуск приведён в [README](../README.md), подробная матрица и команды native tests в [TESTING.md](TESTING.md). Практические ограничения сети, storage, Dynamic Type, подписи и OTA описаны в [release note](RELEASE_NOTES.md). Это локальное учебное приложение для синтетических файлов.
