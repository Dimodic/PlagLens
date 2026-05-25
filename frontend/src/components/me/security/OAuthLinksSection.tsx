/**
 * Inline OAuth-link manager for /me/profile.
 *
 * Wraps OAuthLinksList with the link/unlink handlers it already exposes.
 * link → opens the provider's authorize flow; unlink → DELETE /auth/oauth.
 */
import { useState } from 'react';
import { OAuthLinksList } from '@/components/me/OAuthLinksList';
import { useUnlinkOAuth } from '@/hooks/api/useUsers';
import { useNotifications } from '@/hooks/useNotifications';
import { useAuth } from '@/auth/useAuth';
import type { OAuthProvider, Problem } from '@/api/types';

export function OAuthLinksSection() {
  const { user, reloadMe } = useAuth();
  const notify = useNotifications();
  const unlink = useUnlinkOAuth();
  const [loading, setLoading] = useState<OAuthProvider | null>(null);

  const onUnlink = async (p: OAuthProvider) => {
    setLoading(p);
    try {
      await unlink.mutateAsync(p);
      notify.success(`Отвязано: ${p}`);
      await reloadMe();
    } catch (e) {
      notify.error((e as Problem)?.detail ?? 'Не удалось');
    } finally {
      setLoading(null);
    }
  };

  const onLink = (p: OAuthProvider) => {
    window.location.href = `/api/v1/auth/oauth/${p}/authorize?return_url=${encodeURIComponent(
      window.location.href,
    )}`;
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm text-foreground">Привязанные аккаунты</h3>
      <OAuthLinksList
        linked={(user?.linked_oauth as OAuthProvider[]) ?? []}
        loadingProvider={loading}
        onLink={onLink}
        onUnlink={onUnlink}
      />
    </div>
  );
}

export default OAuthLinksSection;
