# PlagLens E2E (Playwright)

End-to-end tests for the PlagLens SPA. Stack-on-stack: real backend + real
frontend, with Playwright driving Chrome.

## Quick start

```bash
# 1. Install browser binaries (once)
make ui-e2e-install

# 2. Make sure the stack is running and seeded
make up
make seed-demo

# 3. Run all tests headless
make ui-e2e

# Or, run a specific spec file in headed mode (visible browser)
cd frontend && npx playwright test e2e/specs/auth/login.spec.ts --headed --project=chromium-headed

# Or, open the interactive UI
make ui-e2e-ui
```

## Running subsets

```bash
# Smoke only (fast — must pass before any real run)
cd frontend && npm run e2e:smoke

# Auth domain only
cd frontend && npm run e2e:auth

# A single test by name (regex match)
cd frontend && npx playwright test -g "submits with valid email"

# A single project (mobile / headless / headed)
cd frontend && npx playwright test --project=chromium-headless e2e/specs/smoke/

# Tag-based filter (e.g. only @auth tests)
cd frontend && npx playwright test --grep @auth

# Mobile-only (Pixel 5 viewport — opt-in)
cd frontend && npx playwright test --project=mobile-chrome
```

## Layout

```
frontend/e2e/
  README.md                  ← you are here
  setup/
    global-setup.ts          waits for stack, runs seed if missing, caches auth
    global-teardown.ts       no-op locally; CI cleans up stray test data
    fixtures.ts              custom Playwright fixtures (adminPage, teacherPage, …)
  helpers/
    api.ts                   raw APIRequestContext-based client
    auth.ts                  UI login / logout helpers
    assertions.ts            custom expect-style assertions
    factories.ts             unique slug / email generators
    inputs.ts                Mantine-aware input locators
    selectors.ts             data-testid registry
    waits.ts                 polling helpers (toasts, operations, SSE)
  pages/
    LoginPage.po.ts          page-object models (one per page)
    DemoLoginPage.po.ts
    RegisterPage.po.ts
    ForgotPasswordPage.po.ts
    ResetPasswordPage.po.ts
    OAuthCallbackPage.po.ts
    AppShell.po.ts
  specs/
    smoke/                   ← MUST pass before any domain agent starts work
      _spa-loads.spec.ts
      _all-services-healthy.spec.ts
      _routes-render.spec.ts
      _demo-login-all-roles.spec.ts
    auth/                    ← Identity Service §A-§N
      register.spec.ts
      login.spec.ts
      password-reset.spec.ts
      email-verify.spec.ts
      mfa-totp.spec.ts
      oauth.spec.ts
      session-refresh.spec.ts
      logout.spec.ts
      cross-tab-logout.spec.ts
      external-bindings.spec.ts
    courses/    submissions/  plagiarism/  ai/  dashboards/  admin/
                             ← reserved for other agents
```

## Conventions

### `data-testid` naming

| Pattern               | Example                   | When                 |
| --------------------- | ------------------------- | -------------------- |
| `<domain>-<element>`  | `login-submit`            | unique form controls |
| `<domain>-<noun>-<role>` | `demo-card-teacher`    | per-row collections  |
| `<resource>-row-<id>` | `binding-row-bnd_abc123`  | table rows           |
| `nav-item-<slug>`     | `nav-item-courses`        | sidebar links        |

Add new ids to `helpers/selectors.ts` and reference them via `TEST_IDS.*`.
**If a React component is missing the id you need — add it to the component**
(this is normal test-quality work, not a "test-only" change).

### Test files

- One spec file per logical flow, 5–15 tests each.
- `test.describe()` block per high-level scenario.
- Use page-object models for navigation; keep test bodies focused on intent.
- `uniqueSlug` fixture per test → no cross-test collisions.
- Tests must be order-independent (`--shuffle` should pass).

### Fixtures (from `setup/fixtures.ts`)

```ts
import { test, expect } from '../setup/fixtures';

test('teacher can list courses', async ({ teacherPage }) => {
  await teacherPage.goto('/courses');
  await expect(teacherPage.getByText(/Курсы/)).toBeVisible();
});
```

Available fixtures: `apiClient`, `adminPage`, `teacherPage`, `assistantPage`,
`studentPage`, `uniqueSlug`.

### Mantine inputs

Mantine wraps `<input>` inside a styled wrapper that carries `data-testid`.
`.fill()` on the wrapper can fail. Use `inputByTestId(page, 'foo')` from
`helpers/inputs.ts` to descend into the actual input.

