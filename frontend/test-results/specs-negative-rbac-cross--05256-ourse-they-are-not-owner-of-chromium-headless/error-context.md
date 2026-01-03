# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: specs\negative\rbac-cross-course.spec.ts >> Cross-course / cross-tenant teacher isolation >> teacher cannot PATCH a course they are not owner of
- Location: e2e\specs\negative\rbac-cross-course.spec.ts:16:3

# Error details

```
Error: loginWithBackoff(teacher): TWO_FACTOR_REQUIRED — another test left 2FA enabled. body={"type":"https://docs.plaglens.ru/errors/two_factor_required","title":"2FA required","status":401,"detail":"Provide TOTP code to complete login.","instance":"/api/v1/auth/login","code":"TWO_FACTOR_REQ
```

# Test source

```ts
  83  |         detail: 'No refresh cookie',
  84  |         instance: '/api/v1/auth/refresh',
  85  |         request_id: 'test-anon-' + Date.now(),
  86  |       }),
  87  |     });
  88  |   });
  89  |   // The bootstrap also hits /auth/me — return 401 there too, so the SPA
  90  |   // doesn't fall back to a pre-existing token.
  91  |   await page.route('**/api/v1/auth/me', async (route, req) => {
  92  |     if (!req.headers()['authorization']) {
  93  |       await route.fulfill({
  94  |         status: 401,
  95  |         contentType: 'application/problem+json',
  96  |         body: JSON.stringify({
  97  |           type: 'https://docs.plaglens.ru/errors/unauthenticated',
  98  |           title: 'Unauthenticated',
  99  |           status: 401,
  100 |           code: 'UNAUTHENTICATED',
  101 |           detail: 'Missing bearer token',
  102 |           instance: '/api/v1/auth/me',
  103 |           request_id: 'test-anon-' + Date.now(),
  104 |         }),
  105 |       });
  106 |     } else {
  107 |       await route.continue();
  108 |     }
  109 |   });
  110 | }
  111 | 
  112 | /**
  113 |  * Login via UI form. Slower but exercises the full flow.
  114 |  */
  115 | export async function uiLoginAs(page: Page, role: DemoRole): Promise<void> {
  116 |   const c = DEMO_USERS[role];
  117 |   await page.goto('/login');
  118 |   await page.getByTestId(TEST_IDS.loginEmail).fill(c.email);
  119 |   await page.getByTestId(TEST_IDS.loginPassword).fill(c.password);
  120 |   if (c.tenantSlug) {
  121 |     await page.getByTestId(TEST_IDS.loginTenantSlug).fill(c.tenantSlug);
  122 |   }
  123 |   await page.getByTestId(TEST_IDS.loginSubmit).click();
  124 |   await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15_000 });
  125 | }
  126 | 
  127 | // ---------------------------------------------------------------------------
  128 | // API client helper that uses page.request (so cookies are shared).
  129 | // ---------------------------------------------------------------------------
  130 | 
  131 | export interface AuthedClient {
  132 |   ctx: APIRequestContext;
  133 |   token: string;
  134 |   get: (path: string, headers?: Record<string, string>) => Promise<Response>;
  135 |   post: (path: string, body?: unknown, headers?: Record<string, string>) => Promise<Response>;
  136 |   patch: (path: string, body?: unknown, headers?: Record<string, string>) => Promise<Response>;
  137 |   del: (path: string, headers?: Record<string, string>) => Promise<Response>;
  138 |   rawHeaders: () => Record<string, string>;
  139 | }
  140 | 
  141 | // Process-wide token cache: rate limit on /auth/login is 5/min/per_user, so
  142 | // every spec re-logging in for every role would quickly trip 429.  We cache
  143 | // the token (15-min TTL on the JWT itself) and reuse it across the worker.
  144 | const __TOKEN_CACHE: Map<string, { token: string; expires: number }> = new Map();
  145 | 
  146 | async function loginWithBackoff(role: DemoRole): Promise<string> {
  147 |   const cached = __TOKEN_CACHE.get(role);
  148 |   if (cached && Date.now() < cached.expires - 30_000) {
  149 |     return cached.token;
  150 |   }
  151 |   // We intentionally do NOT use baseURL: Playwright's baseURL replaces the
  152 |   // entire path of the URL when paired with an absolute path argument.
  153 |   // Pass full URLs everywhere instead.
  154 |   const ctx = await request.newContext({ ignoreHTTPSErrors: true });
  155 |   const c = DEMO_USERS[role];
  156 |   // Try up to 3 times with exponential backoff on 429.
  157 |   let lastStatus = 0;
  158 |   let lastBody = '';
  159 |   for (let attempt = 0; attempt < 4; attempt++) {
  160 |     const r = await ctx.post(`${API_BASE_URL}/auth/login`, {
  161 |       data: { email: c.email, password: c.password, tenant_slug: c.tenantSlug },
  162 |     });
  163 |     lastStatus = r.status();
  164 |     if (r.ok()) {
  165 |       const j = await r.json();
  166 |       const token = j.access_token as string;
  167 |       const exp = Date.now() + (j.expires_in ?? 900) * 1000;
  168 |       __TOKEN_CACHE.set(role, { token, expires: exp });
  169 |       await ctx.dispose();
  170 |       return token;
  171 |     }
  172 |     if (r.status() === 429) {
  173 |       // Honour Retry-After if present, else exponential backoff.
  174 |       const ra = parseInt(r.headers()['retry-after'] ?? '5', 10);
  175 |       await new Promise((res) => setTimeout(res, Math.max(1_000, ra * 1_000)));
  176 |       continue;
  177 |     }
  178 |     // 401 + TWO_FACTOR_REQUIRED — another test left 2FA on this account.
  179 |     // Try /auth/2fa/disable via super_admin if we can; else clearly skip.
  180 |     lastBody = await r.text().catch(() => '');
  181 |     if (r.status() === 401 && lastBody.includes('TWO_FACTOR_REQUIRED')) {
  182 |       await ctx.dispose();
> 183 |       throw new Error(`loginWithBackoff(${role}): TWO_FACTOR_REQUIRED — another test left 2FA enabled. body=${lastBody.slice(0, 200)}`);
      |             ^ Error: loginWithBackoff(teacher): TWO_FACTOR_REQUIRED — another test left 2FA enabled. body={"type":"https://docs.plaglens.ru/errors/two_factor_required","title":"2FA required","status":401,"detail":"Provide TOTP code to complete login.","instance":"/api/v1/auth/login","code":"TWO_FACTOR_REQ
  184 |     }
  185 |     // Non-recoverable.
  186 |     await ctx.dispose();
  187 |     throw new Error(`loginWithBackoff(${role}): login failed ${r.status()} ${lastBody}`);
  188 |   }
  189 |   await ctx.dispose();
  190 |   throw new Error(`loginWithBackoff(${role}): login failed after retries (${lastStatus}) ${lastBody}`);
  191 | }
  192 | 
  193 | /**
  194 |  * Build an authed client from a fresh request context (no shared cookies).
  195 |  * Use this in cross-cutting tests where you need full control over
  196 |  * Authorization / Idempotency-Key / etc.
  197 |  *
  198 |  * Tokens are cached per-role to avoid re-hitting the impostor-class rate
  199 |  * limit (5/min) when many specs run in parallel.
  200 |  *
  201 |  * Important: we DON'T set baseURL on the request context — Playwright's
  202 |  * baseURL replaces the entire path component when given an absolute path
  203 |  * argument, which doesn't compose with our `/api/v1/...` style paths.
  204 |  */
  205 | export async function makeAuthedClient(role: DemoRole): Promise<AuthedClient> {
  206 |   const ctx = await request.newContext({ ignoreHTTPSErrors: true });
  207 |   const token = await loginWithBackoff(role);
  208 | 
  209 |   const headers = (extra?: Record<string, string>) => ({
  210 |     Authorization: `Bearer ${token}`,
  211 |     'Content-Type': 'application/json',
  212 |     Accept: 'application/json',
  213 |     ...extra,
  214 |   });
  215 | 
  216 |   // Prefix paths with API_BASE_URL when they don't already have a scheme.
  217 |   const url = (p: string) => (p.startsWith('http') ? p : `${API_BASE_URL}${p}`);
  218 |   return {
  219 |     ctx,
  220 |     token,
  221 |     rawHeaders: () => headers(),
  222 |     get: (path, h) => ctx.get(url(path), { headers: headers(h) }),
  223 |     post: (path, body, h) => ctx.post(url(path), { headers: headers(h), data: body }),
  224 |     patch: (path, body, h) => ctx.patch(url(path), { headers: headers(h), data: body }),
  225 |     del: (path, h) => ctx.delete(url(path), { headers: headers(h) }),
  226 |   };
  227 | }
  228 | 
  229 | /**
  230 |  * Anonymous (no JWT) request context for testing public/protected boundaries.
  231 |  *
  232 |  * Returns a *wrapper* that automatically prefixes API_BASE_URL on relative
  233 |  * paths (avoids Playwright's baseURL-replaces-path quirk).
  234 |  */
  235 | export interface AnonClient {
  236 |   ctx: APIRequestContext;
  237 |   get: (path: string, init?: { headers?: Record<string, string> }) => Promise<Response>;
  238 |   post: (
  239 |     path: string,
  240 |     init?: { data?: unknown; headers?: Record<string, string> },
  241 |   ) => Promise<Response>;
  242 |   fetch: (path: string, init?: Parameters<APIRequestContext['fetch']>[1]) => Promise<Response>;
  243 |   delete: (path: string, init?: { headers?: Record<string, string> }) => Promise<Response>;
  244 |   dispose: () => Promise<void>;
  245 | }
  246 | 
  247 | export async function makeAnonClient(): Promise<AnonClient> {
  248 |   const ctx = await request.newContext({ ignoreHTTPSErrors: true });
  249 |   const url = (p: string) => (p.startsWith('http') ? p : `${API_BASE_URL}${p}`);
  250 |   return {
  251 |     ctx,
  252 |     get: (p, init) => ctx.get(url(p), init),
  253 |     post: (p, init) => ctx.post(url(p), init),
  254 |     fetch: (p, init) => ctx.fetch(url(p), init),
  255 |     delete: (p, init) => ctx.delete(url(p), init),
  256 |     dispose: () => ctx.dispose(),
  257 |   };
  258 | }
  259 | 
  260 | // ---------------------------------------------------------------------------
  261 | // RFC 7807 Problem assertions.
  262 | // ---------------------------------------------------------------------------
  263 | 
  264 | export interface ProblemShape {
  265 |   type?: string;
  266 |   title: string;
  267 |   status: number;
  268 |   detail?: string;
  269 |   instance?: string;
  270 |   code: string;
  271 |   request_id?: string;
  272 |   errors?: Array<{ field: string; code?: string; message: string }>;
  273 |   [k: string]: unknown;
  274 | }
  275 | 
  276 | /**
  277 |  * Assert that an HTTP response is an RFC 7807 Problem with expected status & code.
  278 |  * Returns the parsed Problem for further inspection.
  279 |  */
  280 | export async function expectProblem(
  281 |   resp: Response,
  282 |   expected: { status: number; code?: string; codeOneOf?: string[] },
  283 | ): Promise<ProblemShape> {
```