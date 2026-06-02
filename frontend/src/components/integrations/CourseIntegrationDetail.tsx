/**
 * CourseIntegrationDetail — the right-hand pane for a PULL source
 * (Yandex.Contest / Stepik / eJudge), where PlagLens fetches submissions
 * from the provider. (Manual upload is a push source and has its own
 * pane — see ManualUploadPanel.)
 *
 * Layout:
 *   • Курс — which course's homeworks to act on.
 *   • ДЗ — a searchable multi-select. This one selection drives BOTH:
 *       – «Синхронизировать сейчас» — one-shot pull, scoped to the
 *         picked ДЗ (or all imported ДЗ when nothing is picked).
 *       – «Автосинхронизация» — periodic version of the same scope,
 *         persisted on ``settings.autosync``.
 *   • «Отключить интеграцию» — destructive, bottom-left.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, RefreshCw } from 'lucide-react';
import { t, useTranslation } from '@/i18n';
import type { IntegrationConfig } from '@/api/endpoints/integrations';
import { useMyCourses } from '@/hooks/api/useCourses';
import {
  useDeleteIntegration,
  useSyncNow,
  useUpdateIntegration,
} from '@/hooks/api/useIntegrations';
import { useNotifications } from '@/hooks/useNotifications';
import type { Problem } from '@/api/types';
import { ProviderIcon } from '@/components/integrations/ProviderIcon';
import { HomeworkSelect } from '@/components/integrations/HomeworkSelect';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const KIND_TITLES: Record<string, string> = {
  yandex_contest: 'Yandex.Contest',
  stepik: 'Stepik',
  google_sheets: 'Google Sheets',
  ejudge: 'eJudge',
  get manual() {
    return t('course_integration.kind_manual');
  },
};

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
  integration: IntegrationConfig;
  onChanged: () => void;
}

export function CourseIntegrationDetail({ integration, onChanged }: Props) {
  const { t } = useTranslation();
  const notify = useNotifications();
  const coursesQ = useMyCourses();
  const courses = coursesQ.data?.data ?? [];

  const [courseId, setCourseId] = useState<string>('');
  useEffect(() => {
    if (!courseId && courses.length > 0) setCourseId(String(courses[0].id));
  }, [courseId, courses]);

  const settings = (integration.settings ?? {}) as Record<string, unknown>;
  const autosync = useMemo(() => readAutosync(settings), [settings]);
  const picked = autosync.homework_ids;

  const update = useUpdateIntegration(integration.id);
  const syncNow = useSyncNow(integration.id);
  const remove = useDeleteIntegration();
  const [confirmRemove, setConfirmRemove] = useState(false);

  const save = async (next: AutosyncPrefs) => {
    try {
      await update.mutateAsync({ settings: { ...settings, autosync: next } });
    } catch (e) {
      notify.error((e as Problem)?.detail ?? t('course_integration.save_failed'));
    }
  };

  const onSyncNow = async () => {
    try {
      await syncNow.mutateAsync(
        picked.length ? { scope: { homework_ids: picked } } : {},
      );
      notify.success(
        picked.length
          ? t('course_integration.sync_started_picked')
          : t('course_integration.sync_started_all'),
      );
    } catch (e) {
      notify.error((e as Problem)?.detail ?? t('course_integration.sync_failed'));
    }
  };

  const onRemove = async () => {
    try {
      await remove.mutateAsync(integration.id);
      notify.success(t('course_integration.disconnected'));
      setConfirmRemove(false);
      onChanged();
    } catch (e) {
      notify.error((e as Problem)?.detail ?? t('course_integration.disconnect_failed'));
    }
  };

  const title = KIND_TITLES[integration.kind] ?? integration.kind;
  const isActive = integration.status === 'active';
  // Google Sheets is an *export target*, not a pull source — there's
  // nothing to «синхронизировать». It just enables writing grades into
  // a course's Google-таблицу from the «Экспорт» page.
  const isExportTarget = integration.kind === 'google_sheets';

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-2">
        <ProviderIcon kind={integration.kind} className="h-7 w-7 shrink-0" />
        <h2 className="text-xl font-semibold text-foreground">{title}</h2>
        <span
          className={`ml-auto text-xs ${isActive ? 'text-muted-foreground' : 'text-sev-mid font-medium'}`}
        >
          {isActive
            ? t('course_integration.status_connected')
            : t('course_integration.status_pending')}
        </span>
      </header>

      {isExportTarget ? (
        <div className="space-y-4">
          <p className="max-w-md text-sm text-muted-foreground">
            {t('course_integration.export_target_hint')}
          </p>
          <Button asChild variant="outline">
            <Link to="/reports" data-testid="course-integration-to-export">
              {t('course_integration.to_export')}
            </Link>
          </Button>
        </div>
      ) : (
      <>
      {/* Course */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {t('course_integration.course_label')}
        </label>
        <Select value={courseId} onValueChange={setCourseId}>
          <SelectTrigger className="max-w-sm" data-testid="course-sync-course">
            <SelectValue placeholder={t('course_integration.course_placeholder')} />
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

      {/* ДЗ — one selection used by both manual sync and autosync */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {t('course_integration.homeworks_label')}
        </label>
        <HomeworkSelect
          multiple
          courseId={courseId || undefined}
          value={picked}
          allLabel={t('course_integration.all_homeworks')}
          onChange={(ids) => void save({ ...autosync, homework_ids: ids })}
          testId="course-sync-homeworks"
        />
      </div>

      {/* Sync now */}
      <div className="flex items-center justify-between gap-3 border-t border-border/50 pt-5">
        <div className="min-w-0">
          <div className="text-sm font-medium text-foreground">
            {t('course_integration.sync_now_title')}
          </div>
          <p className="text-xs text-muted-foreground">
            {t('course_integration.sync_now_desc')}
          </p>
        </div>
        <Button
          onClick={onSyncNow}
          disabled={syncNow.isPending || !isActive}
          data-testid="course-sync-now"
          className="shrink-0"
        >
          {syncNow.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          {t('course_integration.sync_button')}
        </Button>
      </div>

      {/* Autosync */}
      <div className="space-y-3 border-t border-border/50 pt-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-medium text-foreground">
              {t('course_integration.autosync_title')}
            </div>
            <p className="text-xs text-muted-foreground">
              {t('course_integration.autosync_desc')}
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
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">{t('course_integration.every')}</span>
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
            <span className="text-muted-foreground">{t('course_integration.hours_unit')}</span>
          </div>
        )}
      </div>
      </>
      )}

      <div className="border-t border-border/50 pt-5">
        <button
          type="button"
          onClick={() => setConfirmRemove(true)}
          disabled={remove.isPending}
          className="text-sm font-medium text-destructive hover:underline disabled:opacity-50"
          data-testid="course-integration-remove"
        >
          {t('course_integration.disconnect')}
        </button>
      </div>

      <ConfirmDialog
        opened={confirmRemove}
        title={t('course_integration.confirm_title', { title })}
        message={t('course_integration.confirm_message')}
        confirmLabel={t('course_integration.confirm_label')}
        destructive
        loading={remove.isPending}
        onConfirm={onRemove}
        onClose={() => setConfirmRemove(false)}
      />
    </div>
  );
}

export default CourseIntegrationDetail;
