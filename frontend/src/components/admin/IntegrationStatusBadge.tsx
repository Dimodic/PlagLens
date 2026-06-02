/**
 * Status pill for integration status (pending_auth / active / disabled / error).
 *
 * Outlined neutral pill with a coloured dot — Kaggle minimalism. Replaces the
 * earlier filled background variant.
 */
import { StatusPill, type StatusTone } from '@/components/common/StatusPill';
import type { IntegrationStatus } from '@/api/endpoints/integrations';
import { useTranslation } from '@/i18n';

const LABEL_KEYS: Record<IntegrationStatus, string> = {
  pending_auth: 'integration_status_badge.pending_auth',
  active: 'integration_status_badge.active',
  disabled: 'integration_status_badge.disabled',
  error: 'integration_status_badge.error',
};

const TONES: Record<IntegrationStatus, StatusTone> = {
  pending_auth: 'warning',
  active: 'success',
  disabled: 'neutral',
  error: 'destructive',
};

interface Props {
  status: IntegrationStatus;
}

export function IntegrationStatusBadge({ status }: Props) {
  const { t } = useTranslation();
  return <StatusPill tone={TONES[status]}>{t(LABEL_KEYS[status])}</StatusPill>;
}

export default IntegrationStatusBadge;