## Debugging

1. Run with `--headed` to see the real browser:

   ```bash
   cd frontend && npx playwright test e2e/specs/auth/login.spec.ts \
     --project=chromium-headed --headed
   ```

2. Open the HTML report after a run:

   ```bash
   cd frontend && npx playwright show-report
   ```

3. Inspect the trace of a failed run. Traces include the DOM, network log,
   and console messages. Generated automatically on first retry, or pass
   `--trace=on` to record everything:

   ```bash
   cd frontend && npx playwright test --trace=on e2e/specs/auth/login.spec.ts
   cd frontend && npx playwright show-trace test-results/<failed-test>/trace.zip
   ```

4. Step through interactively (UI mode — best for new tests):

   ```bash
   make ui-e2e-ui   # opens the Playwright UI
   ```

5. Pause a test mid-run (drop a `await page.pause()` line) — opens an
   inspector with locator suggestions and step-by-step execution.

6. CI artifacts: every CI run uploads `frontend/playwright-report/` (HTML)
   and, on failure, `frontend/test-results/` (videos + traces) as job
   artifacts. Download them from the workflow run page on GitHub.

## Why my test is flaky

| Symptom                              | Likely cause                          | Fix                          |
| ------------------------------------ | ------------------------------------- | ---------------------------- |
| 429 from `/auth/login`               | gateway IP rate-limit (~60 rpm)       | `--workers=1` or serialize   |
| Element not found after navigation   | SPA route not yet rendered            | use `expect.poll` / `waitFor`|
| Wrong tenant on login                | demo seed missing or not loaded       | `make seed-demo-reset`       |
| Stale dist served by nginx           | nginx still has cached build          | `make ui-build` + restart    |

## CI

`.github/workflows/e2e.yml` runs the suite on every PR. Failures upload the
HTML report + raw test-results as a Job artifact.

## Add a new test

1. Pick (or create) a spec under `specs/<domain>/`.
2. Re-use page objects from `pages/`.
3. If a control needs a `data-testid`, edit the React component directly.
4. Add the id to `helpers/selectors.ts`.
5. Run with `--headed` first to verify selectors visually.
6. Run headless to ensure determinism.

## Known limits

- **Real LLM / JPlag flows are slow.** Tests that exercise an actual analysis
  (vs. a stub) can take 30s+ each. Tag them `@slow` and run separately:

  ```bash
  cd frontend && npx playwright test --grep @slow
  ```

- **OAuth providers are not configured in dev.** `oauth.spec.ts` aborts the
  authorize redirect and just verifies the URL is shaped correctly — full
  OAuth round-trips need a configured client_id/secret in the gateway env.

- **Mailhog optional.** `email-verify.spec.ts` skips automatically if
  `http://localhost:8025` is unreachable (some compose profiles drop it).

- **Rate limiting.** The gateway caps `/auth/login` at ~60/min/IP. Heavy
  parallel auth runs may see 429 — tests `test.skip()` on 429 rather than
  fail. If this becomes painful, drop `--workers` to 1 or split runs.

- **Cross-tab logout.** The frontend has no `BroadcastChannel` listener yet,
  so the second tab only learns about logout on next refresh / protected
  fetch. The `cross-tab-logout.spec.ts` waits for that bootstrap refresh.

## Auth specs map (Identity Service §A-§N)

| Spec                         | What it covers                                           |
| ---------------------------- | -------------------------------------------------------- |
| `register.spec.ts`           | §A registration, validation, dup email                   |
| `login.spec.ts`              | §B login form, ?next=, validation, INVALID_CREDENTIALS  |
| `password-reset.spec.ts`     | §C forgot + reset (token-less, mismatched, weak)        |
| `email-verify.spec.ts`       | §D verify token (mailhog round-trip optional)            |
| `mfa-totp.spec.ts`           | §E enroll, verify, disable, login-with-TOTP              |
| `oauth.spec.ts`              | §E.5 Google/Yandex/Stepik/GitHub start + callback        |
| `session-refresh.spec.ts`    | §F silent refresh, no-cookie redirect                    |
| `logout.spec.ts`             | §G user-menu logout + revoked refresh cookie             |
| `cross-tab-logout.spec.ts`   | §G two tabs share session, logout propagates             |
| `external-bindings.spec.ts`  | §I Stepik / Я.Контест bind/unbind                        |

