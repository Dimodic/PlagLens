/**
 * /plagiarism-runs/:runId/pairs/:pairId — standalone side-by-side diff.
 *
 * Thin wrapper around <PairDiffInline> — the exact same component the
 * submission-page plagiarism modal uses, so the two views are
 * guaranteed identical. The page used to be a bespoke layout with its
 * own Pane component whose highlight (``bg-amber-50``) rendered as a
 * near-white band — light code text on it was effectively invisible on
 * the dark theme. Reusing the shared component fixes that and keeps the
 * two diff surfaces from drifting apart.
 */
import { useParams } from 'react-router-dom';
import { Page } from '@/components/layout/Page';
import { PairDiffInline } from '@/components/plagiarism/PairDiffInline';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

export function PlagiarismPairDiffPage() {
  const { runId = '', pairId = '' } = useParams<{
    runId: string;
    pairId: string;
  }>();
  useDocumentTitle('Сравнение пары');

  return (
    <Page width="wide">
      <PairDiffInline runId={runId} pairId={pairId} />
    </Page>
  );
}

export default PlagiarismPairDiffPage;
