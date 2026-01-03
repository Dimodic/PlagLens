/* Pure REST flow — bypass the broken UI form:
 *   1. POST /auth/login   → access_token
 *   2. GET  /courses?slug=knad-cpp-24-25  → course.id (int)
 *   3. GET  /courses/{cid}/homeworks?slug=knad-cpp-1 → homework.id (int)
 *   4. POST /courses/{cid}/assignments { slug, title, homework_id }  → assignment.id
 *   5. POST /integrations/yandex-contest/{configId}/contests/{contestId}
 *           /import-submissions?assignment_id=... → real ingestion
 *   6. GET  /assignments/{id}/submissions      → confirm rows present
 *
 * Logs every status + body so we see exactly what backend says.
 */
const BASE = 'http://127.0.0.1:5173';
const TEACHER_EMAIL = 'gordenko.mk@edu.hse.ru';
const TEACHER_PWD = 'changeme';
const COURSE_SLUG = 'knad-cpp-24-25';
const HW_SLUG = 'knad-cpp-1';
const CFG_ID = 'ic_dd07ea540efe0f';
const CONTEST_ID = 73433;

async function req(method, path, { token, body } = {}) {
  const url = `${BASE}${path}`;
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const init = { method, headers };
  if (body !== undefined) init.body = JSON.stringify(body);
  const r = await fetch(url, init);
  const text = await r.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: r.status, body: parsed };
}

function dump(label, r) {
  const trunc = JSON.stringify(r.body).slice(0, 1500);
  console.log(`  ${label}: ${r.status}  ${trunc}`);
}

(async () => {
  // 1. login
  console.log('=== 1. login as teacher ===');
  const lg = await req('POST', '/api/v1/auth/login', {
    body: { email: TEACHER_EMAIL, password: TEACHER_PWD },
  });
  dump('login', lg);
  if (lg.status !== 200) {
    console.log('  ! login failed, aborting');
    process.exit(1);
  }
  const token = lg.body.access_token;
  console.log(`  token: ${String(token).slice(0, 24)}...`);

  // 2. resolve course id from slug
  console.log('\n=== 2. find course by slug ===');
  const co = await req('GET', `/api/v1/courses?slug=${COURSE_SLUG}&limit=5`, { token });
  dump('courses?slug=', co);
  const courses = co.body?.data || co.body?.items || [];
  const course = courses.find((c) => c.slug === COURSE_SLUG) || courses[0];
  if (!course) { console.log('  ! course not found'); process.exit(1); }
  const courseId = course.id;
  console.log(`  course.id: ${courseId}, slug: ${course.slug}`);

  // 3. resolve homework id
  console.log('\n=== 3. find homework by slug ===');
  const hw = await req('GET', `/api/v1/courses/${courseId}/homeworks?limit=20`, { token });
  dump('homeworks', hw);
  const hwList = hw.body?.data || hw.body?.items || [];
  const homework = hwList.find((h) => h.slug === HW_SLUG) || hwList[0];
  if (!homework) { console.log('  ! homework not found'); process.exit(1); }
  console.log(`  homework.id: ${homework.id}, slug: ${homework.slug}`);

  // 4. create assignment
  console.log('\n=== 4. create assignment ===');
  const ts = Date.now();
  const aSlug = `yc-${ts}`;
  const future = new Date(Date.now() + 30 * 86400_000).toISOString();
  const aBody = {
    slug: aSlug,
    title: `YC Import ${ts}`,
    homework_id: homework.id,
    language_hint: 'cpp',
    max_score: 10,
    weight: 1,
    deadline_soft_at: future,
    deadline_hard_at: future,
    late_score_multiplier: 0.5,
    selection_strategy: 'best',
    plagiarism_auto_run: false,
    plagiarism_threshold: 0.6,
    ai_auto_run: false,
  };
  const ac = await req('POST', `/api/v1/courses/${courseId}/assignments`, { token, body: aBody });
  dump('create assignment', ac);
  if (ac.status >= 400) {
    console.log('  ! create failed, aborting');
    process.exit(1);
  }
  const assignment = ac.body;
  console.log(`  assignment.id: ${assignment.id}`);

  // 5. import submissions
  console.log('\n=== 5. POST import-submissions (the real Yandex pull) ===');
  const imp = await req(
    'POST',
    `/api/v1/integrations/yandex-contest/${CFG_ID}/contests/${CONTEST_ID}/import-submissions?assignment_id=${assignment.id}`,
    { token },
  );
  dump('import-submissions', imp);

  // 6. verify
  console.log('\n=== 6. verify /assignments/{id}/submissions ===');
  const subs = await req(
    'GET',
    `/api/v1/assignments/${assignment.id}/submissions?limit=20`,
    { token },
  );
  dump('list submissions', subs);
  const subList = subs.body?.data || subs.body?.items || [];
  console.log(`  count: ${subList.length}`);
  for (const s of subList.slice(0, 5)) {
    console.log(`    - ${s.id} author=${s.author_id} lang=${s.language} external_id=${s.external_id} verdict=${s.external_verdict ?? '-'}`);
  }

  // 6b. open first submission detail (with files)
  if (subList[0]) {
    console.log('\n=== 7. first submission detail (with files) ===');
    const sd = await req('GET', `/api/v1/submissions/${subList[0].id}`, { token });
    dump('submission detail', sd);
    const files = sd.body?.files || [];
    console.log(`  files: ${files.length}`);
    for (const f of files) {
      console.log(`    - ${f.path}  ${f.size_bytes}B  ${f.mime_type}`);
    }
    // 7b. fetch raw content of first file
    if (files[0]) {
      const fr = await fetch(`${BASE}/api/v1/submissions/${subList[0].id}/files/${files[0].id}/content`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const txt = await fr.text();
      console.log(`  file content head (300 chars):\n${txt.slice(0, 300).split('\n').map((l) => '    ' + l).join('\n')}`);
    }
  }
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
