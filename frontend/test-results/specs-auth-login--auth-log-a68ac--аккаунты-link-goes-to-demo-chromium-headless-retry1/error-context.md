# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: specs\auth\login.spec.ts >> @auth login form >> "Демо-аккаунты" link goes to /demo
- Location: e2e\specs\auth\login.spec.ts:101:3

# Error details

```
TimeoutError: locator.click: Timeout 10000ms exceeded.
Call log:
  - waiting for getByTestId('login-demo-link')
    - locator resolved to <a href="/demo" tabindex="-1" aria-hidden="true" data-testid="login-demo-link">demo</a>
  - attempting click action
    - waiting for element to be visible, enabled and stable
    - element is visible, enabled and stable
    - scrolling into view if needed
    - done scrolling
    - <div>ДЕМО-АККАУНТЫ</div> intercepts pointer events
  - retrying click action
    - waiting for element to be visible, enabled and stable
    - element is visible, enabled and stable
    - scrolling into view if needed
    - done scrolling
    - element is outside of the viewport
  - retrying click action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <div>ДЕМО-АККАУНТЫ</div> intercepts pointer events
    - retrying click action
      - waiting 100ms
    4 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <div>ДЕМО-АККАУНТЫ</div> intercepts pointer events
    - retrying click action
      - waiting 500ms
      - waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - element is outside of the viewport
    - retrying click action
      - waiting 500ms
      - waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <div>ДЕМО-АККАУНТЫ</div> intercepts pointer events
    - retrying click action
      - waiting 500ms
      - waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <div>ДЕМО-АККАУНТЫ</div> intercepts pointer events
    - retrying click action
      - waiting 500ms
    - waiting for element to be visible, enabled and stable
    - element is visible, enabled and stable
    - scrolling into view if needed
    - done scrolling
    - <div>ДЕМО-АККАУНТЫ</div> intercepts pointer events
  - retrying click action
    - waiting 500ms
    - waiting for element to be visible, enabled and stable
    - element is visible, enabled and stable
    - scrolling into view if needed
    - done scrolling
    - element is outside of the viewport
  - retrying click action
    - waiting 500ms
    - waiting for element to be visible, enabled and stable
    - element is visible, enabled and stable
    - scrolling into view if needed
    - done scrolling
    - <div>ДЕМО-АККАУНТЫ</div> intercepts pointer events
  - retrying click action
    - waiting 500ms

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
        - textbox "АДРЕС ПОЧТЫ" [active] [ref=e59]:
          - /placeholder: you@hse.ru
        - generic [ref=e60]: ПАРОЛЬ
        - textbox "ПАРОЛЬ" [ref=e61]:
          - /placeholder: ••••••••
        - generic [ref=e62]: ОРГАНИЗАЦИЯ
        - textbox "ОРГАНИЗАЦИЯ" [ref=e63]:
          - /placeholder: hse
        - generic [ref=e64]: Если в тенанте есть омонимы — укажите slug.
        - generic [ref=e65]:
          - generic [ref=e66] [cursor=pointer]:
            - checkbox "Запомнить меня" [checked] [ref=e67]
            - text: Запомнить меня
          - link "Забыли пароль?" [ref=e68] [cursor=pointer]:
            - /url: /auth/forgot
        - button "Заполните поля выше" [ref=e69] [cursor=pointer]
        - generic [ref=e70]:
          - text: Нет аккаунта?
          - link "Зарегистрироваться" [ref=e71] [cursor=pointer]:
            - /url: /register
      - generic [ref=e72]:
        - generic [ref=e73]:
          - generic [ref=e74]: ДЕМО-АККАУНТЫ
          - link [ref=e75] [cursor=pointer]:
            - /url: /demo
            - text: demo
        - generic [ref=e76]:
          - button "АП Анна Поливанова Преподаватель · CS-204 · teacher@demo.local" [ref=e77] [cursor=pointer]:
            - generic [ref=e78]: АП
            - generic [ref=e79]:
              - generic [ref=e80]: Анна Поливанова
              - generic [ref=e81]: Преподаватель · CS-204 · teacher@demo.local
          - button "АИ Алексеев Иван Студент · БПИ-211 · student1@demo.local" [ref=e83] [cursor=pointer]:
            - generic [ref=e84]: АИ
            - generic [ref=e85]:
              - generic [ref=e86]: Алексеев Иван
              - generic [ref=e87]: Студент · БПИ-211 · student1@demo.local
          - button "СА Системный админ Администратор учреждения · admin@demo.local" [ref=e89] [cursor=pointer]:
            - generic [ref=e90]: СА
            - generic [ref=e91]:
              - generic [ref=e92]: Системный админ
              - generic [ref=e93]: Администратор учреждения · admin@demo.local
        - generic [ref=e95]: Двойной клик по аккаунту — мгновенный вход.
```

# Test source

