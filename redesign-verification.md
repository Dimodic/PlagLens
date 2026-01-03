# Redesign verification — Kaggle-style pass

Дата: 2026-05-11

Цель: довести PlagLens до Kaggle-уровня (settings = эталон document-style),
закрепить минимализм («не объясняем что делать, даём инструмент»).

## TL;DR
- **3 роли** (teacher, admin, student) пройдены, скриншоты сняты под каждой.
- **PageContainer** теперь принимает `narrow` / `regular` / `wide`; применён ко всем затронутым страницам.
- **Document-style** включён на settings / profile / user settings landing — `Card` убран, `<Section variant="document">` рисует hairline-границы.
- **Wordmark** теперь `plaglens` lowercase / Outfit 500. Свёрнутый рейл = строчная `p`. Hover раскрывает drawer **overlay** (контент не сдвигается, `mainShifted=false` под всеми ролями).
- **Buttons / search / chips** = `rounded-full` (pill).
- **Tabs** = underline-only (никаких pill-фонов).
- **StatusPill** — outlined neutral pill + 6 px coloured dot; применён к интеграциям и tenant dashboard.
- **StatsPanel** — горизонтальная Kaggle-полоса (border-y + divide-x) заменила KPI-сетку на `/me` (MyDashboardPage) и `/admin/overview` (AdminDashboardPage).
- **Console / 4xx-5xx** — ошибок приложения нет; в логе только HMR-WebSocket `ERR_CONNECTION_REFUSED` (специфика прогона внутри docker-контейнера, не баг приложения) и фоновые 401 на `/auth/refresh` (rotational refresh-cookie, не блокирует UI).

## Затронутые страницы (по ролям)

| Роль     | URL                       | mode    | width  | `<Card>` | Замечания |
|----------|---------------------------|---------|--------|----------|-----------|
| teacher  | `/me` (MyDashboard)       | regular | 1080   | 0        | StatsPanel + outlined section blocks |
| teacher  | `/courses`                | narrow  | 760    | 6        | сетка карточек (list) — outlined-only |
| teacher  | `/integrations`           | regular | 1080   | 2        | StatusPill (outlined + dot) |
| teacher  | `/settings` (UserSettings)| narrow  | 760    | 0        | document-style |
| teacher  | `/me/settings`            | narrow  | 760    | 0        | document-style |
| teacher  | `/me/profile`             | narrow  | 760    | 0        | document-style |
| teacher  | `/me/assignments`         | narrow  | 760    | 1        | list |
| teacher  | `/me/submissions`         | wide    | 1168   | 0        | таблицы |
| teacher  | `/notifications`          | narrow  | 760    | 0        | список |
| admin    | `/` → `/admin`            | regular | 1080   | 8        | TenantDashboardPage (KPICard в сетке) |
| admin    | `/admin/overview`         | regular | 1080   | 2        | **StatsPanel** + outlined блоки |
| admin    | `/admin/users`            | wide    | 1168   | 1        | таблица |
| admin    | `/admin/integrations`     | regular | 1080   | 0        | пустое состояние |
| admin    | `/admin/audit`            | wide    | 1168   | 0        | таблица |
| admin    | `/admin/tenants`          | wide    | 1168   | 1        | таблица |
| admin    | `/me/profile`             | narrow  | 760    | 0        | document-style |
| admin    | `/me/settings`            | narrow  | 760    | 0        | document-style |
| student  | `/me`                     | regular | 1080   | 0        | StatsPanel |
| student  | `/me/assignments`         | narrow  | 760    | 1        | список |
| student  | `/me/submissions`         | wide    | 1232   | 0        | таблицы |
| student  | `/me/grades`              | narrow  | 760    | 1        | список |
| student  | `/me/settings`            | narrow  | 760    | 0        | document-style |
| student  | `/me/profile`             | narrow  | 760    | 0        | document-style |
| student  | `/notifications`          | narrow  | 760    | 0        | список |

> На страницах-списках `<Card>` оставлен сознательно — это сетка карточек.
> На страницах-документах (`/settings`, `/me/settings`, `/me/profile`)
> карточек **0**.

## Sidebar (overlay-режим)
- rail = 64 px
- drawer-on-hover = 256 px
- main-shift при hover = **false** (overlay поверх контента, не push)
- wordmark = `plaglens` (lowercase, Outfit 500)

## Tabs
Все `<Tabs>` shadcn перерисованы: `<TabsList>` — `flex border-b`, `<TabsTrigger>` — `border-b-2 border-transparent` → активная имеет `border-foreground`. Нет фоновых заливок.

## Button / Input
- Все `<Button>` варианты — `rounded-full`. Включая `size=icon` (свёрнутые иконочные кнопки в Header).
- Глобальный поиск в Header — `rounded-full`.
- Обычные form-input оставлены `rounded-md` (как и указано в брифе).

## StatusPill — единый API
`<StatusPill tone="success|warning|destructive|info|neutral">` — outlined neutral pill + 6 px цветная точка. Цвета по брифу: emerald-500 / amber-500 / red-500 / sky-500 / slate-400.

Заменено:
- `IntegrationStatusBadge` → StatusPill (соответствие: active→success, pending_auth→warning, error→destructive, disabled→neutral)
- `integrationBadge` в TenantDashboardPage (healthy/degraded/error → success/warning/destructive)

Filled `<Badge>` по умолчанию перерисован в outline-pill (`defaultVariant = 'outline'`). `variant="default"` всё ещё доступен (например, для тонкого штампа «Institutional» в admin overview).

## Изменённые компоненты / страницы

