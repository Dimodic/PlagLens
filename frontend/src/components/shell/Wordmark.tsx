/**
 * PlagLens wordmark — lowercase "plaglens".
 *
 * Visual:
 *   full    → text "plaglens" in Outfit / Inter @ 500, foreground colour
 *   compact → single lowercase "p"
 *
 * Outfit is the closest free system-available rounded geometric sans. We
 * declare a CSS font-family stack so if Outfit is missing the user-agent
 * falls back to Inter (already loaded) → system-ui.
 */
import { Link } from 'react-router-dom';

interface WordmarkProps {
  /** "full" = the word "plaglens". "compact" = single "p" (rail). */
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
      className={`inline-flex items-center text-foreground select-none ${className ?? ''}`}
    >
      <span
        className={
          variant === 'full'
            ? 'text-lg leading-none lowercase'
            : 'text-lg leading-none lowercase block w-full text-center'
        }
        style={{
          fontFamily: FONT_STACK,
          fontWeight: 500,
          letterSpacing: '-0.01em',
        }}
      >
        {variant === 'full' ? 'plaglens' : 'p'}
      </span>
    </Link>
  );
}

export default Wordmark;
