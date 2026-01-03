# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: specs\plagiarism\plagiarism-student3-detected.spec.ts >> Plagiarism / student3 detection — mocked >> teacher opens lab-1-sort, opens the high-similarity pair, sees fragments
- Location: e2e\specs\plagiarism\plagiarism-student3-detected.spec.ts:27:3

# Error details

```
TimeoutError: page.waitForURL: Timeout 15000ms exceeded.
=========================== logs ===========================
waiting for navigation until "load"
============================================================
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - complementary [ref=e4]:
    - generic [ref=e5]:
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
        - generic [ref=e18]:
          - img [ref=e20]
          - text: Сравнение AST + текста + метрик
        - generic [ref=e22]:
          - img [ref=e24]
          - text: LLM-помощник для разбора находок
        - generic [ref=e26]:
          - img [ref=e28]
          - text: Аудиторский журнал и SSO для вуза
    - generic [ref=e30]:
      - generic [ref=e31]: © 2026 PlagLens
      - generic [ref=e33]: Соглашение
      - generic [ref=e34]: Конфиденциальность
      - generic [ref=e35]: Поддержка
  - generic [ref=e36]:
    - generic [ref=e38]:
      - generic [ref=e39]: EN
      - generic [ref=e40]: RU
    - generic [ref=e41]:
      - generic [ref=e42]: Войдите в кабинет
      - generic [ref=e43]: Используйте университетский SSO или e-mail.
      - button "Войти через SSO HSE" [ref=e44] [cursor=pointer]:
        - img [ref=e45]
        - text: Войти через SSO HSE
      - generic [ref=e50]:
        - button "Google" [ref=e51] [cursor=pointer]
        - button "Яндекс" [ref=e52] [cursor=pointer]
        - button "GitHub" [ref=e53] [cursor=pointer]
      - generic [ref=e54]: или e-mail
      - generic [ref=e57]:
        - generic [ref=e58]: АДРЕС ПОЧТЫ
        - textbox "АДРЕС ПОЧТЫ" [disabled] [ref=e59]:
          - /placeholder: you@hse.ru
          - text: teacher@demo.local
        - generic [ref=e60]: ПАРОЛЬ
        - textbox "ПАРОЛЬ" [disabled] [ref=e61]:
          - /placeholder: ••••••••
          - text: teacher
        - generic [ref=e62]: ОРГАНИЗАЦИЯ
        - textbox "ОРГАНИЗАЦИЯ" [disabled] [ref=e63]:
          - /placeholder: hse
          - text: demo-hse
        - generic [ref=e64]: Если в тенанте есть омонимы — укажите slug.
        - generic [ref=e65]: Код 2FA
        - textbox "Код 2FA" [active] [ref=e66]:
          - /placeholder: "123456"
        - generic [ref=e67]:
          - generic [ref=e68] [cursor=pointer]:
            - checkbox "Запомнить меня" [checked] [ref=e69]
            - text: Запомнить меня
          - link "Забыли пароль?" [ref=e70] [cursor=pointer]:
            - /url: /auth/forgot
        - button "Подтвердить" [ref=e71] [cursor=pointer]
        - generic [ref=e72]:
          - text: Нет аккаунта?
          - link "Зарегистрироваться" [ref=e73] [cursor=pointer]:
            - /url: /register
      - generic [ref=e74]:
        - generic [ref=e75]:
          - generic [ref=e76]: ДЕМО-АККАУНТЫ
          - link [ref=e77] [cursor=pointer]:
            - /url: /demo
            - text: demo
        - generic [ref=e78]:
          - button "АП Анна Поливанова Преподаватель · CS-204 · teacher@demo.local" [ref=e79] [cursor=pointer]:
            - generic [ref=e80]: АП
            - generic [ref=e81]:
              - generic [ref=e82]: Анна Поливанова
              - generic [ref=e83]: Преподаватель · CS-204 · teacher@demo.local
          - button "АИ Алексеев Иван Студент · БПИ-211 · student1@demo.local" [ref=e85] [cursor=pointer]:
            - generic [ref=e86]: АИ
            - generic [ref=e87]:
              - generic [ref=e88]: Алексеев Иван
              - generic [ref=e89]: Студент · БПИ-211 · student1@demo.local
          - button "СА Системный админ Администратор учреждения · admin@demo.local" [ref=e91] [cursor=pointer]:
            - generic [ref=e92]: СА
            - generic [ref=e93]:
              - generic [ref=e94]: Системный админ
              - generic [ref=e95]: Администратор учреждения · admin@demo.local
        - generic [ref=e97]: Двойной клик по аккаунту — мгновенный вход.
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
> 57  |   await page.waitForURL((url) => !url.pathname.startsWith('/login'), {
      |              ^ TimeoutError: page.waitForURL: Timeout 15000ms exceeded.
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
  75  |     await ctx.close();
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