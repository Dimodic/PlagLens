/**
 * Placeholder used by routes that other agents will implement.
 * Renders a simple page header + a quiet empty-state inside the AppShell.
 */
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

interface PlaceholderPageProps {
  title: string;
  description?: string;
}

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  useDocumentTitle(title);
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">
          Раздел будет реализован в следующих итерациях.
        </p>
      </div>
      <div className="rounded-lg border border-dashed py-16 px-6 text-center text-sm text-muted-foreground">
        {description ??
          'Эта страница пока служит маркером маршрута. Контент появится позже.'}
      </div>
    </div>
  );
}

export default PlaceholderPage;
