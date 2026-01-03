# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: specs\dashboards\my-dashboard.spec.ts >> My Dashboard /me >> renders four KPI cards for a student
- Location: e2e\specs\dashboards\my-dashboard.spec.ts:12:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByTestId('kpi-my-courses')
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for getByTestId('kpi-my-courses')

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
  2  |  * E2E: /me — My Dashboard
  3  |  *
  4  |  * Verifies role-aware KPIs: a student should see "Моих курсов",
  5  |  * "Дедлайнов скоро", "Недавних оценок", "Средняя оценка". Same KPIs
  6  |  * are also rendered for a teacher (with potentially different counts).
  7  |  */
  8  | import { expect, test } from '../../setup/fixtures';
  9  | import { MyDashboardPagePo } from '../../pages/dashboards/MyDashboardPage.po';
  10 | 
  11 | test.describe('My Dashboard /me', () => {
  12 |   test('renders four KPI cards for a student', async ({ studentPage }) => {
  13 |     const po = new MyDashboardPagePo(studentPage);
  14 |     await po.goto();
  15 |     await expect(studentPage).toHaveURL(/\/me/);
  16 | 
  17 |     await expect(po.kpisRoot).toBeVisible();
> 18 |     await expect(po.kpiMyCourses).toBeVisible();
     |                                   ^ Error: expect(locator).toBeVisible() failed
  19 |     await expect(po.kpiUpcomingDeadlines).toBeVisible();
  20 |     await expect(po.kpiRecentGrades).toBeVisible();
  21 |     await expect(po.kpiAverageScore).toBeVisible();
  22 |   });
  23 | 
  24 |   test('greeting includes the logged-in user display name', async ({
  25 |     studentPage,
  26 |   }) => {
  27 |     const po = new MyDashboardPagePo(studentPage);
  28 |     await po.goto();
  29 |     // The h2 is "Здравствуйте, <name>". Just check the prefix.
  30 |     await expect(
  31 |       studentPage.getByRole('heading', { name: /Здравствуйте/ }),
  32 |     ).toBeVisible();
  33 |   });
  34 | 
  35 |   test('renders KPIs for teachers too', async ({ teacherPage }) => {
  36 |     const po = new MyDashboardPagePo(teacherPage);
  37 |     await po.goto();
  38 |     await expect(po.kpiMyCourses).toBeVisible();
  39 |     await expect(po.kpiAverageScore).toBeVisible();
  40 |   });
  41 | 
  42 |   test('"Мои курсы" section has either rows or empty state', async ({
  43 |     teacherPage,
  44 |   }) => {
  45 |     const po = new MyDashboardPagePo(teacherPage);
  46 |     await po.goto();
  47 |     // Either the table is visible (data) OR an empty state title is.
  48 |     const tableVisible = await po.myCoursesTable.isVisible().catch(() => false);
  49 |     if (!tableVisible) {
  50 |       await expect(
  51 |         teacherPage.getByText(/У вас нет курсов|Здравствуйте/),
  52 |       ).toBeVisible();
  53 |     }
  54 |   });
  55 | 
  56 |   test('KPI value text is non-empty (number or em-dash)', async ({
  57 |     studentPage,
  58 |   }) => {
  59 |     const po = new MyDashboardPagePo(studentPage);
  60 |     await po.goto();
  61 |     const text = (await po.kpiMyCourses.innerText()).trim();
  62 |     expect(text.length).toBeGreaterThan(0);
  63 |   });
  64 | });
  65 | 
```