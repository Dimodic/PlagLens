/**
 * Top-level error boundary fallback.
 */
import { useRouteError, isRouteErrorResponse, Link } from 'react-router-dom';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { Button } from '@/components/ui/button';

export function ErrorPage() {
  useDocumentTitle('Ошибка');
  const err = useRouteError();
  const status = isRouteErrorResponse(err) ? err.status : 500;
  const message =
    isRouteErrorResponse(err)
      ? err.statusText || err.data || 'Произошла ошибка'
      : err instanceof Error
        ? err.message
        : 'Произошла непредвиденная ошибка';

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5 py-10">
      <div className="w-full max-w-lg">
        <div className="flex flex-col items-center text-center space-y-4">
          <h1 className="text-4xl font-semibold tracking-tight">{status}</h1>
          <p className="text-base text-muted-foreground">
            {message}
          </p>
          <Button asChild>
            <Link to="/">На главную</Link>
          </Button>
          <a
            href="https://docs.plaglens.ru"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Документация
          </a>
        </div>
      </div>
    </div>
  );
}

export default ErrorPage;
