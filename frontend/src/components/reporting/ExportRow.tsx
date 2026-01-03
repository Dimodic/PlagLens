/**
 * ExportRow — single row of an exports list with download / retry / cancel / delete.
 */
import { Download, RefreshCw, Trash2, X } from 'lucide-react';
import dayjs from 'dayjs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TableCell, TableRow } from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/components/ui/utils';
import type { ExportJob, ExportStatus } from '@/api/endpoints/reporting';

const STATUS_CLASS: Record<ExportStatus, string> = {
  queued: 'bg-muted text-muted-foreground hover:bg-muted',
  running: 'bg-primary/10 text-primary hover:bg-primary/10',
  completed: 'bg-sev-low-bg text-sev-low hover:bg-sev-low-bg',
  failed: 'bg-sev-high-bg text-sev-high hover:bg-sev-high-bg',
  cancelled: 'bg-sev-mid-bg text-sev-mid hover:bg-sev-mid-bg',
};

const STATUS_LABEL: Record<ExportStatus, string> = {
  queued: 'В очереди',
  running: 'Выполняется',
  completed: 'Готово',
  failed: 'Ошибка',
  cancelled: 'Отменено',
};

export interface ExportRowProps {
  job: ExportJob;
  onDownload?: (id: string) => void;
  onRetry?: (id: string) => void;
  onCancel?: (id: string) => void;
  onDelete?: (id: string) => void;
}

function formatBytes(bytes?: number | null): string {
  if (bytes == null) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = bytes;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u += 1;
  }
  return `${v.toFixed(u === 0 ? 0 : 1)} ${units[u]}`;
}

export function ExportRow({
  job,
  onDownload,
  onRetry,
  onCancel,
  onDelete,
}: ExportRowProps) {
  const isTerminal =
    job.status === 'completed' ||
    job.status === 'failed' ||
    job.status === 'cancelled';
  const isActive = job.status === 'queued' || job.status === 'running';

  return (
    <TableRow data-testid={`export-row-${job.id}`}>
      <TableCell>
        <div className="flex flex-col">
          <span className="text-sm font-medium">{job.kind}</span>
          <span className="text-xs text-muted-foreground">
            {job.format.toUpperCase()}
          </span>
        </div>
      </TableCell>
      <TableCell>
        <Badge
          variant="secondary"
          className={cn('font-normal', STATUS_CLASS[job.status])}
        >
          {STATUS_LABEL[job.status]}
        </Badge>
        {job.error?.title && (
          <p className="mt-0.5 text-xs text-destructive">{job.error.title}</p>
        )}
      </TableCell>
      <TableCell>{formatBytes(job.artifact_size_bytes)}</TableCell>
      <TableCell>
        <span className="text-sm">
          {dayjs(job.created_at).format('DD.MM.YYYY HH:mm')}
        </span>
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-end gap-1">
          {job.status === 'completed' && onDownload && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Скачать"
                  onClick={() => onDownload(job.id)}
                  data-testid={`download-${job.id}`}
                >
                  <Download className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Скачать</TooltipContent>
            </Tooltip>
          )}
          {job.status === 'failed' && onRetry && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Повторить"
                  onClick={() => onRetry(job.id)}
                  data-testid={`retry-${job.id}`}
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Повторить</TooltipContent>
            </Tooltip>
          )}
          {isActive && onCancel && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-sev-mid hover:text-sev-mid"
                  aria-label="Отменить"
                  onClick={() => onCancel(job.id)}
                  data-testid={`cancel-${job.id}`}
                >
                  <X className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Отменить</TooltipContent>
            </Tooltip>
          )}
          {isTerminal && onDelete && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:text-destructive"
                  aria-label="Удалить"
                  onClick={() => onDelete(job.id)}
                  data-testid={`delete-${job.id}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Удалить</TooltipContent>
            </Tooltip>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
