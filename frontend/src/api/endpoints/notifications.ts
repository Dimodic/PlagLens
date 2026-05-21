/**
 * Notifications API client.
 * Mirrors docs/architecture/legacy/10-NOTIFICATION.md.
 *
 * Covers: feed, unread count, read/archive/delete, preferences (channels +
 * per-event matrix + quiet hours), web-push (VAPID subscribe/unsubscribe),
 * test-notification, digest preview, SSE stream URL.
 */
import api from '../client';
import type { Paginated } from '../types';
import { buildListParams, type ListParams } from '../pagination';

// -------------------- Types --------------------

export type NotificationSeverity = 'info' | 'success' | 'warning' | 'error';
export type NotificationChannel = 'inapp' | 'email' | 'telegram';
export type DigestFrequency = 'instant' | 'hourly' | 'daily' | 'never';

export interface NotificationItem {
  id: string;
  tenant_id?: string;
  user_id?: string;
  event_id?: string;
  event_type: string;
  source?: string;
  title: string;
  body: string;
  severity: NotificationSeverity;
  metadata?: Record<string, unknown>;
  action_url?: string | null;
  read: boolean;
  read_at?: string | null;
  archived?: boolean;
  archived_at?: string | null;
  created_at: string;
  channels_attempted?: Record<string, string>;
}

export interface NotificationFilter extends ListParams {
  unread?: boolean;
  archived?: boolean;
  severity?: NotificationSeverity;
  event_type?: string;
  since?: string;
}

export interface ChannelsEnabled {
  inapp: boolean;
  email: boolean;
  telegram: boolean;
}

export interface NotificationPreferences {
  channels_enabled: ChannelsEnabled;
  email_digest_frequency: DigestFrequency;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  timezone: string | null;
}

export interface PerEventPreference {
  inapp: boolean;
  email: boolean;
  telegram: boolean;
}

export type PerEventPreferences = Record<string, PerEventPreference>;

export interface AvailableEvent {
  event_type: string;
  title: string;
  description: string;
  default_severity: NotificationSeverity;
  group?: string;
}

export interface WebPushSubscriptionPayload {
  endpoint: string;
  keys: { auth: string; p256dh: string };
  user_agent?: string;
}

export interface WebPushSubscriptionInfo {
  id: string;
  endpoint: string;
  user_agent?: string;
  created_at: string;
}

export interface DigestPreview {
  next_run_at: string | null;
  frequency: DigestFrequency;
  notifications_count: number;
  preview_html?: string;
}

// -------------------- API client --------------------

export const notificationsApi = {
  // ---- A. Notifications ----
  list: (params: NotificationFilter = {}) => {
    const query = {
      ...buildListParams(params),
      ...(params.unread !== undefined ? { unread: String(params.unread) } : {}),
      ...(params.archived !== undefined ? { archived: String(params.archived) } : {}),
      ...(params.severity ? { severity: params.severity } : {}),
      ...(params.event_type ? { event_type: params.event_type } : {}),
      ...(params.since ? { since: params.since } : {}),
    };
    return api
      .get<Paginated<NotificationItem>>('/notifications', { params: query })
      .then((r) => r.data);
  },

  unreadCount: () =>
    api
      .get<{ count: number }>('/notifications/unread-count')
      .then((r) => r.data.count),

  get: (id: string) =>
    api.get<NotificationItem>(`/notifications/${id}`).then((r) => r.data),

  patch: (
    id: string,
    body: { read?: boolean; archived?: boolean },
  ) =>
    api
      .patch<NotificationItem>(`/notifications/${id}`, body)
      .then((r) => r.data),

  markRead: (ids: string[]) =>
    api
      .post<void>('/notifications:markRead', { ids })
      .then((r) => r.data),

  markUnread: (ids: string[]) =>
    api
      .post<void>('/notifications:markUnread', { ids })
      .then((r) => r.data),

  markAllRead: () =>
    api.post<void>('/notifications:markAllRead').then((r) => r.data),

  delete: (id: string) =>
    api.delete<void>(`/notifications/${id}`).then((r) => r.data),

  // ---- B. SSE stream URL ----
  streamUrl: (accessToken?: string | null): string => {
    const base = (
      (import.meta.env.VITE_API_BASE_URL as string) || '/api/v1'
    ).replace(/\/$/, '');
    const tokenPart = accessToken
      ? `?access_token=${encodeURIComponent(accessToken)}`
      : '';
    return `${base}/notifications/stream${tokenPart}`;
  },

  // ---- C. Preferences ----
  getPreferences: () =>
    api
      .get<NotificationPreferences>('/users/me/notification-preferences')
      .then((r) => r.data),

  updatePreferences: (body: Partial<NotificationPreferences>) =>
    api
      .patch<NotificationPreferences>(
        '/users/me/notification-preferences',
        body,
      )
      .then((r) => r.data),

  getPerEvent: () =>
    api
      .get<PerEventPreferences>(
        '/users/me/notification-preferences/per-event',
      )
      .then((r) => r.data),

  updatePerEvent: (body: PerEventPreferences) =>
    api
      .patch<PerEventPreferences>(
        '/users/me/notification-preferences/per-event',
        body,
      )
      .then((r) => r.data),

  resetPreferences: () =>
    api
      .post<NotificationPreferences>(
        '/users/me/notification-preferences:reset-to-defaults',
      )
      .then((r) => r.data),

  availableEvents: () =>
    api
      .get<AvailableEvent[]>(
        '/users/me/notification-preferences/available-events',
      )
      .then((r) => r.data),

  // ---- D. Test ----
  testNotification: (body: {
    channel: NotificationChannel;
    template?: string;
  }) =>
    api
      .post<{ delivered: boolean; details?: string }>(
        '/users/me/notifications/test',
        body,
      )
      .then((r) => r.data),

  // ---- I. Web Push ----
  vapidKey: () =>
    api
      .get<{ public_key: string }>(
        '/admin/notifications/web-push/vapid-key',
      )
      .then((r) => r.data),

  subscribeWebPush: (body: WebPushSubscriptionPayload) =>
    api
      .post<WebPushSubscriptionInfo>(
        '/users/me/web-push/subscribe',
        body,
      )
      .then((r) => r.data),

  unsubscribeWebPush: () =>
    api.delete<void>('/users/me/web-push/unsubscribe').then((r) => r.data),

  // ---- H. Digest ----
  digestPreview: () =>
    api
      .get<DigestPreview>('/users/me/notifications/digest-preview')
      .then((r) => r.data),
};
