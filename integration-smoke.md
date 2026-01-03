# Integration smoke-test — end-to-end

Дата: 2026-05-12.

Read-only smoke-проход по всем integration-/admin-/plagiarism-/notifications-
поверхностям. Цель: убедиться, что каждая интеграция доходит до состояния
«можно нажать primary-кнопку без падения» — формы рендерятся, модалки
открываются, кнопки кликабельны. **Никакие формы не submit'ились** и
destructive-действия (Delete / Disable / Drop) не нажимались.

## TL;DR

```
scenarios: pass=6  partial=3  fail=0    (9 total)
console.error (post-noise): 2   — одна и та же запись от useProviders()
HTTP 4xx/5xx (post-noise):  0
PAGEERROR:                  0
```

| # | Сценарий                            | Статус   | Заметка |
|---|--------------------------------------|----------|---------|
| A | Integration wizard (4 шага)          | **pass** | три источника выбираются, далее→далее→далее доезжает до Step 4, единственная primary `Запустить импорт`, cancel через `← Интеграции` → возврат на `/integrations` |
| B | Integration detail                   | partial  | demo-данные тенанта не содержат интеграций — карточек на `/integrations` нет, нечего открывать. Сама страница `/integrations` не падает |
| C | Provider setup pages (3 шт.)         | **pass** | yandex-contest / stepik / ejudge — все три рендерятся, формы видимы (см. подсчёт полей ниже) |
| D | OAuth callback (error-states)        | **pass** | пустой URL / `state=invalid` / `error=access_denied` — все три рендерят error-card («Параметры code/state отсутствуют» и т.п.), а не 500 |
| E | LLM admin pages                      | partial  | все 4 страницы (`providers / budgets / cache / prompt-versions`) рендерятся; **но** на `providers` нет ни одной строки в demo-тенанте → нет кнопки Edit, модал-edit не проверен. Найдена побочная query-warning (см. ниже) |
| F | Notifications admin (4 страницы)     | **pass** | email-форма имеет 3 input + 1 select; templates рендерится но без строк (demo-tenant empty); deliveries и DLQ — таблицы. Edit-модал не открыт (нет строк) — это data-state, не баг |
| G | Webhooks admin                       | **pass** | таблица webhooks + фильтр-Combobox открывается, опции присутствуют, выбор stepik отрабатывает |
| H | Plagiarism corpus                    | **pass** | `/admin/plagiarism-corpus` рендерится, кнопка `Перестроить индекс` присутствует и не disabled |
| I | Plagiarism trigger (teacher)         | partial  | demo-курс `knad-cpp-24-25` имеет 10 контестов, но контесты содержат **0 заданий** → нет assignment-link, поэтому до `/assignments/:id/plagiarism` не дошли. Кнопка «Запустить новую проверку» проверена косвенно через код страницы — но не кликнута, т.к. assignmentId не получен |

> **Все partial — это пустые demo-данные, а не баги UI**. Все страницы открываются, формы есть, кнопки на месте.

## Сценарий A: Integration wizard — pass

```
URL: /integrations → клик «Мастер настройки» → /integrations/wizard
Step 1 (источник): {stepik:ok, yandex_contest:ok, manual:ok}  — все 3 кликабельны
Step 2 (имя):      input[data-testid="import-display-name"] заполнен "Smoke test {ts}"
Step 3 (курс):     рендерится опция «Без привязки к курсу»
Step 4 (запуск):   primary [data-testid="import-wizard-run"]  visible=true disabled=false
Cancel:            [data-testid="import-wizard-back"] → URL вернулся на /integrations
```

Скрины: `A-01-integrations-list.png` … `A-06-after-cancel.png`

## Сценарий B: Integration detail — partial (нет данных)

`/integrations` под admin (тенант `system`) показывает пустой list — у этого
тенанта ни одной интеграции в seed-данных. Сама страница рендерится корректно
(см. `A-01-integrations-list.png` — empty-state с заголовком и подсказкой), но
detail-page открыть не из чего.

