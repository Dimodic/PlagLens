/**
 * usePersistedTabState — tab/view state that survives navigation.
 *
 * Plain ``useState`` resets to its default every time a page remounts,
 * so going Assignment → Plagiarism run → back dumps the user on the
 * default tab instead of where they actually were. This hook mirrors
 * the state into ``sessionStorage`` so it's restored on *every* return
 * path — breadcrumb click, browser back, sidebar nav, a fresh
 * ``<Link>`` — not just the ones that happen to preserve URL state.
 *
 * ``key`` must be stable per logical page + resource, e.g.
 * ``assignment:${id}`` or ``plagiarism-run:${runId}`` — so two
 * different assignments don't share one remembered tab. Scoped to
 * ``sessionStorage`` (cleared when the browser tab closes), not
 * ``localStorage``, so a remembered tab doesn't leak across sessions.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

const PREFIX = 'plaglens:tab:';

export function usePersistedTabState<T extends string>(
  key: string,
  defaultTab: T,
): [T, (next: T) => void] {
  const storageKey = `${PREFIX}${key}`;

  const read = useCallback((): T => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      return saved ? (saved as T) : defaultTab;
    } catch {
      // sessionStorage unavailable (private mode / disabled).
      return defaultTab;
    }
  }, [storageKey, defaultTab]);

  const [tab, setTabState] = useState<T>(read);

  // Re-sync when the storage key changes under us — same component
  // instance, different resource (e.g. navigating run A → run B
  // without a remount). Guarded on the key so a changing ``defaultTab``
  // (async role resolution) doesn't trigger a spurious reset.
  const keyRef = useRef(storageKey);
  useEffect(() => {
    if (keyRef.current !== storageKey) {
      keyRef.current = storageKey;
      setTabState(read());
    }
  }, [storageKey, read]);

  const setTab = useCallback(
    (next: T) => {
      setTabState(next);
      try {
        sessionStorage.setItem(storageKey, next);
      } catch {
        // Non-fatal — the tab just won't persist across navigation.
      }
    },
    [storageKey],
  );

  return [tab, setTab];
}

export default usePersistedTabState;
