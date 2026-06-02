/**
 * RoleBadge — the one role chip across the whole app.
 *
 * Each role gets a distinct, calm colour (soft tinted fill + matching text,
 * no border, no dot) so roles read at a glance — unlike the old neutral
 * dot-pill where Студент / Ассистент / Преподаватель were indistinguishable.
 * Handles both global roles (admin / teacher / assistant / student) and
 * course roles (owner / co_owner); unknown roles fall back to neutral.
 *
 *   <RoleBadge role={user.global_role} />
 */
import { cn } from '@/components/ui/utils';
import { useTranslation } from '@/i18n';

const LABEL_KEY: Record<string, string> = {
  admin: 'role_badge.admin',
  teacher: 'role_badge.teacher',
  owner: 'role_badge.owner',
  co_owner: 'role_badge.co_owner',
  assistant: 'role_badge.assistant',
  student: 'role_badge.student',
};

// Muted tinted fill + deliberately dimmed text so chips sit at the same
// visual weight as the rest of the (dark, low-saturation) UI — colour is a
// quiet hint, not a highlight. Dark-mode text is held at ~80% to avoid neon.
const STYLE: Record<string, string> = {
  admin: 'bg-amber-500/10 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300/80',
  teacher:
    'bg-indigo-500/10 text-indigo-600 dark:bg-indigo-400/10 dark:text-indigo-300/80',
  owner:
    'bg-violet-500/10 text-violet-600 dark:bg-violet-400/10 dark:text-violet-300/80',
  co_owner:
    'bg-violet-500/10 text-violet-600 dark:bg-violet-400/10 dark:text-violet-300/80',
  assistant:
    'bg-teal-500/10 text-teal-700 dark:bg-teal-400/10 dark:text-teal-300/80',
  student:
    'bg-slate-500/10 text-slate-600 dark:bg-slate-400/10 dark:text-slate-300/80',
};

const NEUTRAL = 'bg-muted text-muted-foreground';

export interface RoleBadgeProps {
  role: string;
  className?: string;
  'data-testid'?: string;
}

export function RoleBadge({ role, className, ...rest }: RoleBadgeProps) {
  const { t } = useTranslation();
  const labelKey = LABEL_KEY[role];
  const label = labelKey ? t(labelKey) : role;
  const style = STYLE[role] ?? NEUTRAL;
  return (
    <span
      data-testid={rest['data-testid']}
      data-role={role}
      className={cn(
        'inline-flex w-fit items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium',
        style,
        className,
      )}
    >
      {label}
    </span>
  );
}

export default RoleBadge;
