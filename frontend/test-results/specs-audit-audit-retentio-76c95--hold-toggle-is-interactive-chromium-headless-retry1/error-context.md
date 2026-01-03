# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: specs\audit\audit-retention-policy.spec.ts >> Audit — retention policy >> legal-hold toggle is interactive
- Location: e2e\specs\audit\audit-retention-policy.spec.ts:29:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator:  getByTestId('retention-legal-hold-toggle')
Expected: visible
Received: hidden
Timeout:  10000ms

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for getByTestId('retention-legal-hold-toggle')
    12 × locator resolved to <input role="switch" type="checkbox" id="mantine-bu5vx9f0p" class="m_926b4011 mantine-Switch-input" data-testid="retention-legal-hold-toggle"/>
       - unexpected value "hidden"

```

```
Error: apiRequestContext._wrapApiCall: ENOENT: no such file or directory, open 'C:\Projects\PlagLens\frontend\test-results\.playwright-artifacts-232\traces\7962ee6c0a9001dacace-958ee9bc8cb958dc482e-retry1.trace'
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
      - heading "Retention policy" [level=1] [ref=e89]
      - generic [ref=e92]:
        - generic [ref=e93]:
          - generic [ref=e94]: default_retention_days
          - paragraph [ref=e95]: Срок хранения обычных событий
          - generic [ref=e96]:
            - textbox "default_retention_days" [ref=e97]: "400"
            - generic [ref=e99]:
              - button [ref=e100] [cursor=pointer]:
                - img [ref=e101]
              - button [ref=e103] [cursor=pointer]:
                - img [ref=e104]
        - generic [ref=e106]:
          - generic [ref=e107]: long_retention_days
          - paragraph [ref=e108]: Срок для login/access-denied/data-export (e.g. 2555 = 7 лет)
          - generic [ref=e109]:
            - textbox "long_retention_days" [ref=e110]: "2555"
            - generic [ref=e112]:
              - button [ref=e113] [cursor=pointer]:
                - img [ref=e114]
              - button [ref=e116] [cursor=pointer]:
                - img [ref=e117]
        - generic [ref=e120]:
          - switch "legal_hold_active (тенант-уровень)"
          - generic [ref=e125]: legal_hold_active (тенант-уровень)
        - button "Сохранить" [ref=e127] [cursor=pointer]:
          - generic [ref=e129]: Сохранить
```

# Test source

```ts
  1   | /**
  2   |  * Custom Playwright fixtures.
  3   |  *
  4   |  * Usage:
  5   |  *   import { test, expect } from '../setup/fixtures';
  6   |  *   test('teacher can do X', async ({ teacherPage }) => { ... });
  7   |  *
  8   |  * Fixtures provided:
  9   |  *   apiClient    — pre-authed ApiClient (super_admin)
  10  |  *   adminPage    — Page logged in as admin@demo.local
  11  |  *   teacherPage  — Page logged in as teacher@demo.local
  12  |  *   studentPage  — Page logged in as student1@demo.local
  13  |  *   uniqueSlug   — random unique string (per-test)
  14  |  */
  15  | import { test as base, type Page } from '@playwright/test';
  16  | import { ApiClient, DEMO_USERS, type DemoRole } from '../helpers/api';
  17  | import { uniqueSlug } from '../helpers/factories';
  18  | 
  19  | interface CustomFixtures {
  20  |   apiClient: ApiClient;
  21  |   adminPage: Page;
  22  |   teacherPage: Page;
  23  |   assistantPage: Page;
  24  |   studentPage: Page;
  25  |   uniqueSlug: string;
  26  | }
  27  | 
  28  | /**
  29  |  * Drives the /login form via UI to populate session cookies, then returns
  30  |  * the page. We use the form path (not API) because the AuthProvider relies
  31  |  * on the bootstrap /auth/refresh + httpOnly refresh cookie set by the
  32  |  * server — driving the form is the cleanest way to reproduce that.
  33  |  */
  34  | async function loginPageAs(page: Page, role: DemoRole): Promise<void> {
  35  |   const c = DEMO_USERS[role];
  36  |   await page.goto('/login');
  37  |   // Wait for the form to mount.
  38  |   await page.waitForLoadState('domcontentloaded');
  39  |   // Mantine wraps inputs — match either the input directly or descend into the wrapper.
  40  |   const fillByTestId = async (testId: string, value: string) => {
  41  |     const input = page
  42  |       .locator(`[data-testid="${testId}"]`)
  43  |       .locator('input, textarea')
  44  |       .first();
  45  |     if ((await input.count()) > 0) {
  46  |       await input.fill(value);
  47  |     } else {
  48  |       await page.getByTestId(testId).fill(value);
  49  |     }
  50  |   };
  51  |   await fillByTestId('login-email', c.email);
  52  |   await fillByTestId('login-password', c.password);
  53  |   if (c.tenantSlug) {
  54  |     await fillByTestId('login-tenant-slug', c.tenantSlug);
  55  |   }
  56  |   await page.getByTestId('login-submit').click();
  57  |   await page.waitForURL((url) => !url.pathname.startsWith('/login'), {
  58  |     timeout: 15_000,
  59  |   });
  60  | }
  61  | 
  62  | export const test = base.extend<CustomFixtures>({
  63  |   apiClient: async ({}, use) => {
  64  |     const c = await ApiClient.create();
  65  |     await c.loginAs('super_admin');
  66  |     await use(c);
  67  |     await c.dispose();
  68  |   },
  69  | 
  70  |   adminPage: async ({ browser }, use) => {
  71  |     const ctx = await browser.newContext();
  72  |     const page = await ctx.newPage();
  73  |     await loginPageAs(page, 'admin');
  74  |     await use(page);
> 75  |     await ctx.close();
      |               ^ Error: apiRequestContext._wrapApiCall: ENOENT: no such file or directory, open 'C:\Projects\PlagLens\frontend\test-results\.playwright-artifacts-232\traces\7962ee6c0a9001dacace-958ee9bc8cb958dc482e-retry1.trace'
  76  |   },
  77  | 
  78  |   teacherPage: async ({ browser }, use) => {
  79  |     const ctx = await browser.newContext();
  80  |     const page = await ctx.newPage();
  81  |     await loginPageAs(page, 'teacher');
  82  |     await use(page);
  83  |     await ctx.close();
  84  |   },
  85  | 
  86  |   assistantPage: async ({ browser }, use) => {
  87  |     const ctx = await browser.newContext();
  88  |     const page = await ctx.newPage();
  89  |     await loginPageAs(page, 'assistant');
  90  |     await use(page);
  91  |     await ctx.close();
  92  |   },
  93  | 
  94  |   studentPage: async ({ browser }, use) => {
  95  |     const ctx = await browser.newContext();
  96  |     const page = await ctx.newPage();
  97  |     await loginPageAs(page, 'student1');
  98  |     await use(page);
  99  |     await ctx.close();
  100 |   },
  101 | 
  102 |   uniqueSlug: async ({}, use) => {
  103 |     await use(uniqueSlug());
  104 |   },
  105 | });
  106 | 
  107 | export { expect } from '@playwright/test';
  108 | 
```