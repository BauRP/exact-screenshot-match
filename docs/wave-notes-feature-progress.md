# Wave Notes — progress baseline (31.10.2026)

Source of scope: supplied «ЧТО ДОБАВИТЬ.txt» (34 numbered items, 2 reported bugs and Copilot = 37 tracked directions). The checklist duplicates are preserved as separate user-requested capabilities. Weights: 1/37 each, so the score is an **estimated mean of per-direction readiness**, not measured code coverage or acceptance success. 100% requires feature implementation, save/reload, tests and real Android acceptance. Code-only tasks are capped below 100%. The baseline 'before' is reconstructed from repository state; it was not an earlier approved score. If CI or device tests fail, scores can decrease.

Current branch: `chatgpt/super-notes-stability-20261025`.

| # | Feature | Before | After | Delta | Remaining |
|---:|---|---:|---:|---:|---:|
| 1 | Списки дел | 72% | 72% | +0 п.п. | 28% |
| 2 | Фотографии в заметках и изменение размера | 12% | 12% | +0 п.п. | 88% |
| 3 | Рисование в заметках | 5% | 5% | +0 п.п. | 95% |
| 4 | Напоминания | 5% | 5% | +0 п.п. | 95% |
| 5 | Закрепление | 86% | 86% | +0 п.п. | 14% |
| 6 | Цвет карточек | 78% | 78% | +0 п.п. | 22% |
| 7 | Интерактивные отметки | 75% | 75% | +0 п.п. | 25% |
| 8 | Перестановка заметок | 64% | 64% | +0 п.п. | 36% |
| 9 | Вложенные разделы | 10% | 10% | +0 п.п. | 90% |
| 10 | Страницы разделов | 5% | 5% | +0 п.п. | 95% |
| 11 | Выдвижная навигация | 18% | 18% | +0 п.п. | 82% |
| 12 | Поиск и фильтры заметок | 30% | 58% | +28 п.п. | 42% |
| 13 | Передача редактируемых заметок | 64% | 64% | +0 п.п. | 36% |
| 14 | Настраиваемая панель инструментов | 24% | 24% | +0 п.п. | 76% |
| 15 | Форматирование текста | 80% | 80% | +0 п.п. | 20% |
| 16 | Отмена и возврат изменений | 70% | 70% | +0 п.п. | 30% |
| 17 | Сворачиваемые разделы | 68% | 68% | +0 п.п. | 32% |
| 18 | Цитаты и информационные блоки | 70% | 70% | +0 п.п. | 30% |
| 19 | Меню вставки через / | 65% | 65% | +0 п.п. | 35% |
| 20 | Перемещение блоков редактора | 8% | 8% | +0 п.п. | 92% |
| 21 | Умная вставка из браузера | 18% | 18% | +0 п.п. | 82% |
| 22 | Автопродолжение списков | 52% | 52% | +0 п.п. | 48% |
| 23 | Ошибки правописания и RTL | 38% | 38% | +0 п.п. | 62% |
| 24 | Внешние ссылки | 75% | 75% | +0 п.п. | 25% |
| 25 | Фоны и темы страниц | 80% | 80% | +0 п.п. | 20% |
| 26 | Линейка и клетка | 72% | 72% | +0 п.п. | 28% |
| 27 | Постраничный режим | 5% | 5% | +0 п.п. | 95% |
| 28 | Скрытие ответов Tape | 66% | 66% | +0 п.п. | 34% |
| 29 | Рисование поверх фото | 4% | 4% | +0 п.п. | 96% |
| 30 | Дублирование заметки | 79% | 79% | +0 п.п. | 21% |
| 31 | Перемещение в папку | 83% | 83% | +0 п.п. | 17% |
| 32 | Отправка через другие приложения | 72% | 72% | +0 п.п. | 28% |
| 33 | Экспорт PDF/TXT/Word/изображение | 25% | 25% | +0 п.п. | 75% |
| 34 | Разрешение конфликтов версий | 46% | 46% | +0 п.п. | 54% |
| 35 | Контрастный курсор | 73% | 73% | +0 п.п. | 27% |
| 36 | Запись аудио | 48% | 48% | +0 п.п. | 52% |
| 37 | AI-помощник Copilot | 0% | 0% | +0 п.п. | 100% |

**Overall baseline:** 47.2% → **47.9%**, change **+0.8 percentage points**, remaining **52.1%**.

Current iteration: offline notes search (UI, scope, filter implementation plus regression source test). Other unchanged rows must not be presented as progress gained today. Source checks are not Android runtime proof. Previous .wnote merge patch lacks a complete visual review on devices; its percentage remains unchanged. New APK/CI and real Vivo X200 tests not yet verified. Baseline percentages are professional estimates and should be revised when runtime evidence appears.
