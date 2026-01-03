# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: specs\smoke\_routes-render.spec.ts >> @smoke public routes >> renders /register
- Location: e2e\specs\smoke\_routes-render.spec.ts:80:5

# Error details

```
Error: Console errors on /register:
Failed to load resource: the server responded with a status of 401 (Unauthorized)

expect(received).toEqual(expected) // deep equality

- Expected  - 1
+ Received  + 3

- Array []
+ Array [
+   "Failed to load resource: the server responded with a status of 401 (Unauthorized)",
+ ]
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - complementary [ref=e4]:
    - link "PlagLens проверка кода для академии" [ref=e5] [cursor=pointer]:
      - /url: /login
      - img [ref=e7]
      - generic [ref=e10]:
        - generic [ref=e11]: PlagLens
        - generic [ref=e12]: проверка кода для академии
    - generic [ref=e13]:
      - generic [ref=e14]:
        - text: Возьмите проверки
        - emphasis [ref=e15]: под контроль
        - text: — и верните себе вечера.
      - paragraph [ref=e16]: PlagLens автоматически собирает посылки из LMS и Git, ищет совпадения между студентами и историями курса, и помогает преподавателю принять обоснованное решение — без ночных эксельных таблиц.
    - generic [ref=e17]:
      - generic [ref=e18]: © 2026 PlagLens
      - generic [ref=e20]: Соглашение
      - generic [ref=e21]: Конфиденциальность
      - generic [ref=e22]: Поддержка
  - generic [ref=e23]:
    - generic [ref=e25]:
      - generic [ref=e26]: EN
      - generic [ref=e27]: RU
    - generic [ref=e28]:
      - generic [ref=e29]: Создайте аккаунт
      - generic [ref=e30]: Запросите доступ к кабинету PlagLens — мы пришлём ссылку для подтверждения.
      - generic [ref=e31]:
        - generic [ref=e32]: E-MAIL
        - textbox "E-MAIL" [ref=e33]:
          - /placeholder: you@hse.ru
        - generic [ref=e34]: ИМЯ
        - textbox "ИМЯ" [ref=e35]
        - generic [ref=e36]: ОРГАНИЗАЦИЯ (SLUG)
        - textbox "ОРГАНИЗАЦИЯ (SLUG)" [ref=e37]:
          - /placeholder: hse
        - generic [ref=e38]: Slug вашего учебного заведения
        - generic [ref=e39]: ПАРОЛЬ
        - textbox "ПАРОЛЬ" [ref=e40]
        - generic [ref=e41]: КОД ПРИГЛАШЕНИЯ
        - textbox "КОД ПРИГЛАШЕНИЯ" [ref=e42]
        - generic [ref=e43]: Если у вас есть код от преподавателя — введите его
        - button "Создать аккаунт" [ref=e44] [cursor=pointer]
        - generic [ref=e45]:
          - text: Уже есть аккаунт?
          - link "Войти" [ref=e46] [cursor=pointer]:
            - /url: /login
```

# Test source

