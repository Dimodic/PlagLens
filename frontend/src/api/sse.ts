/**
 * SSE client for the Notification Service stream.
 * Wraps EventSource with auth token query param, Last-Event-ID resume,
 * heartbeat handling and exponential-backoff reconnect.
 *
 * Usage:
 *   const sse = new SSEClient({ getToken: () => tokenStore.get() });
 *   sse.on('notification', payload => …);
 *   sse.connect();
 *   …
 *   sse.disconnect();
 */
import { useEffect, useRef, useState } from 'react';
import { tokenStore } from './client';
import { notificationsApi, type NotificationItem } from './endpoints/notifications';

export type SSEEventName = 'notification' | 'heartbeat' | 'open' | 'error';

export interface SSEHandler<T = unknown> {
  (data: T, event: { id?: string; eventType: string }): void;
}

export interface SSEClientOptions {
  /** Returns latest access token (for query param). */
  getToken?: () => string | null;
  /** Override URL builder (for tests). */
  url?: (token: string | null) => string;
  /** Initial reconnect delay in ms. Default 1000. */
  initialDelayMs?: number;
  /** Max reconnect delay in ms. Default 30000. */
  maxDelayMs?: number;
  /** Optional EventSource constructor (for jsdom tests). */
  EventSourceImpl?: typeof EventSource;
  /** Skip auto-reconnect (mainly for tests). */
  noReconnect?: boolean;
}

export class SSEClient {
  private es: EventSource | null = null;
  private handlers: Map<string, Set<SSEHandler>> = new Map();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private currentDelay: number;
  private lastEventId: string | null = null;
  private closedByUser = false;
  private readonly getToken: () => string | null;
  private readonly buildUrl: (token: string | null) => string;
  private readonly initialDelay: number;
  private readonly maxDelay: number;
  private readonly EventSourceImpl: typeof EventSource;
  private readonly noReconnect: boolean;
  private _connected = false;

  constructor(opts: SSEClientOptions = {}) {
    this.getToken = opts.getToken ?? (() => tokenStore.get());
    this.buildUrl =
      opts.url ?? ((token) => notificationsApi.streamUrl(token ?? undefined));
    this.initialDelay = opts.initialDelayMs ?? 1000;
    this.maxDelay = opts.maxDelayMs ?? 30000;
    this.currentDelay = this.initialDelay;
    this.EventSourceImpl =
      opts.EventSourceImpl ??
      (typeof EventSource !== 'undefined'
        ? EventSource
        : (undefined as unknown as typeof EventSource));
    this.noReconnect = opts.noReconnect ?? false;
  }

  get connected(): boolean {
    return this._connected;
  }

  on<T = unknown>(event: string, handler: SSEHandler<T>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as SSEHandler);
    return () => set!.delete(handler as SSEHandler);
  }

  private emit(event: string, data: unknown, lastId?: string): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const h of set) {
      try {
        h(data, { id: lastId, eventType: event });
      } catch {
        /* swallow handler errors */
      }
    }
  }

  connect(): void {
    if (!this.EventSourceImpl) {
      // No EventSource available (SSR / unsupported browser).
      this.emit('error', new Error('EventSource not available'));
      return;
    }
    this.closedByUser = false;
    this.openConnection();
  }

  private openConnection(): void {
    this.cleanupSocket();
    const token = this.getToken();
    let url = this.buildUrl(token);
    if (this.lastEventId) {
      url +=
        (url.includes('?') ? '&' : '?') +
        'last_event_id=' +
        encodeURIComponent(this.lastEventId);
    }

    let es: EventSource;
    try {
      es = new this.EventSourceImpl(url, { withCredentials: true });
    } catch (err) {
      this.emit('error', err);
      this.scheduleReconnect();
      return;
    }
    this.es = es;

    es.onopen = () => {
      this._connected = true;
      this.currentDelay = this.initialDelay; // reset backoff
      this.emit('open', null);
    };

    es.onerror = (err) => {
      this._connected = false;
      this.emit('error', err);
      // EventSource auto-reconnects on error, but we add jitter + close+reopen
      // for explicit control of backoff.
      this.scheduleReconnect();
    };

    // Listener for `notification` events
    const onNotification = (ev: MessageEvent) => {
      this._connected = true;
      if (ev.lastEventId) this.lastEventId = ev.lastEventId;
      let payload: NotificationItem | null = null;
      try {
        payload = JSON.parse(ev.data) as NotificationItem;
      } catch {
        return;
      }
      this.emit('notification', payload, ev.lastEventId);
    };
    es.addEventListener('notification', onNotification as EventListener);

    const onHeartbeat = (ev: MessageEvent) => {
      this._connected = true;
      this.emit('heartbeat', ev.data);
    };
    es.addEventListener('heartbeat', onHeartbeat as EventListener);

    // Default unnamed message
    es.onmessage = (ev) => {
      this._connected = true;
      this.emit('notification', ev.data, ev.lastEventId);
    };
  }

  private scheduleReconnect(): void {
    if (this.closedByUser || this.noReconnect) return;
    if (this.reconnectTimer) return;
    this.cleanupSocket();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.currentDelay = Math.min(this.currentDelay * 2, this.maxDelay);
      this.openConnection();
    }, this.currentDelay);
  }

  reconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.currentDelay = this.initialDelay;
    this.openConnection();
  }

  disconnect(): void {
    this.closedByUser = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.cleanupSocket();
    this._connected = false;
  }

  private cleanupSocket(): void {
    if (this.es) {
      try {
        this.es.close();
      } catch {
        /* ignore */
      }
      this.es = null;
    }
  }
}

// -------------------- React hook --------------------

export interface UseSSEResult {
  lastNotification: NotificationItem | null;
  isConnected: boolean;
  reconnect: () => void;
}

export function useSSE(opts: { enabled?: boolean } = {}): UseSSEResult {
  const enabled = opts.enabled ?? true;
  const [lastNotification, setLast] = useState<NotificationItem | null>(null);
  const [isConnected, setConnected] = useState(false);
  const clientRef = useRef<SSEClient | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (typeof EventSource === 'undefined') return;

    const client = new SSEClient();
    clientRef.current = client;

    const offN = client.on<NotificationItem>('notification', (data) => {
      setLast(data);
    });
    const offOpen = client.on('open', () => setConnected(true));
    const offErr = client.on('error', () => setConnected(false));

    client.connect();

    return () => {
      offN();
      offOpen();
      offErr();
      client.disconnect();
      clientRef.current = null;
    };
  }, [enabled]);

  return {
    lastNotification,
    isConnected,
    reconnect: () => clientRef.current?.reconnect(),
  };
}
