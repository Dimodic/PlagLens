import dayjs from 'dayjs';

export function formatDate(d: string | Date | null | undefined): string {
  if (!d) return '—';
  return dayjs(d).format('DD.MM.YYYY');
}

export function formatDateTime(d: string | Date | null | undefined): string {
  if (!d) return '—';
  return dayjs(d).format('DD.MM.YYYY HH:mm');
}

export function formatRelative(d: string | Date | null | undefined): string {
  if (!d) return '—';
  return dayjs(d).fromNow();
}

export function formatBytes(bytes: number, digits = 1): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(digits)} ${units[i]}`;
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} с`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return rs ? `${m} мин ${rs} с` : `${m} мин`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h} ч ${rm} мин`;
}

/**
 * Display form of an internal entity id: drops the `prefix_` segment
 * (e.g. `usr_77b2e81c…` → `77b2e81c…`). DISPLAY-ONLY — the full prefixed id
 * stays the source of truth everywhere it's used as a key (routing, API
 * calls, data-attributes, copy targets). Returns the raw value unchanged
 * when there is no `_` prefix.
 */
export function shortId(id: string | null | undefined): string {
  if (!id) return '';
  const underscore = id.indexOf('_');
  return underscore >= 0 ? id.slice(underscore + 1) : id;
}
