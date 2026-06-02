/**
 * SubmissionsTimeline — weekly submissions / graded line chart.
 */
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TimelinePoint } from '@/api/endpoints/reporting';
import { useTranslation } from '@/i18n';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/common/EmptyState';

interface SubmissionsTimelineProps {
  data: TimelinePoint[] | undefined;
}

export function SubmissionsTimeline({ data }: SubmissionsTimelineProps) {
  const { t } = useTranslation();
  if (!data || data.length === 0) {
    return (
      <EmptyState
        title={t('submissions_timeline.empty_title')}
        message={t('submissions_timeline.empty_message')}
      />
    );
  }
  return (
    <Card data-testid="submissions-timeline">
      <CardContent className="p-4">
        <div className="flex flex-col gap-2">
          <span className="font-medium">{t('submissions_timeline.heading')}</span>
          <div className="h-60 w-full">
            <ResponsiveContainer>
              <LineChart data={data}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border)"
                />
                <XAxis dataKey="week" stroke="var(--muted-foreground)" />
                <YAxis allowDecimals={false} stroke="var(--muted-foreground)" />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="submissions"
                  name={t('submissions_timeline.series_submissions')}
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="graded"
                  name={t('submissions_timeline.series_graded')}
                  stroke="var(--chart-2)"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
