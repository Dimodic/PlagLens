import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { Problem } from '@/api/types';

interface ProblemAlertProps {
  problem: Problem | null;
  title?: string;
}

export function ProblemAlert({ problem, title }: ProblemAlertProps) {
  if (!problem) return null;
  // Hide the alert entirely if we have nothing meaningful to display.
  // Otherwise the icon-only Alert renders an empty red "!" circle (e.g. on
  // a fresh 403 from an empty list endpoint).
  const resolvedTitle = title ?? problem.title;
  const hasDetail = !!problem.detail;
  const hasErrors = !!problem.errors && problem.errors.length > 0;
  if (!resolvedTitle && !hasDetail && !hasErrors) return null;
  return (
    <Alert variant="destructive" data-testid="problem-alert">
      <AlertCircle className="h-4 w-4" />
      {resolvedTitle && <AlertTitle>{resolvedTitle}</AlertTitle>}
      <AlertDescription>
        {hasDetail && <p className="text-sm">{problem.detail}</p>}
        {hasErrors && (
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {problem.errors!.map((e, i) => (
              <li key={`${e.field}-${i}`}>
                <span className="font-medium">{e.field}:</span> {e.message}
              </li>
            ))}
          </ul>
        )}
        {problem.request_id && (
          <p className="mt-2 text-xs text-muted-foreground">
            request_id: {problem.request_id}
          </p>
        )}
      </AlertDescription>
    </Alert>
  );
}
