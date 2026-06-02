import { Skeleton as UISkeleton } from '@/components/ui/skeleton';
import { Page, type PageWidth } from '@/components/layout/Page';
import { useTranslation } from '@/i18n';

export interface SkeletonListProps {
  rows?: number;
  rowHeight?: number;
  ariaLabel?: string;
}

/** Quiet row-stack skeleton. Default tone is `bg-muted/40` (the previous
 *  `bg-accent` was loud enough to read as the actual page content). */
export function SkeletonList({
  rows = 3,
  rowHeight = 48,
  ariaLabel,
}: SkeletonListProps) {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={ariaLabel ?? t('skeleton.aria_label')}
      className="flex flex-col gap-2"
    >
      {Array.from({ length: rows }).map((_, i) => (
        <UISkeleton
          key={i}
          className="rounded-md bg-muted/40"
          style={{ height: rowHeight }}
        />
      ))}
    </div>
  );
}

/** Page-shaped skeleton for `*DetailPage` early-returns.
 *
 * Mirrors the real layout — title + meta + tabs + rows — so the loading
 * state doesn't visually jump when data lands. Wrapped in `<Page>` so it
 * shares max-width and padding with the rendered page (no "polosy vo
 * vsju shirinu" effect). */
export function PageSkeleton({
  width = 'wide',
  rows = 5,
  rowHeight = 48,
  withTabs = true,
}: {
  width?: PageWidth;
  rows?: number;
  rowHeight?: number;
  withTabs?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Page width={width}>
      <div
        role="status"
        aria-live="polite"
        aria-label={t('skeleton.aria_label')}
        className="space-y-6"
      >
        {/* Title + meta row */}
        <div className="space-y-3">
          <UISkeleton className="h-7 w-1/2 rounded-md bg-muted/40" />
          <UISkeleton className="h-3 w-1/3 rounded-md bg-muted/30" />
        </div>
        {/* Tabs row */}
        {withTabs && (
          <div className="flex gap-2">
            <UISkeleton className="h-8 w-20 rounded-md bg-muted/30" />
            <UISkeleton className="h-8 w-24 rounded-md bg-muted/30" />
            <UISkeleton className="h-8 w-20 rounded-md bg-muted/30" />
            <UISkeleton className="h-8 w-24 rounded-md bg-muted/30" />
          </div>
        )}
        {/* List rows */}
        <div className="flex flex-col gap-2">
          {Array.from({ length: rows }).map((_, i) => (
            <UISkeleton
              key={i}
              className="rounded-md bg-muted/30"
              style={{ height: rowHeight }}
            />
          ))}
        </div>
      </div>
    </Page>
  );
}

export default SkeletonList;
