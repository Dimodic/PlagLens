/**
 * Context menu of actions for a single admin user row.
 */
import {
  Ban,
  Check,
  Eye,
  Key,
  LogOut,
  MoreVertical,
  ShieldX,
  UserCheck,
  UserX,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTranslation } from '@/i18n';
import { cn } from '@/components/ui/utils';
import type { UserDetail } from '@/api/endpoints/users';
import type { GlobalRole } from '@/api/types';
import { shortId } from '@/utils/formatters';

const ROLE_ORDER: GlobalRole[] = ['student', 'assistant', 'teacher', 'admin'];

export interface UserActionHandlers {
  onView?: (u: UserDetail) => void;
  onAnonymize?: (u: UserDetail) => void;
  onResetPassword?: (u: UserDetail) => void;
  onForceLogout?: (u: UserDetail) => void;
  onDisable?: (u: UserDetail) => void;
  onEnable?: (u: UserDetail) => void;
  /** Admin-only — change the user's global role. Omit to hide the role
   *  switcher (e.g. for teacher viewers who can list but not re-role). */
  onChangeRole?: (u: UserDetail, role: GlobalRole) => void;
}

interface UserActionMenuProps extends UserActionHandlers {
  user: UserDetail;
}

export function UserActionMenu({
  user,
  onView,
  onAnonymize,
  onResetPassword,
  onForceLogout,
  onDisable,
  onEnable,
  onChangeRole,
}: UserActionMenuProps) {
  const { t } = useTranslation();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('user_action_menu.trigger_label', {
            name: user.display_name,
          })}
          data-testid={`user-actions-trigger-${user.email}`}
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {onView && (
          <DropdownMenuItem
            onClick={() => onView(user)}
            data-testid={`user-action-view-${user.email}`}
          >
            <Eye className="mr-2 h-4 w-4" />
            {t('user_action_menu.view')}
          </DropdownMenuItem>
        )}
        {onResetPassword && (
          <DropdownMenuItem
            onClick={() => onResetPassword(user)}
            data-testid={`user-action-reset-password-${user.email}`}
          >
            <Key className="mr-2 h-4 w-4" />
            {t('user_action_menu.reset_password')}
          </DropdownMenuItem>
        )}
        {onForceLogout && (
          <DropdownMenuItem
            onClick={() => onForceLogout(user)}
            data-testid={`user-action-force-logout-${user.email}`}
          >
            <LogOut className="mr-2 h-4 w-4" />
            {t('user_action_menu.force_logout')}
          </DropdownMenuItem>
        )}
        {user.status === 'active' && onDisable && (
          <DropdownMenuItem
            onClick={() => onDisable(user)}
            data-testid={`user-action-disable-${user.email}`}
          >
            <Ban className="mr-2 h-4 w-4" />
            {t('user_action_menu.disable')}
          </DropdownMenuItem>
        )}
        {user.status !== 'active' && onEnable && (
          <DropdownMenuItem
            onClick={() => onEnable(user)}
            data-testid={`user-action-enable-${user.email}`}
          >
            <UserCheck className="mr-2 h-4 w-4" />
            {t('user_action_menu.enable')}
          </DropdownMenuItem>
        )}
        {onChangeRole && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="font-normal text-xs text-muted-foreground">
              {t('user_action_menu.role_label')}
            </DropdownMenuLabel>
            {ROLE_ORDER.map((r) => (
              <DropdownMenuItem
                key={r}
                disabled={user.global_role === r}
                onClick={() => onChangeRole(user, r)}
                data-testid={`user-action-role-${r}-${user.email}`}
              >
                <Check
                  className={cn(
                    'mr-2 h-4 w-4',
                    user.global_role === r ? 'opacity-100' : 'opacity-0',
                  )}
                />
                {t(`user_action_menu.role_${r}`)}
              </DropdownMenuItem>
            ))}
          </>
        )}
        <DropdownMenuSeparator />
        {onAnonymize && (
          <DropdownMenuItem
            onClick={() => onAnonymize(user)}
            className="text-destructive focus:text-destructive"
            data-testid={`user-action-anonymize-${user.email}`}
          >
            <ShieldX className="mr-2 h-4 w-4" />
            {t('user_action_menu.anonymize')}
          </DropdownMenuItem>
        )}
        <DropdownMenuLabel className="font-normal text-xs text-muted-foreground">
          <UserX className="mr-2 inline-block h-3 w-3" />
          ID: {shortId(user.id)}
        </DropdownMenuLabel>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default UserActionMenu;
