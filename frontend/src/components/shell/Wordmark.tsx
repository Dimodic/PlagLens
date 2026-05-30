/**
 * PlagLens wordmark — the P-lens mark as the literal first letter,
 * followed by the rest of the word.
 *
 * Visual:
 *   full    → [mark] "laglens"   (mark replaces the leading "p")
 *   compact → [mark] only        (sidebar rail)
 *
 * The mark carries the only brand colour in the system (indigo); the
 * wordmark text stays in `foreground` so the lockup reads as one quiet
 * unit, not a coloured banner.
 */
import { Link } from 'react-router-dom';
import { BrandMark } from './BrandMark';

interface WordmarkProps {
  /** "full" = mark + "laglens". "compact" = mark only (rail). */
  variant?: 'full' | 'compact';
  className?: string;
  /** Optional click target; defaults to "/". */
  to?: string;
  /** Accessible name. */
  ariaLabel?: string;
  /** Test-id passthrough. */
  'data-testid'?: string;
}

const FONT_STACK =
  "'Outfit', 'Inter Variable', 'Inter', ui-sans-serif, system-ui, sans-serif";

export function Wordmark({
  variant = 'full',
  className,
  to = '/',
  ariaLabel = 'plaglens',
  'data-testid': testId,
}: WordmarkProps) {
  return (
    <Link
      to={to}
      data-testid={testId ?? 'wordmark'}
      aria-label={ariaLabel}
      className={`inline-flex items-center gap-1.5 text-foreground select-none ${className ?? ''}`}
    >
      <BrandMark className={variant === 'compact' ? 'h-5 w-5' : 'h-[1.05rem] w-[1.05rem]'} />
      {variant === 'full' && (
        <span
          className="text-lg leading-none lowercase"
          style={{
            fontFamily: FONT_STACK,
            fontWeight: 500,
            letterSpacing: '-0.01em',
          }}
        >
          laglens
        </span>
      )}
    </Link>
  );
}

export default Wordmark;
