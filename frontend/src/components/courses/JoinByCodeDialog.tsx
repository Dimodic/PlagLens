/**
 * JoinByCodeDialog — student enters an invitation code to join a course,
 * presented as a modal (used from the dashboard "join course" action).
 * Shares the join flow with JoinByCodePage via the useJoinByCode hook.
 */
import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/useAuth';
import { Loader2 } from 'lucide-react';
import { useJoinByCode } from '@/hooks/api/useCourses';
import { coursesApi } from '@/api/endpoints/courses';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { useNotifications } from '@/hooks/useNotifications';
import { parseProblem } from '@/api/problem';
import { useTranslation } from '@/i18n';
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
  const { t } = useTranslation();
  const navigate = useNavigate();
  const notify = useNotifications();
  const join = useJoinByCode();
  const { refresh } = useAuth();
  const queryClient = useQueryClient();
  const [problem, setProblem] = useState<Problem | null>(null);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setProblem(null);
    if (code.trim().length < 4) {
      setCodeError(t('join_by_code.code_too_short'));
      return;
    }
    setCodeError(null);
    try {
      const res = await join.mutateAsync(code.trim());
      notify.success(t('join_by_code.joined_success'));
      onOpenChange(false);
      setCode('');
      // A code may bump the global role / move tenant (e.g. a teacher
      // invite), so re-mint the access token from the fresh DB principal
      // and drop role-gated caches before deciding where to land.
      await refresh();
      await queryClient.invalidateQueries();
      if (res.role_applied) {
        // Role changed: rebuild the whole shell against the new principal
        // (sidebar + default landing). HomeRedirect sends teacher → /courses.
        window.location.assign('/');
        return;
      }
      if (res.course_id) {
        try {
          const course = await coursesApi.get(String(res.course_id));
          navigate(`/courses/${course.slug}`);
          return;
        } catch {
          /* fall through to home */
        }
      }
      // No specific course — let HomeRedirect route by the (refreshed) role.
      navigate('/');
    } catch (err) {
      setProblem(parseProblem(err));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('join_by_code.title')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="join-code">{t('join_by_code.code_label')}</Label>
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
              {t('join_by_code.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
