/**
 * React Query hooks for Notification Service.
 * (Named *Api to avoid clash with the existing toast wrapper at hooks/useNotifications.ts)
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  notificationsApi,
  type NotificationChannel,
  type NotificationFilter,
  type NotificationPreferences,
  type PerEventPreferences,
  type WebPushSubscriptionPayload,
} from '@/api/endpoints/notifications';

export const notificationKeys = {
  all: ['notifications'] as const,
  list: (filters: NotificationFilter) =>
    ['notifications', 'list', filters] as const,
  unreadCount: () => ['notifications', 'unread-count'] as const,
  detail: (id: string) => ['notifications', 'detail', id] as const,
  preferences: () => ['notifications', 'preferences'] as const,
  perEvent: () => ['notifications', 'preferences', 'per-event'] as const,
  availableEvents: () => ['notifications', 'available-events'] as const,
  digestPreview: () => ['notifications', 'digest-preview'] as const,
};

// -------------------- Queries --------------------

export function useNotifications(filters: NotificationFilter = {}) {
  return useQuery({
    queryKey: notificationKeys.list(filters),
    queryFn: () => notificationsApi.list(filters),
  });
}

export function useUnreadCount(opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: notificationKeys.unreadCount(),
    queryFn: () => notificationsApi.unreadCount().catch(() => 0),
    refetchInterval: 30_000,
    enabled: opts.enabled ?? true,
  });
}

export function useNotification(id: string | undefined) {
  return useQuery({
    queryKey: notificationKeys.detail(id ?? ''),
    queryFn: () => notificationsApi.get(id as string),
    enabled: !!id,
  });
}

export function useNotificationPreferences() {
  return useQuery({
    queryKey: notificationKeys.preferences(),
    queryFn: () => notificationsApi.getPreferences(),
  });
}

export function usePerEventPreferences() {
  return useQuery({
    queryKey: notificationKeys.perEvent(),
    queryFn: () => notificationsApi.getPerEvent(),
  });
}

export function useAvailableEvents() {
  return useQuery({
    queryKey: notificationKeys.availableEvents(),
    queryFn: () => notificationsApi.availableEvents(),
  });
}

export function useDigestPreview() {
  return useQuery({
    queryKey: notificationKeys.digestPreview(),
    queryFn: () => notificationsApi.digestPreview(),
  });
}

// -------------------- Mutations --------------------

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => notificationsApi.markRead(ids),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

export function useArchiveNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      notificationsApi.patch(id, { archived: true }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

export function useDeleteNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => notificationsApi.delete(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

export function useUpdatePreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<NotificationPreferences>) =>
      notificationsApi.updatePreferences(body),
    onSuccess: (data) => {
      qc.setQueryData(notificationKeys.preferences(), data);
    },
  });
}

export function useUpdatePerEventPreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PerEventPreferences) =>
      notificationsApi.updatePerEvent(body),
    onSuccess: (data) => {
      qc.setQueryData(notificationKeys.perEvent(), data);
    },
  });
}

export function useResetPreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => notificationsApi.resetPreferences(),
    onSuccess: (data) => {
      qc.setQueryData(notificationKeys.preferences(), data);
      void qc.invalidateQueries({ queryKey: notificationKeys.perEvent() });
    },
  });
}

export function useTestNotification() {
  return useMutation({
    mutationFn: (body: {
      channel: NotificationChannel;
      template?: string;
    }) => notificationsApi.testNotification(body),
  });
}

export function useWebPushSubscribe() {
  return useMutation({
    mutationFn: (body: WebPushSubscriptionPayload) =>
      notificationsApi.subscribeWebPush(body),
  });
}

export function useWebPushUnsubscribe() {
  return useMutation({
    mutationFn: () => notificationsApi.unsubscribeWebPush(),
  });
}
