/**
 * HomeworkCreateDialog — modal for creating a ДЗ from the course page.
 *
 * Two modes (segmented buttons at the top):
 *   • «Простое ДЗ» (default) — само ДЗ = задание: a minimal form (title,
 *     description, optional deadline, max score, + language when type=Код).
 *     On submit we create the homework AND one assignment inside it carrying
 *     those settings, so submissions / grading work like a normal task — no
 *     separate «add a task» step.
 *   • «Несколько заданий» — only the homework container is created; the
 *     teacher then adds individual tasks to it.
 *
 * Task type (simple mode only):
 *   • «Код» — a programming language is picked; code-plagiarism auto-runs.
 *   • «PDF» — student uploads a PDF only (math / scans); no language, no
 *     code-plagiarism. Persisted as language_hint='pdf', which the upload
 *     page reads to restrict the dropzone to PDF files.
 *
 * Deliberately minimal: late multiplier, plagiarism threshold, AI analysis,
 * external integration and the markdown preview are NOT here — they live in
 * the task's own settings (and Я.Контест is a separate import button).
 */
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { useCreateHomework } from '@/hooks/api/useHomeworks';
import { useCreateAssignment } from '@/hooks/api/useAssignments';
import { useNotifications } from '@/hooks/useNotifications';
import { parseProblem } from '@/api/problem';
import { useTranslation } from '@/i18n';
import { cn } from '@/components/ui/utils';
import type { Problem } from '@/api/types';

const LANGUAGE_OPTIONS = [
  { value: 'python', label: 'Python' },
  { value: 'cpp', label: 'C++' },
  { value: 'java', label: 'Java' },
  { value: 'go', label: 'Go' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'csharp', label: 'C#' },
  { value: 'kotlin', label: 'Kotlin' },
  { value: 'rust', label: 'Rust' },
];

interface Props {
  open: boolean;
  onClose: () => void;
  courseId: string;
}

