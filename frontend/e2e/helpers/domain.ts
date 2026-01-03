/**
 * Domain helpers for Assignments + Submissions specs.
 * Resolves demo course/assignments and provides quick API shortcuts.
 */
import { request } from '@playwright/test';
import { ApiClient, API_BASE_URL, API_HOST, API_PREFIX, type DemoRole } from './api';
import { getApiClient, getToken } from './token-cache';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DEMO_COURSE_SLUG = 'algorithms-2026';

export interface DemoAssignment {
  id: string;
  course_id: string;
  slug: string;
  title: string;
  status: 'draft' | 'published' | 'archived';
  language_hint?: string;
  max_score?: number;
  weight?: number;
  deadline_soft_at?: string | null;
  deadline_hard_at?: string | null;
}

export interface DemoCourse {
  id: string;
  slug: string;
  name: string;
}

/**
 * Look up the demo course by slug. Returns id + name.
 *
 * The course service exposes integer ids; lookup by slug uses ?slug= filter
 * on the list endpoint.
 */
export async function resolveDemoCourse(api: ApiClient, slug = DEMO_COURSE_SLUG): Promise<DemoCourse> {
  // Try the list?slug= query first.
  const resp = await api.get(`/courses?slug=${encodeURIComponent(slug)}&limit=50`);
  if (resp.ok()) {
    const json = await resp.json();
    const items = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
    const found = items.find((c: any) => c.slug === slug);
    if (found) return { id: String(found.id), slug: found.slug, name: found.name };
  }
  // Fallback: scan paginated list (small demo set).
  const all = await api.get(`/courses?limit=200`);
  if (all.ok()) {
    const json = await all.json();
    const items = Array.isArray(json?.data) ? json.data : [];
    const found = items.find((c: any) => c.slug === slug);
    if (found) return { id: String(found.id), slug: found.slug, name: found.name };
  }
  throw new Error(`Failed to resolve course by slug "${slug}"`);
}

/**
 * List assignments of a course; returns the array.
 */
export async function listCourseAssignments(api: ApiClient, courseId: string): Promise<DemoAssignment[]> {
  const resp = await api.get(`/courses/${courseId}/assignments?limit=50`);
  if (!resp.ok()) {
    throw new Error(`Failed to list assignments: ${resp.status()} ${await resp.text()}`);
  }
  const data = await resp.json();
  return (data.data ?? []) as DemoAssignment[];
}

/**
 * Resolve an assignment by slug within demo course (e.g. lab-1-sort).
 */
export async function resolveAssignmentBySlug(
  api: ApiClient,
  courseSlug: string,
  assignmentSlug: string,
): Promise<DemoAssignment> {
  const course = await resolveDemoCourse(api, courseSlug);
  const list = await listCourseAssignments(api, course.id);
  const found = list.find((a) => a.slug === assignmentSlug);
  if (!found) {
    throw new Error(
      `Assignment "${assignmentSlug}" not found in course "${courseSlug}". Available: ${list
        .map((a) => a.slug)
        .join(', ')}`,
    );
  }
  return found;
}

/** Path helper for the seeded fixtures used by upload tests. */
export function fixtureSortPath(student: 'student1' | 'student2' | 'student3' | 'student4'): string {
  return path.resolve(__dirname, `../../../tools/scripts/fixtures/lab1-sort/${student}/sort.py`);
}

/**
 * Upload a submission for a student role using the cached token (no extra
 * /auth/login round-trip). Returns the new submission id.
 *
 * Uses lab-1-sort by default. Pass `assignmentId` to override.
 */
let _cachedLab1Id: string | null = null;
export async function getLab1Id(): Promise<string> {
  if (_cachedLab1Id) return _cachedLab1Id;
  const api = await getApiClient('teacher');
  try {
    const a = await resolveAssignmentBySlug(api, DEMO_COURSE_SLUG, 'lab-1-sort');
    _cachedLab1Id = a.id;
    return a.id;
  } finally {
    await api.dispose();
  }
}

export async function uploadSubmissionAs(
  role: 'student1' | 'student2' | 'student3' | 'student4',
  opts: { assignmentId?: string; language?: string } = {},
): Promise<string> {
  const token = await getToken(role as DemoRole);
  const assignmentId = opts.assignmentId ?? (await getLab1Id());
  const language = opts.language ?? 'python';
  // Use API_HOST as baseURL so leading-slash paths are resolved correctly;
  // explicitly include the API_PREFIX in the path.
  const ctx = await request.newContext({ baseURL: API_HOST, ignoreHTTPSErrors: true });
  try {
    const fs = await import('node:fs/promises');
    const buf = await fs.readFile(fixtureSortPath(role));
    const r = await ctx.post(`${API_PREFIX}/assignments/${assignmentId}/submissions`, {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        language,
        source: 'manual',
        files: { name: 'sort.py', mimeType: 'text/x-python', buffer: buf },
      },
    });
    if (!r.ok()) {
      throw new Error(`upload failed: ${r.status()} ${await r.text()}`);
    }
    const d = await r.json();
    return d.id as string;
  } finally {
    await ctx.dispose();
  }
}

/** Wait until the API answers and a given assignment exists. */
export async function waitForAssignmentExists(
  api: ApiClient,
  assignmentId: string,
  timeoutMs = 10_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await api.get(`/assignments/${assignmentId}`);
    if (r.ok()) return;
    await new Promise((res) => setTimeout(res, 500));
  }
  throw new Error(`Assignment ${assignmentId} not visible within ${timeoutMs}ms`);
}
