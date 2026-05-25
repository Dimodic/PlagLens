/**
 * OAuth identities — link/unlink Google/Yandex/Stepik/GitHub.
 */
import { GitBranch as Github, Mail, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { OAuthProvider } from '@/api/types';

const ALL_PROVIDERS: OAuthProvider[] = ['google', 'yandex', 'stepik', 'github'];

const LABELS: Record<OAuthProvider, string> = {
  google: 'Google',
  yandex: 'Яндекс',
  stepik: 'Stepik',
  github: 'GitHub',
  telegram: 'Telegram',
};

interface Props {
  linked: OAuthProvider[];
  onLink?: (provider: OAuthProvider) => void;
  onUnlink?: (provider: OAuthProvider) => void;
  loadingProvider?: OAuthProvider | null;
}

function ProviderIcon({ provider }: { provider: OAuthProvider }) {
  if (provider === 'google') return <Mail className="h-4 w-4" />;
  if (provider === 'github') return <Github className="h-4 w-4" />;
  return (
    <Badge variant="outline" className="h-5 w-5 justify-center p-0 text-[10px]">
      {provider[0].toUpperCase()}
    </Badge>
  );
}

export function OAuthLinksList({
  linked,
  onLink,
  onUnlink,
  loadingProvider,
}: Props) {
  return (
    <div className="space-y-3">
      {ALL_PROVIDERS.map((p) => {
        const isLinked = linked.includes(p);
        const isLoading = loadingProvider === p;
        return (
          <Card
            key={p}
            className="px-4 py-3"
            data-testid={`oauth-row-${p}`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <ProviderIcon provider={p} />
                <span className="font-medium">{LABELS[p]}</span>
                {isLinked ? (
                  <Badge className="bg-accent text-accent-foreground hover:bg-accent font-normal">
                    привязан
                  </Badge>
                ) : (
                  <Badge variant="outline" className="font-normal">
                    не привязан
                  </Badge>
                )}
              </div>
              {isLinked
                ? onUnlink && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => onUnlink(p)}
                      disabled={isLoading}
                      data-testid={`oauth-unlink-${p}`}
                    >
                      {isLoading && (
                        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                      )}
                      Отвязать
                    </Button>
                  )
                : onLink && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onLink(p)}
                      disabled={isLoading}
                      data-testid={`oauth-link-${p}`}
                    >
                      {isLoading && (
                        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                      )}
                      Привязать
                    </Button>
                  )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

export default OAuthLinksList;
