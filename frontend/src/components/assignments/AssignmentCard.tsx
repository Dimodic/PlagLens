/**
 * Card representing an assignment in lists.
 */
import { Link } from 'react-router-dom';
import type { AssignmentBrief } from '@/api/endpoints/assignments';
import { useTranslation } from '@/i18n';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { DeadlineDisplay } from './DeadlineDisplay';

function statusBadge(status: string, t: (key: string) => string) {
  // Archive-only lifecycle: draft + published collapse into a single
  // "Активен" pill. Only "archived" is visually distinct.
  if (status === 'archived')
    return (
      <Badge variant="secondary" className="font-normal">
        {t('assignment_card.status_archived')}
      </Badge>
    );
  return (
    <Badge className="font-normal bg-accent text-accent-foreground hover:bg-accent">
      {t('assignment_card.status_active')}
    </Badge>
  );
}

interface AssignmentCardProps {
  assignment: AssignmentBrief;
}

export function AssignmentCard({ assignment }: AssignmentCardProps) {
  const { t } = useTranslation();
  return (
    <Link
      to={`/assignments/${assignment.id}`}
      data-testid="assignment-card"
      className="block"
    >
      <Card className="transition-colors hover:bg-muted/30">
        <CardContent className="p-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <p className="font-semibold truncate text-foreground">{assignment.title}</p>
              {statusBadge(assignment.status, t)}
            </div>
            <div className="flex items-center gap-3">
              {assignment.language_hint && (
                <Badge variant="outline" className="font-mono font-normal">
                  {assignment.language_hint === 'pdf'
                    ? 'PDF'
                    : assignment.language_hint}
                </Badge>
              )}
              {typeof assignment.max_score === 'number' && (
                <span className="text-xs text-muted-foreground">
                  {t('assignment_card.max_score', { score: assignment.max_score })}
                </span>
              )}
            </div>
            <DeadlineDisplay
              softAt={assignment.deadline_soft_at ?? null}
              hardAt={assignment.deadline_hard_at ?? null}
            />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
