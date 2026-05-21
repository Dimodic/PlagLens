/** TanStack-Query hooks for identity-level invitations (tenant-wide). */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  invitationsApi,
  type CreateInvitationInput,
  type Invitation,
} from '@/api/endpoints/invitations';

const KEY = ['invitations'] as const;

export function useInvitations() {
  return useQuery<Invitation[]>({
    queryKey: KEY,
    queryFn: invitationsApi.list,
    staleTime: 30_000,
  });
}

export function useCreateInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateInvitationInput) => invitationsApi.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useRevokeInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => invitationsApi.revoke(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useRedeemInvitation() {
  return useMutation({
    mutationFn: (code: string) => invitationsApi.redeem(code),
  });
}
