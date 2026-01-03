/**
 * /courses/:slug/homeworks/new — form for creating a homework.
 *
 * No slug field — the backend auto-derives the slug from the title.
 * Slugs are internal / URL-only now; users never type or see them.
 * Description uses our minimal MarkdownEditor; due_at uses native
 * datetime-local input.
 *
 * Archive-only lifecycle: created homeworks are always "active" (the backend
 * still labels this as `published`). There is no draft mode the user must
 * opt into.
 */
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { MarkdownEditor } from '@/components/forms/MarkdownEditor';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { useCourse } from '@/hooks/api/useCourses';
import { useCreateHomework } from '@/hooks/api/useHomeworks';
import { useNotifications } from '@/hooks/useNotifications';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { parseProblem } from '@/api/problem';
import type { Problem } from '@/api/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Page } from '@/components/layout/Page';

interface FormVals {
  title: string;
  description: string;
  due_at: string; // datetime-local input format YYYY-MM-DDTHH:mm
}

function fromLocalDateTimeInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export default function HomeworkCreatePage() {
  useDocumentTitle('Новое ДЗ');
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const notify = useNotifications();
  const { data: course } = useCourse(slug);
  const create = useCreateHomework(course?.id ?? '');
  const [problem, setProblem] = useState<Problem | null>(null);

  const [vals, setVals] = useState<FormVals>({
    title: '',
    description: '',
    due_at: '',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof FormVals, string>>>({});

  const validate = (v: FormVals): Partial<Record<keyof FormVals, string>> => {
    const errs: Partial<Record<keyof FormVals, string>> = {};
    if (v.title.trim().length < 2) errs.title = 'Не короче 2 символов';
    return errs;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProblem(null);
    const errs = validate(vals);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    try {
      // No draft state on the UI any more — homeworks are created
      // "active". We don't pass ``status`` at all: the backend defaults
      // to "active" and the only valid values are active|archived
      // ("published" was a legacy value that now 422s).
      await create.mutateAsync({
        title: vals.title,
        description: vals.description || null,
        due_at: fromLocalDateTimeInput(vals.due_at),
      });
      notify.success('ДЗ создано');
      // HW detail page is gone — drop the teacher back on the course
      // page, where the new ДЗ now lives in the inline list.
      navigate(`/courses/${slug}`);
    } catch (err) {
      setProblem(parseProblem(err));
    }
  };

  return (
    <Page width="narrow">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Новое ДЗ</h1>
        {course?.name && (
          <p className="mt-1 text-sm text-muted-foreground">{course.name}</p>
        )}
      </div>

      <form
        data-testid="homework-create-form"
        onSubmit={handleSubmit}
        className="space-y-4"
      >
        <div className="space-y-1.5">
          <Label htmlFor="homework-create-title">
            Название <span className="text-destructive">*</span>
          </Label>
          <Input
            id="homework-create-title"
            placeholder="Неделя 3 — функции и рекурсия"
            required
            data-testid="homework-create-title"
            value={vals.title}
            onChange={(e) => setVals((v) => ({ ...v, title: e.currentTarget.value }))}
            aria-invalid={!!errors.title}
          />
          {errors.title && (
            <p className="text-sm text-destructive">{errors.title}</p>
          )}
        </div>

        <div data-testid="homework-create-description">
          <MarkdownEditor
            label="Описание (Markdown)"
            value={vals.description}
            onChange={(v) => setVals((prev) => ({ ...prev, description: v }))}
            placeholder="Опишите тему недели и задания"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="homework-create-due_at">Дедлайн</Label>
          <Input
            id="homework-create-due_at"
            type="datetime-local"
            data-testid="homework-create-due_at"
            value={vals.due_at}
            onChange={(e) =>
              setVals((v) => ({ ...v, due_at: e.currentTarget.value }))
            }
          />
          <p className="text-xs text-muted-foreground">
            Применяется ко всем заданиям без собственного дедлайна
          </p>
        </div>

        <ProblemAlert problem={problem} />

        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => navigate(`/courses/${slug}`)}
            data-testid="homework-create-cancel"
          >
            Отмена
          </Button>
          <Button
            type="submit"
            disabled={create.isPending}
            data-testid="homework-create-submit"
          >
            {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Создать
          </Button>
        </div>
      </form>
    </Page>
  );
}
