/**
 * Standalone AI report view for a submission.
 *
 * Shows latest analysis status / report. Built for use as a tab inside
 * SubmissionDetailPage (not in scope of this agent), and as a stand-alone
 * component used by tests.
 */
import {
  Brain,
  Check,
  EyeOff,
  Loader2,
  RefreshCw,
  Send,
  Sparkles,
} from 'lucide-react';
import dayjs from 'dayjs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { EmptyState } from '@/components/common/EmptyState';
import { AnalysisStatusBadge } from './AnalysisStatusBadge';
import { CostFormatter } from './CostFormatter';
import { RiskSignalBadge } from './RiskSignalBadge';
import { useNotifications } from '@/hooks/useNotifications';
import { useTranslation } from '@/i18n';
import {
  useAnalyses,
  useLatestAnalysis,
  useRegenerate,
  useShareWithStudent,
  useStartAnalysis,
  useUnshare,
} from '@/hooks/api/useAi';
import type { AIAnalysis } from '@/api/endpoints/ai';
import type { Problem } from '@/api/types';

interface SubmissionAIReportViewProps {
  submissionId: string;
  onCurateClick?: (analysis: AIAnalysis) => void;
}

export function SubmissionAIReportView({
  submissionId,
  onCurateClick,
}: SubmissionAIReportViewProps) {
  const { t } = useTranslation();
  const notify = useNotifications();
  const latestQuery = useLatestAnalysis(submissionId);
  const historyQuery = useAnalyses(submissionId, { limit: 50 });
  const start = useStartAnalysis(submissionId);

  const latest = latestQuery.data;
  const regenerate = useRegenerate(latest?.id ?? '');
  const share = useShareWithStudent(latest?.id ?? '');
  const unshare = useUnshare(latest?.id ?? '');

  const handleRegenerate = async () => {
    if (!latest) return;
    try {
      await regenerate.mutateAsync({});
      notify.success(t('ai_report_view.regenerate_queued'));
    } catch (e) {
      const p = e as Problem;
      notify.error(p?.detail ?? p?.title ?? t('ai_report_view.action_failed'));
    }
  };

  const handleStart = async () => {
    try {
      await start.mutateAsync({});
      notify.success(t('ai_report_view.analysis_started'));
    } catch (e) {
      const p = e as Problem;
      notify.error(p?.detail ?? p?.title ?? t('ai_report_view.action_failed'));
    }
  };

  if (latestQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (latestQuery.error) {
    const p = latestQuery.error as unknown as Problem;
    if (p?.status !== 404) {
      return <ProblemAlert problem={p} />;
    }
  }

  if (!latest) {
    return (
      <div className="flex flex-col gap-4">
        <EmptyState
          title={t('ai_report_view.empty_title')}
          message={t('ai_report_view.empty_message')}
          icon={<Brain className="h-7 w-7" />}
          action={
            <div className="flex items-center gap-2">
              <Button onClick={handleStart} disabled={start.isPending}>
                {start.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-4 w-4" />
                )}
                {t('ai_report_view.start_analysis')}
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  const report = latest.report;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-lg font-medium">{t('ai_report_view.heading')}</h3>
                  <AnalysisStatusBadge status={latest.status} />
                  {latest.cache_hit && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge
                          variant="outline"
                          className="bg-sev-low-bg text-sev-low border-transparent font-normal"
                          data-testid="ai-cache-hit-badge"
                        >
                          <Check className="h-3 w-3" />
                          cache hit
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        {t('ai_report_view.cache_hit_tooltip')}
                      </TooltipContent>
                    </Tooltip>
                  )}
                  {latest.shared_with_student && (
                    <Badge
                      variant="outline"
                      className="bg-accent text-accent-foreground border-transparent font-normal"
                      data-testid="ai-shared-badge"
                    >
                      {t('ai_report_view.visible_to_student')}
                    </Badge>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mt-1">
                  <span>
                    Provider: <span className="font-medium text-foreground">{latest.provider}</span>
                  </span>
                  <span>
                    Model: <span className="font-medium text-foreground">{latest.model}</span>
                  </span>
                  <span>
                    Prompt: <span className="font-medium text-foreground">{latest.prompt_version}</span>
                  </span>
                  <span>
                    Tokens: <span className="font-medium text-foreground">{latest.total_tokens}</span>
                  </span>
                  <span>
                    Cost:{' '}
                    <CostFormatter
                      value={latest.cost_estimate}
                      className="font-medium text-foreground"
                    />
                  </span>
                  <span>{t('ai_report_view.created_at', { date: dayjs(latest.created_at).format('DD.MM HH:mm') })}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap shrink-0">
                <Button
                  variant="secondary"
                  onClick={handleRegenerate}
                  disabled={regenerate.isPending}
                  data-testid="ai-regenerate-button"
                >
                  {regenerate.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  {t('ai_report_view.regenerate')}
                </Button>
                <Button
                  onClick={() => onCurateClick?.(latest)}
                  disabled={!report}
                  data-testid="ai-curate-open"
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  {t('ai_report_view.create_comment')}
                </Button>
                {latest.shared_with_student ? (
                  <Button
                    variant="ghost"
                    className="text-sev-mid hover:text-sev-mid"
                    onClick={() => unshare.mutate()}
                    disabled={unshare.isPending}
                    data-testid="ai-unshare-button"
                  >
                    {unshare.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <EyeOff className="mr-2 h-4 w-4" />
                    )}
                    {t('ai_report_view.unshare')}
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    onClick={() => share.mutate()}
                    disabled={share.isPending}
                    data-testid="ai-share-button"
                  >
                    {share.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="mr-2 h-4 w-4" />
                    )}
                    {t('ai_report_view.share')}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {latest.failure_reason && (
        <ProblemAlert
          problem={{
            title: t('ai_report_view.analysis_failed'),
            status: 500,
            code: 'AI_FAILED',
            detail: latest.failure_reason,
          }}
        />
      )}

      {report && (
        <>
          <Card data-testid="ai-analysis-summary-card">
            <CardContent className="p-4">
              <h4 className="text-base font-medium mb-2">{t('ai_report_view.summary_heading')}</h4>
              <p className="whitespace-pre-wrap text-sm" data-testid="ai-analysis-summary">
                {report.summary}
              </p>
            </CardContent>
          </Card>

          <Card data-testid="ai-analysis-risk-signals-card">
            <CardContent className="p-4">
              <h4 className="text-base font-medium mb-2">Risk signals</h4>
              {report.risk_signals.length === 0 ? (
                <p className="text-sm text-muted-foreground" data-testid="ai-analysis-no-risk-signals">
                  {t('ai_report_view.no_risk_signals')}
                </p>
              ) : (
                <div className="flex flex-wrap items-center gap-2" data-testid="ai-analysis-risk-signals">
                  {report.risk_signals.map((s, i) => (
                    <span
                      key={`${s.type}-${i}`}
                      data-testid={`ai-risk-signal-${s.type}-${s.severity}`}
                    >
                      <RiskSignalBadge type={s.type} severity={s.severity} details={s.details} />
                    </span>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card data-testid="ai-analysis-questions-card">
            <CardContent className="p-4">
              <h4 className="text-base font-medium mb-2">{t('ai_report_view.questions_heading')}</h4>
              {report.questions.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('ai_report_view.no_questions')}</p>
              ) : (
                <ol className="list-decimal pl-5 space-y-2 text-sm">
                  {report.questions.map((q, i) => (
                    <li key={i} data-testid={`ai-question-${i}`}>
                      {q}
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>

          <Card data-testid="ai-analysis-recommendations-card">
            <CardContent className="p-4">
              <h4 className="text-base font-medium mb-2">{t('ai_report_view.recommendations_heading')}</h4>
              {report.recommendations.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('ai_report_view.no_recommendations')}</p>
              ) : (
                <ul className="list-disc pl-5 space-y-2 text-sm">
                  {report.recommendations.map((r, i) => (
                    <li key={i} data-testid={`ai-recommendation-${i}`}>
                      {r}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {historyQuery.data && historyQuery.data.data.length > 1 && (
        <Card>
          <CardContent className="p-4">
            <h4 className="text-base font-medium mb-2">{t('ai_report_view.history_heading')}</h4>
            <Accordion type="multiple" className="w-full">
              {historyQuery.data.data
                .filter((a) => a.id !== latest.id)
                .map((a) => (
                  <AccordionItem key={a.id} value={a.id}>
                    <AccordionTrigger>
                      <div className="flex items-center gap-3 flex-wrap">
                        <AnalysisStatusBadge status={a.status} />
                        <span className="text-sm">
                          {a.prompt_version} • {a.model} • {dayjs(a.created_at).format('DD.MM HH:mm')}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {a.total_tokens} tokens, <CostFormatter value={a.cost_estimate} />
                        </span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      {a.report ? (
                        <p className="text-sm whitespace-pre-wrap">{a.report.summary}</p>
                      ) : (
                        <p className="text-sm text-muted-foreground">{t('ai_report_view.no_report')}</p>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                ))}
            </Accordion>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default SubmissionAIReportView;
