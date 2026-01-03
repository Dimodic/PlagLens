# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: specs\smoke\_spa-loads.spec.ts >> @smoke SPA bootstraps >> navigates to / and renders without console errors
- Location: e2e\specs\smoke\_spa-loads.spec.ts:13:3

# Error details

```
Error: Unexpected console errors:
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
  1  | /**
  2  |  * Smoke: SPA loads cleanly.
  3  |  *
  4  |  * Verifies:
  5  |  *   - Frontend dev server is reachable.
  6  |  *   - Initial render produces a non-empty document.
  7  |  *   - No critical console errors during the first navigation.
  8  |  *   - No failed network requests (4xx/5xx) for non-auth endpoints.
  9  |  */
  10 | import { test, expect } from '@playwright/test';
  11 | 
  12 | test.describe('@smoke SPA bootstraps', () => {
  13 |   test('navigates to / and renders without console errors', async ({ page }) => {
  14 |     const consoleErrors: string[] = [];
  15 |     const failedRequests: string[] = [];
  16 | 
  17 |     page.on('console', (msg) => {
  18 |       if (msg.type() === 'error') consoleErrors.push(msg.text());
  19 |     });
  20 | 
  21 |     page.on('requestfailed', (req) => {
  22 |       // Ignore 401 from /auth/refresh (anonymous bootstrap).
  23 |       const url = req.url();
  24 |       if (url.includes('/auth/refresh')) return;
  25 |       failedRequests.push(`${req.method()} ${url} — ${req.failure()?.errorText ?? 'unknown'}`);
  26 |     });
  27 | 
  28 |     await page.goto('/');
  29 |     await page.waitForLoadState('networkidle');
  30 | 
  31 |     // Anonymous user should be redirected to /login.
  32 |     await expect(page).toHaveURL(/\/login/);
  33 | 
  34 |     // Page has rendered something (logo, title, form).
  35 |     await expect(page.locator('body')).not.toBeEmpty();
  36 | 
  37 |     // No critical console errors. Hot-reload + favicon noise is filtered.
  38 |     // 429 from /auth/refresh is OK — it's rate-limiting an expected anonymous bootstrap.
  39 |     const ignored = [/HMR/i, /favicon/i, /DevTools/i, /chunk/i, /\.tsx\?/i, /429/, /auth\/refresh/];
  40 |     const significant = consoleErrors.filter((e) => !ignored.some((re) => re.test(e)));
> 41 |     expect(significant, `Unexpected console errors:\n${significant.join('\n')}`).toEqual([]);
     |                                                                                  ^ Error: Unexpected console errors:
  42 | 
  43 |     // No failed network requests.
  44 |     expect(failedRequests, `Failed network requests:\n${failedRequests.join('\n')}`).toEqual([]);
  45 |   });
  46 | 
  47 |   test('responds to direct navigation to /login', async ({ page }) => {
  48 |     const resp = await page.goto('/login');
  49 |     expect(resp?.status()).toBeLessThan(400);
  50 |     await expect(page).toHaveURL(/\/login/);
  51 |     await expect(page.getByTestId('login-submit')).toBeVisible();
  52 |   });
  53 | 
  54 |   test('responds to direct navigation to /demo', async ({ page }) => {
  55 |     await page.goto('/demo');
  56 |     await expect(page).toHaveURL(/\/demo/);
  57 |     // 7 demo cards should be present.
  58 |     const roles = ['admin', 'teacher', 'assistant', 'student1', 'student2', 'student3', 'student4'];
  59 |     for (const role of roles) {
  60 |       await expect(page.getByTestId(`demo-card-${role}`)).toBeVisible();
  61 |     }
  62 |   });
  63 | });
  64 | 
```