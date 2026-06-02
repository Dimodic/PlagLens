/**
 * LanguagePie — pie chart of languages used in submissions.
 */
import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import type { LanguageBreakdownItem } from '@/api/endpoints/reporting';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/common/EmptyState';
import { useTranslation } from '@/i18n';

interface LanguagePieProps {
  data: LanguageBreakdownItem[] | undefined;
}

export function LanguagePie({ data }: LanguagePieProps) {
  const { t } = useTranslation();
  if (!data || data.length === 0) {
    return (
      <EmptyState
        title={t('language_pie.empty_title')}
        message={t('language_pie.empty_message')}
      />
    );
  }
  return (
    <Card data-testid="language-pie">
      <CardContent className="p-4">
        <div className="flex flex-col gap-2">
          <span className="font-medium">{t('language_pie.heading')}</span>
          <div className="h-72 w-full">
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={data}
                  dataKey="count"
                  nameKey="language"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  label
                >
                  {data.map((_entry, idx) => (
                    <Cell
                      key={`cell-${idx}`}
                      fill={`var(--chart-${(idx % 5) + 1})`}
                    />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
