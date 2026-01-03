/**
 * Members table for a course. Shows avatar, name, email, role, joined_at, actions.
 */
import { MoreVertical, UserMinus, UserPlus } from 'lucide-react';
import type { CourseMember } from '@/api/endpoints/courses';
import { formatDate } from '@/utils/formatters';
import { EmptyState } from '@/components/common/EmptyState';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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

const ROLE_LABEL: Record<string, string> = {
  owner: 'Владелец',
  co_owner: 'Совладелец',
  assistant: 'Ассистент',
  student: 'Студент',
};

function roleBadge(role: string) {
  const label = ROLE_LABEL[role] ?? role;
  if (role === 'owner') {
    return (
      <Badge className="font-normal bg-primary text-primary-foreground hover:bg-primary">
        {label}
      </Badge>
    );
  }
  if (role === 'co_owner' || role === 'assistant') {
    return (
      <Badge className="font-normal bg-accent text-accent-foreground hover:bg-accent">
        {label}
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="font-normal">
      {label}
    </Badge>
  );
}

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
  if (members.length === 0) {
    return <EmptyState title="Нет участников" message="Пригласите первых студентов." />;
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Участник</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Роль</TableHead>
            <TableHead>Присоединился</TableHead>
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
              <TableCell>{roleBadge(m.role)}</TableCell>
              <TableCell>
                <span className="text-sm">{formatDate(m.joined_at)}</span>
              </TableCell>
              {canManage && (
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label="Действия">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {onPromote && m.role === 'student' && (
                        <DropdownMenuItem onClick={() => onPromote(m)}>
                          <UserPlus className="mr-2 h-4 w-4" />
                          Назначить ассистентом
                        </DropdownMenuItem>
                      )}
                      {onRemove && (
                        <DropdownMenuItem
                          onClick={() => onRemove(m)}
                          className="text-destructive focus:text-destructive"
                        >
                          <UserMinus className="mr-2 h-4 w-4" />
                          Удалить из курса
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
