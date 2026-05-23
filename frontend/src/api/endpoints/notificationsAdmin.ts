/**
 * Notification Service — admin endpoints (templates, deliveries, DLQ, email config).
 */
import api from '../client';
import type { Paginated } from '../types';
import { buildListParams, type ListParams } from '../pagination';

export type EmailTransport = 'smtp' | 'mailgun';
export type DeliveryChannel = 'email' | 'telegram' | 'in_app';
export type DeliveryStatus = 'queued' | 'delivered' | 'failed' | 'skipped';

export interface EmailConfig {
  transport: EmailTransport;
  from_email: string;
  from_name: string;
  smtp_host?: string;
  smtp_port?: number;
  smtp_username?: string;
  smtp_use_tls?: boolean;
  mailgun_domain?: string;
  mailgun_region?: 'us' | 'eu';
}

export interface DnsStatus {
  domain: string;
  spf_ok: boolean;
  dkim_ok: boolean;
  dmarc_ok: boolean;
  details?: Record<string, unknown>;
}

export interface NotificationTemplate {
  id: string;
  event_type: string;
  channel: DeliveryChannel;
  locale: string;
  subject: string | null;
  body: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateTemplateInput {
  event_type: string;
  channel: DeliveryChannel;
  locale: string;
  subject?: string | null;
  body: string;
  active?: boolean;
}

export interface NotificationDelivery {
  id: string;
  template_id: string | null;
  event_type: string;
  channel: DeliveryChannel;
  recipient: string;
  status: DeliveryStatus;
  failure_reason: string | null;
  attempts: number;
  enqueued_at: string;
  delivered_at: string | null;
}

export interface DeliveryFilters extends ListParams {
  channel?: DeliveryChannel;
  status?: DeliveryStatus;
  event_type?: string;
  since?: string;
}

export const notificationsAdminApi = {
  // -------- Email config --------
  getEmailConfig: () =>
    api.get<EmailConfig>('/admin/notifications/email-config').then((r) => r.data),

  updateEmailConfig: (body: Partial<EmailConfig>) =>
    api.patch<EmailConfig>('/admin/notifications/email-config', body).then((r) => r.data),

  testEmail: (to: string) =>
    api
      .post<{ delivery_id: string }>('/admin/notifications/email-config:test', { to })
      .then((r) => r.data),

  dnsStatus: () =>
    api
      .get<DnsStatus>('/admin/notifications/email-config/dns-status')
      .then((r) => r.data),

  // -------- Templates --------
  listTemplates: (params: ListParams & { event_type?: string; locale?: string; channel?: DeliveryChannel } = {}) => {
    const base = buildListParams(params);
    if (params.event_type) base.event_type = params.event_type;
    if (params.locale) base.locale = params.locale;
    if (params.channel) base.channel = params.channel;
    return api
      .get<Paginated<NotificationTemplate>>('/admin/notifications/templates', {
        params: base,
      })
      .then((r) => r.data);
  },

  createTemplate: (input: CreateTemplateInput) =>
    api.post<NotificationTemplate>('/admin/notifications/templates', input).then((r) => r.data),

  updateTemplate: (id: string, body: Partial<CreateTemplateInput>) =>
    api
      .patch<NotificationTemplate>(`/admin/notifications/templates/${id}`, body)
      .then((r) => r.data),

  // -------- Deliveries / DLQ --------
  listDeliveries: (params: DeliveryFilters = {}) => {
    const base = buildListParams(params);
    if (params.channel) base.channel = params.channel;
    if (params.status) base.status = params.status;
    if (params.event_type) base.event_type = params.event_type;
    if (params.since) base.since = params.since;
    return api
      .get<Paginated<NotificationDelivery>>('/admin/notifications/deliveries', {
        params: base,
      })
      .then((r) => r.data);
  },

  listDLQ: (params: ListParams = {}) =>
    api
      .get<Paginated<NotificationDelivery>>('/admin/notifications/dlq', {
        params: buildListParams(params),
      })
      .then((r) => r.data),

  retryDelivery: (id: string) =>
    api
      .post<NotificationDelivery>(`/admin/notifications/dlq/${id}:retry`)
      .then((r) => r.data),

  discardDelivery: (id: string) =>
    api
      .post<void>(`/admin/notifications/dlq/${id}:discard`)
      .then((r) => r.data),
};
