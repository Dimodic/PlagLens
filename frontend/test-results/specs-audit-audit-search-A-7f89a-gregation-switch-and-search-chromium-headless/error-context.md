# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: specs\audit\audit-search.spec.ts >> Audit — search >> toggle aggregation switch and search
- Location: e2e\specs\audit\audit-search.spec.ts:23:3

# Error details

```
TimeoutError: locator.click: Timeout 10000ms exceeded.
Call log:
  - waiting for getByTestId('audit-search-agg-toggle')
    - locator resolved to <input checked role="switch" type="checkbox" data-checked="true" id="mantine-x6cy8t6zx" data-testid="audit-search-agg-toggle" class="m_926b4011 mantine-Switch-input"/>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is not stable
    - retrying click action
    - waiting 20ms
    - waiting for element to be visible, enabled and stable
    - element is not stable
  2 × retrying click action
      - waiting 100ms
      - waiting for element to be visible, enabled and stable
      - element is not visible
  18 × retrying click action
       - waiting 500ms
       - waiting for element to be visible, enabled and stable
       - element is not visible
  - retrying click action
    - waiting 500ms

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - complementary [ref=e4]:
    - generic [ref=e5]:
      - link "PlagLens" [ref=e6] [cursor=pointer]:
        - /url: /
        - img [ref=e8]
      - generic [ref=e11]:
        - generic [ref=e12]: PlagLens
        - generic [ref=e13]: консоль админа
      - button "Свернуть" [ref=e14] [cursor=pointer]:
        - img [ref=e15]
    - generic [ref=e18]:
      - img [ref=e20]
      - generic [ref=e23]: Поиск заданий, студентов, посылок…
      - generic [ref=e24]: ⌘K
    - generic [ref=e25]:
      - generic [ref=e26]:
        - generic [ref=e27]: Учреждение
        - generic [ref=e28]:
          - link "Обзор" [ref=e29] [cursor=pointer]:
            - /url: /admin/overview
            - img [ref=e31]
            - generic [ref=e36]: Обзор
          - link "Пользователи" [ref=e37] [cursor=pointer]:
            - /url: /admin/users
            - img [ref=e39]
            - generic [ref=e41]: Пользователи
          - link "Журнал" [ref=e42] [cursor=pointer]:
            - /url: /admin/audit
            - img [ref=e44]
            - generic [ref=e46]: Журнал
      - generic [ref=e47]:
        - generic [ref=e48]: Система
        - generic [ref=e49]:
          - link "Интеграции" [ref=e50] [cursor=pointer]:
            - /url: /admin/integrations
            - img [ref=e52]
            - generic [ref=e56]: Интеграции
          - link "Настройки учреждения" [ref=e57] [cursor=pointer]:
            - /url: /admin/system/settings
            - img [ref=e59]
            - generic [ref=e61]: Настройки учреждения
    - button "АД Админ Демов Администратор" [ref=e63] [cursor=pointer]:
      - generic [ref=e64]: АД
      - generic [ref=e65]:
        - generic [ref=e66]: Админ Демов
        - generic [ref=e67]: Администратор
      - img [ref=e69]
  - main [ref=e71]:
    - generic [ref=e72]:
      - generic [ref=e73]: Журнал событий
      - generic [ref=e74]:
        - button "EN" [ref=e75] [cursor=pointer]
        - button "RU" [ref=e76] [cursor=pointer]
      - button "Переключить тему" [ref=e77] [cursor=pointer]:
        - img [ref=e78]
      - button [ref=e84]
    - generic [ref=e86]:
      - heading "Audit search" [level=1] [ref=e89]
      - generic [ref=e93]:
        - generic [ref=e94]:
          - generic [ref=e95]: Текст запроса (q)
          - textbox "Текст запроса (q)" [ref=e97]
        - generic [ref=e98]:
          - generic [ref=e99]: actor_id
          - textbox "actor_id" [ref=e101]
        - generic [ref=e103]:
          - 'switch "Aggregation: count by action" [checked]'
          - generic [ref=e108]: "Aggregation: count by action"
        - button "Искать" [ref=e110] [cursor=pointer]:
          - generic [ref=e112]: Искать
```

# Test source

```ts
  1  | /**
  2  |  * /admin/audit/search — POST search with text query, filters and aggregations.
  3  |  */
  4  | import { test, expect } from '../../setup/fixtures';
  5  | import { AuditSearchPo } from '../../pages/admin/AuditPage.po';
  6  | 
  7  | test.describe('Audit — search', () => {
  8  |   test('admin opens audit search page', async ({ adminPage }) => {
  9  |     const po = new AuditSearchPo(adminPage);
  10 |     await po.goto();
  11 |     await expect(adminPage.getByText('Audit search').first()).toBeVisible();
  12 |     await expect(po.qInput).toBeVisible();
  13 |   });
  14 | 
  15 |   test('submit with empty query renders without crash', async ({ adminPage }) => {
  16 |     const po = new AuditSearchPo(adminPage);
  17 |     await po.goto();
  18 |     await po.submit.click();
  19 |     // No exception; either aggregations or no rows.
  20 |     await adminPage.waitForLoadState('networkidle').catch(() => {});
  21 |   });
  22 | 
  23 |   test('toggle aggregation switch and search', async ({ adminPage }) => {
  24 |     const po = new AuditSearchPo(adminPage);
  25 |     await po.goto();
  26 |     // Toggle is enabled by default; click to flip off then on
> 27 |     await po.aggToggle.click();
     |                        ^ TimeoutError: locator.click: Timeout 10000ms exceeded.
  28 |     await po.aggToggle.click();
  29 |     await po.submit.click();
  30 |     // Either aggregations card shows or no data — both fine.
  31 |     await adminPage.waitForLoadState('networkidle').catch(() => {});
  32 |   });
  33 | 
  34 |   test('with q text and aggregation enabled, page handles result', async ({ adminPage }) => {
  35 |     const po = new AuditSearchPo(adminPage);
  36 |     await po.goto();
  37 |     await po.qInput.fill('login');
  38 |     await po.submit.click();
  39 |     // After loading, we expect either an event card, an aggregations card, or no error alert.
  40 |     await adminPage.waitForLoadState('networkidle').catch(() => {});
  41 |     // Aggregations card is present iff the API returned aggregations.
  42 |     const aggVisible = await po.aggregationsCard.isVisible().catch(() => false);
  43 |     if (aggVisible) {
  44 |       // Bar chart bars must render (testid bar-{key}).
  45 |       const bars = adminPage.locator('[data-testid^="bar-"]');
  46 |       await expect(bars.first()).toBeVisible({ timeout: 5_000 });
  47 |     }
  48 |   });
  49 | });
  50 | 
```