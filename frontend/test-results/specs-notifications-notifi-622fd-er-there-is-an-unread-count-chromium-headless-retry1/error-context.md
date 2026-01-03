# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: specs\notifications\notification-bell-dropdown.spec.ts >> Notification bell dropdown >> unread badge is present whenever there is an unread count
- Location: e2e\specs\notifications\notification-bell-dropdown.spec.ts:36:3

# Error details

```
TimeoutError: locator.getAttribute: Timeout 10000ms exceeded.
Call log:
  - waiting for getByTestId('notif-unread-badge')

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
  2  |  * E2E: header bell dropdown.
  3  |  *
  4  |  * The NotificationsBellDropdown is mounted in the AppShell header and visible
  5  |  * after login. We verify: bell icon visible, dropdown opens, "Открыть все"
  6  |  * navigates to /notifications.
  7  |  */
  8  | import { expect, test } from '../../setup/fixtures';
  9  | 
  10 | test.describe('Notification bell dropdown', () => {
  11 |   test('bell icon is visible after login', async ({ studentPage }) => {
  12 |     await studentPage.goto('/me');
  13 |     await expect(studentPage.getByTestId('notif-bell')).toBeVisible();
  14 |     await expect(studentPage.getByTestId('bell-icon')).toBeVisible();
  15 |   });
  16 | 
  17 |   test('clicking the bell opens the dropdown', async ({ studentPage }) => {
  18 |     await studentPage.goto('/me');
  19 |     await studentPage.getByTestId('bell-icon').click();
  20 |     await expect(studentPage.getByTestId('bell-dropdown')).toBeVisible();
  21 |     // Header inside dropdown.
  22 |     await expect(
  23 |       studentPage.getByTestId('bell-dropdown').getByText('Уведомления'),
  24 |     ).toBeVisible();
  25 |   });
  26 | 
  27 |   test('"Открыть все" link navigates to /notifications', async ({
  28 |     studentPage,
  29 |   }) => {
  30 |     await studentPage.goto('/me');
  31 |     await studentPage.getByTestId('bell-icon').click();
  32 |     await studentPage.getByTestId('open-all-link').click();
  33 |     await expect(studentPage).toHaveURL(/\/notifications$/);
  34 |   });
  35 | 
  36 |   test('unread badge is present whenever there is an unread count', async ({
  37 |     studentPage,
  38 |   }) => {
  39 |     await studentPage.goto('/me');
  40 |     const badge = studentPage.getByTestId('notif-unread-badge');
  41 |     // Indicator always renders; data-unread-count attr should be a number.
> 42 |     const attr = await badge.getAttribute('data-unread-count');
     |                              ^ TimeoutError: locator.getAttribute: Timeout 10000ms exceeded.
  43 |     expect(attr).toMatch(/^\d+$/);
  44 |   });
  45 | });
  46 | 
```