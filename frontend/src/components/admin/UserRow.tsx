/**
 * Single user row for the admin Users list.
 */
import { ReactNode } from 'react';
import dayjs from 'dayjs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { TableCell, TableRow } from '@/components/ui/table';
import type { UserDetail } from '@/api/endpoints/users';
import type { GlobalRole } from '@/api/types';

const ROLE_CLASS: Record<GlobalRole, string> = {
  super_admin: 'bg-sev-high-bg text-sev-high hover:bg-sev-high-bg',
  admin: 'bg-accent text-accent-foreground hover:bg-accent',
  teacher: 'bg-sev-low-bg text-sev-low hover:bg-sev-low-bg',
  student: '',
};

interface UserRowProps {
  user: UserDetail;
  actions?: ReactNode;
}

export function UserRow({ user, actions }: UserRowProps) {
  const initials = user.display_name.slice(0, 2).toUpperCase();
  return (
    <TableRow data-testid={`user-row-${user.email}`} data-user-id={user.id}>
      <TableCell>
        <div className="flex items-center gap-2">
          <Avatar className="h-8 w-8">
            {user.avatar_url && <AvatarImage src={user.avatar_url} alt={user.display_name} />}
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <span className="text-sm font-medium">{user.display_name}</span>
            <span className="text-xs text-muted-foreground">{user.email}</span>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <Badge variant="outline" className={`font-normal ${ROLE_CLASS[user.global_role] ?? ''}`}>
          {user.global_role}
        </Badge>
      </TableCell>
      <TableCell>
        {user.status === 'active' ? (
          <Badge variant="outline" className="font-normal bg-sev-low-bg text-sev-low hover:bg-sev-low-bg">
            {user.status}
          </Badge>
        ) : (
          <Badge variant="secondary" className="font-normal">
            {user.status}
          </Badge>
        )}
      </TableCell>
      <TableCell>
        <span className="text-xs text-muted-foreground">
          {user.last_login_at
            ? dayjs(user.last_login_at).format('DD.MM.YYYY HH:mm')
            : '—'}
        </span>
      </TableCell>
      <TableCell>
        <span className="text-xs text-muted-foreground">
          {dayjs(user.created_at).format('DD.MM.YYYY')}
        </span>
      </TableCell>
      <TableCell>{actions}</TableCell>
    </TableRow>
  );
}

export default UserRow;
