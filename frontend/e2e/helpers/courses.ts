/**
 * Course-domain test helpers — fast API-driven setup so UI tests can focus on
 * the screen under test instead of recreating preconditions through the UI.
 */
import { ApiClient, DEMO_USERS, type DemoRole } from './api';
import { uniqueSlug } from './factories';

export interface CreatedCourse {
  id: number | string;
  slug: string;
  name: string;
  status: string;
  owner_id?: string;
  tenant_id?: string;
}

export interface CreateCoursePayload {
  slug?: string;
  name?: string;
  description?: string;
  start_date?: string | null;
  end_date?: string | null;
}

/** Create a fresh course via API as the given role. Returns server payload. */
export async function createCourseAs(
  role: DemoRole,
  payload: CreateCoursePayload = {},
): Promise<CreatedCourse> {
  const client = await ApiClient.create();
  await client.loginAs(role);
  const slug = payload.slug ?? uniqueSlug('e2e-course');
  const body = {
    slug,
    name: payload.name ?? `E2E Course ${slug}`,
    description: payload.description ?? 'Created by Playwright',
    start_date: payload.start_date ?? null,
    end_date: payload.end_date ?? null,
  };
  const resp = await client.post('/courses', body);
  if (!resp.ok()) {
    const text = await resp.text();
    await client.dispose();
    throw new Error(`Failed to create course (${resp.status()}): ${text}`);
  }
  const data = (await resp.json()) as CreatedCourse;
  await client.dispose();
  return data;
}

/** Idempotently delete a course (ignores 404). */
export async function deleteCourseQuietly(
  role: DemoRole,
  idOrSlug: number | string,
): Promise<void> {
  const client = await ApiClient.create();
  try {
    await client.loginAs(role);
    await client.delete(`/courses/${idOrSlug}`);
  } catch {
    // ignore
  } finally {
    await client.dispose();
  }
}

/**
 * Look up a user's id (sub claim) by attempting login. Useful when a test
 * needs to add a specific demo user as member without a directory lookup.
 */
export async function getDemoUserId(role: DemoRole): Promise<string> {
  const client = await ApiClient.create();
  try {
    await client.loginAs(role);
    const me = await client.me();
    return me.id ?? me.user?.id ?? '';
  } finally {
    await client.dispose();
  }
}

/** Convenience: build a teacher-owned course with a unique slug. */
export async function makeTeacherCourse(): Promise<CreatedCourse> {
  return createCourseAs('teacher');
}

/** Convenience: list courses available to a role. */
export async function listCoursesAs(role: DemoRole): Promise<CreatedCourse[]> {
  const client = await ApiClient.create();
  try {
    await client.loginAs(role);
    const resp = await client.get('/courses?limit=100');
    if (!resp.ok()) return [];
    const data = await resp.json();
    return (data.data ?? []) as CreatedCourse[];
  } finally {
    await client.dispose();
  }
}

/** Add a member to a course (best-effort, swallows 4xx). */
export async function addMemberAs(
  role: DemoRole,
  courseId: number | string,
  userId: string,
  memberRole: 'student' | 'assistant' = 'student',
): Promise<void> {
  const client = await ApiClient.create();
  try {
    await client.loginAs(role);
    await client.post(`/courses/${courseId}/members`, {
      user_id: userId,
      role: memberRole,
    });
  } finally {
    await client.dispose();
  }
}

/** Create an invitation via API. Returns the invitation payload. */
export async function createInvitationAs(
  role: DemoRole,
  courseId: number | string,
  payload: {
    role?: 'student' | 'assistant';
    email?: string | null;
    max_uses?: number | null;
    expires_at?: string | null;
  } = {},
): Promise<{ id: string | number; code: string; max_uses: number | null; expires_at: string | null }> {
  const client = await ApiClient.create();
  try {
    await client.loginAs(role);
    const resp = await client.post(`/courses/${courseId}/invitations`, {
      role: payload.role ?? 'student',
      email: payload.email ?? null,
      max_uses: payload.max_uses ?? 25,
      expires_at: payload.expires_at ?? null,
    });
    if (!resp.ok()) {
      const text = await resp.text();
      throw new Error(`Failed to create invitation (${resp.status()}): ${text}`);
    }
    return (await resp.json()) as any;
  } finally {
    await client.dispose();
  }
}

export { DEMO_USERS };
