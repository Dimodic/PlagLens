/**
 * Sessions table — for /me/security and admin user detail.
 */
import { LogOut, Loader2 } from 'lucide-react';
import dayjs from 'dayjs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useTranslation } from '@/i18n';
import type { UserSession } from '@/api/endpoints/users';

interface Props {
  sessions: UserSession[];
  onRevoke?: (id: string) => void;
  loadingId?: string | null;
  /** If true, "current" badge for sessions marked current. */
  showCurrent?: boolean;
}

export function SessionsTable({
  sessions,
  onRevoke,
  loadingId,
  showCurrent = true,
}: Props) {
  const { t } = useTranslation();
  if (sessions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t('sessions_table.empty')}
      </p>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>IP</TableHead>
            <TableHead>User-Agent</TableHead>
            <TableHead>{t('sessions_table.col_created')}</TableHead>
            <TableHead>{t('sessions_table.col_activity')}</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sessions.map((s) => (
            <TableRow key={s.id} data-testid={`session-row-${s.id}`}>
              <TableCell>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs">{s.ip}</span>
                  {showCurrent && s.current && (
                    <Badge variant="secondary" className="font-normal">
                      {t('sessions_table.current')}
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <span className="block max-w-[260px] truncate text-xs">
                  {s.user_agent}
                </span>
              </TableCell>
              <TableCell>
                <span className="text-xs text-muted-foreground">
                  {dayjs(s.created_at).format('DD.MM.YYYY HH:mm')}
                </span>
              </TableCell>
              <TableCell>
                <span className="text-xs text-muted-foreground">
                  {s.last_used_at
                    ? dayjs(s.last_used_at).format('DD.MM HH:mm')
                    : '—'}
                </span>
              </TableCell>
              <TableCell>
                {onRevoke && !s.current && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    disabled={loadingId === s.id}
                    onClick={() => onRevoke(s.id)}
                  >
                    {loadingId === s.id ? (
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <LogOut className="mr-2 h-3.5 w-3.5" />
                    )}
                    {t('sessions_table.revoke')}
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default SessionsTable;
