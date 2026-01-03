# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: specs\courses\course-rbac.spec.ts >> Courses — RBAC >> assistant does NOT see the create button on /courses
- Location: e2e\specs\courses\course-rbac.spec.ts:86:3

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  getByTestId('courses-list-create-button')
Expected: 0
Received: 1
Timeout:  10000ms

Call log:
  - Expect "toHaveCount" with timeout 10000ms
  - waiting for getByTestId('courses-list-create-button')
    14 × locator resolved to 1 element
       - unexpected value "1"

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
        - generic [ref=e13]: консоль преподавателя
      - button "Свернуть" [ref=e14] [cursor=pointer]:
        - img [ref=e15]
    - generic [ref=e18]:
      - img [ref=e20]
      - generic [ref=e23]: Поиск заданий, студентов, посылок…
      - generic [ref=e24]: ⌘K
    - generic [ref=e25]:
      - generic [ref=e26]:
        - generic [ref=e27]: Рабочее пространство
        - generic [ref=e28]:
          - link "Курсы" [ref=e29] [cursor=pointer]:
            - /url: /courses
            - img [ref=e31]
            - generic [ref=e36]: Курсы
          - link "Задания" [ref=e37] [cursor=pointer]:
            - /url: /me/assignments
            - img [ref=e39]
            - generic [ref=e42]: Задания
          - link "Посылки" [ref=e43] [cursor=pointer]:
            - /url: /me/submissions
            - img [ref=e45]
            - generic [ref=e47]: Посылки
          - link "Отчёты" [ref=e48] [cursor=pointer]:
            - /url: /reports
            - img [ref=e50]
            - generic [ref=e56]: Отчёты
          - link "Импорт" [ref=e57] [cursor=pointer]:
            - /url: /me/exports
            - img [ref=e59]
            - generic [ref=e61]: Импорт
          - link "Журнал" [ref=e62] [cursor=pointer]:
            - /url: /notifications
            - img [ref=e64]
            - generic [ref=e66]: Журнал
      - generic [ref=e67]:
        - generic [ref=e68]: Инструменты
        - generic [ref=e69]:
          - link "Интеграции" [ref=e70] [cursor=pointer]:
            - /url: /admin/integrations
            - img [ref=e72]
            - generic [ref=e76]: Интеграции
          - link "LLM-провайдер" [ref=e77] [cursor=pointer]:
            - /url: /admin/ai/providers
            - img [ref=e79]
            - generic [ref=e81]: LLM-провайдер
          - link "Настройки" [ref=e82] [cursor=pointer]:
            - /url: /me/profile
            - img [ref=e84]
            - generic [ref=e86]: Настройки
    - button "АА Ассист Ассистов Преподаватель" [ref=e88] [cursor=pointer]:
      - generic [ref=e89]: АА
      - generic [ref=e90]:
        - generic [ref=e91]: Ассист Ассистов
        - generic [ref=e92]: Преподаватель
      - img [ref=e94]
  - main [ref=e96]:
    - generic [ref=e97]:
      - generic [ref=e98]: Курсы
      - generic [ref=e99]:
        - button "EN" [ref=e100] [cursor=pointer]
        - button "RU" [ref=e101] [cursor=pointer]
      - button "Переключить тему" [ref=e102] [cursor=pointer]:
        - img [ref=e103]
      - button [ref=e109]
    - generic [ref=e111]:
      - generic [ref=e112]:
        - generic [ref=e113]: ПЯТНИЦА · 8 МАЯ 2026
        - heading "Добрый день, Ассист." [level=1] [ref=e114]
        - generic [ref=e115]: Здесь живут ваши курсы, последние проверки и события за ночь. Откройте задание, чтобы посмотреть посылки и запустить проверку.
      - generic [ref=e116]:
        - generic [ref=e117]:
          - generic [ref=e118]: Ждут вердикта
          - generic [ref=e119]: "0"
          - generic [ref=e120]: Опубликованные задания
        - generic [ref=e121]:
          - generic [ref=e122]: Идут проверки
          - generic [ref=e123]: "0"
          - generic [ref=e124]: Запущены сейчас
        - generic [ref=e125]:
          - generic [ref=e126]: Заданий за неделю
          - generic [ref=e127]: "0"
          - generic [ref=e128]: Совокупно по курсам
        - generic [ref=e129]:
          - generic [ref=e130]: Курсов
          - generic [ref=e131]: "1"
          - generic [ref=e132]: Доступно вам
      - generic [ref=e133]:
        - generic [ref=e134]:
          - img [ref=e136]
          - textbox "Поиск по курсам" [ref=e139]
        - generic [ref=e141]:
          - generic [ref=e142]: Все
          - generic [ref=e143]: Активные
          - generic [ref=e144]: Черновики
          - generic [ref=e145]: В архиве
        - link "Создать курс" [ref=e146] [cursor=pointer]:
          - /url: /courses/new
          - button "Создать курс" [ref=e147]:
            - img [ref=e148]
            - text: Создать курс
      - generic [ref=e150]:
        - generic [ref=e151]:
          - generic [ref=e152]: Алгоритмы и структуры данных
          - generic [ref=e153]: algorithms-2026
          - generic [ref=e155]: Активен
        - link "Открыть курс Алгоритмы и структуры данных":
          - /url: /courses/algorithms-2026
        - generic [ref=e157]:
          - generic [ref=e158]: В этом курсе пока нет заданий.
          - button "Открыть курс" [ref=e159]:
            - text: Открыть курс
            - img [ref=e160]
