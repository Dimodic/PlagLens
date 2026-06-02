import { useCallback } from 'react';

/**
 * Toasts are disabled product-wide — every action surfaces its result inline
 * in the UI (updated lists, banners, inline ProblemAlert for errors), not as
 * a transient popup.
 *
 * The hook keeps its `{ success, error, info }` API so the existing call sites
 * across the app keep compiling; the methods are intentional no-ops. There's
 * no behavioural difference — calls can be removed lazily over time.
 */
export function useNotifications() {
  const noop = useCallback((_message?: string, _title?: string): void => {}, []);
  return { success: noop, error: noop, info: noop };
}
