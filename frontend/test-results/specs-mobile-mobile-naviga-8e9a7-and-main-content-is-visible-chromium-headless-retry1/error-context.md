# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: specs\mobile\mobile-navigation.spec.ts >> Mobile navigation @mobile >> after login, AppShell renders and main content is visible
- Location: e2e\specs\mobile\mobile-navigation.spec.ts:10:3

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: false
Received: true
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
      - generic: Обзор учреждения
      - generic [ref=e73]:
        - button "EN" [ref=e74] [cursor=pointer]
        - button "RU" [ref=e75] [cursor=pointer]
      - button "Переключить тему" [ref=e76] [cursor=pointer]:
        - img [ref=e77]
      - button [ref=e83]
    - generic [ref=e85]:
      - heading "Дашборд тенанта" [level=1] [ref=e88]
      - generic [ref=e90]:
        - generic [ref=e92]:
          - generic [ref=e94]:
            - generic:
              - generic:
                - paragraph [ref=e95]: Активных курсов
                - img [ref=e97]
          - generic [ref=e101]:
            - generic:
              - generic:
                - paragraph [ref=e102]: Активных пользователей (DAU)
                - img [ref=e104]
          - generic [ref=e111]:
            - generic:
              - generic:
                - paragraph [ref=e112]: MAU
                - img [ref=e114]
          - generic [ref=e121]:
            - generic:
              - generic:
                - paragraph [ref=e122]: Посылок (30д)
                - img [ref=e124]
          - generic [ref=e128]:
            - generic:
              - generic:
                - paragraph [ref=e129]: AI-токенов (30д)
                - img [ref=e131]
          - generic [ref=e140]:
            - generic:
              - generic:
                - paragraph [ref=e141]: AI-стоимость (30д)
                - img [ref=e143]
          - generic [ref=e149]:
            - generic:
              - generic:
                - paragraph [ref=e150]: Plagiarism runs (30д)
                - img [ref=e152]
          - generic [ref=e156]:
            - generic:
              - generic:
                - paragraph [ref=e157]: MinIO usage
                - img [ref=e159]
        - generic [ref=e166]:
          - heading "Состояние интеграций" [level=5] [ref=e167]
          - link "Перейти в глобальный дашборд" [ref=e168] [cursor=pointer]:
            - /url: /admin/dashboard/global
```

# Test source

```ts
  1  | /**
  2  |  * Mobile navigation: navbar collapses to a hamburger menu.
  3  |  */
  4  | import { test, expect, devices } from '@playwright/test';
  5  | import { uiLoginAs } from '../../helpers/cross-cutting';
  6  | 
  7  | test.use({ ...devices['Pixel 5'] });
  8  | 
  9  | test.describe('Mobile navigation @mobile', () => {
  10 |   test('after login, AppShell renders and main content is visible', async ({ page }) => {
  11 |     await uiLoginAs(page, 'admin');
  12 |     await expect(page.locator('body')).toBeVisible();
  13 |     // No horizontal overflow.
  14 |     const overflow = await page.evaluate(() => {
  15 |       return document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
  16 |     });
> 17 |     expect(overflow).toBe(false);
     |                      ^ Error: expect(received).toBe(expected) // Object.is equality
  18 |   });
  19 | 
  20 |   test('hamburger button is visible on small screens', async ({ page }) => {
  21 |     await uiLoginAs(page, 'admin');
  22 |     const hamburger = page.locator(
  23 |       'button[aria-label*="меню" i], button[aria-label*="menu" i], button.mantine-Burger-root, [data-testid="mobile-menu-trigger"]',
  24 |     );
  25 |     // We accept presence; some shells use a built-in Mantine Burger.
  26 |     if ((await hamburger.count()) === 0) {
  27 |       test.info().annotations.push({ type: 'gap', description: 'no hamburger detected' });
  28 |     }
  29 |   });
  30 | 
  31 |   test('user menu trigger is reachable', async ({ page }) => {
  32 |     await uiLoginAs(page, 'admin');
  33 |     const trigger = page.getByTestId('header-user-menu-trigger');
  34 |     await expect(trigger).toBeVisible({ timeout: 10_000 });
  35 |   });
  36 | 
  37 |   test('navigation links visible after expanding menu', async ({ page }) => {
  38 |     await uiLoginAs(page, 'admin');
  39 |     // Try clicking the burger if present; otherwise test passes vacuously.
  40 |     const burger = page.locator('button.mantine-Burger-root').first();
  41 |     if (await burger.isVisible({ timeout: 2_000 }).catch(() => false)) {
  42 |       await burger.click();
  43 |       // Wait for the drawer to open.
  44 |       await page.waitForTimeout(500);
  45 |     }
  46 |     // Whether the menu is collapsed or expanded, at least one nav link
  47 |     // should be reachable somewhere on the page.
  48 |     const anyNav = page.locator('nav a, [role="navigation"] a, [data-testid^="nav-item-"]').first();
  49 |     if ((await anyNav.count()) > 0) {
  50 |       await expect(anyNav).toBeVisible();
  51 |     }
  52 |   });
  53 | });
  54 | 
```