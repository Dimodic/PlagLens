/**
 * /assignments/:assignmentId/ai-analyses — table of analyses for an assignment.
 */
import { ExternalLink, Loader2 } from 'lucide-react';
import dayjs from 'dayjs';
import { Link, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { EmptyState } from '@/components/common/EmptyState';
import { AnalysisStatusBadge } from '@/components/ai/AnalysisStatusBadge';
import { Page, PageHeader } from '@/components/layout/Page';
import { CostFormatter } from '@/components/ai/CostFormatter';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useTranslation } from '@/i18n';
import { useAnalysesForAssignment } from '@/hooks/api/useAi';
import type { Problem } from '@/api/types';

function fmt(d: string | null): string {
  return d ? dayjs(d).format('DD.MM HH:mm') : '—';
}

export function AnalysisListPage() {
  const { t } = useTranslation();
  const { assignmentId = '' } = useParams<{ assignmentId: string }>();
  useDocumentTitle(t('analysis_list.document_title'));
  const { data, isLoading, error } = useAnalysesForAssignment(assignmentId, { limit: 200 });

  return (
    <Page width="wide">
      <PageHeader title={t('analysis_list.title')} />

      {error && <ProblemAlert problem={error as unknown as Problem} />}

      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : data && data.data.length === 0 ? (
        <EmptyState
          title={t('analysis_list.empty_title')}
          message={t('analysis_list.empty_message')}
        />
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table data-testid="ai-analysis-list-table" className="min-w-[1000px]">
            <TableHeader>
              <TableRow>
                <TableHead>Submission</TableHead>
                <TableHead>{t('analysis_list.col_author')}</TableHead>
                <TableHead>{t('analysis_list.col_status')}</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Tokens</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead>{t('analysis_list.col_finished')}</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.data.map((a) => (
                <TableRow key={a.id} data-testid={`ai-analysis-row-${a.id}`}>
                  <TableCell>
                    <Link
                      to={`/submissions/${a.submission_id}`}
                      className="text-sm text-primary hover:underline"
                    >
                      {a.submission_id.slice(0, 12)}…
                    </Link>
                  </TableCell>
                  <TableCell>{a.author?.display_name ?? '—'}</TableCell>
                  <TableCell>
                    <AnalysisStatusBadge status={a.status} />
                  </TableCell>
                  <TableCell>{a.provider}</TableCell>
                  <TableCell>{a.model}</TableCell>
                  <TableCell>{a.total_tokens}</TableCell>
                  <TableCell>
                    <CostFormatter value={a.cost_estimate} />
                  </TableCell>
                  <TableCell>{fmt(a.finished_at)}</TableCell>
                  <TableCell>
                    <Button
                      asChild
                      variant="ghost"
                      size="icon"
                      aria-label="open"
                    >
                      <Link to={`/submissions/${a.submission_id}/ai-report`}>
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Page>
  );
}

export default AnalysisListPage;
