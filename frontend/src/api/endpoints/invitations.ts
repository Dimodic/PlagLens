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
  // Admin-only: target a different tenant than the caller's own. Server
  // rejects with 403 if the caller is a teacher.
  tenant_id?: string;
  expires_in_seconds?: number;
}

export interface RedeemResult {
  invitation_id: string;
  role_applied: GlobalRole | null;
  course_id: string | null;
  course_role: string | null;
  requires_relogin: boolean;
}

// ---- Bulk bindings (Yandex.Contest participant → claim code) ----
//
// The teacher generates a one-time code per imported contest participant.
// `role` ("student") and `binding_system` ("yandex_contest") are filled in
// server-side, so the request only carries the course + participant list.
// Idempotent: re-running returns the same code for an already-coded
// participant.

/** One participant to mint a code for. `display_name` mirrors the label
 *  shown on the ghost author so the code list reads as ФИО → CODE. */
export interface BulkBindingParticipant {
  external_id: string;
  display_name: string | null;
}

export interface BulkBindingsInput {
  course_id: string;
  participants: BulkBindingParticipant[];
}

export interface BulkBindingItem {
  external_id: string;
  display_name: string | null;
  code: string;
}

export interface BulkBindingsResult {
  items: BulkBindingItem[];
}

export const invitationsApi = {
  list: () => api.get<Invitation[]>('/invitations').then((r) => r.data),
  create: (input: CreateInvitationInput) =>
    api.post<InvitationCreated>('/invitations', input).then((r) => r.data),
  revoke: (id: string) =>
    api.delete<void>(`/invitations/${id}`).then((r) => r.data),
  redeem: (code: string) =>
    api.post<RedeemResult>('/invitations:redeem', { code }).then((r) => r.data),
  bulkBindings: (input: BulkBindingsInput) =>
    api
      .post<BulkBindingsResult>('/invitations:bulk-bindings', input)
      .then((r) => r.data),
};
