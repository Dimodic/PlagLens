import type { GlobalRole } from '@/api/types';

/** Russian display labels for the global roles. */
export const GLOBAL_ROLE_LABEL: Record<GlobalRole, string> = {
  admin: 'Админ',
  teacher: 'Преподаватель',
  assistant: 'Ассистент',
  student: 'Студент',
};

/** Safe label lookup that falls back to the raw role string. */
export function roleLabel(role: string): string {
  return (GLOBAL_ROLE_LABEL as Record<string, string>)[role] ?? role;
}
