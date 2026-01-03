import { useCallback } from 'react';
import { toast } from 'sonner';

/** Sonner's `toast.success(title, { id })` upserts by id — passing
 *  the same id for an identical message coalesces a stutter (e.g.
 *  React StrictMode re-invoking a handler, or two clicks landing in
 *  the same animation frame) into a single visible toast. */
function dedupeId(kind: string, title: string, message: string): string {
  // Cheap deterministic hash — sum of char codes is plenty for the
  // tiny key space (handful of toasts per minute).
  let h = 0;
  for (const s of [kind, title, message]) {
    for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return `${kind}:${(h >>> 0).toString(36)}`;
}

export function useNotifications() {
  const success = useCallback(
    (message: string, title = 'Готово') =>
      toast.success(title, {
        description: message,
        id: dedupeId('s', title, message),
      }),
    [],
  );
  const error = useCallback(
    (message: string, title = 'Ошибка') =>
      toast.error(title, {
        description: message,
        id: dedupeId('e', title, message),
      }),
    [],
  );
  const info = useCallback(
    (message: string, title = 'Информация') =>
      toast(title, {
        description: message,
        id: dedupeId('i', title, message),
      }),
    [],
  );
  return { success, error, info };
}
