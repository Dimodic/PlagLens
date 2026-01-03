# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: specs\submissions\submission-versioning.spec.ts >> Submission versioning >> UI History tab shows other versions
- Location: e2e\specs\submissions\submission-versioning.spec.ts:93:3

# Error details

```
Error: Failed to resolve course by slug "algorithms-2026"
```

# Test source

```ts
  1   | /**
  2   |  * Domain helpers for Assignments + Submissions specs.
  3   |  * Resolves demo course/assignments and provides quick API shortcuts.
  4   |  */
  5   | import { request } from '@playwright/test';
  6   | import { ApiClient, API_BASE_URL, API_HOST, API_PREFIX, type DemoRole } from './api';
  7   | import { getApiClient, getToken } from './token-cache';
  8   | import path from 'node:path';
  9   | import { fileURLToPath } from 'node:url';
  10  | 
  11  | const __filename = fileURLToPath(import.meta.url);
  12  | const __dirname = path.dirname(__filename);
  13  | 
  14  | export const DEMO_COURSE_SLUG = 'algorithms-2026';
  15  | 
  16  | export interface DemoAssignment {
  17  |   id: string;
  18  |   course_id: string;
  19  |   slug: string;
  20  |   title: string;
  21  |   status: 'draft' | 'published' | 'archived';
  22  |   language_hint?: string;
  23  |   max_score?: number;
  24  |   weight?: number;
  25  |   deadline_soft_at?: string | null;
  26  |   deadline_hard_at?: string | null;
  27  | }
  28  | 
  29  | export interface DemoCourse {
  30  |   id: string;
  31  |   slug: string;
  32  |   name: string;
  33  | }
  34  | 
  35  | /**
  36  |  * Look up the demo course by slug. Returns id + name.
  37  |  *
  38  |  * The course service exposes integer ids; lookup by slug uses ?slug= filter
  39  |  * on the list endpoint.
  40  |  */
  41  | export async function resolveDemoCourse(api: ApiClient, slug = DEMO_COURSE_SLUG): Promise<DemoCourse> {
  42  |   // Try the list?slug= query first.
  43  |   const resp = await api.get(`/courses?slug=${encodeURIComponent(slug)}&limit=50`);
  44  |   if (resp.ok()) {
  45  |     const json = await resp.json();
  46  |     const items = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
  47  |     const found = items.find((c: any) => c.slug === slug);
  48  |     if (found) return { id: String(found.id), slug: found.slug, name: found.name };
  49  |   }
  50  |   // Fallback: scan paginated list (small demo set).
  51  |   const all = await api.get(`/courses?limit=200`);
  52  |   if (all.ok()) {
  53  |     const json = await all.json();
  54  |     const items = Array.isArray(json?.data) ? json.data : [];
  55  |     const found = items.find((c: any) => c.slug === slug);
  56  |     if (found) return { id: String(found.id), slug: found.slug, name: found.name };
  57  |   }
> 58  |   throw new Error(`Failed to resolve course by slug "${slug}"`);
      |         ^ Error: Failed to resolve course by slug "algorithms-2026"
  59  | }
  60  | 
  61  | /**
  62  |  * List assignments of a course; returns the array.
  63  |  */
  64  | export async function listCourseAssignments(api: ApiClient, courseId: string): Promise<DemoAssignment[]> {
  65  |   const resp = await api.get(`/courses/${courseId}/assignments?limit=50`);
  66  |   if (!resp.ok()) {
  67  |     throw new Error(`Failed to list assignments: ${resp.status()} ${await resp.text()}`);
  68  |   }
  69  |   const data = await resp.json();
  70  |   return (data.data ?? []) as DemoAssignment[];
  71  | }
  72  | 
  73  | /**
  74  |  * Resolve an assignment by slug within demo course (e.g. lab-1-sort).
  75  |  */
  76  | export async function resolveAssignmentBySlug(
  77  |   api: ApiClient,
  78  |   courseSlug: string,
  79  |   assignmentSlug: string,
  80  | ): Promise<DemoAssignment> {
  81  |   const course = await resolveDemoCourse(api, courseSlug);
  82  |   const list = await listCourseAssignments(api, course.id);
  83  |   const found = list.find((a) => a.slug === assignmentSlug);
  84  |   if (!found) {
  85  |     throw new Error(
  86  |       `Assignment "${assignmentSlug}" not found in course "${courseSlug}". Available: ${list
  87  |         .map((a) => a.slug)
  88  |         .join(', ')}`,
  89  |     );
  90  |   }
  91  |   return found;
  92  | }
  93  | 
  94  | /** Path helper for the seeded fixtures used by upload tests. */
  95  | export function fixtureSortPath(student: 'student1' | 'student2' | 'student3' | 'student4'): string {
  96  |   return path.resolve(__dirname, `../../../tools/scripts/fixtures/lab1-sort/${student}/sort.py`);
  97  | }
  98  | 
  99  | /**
  100 |  * Upload a submission for a student role using the cached token (no extra
  101 |  * /auth/login round-trip). Returns the new submission id.
  102 |  *
  103 |  * Uses lab-1-sort by default. Pass `assignmentId` to override.
  104 |  */
  105 | let _cachedLab1Id: string | null = null;
  106 | export async function getLab1Id(): Promise<string> {
  107 |   if (_cachedLab1Id) return _cachedLab1Id;
  108 |   const api = await getApiClient('teacher');
  109 |   try {
  110 |     const a = await resolveAssignmentBySlug(api, DEMO_COURSE_SLUG, 'lab-1-sort');
  111 |     _cachedLab1Id = a.id;
  112 |     return a.id;
  113 |   } finally {
  114 |     await api.dispose();
  115 |   }
  116 | }
  117 | 
  118 | export async function uploadSubmissionAs(
  119 |   role: 'student1' | 'student2' | 'student3' | 'student4',
  120 |   opts: { assignmentId?: string; language?: string } = {},
  121 | ): Promise<string> {
  122 |   const token = await getToken(role as DemoRole);
  123 |   const assignmentId = opts.assignmentId ?? (await getLab1Id());
  124 |   const language = opts.language ?? 'python';
  125 |   // Use API_HOST as baseURL so leading-slash paths are resolved correctly;
  126 |   // explicitly include the API_PREFIX in the path.
  127 |   const ctx = await request.newContext({ baseURL: API_HOST, ignoreHTTPSErrors: true });
  128 |   try {
  129 |     const fs = await import('node:fs/promises');
  130 |     const buf = await fs.readFile(fixtureSortPath(role));
  131 |     const r = await ctx.post(`${API_PREFIX}/assignments/${assignmentId}/submissions`, {
  132 |       headers: { Authorization: `Bearer ${token}` },
  133 |       multipart: {
  134 |         language,
  135 |         source: 'manual',
  136 |         files: { name: 'sort.py', mimeType: 'text/x-python', buffer: buf },
  137 |       },
  138 |     });
  139 |     if (!r.ok()) {
  140 |       throw new Error(`upload failed: ${r.status()} ${await r.text()}`);
  141 |     }
  142 |     const d = await r.json();
  143 |     return d.id as string;
  144 |   } finally {
  145 |     await ctx.dispose();
  146 |   }
  147 | }
  148 | 
  149 | /** Wait until the API answers and a given assignment exists. */
  150 | export async function waitForAssignmentExists(
  151 |   api: ApiClient,
  152 |   assignmentId: string,
  153 |   timeoutMs = 10_000,
  154 | ): Promise<void> {
  155 |   const deadline = Date.now() + timeoutMs;
  156 |   while (Date.now() < deadline) {
  157 |     const r = await api.get(`/assignments/${assignmentId}`);
  158 |     if (r.ok()) return;
```