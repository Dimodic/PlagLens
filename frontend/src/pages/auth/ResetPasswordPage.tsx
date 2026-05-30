/**
 * /auth/reset?token=… — single centered card. Sets a new password using
 * the reset token from the email link.
 */
import { FormEvent, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { authApi } from '@/api/endpoints/auth';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useTranslation } from '@/i18n';
import { passwordSchema } from '@/utils/validators';
import type { Problem } from '@/api/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { BrandMark } from '@/components/shell/BrandMark';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface FieldErrors {
  new_password?: string;
  confirm?: string;
}

export function ResetPasswordPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('auth.reset.title'));
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();

  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [problem, setProblem] = useState<Problem | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!token) {
    return (
      <SingleCardShell
        heading={t('auth.reset.token_missing.title')}
        sub={t('auth.reset.token_missing.body')}
      >
        <Button variant="outline" className="w-full" asChild>
          <Link to="/auth/forgot">{t('auth.reset.token_missing.cta')}</Link>
        </Button>
      </SingleCardShell>
    );
  }

  const validate = (): boolean => {
    const next: FieldErrors = {};
    const r = passwordSchema.safeParse(newPassword);
    if (!r.success) next.new_password = r.error.issues[0]?.message ?? 'Слабый пароль';
    if (confirm !== newPassword) next.confirm = 'Пароли не совпадают';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e?: FormEvent) => {
    e?.preventDefault();
    setProblem(null);
    if (!validate()) return;
    setSubmitting(true);
    try {
      await authApi.passwordReset(token, newPassword);
      navigate('/login?reset=success', { replace: true });
    } catch (raw) {
      setProblem(raw as Problem);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SingleCardShell
      heading={t('auth.reset.heading')}
      sub={t('auth.reset.sub')}
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {problem && (
          <Alert variant="destructive" data-testid="problem-alert">
            <AlertTitle>{problem.title}</AlertTitle>
            {problem.detail && (
              <AlertDescription>{problem.detail}</AlertDescription>
            )}
          </Alert>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="reset-new-password">
            {t('auth.reset.new_password_label')}
          </Label>
          <Input
            id="reset-new-password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            autoFocus
            data-testid="reset-new-password"
            aria-invalid={!!errors.new_password}
          />
          {errors.new_password && (
            <p role="alert" className="text-xs text-destructive">
              {errors.new_password}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="reset-confirm-password">
            {t('auth.reset.confirm_password_label')}
          </Label>
          <Input
            id="reset-confirm-password"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            data-testid="reset-confirm-password"
            aria-invalid={!!errors.confirm}
          />
          {errors.confirm && (
            <p role="alert" className="text-xs text-destructive">
              {errors.confirm}
            </p>
          )}
        </div>

        <Button
          type="submit"
          disabled={submitting}
          data-testid="reset-submit"
          className="w-full"
        >
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t('auth.reset.submit')}
        </Button>
      </form>
    </SingleCardShell>
  );
}

interface ShellProps {
  heading: string;
  sub: string;
  children: React.ReactNode;
}

function SingleCardShell({ heading, sub, children }: ShellProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <BrandMark tile className="h-10 w-10 rounded-md" title="PlagLens" />
          <h1 className="text-xl font-semibold tracking-tight">{heading}</h1>
          <p className="text-sm text-muted-foreground">{sub}</p>
        </div>

        <Card>
          <CardContent className="p-6 space-y-4">{children}</CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          <Link to="/login" className="text-primary hover:underline">
            Вернуться ко входу
          </Link>
        </p>
      </div>
    </div>
  );
}

export default ResetPasswordPage;
