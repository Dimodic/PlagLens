/**
 * Minimal i18n. Currently exposes a flat dictionary keyed by string ID.
 * Keep tiny — until product copy stabilizes, expand on demand.
 *
 * Reactive layer: useTranslation() returns a memoized t() bound to the current
 * locale held in React state. Components re-render when the locale flips.
 */
import { useCallback, useEffect, useState } from 'react';
import ru from './ru.json';
import en from './en.json';

const DEFAULT_LOCALE: 'ru' | 'en' = 'ru';

export type Locale = 'ru' | 'en';

type Dict = Record<string, string>;
const DICTS: Record<string, Dict> = { ru, en };

const STORAGE_KEY = 'pl_locale';

function readInitial(): Locale {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'ru' || v === 'en') return v;
  } catch {
    /* noop */
  }
  return (DEFAULT_LOCALE === 'en' ? 'en' : 'ru') as Locale;
}

let current: Locale = readInitial();

type Listener = (loc: Locale) => void;
const listeners = new Set<Listener>();

export function setLocale(loc: Locale): void {
  if (loc !== 'ru' && loc !== 'en') return;
  if (loc === current) return;
  current = loc;
  try {
    localStorage.setItem(STORAGE_KEY, loc);
  } catch {
    /* noop */
  }
  listeners.forEach((l) => l(loc));
  // Best-effort: persist the choice on the server so it survives across
  // devices. Fire-and-forget — UI is already updated, never block on this.
  // We avoid importing the axios client here to keep i18n leaf-level free of
  // app-specific axios bootstrap; instead, hit the same endpoint directly.
  void persistLocaleToServer(loc);
}

async function persistLocaleToServer(loc: Locale): Promise<void> {
  try {
    // Use the same auth scheme as the axios client (Bearer in-memory token).
    // Lazy import to avoid a circular dep between i18n ↔ api/client.
    const mod = await import('@/api/endpoints/users');
    await mod.usersApi.patchMe({ locale: loc });
  } catch {
    /* noop — locale already changed locally */
  }
}

export function getLocale(): Locale {
  return current;
}

export type TParams = Record<string, string | number>;

/**
 * Substitute ``{{name}}`` placeholders in a resolved string. No-op when
 * ``params`` is omitted, so static ``t('key')`` calls are unaffected.
 */
function interpolate(s: string, params?: TParams): string {
  if (!params) return s;
  return s.replace(/\{\{(\w+)\}\}/g, (m, k) =>
    k in params ? String(params[k]) : m,
  );
}

export function t(key: string, params?: TParams): string {
  const d = DICTS[current] ?? DICTS.ru;
  return interpolate(d[key] ?? DICTS.ru[key] ?? DICTS.en[key] ?? key, params);
}

/**
 * React hook — returns a reactive t() bound to the current locale.
 */
export function useTranslation(): {
  t: (key: string, params?: TParams) => string;
  locale: Locale;
  setLocale: (loc: Locale) => void;
} {
  const [locale, setLocaleState] = useState<Locale>(current);

  useEffect(() => {
    const onChange: Listener = (loc) => setLocaleState(loc);
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
    };
  }, []);

  const tFn = useCallback(
    (key: string, params?: TParams): string => {
      const d = DICTS[locale] ?? DICTS.ru;
      return interpolate(d[key] ?? DICTS.ru[key] ?? DICTS.en[key] ?? key, params);
    },
    [locale],
  );

  return { t: tFn, locale, setLocale };
}
