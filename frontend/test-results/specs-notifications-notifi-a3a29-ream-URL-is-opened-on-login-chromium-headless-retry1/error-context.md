# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: specs\notifications\notification-sse-realtime.spec.ts >> SSE realtime >> SSE stream URL is opened on login
- Location: e2e\specs\notifications\notification-sse-realtime.spec.ts:19:3

# Error details

```
Error: expect(received).toBeTruthy()

Received: false
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
  1   | /**
  2   |  * E2E: SSE realtime delivery to the bell dropdown.
  3   |  *
  4   |  * The flow we want to assert:
  5   |  *   1. Student opens any authenticated page; AppShell mounts the bell.
  6   |  *   2. Frontend subscribes to /api/v1/notifications/stream (EventSource).
  7   |  *   3. We POST a feedback (visible_to_student=true) on a student's submission
  8   |  *      from a teacher token. This emits submission.feedback.added.v1, and
  9   |  *      Notification Service should push a SSE message.
  10  |  *   4. The unread badge increments on the student page WITHOUT manual reload.
  11  |  *
  12  |  * Because demo-data may have no submissions for student1, we make the
  13  |  * trigger best-effort and *also* assert the SSE network endpoint is hit.
  14  |  */
  15  | import { expect, test } from '../../setup/fixtures';
  16  | import { ApiClient } from '../../helpers/api';
  17  | 
  18  | test.describe('SSE realtime', () => {
  19  |   test('SSE stream URL is opened on login', async ({ studentPage }) => {
  20  |     let sseHit = false;
  21  |     studentPage.on('request', (req) => {
  22  |       if (req.url().includes('/notifications/stream')) sseHit = true;
  23  |     });
  24  |     await studentPage.goto('/me');
  25  |     await studentPage.waitForTimeout(2_000);
> 26  |     expect(sseHit).toBeTruthy();
      |                    ^ Error: expect(received).toBeTruthy()
  27  |   });
  28  | 
  29  |   test('unread badge has a numeric data-attr (initial value)', async ({
  30  |     studentPage,
  31  |   }) => {
  32  |     await studentPage.goto('/me');
  33  |     const badge = studentPage.getByTestId('notif-unread-badge');
  34  |     const initial = await badge.getAttribute('data-unread-count');
  35  |     expect(initial).toMatch(/^\d+$/);
  36  |   });
  37  | 
  38  |   test('triggering grade.assigned increments unread count over SSE (best-effort)', async ({
  39  |     studentPage,
  40  |   }) => {
  41  |     await studentPage.goto('/notifications');
  42  |     const badge = studentPage.getByTestId('notif-unread-badge');
  43  |     const initialAttr = await badge.getAttribute('data-unread-count');
  44  |     const initial = Number(initialAttr ?? '0');
  45  | 
  46  |     // Best-effort find a submission of student1 to grade. We need a teacher
  47  |     // session for this.
  48  |     const c = await ApiClient.create();
  49  |     let triggered = false;
  50  |     try {
  51  |       await c.loginAs('teacher');
  52  |       const submissions = await c.get('/submissions?limit=1');
  53  |       if (submissions.ok()) {
  54  |         const j = await submissions.json();
  55  |         const sub = (j?.data ?? [])[0];
  56  |         if (sub?.id) {
  57  |           // Add a feedback visible to the student — this produces
  58  |           // submission.feedback.added.v1, which Notification Service maps
  59  |           // to an in-app + email notification for the student.
  60  |           const fb = await c.post(`/submissions/${sub.id}/feedback`, {
  61  |             body: 'E2E SSE-trigger feedback',
  62  |             visible_to_student: true,
  63  |           });
  64  |           triggered = fb.ok() || fb.status() === 201;
  65  |         }
  66  |       }
  67  |     } finally {
  68  |       await c.dispose();
  69  |     }
  70  | 
  71  |     if (!triggered) {
  72  |       test.skip(true, 'no submission available to trigger an event');
  73  |     }
  74  | 
  75  |     // Wait up to 10s for SSE to push and badge to bump.
  76  |     await expect
  77  |       .poll(
  78  |         async () => {
  79  |           const v = await badge.getAttribute('data-unread-count');
  80  |           return Number(v ?? '0');
  81  |         },
  82  |         { timeout: 10_000, intervals: [500, 1000, 1500] },
  83  |       )
  84  |       .toBeGreaterThanOrEqual(initial);
  85  |   });
  86  | 
  87  |   test('EventSource readyState is OPEN after page load', async ({
  88  |     studentPage,
  89  |   }) => {
  90  |     await studentPage.goto('/me');
  91  |     // Wait briefly for subscription to be established.
  92  |     await studentPage.waitForTimeout(2_000);
  93  |     // EventSource constants: CONNECTING=0, OPEN=1, CLOSED=2.
  94  |     const ready = await studentPage.evaluate(() => {
  95  |       // The SSEClient does not expose its EventSource on window, so we just
  96  |       // confirm EventSource API is available in the page context.
  97  |       return typeof EventSource !== 'undefined';
  98  |     });
  99  |     expect(ready).toBeTruthy();
  100 |   });
  101 | });
  102 | 
```