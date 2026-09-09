/**
 * @fileoverview Per-response CSRF token masking — the BREACH defence.
 *
 * A CSRF token is one value for the life of a session, and a page that
 * renders it next to attacker-reflected input inside a COMPRESSED body
 * leaks it byte by byte through response lengths (BREACH). Masking makes
 * the rendered form different on every response: a fresh random pad is
 * XORed over the token and both travel together, so no two responses
 * share bytes with the secret. The server unmasks before verifying; the
 * bare token (what the cookie holds and the swap runtime echoes) stays
 * valid too, so masking is transparent to clients.
 *
 * Wire form: `<hex pad>~<hex masked>` — `~` never occurs in a bare token
 * (ULID, hex and dots), so the two forms are unambiguous.
 *
 * @module
 */

/** The separator between pad and masked halves; absent from a bare token. */
const SEPARATOR = '~';

const HEX = /^[0-9a-f]*$/;

const toHex = (bytes: Uint8Array): string => {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
};

const fromHex = (hex: string): Uint8Array | undefined => {
  if (hex.length % 2 !== 0 || !HEX.test(hex)) return undefined;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
};

/**
 * Mask `token` under a fresh random pad — a different string on every
 * call, all of them verifying to the same token through {@link unmaskToken}.
 * For ASCII tokens only (rapid's are); a non-ASCII input is returned
 * unmasked rather than corrupted.
 */
export function maskToken(token: string): string {
  const bytes = new TextEncoder().encode(token);
  if (bytes.length !== token.length) return token; // not ASCII — leave bare
  const pad = crypto.getRandomValues(new Uint8Array(bytes.length));
  const masked = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) masked[i] = bytes[i]! ^ pad[i]!;
  return `${toHex(pad)}${SEPARATOR}${toHex(masked)}`;
}

/**
 * The bare token behind a masked value; a value without the separator is
 * already bare and is returned as-is. A malformed masked value (odd
 * length, non-hex, halves of different lengths) is `undefined` — invalid,
 * never a throw.
 */
export function unmaskToken(value: string): string | undefined {
  const at = value.indexOf(SEPARATOR);
  if (at === -1) return value;
  const pad = fromHex(value.slice(0, at));
  const masked = fromHex(value.slice(at + 1));
  if (pad === undefined || masked === undefined) return undefined;
  if (pad.length !== masked.length || pad.length === 0) return undefined;
  const bytes = new Uint8Array(pad.length);
  for (let i = 0; i < bytes.length; i++) bytes[i] = masked[i]! ^ pad[i]!;
  return new TextDecoder().decode(bytes);
}
