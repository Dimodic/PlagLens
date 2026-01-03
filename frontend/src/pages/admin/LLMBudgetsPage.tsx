/**
 * /admin/ai/budgets — tenant + per-course budgets.
 */
import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { CourseSelect } from '@/components/forms/CourseSelect';
import { Page } from '@/components/layout/Page';
import { CostFormatter } from '@/components/ai/CostFormatter';
import { UsageMeter } from '@/components/ai/UsageMeter';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useNotifications } from '@/hooks/useNotifications';
import { useAuth } from '@/auth/useAuth';
import {
  useCourseBudget,
  useCourseUsage,
  useTenantBudget,
  useTenantUsage,
  useUpdateCourseBudget,
  useUpdateTenantBudget,
} from '@/hooks/api/useAi';
import type { Problem } from '@/api/types';

interface BudgetEditorProps {
  scope: 'tenant' | 'course';
  scopeId: string;
}

function BudgetEditor({ scope, scopeId }: BudgetEditorProps) {
  const notify = useNotifications();
  const tenantBudget = useTenantBudget(scope === 'tenant' ? scopeId : undefined);
  const courseBudget = useCourseBudget(scope === 'course' ? scopeId : undefined);
  const tenantUsage = useTenantUsage(scope === 'tenant' ? scopeId : undefined);
  const courseUsage = useCourseUsage(scope === 'course' ? scopeId : undefined);
  const updateTenant = useUpdateTenantBudget(scope === 'tenant' ? scopeId : '');
  const updateCourse = useUpdateCourseBudget(scope === 'course' ? scopeId : '');

  const budget = scope === 'tenant' ? tenantBudget.data : courseBudget.data;
  const usage = scope === 'tenant' ? tenantUsage.data : courseUsage.data;
  const isLoading = scope === 'tenant' ? tenantBudget.isLoading : courseBudget.isLoading;
  const error = (scope === 'tenant' ? tenantBudget.error : courseBudget.error) as Problem | null;

  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('month');
  const [maxTokens, setMaxTokens] = useState<number | null>(null);
  const [maxCost, setMaxCost] = useState<number | null>(null);
  const [softWarn, setSoftWarn] = useState<number>(0.8);

  useEffect(() => {
    if (budget) {
      setPeriod(budget.period);
      setMaxTokens(budget.max_tokens);
      setMaxCost(budget.max_cost);
      setSoftWarn(budget.soft_warn_at);
    }
  }, [budget]);

  const handleSave = async () => {
    const body = {
      period,
      max_tokens: maxTokens,
      max_cost: maxCost,
      soft_warn_at: softWarn,
    };
    try {
      if (scope === 'tenant') await updateTenant.mutateAsync(body);
      else await updateCourse.mutateAsync(body);
      notify.success('Бюджет обновлён');
    } catch (e) {
      const p = e as Problem;
      notify.error(p?.detail ?? p?.title ?? 'Не удалось сохранить');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) return <ProblemAlert problem={error} />;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-6 space-y-3">
          <h4 className="text-base font-medium">Текущее потребление</h4>
          {usage?.current ? (
            <div className="flex flex-wrap items-start gap-8">
              <UsageMeter
                label="Tokens"
                used={usage.current.total_tokens}
                max={budget?.max_tokens ?? null}
                softWarnAt={budget?.soft_warn_at}
              />
              <UsageMeter
                label="Cost"
                unit="cost"
                used={usage.current.total_cost}
                max={budget?.max_cost ?? null}
                softWarnAt={budget?.soft_warn_at}
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Нет данных за текущий период.</p>
          )}
          {usage?.current && (
            <p className="text-xs text-muted-foreground">
              {usage.current.analyses_count} анализов • cache hits: {usage.current.cache_hits}
              {' • '}
              период: {dayjs(usage.current.period_start).format('DD.MM.YYYY')}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 space-y-3">
          <h4 className="text-base font-medium">Лимиты</h4>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="budget-period">Период</Label>
              <Select
                value={period}
                onValueChange={(v) => v && setPeriod(v as typeof period)}
              >
                <SelectTrigger id="budget-period">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">День</SelectItem>
                  <SelectItem value="week">Неделя</SelectItem>
                  <SelectItem value="month">Месяц</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="budget-max-tokens">max_tokens</Label>
              <Input
                id="budget-max-tokens"
                type="number"
                min={0}
                value={maxTokens ?? ''}
                onChange={(e) =>
                  setMaxTokens(e.currentTarget.value === '' ? null : Number(e.currentTarget.value))
                }
                placeholder="без лимита"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="budget-max-cost">max_cost (USD)</Label>
              <Input
                id="budget-max-cost"
                type="number"
                min={0}
                step="0.01"
                value={maxCost ?? ''}
                onChange={(e) =>
                  setMaxCost(e.currentTarget.value === '' ? null : Number(e.currentTarget.value))
                }
                placeholder="без лимита"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="budget-soft-warn">soft_warn_at</Label>
              <Input
                id="budget-soft-warn"
                type="number"
                min={0}
                max={1}
                step="0.05"
                value={softWarn}
                onChange={(e) => setSoftWarn(Number(e.currentTarget.value) || 0.8)}
              />
            </div>
          </div>
          <div className="flex items-center justify-end">
            <Button
              onClick={handleSave}
              disabled={updateTenant.isPending || updateCourse.isPending}
            >
              {(updateTenant.isPending || updateCourse.isPending) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Сохранить
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <h4 className="mb-3 text-base font-medium">История</h4>
          {!usage?.history?.length ? (
            <p className="text-sm text-muted-foreground">История пока пуста.</p>
          ) : (
            <div className="space-y-1">
              {usage.history.map((h) => (
                <div key={h.period_start} className="flex items-center justify-between gap-3">
                  <span className="text-sm">{dayjs(h.period_start).format('DD.MM.YYYY')}</span>
                  <span className="text-sm text-muted-foreground">
                    {h.total_tokens} tokens • <CostFormatter value={h.total_cost} /> •{' '}
                    {h.analyses_count} анализов
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function LLMBudgetsPage() {
  useDocumentTitle('LLM budgets');
  const { user } = useAuth();
  const tenantId = user?.tenant.id;

  const [scope, setScope] = useState<'tenant' | 'course'>('tenant');
  const [courseId, setCourseId] = useState<string | null>(null);

  return (
    <Page width="regular">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">LLM budgets</h1>
        <div className="flex items-center gap-2">
          <Select value={scope} onValueChange={(v) => v && setScope(v as typeof scope)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tenant">Tenant</SelectItem>
              <SelectItem value="course">Course</SelectItem>
            </SelectContent>
          </Select>
          {scope === 'course' && (
            <div style={{ width: 240 }}>
              <CourseSelect
                value={courseId}
                onChange={setCourseId}
                placeholder="Курс"
              />
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {scope === 'tenant' && tenantId && (
          <BudgetEditor scope="tenant" scopeId={tenantId} />
        )}
        {scope === 'course' && courseId && (
          <BudgetEditor scope="course" scopeId={courseId} />
        )}
        {scope === 'course' && !courseId && (
          <p className="text-sm text-muted-foreground">Выберите курс</p>
        )}
      </div>
    </Page>
  );
}

export default LLMBudgetsPage;
