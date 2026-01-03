# PlagLens Design System

Единый source of truth для всего UI. Любая новая страница / компонент / правка
должны проходить через чек-лист в конце документа.

## 1. Главная мысль (формулировка пользователя)

> **Мы не объясняем преподавателю / админу / студенту ЧТО делать.
> Мы даём ему ИНСТРУМЕНТ.**

Это «почему» под всеми остальными правилами. Каждый раз, когда возникает соблазн
добавить пояснение / подсказку / описание / блёрб — спросить:
«это объясняет ЧТО делать? Тогда удалить».

Наши пользователи — преподаватели и админы вузов, они знают свою работу.
Им нужен **инструмент с понятной кнопкой**, а не tour-guide.

## 2. Визуальный эталон: Kaggle

При сомнениях по любому решению — смотреть как сделано на Kaggle Settings /
Welcome / Competitions. Конкретные паттерны, которые мы перенесли:

- Документ-стиль settings (без `<Card>` вокруг секций; H2 + hairline border-t)
- Sidebar collapsible: 64px rail + 256px hover-overlay drawer, контент не сдвигается
- Wordmark **`plaglens`** lowercase (Outfit 500) / **`p`** в свёрнутом
- Tabs underline-only (без pill-фона)
- Stats как горизонтальная полоса с `divide-x` (не сетка карточек)
- Right-rail 280px для метаданных на детальных страницах
- `rounded-full` на кнопках, search-инпутах, status-pills, category-chips
- Один акцент-цвет; status — outlined neutral pill + цветная точка 8px

## 3. Дизайн-токены

### Цвет
- **Foreground / background** — base из shadcn (`oklch(...)` toggle темой)
- **Primary** — глубокий нейтрально-чёрный `oklch(0.22 0.018 260)` (соответствует Vercel/Kaggle)
- **Один акцент-цвет** для primary CTA. Не вводить дополнительные «бренд» цвета
- **Status dots** (только 6-8px кружок, не fill):
  - emerald-500 — success / active / healthy
  - amber-500 — warning / degraded / pending
  - red-500 — destructive / unhealthy / error
  - sky-500 — info / running
  - slate-400 — neutral / disabled / unknown

### Типография
- **Шрифт** — Inter (base), Outfit (wordmark only)
- **H1** — `text-2xl font-semibold tracking-tight` (24px). НЕ 3xl / 4xl
- **H2** — `text-base font-semibold tracking-tight` (16px)
- **Body** — `text-sm` (14px)
- **Caption / muted** — `text-xs text-muted-foreground`
- **Никаких** `font-bold` на page-headers — только `font-semibold`

### Spacing
- Базовая шкала Tailwind 4px
- Между секциями документ-страницы: `mt-12 pt-12 border-t border-border/50`
- Внутри секции: `space-y-4` или `space-y-6`
- Padding страницы: внутри `<Page>` контейнер уже даёт `px-6`

### Shape / Radii
- **Buttons / search input / chips / pills** — `rounded-full`
- **Form inputs** (text, textarea, select) — `rounded-md`
- **Card** (только в сетках-списках) — `rounded-lg`, `border bg-card`, **без** `shadow`
- **Dialog / popover / dropdown** — `rounded-lg`, лёгкий `shadow-lg`

### Border / Lines
- Hairline разделители: `border-border/50` (приглушённые) или `border-border` (стандарт)
- Между секциями документ-страницы: `border-t border-border/50`

## 4. Layout

### `<Page>` — корневой контейнер
```tsx
<Page width="narrow|regular|wide">
  <PageHeader title="..." actions={...} />
  {/* content */}
</Page>
```

| Режим | max-width | Когда |
|---|---|---|
| `narrow` (default) | 760px | Формы, settings, profile, документ-страницы |
| `regular` | 1080px | Dashboard, lists-as-grid (courses, integrations) |
| `wide` | 1440px | Таблицы (users, audit, submissions, sync history) |

### `<AppShell>`
- Sticky `<Header>` сверху: global search (центр), theme-toggle, notifications-bell, avatar-menu
- Sticky `<Sidebar>` слева: 64px rail, иконки monochrome `1.5px stroke`
- Контент центрируется внутри Page внутри AppShell. **AppShell сам не даёт max-width** — это работа Page

### Sidebar
- 64px rail, всегда видим на ≥ 768px
- Hover на rail → 256px drawer выезжает поверх контента (NOT push)
- Иконки: `lucide-react`, monochrome, `h-[18px] w-[18px]`
- Активный пункт: `bg-sidebar-accent text-sidebar-accent-foreground` (не цветной fill)
- На мобилке: hamburger → backdrop + 288px sheet

## 5. Компоненты

### Button
```tsx
<Button variant="default|outline|ghost|destructive" size="default|sm|icon">
```
- **default** — filled `bg-primary`, `text-primary-foreground`, `rounded-full`
- **outline** — `border bg-background`, `rounded-full`
- **ghost** — transparent, без border, на hover `bg-muted/60`
- **destructive** — `bg-destructive`, `rounded-full`
- Padding: `default = px-4 py-2`, `sm = px-3 py-1.5`, `icon = h-9 w-9`

### Input / Search
- Form input: `rounded-md`, `border-input`, `bg-background`
- Search bar (top header / list filter): `rounded-full`, иконка 🔍 слева, опционально `⌘K` chip справа

### Tabs
- `<TabsList>` — `flex gap-6 border-b`
- `<TabsTrigger>` — `border-b-2 border-transparent pb-3 text-sm`
- Активный — `border-foreground font-medium`
- **Никакого** `bg-card / bg-muted / bg-primary` на trigger

