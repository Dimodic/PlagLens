/**
 * /integrations/oauth/callback — minimal fullscreen splash after a
 * provider (Yandex.Contest / Stepik / Sheets) redirects back here.
 *
 * Calls /v1/integrations/oauth/finalize, then auto-navigates to the
 * integration's detail page. No interstitial "Подключено · yandex_contest
 * · Перейти сейчас" card — the toast on the destination page is enough,
 * and the visual flicker between the centered-fullscreen card and the
 * regular contained layout was reading as "страница вылетает из контейнера".
 *
 * On error we surface the problem inline with a retry / back-to-list
 * pair of buttons — still fullscreen, still on a single calm splash.
 */
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { integrationsApi } from '@/api/endpoints/integrations';
import type { Problem } from '@/api/types';

export default function IntegrationOAuthCallbackPage() {
  useDocumentTitle('Подключение интеграции');
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const ranRef = useRef(false);
  const [problem, setProblem] = useState<Problem | null>(null);

  const code = params.get('code');
  const stateParam = params.get('state');
  const errorParam = params.get('error');

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    if (errorParam) {
      setProblem({
        title: 'Yandex отказал в авторизации',
        detail: errorParam,
        status: 400,
        code: 'UPSTREAM_DENIED',
      } as Problem);
      return;
    }
    if (!code || !stateParam) {
      setProblem({
        title: 'Параметры code / state отсутствуют',
        detail: 'OAuth-провайдер прислал неполный URL.',
        status: 400,
        code: 'BAD_REQUEST',
      } as Problem);
      return;
    }

    integrationsApi
      .oauthFinalize({ code, state: stateParam })
      .then(() => {
        // After OAuth we drop the user on the integrations list — the
        // actual import flow (Yandex.Contest → ДЗ, Stepik → курс) lives
        // on the relevant course page, not on a per-integration view.
        navigate('/integrations', { replace: true });
      })
      .catch((raw) => {
        setProblem(raw as Problem);
      });
  }, [code, stateParam, errorParam, navigate]);

  return (
    <div
      data-testid="integration-oauth-callback"
      className="flex min-h-screen items-center justify-center bg-background px-4 py-10"
    >
      {!problem ? (
        <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Завершаем OAuth-обмен с провайдером…</span>
        </div>
      ) : (
        <div className="w-full max-w-md space-y-4 text-center">
          <div className="flex items-center justify-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-5 w-5" />
            <span className="font-medium">
              {problem.title ?? 'Ошибка обмена кода на токен'}
            </span>
          </div>
          {problem.detail && (
            <p className="text-sm text-muted-foreground">{problem.detail}</p>
          )}
          <div className="flex justify-center gap-2 pt-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/integrations">Назад к интеграциям</Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
