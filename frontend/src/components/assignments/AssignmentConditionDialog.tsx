/**
 * AssignmentConditionDialog — modal that surfaces the assignment's
 * description without leaving the student's home tree.
 *
 * Why a modal and not the detail page: from /me the student is browsing
 * a course → ДЗ → задание tree. Clicking «info» on a row to see the
 * condition is a sideways glance, not a navigation — popping a Dialog
 * keeps them anchored to their position in the tree.
 *
 * The body renders the same `sanitizeHtml(description)` payload as the
 * assignment detail page, so a heavy Y.Contest condition with tables /
 * sample I/O / TeX still reads correctly. A scrollable max-height keeps
 * an oversized condition inside the modal box.
 */
import { ExternalLink, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAssignment } from '@/hooks/api/useAssignments';
import { sanitizeHtml } from '@/utils/sanitizeHtml';

interface Props {
  assignmentId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AssignmentConditionDialog({
  assignmentId,
  open,
  onOpenChange,
}: Props) {
  const { data: assignment, isLoading } = useAssignment(
    open ? assignmentId ?? undefined : undefined,
  );

  // Y.Contest-style imports stash a contest URL on the binding so the
  // student can hop to the original problem if our rendered condition
  // ever loses fidelity (TeX edge cases). Optional — pure manual
  // assignments don't have it.
  const externalUrl = (() => {
    const bind = (assignment?.external_bindings ?? [])[0] as
      | { url?: string }
      | undefined;
    return bind?.url ?? null;
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle data-testid="condition-dialog-title">
            {assignment?.title || 'Условие'}
          </DialogTitle>
          {externalUrl && (
            <DialogDescription>
              <a
                href={externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                data-testid="condition-dialog-external"
              >
                <ExternalLink className="h-3 w-3" />
                Открыть в источнике
              </a>
            </DialogDescription>
          )}
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : assignment?.description ? (
          <div
            data-testid="condition-dialog-body"
            className="assignment-prose max-h-[60vh] overflow-y-auto pr-2 text-sm leading-relaxed text-foreground/90"
            dangerouslySetInnerHTML={{
              __html: sanitizeHtml(assignment.description),
            }}
          />
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Условие не задано.
          </p>
        )}

        <div className="flex justify-end pt-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            data-testid="condition-dialog-close"
          >
            Закрыть
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default AssignmentConditionDialog;
