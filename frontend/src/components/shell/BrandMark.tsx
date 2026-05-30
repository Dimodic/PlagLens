/**
 * BrandMark — the PlagLens glyph (the "P-lens": a P bowl + a magnifying
 * lens circle). Source of truth for the logo across the app.
 *
 * The SVG path is the design-system mark (styles/logo/plaglens-mark.svg).
 * We inline it (rather than <img src>) so it inherits colour from
 * `currentColor` and adapts to theme — one glyph, recoloured by context:
 *
 *   <BrandMark />                 → brand indigo (text-brand)
 *   <BrandMark tone="ink" />      → foreground (dark on light / light on dark)
 *   <BrandMark tone="white" />    → white (for use on a coloured surface)
 *   <BrandMark tile />            → white glyph inset on a rounded indigo
 *                                   tile — the "app icon" lockup used on the
 *                                   auth hero and the sidebar rail.
 *
 * Size is driven by `className` — pass height/width utilities (e.g.
 * `h-14 w-14`) on the glyph, or on the tile wrapper.
 */
import { cn } from '@/components/ui/utils';

const GLYPH_PATH =
  'M28 16 H50 a26 26 0 0 1 0 52 H42 V84 H28 Z M58 42 m-13 0 a13 13 0 1 0 26 0 a13 13 0 1 0 -26 0';

type Tone = 'brand' | 'ink' | 'white';

const TONE_CLASS: Record<Tone, string> = {
  brand: 'text-brand',
  ink: 'text-foreground',
  white: 'text-white',
};

interface BrandMarkProps {
  /** Glyph colour. Ignored when `tile` is set (tile is always white-on-brand). */
  tone?: Tone;
  /** Render the glyph on a rounded indigo tile (app-icon lockup). */
  tile?: boolean;
  /** Extra classes — set the size here (e.g. `h-14 w-14`). */
  className?: string;
  /** Accessible label; omit (and set aria-hidden) when paired with a wordmark. */
  title?: string;
}

function Glyph({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      fill="currentColor"
    >
      <path fillRule="evenodd" clipRule="evenodd" d={GLYPH_PATH} />
    </svg>
  );
}

export function BrandMark({
  tone = 'brand',
  tile = false,
  className,
  title,
}: BrandMarkProps) {
  if (tile) {
    return (
      <span
        className={cn(
          'inline-grid place-items-center rounded-2xl bg-brand text-white',
          className,
        )}
        role={title ? 'img' : undefined}
        aria-label={title}
        aria-hidden={title ? undefined : true}
      >
        {/* Glyph sits at ~58% of the tile, matching the design's tile. */}
        <Glyph className="h-[58%] w-[58%]" />
      </span>
    );
  }
  return <Glyph className={cn(TONE_CLASS[tone], className)} title={title} />;
}

export default BrandMark;
