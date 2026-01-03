/**
 * /integrations/oauth/callback — generic landing page after a provider
 * (Yandex.Contest, Stepik, ...) redirects back. Reads `code` and `state` from
 * the URL, calls /v1/integrations/oauth/finalize, and routes the user to the
 * resulting integration's contest-picker page.
 */
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { integrationsApi } from '@/api/endpoints/integrations';
import type { Problem } from '@/api/types';

export default function IntegrationOAuthCallbackPage() {
  useDocumentTitle('Подключение интеграции');
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const ranRef = useRef(false);
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [problem, setProblem] = useState<Problem | null>(null);
  const [configId, setConfigId] = useState<string | null>(null);
  const [kind, setKind] = useState<string | null>(null);

  const code = params.get('code');
  const stateParam = params.get('state');
  const errorParam = params.get('error');

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    if (errorParam) {
      setState('error');
      setProblem({
        title: 'Yandex отказал в авторизации',
        detail: errorParam,
        status: 400,
        code: 'UPSTREAM_DENIED',
      } as Problem);
      return;
    }
    if (!code || !stateParam) {
      setState('error');
      setProblem({
        title: 'Параметры code/state отсутствуют',
        detail: 'Колбэк OAuth прислал неполный URL.',
        status: 400,
        code: 'BAD_REQUEST',
      } as Problem);
      return;
    }
    integrationsApi
      .oauthFinalize({ code, state: stateParam })
      .then((res) => {
        setConfigId(res.config_id);
        setKind(res.kind);
        setState('ok');
        // Auto-redirect after 1s to the integration's home page.
        const dest =
          res.kind === 'yandex_contest'
            ? `/integrations/yandex-contest/${res.config_id}/contests`
            : '/integrations';
        setTimeout(() => navigate(dest, { replace: true }), 1200);
      })
      .catch((raw) => {
        setProblem(raw as Problem);
        setState('error');
      });
  }, [code, stateParam, errorParam, navigate]);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">
        Подключение интеграции
      </h1>

      <Card className="border-border/70">
        <CardContent className="p-8">
          {state === 'loading' && (
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Завершаем OAuth-обмен с провайдером…
            </div>
          )}
          {state === 'ok' && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-sm">
                <CheckCircle2 className="h-5 w-5 text-sev-low" />
                <span className="font-medium">Подключено</span>
                {kind && (
                  <span className="text-muted-foreground">· {kind}</span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                Сейчас откроем список контестов…
              </p>
              {configId && (
                <Button asChild size="sm" variant="outline">
                  <Link to={`/integrations/yandex-contest/${configId}/contests`}>
                    Перейти сейчас
                  </Link>
                </Button>
              )}
            </div>
          )}
          {state === 'error' && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-sm text-sev-high">
                <AlertCircle className="h-5 w-5" />
                <span className="font-medium">
                  {problem?.title ?? 'Ошибка обмена кода на токен'}
                </span>
              </div>
              {problem?.detail && (
                <p className="text-sm text-muted-foreground">{problem.detail}</p>
              )}
              <div className="flex gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link to="/integrations/yandex-contest/setup">
                    Попробовать заново
                  </Link>
                </Button>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/courses">Назад</Link>
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
