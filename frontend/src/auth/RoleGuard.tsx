/**
 * Renders children only if user has any of the given roles.
 * Optionally checks course role for a specific course_id.
 */
import { ReactNode } from 'react';
import type { CourseRole, GlobalRole } from '@/api/types';
import { useAuth } from './useAuth';

interface RoleGuardProps {
  global?: GlobalRole | GlobalRole[];
  course?: { id: string; roles: CourseRole | CourseRole[] };
  fallback?: ReactNode;
  children: ReactNode;
}

export function hasGlobalRole(
  user: { global_role: GlobalRole } | null,
  roles: GlobalRole | GlobalRole[],
): boolean {
  if (!user) return false;
  const arr = Array.isArray(roles) ? roles : [roles];
  return arr.includes(user.global_role);
}

export function hasCourseRole(
  user: { course_roles: Record<string, CourseRole> } | null,
  course_id: string,
  roles: CourseRole | CourseRole[],
): boolean {
  if (!user) return false;
  const r = user.course_roles[course_id];
  if (!r) return false;
  const arr = Array.isArray(roles) ? roles : [roles];
  return arr.includes(r);
}

export function RoleGuard({ global, course, fallback = null, children }: RoleGuardProps) {
  const { user } = useAuth();
  if (!user) return <>{fallback}</>;
  // super_admin can do anything
  if (user.global_role === 'super_admin') return <>{children}</>;
  if (global && !hasGlobalRole(user, global)) return <>{fallback}</>;
  if (course && !hasCourseRole(user, course.id, course.roles)) return <>{fallback}</>;
  return <>{children}</>;
}
