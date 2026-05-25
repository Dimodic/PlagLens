/**
 * Small helpers around `CurrentUser` so every avatar dropdown / profile
 * row that wants to show "who is this user" agrees on the answer.
 *
 * Telegram-only accounts come with a synthetic email
 * ``tg-<id>@telegram.plaglens.local`` we mint to satisfy a NOT NULL
 * column. Surfacing it as the user's email is confusing — there's no
 * mailbox there, no SMTP path, no way to reset a password through it.
 * The backend now flags those rows as ``email_is_placeholder=true`` and
 * exposes a Telegram-derived ``external_handle`` (the @-username, or
 * the first/last name if the user has none). We use that handle as the
 * visible identifier wherever the email used to live.
 */
import type { CurrentUser } from '@/api/types';

/** A short, non-empty label suitable for the avatar dropdown subtitle.
 *
 *   - Telegram-only user with @username  →  ``@maxsmirnov``
 *   - Telegram-only user without one     →  display_name, or null
 *   - Regular user                       →  email
 *
 * ``null`` means "don't render a second line at all".
 */
export function userSecondaryLabel(user: CurrentUser | null): string | null {
  if (!user) return null;
  if (user.email_is_placeholder) {
    if (user.external_handle) return `@${user.external_handle}`;
    // Some Telegram users have neither @username nor a real email — fall
    // back to nothing, the display_name above is identifier enough.
    return null;
  }
  return user.email;
}

/** Email value to show on /me/profile inside the disabled <input>. For
 *  Telegram placeholders this is the empty string so the input renders
 *  with the placeholder hint instead of the technical tg-…@… address. */
export function profileEmailDisplay(user: CurrentUser | null): string {
  if (!user) return '';
  if (user.email_is_placeholder) return '';
  return user.email;
}

/** Hint text shown under the Email notification toggle on /me/profile.
 *  Real email → the address. Synthetic Telegram email → instructions. */
export function emailChannelHint(user: CurrentUser | null): string | undefined {
  if (!user) return undefined;
  if (user.email_is_placeholder) {
    return 'Реальный email не привязан — уведомления по почте не пойдут';
  }
  return user.email;
}
