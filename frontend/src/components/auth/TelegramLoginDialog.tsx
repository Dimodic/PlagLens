/**
 * TelegramLoginDialog — modal that hosts the official Telegram Login Widget.
 *
 * Telegram doesn't speak OAuth2. Instead it ships a JS widget that, when
 * clicked, opens an in-app confirmation on the user's Telegram account
 * and redirects the browser back to ``data-auth-url`` with the signed
 * payload. We host that widget inside a small modal so it sits behind
 * the same round monochrome icon as Google/Yandex/GitHub on LoginPage
 * — clicking the icon opens this dialog; clicking Telegram's blue
 * button inside the dialog kicks off the confirm-and-redirect.
 *
 * The widget itself is rendered by injecting the script
 * ``https://telegram.org/js/telegram-widget.js?22`` with ``data-*``
 * attributes (Telegram's documented integration mode). We pass:
 *
 *   - ``data-telegram-login`` — bot @username from BotFather
 *   - ``data-auth-url``       — absolute URL of our backend callback
 *   - ``data-request-access`` — "write" so the bot can DM later
 *   - ``data-size``           — "large" so the button is a primary CTA
 *
 * After the user confirms, Telegram redirects the top-level browser to
 * ``data-auth-url?id=…&hash=…``. Our identity service verifies the HMAC
 * and 302s to ``/?login=success`` with a refresh-cookie set — same
 * landing page as Google/Yandex OAuth.
 */
import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { telegramAuthApi, type TelegramBotInfo } from '@/api/endpoints/oauth';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Widget rendered inside the dialog. Encapsulated in a child component
// so we can control when the script tag is injected — once the dialog
// opens we inject; on close the parent unmounts us and the iframe is
// removed from the DOM (so the script doesn't keep listening for
// postMessage events).
function TelegramWidget({ info }: { info: TelegramBotInfo }) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    // Clean previous render (StrictMode double-mounts in dev).
    host.innerHTML = '';
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.setAttribute('data-telegram-login', info.bot_username ?? '');
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-userpic', 'false');
    script.setAttribute('data-radius', '10');
    script.setAttribute('data-request-access', 'write');
    // Redirect mode — Telegram navigates the top window to this URL
    // with the signed payload as query params. Our backend verifies
    // the HMAC and finishes the login.
    script.setAttribute('data-auth-url', info.redirect_uri);
    host.appendChild(script);
    return () => {
      // Tear down — remove the script + any iframe Telegram injected.
      host.innerHTML = '';
    };
  }, [info.bot_username, info.redirect_uri]);

  return (
    <div
      ref={hostRef}
      className="flex min-h-[56px] items-center justify-center"
      data-testid="telegram-widget-host"
    />
  );
}

export function TelegramLoginDialog({ open, onOpenChange }: Props) {
  const [info, setInfo] = useState<TelegramBotInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Defer the /info call to dialog-open time — there's no point in
  // sending a request from every visitor of /login if they never use
  // Telegram sign-in.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    telegramAuthApi
      .info()
      .then((data) => {
        if (cancelled) return;
        setInfo(data);
      })
      .catch(() => {
        if (cancelled) return;
        setError('Не удалось загрузить настройки Telegram-входа');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="telegram-login-dialog">
        <DialogHeader>
          <DialogTitle>Вход через Telegram</DialogTitle>
          <DialogDescription>
            Нажмите кнопку ниже — Telegram откроет подтверждение в приложении,
            после чего вы вернётесь сюда уже авторизованным.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-[120px] flex flex-col items-center justify-center gap-4 py-4">
          {loading && (
            <Loader2
              className="h-5 w-5 animate-spin text-muted-foreground"
              data-testid="telegram-login-loading"
            />
          )}
          {!loading && error && (
            <p className="text-sm text-destructive" data-testid="telegram-login-error">
              {error}
            </p>
          )}
          {!loading && !error && info && !info.enabled && (
            <p
              className="text-sm text-muted-foreground text-center max-w-xs"
              data-testid="telegram-login-disabled"
            >
              Администратор не настроил Telegram-вход для этого стенда.
              Попросите его указать <code className="font-mono">bot_username</code>{' '}
              и <code className="font-mono">bot_token</code> в админ-панели.
            </p>
          )}
          {!loading && !error && info?.enabled && <TelegramWidget info={info} />}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Закрыть
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default TelegramLoginDialog;
