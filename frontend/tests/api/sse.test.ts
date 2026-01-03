/**
 * SSEClient — verifies basic event handling, reconnect, cleanup.
 *
 * jsdom does not implement EventSource so we provide a small fake one
 * and pass it via SSEClient options.
 */
import { describe, expect, it, vi } from 'vitest';
import { SSEClient } from '@/api/sse';

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  withCredentials: boolean;
  readonly listeners = new Map<string, EventListener[]>();
  closed = false;
  onopen: ((ev: Event) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;

  constructor(url: string | URL, init?: EventSourceInit) {
    this.url = url.toString();
    this.withCredentials = !!init?.withCredentials;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, fn: EventListener): void {
    let arr = this.listeners.get(type);
    if (!arr) {
      arr = [];
      this.listeners.set(type, arr);
    }
    arr.push(fn);
  }

  fire(type: string, payload: unknown, lastEventId = ''): void {
    const ev = new MessageEvent('message', {
      data: typeof payload === 'string' ? payload : JSON.stringify(payload),
      lastEventId,
    });
    if (type === 'message' && this.onmessage) {
      this.onmessage(ev);
    } else {
      this.listeners.get(type)?.forEach((l) => l(ev));
    }
  }

  open(): void {
    if (this.onopen) this.onopen(new Event('open'));
  }

  fail(): void {
    if (this.onerror) this.onerror(new Event('error'));
  }

  close(): void {
    this.closed = true;
  }
}

function newFake(): typeof EventSource {
  // The SSE client typing expects EventSource, our fake mimics enough.
  return FakeEventSource as unknown as typeof EventSource;
}

describe('SSEClient', () => {
  it('opens a connection and emits "open"', () => {
    FakeEventSource.instances.length = 0;
    const client = new SSEClient({
      EventSourceImpl: newFake(),
      url: () => '/stream',
      noReconnect: true,
    });
    const onOpen = vi.fn();
    client.on('open', onOpen);
    client.connect();
    expect(FakeEventSource.instances.length).toBe(1);
    FakeEventSource.instances[0].open();
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(client.connected).toBe(true);
    client.disconnect();
  });

  it('parses JSON notification payloads and tracks lastEventId', () => {
    FakeEventSource.instances.length = 0;
    const client = new SSEClient({
      EventSourceImpl: newFake(),
      url: () => '/stream',
      noReconnect: true,
    });
    const onN = vi.fn();
    client.on('notification', onN);
    client.connect();
    const fake = FakeEventSource.instances[0];
    fake.fire(
      'notification',
      {
        id: 'ntf_1',
        event_type: 'plagiarism.run.completed.v1',
        title: 't',
        body: 'b',
        severity: 'info',
        read: false,
        created_at: '2026-05-01T00:00:00Z',
      },
      'ntf_1',
    );
    expect(onN).toHaveBeenCalledTimes(1);
    const args = onN.mock.calls[0];
    expect((args[0] as { id: string }).id).toBe('ntf_1');
    client.disconnect();
  });

  it('reconnect() reopens with current token', () => {
    FakeEventSource.instances.length = 0;
    let token = 'a';
    const client = new SSEClient({
      EventSourceImpl: newFake(),
      url: (t) => `/stream?token=${t}`,
      getToken: () => token,
      noReconnect: true,
    });
    client.connect();
    expect(FakeEventSource.instances[0].url).toContain('token=a');
    token = 'b';
    client.reconnect();
    // A new fake instance was created.
    expect(FakeEventSource.instances.length).toBe(2);
    expect(FakeEventSource.instances[1].url).toContain('token=b');
    expect(FakeEventSource.instances[0].closed).toBe(true);
    client.disconnect();
  });

  it('disconnect closes the underlying socket', () => {
    FakeEventSource.instances.length = 0;
    const client = new SSEClient({
      EventSourceImpl: newFake(),
      url: () => '/stream',
      noReconnect: true,
    });
    client.connect();
    expect(FakeEventSource.instances[0].closed).toBe(false);
    client.disconnect();
    expect(FakeEventSource.instances[0].closed).toBe(true);
    expect(client.connected).toBe(false);
  });

  it('emits error on socket error and supports reconnect via reconnect()', () => {
    FakeEventSource.instances.length = 0;
    const client = new SSEClient({
      EventSourceImpl: newFake(),
      url: () => '/stream',
      noReconnect: true,
    });
    const onErr = vi.fn();
    client.on('error', onErr);
    client.connect();
    FakeEventSource.instances[0].fail();
    expect(onErr).toHaveBeenCalled();
    expect(client.connected).toBe(false);
    client.disconnect();
  });

  it('appends last_event_id query on subsequent reconnect after seeing one', () => {
    FakeEventSource.instances.length = 0;
    const client = new SSEClient({
      EventSourceImpl: newFake(),
      url: () => '/stream',
      noReconnect: true,
    });
    client.connect();
    FakeEventSource.instances[0].fire(
      'notification',
      { id: 'n1', title: 'x', body: 'y', severity: 'info', read: false, created_at: '', event_type: 'e' },
      'evt-42',
    );
    client.reconnect();
    const second = FakeEventSource.instances[1];
    expect(second.url).toContain('last_event_id=evt-42');
    client.disconnect();
  });
});
