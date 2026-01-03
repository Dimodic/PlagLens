/**
 * Context menu of actions for a single admin user row.
 */
import {
  Ban,
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
import type { UserDetail } from '@/api/endpoints/users';

export interface UserActionHandlers {
  onView?: (u: UserDetail) => void;
  onAnonymize?: (u: UserDetail) => void;
  onResetPassword?: (u: UserDetail) => void;
  onForceLogout?: (u: UserDetail) => void;
  onDisable?: (u: UserDetail) => void;
  onEnable?: (u: UserDetail) => void;
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
}: UserActionMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Действия: ${user.display_name}`}
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
            Открыть
          </DropdownMenuItem>
        )}
        {onResetPassword && (
          <DropdownMenuItem
            onClick={() => onResetPassword(user)}
            data-testid={`user-action-reset-password-${user.email}`}
          >
            <Key className="mr-2 h-4 w-4" />
            Сбросить пароль
          </DropdownMenuItem>
        )}
        {onForceLogout && (
          <DropdownMenuItem
            onClick={() => onForceLogout(user)}
            data-testid={`user-action-force-logout-${user.email}`}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Завершить все сессии
          </DropdownMenuItem>
        )}
        {user.status === 'active' && onDisable && (
          <DropdownMenuItem
            onClick={() => onDisable(user)}
            data-testid={`user-action-disable-${user.email}`}
          >
            <Ban className="mr-2 h-4 w-4" />
            Заблокировать
          </DropdownMenuItem>
        )}
        {user.status !== 'active' && onEnable && (
          <DropdownMenuItem
            onClick={() => onEnable(user)}
            data-testid={`user-action-enable-${user.email}`}
          >
            <UserCheck className="mr-2 h-4 w-4" />
            Разблокировать
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        {onAnonymize && (
          <DropdownMenuItem
            onClick={() => onAnonymize(user)}
            className="text-destructive focus:text-destructive"
            data-testid={`user-action-anonymize-${user.email}`}
          >
            <ShieldX className="mr-2 h-4 w-4" />
            Анонимизировать (GDPR)
          </DropdownMenuItem>
        )}
        <DropdownMenuLabel className="font-normal text-xs text-muted-foreground">
          <UserX className="mr-2 inline-block h-3 w-3" />
          ID: {user.id}
        </DropdownMenuLabel>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default UserActionMenu;
