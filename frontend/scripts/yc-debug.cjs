/* Debug Y.C. API connectivity: test_connection (cheap GET /contests), then
 * try the contest-specific endpoint manually to see the raw error. */
const BASE = 'http://127.0.0.1:5173';

async function req(method, path, { token, body } = {}) {
  const url = `${BASE}${path}`;
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let parsed; try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: r.status, body: parsed };
}

(async () => {
  const lg = await req('POST', '/api/v1/auth/login', {
    body: { email: 'gordenko.mk@edu.hse.ru', password: 'changeme' },
  });
  const token = lg.body.access_token;
  console.log('login:', lg.status);

  // 1. test connection (cheap: GET /contests?pageSize=1)
  console.log('\n--- test connection on ic_dd07ea540efe0f ---');
  const t = await req('POST', '/api/v1/integrations/ic_dd07ea540efe0f:test', { token });
  console.log('status:', t.status);
  console.log('body:', JSON.stringify(t.body, null, 2));

  // 2. list-contests passthrough (visible to OAuth user)
  console.log('\n--- GET /integrations/yandex-contest/ic_dd07ea540efe0f/contests ---');
  const c = await req('GET', '/api/v1/integrations/yandex-contest/ic_dd07ea540efe0f/contests', { token });
  console.log('status:', c.status);
  const arr = c.body?.data || [];
  console.log(`contests visible to token: ${arr.length}`);
  for (const x of arr.slice(0, 10)) {
    console.log(`  - id=${x.external_id} title="${x.title}"`);
  }
})();
