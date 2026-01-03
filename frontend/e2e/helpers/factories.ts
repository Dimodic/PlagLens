/**
 * Test data factories — produce deterministic-but-unique inputs.
 *
 * Each test should generate its own slug to avoid cross-test collisions when
 * running with --workers > 1 and --shuffle.
 */
import { randomBytes } from 'node:crypto';

export function uniqueSlug(prefix = 'e2e'): string {
  return `${prefix}-${randomBytes(4).toString('hex')}`;
}

export function uniqueEmail(prefix = 'e2e'): string {
  return `${prefix}-${randomBytes(4).toString('hex')}@e2e.local`;
}

export function buildRegisterInput(overrides: Partial<{
  email: string;
  password: string;
  display_name: string;
  tenant_slug: string;
  invitation_token: string;
}> = {}) {
  return {
    email: uniqueEmail('reg'),
    password: 'Tr0ub4dor3-Test!',
    display_name: 'E2E Tester',
    tenant_slug: 'demo-hse',
    ...overrides,
  };
}

export function buildCourseInput(overrides: Partial<{
  slug: string;
  name: string;
  description: string;
}> = {}) {
  const slug = uniqueSlug('course');
  return {
    slug,
    name: `E2E Course ${slug}`,
    description: 'Created by Playwright E2E test',
    ...overrides,
  };
}

export function buildAssignmentInput(overrides: Partial<{
  slug: string;
  title: string;
  language: string;
}> = {}) {
  const slug = uniqueSlug('assign');
  return {
    slug,
    title: `E2E Assignment ${slug}`,
    language: 'python',
    ...overrides,
  };
}
