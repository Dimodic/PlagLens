import { z } from 'zod';

export const emailSchema = z
  .string()
  .min(3, 'Слишком короткий email')
  .max(254, 'Слишком длинный email')
  .email('Некорректный email');

/**
 * Password policy: ≥8 chars, at least one letter and one digit.
 * (Backend enforces a stricter policy; this is a friendly UI hint.)
 */
export const passwordSchema = z
  .string()
  .min(8, 'Минимум 8 символов')
  .max(128, 'Слишком длинный пароль')
  .regex(/[A-Za-zА-Яа-яЁё]/, 'Должна быть хотя бы одна буква')
  .regex(/[0-9]/, 'Должна быть хотя бы одна цифра');

export const tenantSlugSchema = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9-]+$/i, 'Только латиница, цифры и дефисы');

export function passwordStrength(pw: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  const labels = ['Слабый', 'Слабый', 'Средний', 'Хороший', 'Отличный'] as const;
  const s = score as 0 | 1 | 2 | 3 | 4;
  return { score: s, label: labels[s] };
}
