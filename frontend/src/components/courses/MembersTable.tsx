/**
 * Members table for a course. Shows avatar, name, email, role, joined_at, actions.
 */
import { MoreVertical, UserMinus, UserPlus } from 'lucide-react';
import type { CourseMember } from '@/api/endpoints/courses';
import { useTranslation } from '@/i18n';
import { formatDate } from '@/utils/formatters';
import { EmptyState } from '@/components/common/EmptyState';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { RoleBadge } from '@/components/common/RoleBadge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface MembersTableProps {
  members: CourseMember[];
  canManage?: boolean;
  onRemove?: (member: CourseMember) => void;
  onPromote?: (member: CourseMember) => void;
}

export function MembersTable({
  members,
  canManage,
  onRemove,
  onPromote,
}: MembersTableProps) {
  const { t } = useTranslation();

  if (members.length === 0) {
    return (
      <EmptyState
        title={t('members_table.empty_title')}
        message={t('members_table.empty_message')}
      />
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('members_table.col_member')}</TableHead>
            <TableHead>{t('members_table.col_email')}</TableHead>
            <TableHead>{t('members_table.col_role')}</TableHead>
            <TableHead>{t('members_table.col_joined')}</TableHead>
            {canManage && <TableHead />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((m) => (
            <TableRow key={m.id} data-testid={`member-row-${m.user_id}`}>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Avatar className="h-8 w-8">
                    {m.user?.avatar_url && (
                      <AvatarImage src={m.user.avatar_url} alt={m.user?.display_name ?? ''} />
                    )}
                    <AvatarFallback>
                      {(m.user?.display_name ?? '?').slice(0, 1).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium">
                    {m.user?.display_name ?? m.user_id}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <span className="text-sm text-muted-foreground">
                  {m.user?.email ?? '—'}
                </span>
              </TableCell>
              <TableCell>
                <RoleBadge role={m.role} />
              </TableCell>
              <TableCell>
                <span className="text-sm">{formatDate(m.joined_at)}</span>
              </TableCell>
              {canManage && (
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label={t('members_table.actions')}>
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {onPromote && m.role === 'student' && (
                        <DropdownMenuItem onClick={() => onPromote(m)}>
                          <UserPlus className="mr-2 h-4 w-4" />
                          {t('members_table.promote_assistant')}
                        </DropdownMenuItem>
                      )}
                      {onRemove && (
                        <DropdownMenuItem
                          onClick={() => onRemove(m)}
                          className="text-destructive focus:text-destructive"
                        >
                          <UserMinus className="mr-2 h-4 w-4" />
                          {t('members_table.remove_from_course')}
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
