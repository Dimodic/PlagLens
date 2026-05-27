/**
 * CourseSettingsPage — edit name/description/dates.
 * Disabled if user is not owner/co_owner/admin.
 */
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, FileSpreadsheet, Loader2, Trash2 } from 'lucide-react';
import { useCourse, useUpdateCourse } from '@/hooks/api/useCourses';
import {
  useCreateSheetsLink,
  useDeleteSheetsLink,
  useGoogleSheetsLink,
  useSetSheetsLink,
  useValidateSheetsLink,
} from '@/hooks/api/useReporting';
import { useAuth } from '@/auth/useAuth';
import { hasCourseRole, hasGlobalRole } from '@/auth/RoleGuard';
import { MarkdownEditor } from '@/components/forms/MarkdownEditor';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { Page, PageHeader } from '@/components/layout/Page';
import { useNotifications } from '@/hooks/useNotifications';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { parseProblem } from '@/api/problem';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/components/ui/utils';
import type { Problem } from '@/api/types';

interface FormVals {
  name: string;
  description: string;
  start_date: string; // YYYY-MM-DD
  end_date: string;
  cors_origins: string;
}

function toDateInput(iso: string | null | undefined): string {
  if (!iso) return '';
  // backend sends YYYY-MM-DD already, or full ISO; normalize.
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

export default function CourseSettingsPage() {
  useDocumentTitle('Настройки курса');
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const notify = useNotifications();
  const [problem, setProblem] = useState<Problem | null>(null);

  const { data: course } = useCourse(slug);
  const update = useUpdateCourse(course?.id ?? '');

  const canEdit =
    course && user
      ? hasCourseRole(user, course.id, ['owner', 'co_owner']) ||
        hasGlobalRole(user, ['admin'])
      : false;

  const [vals, setVals] = useState<FormVals>({
    name: '',
    description: '',
    start_date: '',
    end_date: '',
    cors_origins: '',
  });

  useEffect(() => {
    if (course) {
      setVals({
        name: course.name,
        description: course.description ?? '',
        start_date: toDateInput(course.start_date),
        end_date: toDateInput(course.end_date),
        cors_origins: (course.settings?.cors_origins ?? []).join('\n'),
      });
    }
  }, [course?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!course) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProblem(null);
    try {
      await update.mutateAsync({
        name: vals.name,
        description: vals.description,
        start_date: vals.start_date || null,
        end_date: vals.end_date || null,
        settings: {
          ...(course.settings ?? {}),
          cors_origins: vals.cors_origins
            .split(/\n|,/)
            .map((s) => s.trim())
            .filter(Boolean),
        },
      });
      notify.success('Настройки сохранены');
    } catch (err) {
      setProblem(parseProblem(err));
    }
  };

  return (
    <Page width="regular">
      <PageHeader title="Настройки курса" />

      <form
        data-testid="course-settings-form"
        onSubmit={handleSubmit}
        className="space-y-4"
      >
        <div className="space-y-1.5">
          <Label htmlFor="course-settings-name">Название</Label>
          <Input
            id="course-settings-name"
            disabled={!canEdit}
            data-testid="course-settings-name"
            value={vals.name}
            onChange={(e) => setVals((v) => ({ ...v, name: e.currentTarget.value }))}
          />
        </div>

        <MarkdownEditor
          label="Описание"
          value={vals.description}
          onChange={(v) =>
            canEdit ? setVals((prev) => ({ ...prev, description: v })) : undefined
          }
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="course-settings-start">Дата начала</Label>
            <Input
              id="course-settings-start"
              type="date"
              disabled={!canEdit}
              value={vals.start_date}
              onChange={(e) =>
                setVals((v) => ({ ...v, start_date: e.currentTarget.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="course-settings-end">Дата окончания</Label>
            <Input
              id="course-settings-end"
              type="date"
              disabled={!canEdit}
              value={vals.end_date}
              onChange={(e) =>
                setVals((v) => ({ ...v, end_date: e.currentTarget.value }))
              }
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="course-settings-cors-origins">
            CORS origins (через запятую или с новой строки)
          </Label>
          <Input
            id="course-settings-cors-origins"
            disabled={!canEdit}
            data-testid="course-settings-cors-origins"
            value={vals.cors_origins}
            onChange={(e) =>
              setVals((v) => ({ ...v, cors_origins: e.currentTarget.value }))
            }
          />
          <p className="text-xs text-muted-foreground">
            Разрешённые источники для интеграций
          </p>
        </div>

        <ProblemAlert problem={problem} />

        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => navigate(`/courses/${slug}`)}
            data-testid="course-settings-cancel"
          >
            Назад к курсу
          </Button>
          <Button
            type="submit"
            disabled={!canEdit || update.isPending}
            data-testid="course-settings-submit"
          >
            {update.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Сохранить
          </Button>
        </div>
      </form>

      {canEdit && <SheetLinkSection courseId={course.id} />}
    </Page>
  );
}

/** Accept a full ``…/spreadsheets/d/<id>/edit`` URL or a bare id. */
function parseSpreadsheetId(raw: string): string {
  const t = raw.trim();
  const m = t.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : t;
}

/** «Таблица для оценок» — bind a Google Sheet to the course once, so the
 *  Экспорт page can write grades into it with a single click. Owner /
 *  co_owner only (mirrors the backend RBAC on the link endpoints). */
function SheetLinkSection({ courseId }: { courseId: string }) {
  const notify = useNotifications();
  const { data: link } = useGoogleSheetsLink(courseId);
  const create = useCreateSheetsLink(courseId);
  const update = useSetSheetsLink(courseId);
  const remove = useDeleteSheetsLink(courseId);
  const validate = useValidateSheetsLink(courseId);

  const [sheetInput, setSheetInput] = useState('');
  const [tab, setTab] = useState('');
  const [checked, setChecked] = useState<{
    ok: boolean;
    detail?: string | null;
  } | null>(null);

  useEffect(() => {
    if (link) {
      setSheetInput(link.spreadsheet_id ?? '');
      setTab(link.sheet_name ?? '');
    }
  }, [link?.spreadsheet_id, link?.sheet_name]);

  const busy = create.isPending || update.isPending || remove.isPending;

  const onSave = async () => {
    const sid = parseSpreadsheetId(sheetInput);
    if (!sid) {
      notify.error('Укажите ссылку или ID Google-таблицы');
      return;
    }
    setChecked(null);
    try {
      if (link) {
        await update.mutateAsync({
          spreadsheet_id: sid,
          sheet_name: tab || undefined,
        });
      } else {
        await create.mutateAsync({
          spreadsheet_id: sid,
          sheet_name: tab || 'Оценки',
        });
      }
      notify.success('Таблица привязана к курсу');
    } catch (e) {
      notify.error(parseProblem(e).detail || 'Не удалось сохранить');
    }
  };

  const onValidate = async () => {
    try {
      const res = await validate.mutateAsync();
      setChecked(res);
      if (res.ok) notify.success('Доступ к таблице есть');
      else notify.error(res.detail || 'Нет доступа к таблице');
    } catch {
      notify.error('Не удалось проверить доступ');
    }
  };

  const onRemove = async () => {
    if (!confirm('Отвязать таблицу от курса?')) return;
    try {
      await remove.mutateAsync();
      setSheetInput('');
      setTab('');
      setChecked(null);
      notify.success('Таблица отвязана');
    } catch {
      notify.error('Не удалось отвязать');
    }
  };

  return (
    <section
      className="space-y-3 border-t border-border/60 pt-6"
      data-testid="course-sheets-link"
    >
      <div className="space-y-1">
        <h2 className="inline-flex items-center gap-2 text-base font-semibold">
          <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
          Таблица для оценок
        </h2>
        <p className="text-sm text-muted-foreground">
          Привяжите Google-таблицу один раз — на странице «Экспорт» оценки
          будут уезжать в неё одной кнопкой. Поделитесь таблицей с сервисным
          аккаунтом PlagLens (доступ на редактирование).
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
        <div className="space-y-1.5">
          <Label htmlFor="course-sheet-id">Ссылка или ID таблицы</Label>
          <Input
            id="course-sheet-id"
            data-testid="course-sheet-id"
            placeholder="https://docs.google.com/spreadsheets/d/… или 1AbC…"
            value={sheetInput}
            onChange={(e) => {
              setSheetInput(e.currentTarget.value);
              setChecked(null);
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="course-sheet-tab">Вкладка (лист)</Label>
          <Input
            id="course-sheet-tab"
            data-testid="course-sheet-tab"
            placeholder="Оценки"
            value={tab}
            onChange={(e) => setTab(e.currentTarget.value)}
          />
        </div>
      </div>
      {checked && (
        <p
          className={cn(
            'inline-flex items-center gap-1.5 text-xs',
            checked.ok
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-sev-high',
          )}
        >
          {checked.ok ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5" /> Доступ есть
            </>
          ) : (
            checked.detail || 'Нет доступа'
          )}
        </p>
      )}
      <div className="flex items-center justify-end gap-2">
        {link && (
          <Button
            type="button"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={onRemove}
            disabled={busy}
            data-testid="course-sheet-remove"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Отвязать
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          onClick={onValidate}
          disabled={!link || validate.isPending}
          data-testid="course-sheet-validate"
        >
          {validate.isPending && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          )}
          Проверить доступ
        </Button>
        <Button
          type="button"
          onClick={onSave}
          disabled={!sheetInput.trim() || busy}
          data-testid="course-sheet-save"
        >
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {link ? 'Обновить' : 'Привязать'}
        </Button>
      </div>
    </section>
  );
}