```ts
  4   |  * Coverage:
  5   |  *   - happy path: email + password + tenant_slug → redirect to /
  6   |  *   - "next" query param honoured after success
  7   |  *   - empty form → client-side validation errors visible
  8   |  *   - bad email format blocks submission
  9   |  *   - wrong password → 401 INVALID_CREDENTIALS shown
  10  |  *   - missing tenant slug for ambiguous user → 422 VALIDATION_FAILED
  11  |  *   - back-link "Регистрация" navigates to /register
  12  |  *   - back-link "Демо-аккаунты" navigates to /demo
  13  |  *
  14  |  * Each test uses a fresh browser context to avoid leaking session state.
  15  |  */
  16  | import { test, expect } from '@playwright/test';
  17  | import { LoginPagePo } from '../../pages/LoginPage.po';
  18  | import { DEMO_USERS } from '../../helpers/api';
  19  | 
  20  | test.describe.configure({ mode: 'serial' });
  21  | 
  22  | test.describe('@auth login form', () => {
  23  |   test('logs in admin and redirects to home', async ({ page }) => {
  24  |     const lp = new LoginPagePo(page);
  25  |     await lp.goto();
  26  |     const c = DEMO_USERS.admin;
  27  |     await lp.fill({ email: c.email, password: c.password, tenantSlug: c.tenantSlug });
  28  |     await lp.submitAndExpectRedirect((url) => url.pathname === '/');
  29  |     await expect(page.getByTestId('header-user-menu-trigger')).toBeVisible();
  30  |   });
  31  | 
  32  |   test('honours ?next= query param after login', async ({ page }) => {
  33  |     const lp = new LoginPagePo(page);
  34  |     await lp.goto('/me/profile');
  35  |     const c = DEMO_USERS.admin;
  36  |     await lp.fill({ email: c.email, password: c.password, tenantSlug: c.tenantSlug });
  37  |     await lp.submitAndExpectRedirect((url) => url.pathname === '/me/profile');
  38  |   });
  39  | 
  40  |   test('shows client-side validation when email is empty', async ({ page }) => {
  41  |     const lp = new LoginPagePo(page);
  42  |     await lp.goto();
  43  |     await lp.submit.click();
  44  |     // Mantine validation error is rendered next to the field.
  45  |     await expect(page.getByText(/некорректный email/i)).toBeVisible();
  46  |   });
  47  | 
  48  |   test('rejects malformed email', async ({ page }) => {
  49  |     const lp = new LoginPagePo(page);
  50  |     await lp.goto();
  51  |     await lp.email.fill('not-an-email');
  52  |     await lp.password.fill('whatever');
  53  |     await lp.submit.click();
  54  |     await expect(page.getByText(/некорректный email/i)).toBeVisible();
  55  |   });
  56  | 
  57  |   test('rejects wrong password with 401 INVALID_CREDENTIALS', async ({ page }) => {
  58  |     const lp = new LoginPagePo(page);
  59  |     await lp.goto();
  60  |     await lp.fill({
  61  |       email: DEMO_USERS.admin.email,
  62  |       password: 'definitely-wrong-password',
  63  |       tenantSlug: DEMO_USERS.admin.tenantSlug,
  64  |     });
  65  |     const respPromise = page.waitForResponse(
  66  |       (r) => r.url().includes('/auth/login') && r.request().method() === 'POST',
  67  |     );
  68  |     await lp.submit.click();
  69  |     const resp = await respPromise;
  70  |     if (resp.status() === 429) test.skip(true, 'Rate limited; rerun');
  71  |     expect([400, 401]).toContain(resp.status());
  72  |     // Stay on /login.
  73  |     await expect(page).toHaveURL(/\/login/);
  74  |     // Problem alert visible.
  75  |     await expect(page.getByRole('alert').first()).toBeVisible();
  76  |   });
  77  | 
  78  |   test('login without tenant_slug for demo user → 422 validation', async ({ page }) => {
  79  |     const lp = new LoginPagePo(page);
  80  |     await lp.goto();
  81  |     // Intentionally omit tenant slug.
  82  |     await lp.email.fill(DEMO_USERS.admin.email);
  83  |     await lp.password.fill(DEMO_USERS.admin.password);
  84  |     const respPromise = page.waitForResponse(
  85  |       (r) => r.url().includes('/auth/login') && r.request().method() === 'POST',
  86  |     );
  87  |     await lp.submit.click();
  88  |     const resp = await respPromise;
  89  |     if (resp.status() === 429) test.skip(true, 'Rate limited; rerun');
  90  |     expect([400, 422]).toContain(resp.status());
  91  |     await expect(page).toHaveURL(/\/login/);
  92  |   });
  93  | 
  94  |   test('"Регистрация" link goes to /register', async ({ page }) => {
  95  |     const lp = new LoginPagePo(page);
  96  |     await lp.goto();
  97  |     await lp.registerLink.click();
  98  |     await expect(page).toHaveURL(/\/register/);
  99  |   });
  100 | 
  101 |   test('"Демо-аккаунты" link goes to /demo', async ({ page }) => {
  102 |     const lp = new LoginPagePo(page);
  103 |     await lp.goto();
> 104 |     await lp.demoLink.click();
      |                       ^ TimeoutError: locator.click: Timeout 10000ms exceeded.
  105 |     await expect(page).toHaveURL(/\/demo/);
  106 |   });
  107 | 
  108 |   test('"Забыли пароль?" link goes to /auth/forgot', async ({ page }) => {
  109 |     const lp = new LoginPagePo(page);
  110 |     await lp.goto();
  111 |     await lp.forgotLink.click();
  112 |     await expect(page).toHaveURL(/\/auth\/forgot/);
  113 |   });
  114 | });
  115 | 
```