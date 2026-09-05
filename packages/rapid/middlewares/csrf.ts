/**
 * @fileoverview `csrf()` — stateless CSRF protection via a SIGNED,
 * SESSION-BOUND double-submit cookie. Issues a signed token in a
 * (JS-readable) cookie that the app mirrors into a request header; on
 * state-changing methods the sent token must equal the cookie, carry a
 * valid `@tundralibs/crypt` HMAC signature, AND be bound to the current
 * session — else 403. No store needed. HTTP-only. `SameSite=Lax` cookies
 * remain the first line; this is defense-in-depth for the gaps.
 *
 * The binding closes cookie tossing: a token carries a keyed hash of the
 * session cookie it was issued under (anonymous = its own binding), so a
 * token an attacker PLANTED from a writable subdomain, minted under THEIR
 * session (or none), never verifies for a signed-in victim. The token
 * follows the session: when the binding no longer matches (login,
 * `regenerate()`, logout), the next response re-issues it.
 *
 * @module
 */
import { signHMAC } from '@tundralibs/crypt';
import { ulid } from '@tundralibs/id';
import { RapidError } from '../errors/mod.ts';
import type { RapidMiddleware } from '../types/mod.ts';
import { signValue, verifySignedValue } from '../utils/cookies.ts';

/** Options for {@link csrf}. The token is signed with the app `secret`. */
export type CsrfOptions = {
  /** Token cookie name (JS-readable so the app can echo it). @default 'csrf' */
  cookie?: string;
  /** Header the client echoes the token in. @default 'x-csrf-token' */
  header?: string;
  /** Form field checked when the header is absent. @default '_csrf' */
  field?: string;
  /** `SameSite` of the token cookie. @default 'Lax' */
  sameSite?: 'Strict' | 'Lax' | 'None';
  /** Set the cookie's `Secure` flag. @default true */
  secure?: boolean;
  /** Cookie path. @default '/' */
  path?: string;
  /**
   * The session-id cookie the token is BOUND to — `session()`'s cookie
   * name. A token verifies only for the session it was issued under
   * (no session cookie = the anonymous binding); a session change
   * re-issues it on the next response. Set this when `session()` was
   * configured with a renamed cookie. @default 'sid'
   */
  session?: string;
};

/** Methods that never mutate — CSRF is not enforced on them. */
const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Chars of the keyed session hash carried in the token (equality only). */
const BINDING_LENGTH = 32;

/**
 * The binding: a KEYED hash of the session cookie's raw value (`''` when
 * absent) — never the id itself, since the token cookie is JS-readable.
 */
const bindingOf = async (
  sid: string | undefined,
  secret: string,
): Promise<string> =>
  (await signHMAC(sid ?? '', secret)).slice(0, BINDING_LENGTH);

/** Wire form `<nonce>.<binding>.<sig>`. */
const issueToken = (binding: string, secret: string): Promise<string> =>
  signValue(`${ulid()}.${binding}`, secret);

/**
 * The token's bound part when its signature verifies, else `undefined`
 * (malformed → invalid, never a 500).
 */
const verifyToken = async (
  token: string,
  secret: string,
): Promise<string | undefined> => {
  const payload = await verifySignedValue(token, secret);
  if (payload === undefined) return undefined;
  const dot = payload.indexOf('.');
  return dot === -1 ? undefined : payload.slice(dot + 1);
};

/**
 * Stateless CSRF middleware (signed double-submit). Install after any body
 * parser is irrelevant — it reads `ctx.payload` (a cached promise) only as a
 * fallback when the header is absent, so header-based clients never trigger a
 * body parse.
 *
 * @throws {@link RapidError} `RAPID_CSRF_INVALID` (403) on a missing/mismatched
 *   /unsigned token — or one bound to another session — for a
 *   state-changing method.
 *
 * @example
 * ```ts ignore
 * // The token is signed with the app `secret` option — set that once.
 * app.use(csrf());
 * // the client reads the `csrf` cookie and sends it back as `x-csrf-token`
 * ```
 */
export function csrf(options: CsrfOptions = {}): RapidMiddleware {
  const cookieName = options.cookie ?? 'csrf';
  const headerName = options.header ?? 'x-csrf-token';
  const fieldName = options.field ?? '_csrf';
  const sessionCookie = options.session ?? 'sid';

  return async (ctx, next) => {
    if (ctx.type !== 'HTTP') return await next();

    // Ensure the client holds a valid token for THIS session to mirror
    // back: issue when absent, unsigned, or bound to another session
    // (login / regenerate / logout rotate the binding — the token follows).
    const secret = ctx.app.secret;
    const binding = await bindingOf(ctx.cookies[sessionCookie], secret);
    let token = ctx.cookies[cookieName];
    if (!token || (await verifyToken(token, secret)) !== binding) {
      token = await issueToken(binding, secret);
      ctx.setCookie(cookieName, token, {
        httpOnly: false, // the app's JS must read it to echo into the header
        secure: options.secure ?? true,
        sameSite: options.sameSite ?? 'Lax',
        path: options.path ?? '/',
      });
    }

    // Enforce on state-changing methods only.
    if (!SAFE.has(ctx.method)) {
      let sent = ctx.headers.get(headerName) ?? undefined;
      if (sent === undefined) {
        const body = await ctx.payload;
        if (body !== null && typeof body === 'object') {
          const v = (body as Record<string, unknown>)[fieldName];
          if (typeof v === 'string') sent = v;
        }
      }
      if (
        sent === undefined ||
        sent !== token ||
        (await verifyToken(sent, secret)) !== binding
      ) {
        throw new RapidError('RAPID_CSRF_INVALID', {
          message: 'CSRF token missing or invalid',
        });
      }
    }

    await next();
  };
}
