# PlagLens Frontend — Mantine 7 → shadcn/ui + Tailwind v4 migration guide

Этот документ — **обязательное чтение** для любого, кто мигрирует страницу или компонент.

## TL;DR

- **Стек:** Tailwind v4 + shadcn/ui (Radix-based) + lucide-react + sonner + react-hook-form
- **UI компоненты:** `@/components/ui/*` (всё уже есть — Button, Card, Input, Badge, Select, Tabs, Dialog, etc.)
- **Иконки:** `lucide-react` (НЕ `@tabler/icons-react`)
- **Toasts:** `sonner` через `useNotifications()` (старая обёртка работает)
- **Тема:** оставить shadcn-стандартную, токены в `src/styles/default_theme.css`. PlagLens-зелёный — это `--primary`.

## Что НЕ ТРОГАТЬ

| Папка / файл | Причина |
|---|---|
| `src/api/**` | Бэкенд-контракты, axios клиент, типы. Только импорты, не редактируем |
| `src/auth/**` | AuthProvider, RoleGuard, useAuth — критическая логика |
| `src/hooks/api/**` | React Query хуки — НЕ трогаем |
| `src/hooks/useDebounce.ts`, `src/hooks/useDocumentTitle.ts`, `src/hooks/useBreadcrumbs.ts` | Нет UI-зависимостей |
| `src/i18n/**` | Локализация |
| `src/lib/errorReporter.ts` | Не имеет UI-зависимостей |
| `src/routes/**` | Маршрутизация (структура остаётся) |
| Все тесты в `tests/`, `e2e/` | НЕ редактируем — мы должны проходить их через `data-testid` |
| `src/components/ui/**` | shadcn компоненты — не модифицируем |

## ОБЯЗАТЕЛЬНЫЕ правила

1. **Сохраняй ВСЕ `data-testid="..."` атрибуты** в полном виде. От них зависят 165 e2e-тестов. Если в исходнике был `data-testid="foo"`, он должен остаться.
2. **Не удаляй и не переименовывай экспорты** (default / named) — это сломает импорты в других местах.
3. **Сохраняй сигнатуры пропсов**. Если компонент принимал `{ opened, onClose }` — оставь те же имена.
4. **Cохраняй i18n-ключи** через `useTranslation()`. Не хардкоди русский текст там, где был `t('...')`.
5. **Не добавляй новых зависимостей.** Используй только то, что уже в `package.json`.
6. **Никаких `style={{ ... }}` с `var(--ink)`, `var(--bg)`, `var(--line)` и т.п.** — эти токены УДАЛЕНЫ. Используй Tailwind классы и shadcn токены.
7. **Никаких импортов из `@mantine/*` или `@tabler/icons-react`** — они удалены из package.json.

## Шаблон страницы (ЭТАЛОН)

См. **`src/pages/courses/CoursesListPage.tsx`** — это эталонная страница с:
- header (title + description + actions)
- KPI grid (4 cards)
- фильтры (Input с поиском + Tabs)
- список Card-ов с разделами

См. **`src/pages/auth/LoginPage.tsx`** — эталон auth-страницы (без shell, центрированная карточка).

## Маппинг Mantine → shadcn

### Layout-примитивы

| Mantine | shadcn / Tailwind |
|---|---|
| `<Stack gap="md">` | `<div className="space-y-4">` (или `flex flex-col gap-4`) |
| `<Group gap="sm">` | `<div className="flex items-center gap-2">` |
| `<Group justify="space-between">` | `<div className="flex items-center justify-between gap-3">` |
| `<Center>` | `<div className="flex items-center justify-center">` |
| `<Container size="lg">` | `<div className="mx-auto max-w-5xl">` (но AppShell уже задаёт `max-w-7xl px-6 py-8`) |
| `<SimpleGrid cols={3}>` | `<div className="grid grid-cols-1 md:grid-cols-3 gap-4">` |
| `<Divider />` | `<Separator />` (`@/components/ui/separator`) |
| `<Box>` | `<div>` |
| `<Paper p="md" withBorder>` | `<Card><CardContent className="p-4">…</CardContent></Card>` |

