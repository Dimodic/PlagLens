import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { errorReporter } from '@/lib/errorReporter';
import { t } from '@/i18n';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  message?: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    errorReporter.report('react', error.message, {
      stack: error.stack,
      extra: { componentStack: errorInfo.componentStack },
    });
  }

  reset = (): void => {
    this.setState({ hasError: false, message: undefined });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div
          role="alert"
          className="mx-auto my-20 max-w-xl rounded-xl border bg-card p-8 text-card-foreground shadow-sm"
        >
          <h2 className="mt-0 text-xl font-semibold">{t('error_boundary.title')}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {t('error_boundary.description')}
          </p>
          {this.state.message && (
            <pre className="mt-4 max-h-48 overflow-auto rounded-md bg-muted p-3 text-xs text-destructive whitespace-pre-wrap break-words">
              {this.state.message}
            </pre>
          )}
          <div className="mt-6 flex gap-2">
            <Button onClick={() => window.location.reload()}>{t('error_boundary.reload')}</Button>
            <Button variant="outline" onClick={this.reset}>{t('error_boundary.close')}</Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
