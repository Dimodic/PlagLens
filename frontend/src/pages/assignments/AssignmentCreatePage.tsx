/**
 * AssignmentCreatePage — form within course context.
 */
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useCourse } from '@/hooks/api/useCourses';
import { useCreateAssignment } from '@/hooks/api/useAssignments';
import { MarkdownEditor } from '@/components/forms/MarkdownEditor';
import { DeadlineFields } from '@/components/forms/DeadlineFields';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { useNotifications } from '@/hooks/useNotifications';
import { parseProblem } from '@/api/problem';
import type { Problem } from '@/api/types';
import type { SelectionStrategy } from '@/api/endpoints/assignments';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useTranslation } from '@/i18n';

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

const LANGUAGE_OPTIONS = [
  { value: 'python', label: 'Python' },
  { value: 'cpp', label: 'C++' },
  { value: 'java', label: 'Java' },
  { value: 'go', label: 'Go' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'csharp', label: 'C#' },
  { value: 'kotlin', label: 'Kotlin' },
  { value: 'rust', label: 'Rust' },
  { value: 'other', labelKey: 'assignment_create.language_other' },
];

const EXTERNAL_OPTIONS = [
  { value: 'none', labelKey: 'assignment_create.external_none' },
  { value: 'stepik', label: 'Stepik' },
  { value: 'yandex_contest', labelKey: 'assignment_create.external_yandex_contest' },
];