> Поднимать integration-detail проверять придётся вручную после того, как
> teacher-тенант `hse-fkn` подключит первую интеграцию — на текущем seed это
> ничем не проверить.

## Сценарий C: Provider setup pages — pass

| Провайдер        | inputs | selects | Primary CTA |
|------------------|--------|---------|-------------|
| yandex-contest   | 1      | 2       | `Подключить` |
| stepik           | 1      | 2       | `Подключить` |
| ejudge           | 4      | 2       | `Сохранить`  |

(в селекты входят header-search `⌘K` и user-avatar dropdown, по сути на форму
приходится 1 select на курс + поля провайдера)

Скрины: `C-yandex-contest.png`, `C-stepik.png`, `C-ejudge.png`

## Сценарий D: OAuth callback (error states) — pass

```
/integrations/oauth/callback                          → "Параметры code/state отсутствуют" (error-card) ✓
/integrations/oauth/callback?code=test&state=invalid  → backend ответит ошибкой, frontend рендерит error-card ✓
/integrations/oauth/callback?error=access_denied      → "Yandex отказал в авторизации" ✓
```

Все три варианта:
- crash=false (нет 500, нет ErrorBoundary)
- hasError=true (в DOM найден текст «отказ / ошибк / параметр» etc.)
- hasRetry=true (есть кнопка «Попробовать заново / Подключить»)

Скрины: `D-empty.png`, `D-invalid.png`, `D-denied.png`.

## Сценарий E: LLM admin pages — partial

| URL                            | crash | h1                 | bodyLen |
|--------------------------------|-------|--------------------|---------|
| `/admin/ai/providers`          | no    | LLM provider       | 364     |
| `/admin/ai/budgets`            | no    | LLM budgets        | 371     |
| `/admin/ai/cache`              | no    | LLM cache          | 350     |
| `/admin/ai/prompt-versions`    | no    | Prompt versions    | 235     |

Все четыре рендерятся, не падают. **Но** в demo-тенанте `system` ни одного
провайдера не настроено → empty-state «Провайдеры не настроены» → кнопка `Edit`
не появляется (`editAvail=0`) → модал-edit не проверен.

См. `E-providers.png` (empty state) и `E-budgets.png` / `E-cache.png` /
`E-prompt-versions.png` (рендерятся, но без данных).

### Найденная проблема (низкий приоритет)

`useProviders()` (`frontend/src/hooks/api/useAi.ts:77`) выдаёт react-query
warning:

```
Query data cannot be undefined. Please make sure to return a value
other than undefined from your query function. Affected query key:
["ai","providers"]
```

Это значит, что `aiApi.listProviders()` где-то возвращает `undefined` вместо
`[]` / `{data: []}`. На UI это не падение (page рендерит empty-state), но
react-query не любит undefined-данные и в strict-режиме может бросить exception
при следующем обновлении. **Не критичный, но стоит починить** — обернуть в
`(await ...) ?? { data: [] }` или явный default в queryFn.

## Сценарий F: Notifications admin — pass

| URL                                     | crash | h1                    | bodyLen |
|-----------------------------------------|-------|-----------------------|---------|
| `/admin/notifications/email`            | no    | Email-конфиг          | 276     |
| `/admin/notifications/templates`        | no    | Шаблоны уведомлений   | 249     |
| `/admin/notifications/deliveries`       | no    | Доставки              | 3057    |
| `/admin/notifications/dlq`              | no    | Notifications DLQ     | 230     |

Email-форма имеет 3 inputs + 1 select. Templates показывает empty-state
«Шаблонов нет» — нет данных в demo-tenant, поэтому Edit-button нет (modal не
проверен — нечего открывать).

> **Замечание**: на странице templates **нет CTA «Создать шаблон»** —
> templates создаются только бэкендом / миграциями, в UI только Edit. То же
> верно для webhooks page (это лог приходящих событий, а не CRUD).

Скрины: `F-email.png`, `F-templates.png`, `F-deliveries.png`, `F-dlq.png`.

