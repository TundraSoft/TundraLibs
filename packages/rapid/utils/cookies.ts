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

/**
 * What the MAC covers. With a `name` the signature is BOUND to that cookie
 * (`name\0value`), so a value signed under one name can never be replayed
 * under another; without it (a bare token, csrf) just the value.
 */
const signedInput = (value: string, name?: string): string =>
  name === undefined ? value : `${name}\0${value}`;

/**
 * Sign `value` with `secret`: the wire form is `value.<hmac>`. Pass the
 * cookie `name` for a cookie value (binding, see {@link verifySignedValue}).
 */
export const signValue = (
  value: string,
  secret: string,
  name?: string,
): Promise<string> =>
  signHMAC(signedInput(value, name), secret).then((mac) => `${value}.${mac}`);

/**
 * Verify a `value.<hmac>` wire form against `secret` (and the cookie `name`
 * it was signed under): the bare value when the signature holds — `''` is a
 * legitimate signed value — else `undefined`. A missing, unsigned, or
 * MALFORMED signature (crypt throws on bad encoding) is "not valid" — never
 * a 500, since the input is attacker-controlled.
 */
export const verifySignedValue = async (
  raw: string | undefined,
  secret: string,
  name?: string,
): Promise<string | undefined> => {
  if (raw === undefined) return undefined;
  const dot = raw.lastIndexOf('.');
  if (dot < 0) return undefined;
  const value = raw.slice(0, dot);
  try {
    return (await verifyHMAC(
        signedInput(value, name),
        raw.slice(dot + 1),
        secret,
      ))
      ? value
      : undefined;
  } catch {
    return undefined;
  }
};

/** Chrome / RFC 6265bis cap a cookie's lifetime at 400 days. */
const MAX_COOKIE_AGE_SECONDS = 400 * 24 * 60 * 60;

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
/** RFC 6265 cookie-name / RFC 9110 header-name token. */
const TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

/**
 * Validate a middleware's cookie configuration at BUILD time, so a
 * misconfiguration is a boot error rather than a 500 (or a cookie the
 * browser silently drops) on the first response: the name must be a
 * token, `path` must be absolute, `SameSite=None` requires `Secure`
 * (RFC 6265bis §5.4.7 — browsers reject it otherwise), and the
 * `__Host-` / `__Secure-` name prefixes carry their own requirements
 * (§4.1.3: `Secure`, and for `__Host-` also `Path=/`).
 *
 * @throws {RapidError} RAPID_CONFIG naming the offending option.
 */
export function assertCookieConfig(
  owner: string,
  name: string,
  options: { secure?: boolean; sameSite?: string; path?: string },
): void {
  const bad = (reason: string, details: Record<string, unknown>): never => {
    throw new RapidError('RAPID_CONFIG', {
      message: `${owner} cookie '${name}' ${reason}`,
      details,
    });
  };
  if (!TOKEN.test(name)) bad('is not a valid cookie name', { cookie: name });
  const secure = options.secure ?? true;
  const path = options.path ?? '/';
  if (!path.startsWith('/')) bad('path must start with /', { path });
  if (options.sameSite === 'None' && !secure) {
    bad('with SameSite=None must be Secure', { sameSite: 'None', secure });
  }
  if (name.startsWith('__Host-') && (!secure || path !== '/')) {
    bad('with the __Host- prefix must be Secure with path /', { secure, path });
  }
  if (name.startsWith('__Secure-') && !secure) {
    bad('with the __Secure- prefix must be Secure', { secure });
  }
}

/** True when `value` is an RFC 9110 token (a legal header or cookie name). */
export const isToken = (value: string): boolean => TOKEN.test(value);

export const serializeCookie = (
  name: string,
  value: string,
  options: CookieOptions = {},
): string => {
  const { maxAge } = options;
  if (
    maxAge !== undefined &&
    (!Number.isInteger(maxAge) || maxAge < 0 ||
      maxAge > MAX_COOKIE_AGE_SECONDS)
  ) {
    throw new RapidError('RAPID_RESPONSE_INVALID', {
      message:
        `cookie '${name}': maxAge must be an integer number of SECONDS from 0 to ${MAX_COOKIE_AGE_SECONDS} (400 days)`,
      details: { cookie: name, maxAge },
    });
  }
  try {
    return serializeSetCookie(name, value, options);
  } catch (cause) {
    throw new RapidError('RAPID_RESPONSE_INVALID', {
      message: cause instanceof Error ? cause.message : String(cause),
      ...(cause instanceof Error ? { cause } : {}),
    });
  }
};
