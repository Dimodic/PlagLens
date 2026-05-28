/**
 * Auth endpoints — Identity Service §A, §B, §C, §D.
 */
import api from '../client';
import type {
  CurrentUser,
  LoginResponse,
  RefreshResponse,
  RegisterResponse,
} from '../types';

export interface LoginRequest {
  email: string;
  password: string;
  tenant_slug?: string;
  totp_code?: string;
  mfa_token?: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  display_name: string;
  // tenant_slug is optional — when omitted the backend plants the user
  // in the placeholder «public» tenant. Real organisation is picked up
  // later when the user redeems an invitation code, which migrates
  // ``user.tenant_id`` on the identity side.
  tenant_slug?: string;
  locale?: string;
  invitation_token?: string;
}

export const authApi = {
  login: (req: LoginRequest) => api.post<LoginResponse>('/auth/login', req).then((r) => r.data),

  register: (req: RegisterRequest) =>
    api.post<RegisterResponse>('/auth/register', req).then((r) => r.data),

  logout: () => api.post<void>('/auth/logout').then((r) => r.data),

  refresh: () => api.post<RefreshResponse>('/auth/refresh').then((r) => r.data),

  me: () => api.get<CurrentUser>('/auth/me').then((r) => r.data),

  // Password
  passwordForgot: (email: string, tenant_slug?: string) =>
    api.post<void>('/auth/password/forgot', { email, tenant_slug }).then((r) => r.data),

  passwordReset: (token: string, new_password: string) =>
    api.post<void>('/auth/password/reset', { token, new_password }).then((r) => r.data),

  passwordChange: (current_password: string, new_password: string) =>
    api
      .post<void>('/auth/password/change', { current_password, new_password })
      .then((r) => r.data),

  // Email verification
  emailVerifyRequest: () => api.post<void>('/auth/email/verify/request').then((r) => r.data),
  emailVerifyConfirm: (token: string) =>
    api.post<void>('/auth/email/verify/confirm', { token }).then((r) => r.data),

  // 2FA
  twoFactorEnroll: () =>
    api
      .post<{ secret: string; otpauth_uri: string; qr_svg?: string }>('/auth/2fa/enroll')
      .then((r) => r.data),
  twoFactorEnable: (totp_code: string) =>
    api
      .post<{ codes?: string[]; backup_codes?: string[] }>('/auth/2fa/enable', { totp_code })
      .then((r) => ({
        // Backend returns the field as `codes`; we accept both for resilience.
        backup_codes: r.data.backup_codes ?? r.data.codes ?? [],
      })),
  twoFactorDisable: (password: string) =>
    // Backend currently reuses PasswordChangeRequest schema, so it requires
    // both current_password and new_password (latter is unused).
    api
      .post<void>('/auth/2fa/disable', {
        current_password: password,
        new_password: password,
      })
      .then((r) => r.data),
  twoFactorVerify: (mfa_token: string, totp_code: string) =>
    api
      .post<LoginResponse>('/auth/2fa/verify', { mfa_token, totp_code })
      .then((r) => r.data),
};
