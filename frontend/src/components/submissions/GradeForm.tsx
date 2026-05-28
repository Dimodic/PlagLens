/**
 * Form for setting / updating a submission grade.
 *
 * The companion {@link GradeDisplay} renders the saved grade as
 * read-only text (big score + comment) until the teacher clicks the
 * pencil icon to re-enter the form. That split removes the "always
 * editable" feel and keeps the rail quiet between graders' actions.
 */
import { FormEvent, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Loader2, Pencil, Trash2 } from 'lucide-react';
import type { CreateGradeInput } from '@/api/endpoints/submissions';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/components/ui/utils';

interface GradeFormProps {
  initial?: { score?: number; comment?: string; comment_visible_to_student?: boolean } | null;
  maxScore?: number;
  isLateHard?: boolean;
  loading?: boolean;
  /** AI-generated short note for the student. When it changes and the
   * teacher hasn't yet typed anything, it auto-populates the comment field
   * so the teacher can edit / approve / wipe before saving. Never
   * overwrites manual edits. */
  suggestedComment?: string;
  onSubmit: (input: CreateGradeInput) => void;
  /** Returns the form to display mode without saving. Provided only when
   * a grade already exists (i.e. there's a state to revert to). */
  onCancel?: () => void;
}

export function GradeForm({
  initial,
  maxScore = 10,
  isLateHard,
  loading,
  suggestedComment,
  onSubmit,
  onCancel,
}: GradeFormProps) {
  const [score, setScore] = useState<string>(
    initial?.score !== undefined ? String(initial.score) : '0',
  );
  const [comment, setComment] = useState<string>(initial?.comment ?? '');
  // Default the «show to student» flag to true — in an academic
  // setting an оценка that's been saved is expected to be visible
  // immediately. A teacher can still untick it for «черновая
  // оценка» drafts that shouldn't reach the student yet.
  const [commentVisible, setCommentVisible] = useState<boolean>(
    initial?.comment_visible_to_student ?? true,
  );
  const [scoreError, setScoreError] = useState<string | null>(null);

  // Track the last suggestion we auto-applied so we can replace it when a
  // newer AI run comes in — but only if the teacher hasn't edited it.
  const lastSuggestionRef = useRef<string>('');
  useEffect(() => {
    if (!suggestedComment) return;
    if (suggestedComment === lastSuggestionRef.current) return;
    // Either field is empty or still holds the previously-suggested text.
    if (comment === '' || comment === lastSuggestionRef.current) {
      setComment(suggestedComment);
      lastSuggestionRef.current = suggestedComment;
    }
  }, [suggestedComment, comment]);

  const validate = (): boolean => {
    if (score === '' || score === undefined) {
      setScoreError('Введите оценку');
      return false;
    }
    const n = Number(score);
    if (!Number.isFinite(n)) {
      setScoreError('Должно быть число');
      return false;
    }
    if (n < 0) {
      setScoreError('Оценка не может быть отрицательной');
      return false;
    }
    if (n > maxScore) {
      setScoreError(`Не больше ${maxScore}`);
      return false;
    }
    setScoreError(null);
    return true;
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    onSubmit({
      score: Number(score),
      comment: comment || undefined,
      comment_visible_to_student: commentVisible,
    });
  };

  return (
    <form
      data-testid="grade-form"
      onSubmit={handleSubmit}
      className="space-y-4"
    >
      {isLateHard && (
        <Alert
          variant="destructive"
          className="bg-sev-mid-bg text-sev-mid border-sev-mid/40"
          data-testid="grade-form-late-hard-warning"
        >
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Посылка после жёсткого дедлайна — оценка по правилам сервиса будет
            обнулена сервером.
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor="submission-grade-input">Оценка</Label>
        {/* Symmetric pill grid: 0..maxScore on a uniform-width grid, with
            the manual-input box occupying the trailing cell so the
            whole control reads as one block (no orphan input row below).
            Number(maxScore) coerces the backend's Decimal-as-string. */}
        {(() => {
          const maxN = Number(maxScore);
          const valid =
            Number.isFinite(maxN) && maxN > 0 && maxN <= 20;
          const pillCount = valid ? Math.floor(maxN) + 1 : 0;
          // Grid width = pills + 1 cell for the input. We pick 6 columns
          // for maxN==10 (gives a tidy 6 + 6 layout: 0-5 / 6-10 + input)
          // and fall back to a compact 4-column grid for everything else.
          const cols = pillCount > 0 && pillCount + 1 <= 12
            ? Math.ceil((pillCount + 1) / 2)
            : 4;
          if (!valid) {
            return (
              <Input
                id="submission-grade-input"
                type="number"
                min={0}
                max={maxScore}
                step={0.01}
                value={score}
                onChange={(e) => setScore(e.target.value)}
                data-testid="submission-grade-input"
                aria-invalid={!!scoreError}
                className="h-9"
              />
            );
          }
          return (
            <div
              className="grid gap-1.5"
              style={{
                gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
              }}
            >
              {Array.from({ length: pillCount }, (_, n) => {
                const selected = Number(score) === n;
                return (
                  <button
                    key={n}
                    type="button"
                    data-testid={`submission-grade-pill-${n}`}
                    onClick={() => {
                      setScore(String(n));
                      setScoreError(null);
                    }}
                    className={cn(
                      'h-9 rounded-md text-sm tabular-nums transition-colors',
                      selected
                        ? 'bg-primary text-primary-foreground'
                        : 'border border-border/70 text-muted-foreground hover:text-foreground hover:bg-muted/40',
                    )}
                  >
                    {n}
                  </button>
                );
              })}
              {/* Manual-input cell — sits flush with the pills, used for
                  half-points (9.5 etc.) and keyboard entry. Visually
                  distinguished from the pills by a dashed border and a
                  ".5" placeholder so it's obvious this is an input, not
                  another button. The native number-spinner arrows are
                  suppressed (they conflict with the tight grid cell). */}
              <Input
                id="submission-grade-input"
                type="number"
                min={0}
                max={maxScore}
                step={0.01}
                value={score}
                onChange={(e) => setScore(e.target.value)}
                data-testid="submission-grade-input"
                aria-invalid={!!scoreError}
                aria-label="Ввести оценку вручную"
                placeholder=".5"
                className="h-9 px-2 text-center border-dashed bg-background text-foreground/90 placeholder:text-muted-foreground/60 placeholder:font-normal [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>
          );
        })()}
        <p className="text-xs text-muted-foreground">Максимум: {maxScore}</p>
        {scoreError && (
          <p role="alert" className="text-xs text-destructive">
            {scoreError}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="submission-grade-comment">Комментарий</Label>
        <Textarea
          id="submission-grade-comment"
          rows={3}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          data-testid="submission-grade-comment"
        />
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="submission-grade-visible-to-student"
          checked={commentVisible}
          onCheckedChange={(c) => setCommentVisible(c === true)}
          data-testid="submission-grade-visible-to-student"
        />
        <Label
          htmlFor="submission-grade-visible-to-student"
          className="font-normal cursor-pointer"
        >
          Виден студенту
        </Label>
      </div>

      <div className="flex items-center justify-end gap-2">
        {onCancel && (
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={loading}
            data-testid="submission-grade-cancel"
          >
            Отмена
          </Button>
        )}
        <Button
          type="submit"
          disabled={loading}
          data-testid="submission-grade-submit"
        >
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Сохранить
        </Button>
      </div>
    </form>
  );
}

/** Read-only view of a saved grade.
 *
 *  Big score above (so the grader sees the number at a glance), comment
 *  rendered as plain prose, and two small ghost icon-buttons (pencil =
 *  edit, trash = clear) tucked into the top-right corner. No red,
 *  destructive-looking button — the destructive intent lives behind a
 *  small icon that requires intent to find. */
interface GradeDisplayProps {
  score: number | string;
  maxScore?: number | string;
  comment?: string | null;
  commentVisibleToStudent?: boolean;
  onEdit: () => void;
  onDelete: () => void;
  deleting?: boolean;
}

export function GradeDisplay({
  score,
  maxScore = 10,
  comment,
  commentVisibleToStudent,
  onEdit,
  onDelete,
  deleting,
}: GradeDisplayProps) {
  // Strip trailing zeros from "7.00" → "7"; keep "7.5" intact.
  const scoreStr = (() => {
    const n = Number(score);
    if (!Number.isFinite(n)) return String(score);
    return n.toString();
  })();
  const maxStr = (() => {
    const n = Number(maxScore);
    if (!Number.isFinite(n)) return String(maxScore);
    return n.toString();
  })();

  return (
    <div data-testid="grade-display" className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Оценка
          </Label>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span
              data-testid="grade-display-score"
              className="text-4xl font-semibold tabular-nums leading-none"
            >
              {scoreStr}
            </span>
            <span className="text-sm text-muted-foreground">
              / {maxStr}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onEdit}
            disabled={deleting}
            aria-label="Изменить оценку"
            data-testid="grade-display-edit"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onDelete}
            disabled={deleting}
            aria-label="Снять оценку"
            data-testid="grade-display-delete"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
          >
            {deleting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>

      {comment && comment.trim() && (
        <div className="space-y-1">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Комментарий
          </Label>
          <p
            data-testid="grade-display-comment"
            className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90"
          >
            {comment}
          </p>
          <p className="text-xs text-muted-foreground">
            {commentVisibleToStudent ? 'Виден студенту' : 'Скрыт от студента'}
          </p>
        </div>
      )}
    </div>
  );
}
