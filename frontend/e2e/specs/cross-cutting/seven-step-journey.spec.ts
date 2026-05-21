/**
 * Seven-step user journey — end-to-end through the real public stand.
 *
 * 1. super-admin creates a teacher invitation in tenant HSE
 * 2. teacher registers + redeems → global_role becomes teacher
 * 3. teacher creates a course + opens the Yandex.Contest integration wizard
 * 4. teacher creates an assistant invitation tied to the course
 * 5. assistant registers + redeems → joins the course as assistant
 * 6. teacher creates a student invitation tied to the course
 * 7. student registers + redeems → joins the course as student, opens grades
 *
 * Drives admin via raw API calls (faster, deterministic), drives the three
 * fresh user accounts via real UI flows (registration page, /me/profile
 * redeem panel, course detail, grades). Each run uses timestamped emails so
 * repeated runs don't collide.
 *
 * Run against the public stand:
 *   E2E_BASE_URL=https://85.192.48.223.nip.io \
 *   E2E_API_HOST=https://85.192.48.223.nip.io \
 *   E2E_SUPER_ADMIN_EMAIL=admin@plaglens.local \
 *   E2E_SUPER_ADMIN_PASSWORD=<from infra/.env> \
 *   npx playwright test specs/cross-cutting/seven-step-journey.spec.ts \
 *     --project=chromium-headless --workers=1
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

const API_HOST = process.env.E2E_API_HOST ?? process.env.E2E_BASE_URL ?? 'http://localhost:5173';
const API_PREFIX = process.env.E2E_API_PREFIX ?? '/api/v1';
const SUPER_ADMIN_EMAIL = process.env.E2E_SUPER_ADMIN_EMAIL ?? 'admin@plaglens.local';
const SUPER_ADMIN_PASSWORD = process.env.E2E_SUPER_ADMIN_PASSWORD ?? 'changeme';
const TARGET_TENANT_SLUG = process.env.E2E_TARGET_TENANT_SLUG ?? 'hse';

const STAMP = Date.now();
const PASSWORD = 'JourneyPass1234';
const TEACHER_EMAIL = `teacher-${STAMP}@plaglens.local`;
const ASSISTANT_EMAIL = `assistant-${STAMP}@plaglens.local`;
const STUDENT_EMAIL = `student-${STAMP}@plaglens.local`;
const COURSE_NAME = `Алгоритмы и структуры данных ${STAMP}`;
const COURSE_SLUG = `algo-${STAMP}`;

// Single serial flow — every step depends on state seeded by the previous one.
test.describe.configure({ mode: 'serial' });

// ----- shared state ------------------------------------------------------ //
let api: APIRequestContext;
let adminToken: string;
let targetTenantId: string;

let teacherCode: string;
let teacherToken: string;
let teacherId: string;

let courseId: string;
let assistantCode: string;
let assistantToken: string;

let studentCode: string;

// ----- helpers ----------------------------------------------------------- //
async function login(email: string, password: string, tenantSlug?: string): Promise<string> {
  const body: Record<string, string> = { email, password };
  if (tenantSlug) body.tenant_slug = tenantSlug;
  const resp = await api.post(`${API_PREFIX}/auth/login`, { data: body });
  expect(resp.ok(), `login(${email}) → ${resp.status()} ${await resp.text()}`).toBeTruthy();
  const data = await resp.json();
  expect(data.access_token, 'login response carries access_token (no MFA expected)').toBeTruthy();
  return data.access_token as string;
}

async function getJson(path: string, token: string): Promise<unknown> {
  const resp = await api.get(`${API_PREFIX}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(resp.ok(), `${path} → ${resp.status()} ${await resp.text()}`).toBeTruthy();
  return resp.json();
}

async function postJson(path: string, token: string, payload: object): Promise<unknown> {
  const resp = await api.post(`${API_PREFIX}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    data: payload,
  });
  expect(resp.ok(), `${path} → ${resp.status()} ${await resp.text()}`).toBeTruthy();
  return resp.json();
}

async function registerAs(page: Page, email: string, displayName: string): Promise<void> {
  await page.goto('/register');
  await page.getByTestId('register-email').fill(email);
  await page.getByTestId('register-display-name').fill(displayName);
  await page.getByTestId('register-tenant-slug').fill(TARGET_TENANT_SLUG);
  await page.getByTestId('register-password').fill(PASSWORD);
  await page.getByTestId('register-submit').click();
  await expect(page.getByTestId('register-success')).toBeVisible({ timeout: 15_000 });
}

async function uiLogin(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill(PASSWORD);
  await page.getByTestId('login-submit').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 });
}

async function redeemCode(page: Page, code: string): Promise<void> {
  await page.goto('/me/profile');
  const input = page.getByTestId('redeem-code-input');
  await expect(input).toBeVisible();
  await input.fill(code);
  await page.getByTestId('redeem-code-submit').click();
  // The panel renders a green confirmation block; toast also appears but is
  // fragile, the inline message is the strong signal.
  await expect(page.locator('text=/Глобальная роль|Добавлены в курс|Код применён/').first()).toBeVisible({
    timeout: 10_000,
  });
}

// ----- spec ------------------------------------------------------------- //
test.beforeAll(async ({ playwright }) => {
  api = await playwright.request.newContext({
    baseURL: API_HOST,
    ignoreHTTPSErrors: true,
  });
  adminToken = await login(SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
  // Resolve target tenant id from slug — admin listing returns every tenant
  // wrapped in the standard paginated envelope.
  const resp = (await getJson('/tenants', adminToken)) as
    | { data: Array<{ id: string; slug: string }> }
    | Array<{ id: string; slug: string }>;
  const rows = Array.isArray(resp) ? resp : resp.data;
  const hse = rows.find((t) => t.slug === TARGET_TENANT_SLUG);
  expect(hse, `tenant with slug "${TARGET_TENANT_SLUG}" must exist on the stand`).toBeTruthy();
  targetTenantId = hse!.id;
});

test.afterAll(async () => {
  await api.dispose();
});

test('Step 1: admin creates teacher invitation in HSE', async () => {
  const inv = (await postJson('/invitations', adminToken, {
    role: 'teacher',
    tenant_id: targetTenantId,
    email: TEACHER_EMAIL,
  })) as { code: string; tenant_id: string; role: string };
  expect(inv.tenant_id).toBe(targetTenantId);
  expect(inv.role).toBe('teacher');
  expect(inv.code).toMatch(/^[A-Z2-9]{3}-[A-Z2-9]{3}-[A-Z2-9]{3}$/);
  teacherCode = inv.code;
});

test('Step 2: teacher registers in HSE, redeems code → role bumps to teacher', async ({
  browser,
}) => {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  await registerAs(page, TEACHER_EMAIL, 'Teacher One');
  await uiLogin(page, TEACHER_EMAIL);
  await redeemCode(page, teacherCode);
  // After redeem the panel prompts for re-login (JWT carries the OLD role).
  // We just re-login through the API to obtain a teacher-role token for
  // subsequent steps.
  teacherToken = await login(TEACHER_EMAIL, PASSWORD, TARGET_TENANT_SLUG);
  const me = (await getJson('/auth/me', teacherToken)) as { id: string; global_role: string };
  expect(me.global_role).toBe('teacher');
  teacherId = me.id;
  await ctx.close();
});

test('Step 3: teacher creates a course (Y.Contest UI is wizard-only here)', async () => {
  const course = (await postJson('/courses', teacherToken, {
    name: COURSE_NAME,
    slug: COURSE_SLUG,
    description: 'Курс из e2e-сценария',
  })) as { id: string | number; name: string };
  expect(course.name).toBe(COURSE_NAME);
  // course-service returns numeric IDs; identity stores them as strings.
  courseId = String(course.id);

  // Yandex.Contest import requires a real OAuth token from the teacher's
  // attached account — out of scope for headless e2e. We at least verify
  // the create-integration endpoint is reachable and reports a structured
  // 4xx error rather than 5xx when we hand it dummy creds.
  const probe = await api.post(`${API_PREFIX}/integrations`, {
    headers: { Authorization: `Bearer ${teacherToken}` },
    data: {
      kind: 'yandex_contest',
      display_name: `Y.Contest probe ${STAMP}`,
      config: { oauth_token: 'DUMMY', contest_ids: [42] },
      course_id: courseId,
    },
  });
  // 201/200 if integration accepts dummy bind (creates row and defers sync),
  // 400/422 if validation rejects. Both are acceptable — a 5xx would be a bug.
  expect(
    probe.status() < 500,
    `integrations create probe must not 5xx (got ${probe.status()}: ${await probe.text()})`,
  ).toBeTruthy();
});

test('Step 4: teacher creates assistant invitation tied to the course', async () => {
  const inv = (await postJson('/invitations', teacherToken, {
    role: 'assistant',
    course_id: courseId,
    email: ASSISTANT_EMAIL,
  })) as { code: string; role: string; course_id: string };
  expect(inv.role).toBe('assistant');
  expect(inv.course_id).toBe(courseId);
  assistantCode = inv.code;
});

test('Step 5: assistant registers, redeems → joins the course as assistant', async ({
  browser,
}) => {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  await registerAs(page, ASSISTANT_EMAIL, 'Assistant One');
  await uiLogin(page, ASSISTANT_EMAIL);
  await redeemCode(page, assistantCode);
  assistantToken = await login(ASSISTANT_EMAIL, PASSWORD, TARGET_TENANT_SLUG);

  // Assistant should now appear in the course members list.
  const members = (await getJson(`/courses/${courseId}/members`, teacherToken)) as {
    data: Array<{ user_id: string; role: string }>;
  };
  const me = (await getJson('/auth/me', assistantToken)) as { id: string };
  const myRow = members.data.find((m) => m.user_id === me.id);
  expect(myRow, 'assistant is now a course member').toBeTruthy();
  expect(myRow!.role).toBe('assistant');

  // Smoke: open the submissions list (assistant should see, even if empty).
  await page.goto(`/courses/${courseId}`);
  await expect(page.locator('text=/Посылки|Submissions|Участники/i').first()).toBeVisible({
    timeout: 10_000,
  });
  await ctx.close();
});

test('Step 6: teacher creates student invitation tied to the course', async () => {
  const inv = (await postJson('/invitations', teacherToken, {
    role: 'student',
    course_id: courseId,
    email: STUDENT_EMAIL,
  })) as { code: string; role: string };
  expect(inv.role).toBe('student');
  studentCode = inv.code;
});

test('Step 7: student registers, redeems → can open their grades page', async ({ browser }) => {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  await registerAs(page, STUDENT_EMAIL, 'Student One');
  await uiLogin(page, STUDENT_EMAIL);
  await redeemCode(page, studentCode);

  // Visit /me/grades — the page should at least render without 500 even
  // when the student has no submissions yet (empty state).
  await page.goto('/me/grades');
  await expect(page).toHaveURL(/\/me\/grades/);
  // Allow either an explicit empty state or a real grades table.
  await expect(
    page.locator('text=/Нет оценок|Оценки|Grade|Задание/i').first(),
  ).toBeVisible({ timeout: 10_000 });
  await ctx.close();
});
