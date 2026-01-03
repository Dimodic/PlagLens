/**
 * Global keyboard shortcuts — port of the chord handler from
 * `PlagLens-design-src/src/app.jsx`.
 *
 *  g + c → /courses
 *  g + a → /me/assignments  (or current assignment when one is loaded)
 *  g + s → /me/submissions  (or similarity report when on a run)
 *  g + d → diff (no top-level URL — leaves a no-op when not in context)
 *  g + i → /me/exports (imports)
 *  ?     → opens the help modal (handled via a callback — opening it requires
 *          the shell to know which kind of modal is open).
 *  ⌘K / Ctrl+K → opens the global search palette (callback).
 *
 * The chord grace period is 800ms after the leader key.
 */
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

interface Options {
  onHelp?: () => void;
  onSearch?: () => void;
}

export function useKeyboardShortcuts(opts: Options = {}): void {
  const navigate = useNavigate();

  useEffect(() => {
    let leaderActive = false;
    let timer: number | null = null;

    const clearLeader = () => {
      leaderActive = false;
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    };

    const isInputTarget = (t: EventTarget | null): boolean => {
      if (!(t instanceof HTMLElement)) return false;
      const tag = t.tagName;
      return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        t.isContentEditable
      );
    };

    const onKey = (e: KeyboardEvent) => {
      // ⌘K / Ctrl+K opens the global search palette regardless of whether the
      // event target is an input — that's the whole point of a command palette.
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
        if (opts.onSearch) {
          e.preventDefault();
          opts.onSearch();
        }
        return;
      }
      if (isInputTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // Open help modal on '?' (Shift+/)
      if (e.key === '?' && opts.onHelp) {
        e.preventDefault();
        opts.onHelp();
        return;
      }

      if (!leaderActive) {
        if (e.key === 'g') {
          leaderActive = true;
          timer = window.setTimeout(clearLeader, 800);
        }
        return;
      }

      // Second key — resolve the chord.
      switch (e.key) {
        case 'c':
          navigate('/courses');
          break;
        case 'a':
          navigate('/me/assignments');
          break;
        case 's':
          navigate('/me/submissions');
          break;
        case 'd':
          // Diff has no canonical URL — fall back to similarity index.
          navigate('/reports');
          break;
        case 'i':
          navigate('/me/exports');
          break;
        case 'h':
          navigate('/');
          break;
        case 'o':
          navigate('/admin/overview');
          break;
        case 'u':
          navigate('/admin/users');
          break;
        case 'l':
          navigate('/admin/audit');
          break;
        default:
          // unknown — just clear the leader
          break;
      }
      clearLeader();
    };

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [navigate, opts.onHelp, opts.onSearch, opts]);
}
