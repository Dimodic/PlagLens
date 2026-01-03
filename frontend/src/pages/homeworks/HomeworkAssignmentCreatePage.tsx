/**
 * /courses/:slug/homeworks/:hwSlug/assignments/new — like AssignmentCreatePage,
 * but pre-fills `homework_id` and redirects back to the homework detail.
 */
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useCourse } from '@/hooks/api/useCourses';
import { useCreateAssignment } from '@/hooks/api/useAssignments';
import { useHomeworksForCourse } from '@/hooks/api/useHomeworks';
import { MarkdownEditor } from '@/components/forms/MarkdownEditor';
import { DeadlineFields } from '@/components/forms/DeadlineFields';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { SkeletonList } from '@/components/common/Skeleton';
import { useNotifications } from '@/hooks/useNotifications';
import { parseProblem } from '@/api/problem';
import type { Problem } from '@/api/types';
import type { SelectionStrategy } from '@/api/endpoints/assignments';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import NotFoundPage from '@/pages/NotFoundPage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface FormVals {
  // No slug — the backend auto-derives it from the title.
  title: string;
  description: string;
  language_hint: string;
  max_score: number;
  weight: number;
  deadline_soft_at: string | null;
  deadline_hard_at: string | null;
  late_score_multiplier: number;
  selection_strategy: SelectionStrategy;
  plagiarism_auto_run: boolean;
  plagiarism_threshold: number;
  ai_auto_run: boolean;
  external_system: 'none' | 'stepik' | 'yandex_contest';
  external_id: string;
}

