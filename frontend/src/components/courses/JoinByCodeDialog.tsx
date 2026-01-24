/**
 * JoinByCodeDialog — student enters an invitation code to join a course,
 * presented as a modal (used from the dashboard "join course" action).
 * Shares the join flow with JoinByCodePage via the useJoinByCode hook.
 */
import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useJoinByCode } from '@/hooks/api/useCourses';
import { coursesApi } from '@/api/endpoints/courses';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { useNotifications } from '@/hooks/useNotifications';
import { parseProblem } from '@/api/problem';
import type { Problem } from '@/api/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface JoinByCodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function JoinByCodeDialog({ open, onOpenChange }: JoinByCodeDialogProps) {
  const navigate = useNavigate();
  const notify = useNotifications();
  const join = useJoinByCode();
  const [problem, setProblem] = useState<Problem | null>(null);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setProblem(null);
    if (code.trim().length < 4) {
      setCodeError('Слишком короткий код');
      return;
    }
    setCodeError(null);
    try {
      const res = await join.mutateAsync(code.trim());
      notify.success('Вы присоединились к курсу');
      onOpenChange(false);
      setCode('');
      const maybeSlug =
        (res as { course_slug?: string }).course_slug ??
        (res as { course?: { slug?: string } }).course?.slug;
      if (maybeSlug) {
        navigate(`/courses/${maybeSlug}`);
        return;
      }
      try {
        const course = await coursesApi.get(String(res.course_id));
        navigate(`/courses/${course.slug}`);
      } catch {
        navigate('/courses');
      }
    } catch (err) {
      setProblem(parseProblem(err));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Присоединиться к курсу</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="join-code">Код приглашения</Label>
            <Input
              id="join-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="ABCD-1234"
              required
              autoFocus
              data-testid="join-code-input"
              aria-invalid={!!codeError}
            />
            {codeError && (
              <p role="alert" className="text-xs text-destructive">
                {codeError}
              </p>
            )}
          </div>
          <ProblemAlert problem={problem} />
          <DialogFooter>
            <Button type="submit" disabled={join.isPending} data-testid="join-submit">
              {join.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Присоединиться
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
