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
  // The mark is sized once, in pixels, and used identically in both
  // variants — so expanding the rail into the drawer doesn't make the
  // «P» jump size. The full wordmark's text is then sized to that mark
  // (cap-height ≈ mark height) rather than the other way round, per the
  // «P stays put, everything adapts to it» rule.
  const MARK = 'h-[22px] w-auto';

  if (variant === 'compact') {
    return (
      <Link
        to={to}
        data-testid={testId ?? 'wordmark'}
        aria-label={ariaLabel}
        className={`inline-flex items-center justify-center text-foreground select-none ${className ?? ''}`}
      >
        <BrandMark cropped className={MARK} />
      </Link>
    );
  }

  return (
    <Link
      to={to}
      data-testid={testId ?? 'wordmark'}
      aria-label={ariaLabel}
      className={`inline-flex items-baseline text-foreground select-none ${className ?? ''}`}
    >
      {/* Same 22px mark as the rail — it is the capital «P», sitting on
          the text baseline so it reads as the first letter. */}
      <BrandMark cropped className={`${MARK} mr-[0.06em]`} />
      <span
        // ~30px so the cap-height of «lagLens» lands at the mark's
        // height; the «P» reads as the matching first capital.
        className="text-[1.875rem] leading-none"
        style={{
          fontFamily: FONT_STACK,
          fontWeight: 600,
          letterSpacing: '-0.03em',
        }}
      >
        lagLens
      </span>
    </Link>
  );
}

export default Wordmark;