export function HomeworkCreateDialog({ open, onClose, courseId }: Props) {
  const { t } = useTranslation();
  const notify = useNotifications();
  const createHw = useCreateHomework(courseId);
  const createAsg = useCreateAssignment(courseId);

  const [collection, setCollection] = useState(false);
  const [taskType, setTaskType] = useState<'code' | 'pdf'>('code');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [language, setLanguage] = useState('python');
  const [maxScore, setMaxScore] = useState(10);
  const [deadlineLocal, setDeadlineLocal] = useState('');
  const [problem, setProblem] = useState<Problem | null>(null);

  useEffect(() => {
    if (open) {
      setCollection(false);
      setTaskType('code');
      setTitle('');
      setDescription('');
      setLanguage('python');
      setMaxScore(10);
      setDeadlineLocal('');
      setProblem(null);
    }
  }, [open]);

  const busy = createHw.isPending || createAsg.isPending;
  const canSubmit = title.trim().length >= 2 && !busy;

  const submit = async () => {
    setProblem(null);
    if (title.trim().length < 2) return;
    const dueIso = deadlineLocal ? new Date(deadlineLocal).toISOString() : null;
    try {
      const hw = await createHw.mutateAsync({
        title: title.trim(),
        description: description || null,
        // Structural type — simple ДЗ is its own task; collection holds many.
        kind: collection ? 'collection' : 'single',
        due_at: dueIso,
      });
      // Простое ДЗ → создаём единственное задание, которое И ЕСТЬ это ДЗ.
      if (!collection) {
        await createAsg.mutateAsync({
          title: title.trim(),
          description,
          language_hint: taskType === 'code' ? language : 'pdf',
          max_score: maxScore,
          weight: 1,
          deadline_soft_at: null,
          deadline_hard_at: dueIso,
          selection_strategy: 'best',
          plagiarism_auto_run: taskType === 'code',
          plagiarism_threshold: 0.6,
          ai_auto_run: false,
          external_bindings: [],
          homework_id: hw.id,
        });
      }
      notify.success(t('homework_create.created'));
      onClose();
    } catch (e) {
      setProblem(parseProblem(e));
    }
  };

  const segBtn = (active: boolean) =>
    cn(
      'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
      active
        ? 'bg-background text-foreground shadow-sm'
        : 'text-muted-foreground hover:text-foreground',
    );

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="sm:max-w-lg max-h-[85vh] overflow-y-auto"
        data-testid="homework-create-dialog"
      >
        <DialogHeader>
          <DialogTitle>{t('homework_create.dialog_title')}</DialogTitle>
        </DialogHeader>

        {/* Mode — segmented buttons (простое ДЗ vs сборник) */}
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
          <button
            type="button"
            className={segBtn(!collection)}
            onClick={() => setCollection(false)}
            data-testid="homework-create-mode-simple"
          >
            {t('homework_create.mode_simple')}
          </button>
          <button
            type="button"
            className={segBtn(collection)}
            onClick={() => setCollection(true)}
            data-testid="homework-create-mode-collection"
          >
            {t('homework_create.mode_collection')}
          </button>
        </div>

        <div className="space-y-4">
          {/* Title — always */}
          <div className="space-y-1.5">
            <Label htmlFor="hw-create-title">
              {t('homework_create.name_label')}{' '}
              <span className="text-destructive">*</span>
            </Label>
            <Input
              id="hw-create-title"
              data-testid="homework-create-title"
              placeholder={t('homework_create.name_placeholder')}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {/* Description — plain editor, no preview tab */}
          <div className="space-y-1.5">
            <Label htmlFor="hw-create-desc">
              {t('homework_create.description_label')}
            </Label>
            <Textarea
              id="hw-create-desc"
              rows={6}
              placeholder={t('homework_create.description_placeholder')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Task fields — only for «простое ДЗ» */}
          {!collection && (
            <>
              <div className="space-y-1.5">
                <Label>{t('homework_create.type_label')}</Label>
                <div className="inline-grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
                  <button
                    type="button"
                    className={segBtn(taskType === 'code')}
                    onClick={() => setTaskType('code')}
                    data-testid="homework-create-type-code"
                  >
                    {t('homework_create.type_code')}
                  </button>
                  <button
                    type="button"
                    className={segBtn(taskType === 'pdf')}
                    onClick={() => setTaskType('pdf')}
                    data-testid="homework-create-type-pdf"
                  >
                    {t('homework_create.type_pdf')}
                  </button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {taskType === 'code' && (
                  <div className="space-y-1.5">
                    <Label htmlFor="hw-create-language">
                      {t('hw_assignment_create.language_label')}
                    </Label>
                    <Select value={language} onValueChange={setLanguage}>
                      <SelectTrigger id="hw-create-language">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {LANGUAGE_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                        <SelectItem value="other">
                          {t('hw_assignment_create.language_other')}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="hw-create-max_score">
                    {t('hw_assignment_create.max_score_label')}
                  </Label>
                  <Input
                    id="hw-create-max_score"
                    type="number"
                    min={0}
                    max={100}
                    value={maxScore}
                    onChange={(e) => setMaxScore(Number(e.target.value) || 0)}
                  />
                </div>
              </div>
            </>
          )}

          {/* Deadline — single, optional (жёсткий, без мягкого) */}
          <div className="space-y-1.5">
            <Label htmlFor="hw-create-deadline">
              {t('homework_create.deadline_label')}{' '}
              <span className="text-xs font-normal text-muted-foreground">
                {t('homework_create.deadline_optional')}
              </span>
            </Label>
            <Input
              id="hw-create-deadline"
              type="datetime-local"
              value={deadlineLocal}
              onChange={(e) => setDeadlineLocal(e.target.value)}
            />
          </div>
        </div>

        <ProblemAlert problem={problem} />

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('homework_create.cancel')}
          </Button>
          <Button
            onClick={submit}
            disabled={!canSubmit}
            data-testid="homework-create-submit"
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('homework_create.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default HomeworkCreateDialog;
