/**
 * Compact card representing a course in lists.
 */
import { Calendar, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { CourseBrief } from '@/api/endpoints/courses';
import { formatDate } from '@/utils/formatters';
import { useTranslation, type TParams } from '@/i18n';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

function statusBadge(status: string, t: (key: string, params?: TParams) => string) {
  // Archive-only lifecycle: draft + active collapse into a single
  // "Активен" pill. Only "archived" is visually distinct.
  if (status === 'archived')
    return (
      <Badge variant="secondary" className="font-normal" data-testid="course-card-status">
        {t('course_card.status_archived')}
      </Badge>
    );
  return (
    <Badge
      className="font-normal bg-accent text-accent-foreground hover:bg-accent"
      data-testid="course-card-status"
    >
      {t('course_card.status_active')}
    </Badge>
  );
}

interface CourseCardProps {
  course: CourseBrief;
}

export function CourseCard({ course }: CourseCardProps) {
  const { t } = useTranslation();
  return (
    <Link
      to={`/courses/${course.slug}`}
      data-testid={`courses-list-row-${course.slug}`}
      data-course-id={course.id}
      className="block"
    >
      <Card className="transition-colors hover:bg-muted/30">
        <CardContent className="p-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <p
                className="font-semibold truncate text-foreground"
                data-testid="course-card-name"
              >
                {course.name}
              </p>
              {statusBadge(course.status, t)}
            </div>
            {course.description && (
              <p className="text-sm line-clamp-2 text-foreground">{course.description}</p>
            )}
            <div className="mt-1 flex items-center gap-5 text-xs text-muted-foreground">
              {course.start_date && (
                <div className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>
                    {formatDate(course.start_date)} – {formatDate(course.end_date ?? null)}
                  </span>
                </div>
              )}
              {typeof course.members_count === 'number' && (
                <div className="flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" />
                  <span>{course.members_count}</span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
