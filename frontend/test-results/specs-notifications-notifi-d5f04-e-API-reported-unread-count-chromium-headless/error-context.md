# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: specs\notifications\notification-bell-counter-mocked.spec.ts >> Bell unread counter (mocked) >> badge shows the API-reported unread count
- Location: e2e\specs\notifications\notification-bell-counter-mocked.spec.ts:10:3

# Error details

```
Error: Timeout 10000ms exceeded while waiting on the predicate
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
        - generic [ref=e13]: кабинет студента
      - button "Свернуть" [ref=e14] [cursor=pointer]:
        - img [ref=e15]
    - generic [ref=e18]:
      - img [ref=e20]
      - generic [ref=e23]: Поиск заданий, студентов, посылок…
      - generic [ref=e24]: ⌘K
    - generic [ref=e26]:
      - generic [ref=e27]: Учёба
      - generic [ref=e28]:
        - link "Главная" [ref=e29] [cursor=pointer]:
          - /url: /me
          - img [ref=e31]
          - generic [ref=e36]: Главная
        - link "Задания" [ref=e37] [cursor=pointer]:
          - /url: /me/assignments
          - img [ref=e39]
          - generic [ref=e42]: Задания
        - link "Мои посылки" [ref=e43] [cursor=pointer]:
          - /url: /me/submissions
          - img [ref=e45]
          - generic [ref=e47]: Мои посылки
        - link "Уведомления" [ref=e48] [cursor=pointer]:
          - /url: /notifications
          - img [ref=e50]
          - generic [ref=e52]: Уведомления
    - button "ИП Иван Петров Студент" [ref=e54] [cursor=pointer]:
      - generic [ref=e55]: ИП
      - generic [ref=e56]:
        - generic [ref=e57]: Иван Петров
        - generic [ref=e58]: Студент
      - img [ref=e60]
  - main [ref=e62]:
    - generic [ref=e63]:
      - generic [ref=e64]: Кабинет
      - generic [ref=e65]:
        - button "EN" [ref=e66] [cursor=pointer]
        - button "RU" [ref=e67] [cursor=pointer]
      - button "Переключить тему" [ref=e68] [cursor=pointer]:
        - img [ref=e69]
      - button [ref=e75]
    - generic [ref=e77]:
      - generic [ref=e78]:
        - heading "Добрый день, Иван Петров." [level=1] [ref=e80]
        - generic [ref=e81]: Активных заданий нет — отдыхайте 🙂
      - generic [ref=e82]:
        - generic [ref=e83]:
          - generic [ref=e84]:
            - generic [ref=e85]: Активных заданий
            - generic [ref=e86]: "0"
          - generic [ref=e87]:
            - generic [ref=e88]: Скоро дедлайны
            - generic [ref=e89]: "0"
          - generic [ref=e90]:
            - generic [ref=e91]: Свежих оценок
            - generic [ref=e92]: "0"
          - generic [ref=e93]:
            - generic [ref=e94]: Уведомления
            - generic [ref=e95]: "3"
        - generic [ref=e96]:
          - generic [ref=e97]:
            - generic [ref=e98]: Активные задания
            - button "Все" [ref=e100]:
              - text: Все
              - img [ref=e101]
          - generic [ref=e103]: Активных заданий нет.
        - generic [ref=e104]:
          - generic [ref=e106]: Свежие оценки
          - generic [ref=e107]: Пока нет оценок.
        - generic [ref=e108]:
          - generic [ref=e109]:
            - generic [ref=e110]: Входящие
            - button "Все" [ref=e112]:
              - text: Все
              - img [ref=e113]
          - generic [ref=e115]:
            - link "/S Уведомление PlagLens /services/submission · 5h ago" [ref=e116] [cursor=pointer]:
              - /url: /me/inbox
              - generic [ref=e118]: /S
              - generic [ref=e119]:
                - generic [ref=e120]: Уведомление PlagLens
                - generic [ref=e121]: /services/submission · 5h ago
              - img [ref=e123]
            - link "/S Уведомление PlagLens /services/submission · 5h ago" [ref=e125] [cursor=pointer]:
              - /url: /me/inbox
              - generic [ref=e127]: /S
              - generic [ref=e128]:
                - generic [ref=e129]: Уведомление PlagLens
                - generic [ref=e130]: /services/submission · 5h ago
              - img [ref=e132]
            - link "/S Уведомление PlagLens /services/submission · 5h ago" [ref=e134] [cursor=pointer]:
              - /url: /me/inbox
              - generic [ref=e136]: /S
              - generic [ref=e137]:
                - generic [ref=e138]: Уведомление PlagLens
                - generic [ref=e139]: /services/submission · 5h ago
              - img [ref=e141]
```

# Test source

```ts
  1  | /**
  2  |  * E2E: bell unread counter — deterministic via mocked API.
  3  |  *
  4  |  * We intercept GET /api/v1/users/me/notifications/unread-count and serve
  5  |  * a known number, then verify the badge shows it.
  6  |  */
  7  | import { expect, test } from '../../setup/fixtures';
  8  | 
  9  | test.describe('Bell unread counter (mocked)', () => {
  10 |   test('badge shows the API-reported unread count', async ({ studentPage }) => {
  11 |     await studentPage.route(
  12 |       /\/api\/v1\/users\/me\/notifications\/unread-count/,
  13 |       async (route) => {
  14 |         await route.fulfill({
  15 |           status: 200,
  16 |           contentType: 'application/json',
  17 |           body: JSON.stringify({ unread_count: 7 }),
  18 |         });
  19 |       },
  20 |     );
  21 |     await studentPage.goto('/me');
  22 |     const badge = studentPage.getByTestId('notif-unread-badge');
> 23 |     await expect.poll(
     |     ^ Error: Timeout 10000ms exceeded while waiting on the predicate
  24 |       async () => Number((await badge.getAttribute('data-unread-count')) ?? '0'),
  25 |       { timeout: 10_000 },
  26 |     ).toBeGreaterThanOrEqual(0);
  27 |   });
  28 | 
  29 |   test('mark-all-read empties the unread count', async ({ studentPage }) => {
  30 |     await studentPage.route(
  31 |       /\/api\/v1\/users\/me\/notifications:mark-all-read/,
  32 |       async (route) => {
  33 |         await route.fulfill({
  34 |           status: 200,
  35 |           contentType: 'application/json',
  36 |           body: JSON.stringify({ updated: 0 }),
  37 |         });
  38 |       },
  39 |     );
  40 |     await studentPage.goto('/notifications');
  41 |     // The button may not be present if the page renders an empty state — best-effort.
  42 |     const btn = studentPage.getByTestId('mark-all-read-btn');
  43 |     if (await btn.isVisible({ timeout: 2_000 }).catch(() => false)) {
  44 |       await btn.click();
  45 |       await expect(studentPage).toHaveURL(/\/notifications/);
  46 |     }
  47 |   });
  48 | });
  49 | 
```