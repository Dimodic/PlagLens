/**
 * ScheduledExportsPage — list + create scheduled exports for a course.
 */
import { Loader2, Play, Plus, Trash2 } from 'lucide-react';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
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
import { useCourse } from '@/hooks/api/useCourses';
import {
  useCreateScheduledExport,
  useDeleteScheduledExport,
  useRunScheduledNow,
  useScheduledExports,
} from '@/hooks/api/useReporting';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useNotifications } from '@/hooks/useNotifications';
import { ScheduleCronInput } from '@/components/reporting/ScheduleCronInput';
import { EmptyState } from '@/components/common/EmptyState';
import { Page, PageHeader } from '@/components/layout/Page';
import type {
  CreateScheduledExportInput,
  ExportFormat,
  ExportKind,
  ScheduledTarget,
} from '@/api/endpoints/reporting';
import type { Problem } from '@/api/types';

export default function ScheduledExportsPage() {
  useDocumentTitle('Расписание экспортов');
  const { slug } = useParams<{ slug: string }>();
  const { data: course } = useCourse(slug);
  const courseId = course?.id;
  const { data, isLoading } = useScheduledExports(courseId);
  const create = useCreateScheduledExport(courseId ?? '');
  const remove = useDeleteScheduledExport(courseId ?? '');
  const runNow = useRunScheduledNow(courseId ?? '');
  const notify = useNotifications();

  const [opened, setOpened] = useState(false);
  const [kind, setKind] = useState<ExportKind>('course_summary');
  const [format, setFormat] = useState<ExportFormat>('xlsx');
  const [target, setTarget] = useState<ScheduledTarget>('file_download');
  const [cron, setCron] = useState('0 9 * * *');
  const [enabled, setEnabled] = useState(true);

  const handleCreate = () => {
    if (!courseId) return;
    const input: CreateScheduledExportInput = {
      kind,
      format,
      target,
      cron,
      enabled,
    };
    create.mutate(input, {
      onSuccess: () => {
        notify.success('Расписание создано.');
        setOpened(false);
      },
      onError: (p) => {
        notify.error((p as unknown as Problem).title || 'Не удалось создать расписание');
      },
    });
  };

  const items = data ?? [];

  return (
    <Page width="wide">
      <PageHeader
        title="Расписания экспортов"
        action={
          <Button onClick={() => setOpened(true)} disabled={!courseId}>
            <Plus className="mr-2 h-4 w-4" />
            Новое расписание
          </Button>
        }
      />

      {isLoading ? (
        <div className="flex items-center py-3">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState title="Нет расписаний" />
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table data-testid="scheduled-table">
            <TableHeader>
              <TableRow>
                <TableHead>Тип</TableHead>
                <TableHead>Формат</TableHead>
                <TableHead>Цель</TableHead>
                <TableHead>Cron</TableHead>
                <TableHead>Активен</TableHead>
                <TableHead>Последний / Следующий</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((s) => (
                <TableRow key={s.id} data-testid={`schedule-row-${s.id}`}>
                  <TableCell>{s.kind}</TableCell>
                  <TableCell>{s.format.toUpperCase()}</TableCell>
                  <TableCell>{s.target}</TableCell>
                  <TableCell>
                    <span className="font-mono text-sm">{s.cron}</span>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        s.enabled
                          ? 'bg-sev-low-bg text-sev-low border-transparent'
                          : 'bg-muted text-muted-foreground border-transparent'
                      }
                    >
                      {s.enabled ? 'on' : 'off'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="text-xs text-muted-foreground">
                        Last:{' '}
                        {s.last_run_at
                          ? dayjs(s.last_run_at).format('DD.MM HH:mm')
                          : '—'}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Next:{' '}
                        {s.next_run_at
                          ? dayjs(s.next_run_at).format('DD.MM HH:mm')
                          : '—'}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Запустить"
                            onClick={() => runNow.mutate(s.id)}
                            data-testid={`run-now-${s.id}`}
                          >
                            <Play className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Запустить сейчас</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive"
                            aria-label="Удалить"
                            onClick={() => remove.mutate(s.id)}
                            data-testid={`delete-schedule-${s.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Удалить</TooltipContent>
                      </Tooltip>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={opened} onOpenChange={setOpened}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Новое расписание</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Тип</Label>
              <Select value={kind} onValueChange={(v) => v && setKind(v as ExportKind)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="assignment_grades">Оценки задания</SelectItem>
                  <SelectItem value="course_summary">Сводка по курсу</SelectItem>
                  <SelectItem value="plagiarism_report">Отчёт по плагиату</SelectItem>
                  <SelectItem value="ai_analysis_summary">Сводка AI</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Формат</Label>
              <Select
                value={format}
                onValueChange={(v) => v && setFormat(v as ExportFormat)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="csv">CSV</SelectItem>
                  <SelectItem value="xlsx">XLSX</SelectItem>
                  <SelectItem value="json">JSON</SelectItem>
                  <SelectItem value="pdf">PDF</SelectItem>
                  <SelectItem value="google_sheets">Google Sheets</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Цель</Label>
              <Select
                value={target}
                onValueChange={(v) => v && setTarget(v as ScheduledTarget)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="file_download">Скачивание</SelectItem>
                  <SelectItem value="google_sheets">Google Sheets</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <ScheduleCronInput value={cron} onChange={setCron} />
            <label className="flex items-center gap-2 cursor-pointer">
              <Switch checked={enabled} onCheckedChange={setEnabled} />
              <span className="text-sm">Активен</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpened(false)}>
              Отмена
            </Button>
            <Button onClick={handleCreate} disabled={create.isPending}>
              {create.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Создать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Page>
  );
}
