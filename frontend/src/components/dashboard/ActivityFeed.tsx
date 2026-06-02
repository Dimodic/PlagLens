/**
 * ActivityFeed — recent events list (proxy from Audit via Reporting).
 */
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import type { ActivityEvent } from '@/api/endpoints/reporting';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/common/EmptyState';
import { useTranslation } from '@/i18n';

interface ActivityFeedProps {
  events: ActivityEvent[] | undefined;
}

export function ActivityFeed({ events }: ActivityFeedProps) {
  const { t } = useTranslation();
  if (!events || events.length === 0) {
    return <EmptyState title={t('activity_feed.empty')} />;
  }
  return (
    <Card data-testid="activity-feed">
      <CardContent className="p-4">
        <div className="flex flex-col gap-3">
          <span className="font-medium">{t('activity_feed.title')}</span>
          <ul className="flex flex-col gap-2">
            {events.map((e) => (
              <li
                key={e.id}
                data-testid={`activity-${e.id}`}
                className="flex flex-col gap-0.5"
              >
                <p className="text-sm">
                  {e.link ? (
                    <Link to={e.link} className="text-primary hover:underline">
                      {e.summary}
                    </Link>
                  ) : (
                    e.summary
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {e.actor?.display_name && `${e.actor.display_name} · `}
                  {dayjs(e.occurred_at).format('DD.MM.YYYY HH:mm')}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
