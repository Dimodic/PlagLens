/**
 * Tiny HOTP/TOTP generator — RFC 6238 with default 30-s window, SHA-1, 6 digits.
 *
 * We avoid pulling in a runtime dep just to generate codes during 2FA tests.
 * The implementation matches what `otplib`/`speakeasy` would produce for the
 * same secret + timestamp. The backend uses the standard otpauth URI with
 * `period=30`, `digits=6`, `algorithm=SHA1`.
 */
import { createHmac } from 'node:crypto';

/** Decode RFC 4648 base32 string to bytes. Spaces and `=` padding are allowed. */
export function base32Decode(input: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const cleaned = input.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = '';
  for (const ch of cleaned) {
    const idx = alphabet.indexOf(ch);
    if (idx < 0) throw new Error(`Invalid base32 char: ${ch}`);
    bits += idx.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

/** Generate a 6-digit TOTP code for a base32 secret at the given timestamp. */
export function totp(secret: string, when: Date = new Date(), step = 30, digits = 6): string {
  const counter = Math.floor(when.getTime() / 1000 / step);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 0x1_0000_0000), 0);
  buf.writeUInt32BE(counter & 0xffffffff, 4);
  const hmac = createHmac('sha1', base32Decode(secret)).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (code % 10 ** digits).toString().padStart(digits, '0');
}
