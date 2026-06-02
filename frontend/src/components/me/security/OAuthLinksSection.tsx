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
import { useTranslation } from '@/i18n';
import type { OAuthProvider, Problem } from '@/api/types';

export function OAuthLinksSection() {
  const { t } = useTranslation();
  const { user, reloadMe } = useAuth();
  const notify = useNotifications();
  const unlink = useUnlinkOAuth();
  const [loading, setLoading] = useState<OAuthProvider | null>(null);

  const onUnlink = async (p: OAuthProvider) => {
    setLoading(p);
    try {
      await unlink.mutateAsync(p);
      notify.success(t('oauth_links_section.unlinked', { provider: p }));
      await reloadMe();
    } catch (e) {
      notify.error((e as Problem)?.detail ?? t('oauth_links_section.unlink_failed'));
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
      <h3 className="text-sm text-foreground">{t('oauth_links_section.linked_accounts')}</h3>
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
