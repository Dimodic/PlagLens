/**
 * Displays feedback items for a submission, with publish/unpublish + delete controls.
 */
import { Eye, EyeOff, Trash2 } from 'lucide-react';
import type { SubmissionFeedback } from '@/api/endpoints/submissions';
import { useTranslation } from '@/i18n';
import { formatDateTime } from '@/utils/formatters';
import { EmptyState } from '@/components/common/EmptyState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface FeedbackListProps {
  items: SubmissionFeedback[];
  canManage?: boolean;
  onTogglePublish?: (item: SubmissionFeedback) => void;
  onDelete?: (item: SubmissionFeedback) => void;
}

export function FeedbackList({
  items,
  canManage,
  onTogglePublish,
  onDelete,
}: FeedbackListProps) {
  const { t } = useTranslation();
  if (items.length === 0) {
    return (
      <EmptyState
        title={t('feedback_list.empty_title')}
        message={t('feedback_list.empty_message')}
      />
    );
  }

  return (
    <div className="space-y-3">
      {items.map((fb) => (
        <Card key={fb.id} data-testid={`feedback-${fb.id}`}>
          <CardContent className="p-4">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-muted-foreground">
                    {formatDateTime(fb.created_at)}
                  </span>
                  {fb.source === 'llm_curated' && (
                    <Badge
                      variant="outline"
                      className="font-normal text-xs bg-accent/40 border-accent"
                    >
                      {t('feedback_list.from_llm')}
                    </Badge>
                  )}
                  <Badge
                    variant={fb.visible_to_student ? 'default' : 'secondary'}
                    className="font-normal text-xs"
                  >
                    {fb.visible_to_student
                      ? t('feedback_list.visible_to_student')
                      : t('feedback_list.hidden')}
                  </Badge>
                </div>
                {canManage && (
                  <div className="flex items-center gap-1">
                    {onTogglePublish && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onTogglePublish(fb)}
                        aria-label={
                          fb.visible_to_student
                            ? t('feedback_list.hide')
                            : t('feedback_list.publish')
                        }
                      >
                        {fb.visible_to_student ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                    {onDelete && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onDelete(fb)}
                        aria-label={t('common.delete')}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                )}
              </div>
              <p className="text-sm whitespace-pre-wrap">{fb.body}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
