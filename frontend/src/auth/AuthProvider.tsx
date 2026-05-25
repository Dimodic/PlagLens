/**
 * AuthProvider — holds in-memory access token + current user.
 * On bootstrap tries POST /auth/refresh (refresh-token cookie auto-sent).
 *
 * Why context over global store: tightly tied to React render tree (router guards, layout user menu).
 */
import {
  createContext,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { authApi, type LoginRequest, type RegisterRequest } from '@/api/endpoints/auth';
import { setUnauthorizedHandler, tokenStore } from '@/api/client';
import type { CurrentUser } from '@/api/types';
import { setReporterRole } from '@/lib/errorReporter';

export type AuthStatus = 'loading' | 'anonymous' | 'authenticated';

export interface AuthContextValue {
  status: AuthStatus;
  user: CurrentUser | null;
  accessToken: string | null;
  /** Email + password (+ optional TOTP). Returns the LoginResponse, or throws Problem. */
  login: (req: LoginRequest) => Promise<{ requiresMfa: boolean; mfaToken?: string }>;
  register: (req: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<boolean>;
  reloadMe: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  const applyToken = useCallback((token: string | null) => {
    tokenStore.set(token);
    setAccessToken(token);
  }, []);

  const reloadMe = useCallback(async () => {
    try {
      const me = await authApi.me();
      setUser(me);
      setStatus('authenticated');
    } catch {
      setUser(null);
      applyToken(null);
      setStatus('anonymous');
    }
  }, [applyToken]);

  const refresh = useCallback(async (): Promise<boolean> => {
    try {
      const r = await authApi.refresh();
      applyToken(r.access_token);
      await reloadMe();
      return true;
    } catch {
      applyToken(null);
      setUser(null);
      setStatus('anonymous');
      return false;
    }
  }, [applyToken, reloadMe]);

  const login = useCallback<AuthContextValue['login']>(
    async (req) => {
      try {
        const resp = await authApi.login(req);
        applyToken(resp.access_token);
        await reloadMe();
        return { requiresMfa: false };
      } catch (problem) {
        const p = problem as { code?: string; mfa_token?: string };
        if (p?.code === 'TWO_FACTOR_REQUIRED') {
          return { requiresMfa: true, mfaToken: p.mfa_token };
        }
        throw problem;
      }
    },
    [applyToken, reloadMe],
  );

  const register = useCallback(async (req: RegisterRequest) => {
    await authApi.register(req);
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // ignore — server may already have killed the session
    }
    applyToken(null);
    setUser(null);
    setStatus('anonymous');
  }, [applyToken]);

  // Bootstrap: try refresh once on mount.
  //
  // Public paths (login / register / forgot / reset / verify / oauth
  // callback / demo) don't need a refresh — there's no protected page
  // to gate, and waiting on the network call adds 200-500 ms of empty
  // viewport before /login or /demo can render its form. Short-circuit
  // to 'anonymous' immediately for those paths and only attempt refresh
  // when the URL actually points into the protected shell.
  //
  // Exception: if the URL carries ``?login=success`` we just landed
  // from an OAuth callback that set the refresh cookie. We MUST call
  // refresh, even on a "public" path, otherwise the cookie sits unused
  // and the user sees the login screen again after authenticating.
  useEffect(() => {
    const path = window.location.pathname;
    const isOAuthLanding =
      new URLSearchParams(window.location.search).get('login') === 'success';
    const isPublic =
      path === '/login' ||
      path === '/register' ||
      path === '/demo' ||
      path.startsWith('/auth/');
    if (isPublic && !isOAuthLanding) {
      setStatus('anonymous');
      return;
    }
    let cancelled = false;
    (async () => {
      const ok = await refresh();
      if (cancelled) return;
      if (!ok) setStatus('anonymous');
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  // Wire client → context: when client gives up on auth, drop user.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      tokenStore.clear();
      setAccessToken(null);
      setUser(null);
      setStatus('anonymous');
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  // Tag client-error reports with the current user's global role so we can
  // tell apart errors hit by student / teacher / admin in the gateway log.
  useEffect(() => {
    const role = (user as CurrentUser & { global_role?: string } | null)?.global_role ?? null;
    setReporterRole(role);
  }, [user]);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, accessToken, login, register, logout, refresh, reloadMe }),
    [status, user, accessToken, login, register, logout, refresh, reloadMe],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
