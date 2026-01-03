/**
 * Axios HTTP client.
 *
 * Responsibilities:
 *  - inject Authorization header from in-memory access token
 *  - inject Idempotency-Key for POST when caller provides one
 *  - on 401 with code TOKEN_EXPIRED → call /auth/refresh once and retry
 *  - on other errors → parse Problem and surface as rejected promise
 */
import axios, {
  AxiosError,
  AxiosInstance,
  AxiosRequestConfig,
  InternalAxiosRequestConfig,
} from 'axios';
import { parseProblem } from './problem';
import type { Problem, RefreshResponse } from './types';
import { errorReporter } from '@/lib/errorReporter';

const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string) || '/api/v1';

// ---------- Token store (in-memory; refresh lives in httpOnly cookie) ----------
let accessToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export const tokenStore = {
  get: () => accessToken,
  set: (t: string | null) => {
    accessToken = t;
  },
  clear: () => {
    accessToken = null;
  },
};

export function setUnauthorizedHandler(fn: (() => void) | null): void {
  onUnauthorized = fn;
}

// ---------- Client factory (so tests can build their own) ----------
interface RetryConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
  _skipAuth?: boolean;
}

export function createApiClient(baseURL = BASE_URL): AxiosInstance {
  const client = axios.create({
    baseURL,
    withCredentials: true, // refresh cookie
    headers: { Accept: 'application/json' },
    timeout: 30_000,
  });

  // ----- request interceptor -----
  client.interceptors.request.use((config) => {
    const cfg = config as RetryConfig;
    if (!cfg._skipAuth && accessToken) {
      cfg.headers = cfg.headers ?? {};
      (cfg.headers as Record<string, string>).Authorization = `Bearer ${accessToken}`;
    }
    return cfg;
  });

  // ----- response interceptor (refresh on TOKEN_EXPIRED) -----
  let refreshInflight: Promise<string | null> | null = null;

  async function refreshToken(): Promise<string | null> {
    if (refreshInflight) return refreshInflight;
    refreshInflight = (async () => {
      try {
        const resp = await client.post<RefreshResponse>(
          '/auth/refresh',
          {},
          { _skipAuth: true } as AxiosRequestConfig,
        );
        accessToken = resp.data.access_token;
        return accessToken;
      } catch {
        accessToken = null;
        if (onUnauthorized) onUnauthorized();
        return null;
      } finally {
        refreshInflight = null;
      }
    })();
    return refreshInflight;
  }

  client.interceptors.response.use(
    (resp) => resp,
    async (error: AxiosError<Problem>) => {
      const original = error.config as RetryConfig | undefined;
      const status = error.response?.status;
      const code = error.response?.data?.code;

      // Try refresh once on TOKEN_EXPIRED.
      if (
        status === 401 &&
        code === 'TOKEN_EXPIRED' &&
        original &&
        !original._retry &&
        !original._skipAuth
      ) {
        original._retry = true;
        const newToken = await refreshToken();
        if (newToken) {
          original.headers = original.headers ?? {};
          (original.headers as Record<string, string>).Authorization = `Bearer ${newToken}`;
          return client.request(original);
        }
      }

      // Non-retryable 401 → notify host (logout).
      if (
        status === 401 &&
        code !== 'TWO_FACTOR_REQUIRED' &&
        !original?._skipAuth &&
        onUnauthorized
      ) {
        onUnauthorized();
      }

      // Report 4xx (≥400, except 401 which is routine token-refresh) and 5xx
      // to debug log. 404 IS reported — it usually means a broken link / missing
      // resource that the user actually hit. Skip the debug endpoint itself.
      const reqUrl = original?.url ?? '';
      const isDebugEndpoint = reqUrl.includes('/_debug/client-errors');
      if (
        !isDebugEndpoint &&
        status &&
        status >= 400 &&
        status !== 401 &&
        !original?._skipAuth
      ) {
        errorReporter.report(
          'network',
          `${original?.method?.toUpperCase() ?? 'REQ'} ${reqUrl} → ${status} ${code ?? ''}`.trim(),
          {
            extra: {
              status,
              code,
              method: original?.method,
              detail: error.response?.data?.detail,
            },
          },
        );
      }

      const problem = parseProblem(error);
      return Promise.reject(problem);
    },
  );

  return client;
}

export const api = createApiClient();
export default api;
