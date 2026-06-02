/**
 * AIUsageDonut — donut chart of AI cache hit rate (hits vs misses).
 */
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import type { AIUsageStats } from '@/api/endpoints/reporting';
import { useTranslation } from '@/i18n';
import { Card, CardContent } from '@/components/ui/card';

interface AIUsageDonutProps {
  data: AIUsageStats | undefined;
}

export function AIUsageDonut({ data }: AIUsageDonutProps) {
  const { t } = useTranslation();
  if (!data) return null;
  const hit = Math.round((data.cache_hit_rate ?? 0) * data.runs_count);
  const miss = Math.max(0, data.runs_count - hit);
  const series = [
    { name: t('aiusage_donut.series_cache'), value: hit },
    { name: t('aiusage_donut.series_no_cache'), value: miss },
  ];
  return (
    <Card data-testid="ai-usage-donut">
      <CardContent className="p-4">
        <div className="flex flex-col gap-2">
          <span className="font-medium">AI usage</span>
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{t('aiusage_donut.runs', { count: data.runs_count })}</span>
            <span>
              Cache hit: {((data.cache_hit_rate ?? 0) * 100).toFixed(1)}%
            </span>
          </div>
          <div className="h-56 w-full">
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={series}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={50}
                  outerRadius={80}
                >
                  <Cell fill="var(--chart-2)" />
                  <Cell fill="var(--chart-3)" />
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center justify-center gap-4 text-sm">
            <span>
              {t('aiusage_donut.tokens', {
                value: data.total_tokens.toLocaleString('ru-RU'),
              })}
            </span>
            <span>
              {t('aiusage_donut.cost', {
                value: data.total_cost_usd.toFixed(2),
              })}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
