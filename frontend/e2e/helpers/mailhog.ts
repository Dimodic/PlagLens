/**
 * Mailhog HTTP API helper for E2E tests.
 *
 * Mailhog runs at http://localhost:8025. The v2 API returns JSON envelopes
 * including parsed Subject and Body.
 */
import { request, type APIRequestContext } from '@playwright/test';

export const MAILHOG_BASE_URL =
  process.env.E2E_MAILHOG_URL ?? 'http://localhost:8025';

export interface MailhogMessage {
  ID: string;
  From: { Mailbox: string; Domain: string };
  To: { Mailbox: string; Domain: string }[];
  Content: {
    Headers: Record<string, string[]>;
    Body: string;
  };
  Created: string;
}

export interface MailhogList {
  total: number;
  count: number;
  start: number;
  items: MailhogMessage[];
}

/**
 * Decode quoted-printable / 7bit body encoding lightly so subjects are
 * comparable. Mailhog returns raw subject in headers.
 */
export function getSubject(msg: MailhogMessage): string {
  const subject = msg.Content?.Headers?.['Subject']?.[0] ?? '';
  // Decode UTF-8 ?B? RFC 2047 if present (best-effort).
  return subject.replace(/=\?UTF-8\?B\?(.+?)\?=/gi, (_, b64) => {
    try {
      return Buffer.from(b64, 'base64').toString('utf-8');
    } catch {
      return _;
    }
  });
}

export function getRecipient(msg: MailhogMessage): string {
  const t = msg.To?.[0];
  return t ? `${t.Mailbox}@${t.Domain}` : '';
}

export class MailhogClient {
  constructor(private readonly ctx: APIRequestContext) {}

  static async create(): Promise<MailhogClient> {
    const ctx = await request.newContext({
      baseURL: MAILHOG_BASE_URL,
      ignoreHTTPSErrors: true,
    });
    return new MailhogClient(ctx);
  }

  /** Returns recent messages — newest first. */
  async list(): Promise<MailhogList> {
    const r = await this.ctx.get('/api/v2/messages');
    if (!r.ok()) {
      throw new Error(`Mailhog list failed: ${r.status()} ${await r.text()}`);
    }
    return r.json();
  }

  /** Search by To. */
  async findByRecipient(email: string): Promise<MailhogMessage[]> {
    const r = await this.ctx.get(
      `/api/v2/search?kind=to&query=${encodeURIComponent(email)}`,
    );
    if (!r.ok()) {
      throw new Error(`Mailhog search failed: ${r.status()}`);
    }
    const j = (await r.json()) as MailhogList;
    return j.items ?? [];
  }

  /** Search by subject substring (kind=containing in Mailhog). */
  async findBySubject(text: string): Promise<MailhogMessage[]> {
    const r = await this.ctx.get(
      `/api/v2/search?kind=containing&query=${encodeURIComponent(text)}`,
    );
    if (!r.ok()) {
      throw new Error(`Mailhog search failed: ${r.status()}`);
    }
    const j = (await r.json()) as MailhogList;
    return j.items ?? [];
  }

  /** Wait until a message satisfies predicate. */
  async waitFor(
    predicate: (msg: MailhogMessage) => boolean,
    opts: { timeout?: number; interval?: number } = {},
  ): Promise<MailhogMessage | null> {
    const timeout = opts.timeout ?? 10_000;
    const interval = opts.interval ?? 500;
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      try {
        const list = await this.list();
        const found = (list.items ?? []).find(predicate);
        if (found) return found;
      } catch {
        // ignore transient errors
      }
      await new Promise((res) => setTimeout(res, interval));
    }
    return null;
  }

  /** Delete all messages. */
  async clear(): Promise<void> {
    const r = await this.ctx.delete('/api/v1/messages');
    if (!r.ok() && r.status() !== 404) {
      throw new Error(`Mailhog clear failed: ${r.status()}`);
    }
  }

  async dispose(): Promise<void> {
    await this.ctx.dispose();
  }
}
