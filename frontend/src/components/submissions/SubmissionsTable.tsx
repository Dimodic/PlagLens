/**
 * Submissions table — used inside an assignment's submissions tab.
 */
import { ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { displayAuthor } from '@/api/endpoints/submissions';
import type { SubmissionBrief } from '@/api/endpoints/submissions';
import { useTranslation } from '@/i18n';
import { formatDateTime } from '@/utils/formatters';
import { EmptyState } from '@/components/common/EmptyState';
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

interface SubmissionsTableProps {
  submissions: SubmissionBrief[];
  showAuthor?: boolean;
}

const STATUS_LABEL_KEY: Record<string, string> = {
  received: 'submissions_table.status_received',
  processing: 'submissions_table.status_processing',
  ready: 'submissions_table.status_ready',
  error: 'submissions_table.status_error',
};

function statusBadge(status: string, label: string) {
  if (status === 'error')
    return (
      <Badge variant="destructive" className="font-normal">
        {label}
      </Badge>
    );
  if (status === 'ready')
    return (
      <Badge className="font-normal bg-accent text-accent-foreground hover:bg-accent">
        {label}
      </Badge>
    );
  if (status === 'processing')
    return (
      <Badge variant="outline" className="font-normal">
        {label}
      </Badge>
    );
  return (
    <Badge variant="secondary" className="font-normal">
      {label}
    </Badge>
  );
}

export function SubmissionsTable({
  submissions,
  showAuthor = true,
}: SubmissionsTableProps) {
  const { t } = useTranslation();
  if (submissions.length === 0) {
    return <EmptyState title={t('submissions_table.empty')} />;
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {showAuthor && <TableHead>{t('submissions_table.col_author')}</TableHead>}
            <TableHead>{t('submissions_table.col_version')}</TableHead>
            <TableHead>{t('submissions_table.col_submitted')}</TableHead>
            <TableHead>{t('submissions_table.col_language')}</TableHead>
            <TableHead>{t('submissions_table.col_status')}</TableHead>
            <TableHead>{t('submissions_table.col_flags')}</TableHead>
            <TableHead>{t('submissions_table.col_score')}</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {submissions.map((s) => (
            <TableRow key={s.id} data-testid={`submission-table-row-${s.id}`}>
              {showAuthor && (
                <TableCell>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">
                      {displayAuthor(s)}
                    </span>
                    {s.author?.email && (
                      <span className="text-xs text-muted-foreground">
                        {s.author.email}
                      </span>
                    )}
                  </div>
                </TableCell>
              )}
              <TableCell>
                <Badge variant="outline" className="font-normal">
                  v{s.version}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <span className="text-sm">{formatDateTime(s.submitted_at)}</span>
                  {s.is_late && (
                    <Badge
                      className={
                        s.late_kind === 'hard'
                          ? 'bg-sev-high-bg text-sev-high font-normal text-xs'
                          : 'bg-sev-mid-bg text-sev-mid font-normal text-xs'
                      }
                      data-testid={`submission-row-late-${s.id}`}
                      data-late-kind={s.late_kind ?? ''}
                    >
                      {s.late_kind === 'hard' ? 'late hard' : 'late'}
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <span className="text-sm">{s.language}</span>
              </TableCell>
              <TableCell>
                {statusBadge(
                  s.status,
                  t(STATUS_LABEL_KEY[s.status] ?? '') || s.status,
                )}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  {s.flags?.suspicious && (
                    <Badge className="bg-sev-high-bg text-sev-high font-normal text-xs">
                      {t('submissions_table.flag_suspicious')}
                    </Badge>
                  )}
                  {s.flags?.llm_attention && (
                    <Badge className="bg-sev-mid-bg text-sev-mid font-normal text-xs">
                      LLM
                    </Badge>
                  )}
                  {s.flags?.manually_flagged && (
                    <Badge variant="outline" className="font-normal text-xs">
                      {t('submissions_table.flag_manual')}
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <span className="text-sm font-medium">
                  {typeof s.score === 'number' ? s.score.toFixed(1) : '—'}
                </span>
              </TableCell>
              <TableCell className="text-right">
                <Button
                  asChild
                  variant="ghost"
                  size="icon"
                  aria-label={t('submissions_table.open')}
                >
                  <Link to={`/submissions/${s.id}`}>
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
