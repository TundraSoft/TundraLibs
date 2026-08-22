/**
 * @fileoverview Cookie parsing + `Set-Cookie` serialization — the small
 * helpers behind `HTTPContext.cookies` / `setCookie` / `deleteCookie`.
 *
 * @module
 */

import { signHMAC, verifyHMAC } from '@tundralibs/crypt';
import { RapidError } from '../errors/mod.ts';

/** Attributes for an outbound cookie (`Set-Cookie`). */
export type CookieOptions = {
  /** Lifetime in SECONDS (`Max-Age`). */
  maxAge?: number;
  /** Absolute expiry (`Expires`). */
  expires?: Date;
  /** @default not set (browser scopes to the request path). */
  path?: string;
  domain?: string;
  /** HTTPS-only. */
  secure?: boolean;
  /** Not readable from `document.cookie`. */
  httpOnly?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
  /**
   * Sign the value with the app `secret` (HMAC) so it is tamper-evident; read
   * it back with `ctx.signedCookie(name)`, which verifies and returns
   * `undefined` for a missing or forged signature. Wire form `value.sig`.
   */
  signed?: boolean;
};

/** Sign `value` with `secret`: the wire form is `value.<hmac>`. */
export const signValue = (value: string, secret: string): Promise<string> =>
  signHMAC(value, secret).then((mac) => `${value}.${mac}`);

/**
 * Verify a `value.<hmac>` wire form against `secret`: the bare value when the
 * signature holds, else `undefined`. A missing, unsigned, or MALFORMED
 * signature (crypt throws on bad encoding) is "not valid" — never a 500, since
 * the input is attacker-controlled.
 */
export const verifySignedValue = async (
  raw: string | undefined,
  secret: string,
): Promise<string | undefined> => {
  if (!raw) return undefined;
  const dot = raw.lastIndexOf('.');
  if (dot <= 0) return undefined;
  try {
    return (await verifyHMAC(raw.slice(0, dot), raw.slice(dot + 1), secret))
      ? raw.slice(0, dot)
      : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Parse a `Cookie` request header into a name → value map (values
 * percent-decoded). A malformed pair is skipped, never thrown.
 */
export const parseCookies = (
  header: string | null,
): Record<string, string> => {
  const out: Record<string, string> = {};
  if (header === null || header === '') return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const name = part.slice(0, eq).trim();
    if (name === '') continue;
    let value = part.slice(eq + 1).trim();
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    try {
      out[name] = decodeURIComponent(value);
    } catch {
      out[name] = value; // keep the raw value if it isn't valid encoding
    }
  }
  return out;
};

/**
 * Serialize one `Set-Cookie` header value. The value is
 * percent-encoded, so it can never inject `;`/CRLF into the header.
 *
 * @throws {@link RapidError} RAPID_RESPONSE_INVALID when `name` contains
 *   characters illegal in a cookie name (a separator/control char) — a server
 *   bug producing a broken header, surfaced loudly as a 500.
 */
export const serializeCookie = (
  name: string,
  value: string,
  options: CookieOptions = {},
): string => {
  if (!/^[\w!#$%&'*+.^`|~-]+$/.test(name)) {
    throw new RapidError('RAPID_RESPONSE_INVALID', {
      message: `Invalid cookie name: ${JSON.stringify(name)}`,
    });
  }
  let cookie = `${name}=${encodeURIComponent(value)}`;
  if (options.maxAge !== undefined) {
    cookie += `; Max-Age=${Math.floor(options.maxAge)}`;
  }
  if (options.expires !== undefined) {
    cookie += `; Expires=${options.expires.toUTCString()}`;
  }
  if (options.domain !== undefined) cookie += `; Domain=${options.domain}`;
  if (options.path !== undefined) cookie += `; Path=${options.path}`;
  if (options.secure === true) cookie += '; Secure';
  if (options.httpOnly === true) cookie += '; HttpOnly';
  if (options.sameSite !== undefined) {
    cookie += `; SameSite=${options.sameSite}`;
  }
  return cookie;
};
