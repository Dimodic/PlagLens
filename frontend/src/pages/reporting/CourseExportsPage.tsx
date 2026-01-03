/**
 * CourseExportsPage — exports scoped to a single course.
 */
import { Loader2, Plus } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ExportRow } from '@/components/reporting/ExportRow';
import { ExportCreateModal } from '@/components/reporting/ExportCreateModal';
import { EmptyState } from '@/components/common/EmptyState';
import { Page, PageHeader } from '@/components/layout/Page';
import {
  useCancelExport,
  useCourseExports,
  useCreateCourseExport,
  useDeleteExport,
  useDownloadExport,
  useRetryExport,
} from '@/hooks/api/useReporting';
import { useCourse } from '@/hooks/api/useCourses';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useNotifications } from '@/hooks/useNotifications';
import type { Problem } from '@/api/types';

export default function CourseExportsPage() {
  useDocumentTitle('Экспорты курса');
  const { slug } = useParams<{ slug: string }>();
  const { data: course } = useCourse(slug);
  const courseId = course?.id;
  const { data, isLoading } = useCourseExports(courseId);
  const [opened, setOpened] = useState(false);
  const notify = useNotifications();

  const create = useCreateCourseExport(courseId ?? '');
  const dl = useDownloadExport();
  const retry = useRetryExport();
  const cancel = useCancelExport();
  const remove = useDeleteExport();

  const onDownload = async (id: string) => {
    try {
      const r = await dl.mutateAsync(id);
      if (typeof window !== 'undefined') {
        window.open(r.url, '_blank', 'noopener');
      }
    } catch (p) {
      notify.error((p as unknown as Problem).title || 'Не удалось получить ссылку');
    }
  };

  const items = data?.data ?? [];

  return (
    <Page width="wide">
      <PageHeader
        title="Экспорты курса"
        action={
          <Button onClick={() => setOpened(true)} disabled={!courseId}>
            <Plus className="mr-2 h-4 w-4" />
            Новый экспорт
          </Button>
        }
      />

      {isLoading ? (
        <div className="flex items-center py-3">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState title="Нет экспортов" message="Создайте первый экспорт." />
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table data-testid="course-exports-table">
            <TableHeader>
              <TableRow>
                <TableHead>Тип</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Размер</TableHead>
                <TableHead>Создан</TableHead>
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
        defaultKind="course_summary"
        defaultScope={courseId ? { course_id: courseId } : undefined}
        onSubmit={(input) => {
          if (!courseId) return;
          create.mutate(input, {
            onSuccess: () => {
              notify.success('Экспорт создан.');
              setOpened(false);
            },
            onError: (p) => {
              notify.error(
                (p as unknown as Problem).title || 'Не удалось создать экспорт',
              );
            },
          });
        }}
        busy={create.isPending}
      />
    </Page>
  );
}
