/**
 * Stale-chunk recovery.
 *
 * Vite ships every route as a content-hashed code-split chunk. On each
 * deploy the hashes change and the old chunk files are gone from the
 * server. A browser still holding the previous `index.html` (in memory or
 * cached) will fail to fetch a not-yet-loaded route chunk → the native
 * "error loading dynamically imported module" — which otherwise surfaces as
 * a generic 500 page.
 *
 * Fix: when an import fails, reload once to pull the fresh index.html +
 * manifest. A timestamp guard (not a one-shot boolean) caps reloads to one
 * per cooldown so a genuinely-broken chunk can't tight-loop — yet a *new*
 * deploy later in the same session still recovers. The guard is cleared the
 * moment any route chunk loads successfully, so after a good reload the next
 * deploy recovers immediately too.
 */
const KEY = 'plaglens.stale_chunk_reload_at';
const COOLDOWN_MS = 10_000;

export function isChunkLoadError(err: unknown): boolean {
  const msg = (
    err instanceof Error ? err.message : String(err ?? '')
  ).toLowerCase();
  return (
    msg.includes('dynamically imported module') ||
    msg.includes('importing a module script failed') ||
    msg.includes('failed to fetch') ||
    msg.includes("'text/html' is not a valid javascript mime type") ||
    (msg.includes('chunk') && msg.includes('load'))
  );
}

/** Reload to fetch the fresh build, at most once per cooldown window.
 *  Returns true if a reload was triggered. */
export function reloadForStaleChunk(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last < COOLDOWN_MS) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* sessionStorage unavailable — fall through to a best-effort reload */
  }
  window.location.reload();
  return true;
}

/** Called once a route chunk loads OK — resets the loop guard so a later
 *  deploy's stale chunk recovers on the first failure again. */
export function clearStaleChunkGuard(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
