/**
 * Page + PageHeader + Section — centered content container, Kaggle-style.
 *
 *  <Page width="narrow">
 *    <PageHeader title="Курсы" action={<Button>...</Button>} />
 *    <Section title="Аккаунт">...</Section>
 *    <Section title="Уведомления">...</Section>
 *  </Page>
 *
 * width="narrow"  — 760px (settings, profile, forms)
 * width="regular" — 1080px (dashboard, courses, integrations)
 * width="wide"    — 1440px (tables: sync history, audit, submissions)
 *
 * Legacy aliases (kept for back-compat):
 *   "default" → "narrow", "full" → "wide"
 *
 * Anti-pattern reminder: do NOT pass a description string here. Per the
 * minimalism principle, page headers are H1 + (optional action) only.
 *
 * Section variant:
 *   `variant="document"` — Kaggle Settings doc-style. Renders a top
 *      border + top padding between sections so the page reads as one
 *      continuous document, no card chrome. Use for settings/profile/details.
 */
import { ReactNode, useEffect } from 'react';

export type PageWidth = 'narrow' | 'regular' | 'wide' | 'default' | 'full';

interface PageProps {
  width?: PageWidth;
  className?: string;
  children: ReactNode;
  'data-testid'?: string;
}

const WIDTHS: Record<PageWidth, string> = {
  narrow: 'max-w-[760px]',
  regular: 'max-w-[1080px]',
  wide: 'max-w-[1440px]',
  // legacy
  default: 'max-w-[760px]',
  full: 'max-w-[1440px]',
};

// Raw px values matched to WIDTHS — published as a CSS variable so the
// chrome above the page (AppShell breadcrumb rail, etc.) can size its
// own wrapper to the *current* page's width and stay aligned with the
// page content's left edge.
const WIDTH_PX: Record<PageWidth, string> = {
  narrow: '760px',
  regular: '1080px',
  wide: '1440px',
  default: '760px',
  full: '1440px',
};

export function Page({
  width = 'narrow',
  className,
  children,
  'data-testid': testId,
}: PageProps) {
  // Publish the page's max-width up the DOM via a CSS custom property
  // on the document root. The breadcrumb wrapper in AppShell reads
  // ``var(--page-max-w)`` to match its own container width, so the
  // breadcrumb sits flush with the left edge of the page content
  // regardless of which `width` the page chose. Reset on unmount so a
  // non-Page route (auth pages, oauth callbacks, error fallbacks)
  // falls back to the default 1080px.
  useEffect(() => {
    const root = document.documentElement;
    const prev = root.style.getPropertyValue('--page-max-w');
    root.style.setProperty('--page-max-w', WIDTH_PX[width]);
    return () => {
      if (prev) root.style.setProperty('--page-max-w', prev);
      else root.style.removeProperty('--page-max-w');
    };
  }, [width]);

  return (
    <div
      data-testid={testId ?? 'page'}
      data-page-width={width}
      className={`mx-auto w-full ${WIDTHS[width]} space-y-8 ${className ?? ''}`}
    >
      {children}
    </div>
  );
}

interface PageHeaderProps {
  title: ReactNode;
  /** Right-side actions (buttons). */
  action?: ReactNode;
  /** Optional override for test-id on the H1. */
  titleTestId?: string;
  className?: string;
}

export function PageHeader({
  title,
  action,
  titleTestId,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={`flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${className ?? ''}`}
    >
      <h1
        data-testid={titleTestId ?? 'page-title'}
        className="text-2xl font-semibold tracking-tight leading-tight"
      >
        {title}
      </h1>
      {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
    </header>
  );
}

/**
 * Plain prose section — H2 + content, no Card wrapper.
 *
 * variant="default" (legacy) — flat section, used inside a Card-less stack.
 * variant="document"         — Kaggle Settings style: 2nd+ sections get a
 *                              top border + top padding/margin so the whole
 *                              page reads like a single continuous document.
 *
 * Per minimalism principle we never render a subtitle/description here.
 */
interface SectionProps {
  title?: ReactNode;
  /** Right-side action for the section heading (e.g. "Add filter"). */
  action?: ReactNode;
  className?: string;
  variant?: 'default' | 'document';
  children: ReactNode;
}

export function Section({
  title,
  action,
  className,
  variant = 'default',
  children,
}: SectionProps) {
  // Document-variant spacing: just vertical rhythm, no border rule. The
  // previous rule stacked a horizontal line + 48px padding between every
  // section, which looked like a stair-step on settings pages with many
  // small sections. Pure whitespace reads calmer.
  const documentBorders =
    variant === 'document' ? '[&:not(:first-child)]:mt-10' : '';
  return (
    <section className={`space-y-3 ${documentBorders} ${className ?? ''}`}>
      {(title || action) && (
        <div
          className={
            variant === 'document'
              ? 'mb-6 flex items-center justify-between gap-3'
              : 'flex items-center justify-between gap-3'
          }
        >
          {title &&
            (variant === 'document' ? (
              <h2 className="text-base font-semibold tracking-tight">
                {title}
              </h2>
            ) : (
              <h2 className="text-xl font-bold tracking-tight">{title}</h2>
            ))}
          {action && <div className="flex items-center gap-2">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export default Page;