### Текст / типографика

| Mantine | shadcn / Tailwind |
|---|---|
| `<Title order={1}>` | `<h1 className="text-2xl font-semibold tracking-tight">` |
| `<Title order={2}>` | `<h2 className="text-xl font-semibold">` |
| `<Title order={3}>` | `<h3 className="text-lg font-medium">` |
| `<Text>` | `<p>` или `<span className="text-sm">` |
| `<Text c="dimmed">` | `<p className="text-sm text-muted-foreground">` |
| `<Text fw={500}>` | `className="font-medium"` |
| `<Text size="xs">` | `className="text-xs"` |
| `<Anchor href="...">` | `<a className="text-primary hover:underline">` или `<Link className="...">` |

### Inputs / Форма

| Mantine | shadcn |
|---|---|
| `<TextInput label="..." />` | `<div><Label>...</Label><Input /></div>` (см. CoursesListPage / LoginPage) |
| `<Textarea />` | `<Textarea />` (`@/components/ui/textarea`) |
| `<NumberInput />` | `<Input type="number" />` (или ручной wrapper) |
| `<PasswordInput />` | `<Input type="password" />` |
| `<Select data={[...]}>` | `<Select><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>...</SelectContent></Select>` |
| `<MultiSelect />` | Не используем — заменить на список Checkbox или Combobox (cmdk) |
| `<Checkbox />` | `<Checkbox />` (`@/components/ui/checkbox`) |
| `<Radio.Group>` | `<RadioGroup>` |
| `<Switch />` | `<Switch />` |
| `<DateTimePicker />` | `<Input type="datetime-local" />` (или `<Calendar>` через `<Popover>`) |
| `<DatePickerInput />` | `<Calendar>` через `<Popover>` |
| `useForm` (mantine) | `react-hook-form` + zod resolver. Можно и просто `useState` для простых форм |

### Buttons / Actions

| Mantine | shadcn |
|---|---|
| `<Button>` | `<Button>` |
| `<Button variant="filled">` | `<Button>` (default) |
| `<Button variant="outline">` | `<Button variant="outline">` |
| `<Button variant="subtle">` или `light` | `<Button variant="ghost">` или `secondary` |
| `<Button color="red">` | `<Button variant="destructive">` |
| `<ActionIcon>` | `<Button variant="ghost" size="icon"><IconLucide /></Button>` |
| `<Anchor component={Link} to="...">Текст</Anchor>` | `<Button variant="link" asChild><Link to="...">Текст</Link></Button>` |
| `loading` prop | `disabled={isLoading}` + `{isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}` |

### Feedback

| Mantine | shadcn |
|---|---|
| `<Loader />` | `<Loader2 className="h-4 w-4 animate-spin" />` (lucide) |
| `<Skeleton />` | `<Skeleton className="h-10 w-full" />` (`@/components/ui/skeleton`) |
| `<Alert color="red">` | `<Alert variant="destructive"><AlertCircle/><AlertTitle/><AlertDescription/></Alert>` |
| `<Notification>` / `notifications.show` | `useNotifications()` (sonner toast) |

### Overlays

| Mantine | shadcn |
|---|---|
| `<Modal opened onClose>` | `<Dialog open onOpenChange><DialogContent>...</DialogContent></Dialog>` |
| `<Popover>` | `<Popover><PopoverTrigger/><PopoverContent>` |
| `<Tooltip label="...">` | `<Tooltip><TooltipTrigger asChild>...</TooltipTrigger><TooltipContent>...</TooltipContent></Tooltip>` |
| `<Drawer>` | `<Sheet>` |
| `useDisclosure` | `const [open, setOpen] = useState(false)` |
| `<Tabs>` | `<Tabs value onValueChange><TabsList><TabsTrigger/></TabsList><TabsContent></TabsContent></Tabs>` |

