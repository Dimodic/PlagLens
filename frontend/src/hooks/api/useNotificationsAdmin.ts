/**
 * React Query hooks for notification admin (templates, deliveries, DLQ).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  notificationsAdminApi,
  type CreateTemplateInput,
  type DeliveryFilters,
  type EmailConfig,
} from '@/api/endpoints/notificationsAdmin';
import type { ListParams } from '@/api/pagination';

export const notifAdminKeys = {
  emailConfig: ['notif', 'email-config'] as const,
  dnsStatus: ['notif', 'dns-status'] as const,
  templates: (
    params: ListParams & { event_type?: string; locale?: string; channel?: string },
  ) => ['notif', 'templates', params] as const,
  deliveries: (params: DeliveryFilters) => ['notif', 'deliveries', params] as const,
  dlq: (params: ListParams) => ['notif', 'dlq', params] as const,
};

export function useEmailConfig() {
  return useQuery({
    queryKey: notifAdminKeys.emailConfig,
    queryFn: () => notificationsAdminApi.getEmailConfig(),
  });
}

export function useUpdateEmailConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<EmailConfig>) =>
      notificationsAdminApi.updateEmailConfig(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: notifAdminKeys.emailConfig }),
  });
}

export function useTestEmail() {
  return useMutation({
    mutationFn: (to: string) => notificationsAdminApi.testEmail(to),
  });
}

export function useDnsStatus() {
  return useQuery({
    queryKey: notifAdminKeys.dnsStatus,
    queryFn: () => notificationsAdminApi.dnsStatus(),
  });
}

export function useNotificationTemplates(
  params: ListParams & {
    event_type?: string;
    locale?: string;
    channel?: 'email' | 'telegram' | 'in_app';
  } = {},
) {
  return useQuery({
    queryKey: notifAdminKeys.templates(params),
    queryFn: () => notificationsAdminApi.listTemplates(params),
  });
}

export function useCreateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTemplateInput) =>
      notificationsAdminApi.createTemplate(input),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['notif', 'templates'] }),
  });
}

export function useUpdateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; body: Partial<CreateTemplateInput> }) =>
      notificationsAdminApi.updateTemplate(vars.id, vars.body),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['notif', 'templates'] }),
  });
}

export function useDeliveries(params: DeliveryFilters = {}) {
  return useQuery({
    queryKey: notifAdminKeys.deliveries(params),
    queryFn: () => notificationsAdminApi.listDeliveries(params),
  });
}

export function useDLQ(params: ListParams = {}) {
  return useQuery({
    queryKey: notifAdminKeys.dlq(params),
    queryFn: () => notificationsAdminApi.listDLQ(params),
  });
}

export function useRetryDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => notificationsAdminApi.retryDelivery(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notif', 'dlq'] }),
  });
}

export function useDiscardDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => notificationsAdminApi.discardDelivery(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notif', 'dlq'] }),
  });
}
