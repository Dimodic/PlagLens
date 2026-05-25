/**
 * Programmatic Telegram Login — no on-page widget, no modal.
 *
 * Telegram ships ``telegram-widget.js`` which (besides drawing the blue
 * "Log in with Telegram" button via ``data-telegram-login``) exposes a
 * JS API ``window.Telegram.Login.auth(opts, callback)`` that takes a
 * numeric ``bot_id`` and opens Telegram's native confirm popup directly,
 * without injecting a button into the page.
 *
 * We use the JS API because it lets the existing round icon row on
 * /login stay visually consistent (Google / Yandex / GitHub / Telegram
 * all rendered as our own monochrome buttons), while preserving the
 * exact same trust/HMAC flow:
 *
 *   1. user clicks our Telegram icon
 *   2. we load the widget script (once) and call ``Telegram.Login.auth``
 *   3. Telegram opens its own popup, user confirms
 *   4. callback fires with ``{ id, first_name, …, hash }``
 *   5. we navigate the browser to our backend ``/auth/oauth/telegram/callback?…``
 *      with the same query-string Telegram would have used in
 *      redirect-mode. Backend verifies HMAC + sets refresh cookie.
 *
 * If the script fails to load or the user cancels the popup we surface
 * a notification via the caller; we don't throw, callers just don't
 * proceed.
 */

const SCRIPT_URL = 'https://telegram.org/js/telegram-widget.js?22';

interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

interface TelegramLoginApi {
  auth: (
    options: {
      bot_id: number;
      request_access?: 'write';
      embed?: number;
      lang?: string;
    },
    callback: (user: TelegramUser | false) => void,
  ) => void;
}

declare global {
  interface Window {
    Telegram?: {
      Login?: TelegramLoginApi;
    };
  }
}

let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (window.Telegram?.Login) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-telegram-login-script]',
    );
    if (existing) {
      // Some other call already started a load; wait for it.
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener(
        'error',
        () => reject(new Error('Telegram widget script failed to load')),
        { once: true },
      );
      return;
    }
    const s = document.createElement('script');
    s.async = true;
    s.src = SCRIPT_URL;
    s.dataset.telegramLoginScript = '1';
    s.onload = () => resolve();
    s.onerror = () =>
      reject(new Error('Telegram widget script failed to load'));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export interface OpenTelegramLoginOptions {
  /** Numeric bot id from ``/auth/oauth/telegram/info``. */
  bot_id: number;
  /** Absolute URL of our backend Telegram callback. */
  redirect_uri: string;
}

/**
 * Drive the whole Telegram-login flow from a user gesture.
 *
 * Returns ``true`` if the popup was opened (whether the user confirmed
 * or cancelled is up to the callback). Returns ``false`` if the script
 * couldn't load — caller surfaces an error notification.
 */
export async function openTelegramLogin(
  opts: OpenTelegramLoginOptions,
): Promise<boolean> {
  try {
    await loadScript();
  } catch {
    return false;
  }
  const api = window.Telegram?.Login;
  if (!api) return false;

  api.auth(
    { bot_id: opts.bot_id, request_access: 'write' },
    (user) => {
      // Cancelled / closed by user → nothing to do; the OAuth row on
      // /login simply stays as-is.
      if (!user) return;
      const params = new URLSearchParams();
      params.set('id', String(user.id));
      if (user.first_name) params.set('first_name', user.first_name);
      if (user.last_name) params.set('last_name', user.last_name);
      if (user.username) params.set('username', user.username);
      if (user.photo_url) params.set('photo_url', user.photo_url);
      params.set('auth_date', String(user.auth_date));
      params.set('hash', user.hash);
      // Identical surface to the redirect-mode widget would have used —
      // backend handler doesn't care which mode produced the request.
      window.location.href = `${opts.redirect_uri}?${params.toString()}`;
    },
  );
  return true;
}
