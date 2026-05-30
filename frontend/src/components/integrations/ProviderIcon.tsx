/**
 * Monochrome brand glyphs for integration providers.
 *
 * All paths use ``fill: currentColor`` so the icons stay in lockstep
 * with the surrounding text colour (dropdown items, tile titles, etc.)
 * — same recipe as the OAuth row on /login. Stepik / Google Sheets are
 * trimmed simple-icons paths; Yandex.Contest reuses the "Я in circle"
 * Wikimedia mark also seen in the OAuthLinksList.
 *
 * For non-brand providers (eJudge, Manual ZIP) we keep a small lucide
 * fallback so the caller can use a single component everywhere.
 */
import { Archive, Code2, GraduationCap } from 'lucide-react';
import { SiGooglesheets } from 'react-icons/si';
import type { IntegrationKind } from '@/api/endpoints/integrations';

interface Props {
  kind: IntegrationKind;
  className?: string;
}

export function ProviderIcon({ kind, className = 'h-4 w-4' }: Props) {
  const common = {
    className,
    'aria-hidden': true,
    fill: 'currentColor' as const,
    viewBox: '0 0 24 24',
  };

  if (kind === 'yandex_contest') {
    // Я-in-circle, same path as on /login (cut-out via evenodd).
    return (
      <svg {...common}>
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M2.04 12c0-5.523 4.476-10 10-10 5.522 0 10 4.477 10 10s-4.478 10-10 10c-5.524 0-10-4.477-10-10zm11.28-4.334h-.924c-1.694 0-2.585.858-2.585 2.123 0 1.43.616 2.1 1.881 2.959l1.045.704-3.003 4.487H7.49l2.695-4.014c-1.55-1.111-2.42-2.19-2.42-4.015 0-2.288 1.595-3.85 4.62-3.85h3.003v11.868H13.32V7.666z"
        />
      </svg>
    );
  }

  if (kind === 'stepik') {
    // No SiStepik in react-icons 5.6.0 (verified) and the hand-rolled
    // paths kept rendering garbled — use lucide GraduationCap, the same
    // semantically-apt fallback BrandIcon uses for Stepik.
    return <GraduationCap className={className} aria-hidden />;
  }

  if (kind === 'google_sheets') {
    // Official simple-icons glyph via react-icons (correct aspect — the
    // hand-rolled path was distorted).
    return <SiGooglesheets className={className} aria-hidden />;
  }

  if (kind === 'ejudge') {
    return <Code2 className={className} aria-hidden />;
  }

  // ``manual`` fallback — and a safety net for any future kind we
  // forget to wire here.
  return <Archive className={className} aria-hidden />;
}

export default ProviderIcon;