### Data display

| Mantine | shadcn |
|---|---|
| `<Badge color="...">` | `<Badge variant="default \| secondary \| outline \| destructive">` |
| `<Pill>` | `<Badge variant="outline" className="rounded-full">` |
| `<Avatar>` | `<Avatar><AvatarFallback>AB</AvatarFallback></Avatar>` |
| `<Card withBorder>` | `<Card>` |
| `<Card.Section>` | `<CardHeader>` / `<CardContent className="border-t" />` |
| `<Table>` | `<Table>` (`@/components/ui/table`) — Table, TableHeader, TableBody, TableRow, TableHead, TableCell |
| `<List>` | `<ul className="space-y-1 list-disc pl-5">` |
| `<Progress value={n}>` | `<Progress value={n} />` (`@/components/ui/progress`) |
| `<ScrollArea h={300}>` | `<ScrollArea className="h-72">` (`@/components/ui/scroll-area`) |
| `<ThemeIcon color="green">...</ThemeIcon>` | `<div className="rounded-full bg-accent text-accent-foreground p-2">...</div>` |

### Иконки (Tabler → Lucide)

| Tabler | Lucide |
|---|---|
| `IconCheck` | `Check` |
| `IconX` | `X` |
| `IconAlertCircle` / `IconAlertTriangle` | `AlertCircle` / `AlertTriangle` |
| `IconInfoCircle` | `Info` |
| `IconChevronLeft/Right/Up/Down` | `ChevronLeft/Right/Up/Down` |
| `IconSearch` | `Search` |
| `IconFilter` | `Filter` |
| `IconPlus` | `Plus` |
| `IconTrash` | `Trash2` |
| `IconEdit` / `IconPencil` | `Pencil` / `Edit` |
| `IconCopy` | `Copy` |
| `IconDownload` | `Download` |
| `IconUpload` | `Upload` |
| `IconDots` / `IconDotsVertical` | `MoreHorizontal` / `MoreVertical` |
| `IconEye` / `IconEyeOff` | `Eye` / `EyeOff` |
| `IconArrowLeft/Right` | `ArrowLeft` / `ArrowRight` |
| `IconLoader` | `Loader2` (с `animate-spin`) |
| `IconUser` / `IconUsers` | `User` / `Users` |
| `IconBook` / `IconBookOpen` | `Book` / `BookOpen` |
| `IconFile` / `IconFileText` | `File` / `FileText` |
| `IconCode` | `Code` / `Code2` |
| `IconBrain` | `Brain` |
| `IconExternalLink` | `ExternalLink` |
| `IconClock` / `IconCalendar` | `Clock` / `Calendar` |
| `IconLink` | `Link2` |
| `IconLock` / `IconLockOpen` | `Lock` / `Unlock` |
| `IconRefresh` | `RefreshCw` |
| `IconPlayerPlay` / `IconPlayerStop` | `Play` / `Square` |
| `IconBell` | `Bell` |

Размер: `<Icon className="h-4 w-4" />` (по умолчанию). Для крупных — `h-5 w-5` или `h-6 w-6`.

### Цвета / Tones

PlagLens severity-токены доступны как Tailwind классы:
- `text-sev-low`, `bg-sev-low-bg` — зелёный (низкая угроза)
- `text-sev-mid`, `bg-sev-mid-bg` — оранжевый/янтарный (средняя)
- `text-sev-high`, `bg-sev-high-bg` — красный (высокая)

Примеры:
- "Подозрение на плагиат" → `<Badge className="bg-sev-high-bg text-sev-high">…</Badge>`
- "Замечания ИИ" → `<Badge className="bg-sev-mid-bg text-sev-mid">…</Badge>`

