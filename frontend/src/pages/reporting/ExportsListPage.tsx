/**
 * ExportsListPage — list of exports.
 *
 * Three call sites with different semantics use the same component:
 *   - /me/exports — student "Мои экспорты" (own data only).
 *   - /reports — teacher "Отчёты курса" (own teacher exports).
 *   - /admin/exports — admin "Экспорты тенанта" (all exports in tenant).
 *
 * The `mode` prop controls the title and subtitle so the screen reads naturally
 * for each role. Filtering itself is enforced by the backend (each user only
 * sees rows their RBAC scope allows), so the same hook works for all modes.
 */
import { Loader2, Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
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
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Page, PageHeader } from '@/components/layout/Page';
import { ExportRow } from '@/components/reporting/ExportRow';
import { ExportCreateModal } from '@/components/reporting/ExportCreateModal';
import { EmptyState } from '@/components/common/EmptyState';
import { useNotifications } from '@/hooks/useNotifications';
import {
  useCancelExport,
  useCreateExport,
  useDeleteExport,
  useDownloadExport,
  useExports,
  useRetryExport,
} from '@/hooks/api/useReporting';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useTranslation } from '@/i18n';
import type { ExportStatus } from '@/api/endpoints/reporting';
import type { Problem } from '@/api/types';

export type ExportsListMode = 'student' | 'teacher' | 'admin';

interface ExportsListPageProps {
  mode?: ExportsListMode;
}

const MODE_KEY: Record<ExportsListMode, string> = {
  student: 'exports_list.title_student',
  teacher: 'exports_list.title_teacher',
  admin: 'exports_list.title_admin',
};

const ALL_STATUSES = '__all__';

export default function ExportsListPage({ mode = 'student' }: ExportsListPageProps = {}) {
  const { t } = useTranslation();
  const title = t(MODE_KEY[mode]);
  useDocumentTitle(title);
  const notify = useNotifications();
  const [status, setStatus] = useState<ExportStatus | undefined>();
  const { data, isLoading } = useExports({ status });
  const [opened, setOpened] = useState(false);

  const create = useCreateExport();
  const dl = useDownloadExport();
  const retry = useRetryExport();
  const cancel = useCancelExport();
  const remove = useDeleteExport();

  const onDownload = async (id: string) => {
    try {
      const r = await dl.mutateAsync(id);
      // Open the signed URL in a new tab.
      if (typeof window !== 'undefined') {
        window.open(r.url, '_blank', 'noopener');
      }
    } catch (p) {
      notify.error((p as unknown as Problem).title || t('exports_list.error_link'));
    }
  };

  const items = data?.data ?? [];

  return (
    <Page width={mode === 'admin' || items.length > 0 ? 'wide' : 'regular'}>
      <PageHeader
        title={title}
        action={
          <div className="flex items-center gap-2">
            <Select
              value={status ?? ALL_STATUSES}
              onValueChange={(v) =>
                setStatus(v === ALL_STATUSES ? undefined : (v as ExportStatus))
              }
            >
              <SelectTrigger className="w-44" data-testid="status-filter">
                <SelectValue placeholder={t('exports_list.status_any')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_STATUSES}>{t('exports_list.status_any')}</SelectItem>
                <SelectItem value="queued">{t('exports_list.status_queued')}</SelectItem>
                <SelectItem value="running">{t('exports_list.status_running')}</SelectItem>
                <SelectItem value="completed">{t('exports_list.status_completed')}</SelectItem>
                <SelectItem value="failed">{t('exports_list.status_failed')}</SelectItem>
                <SelectItem value="cancelled">{t('exports_list.status_cancelled')}</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={() => setOpened(true)}>
              <Plus className="mr-2 h-4 w-4" />
              {t('exports_list.new_export')}
            </Button>
          </div>
        }
      />

      {isLoading ? (
        <div className="flex items-center py-3">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title={t('exports_list.empty_title')}
          message={t('exports_list.empty_message')}
          action={<Button onClick={() => setOpened(true)}>{t('exports_list.create')}</Button>}
        />
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table data-testid="exports-table">
            <TableHeader>
              <TableRow>
                <TableHead>{t('exports_list.col_type')}</TableHead>
                <TableHead>{t('exports_list.col_status')}</TableHead>
                <TableHead>{t('exports_list.col_size')}</TableHead>
                <TableHead>{t('exports_list.col_created')}</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((j) => (
                <ExportRow
                  key={j.id}
                  job={j}
                  onDownload={onDownload}
                  onRetry={(id) => retry.mutate(id)}
                  onCancel={(id) => cancel.mutate(id)}
                  onDelete={(id) => remove.mutate(id)}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ExportCreateModal
        opened={opened}
        onClose={() => setOpened(false)}
        onSubmit={(input) => {
          create.mutate(input, {
            onSuccess: () => {
              notify.success(t('exports_list.created'));
              setOpened(false);
            },
            onError: (p) => {
              notify.error(
                (p as unknown as Problem).title || t('exports_list.error_create'),
              );
            },
          });
        }}
        busy={create.isPending}
      />
    </Page>
  );
}
