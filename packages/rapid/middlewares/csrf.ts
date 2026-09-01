/**
 * @fileoverview `csrf()` — stateless CSRF protection via a SIGNED double-submit
 * cookie. Issues a signed token in a (JS-readable) cookie that the app mirrors
 * into a request header; on state-changing methods the sent token must equal
 * the cookie AND carry a valid `@tundralibs/crypt` HMAC signature, else 403.
 * No store needed. HTTP-only. `SameSite=Lax` cookies remain the first line —
 * this is defense-in-depth for the gaps (top-level navigations, older UAs).
 *
 * KNOWN LIMIT (accepted trade-off of the stateless design): the token is
 * signed but NOT bound to a session — an attacker who can PLANT a cookie
 * on the origin (a writable subdomain, "cookie tossing") can pair their
 * own validly-signed token with its header echo. `SameSite` plus
 * subdomain hygiene is the mitigation; where subdomains are untrusted,
 * bind the identity yourself (keep a copy of the token in the session at
 * issue time and compare in the handler).
 *
 * @module
 */
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
};

/** Methods that never mutate — CSRF is not enforced on them. */
const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

const issueToken = (secret: string): Promise<string> =>
  signValue(ulid(), secret);

/** A token is valid iff its signature verifies (malformed → invalid, never a 500). */
const verifyToken = async (token: string, secret: string): Promise<boolean> =>
  (await verifySignedValue(token, secret)) !== undefined;

/**
 * Stateless CSRF middleware (signed double-submit). Install after any body
 * parser is irrelevant — it reads `ctx.payload` (a cached promise) only as a
 * fallback when the header is absent, so header-based clients never trigger a
 * body parse.
 *
 * @throws {@link RapidError} `RAPID_CSRF_INVALID` (403) on a missing/mismatched
 *   /unsigned token for a state-changing method.
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

  return async (ctx, next) => {
    if (ctx.type !== 'HTTP') return await next();

    // Ensure the client holds a valid token to mirror back (issue once).
    const secret = ctx.app.secret;
    let token = ctx.cookies[cookieName];
    if (!token || !(await verifyToken(token, secret))) {
      token = await issueToken(secret);
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
        !(await verifyToken(sent, secret))
      ) {
        throw new RapidError('RAPID_CSRF_INVALID', {
          message: 'CSRF token missing or invalid',
        });
      }
    }

    await next();
  };
}