### StatusPill
```tsx
<StatusPill tone="success|warning|destructive|info|neutral">Активна</StatusPill>
```
- Outlined neutral pill + 6-8px цветная точка слева
- Никогда не цветной фон

### StatsPanel (Kaggle home «Datasets 2 | Notebooks 3 | ...»)
```tsx
<StatsPanel>
  <StatItem icon={...} label="Курсы" value="12" hint="всего активных" />
  ...
</StatsPanel>
```
- Одна горизонтальная строка, `flex divide-x divide-border/50 border-y py-6`
- НЕ сетка карточек

### EmptyState
- Маленькая иконка (size-12, muted) → ОДНА строка `text-sm text-muted-foreground` → ОДНА primary-кнопка
- Никаких «Здесь будут отображаться...», feature-list'ов, multi-line guidance

### Card (только в list-grids)
- `border bg-card rounded-lg`, без shadow
- Внутри: title (`font-medium`), 1 строка metadata `text-xs text-muted-foreground`, max 2 кнопки + overflow `⋯`
- НЕ оборачивать в Card отдельные form-секции

### Wordmark
- `<Wordmark variant="full">` — `plaglens` lowercase, Outfit 500, `text-lg`
- `<Wordmark variant="compact">` — буква `p` lowercase, центрированная

## 6. Page Patterns

### A. Документ-страница (Settings, Profile, тонкие admin-формы)
- `<Page width="narrow">`
- `<PageHeader title="..." />` без под-описания
- Секции: H2 + контент + hairline border-t между секциями
- `<Card>` count = **0**
- Right-rail (опционально, если есть метаданные): `grid-cols-[1fr_280px] gap-12`

### B. List-as-grid (Courses, Integrations)
- `<Page width="regular">`
- Поверх: search-bar `rounded-full` + фильтры справа
- Грид карточек: `grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4`
- Каждая карточка: outlined Card с title + 1 metadata-line + 2 кнопки + `⋯`

### C. Таблица (Users, Audit, Submissions)
- `<Page width="wide">`
- Поверх: filter-bar + actions справа
- Таблица: hover row, без zebra, без border на ячейках, только `border-b border-border/50` между строками

### D. Detail-страница (Course details, Integration details, User details)
- `<Page width="regular">` с right-rail для метаданных:
  ```tsx
  <div className="grid lg:grid-cols-[1fr_280px] gap-12">
    <div>{/* main flow с секциями и tabs */}</div>
    <aside className="space-y-6 text-sm">{/* metadata + actions */}</aside>
  </div>
  ```
- Tabs underline-стиль внутри основного flow

### E. Wizard (Integration setup)
- `<Page width="narrow">`
- Шаг N из M в подзаголовке (только число, без описаний шагов)
- Одна primary кнопка «Далее» / «Запустить»
- Один выход — text-link вверху «← Интеграции»
- НЕ дублировать «Отмена» внизу

### F. Empty state for whole page
- Centered single icon → один заголовок → одна кнопка
- НЕ инструкции, НЕ feature-list, НЕ «как создать»

## 7. Анти-паттерны (НЕ делать)

- ❌ `<Card>` вокруг каждой секции формы (settings/profile)
- ❌ `<h1>` с `text-3xl/4xl font-bold` — у нас `text-2xl font-semibold`
- ❌ Subtitle / описание под H1 / H2 которое объясняет ЧТО эта страница
- ❌ Feature-list под опциями («REST · OAuth · подходит для…»)
- ❌ Placeholder-эссе в `<Input placeholder>` (`«например, Stepik · Алгоритмы 2026»` — нет)
- ❌ Pills для tabs (`<TabsTrigger>` с `bg-card/muted/primary`)
- ❌ Цветной fill на status badges (использовать StatusPill)
- ❌ Две CTA-кнопки рядом, если можно одну
- ❌ Дублирующие выходы («Отмена» + «← Назад» одновременно)
- ❌ Глобальный shadow на карточках
- ❌ Гламурные иконки с разноцветными fill'ами
- ❌ Радужные градиенты, dynamic-color backgrounds, glow-эффекты
- ❌ Дублирующие описания: title карточки + «descriptive subtitle» под ним
- ❌ Empty state с multi-paragraph guidance + 3 кнопками

## 8. Checklist для новой страницы

Перед коммитом — пройди:

- [ ] `<Page width="...">` подобран правильно (narrow / regular / wide)
- [ ] `<PageHeader title="..." />` без описания под H1
- [ ] `<Card>` count соответствует типу страницы (0 для документ-страниц)
- [ ] Все кнопки `rounded-full`, все form-inputs `rounded-md`
- [ ] Tabs underline-стиль (если есть)
- [ ] Статусы через `<StatusPill>` (не цветной Badge)
- [ ] Empty-state = иконка + 1 строка + 1 кнопка
- [ ] Sidebar активный пункт подсвечен (если страница в sidebar nav)
- [ ] Нет advisory-копий (`«здесь вы можете…»`, `«это позволяет…»`)
- [ ] Title в `<title>` через `useDocumentTitle('...')`
- [ ] При `error` рендерится `<ProblemAlert>` с понятным текстом, не пустой `!`-кружок
- [ ] При `loading` — скелетон или `<Loader2 spin>` (не белый экран)
- [ ] Никаких console.error при mount (кроме известного HMR/auth-refresh шума)
- [ ] Под admin/teacher/student роль-guards — корректные (если нужны)

## 9. Когда сомневаешься

1. **«Можно ли удалить этот текст без потери смысла?»** — Да? Удали.
2. **«Сколько способов сделать одно и то же действие сейчас на экране?»** — Сократи до одного.
3. **«Это объясняет ЧТО делать?»** — Удали.
4. **«Это похоже на Kaggle Settings?»** — Если нет, спросить почему.
