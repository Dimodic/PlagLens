/**
 * CourseSyncDialog — teacher's per-integration sync controls in a modal.
 *
 * Opened from a row on the integrations list (teacher view). Two things,
 * both scoped by a course → ДЗ picker:
 *
 *   1. «Синхронизировать сейчас» — re-pull fresh submissions into the
 *      already-imported homeworks (useSyncNow → the config's sync-all).
 *   2. Автосинхрон — a toggle + interval (hours) + the checked ДЗ, stored
 *      on the integration's ``settings.autosync`` ({enabled, hours,
 *      homework_ids}) where the scheduler picks them up.
 *
 * The «import a NEW contest as a homework» flow stays on the course page
 * («+ Новое ДЗ → Из Yandex.Contest») — this modal is only for keeping
 * existing imports fresh.
 */
import { useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import type { IntegrationConfig } from '@/api/endpoints/integrations';
import { useMyCourses } from '@/hooks/api/useCourses';
import { useHomeworksForCourse } from '@/hooks/api/useHomeworks';
import { useSyncNow, useUpdateIntegration } from '@/hooks/api/useIntegrations';
import { useNotifications } from '@/hooks/useNotifications';
import type { Problem } from '@/api/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface AutosyncPrefs {
  enabled: boolean;
  hours: number;
  homework_ids: string[];
}

function readAutosync(settings: Record<string, unknown> | undefined): AutosyncPrefs {
  const raw = (settings ?? {})['autosync'] as Partial<AutosyncPrefs> | undefined;
  return {
    enabled: !!raw?.enabled,
    hours:
      typeof raw?.hours === 'number' && raw.hours >= 1 && raw.hours <= 24
        ? Math.floor(raw.hours)
        : 6,
    homework_ids: Array.isArray(raw?.homework_ids)
      ? raw!.homework_ids!.map((x) => String(x))
      : [],
  };
}

interface Props {
  integration: IntegrationConfig | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CourseSyncDialog({ integration, open, onOpenChange }: Props) {
  const notify = useNotifications();
  const coursesQ = useMyCourses();
  const courses = coursesQ.data?.data ?? [];

  const [courseId, setCourseId] = useState<string>('');
  useEffect(() => {
    if (open && !courseId && courses.length > 0) {
      setCourseId(String(courses[0].id));
    }
  }, [open, courseId, courses]);

  const homeworksQ = useHomeworksForCourse(courseId || undefined, { limit: 100 });
  const homeworks = homeworksQ.data?.data ?? [];

  const settings = (integration?.settings ?? {}) as Record<string, unknown>;
  const autosync = useMemo(() => readAutosync(settings), [settings]);

  const update = useUpdateIntegration(integration?.id ?? '');
  const syncNow = useSyncNow(integration?.id ?? '');

  const selected = useMemo(
    () => new Set(autosync.homework_ids),
    [autosync.homework_ids],
  );

  const save = async (next: AutosyncPrefs) => {
    if (!integration) return;
    try {
      await update.mutateAsync({ settings: { ...settings, autosync: next } });
    } catch (e) {
      notify.error((e as Problem)?.detail ?? 'Не удалось сохранить');
    }
  };

  const toggleHomework = (hwId: string) => {
    const set = new Set(selected);
    if (set.has(hwId)) set.delete(hwId);
    else set.add(hwId);
    void save({ ...autosync, homework_ids: [...set] });
  };

  const onSyncNow = async () => {
    if (!integration) return;
    try {
      await syncNow.mutateAsync({});
      notify.success('Синхронизация запущена — посылки подтянутся в фоне');
      onOpenChange(false);
    } catch (e) {
      notify.error((e as Problem)?.detail ?? 'Не удалось запустить');
    }
  };

  const title = integration?.display_name || 'Yandex.Contest';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-testid="course-sync-dialog">
        <DialogHeader>
          <DialogTitle>Синхронизация · {title}</DialogTitle>
          <DialogDescription>
            Подтянуть новые посылки в уже импортированные ДЗ или включить
            автосинхрон.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Course picker */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Курс
            </label>
            <Select value={courseId} onValueChange={setCourseId}>
              <SelectTrigger data-testid="course-sync-course">
                <SelectValue placeholder="Выберите курс" />
              </SelectTrigger>
              <SelectContent>
                {courses.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Sync now */}
          <div className="flex items-center justify-between gap-3 border-t border-border/50 pt-4">
            <div className="min-w-0">
              <div className="text-sm font-medium text-foreground">
                Синхронизировать сейчас
              </div>
              <p className="text-xs text-muted-foreground">
                Разово подтянуть свежие посылки во все импортированные ДЗ.
              </p>
            </div>
            <Button
              onClick={onSyncNow}
              disabled={syncNow.isPending || integration?.status !== 'active'}
              data-testid="course-sync-now"
              className="shrink-0"
            >
              {syncNow.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Синхронизировать
            </Button>
          </div>

          {/* Autosync */}
          <div className="space-y-3 border-t border-border/50 pt-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium text-foreground">
                  Автосинхрон
                </div>
                <p className="text-xs text-muted-foreground">
                  Периодически тянуть новые посылки по выбранным ДЗ.
                </p>
              </div>
              <Switch
                checked={autosync.enabled}
                onCheckedChange={(v) => void save({ ...autosync, enabled: v })}
                disabled={update.isPending}
                data-testid="course-sync-autosync-toggle"
              />
            </div>

            {autosync.enabled && (
              <>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Каждые</span>
                  <input
                    type="number"
                    min={1}
                    max={24}
                    value={autosync.hours}
                    onChange={(e) =>
                      void save({
                        ...autosync,
                        hours: Math.min(24, Math.max(1, Number(e.target.value) || 6)),
                      })
                    }
                    className="h-8 w-16 rounded-md border border-border bg-input-background px-2 text-center tabular-nums"
                    data-testid="course-sync-hours"
                  />
                  <span className="text-muted-foreground">ч.</span>
                </div>

                <div className="space-y-1.5">
                  <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Какие ДЗ
                  </div>
                  {homeworksQ.isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : homeworks.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      В этом курсе нет домашних заданий.
                    </p>
                  ) : (
                    <ul className="max-h-48 space-y-1 overflow-y-auto">
                      {homeworks.map((hw) => {
                        const hwId = String(hw.id);
                        return (
                          <li key={hwId}>
                            <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-1 py-1.5 text-sm hover:bg-muted/30">
                              <Checkbox
                                checked={selected.has(hwId)}
                                onCheckedChange={() => toggleHomework(hwId)}
                                data-testid={`course-sync-hw-${hwId}`}
                              />
                              <span className="min-w-0 flex-1 truncate text-foreground">
                                {hw.title}
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default CourseSyncDialog;