export default function HomeworkAssignmentCreatePage() {
  useDocumentTitle('Новое задание');
  const { slug, hwSlug } = useParams<{ slug: string; hwSlug: string }>();
  const navigate = useNavigate();
  const notify = useNotifications();
  const { data: course, isLoading: courseLoading } = useCourse(slug);
  const homeworksQ = useHomeworksForCourse(course?.id, { limit: 100 });
  const homework = useMemo(
    () => homeworksQ.data?.data.find((h) => h.slug === hwSlug),
    [homeworksQ.data, hwSlug],
  );
  const create = useCreateAssignment(course?.id ?? '');
  const [problem, setProblem] = useState<Problem | null>(null);

  const [vals, setVals] = useState<FormVals>({
    title: '',
    description: '',
    language_hint: 'python',
    max_score: 10,
    weight: 1,
    deadline_soft_at: null,
    deadline_hard_at: null,
    late_score_multiplier: 0.5,
    selection_strategy: 'best',
    plagiarism_auto_run: true,
    plagiarism_threshold: 0.6,
    ai_auto_run: false,
    external_system: 'none',
    external_id: '',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof FormVals, string>>>({});

  const validate = (v: FormVals): Partial<Record<keyof FormVals, string>> => {
    const errs: Partial<Record<keyof FormVals, string>> = {};
    if (v.title.trim().length < 2) errs.title = 'Не короче 2 символов';
    return errs;
  };

  if ((courseLoading || homeworksQ.isLoading) && (!course || !homeworksQ.data)) {
    return (
      <div className="space-y-6 max-w-3xl">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Новое задание</h1>
        </div>
        <SkeletonList rows={4} rowHeight={48} />
      </div>
    );
  }

  if (!homework) {
    return <NotFoundPage />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProblem(null);
    const errs = validate(vals);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    try {
      const result = await create.mutateAsync({
        title: vals.title,
        description: vals.description,
        language_hint: vals.language_hint,
        max_score: vals.max_score,
        weight: vals.weight,
        deadline_soft_at: vals.deadline_soft_at,
        deadline_hard_at: vals.deadline_hard_at,
        late_score_multiplier: vals.late_score_multiplier,
        selection_strategy: vals.selection_strategy,
        plagiarism_auto_run: vals.plagiarism_auto_run,
        plagiarism_threshold: vals.plagiarism_threshold,
        ai_auto_run: vals.ai_auto_run,
        external_bindings:
          vals.external_system !== 'none' && vals.external_id
            ? [
                {
                  system: vals.external_system,
                  external_assignment_id: vals.external_id,
                },
              ]
            : [],
        homework_id: homework.id,
      });
      notify.success('Задание создано');
      void result;
      // HW detail page is gone — go back to the course page where the
      // homework is in the inline ДЗ list.
      navigate(`/courses/${slug}`);
    } catch (err) {
      setProblem(parseProblem(err));
    }
  };

  const subtitle = course?.name ? `${course.name} → ${homework.title}` : homework.title;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Новое задание</h1>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>

      <form
        onSubmit={handleSubmit}
        data-testid="hw-assignment-form"
        className="space-y-4"
      >
        <div className="space-y-1.5">
          <Label htmlFor="hw-assignment-form-homework">ДЗ</Label>
          <Input
            id="hw-assignment-form-homework"
            value={homework.title}
            disabled
            data-testid="hw-assignment-form-homework"
          />
          <p className="text-xs text-muted-foreground">
            Задание создаётся в текущем ДЗ
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="hw-assignment-form-title">
            Название <span className="text-destructive">*</span>
          </Label>
          <Input
            id="hw-assignment-form-title"
            required
            data-testid="hw-assignment-form-title"
            value={vals.title}
            onChange={(e) => setVals((v) => ({ ...v, title: e.currentTarget.value }))}
            aria-invalid={!!errors.title}
          />
          {errors.title && (
            <p className="text-sm text-destructive">{errors.title}</p>
          )}
        </div>

        <div data-testid="hw-assignment-form-description">
          <MarkdownEditor
            label="Описание (Markdown)"
            value={vals.description}
            onChange={(v) => setVals((prev) => ({ ...prev, description: v }))}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="hw-assignment-form-language">Язык</Label>
            <Select
              value={vals.language_hint}
              onValueChange={(v) => setVals((prev) => ({ ...prev, language_hint: v }))}
            >
              <SelectTrigger
                id="hw-assignment-form-language"
                data-testid="hw-assignment-form-language"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="python">Python</SelectItem>
                <SelectItem value="cpp">C++</SelectItem>
                <SelectItem value="java">Java</SelectItem>
                <SelectItem value="go">Go</SelectItem>
                <SelectItem value="javascript">JavaScript</SelectItem>
                <SelectItem value="csharp">C#</SelectItem>
                <SelectItem value="kotlin">Kotlin</SelectItem>
                <SelectItem value="rust">Rust</SelectItem>
                <SelectItem value="other">Другой</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hw-assignment-form-max_score">Макс. оценка</Label>
            <Input
              id="hw-assignment-form-max_score"
              type="number"
              min={0}
              max={100}
              data-testid="hw-assignment-form-max_score"
              value={vals.max_score}
              onChange={(e) =>
                setVals((v) => ({
                  ...v,
                  max_score: Number(e.currentTarget.value) || 0,
                }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hw-assignment-form-weight">Вес</Label>
            <Input
              id="hw-assignment-form-weight"
              type="number"
              min={0}
              max={10}
              step={0.1}
              data-testid="hw-assignment-form-weight"
              value={vals.weight}
              onChange={(e) =>
                setVals((v) => ({
                  ...v,
                  weight: Number(e.currentTarget.value) || 0,
                }))
              }
            />
          </div>
        </div>

        <DeadlineFields
          softAt={vals.deadline_soft_at}
          hardAt={vals.deadline_hard_at}
          onChange={({ softAt, hardAt }) =>
            setVals((v) => ({
              ...v,
              deadline_soft_at: softAt,
              deadline_hard_at: hardAt,
            }))
          }
        />

        <div className="space-y-1.5">
          <Label htmlFor="hw-assignment-form-late_multiplier">
            Множитель для late submissions
          </Label>
          <Input
            id="hw-assignment-form-late_multiplier"
            type="number"
            min={0}
            max={1}
            step={0.05}
            data-testid="hw-assignment-form-late_multiplier"
            value={vals.late_score_multiplier}
            onChange={(e) =>
              setVals((v) => ({
                ...v,
                late_score_multiplier: Number(e.currentTarget.value) || 0,
              }))
            }
          />
          <p className="text-xs text-muted-foreground">
            Применяется к оценке посылок после soft-дедлайна
          </p>
        </div>

        <div className="space-y-2" data-testid="hw-assignment-form-selection_strategy">
          <Label>Стратегия выбора посылки</Label>
          <RadioGroup
            value={vals.selection_strategy}
            onValueChange={(v) =>
              setVals((prev) => ({
                ...prev,
                selection_strategy: v as SelectionStrategy,
              }))
            }
            className="flex flex-row flex-wrap gap-4"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="last" id="hw-asg-strategy-last" />
              <Label htmlFor="hw-asg-strategy-last" className="font-normal">
                Последняя
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="best" id="hw-asg-strategy-best" />
              <Label htmlFor="hw-asg-strategy-best" className="font-normal">
                Лучшая
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="manual" id="hw-asg-strategy-manual" />
              <Label htmlFor="hw-asg-strategy-manual" className="font-normal">
                Вручную
              </Label>
            </div>
          </RadioGroup>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="hw-assignment-form-plagiarism_auto_run">
                Авто-запуск проверки плагиата
              </Label>
              <Switch
                id="hw-assignment-form-plagiarism_auto_run"
                data-testid="hw-assignment-form-plagiarism_auto_run"
                checked={vals.plagiarism_auto_run}
                onCheckedChange={(c) =>
                  setVals((v) => ({ ...v, plagiarism_auto_run: !!c }))
                }
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hw-assignment-form-plagiarism_threshold">
              Порог сходства
            </Label>
            <Input
              id="hw-assignment-form-plagiarism_threshold"
              type="number"
              min={0}
              max={1}
              step={0.05}
              data-testid="hw-assignment-form-plagiarism_threshold"
              value={vals.plagiarism_threshold}
              onChange={(e) =>
                setVals((v) => ({
                  ...v,
                  plagiarism_threshold: Number(e.currentTarget.value) || 0,
                }))
              }
            />
            <p className="text-xs text-muted-foreground">0.0 – 1.0</p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="hw-assignment-form-ai_auto_run">
            Авто-запуск AI-анализа
          </Label>
          <Switch
            id="hw-assignment-form-ai_auto_run"
            data-testid="hw-assignment-form-ai_auto_run"
            checked={vals.ai_auto_run}
            onCheckedChange={(c) => setVals((v) => ({ ...v, ai_auto_run: !!c }))}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="hw-assignment-form-external_system">
              Внешняя интеграция
            </Label>
            <Select
              value={vals.external_system}
              onValueChange={(v) =>
                setVals((prev) => ({
                  ...prev,
                  external_system: v as FormVals['external_system'],
                }))
              }
            >
              <SelectTrigger id="hw-assignment-form-external_system">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Нет</SelectItem>
                <SelectItem value="stepik">Stepik</SelectItem>
                <SelectItem value="yandex_contest">Яндекс.Контест</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hw-assignment-form-external_id">
              Внешний ID задания
            </Label>
            <Input
              id="hw-assignment-form-external_id"
              disabled={vals.external_system === 'none'}
              value={vals.external_id}
              onChange={(e) =>
                setVals((v) => ({ ...v, external_id: e.currentTarget.value }))
              }
            />
          </div>
        </div>

        <ProblemAlert problem={problem} />

        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            data-testid="hw-assignment-form-cancel"
            onClick={() => navigate(`/courses/${slug}`)}
          >
            Отмена
          </Button>
          <Button
            type="submit"
            disabled={create.isPending}
            data-testid="hw-assignment-form-submit"
          >
            {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Создать
          </Button>
        </div>
      </form>
    </div>
  );
}
