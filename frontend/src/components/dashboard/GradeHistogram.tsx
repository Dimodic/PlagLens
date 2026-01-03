/**
 * GradeHistogram — recharts BarChart for distribution of grades.
 */
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { GradesDistribution } from '@/api/endpoints/reporting';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/common/EmptyState';

interface GradeHistogramProps {
  data: GradesDistribution | undefined;
  loading?: boolean;
}

export function GradeHistogram({ data, loading }: GradeHistogramProps) {
  if (!loading && (!data || data.buckets.length === 0)) {
    return <EmptyState title="Нет оценок" message="Пока нет оценённых посылок." />;
  }
  const buckets = data?.buckets ?? [];
  return (
    <Card data-testid="grade-histogram">
      <CardContent className="p-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="font-medium">Распределение оценок</span>
            {data && (
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span>
                  Среднее: {data.mean !== null ? data.mean.toFixed(2) : '—'}
                </span>
                <span>
                  Медиана:{' '}
                  {data.median !== null ? data.median.toFixed(2) : '—'}
                </span>
              </div>
            )}
          </div>
          <div className="h-60 w-full">
            <ResponsiveContainer>
              <BarChart data={buckets}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border)"
                />
                <XAxis dataKey="bucket" stroke="var(--muted-foreground)" />
                <YAxis allowDecimals={false} stroke="var(--muted-foreground)" />
                <Tooltip />
                <Bar
                  dataKey="count"
                  fill="var(--chart-1)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
