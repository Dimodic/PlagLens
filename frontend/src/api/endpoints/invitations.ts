/**
 * Identity-service invitation endpoints — §K.
 *
 * Separate from the course-level invitations in `courses.ts` (those live
 * under `/courses/{id}/invitations` and target a specific course only).
 * This module wraps the tenant-wide `/invitations` API which carries an
 * optional `course_id` plus a short human-readable `code`.
 */
import api from '../client';
import type { GlobalRole } from '../types';

export type InviteRole = Extract<GlobalRole, 'teacher' | 'assistant' | 'student'>;

export interface Invitation {
  id: string;
  tenant_id: string;
  email: string;
  role: InviteRole;
  course_id: string | null;
  code: string | null;
  expires_at: string;
  accepted_at: string | null;
  accepted_by: string | null;
  created_at: string;
}

export interface InvitationCreated extends Invitation {
  token: string;
}

export interface CreateInvitationInput {
  email?: string;
  role: InviteRole;
  course_id?: string;
  expires_in_seconds?: number;
}

export interface RedeemResult {
  invitation_id: string;
  role_applied: GlobalRole | null;
  course_id: string | null;
  course_role: string | null;
  requires_relogin: boolean;
}

export const invitationsApi = {
  list: () => api.get<Invitation[]>('/invitations').then((r) => r.data),
  create: (input: CreateInvitationInput) =>
    api.post<InvitationCreated>('/invitations', input).then((r) => r.data),
  revoke: (id: string) =>
    api.delete<void>(`/invitations/${id}`).then((r) => r.data),
  redeem: (code: string) =>
    api.post<RedeemResult>('/invitations:redeem', { code }).then((r) => r.data),
};
