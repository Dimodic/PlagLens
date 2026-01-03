import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { errorReporter } from '@/lib/errorReporter';

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
          <h2 className="mt-0 text-xl font-semibold">Что-то пошло не так</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Ошибка отправлена в логи. Можно перезагрузить страницу.
          </p>
          {this.state.message && (
            <pre className="mt-4 max-h-48 overflow-auto rounded-md bg-muted p-3 text-xs text-destructive whitespace-pre-wrap break-words">
              {this.state.message}
            </pre>
          )}
          <div className="mt-6 flex gap-2">
            <Button onClick={() => window.location.reload()}>Перезагрузить</Button>
            <Button variant="outline" onClick={this.reset}>Закрыть</Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
