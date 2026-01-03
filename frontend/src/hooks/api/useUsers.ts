/**
 * React Query hooks for users (admin + self-service).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  usersApi,
  type BulkInviteInput,
  type CreateApiKeyInput,
  type CreateUserInput,
  type UpdateUserInput,
  type UserListFilters,
} from '@/api/endpoints/users';

export const userKeys = {
  all: ['users'] as const,
  list: (filters: UserListFilters) => ['users', 'list', filters] as const,
  detail: (id: string) => ['users', 'detail', id] as const,
  sessions: (id: string) => ['users', id, 'sessions'] as const,
  externalBindings: (id: string) => ['users', id, 'external-bindings'] as const,
  oauthIdentities: (id: string) => ['users', id, 'oauth-identities'] as const,
  apiKeys: (id: string) => ['users', id, 'api-keys'] as const,
  me: ['users', 'me'] as const,
  mySessions: ['users', 'me', 'sessions'] as const,
  myApiKeys: ['users', 'me', 'api-keys'] as const,
  myExternalBindings: ['users', 'me', 'external-bindings'] as const,
};

// -------- Admin --------

export function useUsers(
  filters: UserListFilters = {},
  opts: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: userKeys.list(filters),
    queryFn: () => usersApi.list(filters),
    // GET /users is staff-only — callers gate it via ``enabled`` so a
    // student page that imports this hook doesn't 403.
    enabled: opts.enabled ?? true,
  });
}

export function useUser(id: string | undefined) {
  return useQuery({
    queryKey: userKeys.detail(id ?? ''),
    queryFn: () => usersApi.get(id as string),
    enabled: !!id,
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateUserInput) => usersApi.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.all }),
  });
}

export function useBulkInviteUsers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BulkInviteInput) => usersApi.bulkInvite(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.all }),
  });
}

export function useUpdateUser(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateUserInput) => usersApi.update(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: userKeys.detail(id) });
      qc.invalidateQueries({ queryKey: userKeys.all });
    },
  });
}

export function useDisableUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => usersApi.disable(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.all }),
  });
}

export function useEnableUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => usersApi.enable(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.all }),
  });
}

export function useAnonymizeUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => usersApi.anonymize(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.all }),
  });
}

export function useResetUserPassword() {
  return useMutation({
    mutationFn: (id: string) => usersApi.resetPassword(id),
  });
}

export function useForceLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => usersApi.forceLogout(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: userKeys.sessions(id) });
    },
  });
}

export function useUserSessions(id: string | undefined) {
  return useQuery({
    queryKey: userKeys.sessions(id ?? ''),
    queryFn: () => usersApi.listSessionsForUser(id as string),
    enabled: !!id,
  });
}

export function useRevokeSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => usersApi.revokeSession(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.mySessions }),
  });
}

export function useUserExternalBindings(id: string | undefined) {
  return useQuery({
    queryKey: userKeys.externalBindings(id ?? ''),
    queryFn: () => usersApi.listExternalBindings(id as string),
    enabled: !!id,
  });
}

export function useUserOAuthIdentities(id: string | undefined) {
  return useQuery({
    queryKey: userKeys.oauthIdentities(id ?? ''),
    queryFn: () => usersApi.listOAuthIdentities(id as string),
    enabled: !!id,
  });
}

// TODO(backend): admin api-keys endpoint not yet wired (see usersApi).
export function useUserApiKeys(id: string | undefined) {
  return useQuery({
    queryKey: userKeys.apiKeys(id ?? ''),
    queryFn: () => usersApi.listApiKeysForUser(id as string),
    enabled: !!id,
    retry: false,
  });
}

// TODO(backend): admin api-key revoke endpoint not yet wired.
export function useRevokeApiKey(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (key_id: string) => usersApi.revokeApiKeyForUser(userId, key_id),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: userKeys.apiKeys(userId) }),
  });
}

// -------- Self-service --------

export function useMySessions() {
  return useQuery({
    queryKey: userKeys.mySessions,
    queryFn: () => usersApi.listSessions(),
  });
}

export function useApiKeys() {
  return useQuery({
    queryKey: userKeys.myApiKeys,
    queryFn: () => usersApi.listMyApiKeys(),
  });
}

export function useCreateApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateApiKeyInput) => usersApi.createMyApiKey(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.myApiKeys }),
  });
}

export function useRotateApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => usersApi.rotateMyApiKey(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.myApiKeys }),
  });
}

export function useDeleteApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => usersApi.deleteMyApiKey(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.myApiKeys }),
  });
}

export function useMyExternalBindings() {
  return useQuery({
    queryKey: userKeys.myExternalBindings,
    queryFn: () => usersApi.listMyExternalBindings(),
  });
}

export function useAddMyExternalBinding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      system: 'stepik' | 'yandex_contest';
      external_id: string;
      display_name?: string;
    }) => usersApi.addMyExternalBinding(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.myExternalBindings }),
  });
}

export function useRemoveMyExternalBinding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => usersApi.removeMyExternalBinding(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.myExternalBindings }),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (input: { current_password: string; new_password: string }) =>
      usersApi.changePassword(input),
  });
}

export function useEnable2FA() {
  return useMutation({
    mutationFn: (totp_code: string) => usersApi.enable2fa(totp_code),
  });
}

export function useDisable2FA() {
  return useMutation({
    mutationFn: (password: string) => usersApi.disable2fa(password),
  });
}

export function useEnroll2FA() {
  return useMutation({
    mutationFn: () => usersApi.enroll2fa(),
  });
}

export function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      patch: Partial<{ display_name: string; locale: string; timezone: string | null }>,
    ) => usersApi.patchMe(patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.me }),
  });
}

export function useUploadAvatar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (formData: FormData) => usersApi.uploadAvatar(formData),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.me }),
  });
}

export function useDeleteAvatar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => usersApi.deleteAvatar(),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.me }),
  });
}

export function useUnlinkOAuth() {
  return useMutation({
    mutationFn: (provider: 'google' | 'yandex' | 'stepik' | 'github') =>
      usersApi.unlinkOAuth(provider),
  });
}
