/**
 * SubmissionPreviewDialog — modal that shows one student's source code.
 *
 * Triggered by clicking a node on the plagiarism cluster map. The dialog
 * loads the submission + its first file's content and renders the code
 * via the same CodeViewer the submission-detail page uses.
 *
 * Kept deliberately read-only — no grading / no edit actions. The point
 * is to let a teacher eyeball the code without leaving the map. Tools
 * for actually working with the submission live on the dedicated
 * submission page (link in the footer).
 */
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { CodeViewer } from '@/components/submissions/CodeViewer';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { displayAuthor } from '@/api/endpoints/submissions';
import {
  useSubmission,
  useSubmissionFiles,
  useSubmissionFileContent,
} from '@/hooks/api/useSubmissions';
import { useTranslation } from '@/i18n';

interface SubmissionPreviewDialogProps {
  submissionId: string | null;
  onOpenChange: (open: boolean) => void;
}

export function SubmissionPreviewDialog({
  submissionId,
  onOpenChange,
}: SubmissionPreviewDialogProps) {
  const { t } = useTranslation();
  const open = !!submissionId;
  const sid = submissionId ?? undefined;

  const submissionQ = useSubmission(sid);
  const filesQ = useSubmissionFiles(sid);
  // Single-file submissions are the norm for YC imports; pick the
  // first file. The modal isn't trying to be a file browser — open
  // the full submission page for that.
  const firstFile = filesQ.data?.data?.[0];
  const contentQ = useSubmissionFileContent(sid, firstFile?.id);

  const submission = submissionQ.data;
  const authorName = submission ? displayAuthor(submission) : '';

  const isLoading =
    submissionQ.isLoading || filesQ.isLoading || contentQ.isLoading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[min(92vw,1100px)] max-h-[90vh] overflow-hidden p-0 flex flex-col gap-0"
        data-testid="submission-preview-dialog"
      >
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-border/60">
          <DialogTitle className="text-base font-semibold">
            {authorName || t('submission_preview.fallback_title')}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-auto px-6 py-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t('submission_preview.loading')}
            </div>
          ) : !firstFile ? (
            <p className="text-sm text-muted-foreground">
              {t('submission_preview.no_files')}
            </p>
          ) : (
            <CodeViewer
              fileName={firstFile.path}
              language={submission?.language ?? undefined}
              code={contentQ.data ?? ''}
              compact
            />
          )}
        </div>
        {sid && (
          <div className="border-t border-border/60 px-6 py-3 text-xs">
            <Link
              to={`/submissions/${sid}`}
              className="text-primary hover:underline"
              onClick={() => onOpenChange(false)}
            >
              {t('submission_preview.open_full')}
            </Link>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default SubmissionPreviewDialog;
