/**
 * PlagLens wordmark — the P-lens mark IS the capital «P», set inline on
 * the text baseline so it reads as the first letter of the word, not a
 * detached icon beside it.
 *
 * Visual:
 *   full    → P-mark + "lagLens"  →  "PlagLens"
 *   compact → P-mark only         (sidebar rail)
 *
 * Alignment: the mark uses the `cropped` glyph (tight bounding box) at
 * cap-height (~0.74em), and the lockup is `inline-flex items-baseline`
 * with no gap, so the mark's foot lands on the text baseline exactly
 * like a real capital letter. The mark carries the only brand colour
 * (indigo); the rest of the word stays `foreground`.
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
  if (variant === 'compact') {
    return (
      <Link
        to={to}
        data-testid={testId ?? 'wordmark'}
        aria-label={ariaLabel}
        className={`inline-flex items-center justify-center text-foreground select-none ${className ?? ''}`}
      >
        <BrandMark cropped className="h-6 w-auto" />
      </Link>
    );
  }

  return (
    <Link
      to={to}
      data-testid={testId ?? 'wordmark'}
      aria-label={ariaLabel}
      className={`inline-flex items-baseline text-foreground select-none text-lg leading-none ${className ?? ''}`}
    >
      {/* The mark is the capital «P» — cap-height, baseline-aligned,
          a hair of optical kerning so it hugs the "l" without overlap. */}
      <BrandMark cropped className="h-[0.74em] w-auto mr-[0.04em]" />
      <span
        style={{
          fontFamily: FONT_STACK,
          fontWeight: 600,
          letterSpacing: '-0.02em',
        }}
      >
        lagLens
      </span>
    </Link>
  );
}

export default Wordmark;
