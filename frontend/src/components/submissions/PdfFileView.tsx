/**
 * PdfFileView — inline preview for a submission file that is a PDF
 * (math / scanned submissions). The CodeViewer dumps the /content endpoint
 * as text, which turns a PDF into binary garbage; here we fetch the same
 * endpoint as a Blob (binary-safe), show it in an <iframe> via an object
 * URL, and always offer a download as a fallback (e.g. if a strict CSP
 * blocks the inline frame).
 */
import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Loader2 } from 'lucide-react';
import { submissionsApi } from '@/api/endpoints/submissions';
import type { SubmissionFile } from '@/api/endpoints/submissions';
import { Button } from '@/components/ui/button';
import { formatBytes } from '@/utils/formatters';
import { useTranslation } from '@/i18n';

/** A submission file is a PDF when the server says so, or the name ends .pdf
 *  (PDF tasks created via the simple-ДЗ modal also carry language_hint='pdf',
 *  but the per-file mime_type is the authoritative signal here). */
export function isPdfFile(file: SubmissionFile | null | undefined): boolean {
  if (!file) return false;
  return (
    file.mime_type === 'application/pdf' ||
    file.path.toLowerCase().endsWith('.pdf')
  );
}

interface Props {
  submissionId: string;
  file: SubmissionFile;
}

export function PdfFileView({ submissionId, file }: Props) {
  const { t } = useTranslation();
  const { data: blob, isPending, isError } = useQuery({
    queryKey: ['submissions', submissionId, 'files', file.id, 'blob'],
    queryFn: ({ signal }) =>
      submissionsApi.getFileBlob(submissionId, file.id, signal),
    staleTime: 5 * 60_000,
  });

  // Axios labels the Blob with the /content response's Content-Type, which is
  // text/plain (that endpoint was built for code). A text-typed blob: URL
  // renders as raw text in the <iframe> — re-wrap the bytes as
  // application/pdf so the browser's built-in PDF viewer kicks in.
  const url = useMemo(() => {
    if (!blob) return null;
    const pdf =
      blob.type === 'application/pdf'
        ? blob
        : new Blob([blob], { type: 'application/pdf' });
    return URL.createObjectURL(pdf);
  }, [blob]);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="truncate font-mono text-xs text-muted-foreground">
          {file.path} · {formatBytes(file.size_bytes)} · PDF
        </span>
        {url && (
          <Button asChild variant="outline" size="sm" className="shrink-0">
            <a href={url} download={file.path}>
              <Download className="mr-1.5 h-4 w-4" />
              {t('submission_detail.download_pdf')}
            </a>
          </Button>
        )}
      </div>

      {isPending ? (
        <div
          className="flex h-[80vh] w-full items-center justify-center rounded-md border bg-muted/20"
          aria-label={t('submission_detail.code_loading')}
        >
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : isError || !url ? (
        <div className="flex h-40 w-full items-center justify-center rounded-md border bg-muted/20 text-sm text-muted-foreground">
          {t('submission_detail.pdf_error')}
        </div>
      ) : (
        <iframe
          src={url}
          title={file.path}
          className="h-[80vh] w-full rounded-md border bg-white"
        />
      )}
    </div>
  );
}

export default PdfFileView;
