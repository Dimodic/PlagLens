# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: specs\courses\course-join.spec.ts >> /courses/join — invitation flow >> URL param fills the code input automatically
- Location: e2e\specs\courses\course-join.spec.ts:21:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('[data-testid="join-code-input"] input')
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for locator('[data-testid="join-code-input"] input')

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
      - generic [ref=e64]: Курсы
      - generic [ref=e65]:
        - button "EN" [ref=e66] [cursor=pointer]
        - button "RU" [ref=e67] [cursor=pointer]
      - button "Переключить тему" [ref=e68] [cursor=pointer]:
        - img [ref=e69]
      - button [ref=e75]
    - generic [ref=e77]:
      - heading "Присоединиться к курсу" [level=1] [ref=e80]
      - generic [ref=e83]:
        - generic [ref=e84]:
          - generic [ref=e85]: Код приглашения *
          - textbox "Код приглашения" [active] [ref=e87]:
            - /placeholder: ABCD-1234
            - text: TEST-ABCD
        - button "Присоединиться" [ref=e89] [cursor=pointer]:
          - generic [ref=e91]: Присоединиться
```

# Test source

```ts
  1  | /**
  2  |  * Page Object: /courses/join and /courses/join/:code
  3  |  */
  4  | import { expect, type Locator, type Page } from '@playwright/test';
  5  | import { TEST_IDS } from '../../helpers/selectors';
  6  | import { fillInput } from '../../helpers/inputs';
  7  | 
  8  | export class JoinByCodePagePo {
  9  |   readonly page: Page;
  10 |   readonly codeInput: Locator;
  11 |   readonly submit: Locator;
  12 | 
  13 |   constructor(page: Page) {
  14 |     this.page = page;
  15 |     this.codeInput = page.locator(
  16 |       `[data-testid="${TEST_IDS.joinCodeInput}"] input`,
  17 |     );
  18 |     this.submit = page.getByTestId(TEST_IDS.joinSubmit);
  19 |   }
  20 | 
  21 |   async goto(code?: string): Promise<void> {
  22 |     const path = code ? `/courses/join/${encodeURIComponent(code)}` : '/courses/join';
  23 |     await this.page.goto(path);
  24 |     await this.page.waitForLoadState('domcontentloaded');
> 25 |     await expect(this.codeInput).toBeVisible({ timeout: 10_000 });
     |                                  ^ Error: expect(locator).toBeVisible() failed
  26 |   }
  27 | 
  28 |   async fillCode(code: string): Promise<void> {
  29 |     await fillInput(this.page, TEST_IDS.joinCodeInput, code);
  30 |   }
  31 | 
  32 |   async submitForm(): Promise<void> {
  33 |     await this.submit.click();
  34 |   }
  35 | }
  36 | 
```