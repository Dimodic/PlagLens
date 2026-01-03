/**
 * Playwright global-setup — runs once before any project executes its tests.
 *
 * Responsibilities:
 *   1. Wait for the frontend dev server to respond.
 *   2. Wait for the gateway /api/v1/health to be reachable.
 *   3. Verify the demo tenant + users exist by attempting a single sample login.
 *      If the login fails with TENANT_NOT_FOUND/USER_NOT_FOUND, attempt to
 *      run tools/scripts/seed-demo-data.py (best-effort).
 *   4. Pre-fetch access tokens for each demo role and persist storage state
 *      to e2e/.auth/<role>.json so per-test fixtures can restore them quickly.
 */
import { request, type FullConfig } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  API_HOST,
  API_PREFIX,
  DEMO_USERS,
  type DemoRole,
  waitForFrontendHealthy,
  waitForGatewayHealthy,
} from '../helpers/api';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FRONTEND_URL = process.env.E2E_BASE_URL ?? 'http://localhost:5173';
const AUTH_DIR = path.resolve(__dirname, '../.auth');

async function tryLogin(role: DemoRole): Promise<{ token: string; cookies: any[] } | null> {
  const ctx = await request.newContext({ baseURL: API_HOST, ignoreHTTPSErrors: true });
  try {
    const c = DEMO_USERS[role];
    const resp = await ctx.post(`${API_PREFIX}/auth/login`, {
      data: { email: c.email, password: c.password, tenant_slug: c.tenantSlug },
    });
    if (!resp.ok()) {
      const text = await resp.text();
      console.warn(`[global-setup] Login as ${role} failed (${resp.status()}): ${text.slice(0, 200)}`);
      return null;
    }
    const data = await resp.json();
    const cookies = await ctx.storageState();
    return { token: data.access_token, cookies: cookies.cookies };
  } catch (e) {
    console.warn(`[global-setup] Login as ${role} threw:`, e);
    return null;
  } finally {
    await ctx.dispose();
  }
}

async function maybeSeedDemo(): Promise<void> {
  const seedScript = path.resolve(__dirname, '../../../tools/scripts/seed-demo-data.py');
  if (!existsSync(seedScript)) {
    console.warn('[global-setup] seed-demo-data.py not found — skipping seed step');
    return;
  }
  const gatewayUrl = (process.env.E2E_GATEWAY_URL ?? 'http://localhost:8001');
  console.log(`[global-setup] Running seed-demo-data.py (gateway=${gatewayUrl})`);
  await new Promise<void>((resolve) => {
    const child = spawn('python', [seedScript, '--gateway-url', gatewayUrl], {
      stdio: 'inherit',
      shell: true,
    });
    child.on('close', (code) => {
      if (code !== 0) {
        console.warn(`[global-setup] Seed script exited with code ${code}; continuing anyway`);
      }
      resolve();
    });
  });
}

async function persistAuthState(role: DemoRole, token: string): Promise<void> {
  if (!existsSync(AUTH_DIR)) mkdirSync(AUTH_DIR, { recursive: true });
  // We persist a minimal storage state: nothing in cookies (refresh tokens
  // are httpOnly per backend), but the access token is held in memory.
  // For UI tests we still need the cookie + a hint, so save the token in a
  // sidecar JSON the fixture can read.
  const file = path.join(AUTH_DIR, `${role}.json`);
  writeFileSync(file, JSON.stringify({ accessToken: token, role }, null, 2));
}

async function globalSetup(_config: FullConfig): Promise<void> {
  console.log('[global-setup] Starting…');

  // 1. Frontend is up.
  await waitForFrontendHealthy(FRONTEND_URL);
  console.log(`[global-setup] Frontend OK at ${FRONTEND_URL}`);

  // 2. Gateway is up.
  await waitForGatewayHealthy(30_000);
  console.log(`[global-setup] Gateway OK at ${API_HOST}${API_PREFIX}`);

  // 3. Probe demo tenant — try admin login.
  let probe = await tryLogin('admin');
  if (!probe) {
    console.log('[global-setup] Demo tenant probe failed — attempting seed');
    await maybeSeedDemo();
    probe = await tryLogin('admin');
    if (!probe) {
      console.warn(
        '[global-setup] Demo tenant still unreachable — tests that require demo data will fail. ' +
          'Run `make seed-demo` manually and re-run.',
      );
    }
  }

  // 4. Pre-fetch tokens for each role (best-effort).
  // Spacing logins to avoid the gateway's per-IP rate limit on /auth/login.
  const roles: DemoRole[] = ['super_admin', 'admin', 'teacher', 'assistant', 'student1', 'student2', 'student3', 'student4'];
  for (const role of roles) {
    const r = await tryLogin(role);
    if (r) {
      await persistAuthState(role, r.token);
      console.log(`[global-setup] Cached auth for ${role}`);
    } else {
      console.warn(`[global-setup] Failed to cache auth for ${role}`);
    }
    await new Promise((res) => setTimeout(res, 250));
  }

  console.log('[global-setup] Done');
}

export default globalSetup;
