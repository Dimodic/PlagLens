/**
 * /admin/plagiarism-corpus — admin view of cross-course corpus + rebuild action.
 */
import { Loader2, RefreshCw } from 'lucide-react';
import dayjs from 'dayjs';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { AsyncOperationStatus } from '@/components/common/AsyncOperationStatus';
import { Page, PageHeader } from '@/components/layout/Page';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useTranslation } from '@/i18n';
import { useNotifications } from '@/hooks/useNotifications';
import { useCorpusStats, useRebuildCorpus } from '@/hooks/api/usePlagiarism';
import type { Problem } from '@/api/types';

export function PlagiarismCorpusPage() {
  const { t } = useTranslation();
  useDocumentTitle('Plagiarism corpus');
  const notify = useNotifications();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [opId, setOpId] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useCorpusStats();
  const rebuild = useRebuildCorpus();

  const triggerRebuild = async () => {
    setConfirmOpen(false);
    try {
      const r = await rebuild.mutateAsync();
      setOpId(r.operation_id);
      notify.info(t('plagiarism_corpus.rebuild_started'));
    } catch (e) {
      const p = e as Problem;
      notify.error(p?.detail ?? p?.title ?? t('plagiarism_corpus.rebuild_failed'));
    }
  };

  return (
    <Page width="regular">
      <PageHeader
        title="Plagiarism corpus"
        action={
          <Button
            variant="outline"
            onClick={() => setConfirmOpen(true)}
            data-testid="plagiarism-corpus-rebuild"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            {t('plagiarism_corpus.rebuild')}
          </Button>
        }
      />

      {error && <ProblemAlert problem={error as unknown as Problem} />}

      {opId && (
        <Card>
          <CardContent className="p-4">
            <AsyncOperationStatus
              operationId={opId}
              onComplete={() => {
                setOpId(null);
                void refetch();
              }}
            />
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : data ? (
        <div className="space-y-4" data-testid="plagiarism-corpus-content">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card data-testid="plagiarism-corpus-stat-entries">
              <CardContent className="p-4 space-y-1">
                <div className="text-xs uppercase text-muted-foreground">
                  {t('plagiarism_corpus.stat_entries')}
                </div>
                <div className="text-xl font-bold">{data.entries_count}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 space-y-1">
                <div className="text-xs uppercase text-muted-foreground">
                  {t('plagiarism_corpus.stat_languages')}
                </div>
                <div className="text-xl font-bold">
                  {Object.keys(data.by_language ?? {}).length}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 space-y-1">
                <div className="text-xs uppercase text-muted-foreground">
                  {t('plagiarism_corpus.stat_courses')}
                </div>
                <div className="text-xl font-bold">
                  {data.by_course?.length ?? 0}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 space-y-1">
                <div className="text-xs uppercase text-muted-foreground">
                  {t('plagiarism_corpus.stat_last_rebuild')}
                </div>
                <div className="text-base font-bold">
                  {data.last_rebuild_at
                    ? dayjs(data.last_rebuild_at).format('DD.MM HH:mm')
                    : '—'}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="p-4">
              <h4 className="text-lg font-medium mb-3">
                {t('plagiarism_corpus.by_language')}
              </h4>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('plagiarism_corpus.col_language')}</TableHead>
                    <TableHead>{t('plagiarism_corpus.col_entries')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(data.by_language ?? {}).map(([lang, n]) => (
                    <TableRow key={lang}>
                      <TableCell>{lang}</TableCell>
                      <TableCell>{n}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {data.by_course && data.by_course.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <h4 className="text-lg font-medium mb-3">
                  {t('plagiarism_corpus.by_course')}
                </h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('plagiarism_corpus.col_course')}</TableHead>
                      <TableHead>{t('plagiarism_corpus.col_entries')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.by_course.map((c) => {
                      // Routes accept either slug or id (see App router).
                      const target = c.course_slug ?? c.course_id;
                      return (
                        <TableRow
                          key={c.course_id}
                          data-testid={`corpus-course-row-${c.course_id}`}
                        >
                          <TableCell>
                            <Link
                              to={`/courses/${target}`}
                              className="text-primary hover:underline"
                              data-testid={`corpus-course-link-${c.course_id}`}
                            >
                              {c.course_name ?? c.course_id}
                            </Link>
                          </TableCell>
                          <TableCell>{c.entries}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      ) : null}

      <ConfirmDialog
        opened={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={triggerRebuild}
        title={t('plagiarism_corpus.confirm_title')}
        confirmLabel={t('plagiarism_corpus.confirm_label')}
        loading={rebuild.isPending}
      />
    </Page>
  );
}

export default PlagiarismCorpusPage;
