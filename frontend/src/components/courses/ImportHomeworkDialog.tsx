/**
 * ImportHomeworkDialog — the single «Импортировать» entry on a course page's
 * «+ Новое ДЗ» menu.
 *
 * Yandex.Contest, Stepik and eJudge imports are all the same shape: enter one
 * id → load the importable items → tick which to import → fire an async
 * import-as-homework and poll its progress. So they share ONE dialog with a
 * source switcher at the top instead of three near-identical menu items.
 *
 * Connectors are per-teacher (`mine: true`): each teacher links their own
 * account in /integrations, so the dialog only ever uses the caller's own
 * active connector for the chosen source.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Download, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { integrationsApi } from '@/api/endpoints/integrations';
import { homeworkKeys } from '@/hooks/api/useHomeworks';
import { assignmentKeys } from '@/hooks/api/useAssignments';
import { useNotifications } from '@/hooks/useNotifications';
import { parseProblem } from '@/api/problem';
import { cn } from '@/components/ui/utils';
import { useTranslation } from '@/i18n';

type Source = 'yandex_contest' | 'stepik' | 'ejudge';

const SOURCES: { value: Source; label: string }[] = [
  { value: 'yandex_contest', label: 'Yandex.Contest' },
  { value: 'stepik', label: 'Stepik' },
  { value: 'ejudge', label: 'eJudge' },
];

// op.stage → i18n key. Stages are shared across all three importers.
const STAGE_KEYS: Record<string, string> = {
  starting: 'import_dialog.stage_starting',
  fetching_contest: 'import_dialog.stage_creating_homework',
  creating_homework: 'import_dialog.stage_creating_homework',
  creating_assignments: 'import_dialog.stage_creating_assignments',
  fetching_submissions: 'import_dialog.stage_fetching_submissions',
  importing_submissions: 'import_dialog.stage_importing_submissions',
  done: 'import_dialog.stage_done',
};

interface ImportItem {
  key: string;
  title: string;
  group?: string; // lesson title (Stepik tree)
  badge?: string; // step type (Stepik)
  defaultOn: boolean;
}

interface ImportOp {
  status: 'running' | 'completed' | 'failed' | 'expired';
  stage?: string | null;
  homework_title?: string | null;
  problems_total?: number;
  problems_done?: number;
  submissions_imported?: number;
  errors?: string[];
  resync?: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  course: { id: string; slug?: string | null };
  onDone?: () => void;
}

export function ImportHomeworkDialog({ open, onOpenChange, course, onDone }: Props) {
  const { t } = useTranslation();
  const notify = useNotifications();
  const qc = useQueryClient();

  const [source, setSource] = useState<Source>('yandex_contest');
  const [idValue, setIdValue] = useState('');
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [hwTitle, setHwTitle] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeOpId, setActiveOpId] = useState<string | null>(null);

  // Per-teacher connector for the chosen source. A teacher can accumulate
  // half-finished pending_auth rows; only the active one carries a token.
  const configsQ = useQuery({
    queryKey: ['integrations', 'list', source, 'mine'],
    queryFn: () => integrationsApi.list({ kind: source, mine: true, limit: 10 }),
    enabled: open,
    // The app sets `placeholderData: keepPreviousData` globally; override it
    // here so switching the source tab never shows the previous source's data.
    placeholderData: undefined,
  });
  const configs = configsQ.data?.data ?? [];
  const activeConfig = configs.find((c) => c.status === 'active') ?? configs[0];
  const configId = activeConfig?.id;

  // Importable items (problems / steps) for the entered id.
  const itemsQ = useQuery({
    queryKey: ['import', source, configId, loadedId],
    enabled: !!configId && !!loadedId,
    placeholderData: undefined, // no cross-source/cross-id data bleed
    queryFn: async (): Promise<{
      items: ImportItem[];
      errors?: string[];
      name?: string | null;
    }> => {
      const cfg = configId as string;
      const id = loadedId as string;
      if (source === 'stepik') {
        const r = await integrationsApi.stepikCourseTree(cfg, id);
        const items: ImportItem[] = [];
        for (const lesson of r.data) {
          for (const s of lesson.steps) {
            items.push({
              key: String(s.id),
              title: t('import_dialog.step_label', { position: s.position ?? '?' }),
              group: lesson.title,
              badge: s.type ?? undefined,
              defaultOn: s.type === 'code',
            });
          }
        }
        return { items, name: r.name };
      }
      if (source === 'ejudge') {
        const r = await integrationsApi.ejudgeListProblems(cfg, id);
        return {
          items: r.data.map((p) => ({
            key: p.alias ?? p.external_id,
            title: p.title,
            defaultOn: true,
          })),
          errors: r.errors,
        };
      }
      const r = await integrationsApi.ycListProblems(cfg, id);
      return {
        items: r.data.map((p) => ({
          key: p.alias ?? p.external_id,
          title: p.title,
          defaultOn: true,
        })),
        errors: r.errors,
        name: r.name,
      };
    },
  });
  const items = useMemo(() => itemsQ.data?.items ?? [], [itemsQ.data]);
  const grouped = source === 'stepik';
  const hasCode = useMemo(() => items.some((i) => i.badge === 'code'), [items]);
  const groups = useMemo(() => {
    if (!grouped) return [] as { title: string; items: ImportItem[] }[];
    const out: { title: string; items: ImportItem[] }[] = [];
    const byTitle = new Map<string, ImportItem[]>();
    for (const it of items) {
      const g = it.group ?? '';
      let arr = byTitle.get(g);
      if (!arr) {
        arr = [];
        byTitle.set(g, arr);
        out.push({ title: g, items: arr });
      }
      arr.push(it);
    }
    return out;
  }, [grouped, items]);

  // Default selection once items load (Stepik → code steps; others → all).
  useEffect(() => {
    if (!itemsQ.data) return;
    setSelected(new Set(itemsQ.data.items.filter((i) => i.defaultOn).map((i) => i.key)));
  }, [itemsQ.data]);

  // Auto-load: a short pause after the id changes loads the tasks, so there's
  // no separate "Load" button. Clearing the field clears the list.
  useEffect(() => {
    const v = idValue.trim();
    if (!v) {
      setLoadedId(null);
      return;
    }
    const handle = setTimeout(() => setLoadedId(v), 600);
    return () => clearTimeout(handle);
  }, [idValue]);

  const opQ = useQuery({
    queryKey: ['import', source, 'op', activeOpId],
    enabled: !!activeOpId,
    placeholderData: undefined,
    refetchInterval: (q) => (q.state.data?.status === 'running' ? 2000 : false),
    queryFn: async (): Promise<ImportOp> => {
      const opId = activeOpId as string;
      if (source === 'stepik')
        return (await integrationsApi.stepikGetImportOperation(opId)) as ImportOp;
      if (source === 'ejudge')
        return (await integrationsApi.ejudgeGetImportOperation(opId)) as ImportOp;
      return (await integrationsApi.ycGetImportOperation(opId)) as ImportOp;
    },
  });

  const resetFlow = () => {
    setIdValue('');
    setLoadedId(null);
    setHwTitle('');
    setSelected(new Set());
    setActiveOpId(null);
  };
  const resetAll = () => {
    resetFlow();
    setSource('yandex_contest');
  };

  const importMut = useMutation({
    mutationFn: async (): Promise<{ operation_id: string | null; already_imported: boolean }> => {
      if (!configId) throw new Error('no_config');
      const id = (loadedId ?? idValue).trim();
      const title = hwTitle.trim() || undefined;
      const keys = [...selected];
      if (source === 'stepik') {
        const r = await integrationsApi.stepikImportAsHomework(configId, {
          course_id: String(course.id),
          stepik_course_id: id,
          step_ids: keys.map(Number),
          title,
        });
        return { operation_id: r.operation_id ?? null, already_imported: !!r.already_imported };
      }
      if (source === 'ejudge') {
        const r = await integrationsApi.ejudgeImportAsHomework(configId, {
          course_id: String(course.id),
          contest_id: id,
          problem_aliases: keys,
          title,
        });
        return { operation_id: r.operation_id ?? null, already_imported: !!r.already_imported };
      }
      const r = await integrationsApi.ycImportAsHomework(configId, id, String(course.id), keys);
      return { operation_id: r.operation_id, already_imported: false };
    },
    onSuccess: (res) => {
      if (res.already_imported && !res.operation_id) {
        notify.info(t('import_dialog.already_imported'));
        void qc.invalidateQueries({ queryKey: homeworkKeys.forCourse(course.id) });
        onDone?.();
        resetAll();
        onOpenChange(false);
        return;
      }
      if (res.operation_id) setActiveOpId(res.operation_id);
    },
    onError: (e) => notify.error(parseProblem(e).detail || t('import_dialog.failed')),
  });

  // Watch the polled op: notify + invalidate + close on completion.
  useEffect(() => {
    const op = opQ.data;
    if (!op || !activeOpId) return;
    if (op.status === 'completed') {
      const title = op.homework_title ?? t('import_dialog.hw_fallback');
      const created = op.problems_done ?? 0;
      const subs = op.submissions_imported ?? 0;
      notify.success(
        op.resync
          ? t('import_dialog.resynced', { title, subs })
          : t('import_dialog.done', { title, created, subs }),
      );
      void qc.invalidateQueries({ queryKey: homeworkKeys.forCourse(course.id) });
      void qc.invalidateQueries({ queryKey: assignmentKeys.byCourse(course.id) });
      onDone?.();
      resetAll();
      onOpenChange(false);
    } else if (op.status === 'failed') {
      notify.error((op.errors ?? []).join('; ') || t('import_dialog.failed'));
      setActiveOpId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opQ.data]);

  const busy = importMut.isPending || !!activeOpId;
  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const switchSource = (s: Source) => {
    if (busy || s === source) return;
    resetFlow();
    setSource(s);
  };

  // Map raw upstream errors (e.g. "YC API 403: You don't have enough
  // permissions", "404 … not-found") to short, human messages.
  const friendlyError = (raw?: string | null): string => {
    const s = (raw ?? '').toLowerCase();
    if (/404|not[\s-]?found|не найден/.test(s)) return t('import_dialog.err_not_found');
    if (/403|forbidden|permission|enough|доступ/.test(s)) return t('import_dialog.err_forbidden');
    if (/401|unauthorized|token|expired|устар/.test(s)) return t('import_dialog.err_auth');
    return t('import_dialog.err_generic');
  };
  // The homework will be named after the contest/course when left blank, so
  // hint that name in the placeholder (falls back to a generic example).
  const namePlaceholder =
    itemsQ.data?.name?.trim() || t('import_dialog.title_placeholder');

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !busy) {
          resetAll();
          onOpenChange(false);
        }
      }}
    >
      <DialogContent className="sm:max-w-2xl" data-testid="course-import-modal">
        <DialogHeader>
          <DialogTitle>{t('import_dialog.title')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          {/* Source switcher — light underline tabs, not filled pills */}
          <div className="flex gap-6 border-b border-border/60">
            {SOURCES.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => switchSource(s.value)}
                disabled={busy}
                data-testid={`import-source-${s.value}`}
                className={cn(
                  '-mb-px border-b-2 pb-2 text-sm transition-colors',
                  source === s.value
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Source id — tasks auto-load shortly after you type (or on Enter);
              no separate button. Spinner sits inside the field. */}
          <div className="space-y-1.5">
            <Label htmlFor="import-id">{t(`import_dialog.id_${source}`)}</Label>
            <div className="relative max-w-[18rem]">
              <Input
                id="import-id"
                value={idValue}
                onChange={(e) => setIdValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    setLoadedId(idValue.trim());
                  }
                }}
                placeholder={t(`import_dialog.id_placeholder_${source}`)}
                inputMode="numeric"
                data-testid="course-import-id"
                disabled={busy}
                className="pr-9"
              />
              {itemsQ.isFetching && (
                <Loader2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
              )}
            </div>
            {configsQ.isLoading ? (
              <p className="text-xs text-muted-foreground">{t('import_dialog.searching')}</p>
            ) : configs.length === 0 ? (
              <p className="text-xs text-destructive">
                {t('import_dialog.not_connected')}{' '}
                <Link to="/integrations" className="underline">
                  /integrations
                </Link>
                .
              </p>
            ) : null}
          </div>

          {/* Loading / errors / empty */}
          {loadedId && itemsQ.isFetching && items.length === 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('import_dialog.loading_items')}
            </div>
          )}
          {itemsQ.error && (
            <p className="text-sm text-destructive">
              {friendlyError(parseProblem(itemsQ.error).detail)}
            </p>
          )}
          {loadedId && !itemsQ.isFetching && items.length === 0 && !itemsQ.error && (
            <p className="text-sm text-muted-foreground">
              {itemsQ.data?.errors?.length
                ? friendlyError(itemsQ.data.errors[0])
                : t('import_dialog.empty')}
            </p>
          )}

          {/* Selection */}
          {items.length > 0 && (
            <div className="space-y-2">
              <div className="space-y-1.5">
                <Label htmlFor="import-hw-title">{t('import_dialog.title_label')}</Label>
                <Input
                  id="import-hw-title"
                  value={hwTitle}
                  onChange={(e) => setHwTitle(e.target.value)}
                  placeholder={namePlaceholder}
                  disabled={busy}
                />
              </div>
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-muted-foreground tabular-nums">
                  {t('import_dialog.selected_count', { count: selected.size })}
                </span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => setSelected(new Set(items.map((i) => i.key)))}
                  >
                    {t('import_dialog.select_all')}
                  </button>
                  {hasCode && (
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() =>
                        setSelected(
                          new Set(items.filter((i) => i.badge === 'code').map((i) => i.key)),
                        )
                      }
                    >
                      {t('import_dialog.only_code')}
                    </button>
                  )}
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => setSelected(new Set())}
                  >
                    {t('import_dialog.clear_all')}
                  </button>
                </div>
              </div>
              <div className="max-h-[42vh] space-y-3 overflow-y-auto rounded-lg border border-border/50 bg-muted/10 p-2">
                {grouped
                  ? groups.map((g) => (
                      <div key={g.title} className="space-y-1">
                        <div className="text-sm font-medium text-foreground">{g.title}</div>
                        <div className="-mx-1">
                          {g.items.map((it) => (
                            <ItemRow
                              key={it.key}
                              item={it}
                              on={selected.has(it.key)}
                              busy={busy}
                              onToggle={toggle}
                            />
                          ))}
                        </div>
                      </div>
                    ))
                  : items.map((it) => (
                      <ItemRow
                        key={it.key}
                        item={it}
                        on={selected.has(it.key)}
                        busy={busy}
                        onToggle={toggle}
                      />
                    ))}
              </div>
            </div>
          )}

          {/* Progress */}
          {busy && (
            <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-sm">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                <span>
                  {opQ.data?.stage && STAGE_KEYS[opQ.data.stage]
                    ? t(STAGE_KEYS[opQ.data.stage])
                    : t('import_dialog.stage_starting')}
                </span>
              </div>
              <div className="mt-1.5 text-xs text-muted-foreground tabular-nums">
                {t('import_dialog.progress', {
                  done: opQ.data?.problems_done ?? 0,
                  total: opQ.data?.problems_total ?? selected.size,
                  subs: opQ.data?.submissions_imported ?? 0,
                })}
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button
              variant="ghost"
              onClick={() => {
                resetAll();
                onOpenChange(false);
              }}
              disabled={busy}
              data-testid="course-import-cancel"
            >
              {t('import_dialog.cancel')}
            </Button>
            <Button
              onClick={() => importMut.mutate()}
              disabled={busy || selected.size === 0 || !configId || !loadedId}
              data-testid="course-import-submit"
            >
              {busy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              {t('import_dialog.submit')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ItemRow({
  item,
  on,
  busy,
  onToggle,
}: {
  item: ImportItem;
  on: boolean;
  busy: boolean;
  onToggle: (key: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(item.key)}
      disabled={busy}
      data-testid={`import-item-${item.key}`}
      className="flex w-full items-center gap-2 rounded px-1 py-1 text-left text-sm hover:bg-muted/50"
    >
      <span
        className={cn(
          'flex h-4 w-4 flex-none items-center justify-center rounded border',
          on ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
        )}
      >
        {on && <Check className="h-3 w-3" />}
      </span>
      <span className="truncate text-muted-foreground">
        {item.title}
        {item.badge && (
          <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-xs">{item.badge}</span>
        )}
      </span>
    </button>
  );
}

export default ImportHomeworkDialog;
