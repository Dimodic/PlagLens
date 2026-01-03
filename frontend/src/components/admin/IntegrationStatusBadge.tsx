/**
 * Status pill for integration status (pending_auth / active / disabled / error).
 *
 * Outlined neutral pill with a coloured dot — Kaggle minimalism. Replaces the
 * earlier filled background variant.
 */
import { StatusPill, type StatusTone } from '@/components/common/StatusPill';
import type { IntegrationStatus } from '@/api/endpoints/integrations';

const LABELS: Record<IntegrationStatus, string> = {
  pending_auth: 'нужна авторизация',
  active: 'активно',
  disabled: 'отключено',
  error: 'ошибка',
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
  return <StatusPill tone={TONES[status]}>{LABELS[status]}</StatusPill>;
}

export default IntegrationStatusBadge;