## Сценарий G: Webhooks admin — pass

`/admin/integrations/webhooks` — лог входящих webhook-событий. Фильтр-комбобокс
(provider kind) открывается, опции `stepik / yandex_contest / plagiarism / llm /
telegram` доступны, выбор `stepik` срабатывает (refetch с фильтром).

> **На странице нет CTA «Добавить webhook»** — это лог-страница, не CRUD;
> создание webhook-endpoint'ов делается через subscription API (отдельная админ-
> поверхность, не обнаружена в текущем routes/index.tsx).

Скрины: `G-01-webhooks-list.png`, `G-02-webhooks-filter.png`,
`G-03-webhooks-filtered.png`.

## Сценарий H: Plagiarism corpus — pass

`/admin/plagiarism-corpus` рендерится, primary-кнопка
`[data-testid="plagiarism-corpus-rebuild"]` присутствует, не disabled.
**Не кликнута** (запустит реальную задачу пересборки corpus).

Скрин: `H-01-corpus.png`.

## Сценарий I: Plagiarism trigger (teacher) — partial

Под teacher-аккаунтом `gordenko.mk@edu.hse.ru`:

1. `/courses` → нашли курс `knad-cpp-24-25`
2. `/courses/knad-cpp-24-25` рендерится корректно — 10 контестов (Контест 1…10)
3. **Но**: каждый контест показывает «Дедлайн … · 0 заданий» → в этих
   контестах **0 опубликованных assignment'ов** → нет ссылки
   `/assignments/:id` для перехода → не дошли до `assignment-tab-plagiarism-start`
   и до `/assignments/:id/plagiarism`.

Не баг UI — это пустое состояние seed-данных, такая же ситуация была отмечена
в `route-audit.md` (демо-аккаунты не имеют публичных assignments).

Сами кнопки запуска проверки и модал параметров (`[data-testid="plagiarism-
run-create-open"]`, `[data-testid="plagiarism-run-create-modal"]`,
`[data-testid="plagiarism-run-create-submit"]`) присутствуют в коде
(`frontend/src/pages/plagiarism/PlagiarismRunsListPage.tsx:188-217`), но
проверить интерактивно не на чем.

Скрины: `I-01-courses.png`, `I-02-course-detail.png`.

## Console / network ошибки

После фильтрации известного noise (HMR-WebSocket `ERR_CONNECTION_REFUSED`,
фоновые 401 на `/auth/refresh`, fonts/svg/png):

```
console.error: 2   — оба про ["ai","providers"] returning undefined (см. сценарий E)
PAGEERROR:     0
HTTP 4xx/5xx:  0
```

Расширенный noise-фильтр в `frontend/scripts/integration-smoke.cjs` (по
сравнению с route-audit.cjs):
```js
/net::ERR_CONNECTION_REFUSED/,           // HMR ws (bare error text)
/Failed to load resource.*status of 401/i,  // /auth/refresh без URL в console
```

## Артефакты

- **Скрипт:** `frontend/scripts/integration-smoke.cjs`
- **Скрины:** `frontend/scripts/integration-smoke/{scenario}-{slug}.png` (26 шт.)
- **Машинный отчёт:** `frontend/scripts/integration-smoke/_smoke.json` —
  массив `scenarios[]` со статусами + `issues[]` (после фильтра шума)
- **Запуск:**
  ```
  docker exec plaglens-frontend-dev sh -c '
    rm -rf /tmp/integration-smoke && mkdir -p /tmp/integration-smoke &&
    node /app/scripts/integration-smoke.cjs
  '
  docker cp plaglens-frontend-dev:/tmp/integration-smoke/. \
    frontend/scripts/integration-smoke/
  ```

## Итоговая sanity-метрика

```
scenarios:  9
  pass:     6   (A, C, D, F, G, H)
  partial:  3   (B, E, I — все из-за пустых seed-данных, не баги)
  fail:     0
issues:     2   (одна и та же react-query warning на useProviders)
broken:     0   страниц
```
