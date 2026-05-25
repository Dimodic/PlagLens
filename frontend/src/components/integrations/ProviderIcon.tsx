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
import { Archive, Code2 } from 'lucide-react';
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
    // simple-icons/stepik — the rounded S-on-grid mark, trimmed to the
    // outermost path so it reads at 16px without becoming a blob.
    return (
      <svg {...common}>
        <path d="M9.594 5.578v3.61l5.812 3.452-5.812 3.452v3.61l9-5.295V10.85l-9-5.272zM0 12.04l2.953 1.752V10.27L0 12.04zm5.484-3.247v6.484l3 1.78V7.011l-3 1.782z" />
      </svg>
    );
  }

  if (kind === 'google_sheets') {
    // simple-icons/googlesheets — folded-corner spreadsheet with grid.
    return (
      <svg {...common}>
        <path d="M11.318 12.545H7.91v-1.909h3.41v1.91zM14.728 0H5.456A1.456 1.456 0 0 0 4 1.456v21.088A1.456 1.456 0 0 0 5.456 24h13.088A1.456 1.456 0 0 0 20 22.544V5.272L14.727 0zm3.456 20.727H5.818V3.273h8.318V6h4.05v14.727zm-1.91-9H7.91v-1.909h8.364v1.91zM12.682 14.455H7.91v1.909h4.773v-1.91zm0 3.272H7.91v1.91h4.773v-1.91zm1.273-3.272h2.318v1.909h-2.318v-1.91zm0 3.272h2.318v1.91h-2.318v-1.91z" />
      </svg>
    );
  }

  if (kind === 'ejudge') {
    return <Code2 className={className} aria-hidden />;
  }

  // ``manual`` fallback — and a safety net for any future kind we
  // forget to wire here.
  return <Archive className={className} aria-hidden />;
}

export default ProviderIcon;
