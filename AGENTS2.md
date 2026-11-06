# AGENTS2.md — постоянная инструкция ИИ-разработки Wave Notes

> **Применяется ко всему проекту `BauRP/exact-screenshot-match`.** Существующий корневой `AGENTS.md` принадлежит Lovable и **не изменяется**. Этот `AGENTS2.md` дополняет его; вложенных `AGENTS.md`/`AGENTS2.md` на момент проверки 2026-11-06 нет. При появлении инструкций внутри папок учитывать их область действия. **Некоторые ИИ автоматически читают только файл с именем `AGENTS.md`, поэтому в новых чатах обязательно самостоятельно открывать `AGENTS2.md`.**

## 0. Быстрый запуск без повторного аудита

1. Прочитать начало `PROGRESS.md`, сводку, реестр рисков, очередь задач, раздел «С чего продолжить в следующем чате» и действующие правила в `AGENTS.md` и `AGENTS2.md`.
2. Проверить **HEAD ветки `chatgpt/super-notes-stability-20261025`** и сравнить с последним подтверждённым SHA кода из журнала/CI. `main` не изменять; другие репозитории/чаты не объединять.
3. Для Wave Notes известна база на 2026-11-06: **36 направлений, 79,12% готовности кода**, успешный APK CI [42119508696](https://github.com/BauRP/exact-screenshot-match/actions/runs/42119508696) на SHA `7c317d4545471b9c54a7cfb940297ad21f4ccf87`; отдельно эмуляторы [42119508728](https://github.com/BauRP/exact-screenshot-match/actions/runs/42119508728) — 7/7. Это **историческая точка**, всегда сверять со свежим PROGRESS и GitHub.
4. Выбрать самую важную доступную задачу: P0 безопасность, потеря данных, зависание; затем незавершённые крупные функции. Из карты ниже открыть связанные 2–5 файлов и соответствующие тесты, а не всё дерево.
5. Выполнять максимально большой **разумный логический пакет**, узкие тесты, затем полную автоматическую сборку и проверку APK, при сбое исправлять и повторять. Не прерывать собственную сборку лишними коммитами.
6. **После КАЖДОГО запроса по Wave Notes** обновить **один и тот же `PROGRESS.md` прямо в GitHub**, даже когда пользователь забыл о нём. Это критическое утверждённое требование из начала PROGRESS, более строгое, чем «после крупного пакета». Записать факты, ошибки, точный SHA/CI, Δ% либо 0, следующий шаг. После изменения 36 оценок также обновить `docs/wave-notes-feature-progress.md`. Документный commit сам по себе не требует APK.

## 1. Охрана существующей платформы и Git-истории

- В существующем `AGENTS.md` есть защищённый блок `LOVABLE:BEGIN/END`: **не делать force-push, rebase, amend, squash опубликованных коммитов**. Lovable синхронизирует исходники с GitHub, история не должна теряться. Исходный `AGENTS.md` не править. Не ломать имеющиеся native ad overlay и PDF text-overlay `runs`.
- В `AGENTS.md` закреплены только **Native In-feed Ads** (без баннера), согласованная геометрия слота с `noteCardShell(view)`, Android overlay на `android.R.id.content`, корректный status inset. PDF-форматирование по символам `runs` применяется только к выделенному тексту.
- Перед любым push: прочитать actual HEAD, приготовить изменения на нём, создать логический fast-forward commit; если expected SHA не совпал, заново сверить diff. Не переписывать файлы другого автора и не удалять полезную историю.
- При GitHub разрешениях соблюдать явные подтверждения, никогда не обходить UI. Если разрешено «Разрешить один раз», это **только одна операция**, не согласие на будущие и не «Всегда разрешать».
- Внешние Cloudflare/Play/Telegram аккаунты и устройство пользователя не считать доступными без подтверждённого инструмента и отдельного разрешения. Работа по программному коду при этом продолжается.

## 2. Проверенная техническая среда и файлы

**Стек.** TypeScript 5.8, React 19, TanStack Router/Start, Tiptap 3 + ProseMirror, Tailwind 4, Vite 8, Bun + tracked `bun.lock`. Android — Capacitor 8.5, Java 21/Gradle, Kotlin 2.2.20, Google ML Kit bundled OCR и Tesseract4Android, PDF.js/pdf-lib, IndexedDB/localStorage. `android-overlay/variables.gradle`: **minSdk 24 (Android 7), compileSdk 36, targetSdk 36**; эмулятор дополнительно проверяет API 37.0 (Android 17). `capacitor.config.json`: `appId=app.lovable.supernotes`, `appName=Wave Notes`, `webDir=dist/client`. Не менять package ID без migration plan.

**Vite и Lovable.** `vite.config.ts` строится через `@lovable.dev/vite-tanstack-config`: этот preset уже подключает React, Tailwind, TanStack, Nitro и aliases. **Не регистрировать плагины повторно.** Поддержка старого WebView обеспечивается ES2015/Chrome69 transpilation; при обновлении зависимостей сохранить её.

**Источник / генерируемое.** Рабочие исходники: `src/`, `android-overlay/`, `scripts/`, `feedback-relay/`, `.github/workflows/`, `docs/`, root configs. Генерируемые: `dist/`, `node_modules/`, `android/` (создаётся Capacitor в CI), `.output/`, `.vinxi/`, build outputs; не редактировать генерируемые файлы руками. Вносить native изменения в **`android-overlay/`**, а затем позволять workflow наложить его после создания Android-проекта.

**Зависимости:** `package.json` и `bun.lock`; не создавать второй package manager lock. Новые пакеты применять только при реальной потребности, после проверки лицензии, security, WebView и API24+, размера APK и того, нет ли уже функции в проекте.

## 3. Куда идти за конкретным изменением

| Функция | Первые файлы и важные связи |
|---|---|
| Лента, поиск, порядок, выделение | `src/routes/index.tsx`, `src/lib/notes-store.ts`, `src/lib/note-search.ts`. При переупорядочении сохранять pinned, manual order и слоты рекламы. |
| Папки и страницы списка | `src/lib/folders-store.ts`, `src/lib/folder-navigation.ts`, `src/lib/folder-note-pages.ts`, `src/routes/index.tsx`. Вложенные папки/циклы и pagination 12/24/48 без переписывания заметок. |
| Редактор / панель | `src/routes/editor.$id.tsx`, `src/lib/editor-extensions.ts`, `src/lib/editor-preferences.ts`. Уважать выбор текста, Undo, мобильные insets. |
| Чеклисты / RTL / блоки | `src/lib/wave-checklist.ts`, `src/lib/wave-checklist-actions.ts`, `src/lib/wave-block-motion.ts`, `src/lib/wave-text-direction.ts`. Действие группы = одна ProseMirror transaction, без потери marks/текста. |
| Страницы внутри заметки | `src/lib/wave-page-actions.ts`, `src/lib/wave-page-break.ts`, `src/routes/editor.$id.tsx`. Не путать со страницами списка папки. |
| Фото, рисунки, медиа | `src/lib/image-files.ts`, `src/lib/audio-files.ts`, `src/lib/wave-ink.ts`, `src/components/editor/WaveImage.tsx`, `src/components/editor/WaveInkCanvas.tsx`, `src/lib/native-audio.ts`. Не менять media IDs, пока файл используется. |
| PDF и экспорт | `src/routes/pdf.$id.tsx`, `src/lib/pdf-files.ts`, `src/lib/pdf-page-geometry.ts`, `src/lib/note-export.ts`. По-символьный PDF `runs`, кириллица и выделение. |
| OCR камера/галерея | `src/routes/camera.tsx`, `src/lib/ocr-plan.ts`, `src/lib/ocr-hybrid.ts`, `src/lib/ocr-merge.ts`, `src/lib/ocr-save-flow.ts`. Bundled ML Kit/Tesseract; OCR создаёт обычную заметку, **не редактирует PDF**. |
| Сохранение/backup | `src/lib/notes-store.ts`, `src/lib/backup.ts`, `src/lib/local-backup.ts`, `src/lib/backup-restore-plan.ts`, `src/lib/note-transfer.ts`. LocalStorage + IDB attachments + Directory.Data staged backup. Не потерять версии и бинарники. |
| Напоминания | `src/lib/native-reminders.ts`, `src/lib/reminder-dashboard.ts`, `android-overlay/app/src/main/java/app/lovable/supernotes/NativeReminderPlugin.java`. Permissions, repeat/reboot/dedup. |
| Реклама/системные панели | `src/lib/native-ads.ts`, `src/routes/settings.tsx`, `src/routes/__root.tsx`, `src/styles.css`, `android-overlay/app/src/main/java/app/lovable/supernotes/SystemUiInsets.java`. Native Ad + UMP, edge-to-edge, жесты/3 кнопки/клавиатура. |
| Telegram | `android-overlay/app/src/main/java/app/lovable/supernotes/TelegramFeedbackPlugin.java`, `src/lib/feedback-client.ts`, `feedback-relay/index.mjs`, `android-overlay/app/build.gradle`. **P0: исходник содержит бот-секрет. НИКОГДА не выводить его**; relay migration/rotation без поломки работающей доставки. |
| CI и build | `.github/workflows/android-build.yml`, `.github/workflows/android-ocr-emulator.yml`, `.github/workflows/ocr-quality.yml`, `capacitor.config.json`, `android-overlay/variables.gradle`. |

**Подробный 56-модульный индекс, риски и история — в `PROGRESS.md`, сюда их не копировать.** Читать только релевантные пути и регрессионный тест. Когда файл схемы меняется, искать все call sites и сохранённые форматы.

## 4. Реальные команды: быстро в процессе / полно после пакета

```bash
# Зависимости, TypeScript и избирательные проверки
bun install
bunx tsc --noEmit
bunx eslint src/lib/notes-store.ts
# Скрипт lint в package.json есть; базовые предупреждения могут существовать
bun run lint

# Примеры СУЩЕСТВУЮЩИХ направленных регрессий (выбрать по изменению):
bun scripts/test-wave-convert-checklists.ts
bun scripts/test-wave-selected-checklists.ts
bun scripts/test-wave-toolbar-expanded.ts
bun scripts/test-wave-block-cross-pages.ts
bun scripts/test-wave-auto-rtl.ts
bun scripts/test-backup-archive-guard.ts
bun scripts/test-feature-boundaries.ts
bun scripts/test-wave-telegram-feedback.ts
node scripts/test-wave-feedback-relay.mjs

# Полная web-сборка после крупного пакета
bun run build

# APK: после npx cap add android / npx cap sync android и наложения android-overlay
cd android
./gradlew assembleDebug --no-daemon --stacktrace
```

**Авторитетен фактический workflow:** `.github/workflows/android-build.yml` устанавливает Node 22, Bun, Java 21, Android SDK 36, выполняет web build, `bunx tsc --noEmit`, набор `bun scripts/test-*.ts`, Gradle, проверки APK, SHA-256 и тестовый release. Порядок и команды перед запуском сверять с workflow. Не запускать Gradle в голом репозитории до `cap add/sync` и наложения overlay. При отсутствии Android SDK пользоваться GitHub Actions.

**Другие CI:** `.github/workflows/android-ocr-emulator.yml` — 7 конфигураций API 24/26/29/34 phone/34 tablet/36/37.0, отдельно от APK. `.github/workflows/ocr-quality.yml` — десктопная OCR quality regression с зависимостями, описанными в workflow. `concurrency.cancel-in-progress=true` у сборки: не плодить мелкие commits, отменяющие текущую проверку. Java setup уже включает Gradle cache. Не отключать кэш/проверки для красивого статуса.

**Стандарт качества:** сначала узкие тесты + typecheck, затем сборка по логическому пакету, при ошибке root-cause fix и повтор. Записывать точный SHA, run id, состояние `completed/success` либо `failure/cancelled/pending`. Нельзя говорить «прошёл эмулятор», если зелёная только APK, или «проверен телефон», если проходил только CI. Документационный commit сам по себе не требует APK, проценты за него не увеличивать.

## 5. Сохранность, UI, безопасность, ошибки

1. **Сначала durable Save:** `notes-store.ts` и IndexedDB binary modules должны сохранять до UI success. Нельзя стирать существующее тело или media при quota/partial restore. Импорт ZIP/`.wnote` валидировать до записи; использовать staged backup с promote, не перезаписывать оригинальные версии при конфликте. Backup only on Save, не при печати; внутренняя копия исчезает при uninstall.
2. **Запрещены «выключить ради фикса», fake AI/OCR/PDF, опасные заглушки и бесконечные retries.** При async permissions/camera/audio/backup соблюдать cancel/timeouts/finally и закрытие ресурса; без тяжёлых синхронных декодирований на UI-потоке.
3. Текст/медиа/Undo: не пересобирать HTML ради одного атрибута, использовать существующий Tiptap/PM; групповое действие атомарно, сохраняет marks и IDs; не пересекать page divider/hidden Tape. Не переписывать 90KB+ editor целиком из-за локальной ошибки.
4. Утверждённый дизайн: новая заметка жёлтая, иконка Save — дискета, поддержка offline OCR, корректные status/nav/keyboard insets на Android 7–17. Реклама native feed first + every 5 пользовательских записей, label «Реклама», UMP reuse; не удалять AdMob, PIN и нативные разрешения. PIN — gate, **не шифрование**.
5. Исправление бага: воспроизведение → нужный исходник → **отделить доказанную причину от гипотезы** → целевой регрессионный тест → первопричина → смежные проверки и сборка → журнал. Не повторять уже неудачное исправление из PROGRESS.
6. При внешней блокировке (Cloudflare/Telegram/Play/телефон) не стоять без работы: записать точную зависимость и перейти к другой независимой очереди. Ничего не делать в пользовательских аккаунтах без разрешения и доступа.
7. Никогда не сохранять токены, пароли, signing keys, private IDs, персональные данные в исходнике, примерах, git или PROGRESS. **SEC-01**: текущая Telegram Java реализация содержит встроенный токен, а relay описан отдельно; не считать проблему решённой из-за зелёной сборки, не дублировать секрет в diff/логах. Сначала безопасная миграция и тест, затем замена скомпрометированного токена владельцем.
8. Новая зависимость — оценить лицензии, compatibility, offline/runtime size и риск. Новый React/shared API — проверить всех потребителей и сохранённые форматы. Не создавать дубликат уже работающей функции или компонента.

## 6. Отчёт и постоянное обслуживание

- **Перед задачей:** `PROGRESS.md` + Lovable `AGENTS.md` + этот `AGENTS2.md` + свежий HEAD + локальный diff нужных файлов. Полный аудит только если контекст реально потерян или архитектурно изменён.
- **В ходе:** логические пакеты, максимально много реальной завершённой работы, короткие сообщения только о существенных фактах. Проверки должны соответствовать природе изменения; не запускать лишнюю APK после документации/мелкой строки.
- **После КАЖДОГО задания по Wave Notes, без напоминания:** обновить корневой **`PROGRESS.md` в GitHub**, факты, файлы, run SHA/результаты, ошибки, следующий пакет и процент (0, если код не менялся). При изменении процентов обновить и `docs/wave-notes-feature-progress.md`. После записи повторно прочитать файл и подтвердить ветку.
- **Расчёт готовности:** база **36 направлений**; `общее = сумма 36 процентов / 36`. Прибавка только за реальные реализованные, проверенные функции, а не планы, заглушки, обновление AGENTS или тестирование на личном телефоне. Телефонная приёмка пользователя отдельно, не уменьшает процент программной готовности.
- **Поддержание инструкции:** `AGENTS2.md` менять только при новых постоянных правилах, архитектуре, реальных командах, связях/инвариантах. Рутинные изменения, SHA, результаты CI и список задач принадлежат **`PROGRESS.md`**. Не удалять этот дословный блок 11 правил.

## 7. Как мы работаем по всем направлениям — обязательные 11 правил владельца (ДОСЛОВНО)

Возьми максимум работы по всем направлениям проекта и делай по этому правилу:

1. Не перечитывай весь проект, если нужный контекст уже известен. Изучай только необходимые файлы и связанные участки кода.
2. Не запускай отдельную APK-сборку после каждого мелкого изменения. Объединяй изменения в крупные логические пакеты.
3. Самостоятельно объединяй взаимосвязанные задачи в крупные блоки. Выполняй максимально большой объём реальной разработки за один запуск.
4. Сначала занимайся наиболее незавершёнными направлениями и отсутствующими функциями. Критические ошибки, зависания, безопасность и риск потери данных имеют наивысший приоритет.
5. Не трать время на длинные промежуточные отчёты. Кратко сообщай о существенном прогрессе, но основное время уделяй коду.
6. После каждого крупного пакета обязательно проводи автоматические тесты и полноценную сборку приложения. Если проверки выявили ошибки, исправляй их и повторяй.
7. Показывай готовность каждого направления, прирост в процентах или долях процента и общую готовность. Повышай показатели только за реально выполненную и проверенную работу.
8. Если одна задача заблокирована, не зацикливайся. Переходи к другим доступным направлениям.
9. Не останавливайся после первого успешно выполненного блока. Последовательно переходи к следующему, пока позволяют инструменты и ограничения текущего запуска.
10. Сохраняй изменения только в согласованной рабочей ветке GitHub. Не трогай main без моего разрешения.
11. Не включай в незавершённую программную работу действия, которые технически не можешь выполнить, например установку APK на мой телефон. Завершай доступную работу в коде, проводи автоматические проверки и сборку. Проверки, которые должен сделать я, указывай отдельно, не снижая из-за них процент готовности программной части.

Главная цель: максимальное количество полностью реализованных и автоматически проверенных функций за один запуск, а не максимальное количество коммитов, отчётов или мелких исправлений.

---

**Границы:** AGENTS.md = существующие Lovable-managed инструкции (никогда не заменять); AGENTS2.md = устойчивый способ разработки; PROGRESS.md = актуальный техжурнал, задачи, проценты и подтверждённые проверки. При конфликте источников сверить реальный код/CI, не отменяя правила безопасности и не переписывая историю GitHub.