```

# Test source

```ts
  1  | /**
  2  |  * RBAC negative tests for the Courses domain.
  3  |  *
  4  |  * The frontend hides actions for non-owners via hasCourseRole/hasGlobalRole.
  5  |  * We verify the *visible* UI surface; backend-side RBAC is covered separately
  6  |  * by service-level tests.
  7  |  */
  8  | import { test, expect } from '../../setup/fixtures';
  9  | import { CourseDetailPagePo } from '../../pages/courses/CourseDetailPage.po';
  10 | import { CourseSettingsPagePo } from '../../pages/courses/CourseSettingsPage.po';
  11 | import { CoursesListPagePo } from '../../pages/courses/CoursesListPage.po';
  12 | 
  13 | test.describe('Courses — RBAC', () => {
  14 |   test('anonymous request to /courses redirects to /login', async ({ browser }) => {
  15 |     const ctx = await browser.newContext();
  16 |     const page = await ctx.newPage();
  17 |     await page.goto('/courses');
  18 |     await page.waitForURL(/\/login/, { timeout: 10_000 });
  19 |     await ctx.close();
  20 |   });
  21 | 
  22 |   test('anonymous request to /courses/new redirects to /login', async ({
  23 |     browser,
  24 |   }) => {
  25 |     const ctx = await browser.newContext();
  26 |     const page = await ctx.newPage();
  27 |     await page.goto('/courses/new');
  28 |     await page.waitForURL(/\/login/, { timeout: 10_000 });
  29 |     await ctx.close();
  30 |   });
  31 | 
  32 |   test('anonymous request to /courses/some-slug redirects to /login', async ({
  33 |     browser,
  34 |   }) => {
  35 |     const ctx = await browser.newContext();
  36 |     const page = await ctx.newPage();
  37 |     await page.goto('/courses/algorithms-2026');
  38 |     await page.waitForURL(/\/login/, { timeout: 10_000 });
  39 |     await ctx.close();
  40 |   });
  41 | 
  42 |   test('student does not see the «Создать курс» button on /courses', async ({
  43 |     studentPage,
  44 |   }) => {
  45 |     const list = new CoursesListPagePo(studentPage);
  46 |     await list.goto();
  47 |     await expect(list.createButton).toHaveCount(0);
  48 |   });
  49 | 
  50 |   test('student visiting /courses/:slug/settings sees a disabled Save button', async ({
  51 |     studentPage,
  52 |   }) => {
  53 |     const settings = new CourseSettingsPagePo(studentPage);
  54 |     await studentPage.goto('/courses/algorithms-2026/settings');
  55 |     await studentPage.waitForLoadState('domcontentloaded');
  56 |     if ((await settings.form.count()) > 0) {
  57 |       // Either form is missing or submit is disabled for non-owners.
  58 |       if ((await settings.submit.count()) > 0) {
  59 |         await expect(settings.submit).toBeDisabled();
  60 |       }
  61 |     }
  62 |   });
  63 | 
  64 |   test('student does not see the menu trigger on a course they did not author', async ({
  65 |     studentPage,
  66 |   }) => {
  67 |     const detail = new CourseDetailPagePo(studentPage);
  68 |     await detail.gotoBySlug('algorithms-2026');
  69 |     await expect(detail.menuTrigger).toHaveCount(0);
  70 |   });
  71 | 
  72 |   test('admin sees the create button (admins can create courses too)', async ({
  73 |     adminPage,
  74 |   }) => {
  75 |     const list = new CoursesListPagePo(adminPage);
  76 |     await list.goto();
  77 |     await expect(list.createButton).toBeVisible();
  78 |   });
  79 | 
  80 |   test('teacher sees the create button', async ({ teacherPage }) => {
  81 |     const list = new CoursesListPagePo(teacherPage);
  82 |     await list.goto();
  83 |     await expect(list.createButton).toBeVisible();
  84 |   });
  85 | 
  86 |   test('assistant does NOT see the create button on /courses', async ({
  87 |     assistantPage,
  88 |   }) => {
  89 |     const list = new CoursesListPagePo(assistantPage);
  90 |     await list.goto();
  91 |     // assistants are not teachers — they shouldn't see Create.
> 92 |     await expect(list.createButton).toHaveCount(0);
     |                                     ^ Error: expect(locator).toHaveCount(expected) failed
  93 |   });
  94 | });
  95 | 
```