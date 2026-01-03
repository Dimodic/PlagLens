# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: specs\courses\course-detail.spec.ts >> /courses/:slug — detail >> admin sees the menu trigger
- Location: e2e\specs\courses\course-detail.spec.ts:150:3

# Error details

```
Error: Login failed (401): {"type":"https://docs.plaglens.ru/errors/two_factor_required","title":"2FA required","status":401,"detail":"Provide TOTP code to complete login.","instance":"/api/v1/auth/login","code":"TWO_FACTOR_REQUIRED","request_id":"2fda8e88e59b44e88ca10eec1fabc42c"}
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
      - generic [ref=e73]: Обзор учреждения
      - generic [ref=e74]:
        - button "EN" [ref=e75] [cursor=pointer]
        - button "RU" [ref=e76] [cursor=pointer]
      - button "Переключить тему" [ref=e77] [cursor=pointer]:
        - img [ref=e78]
      - button [ref=e84]
    - generic [ref=e86]:
      - heading "Дашборд тенанта" [level=1] [ref=e89]
      - generic [ref=e91]:
        - generic [ref=e93]:
          - generic [ref=e97]:
            - paragraph [ref=e98]: Активных курсов
            - img [ref=e100]
          - generic [ref=e106]:
            - paragraph [ref=e107]: Активных пользователей (DAU)
            - img [ref=e109]
          - generic [ref=e118]:
            - paragraph [ref=e119]: MAU
            - img [ref=e121]
          - generic [ref=e130]:
            - paragraph [ref=e131]: Посылок (30д)
            - img [ref=e133]
          - generic [ref=e139]:
            - paragraph [ref=e140]: AI-токенов (30д)
            - img [ref=e142]
          - generic [ref=e153]:
            - paragraph [ref=e154]: AI-стоимость (30д)
            - img [ref=e156]
          - generic [ref=e164]:
            - paragraph [ref=e165]: Plagiarism runs (30д)
            - img [ref=e167]
          - generic [ref=e173]:
            - paragraph [ref=e174]: MinIO usage
            - img [ref=e176]
        - generic [ref=e183]:
          - heading "Состояние интеграций" [level=5] [ref=e184]
          - link "Перейти в глобальный дашборд" [ref=e185] [cursor=pointer]:
            - /url: /admin/dashboard/global
```

# Test source

