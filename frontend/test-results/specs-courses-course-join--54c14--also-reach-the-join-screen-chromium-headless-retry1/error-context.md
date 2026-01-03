# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: specs\courses\course-join.spec.ts >> /courses/join — invitation flow >> admin can also reach the join screen
- Location: e2e\specs\courses\course-join.spec.ts:50:3

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
        - generic [ref=e13]: консоль админа
      - button "Свернуть" [ref=e14] [cursor=pointer]:
        - img [ref=e15]
    - generic [ref=e18]:
      - img [ref=e20]
      - generic [ref=e23]: Поиск заданий, студентов, посылок…
      - generic [ref=e24]: ⌘K
    - generic [ref=e25]:
      - generic [ref=e26]:
        - generic [ref=e27]: Учреждение
        - generic [ref=e28]:
          - link "Обзор" [ref=e29] [cursor=pointer]:
            - /url: /admin/overview
            - img [ref=e31]
            - generic [ref=e36]: Обзор
          - link "Пользователи" [ref=e37] [cursor=pointer]:
            - /url: /admin/users
            - img [ref=e39]
            - generic [ref=e41]: Пользователи
          - link "Журнал" [ref=e42] [cursor=pointer]:
            - /url: /admin/audit
            - img [ref=e44]
            - generic [ref=e46]: Журнал
      - generic [ref=e47]:
        - generic [ref=e48]: Система
        - generic [ref=e49]:
          - link "Интеграции" [ref=e50] [cursor=pointer]:
            - /url: /admin/integrations
            - img [ref=e52]
            - generic [ref=e56]: Интеграции
          - link "Настройки учреждения" [ref=e57] [cursor=pointer]:
            - /url: /admin/system/settings
            - img [ref=e59]
            - generic [ref=e61]: Настройки учреждения
    - button "АД Админ Демов Администратор" [ref=e63] [cursor=pointer]:
      - generic [ref=e64]: АД
      - generic [ref=e65]:
        - generic [ref=e66]: Админ Демов
        - generic [ref=e67]: Администратор
      - img [ref=e69]
  - main [ref=e71]:
    - generic [ref=e72]:
      - generic [ref=e73]: Курсы
      - generic [ref=e74]:
        - button "EN" [ref=e75] [cursor=pointer]
        - button "RU" [ref=e76] [cursor=pointer]
      - button "Переключить тему" [ref=e77] [cursor=pointer]:
        - img [ref=e78]
      - button [ref=e84]
    - generic [ref=e86]:
      - heading "Присоединиться к курсу" [level=1] [ref=e89]
      - generic [ref=e92]:
        - generic [ref=e93]:
          - generic [ref=e94]: Код приглашения *
          - textbox "Код приглашения" [active] [ref=e96]:
            - /placeholder: ABCD-1234
        - button "Присоединиться" [ref=e98] [cursor=pointer]:
          - generic [ref=e100]: Присоединиться
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