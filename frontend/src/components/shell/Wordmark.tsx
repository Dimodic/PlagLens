/**
 * PlagLens wordmark — the P-lens mark IS the capital «P».
 *
 * Variants:
 *   compact          → P-mark only, centered (sidebar rail)
 *   full             → P-mark + "lagLens", tight inline (top header / mobile)
 *   full+railAligned → P-mark in the SAME 72px centered slot as the rail,
 *                      then "lagLens" — so when the rail expands into the
 *                      drawer the «P» doesn't shift horizontally.
 *
 * The mark is one fixed pixel size everywhere (22px) so it never changes
 * size between collapsed/expanded; the wordmark text is sized to it
 * (cap-height ≈ mark height). The mark carries the only brand colour
 * (indigo); the rest of the word stays `foreground`.
 */
import { Link } from 'react-router-dom';
import { BrandMark } from './BrandMark';

interface WordmarkProps {
  /** "full" = mark + "lagLens". "compact" = mark only (rail). */
  variant?: 'full' | 'compact';
  /** Full variant only: seat the mark in the rail's 72px centered slot so
   *  its x-position matches the collapsed rail exactly (no drift on hover). */
  railAligned?: boolean;
  /** railAligned only: fade the "lagLens" text in/out. When false the text
   *  is invisible (so a collapsed rail shows ONLY the «P», never a clipped
   *  "la" peeking past the 72px edge). Defaults to true. */
  textRevealed?: boolean;
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

// One mark size, used in every variant — the «P» never resizes.
const MARK = 'h-[22px] w-auto';
// Rail width (matches the <aside> w-[72px] and the rail glyph slot), so the
// drawer's mark sits at the identical centre and doesn't drift on expand.
const RAIL_SLOT = 'w-[72px]';

const TEXT_CLASS = 'text-[1.875rem] leading-none';
const TEXT_STYLE = {
  fontFamily: FONT_STACK,
  fontWeight: 600,
  letterSpacing: '-0.03em',
} as const;

export function Wordmark({
  variant = 'full',
  railAligned = false,
  textRevealed = true,
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
        <BrandMark cropped className={MARK} />
      </Link>
    );
  }

  // Rail-aligned full wordmark (sidebar drawer): the mark lives in a 72px
  // centred slot identical to the rail's, so hovering the rail open keeps
  // the «P» in place. "lagLens" is pulled left so it still hugs the mark.
  if (railAligned) {
    return (
      <Link
        to={to}
        data-testid={testId ?? 'wordmark'}
        aria-label={ariaLabel}
        className={`inline-flex items-center text-foreground select-none ${className ?? ''}`}
      >
        <span className={`flex ${RAIL_SLOT} shrink-0 items-center justify-center`}>
          <BrandMark cropped className={MARK} />
        </span>
        <span
          className={`-ml-6 ${TEXT_CLASS} transition-opacity duration-200 ${textRevealed ? 'opacity-100' : 'opacity-0'}`}
          style={TEXT_STYLE}
        >
          lagLens
        </span>
      </Link>
    );
  }

  // Tight inline wordmark (top header / mobile). The mark is the capital
  // «P», baseline-aligned so it reads as the first letter.
  return (
    <Link
      to={to}
      data-testid={testId ?? 'wordmark'}
      aria-label={ariaLabel}
      className={`inline-flex items-baseline text-foreground select-none ${className ?? ''}`}
    >
      <BrandMark cropped className={`${MARK} mr-[0.06em]`} />
      <span className={TEXT_CLASS} style={TEXT_STYLE}>
        lagLens
      </span>
    </Link>
  );
}

export default Wordmark;