```ts
  36  |     email: 'teacher@demo.local',
  37  |     password: 'teacher',
  38  |     tenantSlug: DEMO_TENANT_SLUG,
  39  |   },
  40  |   assistant: {
  41  |     email: 'assistant@demo.local',
  42  |     password: 'assistant',
  43  |     tenantSlug: DEMO_TENANT_SLUG,
  44  |   },
  45  |   student1: {
  46  |     email: 'student1@demo.local',
  47  |     password: 'student',
  48  |     tenantSlug: DEMO_TENANT_SLUG,
  49  |   },
  50  |   student2: {
  51  |     email: 'student2@demo.local',
  52  |     password: 'student',
  53  |     tenantSlug: DEMO_TENANT_SLUG,
  54  |   },
  55  |   student3: {
  56  |     email: 'student3@demo.local',
  57  |     password: 'student',
  58  |     tenantSlug: DEMO_TENANT_SLUG,
  59  |   },
  60  |   student4: {
  61  |     email: 'student4@demo.local',
  62  |     password: 'student',
  63  |     tenantSlug: DEMO_TENANT_SLUG,
  64  |   },
  65  | };
  66  | 
  67  | export type DemoRole = keyof typeof DEMO_USERS;
  68  | 
  69  | export class ApiClient {
  70  |   constructor(private readonly ctx: APIRequestContext, private accessToken: string | null = null) {}
  71  | 
  72  |   static async create(token?: string | null): Promise<ApiClient> {
  73  |     // Use API_HOST as baseURL and prefix paths with API_PREFIX, because
  74  |     // APIRequestContext treats leading-/ paths as host-relative (which
  75  |     // would strip our /api/v1 prefix).
  76  |     const ctx = await request.newContext({ baseURL: API_HOST, ignoreHTTPSErrors: true });
  77  |     return new ApiClient(ctx, token ?? null);
  78  |   }
  79  | 
  80  |   private url(path: string): string {
  81  |     if (path.startsWith('http')) return path;
  82  |     return `${API_PREFIX}${path.startsWith('/') ? path : `/${path}`}`;
  83  |   }
  84  | 
  85  |   setToken(token: string | null) {
  86  |     this.accessToken = token;
  87  |   }
  88  | 
  89  |   private headers(extra?: Record<string, string>): Record<string, string> {
  90  |     return {
  91  |       'Content-Type': 'application/json',
  92  |       Accept: 'application/json',
  93  |       ...(this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {}),
  94  |       ...extra,
  95  |     };
  96  |   }
  97  | 
  98  |   async get(path: string): Promise<APIResponse> {
  99  |     return this.ctx.get(this.url(path), { headers: this.headers() });
  100 |   }
  101 | 
  102 |   async post(path: string, body?: unknown): Promise<APIResponse> {
  103 |     return this.ctx.post(this.url(path), { headers: this.headers(), data: body });
  104 |   }
  105 | 
  106 |   async delete(path: string): Promise<APIResponse> {
  107 |     return this.ctx.delete(this.url(path), { headers: this.headers() });
  108 |   }
  109 | 
  110 |   /** Login through /auth/login. Returns the access token (and stores it).
  111 |    * Includes light retry-on-429 to keep parallel E2E robust against the
  112 |    * gateway's auth_sensitive rate limit. */
  113 |   async login(email: string, password: string, tenantSlug?: string): Promise<string> {
  114 |     const body: Record<string, unknown> = { email, password };
  115 |     if (tenantSlug) body.tenant_slug = tenantSlug;
  116 |     const maxAttempts = 6;
  117 |     let lastText = '';
  118 |     let lastStatus = 0;
  119 |     for (let attempt = 0; attempt < maxAttempts; attempt++) {
  120 |       const resp = await this.ctx.post(this.url('/auth/login'), {
  121 |         headers: this.headers(),
  122 |         data: body,
  123 |       });
  124 |       if (resp.ok()) {
  125 |         const data = await resp.json();
  126 |         this.accessToken = data.access_token;
  127 |         return data.access_token;
  128 |       }
  129 |       lastStatus = resp.status();
  130 |       lastText = await resp.text();
  131 |       if (resp.status() !== 429) break;
  132 |       // Exponential-ish backoff with jitter to spread retries.
  133 |       const wait = 800 + attempt * 600 + Math.floor(Math.random() * 400);
  134 |       await new Promise((res) => setTimeout(res, wait));
  135 |     }
> 136 |     throw new Error(`Login failed (${lastStatus}): ${lastText}`);
      |           ^ Error: Login failed (401): {"type":"https://docs.plaglens.ru/errors/two_factor_required","title":"2FA required","status":401,"detail":"Provide TOTP code to complete login.","instance":"/api/v1/auth/login","code":"TWO_FACTOR_REQUIRED","request_id":"2fda8e88e59b44e88ca10eec1fabc42c"}
  137 |   }
  138 | 
  139 |   async loginAs(role: DemoRole): Promise<string> {
  140 |     const c = DEMO_USERS[role];
  141 |     return this.login(c.email, c.password, c.tenantSlug);
  142 |   }
  143 | 
  144 |   async me() {
  145 |     const resp = await this.get('/auth/me');
  146 |     if (!resp.ok()) throw new Error(`me() failed: ${resp.status()}`);
  147 |     return resp.json();
  148 |   }
  149 | 
  150 |   async dispose(): Promise<void> {
  151 |     await this.ctx.dispose();
  152 |   }
  153 | }
  154 | 
  155 | /**
  156 |  * Wait until the gateway responds to a known endpoint with a JSON body.
  157 |  *
  158 |  * We probe `POST /api/v1/auth/login` with no body — the gateway should
  159 |  * return 422 (validation), proving it routes the request to the identity
  160 |  * backend. Any JSON response (200/4xx) from a problem+json content-type
  161 |  * counts as "alive". 5xx and HTML fallthrough are NOT alive.
  162 |  */
  163 | export async function waitForGatewayHealthy(timeoutMs = 30_000): Promise<void> {
  164 |   const ctx = await request.newContext({ baseURL: API_HOST, ignoreHTTPSErrors: true });
  165 |   const deadline = Date.now() + timeoutMs;
  166 |   let lastErr: unknown = null;
  167 |   try {
  168 |     while (Date.now() < deadline) {
  169 |       try {
  170 |         const r = await ctx.post(`${API_PREFIX}/auth/login`, { data: {} });
  171 |         const ct = r.headers()['content-type'] ?? '';
  172 |         if (r.status() < 500 && (ct.includes('json') || ct.includes('problem'))) return;
  173 |       } catch (e) {
  174 |         lastErr = e;
  175 |       }
  176 |       await new Promise((res) => setTimeout(res, 1_000));
  177 |     }
  178 |   } finally {
  179 |     await ctx.dispose();
  180 |   }
  181 |   throw new Error(`Gateway did not become healthy within ${timeoutMs}ms: ${lastErr ?? 'unknown'}`);
  182 | }
  183 | 
  184 | /**
  185 |  * Wait until the frontend dev server (or static host) responds. We just check
  186 |  * the document loads — Vite returns 200 for /index.html in dev mode.
  187 |  */
  188 | export async function waitForFrontendHealthy(
  189 |   baseUrl = 'http://localhost:5173',
  190 |   timeoutMs = 30_000,
  191 | ): Promise<void> {
  192 |   const ctx = await request.newContext({ baseURL: baseUrl, ignoreHTTPSErrors: true });
  193 |   const deadline = Date.now() + timeoutMs;
  194 |   try {
  195 |     while (Date.now() < deadline) {
  196 |       try {
  197 |         const r = await ctx.get('/');
  198 |         if (r.ok()) return;
  199 |       } catch {
  200 |         // retry
  201 |       }
  202 |       await new Promise((res) => setTimeout(res, 1_000));
  203 |     }
  204 |   } finally {
  205 |     await ctx.dispose();
  206 |   }
  207 |   throw new Error(`Frontend did not become healthy within ${timeoutMs}ms`);
  208 | }
  209 | 
```