/**
 * Avatar initials — the SINGLE source of truth so the same person never shows
 * "NI" in one place and "NS" in another (the header and the profile used to
 * compute these differently). Takes the first letter of the first two words:
 * "Nikita Shamov" → "NS". Falls back to "U" for an empty / missing name.
 */
export function initials(name?: string | null): string {
  const parts = (name ?? '').split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  return parts
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('');
}
