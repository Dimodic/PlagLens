/**
 * LateSubmissionsList — table of late submissions.
 */
import dayjs from 'dayjs';
import { Link } from 'react-router-dom';
import type { LateSubmission } from '@/api/endpoints/reporting';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState } from '@/components/common/EmptyState';
import { useTranslation } from '@/i18n';

interface LateSubmissionsListProps {
  items: LateSubmission[] | undefined;
}

export function LateSubmissionsList({ items }: LateSubmissionsListProps) {
  const { t } = useTranslation();
  if (!items || items.length === 0) {
    return <EmptyState title={t('late_submissions.empty_title')} />;
  }
  return (
    <Card data-testid="late-submissions-list">
      <CardContent className="p-4">
        <div className="flex flex-col gap-3">
          <span className="font-medium">{t('late_submissions.heading')}</span>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('late_submissions.col_student')}</TableHead>
                <TableHead>{t('late_submissions.col_assignment')}</TableHead>
                <TableHead>{t('late_submissions.col_delay')}</TableHead>
                <TableHead>{t('late_submissions.col_kind')}</TableHead>
                <TableHead>{t('late_submissions.col_date')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((it) => (
                <TableRow
                  key={it.submission_id}
                  data-testid={`late-row-${it.submission_id}`}
                >
                  <TableCell>{it.display_name}</TableCell>
                  <TableCell>
                    <Link
                      to={`/assignments/${it.assignment_id}`}
                      className="text-primary hover:underline"
                    >
                      {it.assignment_title}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {t('late_submissions.delay_hours', {
                      hours: Math.round(it.delay_minutes / 60),
                    })}
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={
                        it.late_kind === 'hard'
                          ? 'bg-sev-high-bg text-sev-high font-normal'
                          : 'bg-sev-mid-bg text-sev-mid font-normal'
                      }
                    >
                      {it.late_kind}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {dayjs(it.submitted_at).format('DD.MM.YYYY HH:mm')}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
