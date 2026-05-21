/**
 * CourseSettingsPage — edit name/description/dates.
 * Disabled if user is not owner/co_owner/admin.
 */
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useCourse, useUpdateCourse } from '@/hooks/api/useCourses';
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
    </Page>
  );
}
