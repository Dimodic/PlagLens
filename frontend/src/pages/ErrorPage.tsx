/**
 * Top-level error boundary fallback.
 */
import { useEffect } from 'react';
import { useRouteError, isRouteErrorResponse, Link } from 'react-router-dom';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useTranslation } from '@/i18n';
import { Button } from '@/components/ui/button';
import { isChunkLoadError, reloadForStaleChunk } from '@/lib/staleChunkReload';

export function ErrorPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('error_page.document_title'));
  const err = useRouteError();

  // Last-resort net for a stale-chunk error that slipped past the lazy()
  // wrapper (e.g. its cooldown was active): try to reload to the fresh
  // build instead of showing a scary 500. A manual button covers the case
  // where the auto-reload is on cooldown (genuinely broken chunk).
  const chunkError = isChunkLoadError(err);
  useEffect(() => {
    if (chunkError) reloadForStaleChunk();
  }, [chunkError]);
  if (chunkError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-5 py-10">
        <div className="flex w-full max-w-lg flex-col items-center text-center space-y-4">
          <p className="text-base text-muted-foreground">{t('error_page.updating')}</p>
          <Button onClick={() => window.location.reload()}>{t('error_page.refresh')}</Button>
        </div>
      </div>
    );
  }

  const status = isRouteErrorResponse(err) ? err.status : 500;
  const message =
    isRouteErrorResponse(err)
      ? err.statusText || err.data || t('error_page.generic')
      : err instanceof Error
        ? err.message
        : t('error_page.unexpected');

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5 py-10">
      <div className="w-full max-w-lg">
        <div className="flex flex-col items-center text-center space-y-4">
          <h1 className="text-4xl font-semibold tracking-tight">{status}</h1>
          <p className="text-base text-muted-foreground">
            {message}
          </p>
          <Button asChild>
            <Link to="/">{t('error_page.home_cta')}</Link>
          </Button>
          <a
            href="https://docs.plaglens.ru"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {t('error_page.docs')}
          </a>
        </div>
      </div>
    </div>
  );
}

export default ErrorPage;
