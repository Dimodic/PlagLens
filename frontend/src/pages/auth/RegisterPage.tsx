/**
 * /register — self-service signup. Centered card on min-h-screen.
 *
 * Backend endpoint POST /v1/auth/register. tenant_slug is required.
 */
import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { authApi } from '@/api/endpoints/auth';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useTranslation } from '@/i18n';
import { emailSchema, passwordSchema } from '@/utils/validators';
import type { Problem } from '@/api/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface FieldErrors {
  email?: string;
  display_name?: string;
  tenant_slug?: string;
  password?: string;
}

export function RegisterPage() {
  const { t, locale } = useTranslation();
  useDocumentTitle(t('auth.register.title'));

  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');
  const [invitationToken, setInvitationToken] = useState('');

  const [errors, setErrors] = useState<FieldErrors>({});
  const [problem, setProblem] = useState<Problem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const validate = (): boolean => {
    const next: FieldErrors = {};
    const e = emailSchema.safeParse(email);
    if (!e.success) next.email = 'Некорректный email';
    if (displayName.trim().length < 2) next.display_name = 'Минимум 2 символа';
    if (tenantSlug.trim().length < 2) next.tenant_slug = 'укажите организацию';
    const p = passwordSchema.safeParse(password);
    if (!p.success) next.password = p.error.issues[0]?.message ?? 'Слабый пароль';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e?: FormEvent) => {
    e?.preventDefault();
    setProblem(null);
    if (!validate()) return;
    setSubmitting(true);
    try {
      await authApi.register({
        email,
        password,
        display_name: displayName,
        tenant_slug: tenantSlug,
        locale,
        invitation_token: invitationToken || undefined,
      });
      setDone(true);
    } catch (raw) {
      setProblem(raw as Problem);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="grid h-10 w-10 place-items-center rounded-md bg-primary text-primary-foreground">
            <span className="text-base font-semibold">P</span>
          </div>
          <h1 className="text-xl font-semibold tracking-tight">
            {done ? t('auth.register.success.title') : t('auth.register.heading')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {done ? (
              <>
                {t('auth.register.success.body')}{' '}
                <span className="font-medium text-foreground">{email}</span>.
              </>
            ) : (
              t('auth.register.sub')
            )}
          </p>
        </div>

        <Card>
          <CardContent className="p-6 space-y-4">
            {done ? (
              <div data-testid="register-success" className="space-y-4">
                <Button
                  type="button"
                  className="w-full"
                  onClick={() => navigate('/login')}
                >
                  {t('auth.register.success.cta')}
                </Button>
              </div>
            ) : (
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
                  <Label htmlFor="register-email">
                    {t('auth.register.email_label')}
                  </Label>
                  <Input
                    id="register-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    placeholder="you@hse.ru"
                    data-testid="register-email"
                    aria-invalid={!!errors.email}
                  />
                  {errors.email && (
                    <p role="alert" className="text-xs text-destructive">
                      {errors.email}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="register-display-name">
                    {t('auth.register.display_name_label')}
                  </Label>
                  <Input
                    id="register-display-name"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    data-testid="register-display-name"
                    aria-invalid={!!errors.display_name}
                  />
                  {errors.display_name && (
                    <p role="alert" className="text-xs text-destructive">
                      {errors.display_name}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="register-tenant-slug">
                    {t('auth.register.tenant_label')}
                  </Label>
                  <Input
                    id="register-tenant-slug"
                    type="text"
                    value={tenantSlug}
                    onChange={(e) => setTenantSlug(e.target.value)}
                    placeholder={t('auth.register.tenant_placeholder')}
                    data-testid="register-tenant-slug"
                    aria-invalid={!!errors.tenant_slug}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('auth.register.tenant_hint')}
                  </p>
                  {errors.tenant_slug && (
                    <p role="alert" className="text-xs text-destructive">
                      {errors.tenant_slug}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="register-password">
                    {t('auth.register.password_label')}
                  </Label>
                  <Input
                    id="register-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    data-testid="register-password"
                    aria-invalid={!!errors.password}
                  />
                  {errors.password && (
                    <p role="alert" className="text-xs text-destructive">
                      {errors.password}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="register-invitation-token">
                    {t('auth.register.invitation_label')}
                  </Label>
                  <Input
                    id="register-invitation-token"
                    type="text"
                    value={invitationToken}
                    onChange={(e) => setInvitationToken(e.target.value)}
                    data-testid="register-invitation-token"
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('auth.register.invitation_hint')}
                  </p>
                </div>

                <Button
                  type="submit"
                  disabled={submitting}
                  data-testid="register-submit"
                  className="w-full"
                >
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t('auth.register.submit')}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        {!done && (
          <p className="text-center text-xs text-muted-foreground">
            {t('auth.register.have_account')}{' '}
            <Link to="/login" className="text-primary hover:underline">
              {t('auth.register.login')}
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}

export default RegisterPage;