```ts
  1   | /**
  2   |  * Smoke: every public + protected route renders without 500/404.
  3   |  *
  4   |  * For protected routes we sign in as super_admin (most permissive) so that
  5   |  * RoleGuard does not redirect us to a 404 placeholder.
  6   |  *
  7   |  * A route is OK if:
  8   |  *   - It's a known SPA route (always 200 from the dev server, even for /404).
  9   |  *   - The body is not empty.
  10  |  *   - There were no uncaught console errors during navigation.
  11  |  */
  12  | import { test as base, expect, type Page } from '@playwright/test';
  13  | import { DEMO_USERS } from '../../helpers/api';
  14  | 
  15  | const PUBLIC_ROUTES = [
  16  |   '/login',
  17  |   '/register',
  18  |   '/auth/forgot',
  19  |   '/demo',
  20  | ];
  21  | 
  22  | // Routes that are protected but should be reachable as super_admin.
  23  | const PROTECTED_ROUTES = [
  24  |   '/',
  25  |   '/me',
  26  |   '/me/profile',
  27  |   '/me/security',
  28  |   '/me/api-keys',
  29  |   '/me/external-bindings',
  30  |   '/me/submissions',
  31  |   '/me/2fa',
  32  |   '/me/notifications/preferences',
  33  |   '/courses',
  34  |   '/grading',
  35  |   '/reports',
  36  |   '/notifications',
  37  |   '/admin',
  38  |   '/admin/overview',
  39  |   '/admin/users',
  40  |   '/admin/tenants',
  41  |   '/admin/integrations',
  42  |   '/admin/integrations/webhooks',
  43  |   '/admin/notifications/email',
  44  |   '/admin/notifications/templates',
  45  |   '/admin/notifications/deliveries',
  46  |   '/admin/notifications/dlq',
  47  |   '/admin/audit',
  48  |   '/admin/audit/search',
  49  |   '/admin/audit/access-denied',
  50  |   '/admin/audit/retention',
  51  |   '/admin/audit/legal-holds',
  52  |   '/admin/roles',
  53  |   '/admin/system/health',
  54  |   '/admin/system/settings',
  55  |   '/admin/plagiarism-corpus',
  56  |   '/admin/ai/prompt-versions',
  57  |   '/admin/ai/providers',
  58  |   '/admin/ai/budgets',
  59  |   '/admin/ai/cache',
  60  | ];
  61  | 
  62  | const test = base.extend<{ authedPage: Page }>({
  63  |   authedPage: async ({ browser }, use) => {
  64  |     const ctx = await browser.newContext();
  65  |     const page = await ctx.newPage();
  66  |     const c = DEMO_USERS.super_admin;
  67  |     await page.goto('/login');
  68  |     await page.locator('[data-testid="login-email"] input').fill(c.email);
  69  |     await page.locator('[data-testid="login-password"] input').fill(c.password);
  70  |     await page.locator('[data-testid="login-tenant-slug"] input').fill(c.tenantSlug);
  71  |     await page.getByTestId('login-submit').click();
  72  |     await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 });
  73  |     await use(page);
  74  |     await ctx.close();
  75  |   },
  76  | });
  77  | 
  78  | test.describe('@smoke public routes', () => {
  79  |   for (const route of PUBLIC_ROUTES) {
  80  |     test(`renders ${route}`, async ({ page }) => {
  81  |       const errors: string[] = [];
  82  |       page.on('console', (m) => {
  83  |         if (m.type() === 'error') errors.push(m.text());
  84  |       });
  85  |       const resp = await page.goto(route);
  86  |       expect(resp?.status()).toBeLessThan(500);
  87  |       await expect(page.locator('body')).not.toBeEmpty();
  88  |       const ignored = [/HMR/i, /favicon/i, /DevTools/i, /chunk/i, /Mantine.*Provider/i, /\.tsx\?/i];
  89  |       const significant = errors.filter((e) => !ignored.some((re) => re.test(e)));
> 90  |       expect(significant, `Console errors on ${route}:\n${significant.join('\n')}`).toEqual([]);
      |                                                                                     ^ Error: Console errors on /register:
  91  |     });
  92  |   }
  93  | });
  94  | 
  95  | test.describe('@smoke protected routes (super_admin)', () => {
  96  |   for (const route of PROTECTED_ROUTES) {
  97  |     test(`renders ${route}`, async ({ authedPage }) => {
  98  |       const errors: string[] = [];
  99  |       authedPage.on('console', (m) => {
  100 |         if (m.type() === 'error') errors.push(m.text());
  101 |       });
  102 |       await authedPage.goto(route);
  103 |       // Wait for SPA route transition; tolerate slow API panels.
  104 |       await authedPage.waitForLoadState('domcontentloaded');
  105 |       await expect(authedPage.locator('body')).not.toBeEmpty();
  106 |       // Should not redirect us back to /login.
  107 |       await expect(authedPage).not.toHaveURL(/\/login/);
  108 |       const ignored = [
  109 |         /HMR/i,
  110 |         /favicon/i,
  111 |         /DevTools/i,
  112 |         /chunk/i,
  113 |         /Mantine.*Provider/i,
  114 |         /Failed to fetch/i, // backend-not-up panels — placeholders are OK
  115 |         /AxiosError/i,
  116 |         /404/i, // allow 404 from optional admin endpoints
  117 |         /403/i,
  118 |         /\.tsx\?/i,
  119 |         /useLayoutEffect/i,
  120 |         /react-router/i,
  121 |       ];
  122 |       const significant = errors.filter((e) => !ignored.some((re) => re.test(e)));
  123 |       expect(significant, `Console errors on ${route}:\n${significant.join('\n')}`).toEqual([]);
  124 |     });
  125 |   }
  126 | });
  127 | 
```