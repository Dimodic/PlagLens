import { Link } from 'react-router-dom';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useTranslation } from '@/i18n';
import { Button } from '@/components/ui/button';

export function NotFoundPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('not_found.title'));
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5 py-10">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center text-center space-y-4">
          <h1 className="text-4xl font-semibold tracking-tight">404</h1>
          <p className="text-sm text-muted-foreground">{t('not_found.body')}</p>
          <Button asChild>
            <Link to="/">{t('not_found.home_cta')}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

export default NotFoundPage;
