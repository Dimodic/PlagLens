/**
 * /courses/:slug/suspicious — list of all flagged submissions in a course.
 */
import { ChevronUp, ExternalLink, Loader2, ShieldOff } from 'lucide-react';
import dayjs from 'dayjs';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { StatusPill, type StatusTone } from '@/components/common/StatusPill';
import { Button } from '@/components/ui/button';
import { Page } from '@/components/layout/Page';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { EmptyState } from '@/components/common/EmptyState';
import { SimilarityBar } from '@/components/plagiarism/SimilarityBar';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useNotifications } from '@/hooks/useNotifications';
import {
  useDismissFlag,
  useSetFlagSeverity,
  useSuspiciousSubmissions,
} from '@/hooks/api/usePlagiarism';
import type { FlagSeverity } from '@/api/endpoints/plagiarism';
import type { Problem } from '@/api/types';

const SEVERITY_TONES: Record<FlagSeverity, StatusTone> = {
  low: 'info',
  medium: 'warning',
  high: 'destructive',
};

export function SuspiciousSubmissionsPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  useDocumentTitle('Подозрительные отправки');
  const notify = useNotifications();

  const [severity, setSeverity] = useState<FlagSeverity | ''>('');
  const [dismissed, setDismissed] = useState<'active' | 'dismissed' | 'all'>('active');

  const { data, isLoading, error } = useSuspiciousSubmissions(slug, {
    severity: severity || undefined,
    dismissed,
  });
  const dismissMut = useDismissFlag();
  const sevMut = useSetFlagSeverity();

  const handleDismiss = async (subId: string, flagId: string) => {
    try {
      await dismissMut.mutateAsync({ submissionId: subId, flagId, reason: 'manual review' });
      notify.success('Помечено как «не подозрительно»');
    } catch (e) {
      const p = e as Problem;
      notify.error(p?.detail ?? p?.title ?? 'Не удалось снять флаг');
    }
  };

  const handleSeverity = async (subId: string, flagId: string, sev: FlagSeverity) => {
    try {
      await sevMut.mutateAsync({ submissionId: subId, flagId, severity: sev });
      notify.success('Severity обновлён');
    } catch (e) {
      const p = e as Problem;
      notify.error(p?.detail ?? p?.title ?? 'Не удалось обновить');
    }
  };

  return (
    <Page width="wide">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">
          Подозрительные отправки
        </h1>
        <div className="flex items-center gap-2">
          <Select
            value={severity || 'all'}
            onValueChange={(v) => setSeverity((v === 'all' ? '' : v) as FlagSeverity | '')}
          >
            <SelectTrigger
              className="w-40"
              data-testid="suspicious-severity-filter"
            >
              <SelectValue placeholder="Severity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все</SelectItem>
              <SelectItem value="low">low</SelectItem>
              <SelectItem value="medium">medium</SelectItem>
              <SelectItem value="high">high</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={dismissed}
            onValueChange={(v) => v && setDismissed(v as typeof dismissed)}
          >
            <SelectTrigger
              className="w-40"
              data-testid="suspicious-dismissed-filter"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Активные</SelectItem>
              <SelectItem value="dismissed">Снятые</SelectItem>
              <SelectItem value="all">Все</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {error && <ProblemAlert problem={error as unknown as Problem} />}

      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : data && data.data.length === 0 ? (
        <EmptyState title="Нет подозрительных" />
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table data-testid="suspicious-table" className="min-w-[900px]">
            <TableHeader>
              <TableRow>
                <TableHead>Студент</TableHead>
                <TableHead>Задание</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Similarity</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Создано</TableHead>
                <TableHead>Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.data.map((s) => (
                <TableRow
                  key={s.flag_id}
                  data-testid={`suspicious-row-${s.flag_id}`}
                >
                  <TableCell>
                    {s.author?.display_name ?? s.author_display_name ?? '—'}
                  </TableCell>
                  <TableCell>{s.assignment_title ?? s.assignment_id ?? '—'}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <span data-testid={`suspicious-row-${s.flag_id}-severity`}>
                        <StatusPill tone={SEVERITY_TONES[s.severity]}>
                          {s.severity}
                        </StatusPill>
                      </span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            aria-label="bump severity"
                            onClick={() => {
                              const next: FlagSeverity =
                                s.severity === 'low'
                                  ? 'medium'
                                  : s.severity === 'medium'
                                    ? 'high'
                                    : 'high';
                              void handleSeverity(s.submission_id, s.flag_id, next);
                            }}
                            data-testid={`suspicious-row-${s.flag_id}-bump`}
                          >
                            <ChevronUp className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Повысить severity</TooltipContent>
                      </Tooltip>
                    </div>
                  </TableCell>
                  <TableCell>
                    {s.similarity != null ? (
                      <SimilarityBar value={s.similarity} width={120} />
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">{s.reason}</span>
                  </TableCell>
                  <TableCell>{dayjs(s.created_at).format('DD.MM.YYYY HH:mm')}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            asChild
                            variant="ghost"
                            size="icon"
                            aria-label="open submission"
                          >
                            <Link to={`/submissions/${s.submission_id}`}>
                              <ExternalLink className="h-4 w-4" />
                            </Link>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Открыть отправку</TooltipContent>
                      </Tooltip>
                      {!s.cleared_at && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-emerald-600"
                              onClick={() =>
                                handleDismiss(s.submission_id, s.flag_id)
                              }
                              disabled={dismissMut.isPending}
                              aria-label="dismiss"
                              data-testid={`suspicious-row-${s.flag_id}-dismiss`}
                            >
                              {dismissMut.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <ShieldOff className="h-4 w-4" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Снять подозрение</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
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

export default SuspiciousSubmissionsPage;
