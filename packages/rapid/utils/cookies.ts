/**
 * @fileoverview Cookie parsing + `Set-Cookie` serialization — the small
 * helpers behind `HTTPContext.cookies` / `setCookie` / `deleteCookie`.
 *
 * @module
 */

import { signHMAC, verifyHMAC } from '@tundralibs/crypt';
import {
  type CookieOptions as CompatCookieOptions,
  parseCookies as parseCookieHeader,
  serializeCookie as serializeSetCookie,
} from '@tundralibs/compat/http';
import { RapidError } from '../errors/mod.ts';

/**
 * Attributes for an outbound cookie (`Set-Cookie`) — compat's standard
 * attributes plus rapid's `signed`.
 */
export type CookieOptions = CompatCookieOptions & {
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
 * percent-decoded, compat's parser). NULL-PROTOTYPE, like every other
 * request-facing parser here: `ctx.cookies['toString']` for a cookie
 * never sent must be `undefined`, not the inherited Function.
 */
export const parseCookies = (
  header: string | null,
): Record<string, string> =>
  Object.assign(Object.create(null), parseCookieHeader(header));

/**
 * Serialize one `Set-Cookie` header value — compat's serializer (the
 * value is percent-encoded, so it can never inject `;`/CRLF), with its
 * `TypeError` translated to this package's error model. `signed` is a
 * rapid-level concern the caller resolves BEFORE serializing (the value
 * handed here is already the wire form).
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
  try {
    return serializeSetCookie(name, value, options);
  } catch (cause) {
    throw new RapidError('RAPID_RESPONSE_INVALID', {
      message: cause instanceof Error ? cause.message : String(cause),
      ...(cause instanceof Error ? { cause } : {}),
    });
  }
};
