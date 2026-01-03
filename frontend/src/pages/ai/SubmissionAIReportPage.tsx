/**
 * /submissions/:id/ai-report — full-page AI report view for a submission.
 *
 * Wraps the existing `SubmissionAIReportView` component with the curate-as-feedback
 * modal. The submission detail page renders this same component as a tab, but
 * linking from the /assignments/:id/ai-analyses table requires a stand-alone route.
 */
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { SubmissionAIReportView } from '@/components/ai/SubmissionAIReportView';
import { CurateAsFeedbackModal } from './CurateAsFeedbackModal';
import type { AIAnalysis } from '@/api/endpoints/ai';

export function SubmissionAIReportPage() {
  const { id = '' } = useParams<{ id: string }>();
  useDocumentTitle('AI-отчёт');
  const [curateAnalysis, setCurateAnalysis] = useState<AIAnalysis | null>(null);

  return (
    <div data-testid="ai-report-page" className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">AI-отчёт</h1>
        {id && (
          <p className="mt-1 text-sm text-muted-foreground">{id}</p>
        )}
      </div>
      <SubmissionAIReportView
        submissionId={id}
        onCurateClick={(a) => setCurateAnalysis(a)}
      />
      <CurateAsFeedbackModal
        opened={curateAnalysis != null}
        analysis={curateAnalysis}
        onClose={() => setCurateAnalysis(null)}
        submissionId={id}
      />
    </div>
  );
}

export default SubmissionAIReportPage;
