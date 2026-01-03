# Route audit — depth=2 crawler

Дата: 2026-05-12.

Цель: убедиться что ни одна страница ни под одной ролью не отдаёт 404 / 500 /
ErrorBoundary / пустой render после Kaggle-redesign'а.

## TL;DR

**0 broken страниц из 79 обойдённых** под admin / teacher / student.
В процессе аудита найдено и **починено 2 настоящих 500-crash**'а, которые
маскировались под «почти-пустую страницу» (body=81-84 B, выше моего EMPTY-
threshold 50 B). Первый проход их пропустил, ручная проверка скринов обнаружила,
crawler расширен детекцией `<h1>500</h1>`, повторный проход → 0 broken.

## Что обойдено

| Роль    | Sidebar | Depth-1 | Depth-2 | Dynamic detail | Итого |
|---------|---------|---------|---------|----------------|-------|
| teacher | 6 + landings | 13 | 14 | 2 (`/courses/knad-cpp-24-25`, `/integrations/ic_ab80daf0834173`) | 29 |
| admin   | 9 + landings | 15 | 20 | (нет detail link для users/integrations в demo-данных) | 35 |
| student | 4 + landings | 8 | 7 | (нет detail link для assignments/submissions в demo-данных) | 15 |
| **Всего** | | | | | **79** |

Под динамическими routes понимаются `/courses/:slug`, `/integrations/:id` и
аналогичные — crawler находит первую matching ссылку на list-странице и
переходит по ней. Для `/me/assignments` / `/me/submissions` ссылок не нашлось
(списки на demo-аккаунтах пусты), не баг.

## Найденные баги

### 1. `/admin/system/health` → 500 «Cannot read properties of undefined (reading 'map')»
**Файл:** `frontend/src/pages/admin/settings/SystemHealthPage.tsx:49`

**Симптом:** при определённой shape ответа `useServicesStatus()` (`data` есть, но
`data.services` отсутствует) выражение `data?.services.map(...)` падает: optional
chain отрабатывает на `data`, но не на `services`, и `undefined.map` → TypeError.
React Router ловит и рендерит `<ErrorPage>` с h1=500.

**Фикс:** `data?.services?.map((s) => ...)` — добавили `?.` перед `.map`.

### 2. `/admin/ai/prompt-versions` → 500 «Cannot read properties of undefined (reading 'length')»
**Файл:** `frontend/src/pages/admin/PromptVersionsPage.tsx:199, 206`

**Симптом:** `data && data.data.length === 0` падает когда `data` пришла как пустой
объект `{}`. Та же история с `data?.data.map`.

**Фикс:** `data && (data.data?.length ?? 0) === 0` для проверки empty-state,
`data?.data?.map(...)` для рендеринга списка.

### Crawler улучшение

Crawler `frontend/scripts/route-audit.cjs` расширен детектом `<ErrorPage>`:
- сигнатура: `document.title === "Ошибка"` или `<h1>` с трёхзначным statusом
  (отличным от 404 — те и так детектились)
- помечается в отчёте как `500` (отдельно от `404 / CRASH / EMPTY / FATAL`)

После расширения и повторного прогона — **0 broken**.

## Что не баг (но замечено)

- **`/me/api-keys` под student**: рендерится таблица «API keys» с красным `!`-кружком и пустыми
  колонками. ProblemAlert получил пустой `problem`-объект (бэкенд вернул 403, query вышел в
  error, но `error.detail / error.title` отсутствуют) и нарисовал только иконку без текста.
  Страница работает (не crash), но empty-state некрасивый. → отдельная задача на ProblemAlert.
- **`/admin/system/health` после фикса**: рендерит только H1 «System health» без content
  области, если backend вернул объект без `services`. Можно добавить EmptyState под H1
  («Нет данных о сервисах») — мелкий UX-fix, не critical.
- **`/me/assignments`, `/me/submissions`** под teacher и student — detail-probes не нашли
  динамических ссылок. Demo-аккаунты не имеют данных в этих списках. Это не баг — pages
  рендерятся ОК.

## Console noise (известно, игнорируем)

- `ws://127.0.0.1:5174 ERR_CONNECTION_REFUSED` — HMR-клиент пытается подключиться к
  хостовому порту 5174 изнутри контейнера. Безвредно. **~150 строк на прогон.**
- `POST /api/v1/auth/refresh → 401` (после ротации refresh-cookie) — фоновая операция
  axios interceptor'а; ProtectedRoute получает 200 на `/auth/me`. **~14 строк на прогон.**

Других PAGEERROR / уникальных console.error по итогам последнего прогона **не зафиксировано**.

## Артефакты

- **Скрипт:** `frontend/scripts/route-audit.cjs`
- **Скрины:** `frontend/scripts/route-audit/{role}-{NN}-{slug}.png` (79 шт.)
- **Машинный отчёт:** `frontend/scripts/route-audit/_audit.json` — массив `pages` +
  массив `issues` со списком всех страниц и их probe-метриками
- **Запуск:**
  ```
  docker exec plaglens-frontend-dev sh -c '
    rm -rf /tmp/route-audit && mkdir -p /tmp/route-audit &&
    node /app/scripts/route-audit.cjs
  '
  docker cp plaglens-frontend-dev:/tmp/route-audit/. \
    frontend/scripts/route-audit/
  ```

## Итоговая sanity-метрика

```
pages visited: 79
broken:        0
issues:        164 (all known-noise: HMR ws + auth/refresh 401)
```
