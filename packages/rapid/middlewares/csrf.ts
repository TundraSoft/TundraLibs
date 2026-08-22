/**
 * @fileoverview `csrf()` — stateless CSRF protection via a SIGNED double-submit
 * cookie. Issues a signed token in a (JS-readable) cookie that the app mirrors
 * into a request header; on state-changing methods the sent token must equal
 * the cookie AND carry a valid `@tundralibs/crypt` HMAC signature, else 403.
 * No store needed. HTTP-only. `SameSite=Lax` cookies remain the first line —
 * this is defense-in-depth for the gaps (top-level navigations, older UAs).
 *
 * @module
 */
import { signHMAC, verifyHMAC } from '@tundralibs/crypt';
import { ulid } from '@tundralibs/id';
import { RapidError } from '../errors/mod.ts';
import type { RapidMiddleware } from '../types/mod.ts';

/** Options for {@link csrf}. */
export type CsrfOptions = {
  /** HMAC key that signs the token (via `@tundralibs/crypt`). */
  secret: string;
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

const issueToken = (secret: string): Promise<string> => {
  const nonce = ulid();
  return signHMAC(nonce, secret).then((mac) => `${nonce}.${mac}`);
};

const verifyToken = async (token: string, secret: string): Promise<boolean> => {
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return false;
  try {
    return await verifyHMAC(token.slice(0, dot), token.slice(dot + 1), secret);
  } catch {
    return false; // a malformed signature is invalid, never a 500
  }
};

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
 * app.use(csrf({ secret: env.CSRF_SECRET }));
 * // the client reads the `csrf` cookie and sends it back as `x-csrf-token`
 * ```
 */
export function csrf(options: CsrfOptions): RapidMiddleware {
  const cookieName = options.cookie ?? 'csrf';
  const headerName = options.header ?? 'x-csrf-token';
  const fieldName = options.field ?? '_csrf';

  return async (ctx, next) => {
    if (ctx.type !== 'HTTP') return await next();

    // Ensure the client holds a valid token to mirror back (issue once).
    let token = ctx.cookies[cookieName];
    if (!token || !(await verifyToken(token, options.secret))) {
      token = await issueToken(options.secret);
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
        !(await verifyToken(sent, options.secret))
      ) {
        throw new RapidError('RAPID_CSRF_INVALID', {
          message: 'CSRF token missing or invalid',
        });
      }
    }

    await next();
  };
}
