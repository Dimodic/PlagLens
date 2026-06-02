/**
 * OAuth identities — flat list, no Card chrome.
 *
 * Each provider is a single row: monochrome glyph + name + state + action.
 * Rows separate themselves with hairline borders to fit the open-document
 * Profile layout (.claude/UI_RULES.md). Telegram is part of the row
 * sequence too — once a bot is configured, /me/profile can unlink it from
 * here just like any other provider.
 */
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/i18n';
import type { OAuthProvider } from '@/api/types';

// Providers a regular user can sign in with. Stepik is intentionally
// NOT here: it's wired only as an *integration* (grade sync from Stepik
// classrooms), the OAuth client_id/secret pair on /admin/integrations →
// Авторизация has no business attached to a user's identity here.
const ALL_PROVIDERS: OAuthProvider[] = [
  'google',
  'yandex',
  'github',
  'telegram',
];

const LABELS: Record<OAuthProvider, string> = {
  google: 'Google',
  yandex: 'Yandex',
  stepik: 'Stepik',
  github: 'GitHub',
  telegram: 'Telegram',
};

// Same monochrome simple-icons SVGs as on the login page. Wrapped in a
// minimum-sized circle slot so the column stays aligned even if Telegram
// is empty / no glyph found.
function ProviderGlyph({ provider }: { provider: OAuthProvider }) {
  const common = {
    className: 'h-4 w-4',
    'aria-hidden': true,
    fill: 'currentColor' as const,
    viewBox: '0 0 24 24',
  };
  if (provider === 'google') {
    return (
      <svg {...common}>
        <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z" />
      </svg>
    );
  }
  if (provider === 'yandex') {
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
  if (provider === 'github') {
    return (
      <svg {...common}>
        <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12z" />
      </svg>
    );
  }
  if (provider === 'telegram') {
    return (
      <svg {...common}>
        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
      </svg>
    );
  }
  // Stepik / fallback — single letter glyph, no border chrome.
  return (
    <span className="inline-flex h-4 w-4 items-center justify-center text-xs font-semibold">
      {provider[0].toUpperCase()}
    </span>
  );
}

interface Props {
  linked: OAuthProvider[];
  onLink?: (provider: OAuthProvider) => void;
  onUnlink?: (provider: OAuthProvider) => void;
  loadingProvider?: OAuthProvider | null;
}

export function OAuthLinksList({
  linked,
  onLink,
  onUnlink,
  loadingProvider,
}: Props) {
  const { t } = useTranslation();
  return (
    <ul className="space-y-0.5" data-testid="oauth-list">
      {ALL_PROVIDERS.map((p) => {
        const isLinked = linked.includes(p);
        const isLoading = loadingProvider === p;
        return (
          <li
            key={p}
            className="flex items-center gap-3 py-2.5"
            data-testid={`oauth-row-${p}`}
          >
            <ProviderGlyph provider={p} />
            {/* No «привязан / не привязан» pill — the link / unlink button
              * below already states the status. */}
            <span className="flex-1 text-sm text-foreground">{LABELS[p]}</span>
            {isLinked ? (
              onUnlink && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-muted-foreground hover:text-destructive"
                  onClick={() => onUnlink(p)}
                  disabled={isLoading}
                  data-testid={`oauth-unlink-${p}`}
                >
                  {isLoading && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  {t('oauth_links_list.unlink')}
                </Button>
              )
            ) : (
              onLink && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => onLink(p)}
                  disabled={isLoading}
                  data-testid={`oauth-link-${p}`}
                >
                  {isLoading && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  {t('oauth_links_list.link')}
                </Button>
              )
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default OAuthLinksList;
