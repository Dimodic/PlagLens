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
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/common/EmptyState';

interface SubmissionsTimelineProps {
  data: TimelinePoint[] | undefined;
}

export function SubmissionsTimeline({ data }: SubmissionsTimelineProps) {
  if (!data || data.length === 0) {
    return (
      <EmptyState title="Нет данных" message="Пока нет активности по неделям." />
    );
  }
  return (
    <Card data-testid="submissions-timeline">
      <CardContent className="p-4">
        <div className="flex flex-col gap-2">
          <span className="font-medium">Активность по неделям</span>
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
                  name="Отправки"
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="graded"
                  name="Оценено"
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