shadcn-палитра: `bg-primary`, `text-primary-foreground`, `bg-muted`, `text-muted-foreground`, `bg-accent`, `text-accent-foreground`, `bg-destructive`, `text-destructive-foreground`, `bg-card`, `text-card-foreground`, `border-border`.

## Шаблоны (копируй и адаптируй)

### Page header

```tsx
<div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
  <div>
    <h1 data-testid="page-title" className="text-2xl font-semibold tracking-tight">
      Заголовок страницы
    </h1>
    <p className="mt-1 text-sm text-muted-foreground">Подзаголовок / описание.</p>
  </div>
  <div className="flex items-center gap-2">
    <Button variant="outline">Вторичное действие</Button>
    <Button><Plus className="mr-2 h-4 w-4" />Главное действие</Button>
  </div>
</div>
```

### KPI card

```tsx
<Card className="border-border/70">
  <CardContent className="p-5">
    <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
      Метка
    </div>
    <div className="mt-2 text-3xl font-semibold tabular">{value}</div>
    {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
  </CardContent>
</Card>
```

### Search-input

```tsx
<div className="relative w-full max-w-sm">
  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
  <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск" className="pl-9" />
</div>
```

### Status badge

```tsx
function statusBadge(status: 'active' | 'draft' | 'archived') {
  if (status === 'archived')
    return <Badge variant="secondary" className="font-normal">В архиве</Badge>;
  if (status === 'draft')
    return <Badge variant="outline" className="font-normal">Черновик</Badge>;
  return <Badge className="font-normal">Активен</Badge>;
}
```

### Loading + Empty states

```tsx
if (query.isPending) return <SkeletonList rows={5} />;
if (query.isError)  return <ProblemAlert problem={query.error as Problem} />;
if (items.length === 0) {
  return <EmptyState title="Ничего нет" description="Попробуйте создать первую запись." action={<Button>Создать</Button>} />;
}
```

### Modal / Confirm

```tsx
<ConfirmDialog
  opened={open}
  onClose={() => setOpen(false)}
  onConfirm={handleDelete}
  title="Удалить курс?"
  message="Это действие необратимо."
  destructive
  loading={deleteMutation.isPending}
/>
```

### Toast

```tsx
const { success, error } = useNotifications();
success('Курс создан');
error('Не удалось сохранить', 'Ошибка');
```

## Структура компонента

Шаблон `MyPage.tsx`:

```tsx
import { useState } from 'react';
import { Search } from 'lucide-react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useTranslation } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/common/EmptyState';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { SkeletonList } from '@/components/common/Skeleton';
// ... API hooks ...

export default function MyPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('mypage.title'));
  // ... state ...
  return (
    <div data-testid="my-page" className="space-y-6">
      {/* header / filters / content */}
    </div>
  );
}
```

Заметки:
- НЕ оборачивай в `<PageShell>`, `<Container>`, `<Box mx="auto">` — AppShell уже даёт `max-w-7xl px-6 py-8`.
- Корневой div страницы — обычно `className="space-y-6"` или `space-y-8`.

## Что мигрировать в каждом файле страницы

1. Удалить все импорты `@mantine/*` и `@tabler/icons-react`
2. Удалить все импорты `@/components/design/*` и `@/components/screens/*` (старые design-system компоненты — заменяй на shadcn)
3. Удалить все `style={{ background: 'var(--bg)' }}` и тому подобное
4. Заменить вёрстку по маппингу выше
5. Сохранить `data-testid`, `aria-*`, обработчики, имена переменных, useQuery/useMutation, i18n ключи
6. Default export — оставить как был

## После миграции

Прогони `npm run build` (`cd frontend`) — это TypeScript + Vite. Если есть ошибки в твоих файлах — исправь. Ошибки в чужих файлах — это не твоя проблема.

## Если что-то непонятно

Эталоны — `CoursesListPage.tsx` и `LoginPage.tsx`. Смотри на них, копируй паттерны.