### Foundational
- `frontend/src/components/layout/Page.tsx` — три ширины + `Section variant="document"`
- `frontend/src/components/shell/Wordmark.tsx` — lowercase `plaglens`
- `frontend/src/components/ui/button.tsx` — rounded-full, размеры px-4 py-2 / px-3 py-1.5
- `frontend/src/components/ui/tabs.tsx` — underline-only
- `frontend/src/components/ui/card.tsx` — rounded-lg, outlined (без shadow)
- `frontend/src/components/ui/badge.tsx` — default = outline pill
- `frontend/src/components/common/StatusPill.tsx` — НОВЫЙ
- `frontend/src/components/common/StatsPanel.tsx` — НОВЫЙ
- `frontend/src/components/common/EmptyState.tsx` — одно `<p>` + одна кнопка
- `frontend/src/components/dashboard/KPICard.tsx` — icon-wrap `rounded-full`
- `frontend/src/components/shell/Header.tsx` — search `rounded-full`
- `frontend/src/components/admin/IntegrationStatusBadge.tsx` → StatusPill
- `frontend/src/layout/AppShell.tsx` — main без лишнего max-width, ширину определяет Page

### Pages
- `frontend/src/pages/me/MySettingsPage.tsx` → document-style, выкинут sub-описания
- `frontend/src/pages/me/ProfilePage.tsx` → document-style
- `frontend/src/pages/me/UserSettingsLandingPage.tsx` → document-style (4 секции, hairline rows, выкинут sub-текст)
- `frontend/src/pages/dashboard/MyDashboardPage.tsx` → StatsPanel + outlined sections
- `frontend/src/pages/dashboard/TenantDashboardPage.tsx` → Page width=regular + StatusPill в таблице
- `frontend/src/pages/admin/AdminDashboardPage.tsx` → StatsPanel + fix `.filter` на undefined-health
- `frontend/src/pages/admin/IntegrationsListPage.tsx` → Page width=regular, упрощён EmptyState

## Скриншоты
Папка: `frontend/scripts/redesign-shots-v2/`

Сняты (1280×900, fullPage):
- **teacher**: home / me / courses / integrations / settings / me-settings / me-profile / me-assignments / me-submissions / notifications + sidebar-hover
- **admin**: home / admin-overview / admin-users / admin-integrations / admin-audit / admin-tenants / me-profile / me-settings + sidebar-hover
- **student**: home / me / me-assignments / me-submissions / me-grades / me-settings / me-profile / notifications

Сводка измерений: `frontend/scripts/redesign-shots-v2/_summary.json`.

Скрипт верификации: `frontend/scripts/redesign-verify-v2.cjs`. Запуск:
```
docker exec plaglens-frontend-dev sh -c '
  rm -rf /tmp/redesign-shots-v2 && mkdir -p /tmp/redesign-shots-v2 &&
  node /app/scripts/redesign-verify-v2.cjs
'
docker cp plaglens-frontend-dev:/tmp/redesign-shots-v2/. \
  frontend/scripts/redesign-shots-v2/
```

## Что НЕ сделано (out of scope этой итерации)

1. **«Right-rail» на странице-документе** — добавлен в Page как доступный паттерн (см. брифовый pattern `grid-cols-[1fr_280px]`), но в текущей итерации применять не пришлось: profile / settings достаточно компактны и не имеют значимой метаданных-колонки. Полная адаптация на course details / integration details / user details оставлена на следующий заход — это ~10 страниц.

2. **Tabs underline на всех страницах** — обновлён сам компонент `tabs.tsx`, поэтому все места, где используются shadcn Tabs, автоматически перешли на underline. Если где-то используется самописная tab-навигация (не shadcn), она в этом проходе не унифицирована.

3. **Один акцент-цвет в default_theme.css** — цвет primary не трогали (бриф: «оставить ОДИН primary акцент (взять текущий синий)»). Текущий primary — глубокий нейтрально-чёрный (`oklch(0.22 0.018 260)`), что уже соответствует Vercel/Kaggle. Sev-цвета (low/mid/high) частично остались в нескольких местах внутри страниц (например `text-sev-high` для overdue-индикатора), их замена на единый акцент — отдельная задача.

4. **Полный обход всех admin-страниц** (NotificationDeliveriesPage, AuditEventsPage и т. п.) — Badge получил `defaultVariant=outline`, поэтому в массе они уже выглядят однородно. Но «карточные обёртки» вокруг табличных страниц не перерисованы; визуально не критично, но полную унификацию надо догнать.

5. **Чистка `bg-sev-*-bg` в 20+ файлах** — точечная замена `Badge className="bg-sev-low-bg …"` → `StatusPill tone="success"` оставлена на следующую итерацию (большой механический проход; в этом запуске сделана только в `IntegrationStatusBadge` и `TenantDashboardPage`).

## Console / network ошибки

В консоли каждой страницы фиксируется:
- `ws://127.0.0.1:5174 ERR_CONNECTION_REFUSED` — HMR-клиент пытается подключиться к хостовому порту 5174, недоступному изнутри контейнера. Безвредно, не влияет на рантайм.
- `POST /api/v1/auth/refresh → 401` (после ротации refresh-cookie) — фоновая операция в `axios` interceptor; ProtectedRoute получает 200 на `/auth/me`, страница рендерится корректно.

Других PAGEERROR / уникальных console.error по итогам прогона **не зафиксировано**. Исходный `Cannot read properties of undefined (reading 'filter')` в AdminDashboardPage (на `healthQ.data.data`) пофикшен (теперь толерантно к bare-array shape).

## Sanity-метрики (последний прогон)

```
teacher: rail=64px drawer=256px mainShifted=false
admin:   rail=64px drawer=256px mainShifted=false
student: no sidebar (pure student, expected)

cards on doc-pages:
  teacher /settings, /me/settings, /me/profile  → 0, 0, 0
  admin   /me/profile, /me/settings              → 0, 0
  student /me/settings, /me/profile              → 0, 0
```