export default function AssignmentCreatePage() {
  const { t } = useTranslation();
  useDocumentTitle(t('assignment_create.title'));
  const { courseSlug } = useParams<{ courseSlug: string }>();
  const navigate = useNavigate();
  const notify = useNotifications();
  const { data: course } = useCourse(courseSlug);
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

  const [titleError, setTitleError] = useState<string | null>(null);

  const update = <K extends keyof FormVals>(key: K, value: FormVals[K]) => {
    setVals((prev) => ({ ...prev, [key]: value }));
  };

  const validate = (): boolean => {
    if (vals.title.trim().length < 2) {
      setTitleError(t('assignment_create.title_too_short'));
      return false;
    }
    setTitleError(null);
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setProblem(null);
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
      });
      notify.success(t('assignment_create.created'));
      navigate(`/assignments/${result.id}`);
    } catch (err) {
      setProblem(parseProblem(err));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('assignment_create.title')}</h1>
        {course?.name && (
          <p className="mt-1 text-sm text-muted-foreground">{course.name}</p>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        data-testid="assignment-form"
        className="space-y-5"
      >
        <div className="space-y-1.5">
          <Label htmlFor="assignment-form-title-input">{t('assignment_create.field_title')}</Label>
          <Input
            id="assignment-form-title-input"
            data-testid="assignment-form-title"
            value={vals.title}
            onChange={(e) => update('title', e.currentTarget.value)}
            aria-invalid={!!titleError}
          />
          {titleError && (
            <p className="text-sm text-destructive">{titleError}</p>
          )}
        </div>

        <div data-testid="assignment-form-description">
          <MarkdownEditor
            label={t('assignment_create.field_description')}
            value={vals.description}
            onChange={(v) => update('description', v)}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>{t('assignment_create.field_language')}</Label>
            <Select
              value={vals.language_hint}
              onValueChange={(v) => update('language_hint', v)}
            >
              <SelectTrigger data-testid="assignment-form-language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.labelKey ? t(o.labelKey) : o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="assignment-form-max-score-input">{t('assignment_create.field_max_score')}</Label>
            <Input
              id="assignment-form-max-score-input"
              type="number"
              min={0}
              max={100}
              data-testid="assignment-form-max_score"
              value={vals.max_score}
              onChange={(e) =>
                update('max_score', Number(e.currentTarget.value))
              }
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="assignment-form-weight-input">{t('assignment_create.field_weight')}</Label>
            <Input
              id="assignment-form-weight-input"
              type="number"
              min={0}
              max={10}
              step={0.1}
              data-testid="assignment-form-weight"
              value={vals.weight}
              onChange={(e) =>
                update('weight', Number(e.currentTarget.value))
              }
            />
          </div>
        </div>

        <DeadlineFields
          softAt={vals.deadline_soft_at}
          hardAt={vals.deadline_hard_at}
          onChange={({ softAt, hardAt }) => {
            update('deadline_soft_at', softAt);
            update('deadline_hard_at', hardAt);
          }}
        />

        <div className="space-y-1.5">
          <Label htmlFor="assignment-form-late-multiplier-input">
            {t('assignment_create.field_late_multiplier')}
          </Label>
          <Input
            id="assignment-form-late-multiplier-input"
            type="number"
            min={0}
            max={1}
            step={0.05}
            data-testid="assignment-form-late_multiplier"
            value={vals.late_score_multiplier}
            onChange={(e) =>
              update('late_score_multiplier', Number(e.currentTarget.value))
            }
          />
          <p className="text-xs text-muted-foreground">
            {t('assignment_create.field_late_multiplier_hint')}
          </p>
        </div>

        <div className="space-y-2" data-testid="assignment-form-selection_strategy">
          <Label>{t('assignment_create.field_selection_strategy')}</Label>
          <RadioGroup
            value={vals.selection_strategy}
            onValueChange={(v) =>
              update('selection_strategy', v as SelectionStrategy)
            }
            className="flex flex-wrap gap-4"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem
                value="last"
                id="selection-last"
                data-testid="assignment-form-selection_strategy-last"
              />
              <Label htmlFor="selection-last" className="font-normal">
                {t('assignment_create.selection_last')}
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem
                value="best"
                id="selection-best"
                data-testid="assignment-form-selection_strategy-best"
              />
              <Label htmlFor="selection-best" className="font-normal">
                {t('assignment_create.selection_best')}
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem
                value="manual"
                id="selection-manual"
                data-testid="assignment-form-selection_strategy-manual"
              />
              <Label htmlFor="selection-manual" className="font-normal">
                {t('assignment_create.selection_manual')}
              </Label>
            </div>
          </RadioGroup>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex items-center gap-3">
            <Switch
              id="assignment-form-plagiarism-switch"
              checked={vals.plagiarism_auto_run}
              onCheckedChange={(c) => update('plagiarism_auto_run', c)}
              data-testid="assignment-form-plagiarism_auto_run"
            />
            <Label
              htmlFor="assignment-form-plagiarism-switch"
              className="font-normal"
            >
              {t('assignment_create.plagiarism_auto_run')}
            </Label>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="assignment-form-plag-threshold-input">
              {t('assignment_create.plagiarism_threshold')}
            </Label>
            <Input
              id="assignment-form-plag-threshold-input"
              type="number"
              min={0}
              max={1}
              step={0.05}
              data-testid="assignment-form-plagiarism_threshold"
              value={vals.plagiarism_threshold}
              onChange={(e) =>
                update('plagiarism_threshold', Number(e.currentTarget.value))
              }
            />
            <p className="text-xs text-muted-foreground">0.0 – 1.0</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Switch
            id="assignment-form-ai-switch"
            checked={vals.ai_auto_run}
            onCheckedChange={(c) => update('ai_auto_run', c)}
            data-testid="assignment-form-ai_auto_run"
          />
          <Label htmlFor="assignment-form-ai-switch" className="font-normal">
            {t('assignment_create.ai_auto_run')}
          </Label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t('assignment_create.field_external_system')}</Label>
            <Select
              value={vals.external_system}
              onValueChange={(v) =>
                update('external_system', v as FormVals['external_system'])
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXTERNAL_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.labelKey ? t(o.labelKey) : o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="assignment-form-external-id-input">
              {t('assignment_create.field_external_id')}
            </Label>
            <Input
              id="assignment-form-external-id-input"
              disabled={vals.external_system === 'none'}
              value={vals.external_id}
              onChange={(e) => update('external_id', e.currentTarget.value)}
            />
          </div>
        </div>

        <ProblemAlert problem={problem} />

        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            data-testid="assignment-form-cancel"
            onClick={() => navigate(`/courses/${courseSlug}`)}
          >
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            disabled={create.isPending}
            data-testid="assignment-form-submit"
          >
            {create.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {t('common.create')}
          </Button>
        </div>
      </form>
    </div>
  );
}
