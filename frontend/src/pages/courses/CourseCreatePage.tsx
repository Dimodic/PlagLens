/**
 * CourseCreatePage — form for creating a new course.
 *
 * No slug field — the backend auto-derives the slug from the name.
 * Slugs are internal / URL-only now; users never type or see them.
 */
import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { useCreateCourse } from '@/hooks/api/useCourses';
import { useNotifications } from '@/hooks/useNotifications';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { parseProblem } from '@/api/problem';
import type { Problem } from '@/api/types';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Page, PageHeader } from '@/components/layout/Page';

export default function CourseCreatePage() {
  useDocumentTitle('Создание курса');
  const navigate = useNavigate();
  const notify = useNotifications();
  const create = useCreateCourse();
  const [problem, setProblem] = useState<Problem | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [nameError, setNameError] = useState<string | null>(null);

  const validate = (): boolean => {
    if (name.trim().length < 2) {
      setNameError('Не короче 2 символов');
      return false;
    }
    setNameError(null);
    return true;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setProblem(null);
    try {
      const created = await create.mutateAsync({
        name,
        description,
        start_date: startDate || null,
        end_date: endDate || null,
      });
      notify.success('Курс создан');
      navigate(`/courses/${created.slug}`);
    } catch (e) {
      setProblem(parseProblem(e));
    }
  };

  return (
    <Page width="narrow">
      <Link
        to="/courses"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Курсы
      </Link>
      <PageHeader title="Создание курса" />

      <form
        data-testid="course-create-form"
        onSubmit={handleSubmit}
        className="space-y-4"
      >
        <div className="space-y-1.5">
          <Label htmlFor="course-create-name">Название</Label>
          <Input
            id="course-create-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            data-testid="course-create-name"
            aria-invalid={!!nameError}
          />
          {nameError && (
            <p role="alert" className="text-xs text-destructive">
              {nameError}
            </p>
          )}
        </div>

        <div className="space-y-1.5" data-testid="course-create-description">
          <Label htmlFor="course-create-description-field">Описание</Label>
          <Textarea
            id="course-create-description-field"
            rows={6}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="font-mono text-sm"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="course-create-start-date">Дата начала</Label>
            <Input
              id="course-create-start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              data-testid="course-create-start-date"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="course-create-end-date">Дата окончания</Label>
            <Input
              id="course-create-end-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              data-testid="course-create-end-date"
            />
          </div>
        </div>

        <ProblemAlert problem={problem} />

        <div className="pt-2">
          <Button
            type="submit"
            disabled={create.isPending}
            data-testid="course-create-submit"
          >
            {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Создать
          </Button>
        </div>
      </form>
    </Page>
  );
}
