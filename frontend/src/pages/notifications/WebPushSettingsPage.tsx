/**
 * WebPushSettingsPage — VAPID subscribe / unsubscribe button.
 *
 * Uses Service Worker + PushManager. When unsupported (or in tests),
 * the button is disabled with an explanatory message.
 */
import { AlertCircle, BellRing, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Page, PageHeader } from '@/components/layout/Page';
import { notificationsApi } from '@/api/endpoints/notifications';
import {
  useWebPushSubscribe,
  useWebPushUnsubscribe,
} from '@/hooks/api/useNotificationsApi';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useNotifications } from '@/hooks/useNotifications';
import type { Problem } from '@/api/types';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

function urlBase64ToArrayBuffer(base64: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const safe = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(safe);
  const buf = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i += 1) view[i] = raw.charCodeAt(i);
  return buf;
}

export default function WebPushSettingsPage() {
  useDocumentTitle('Web Push');
  const subscribe = useWebPushSubscribe();
  const unsubscribe = useWebPushUnsubscribe();
  const notify = useNotifications();
  const [supported, setSupported] = useState(false);
  const [granted, setGranted] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | 'unknown'>('unknown');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ok =
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window;
    setSupported(ok);
    if (ok) {
      setPermission(Notification.permission);
      setGranted(Notification.permission === 'granted');
    }
  }, []);

  const handleSubscribe = async () => {
    if (!supported) return;
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') {
        notify.error('Разрешение на уведомления не выдано.');
        return;
      }
      const reg = await navigator.serviceWorker.register('/sw.js').catch(
        () => navigator.serviceWorker.ready,
      );
      const ready = await navigator.serviceWorker.ready;
      const { public_key } = await notificationsApi.vapidKey();
      const sub = await ready.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToArrayBuffer(public_key),
      });
      const json = sub.toJSON() as {
        endpoint: string;
        keys: { auth: string; p256dh: string };
      };
      await subscribe.mutateAsync({
        endpoint: json.endpoint,
        keys: json.keys,
        user_agent: navigator.userAgent,
      });
      setGranted(true);
      notify.success('Подписка включена.');
      // Quiet the unused-var lint warning.
      void reg;
    } catch (err) {
      const p = err as unknown as Problem;
      notify.error(p.title || 'Не удалось подписаться');
    } finally {
      setBusy(false);
    }
  };

  const handleUnsubscribe = async () => {
    setBusy(true);
    try {
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready.catch(() => null);
        const sub = await reg?.pushManager.getSubscription();
        if (sub) await sub.unsubscribe();
      }
      await unsubscribe.mutateAsync();
      setGranted(false);
      notify.success('Подписка отключена.');
    } catch (err) {
      const p = err as unknown as Problem;
      notify.error(p.title || 'Не удалось отписаться');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page width="narrow">
      <PageHeader title="Push-уведомления" />
      <div className="space-y-4">
          {!supported && (
            <Alert>
              <AlertCircle />
              <AlertTitle>Браузер не поддерживает Web Push</AlertTitle>
              <AlertDescription>
                Используйте in-app или email. Web Push требует Service Worker и
                PushManager.
              </AlertDescription>
            </Alert>
          )}

          <Card>
            <CardContent className="p-4">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <BellRing className="h-7 w-7" />
                  <div>
                    <p className="font-semibold">Состояние подписки</p>
                    <p className="text-sm text-muted-foreground">
                      Разрешение: <code>{permission}</code> · подписан:{' '}
                      {granted ? 'да' : 'нет'}
                    </p>
                  </div>
                </div>
                <div className="flex justify-end">
                  {granted ? (
                    <Button
                      variant="destructive"
                      onClick={handleUnsubscribe}
                      disabled={busy}
                      data-testid="unsubscribe-btn"
                    >
                      {busy && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Отписаться
                    </Button>
                  ) : (
                    <Button
                      onClick={handleSubscribe}
                      disabled={busy || !supported}
                      data-testid="subscribe-btn"
                    >
                      {busy && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Подписаться
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
    </Page>
  );
}
