/**
 * @fileoverview `cors` — Cross-Origin Resource Sharing for the HTTP
 * transport: allow-origin resolution (list/predicate/wildcard),
 * credentials, and preflight short-circuiting. HTTP-scoped: other
 * transports pass straight through.
 *
 * Standard CORS posture: a DISALLOWED origin is NOT an error — the
 * response simply carries no CORS headers and the BROWSER blocks it
 * (non-browser clients are never subject to CORS anyway).
 *
 * ⚠ `{ origin: '*', credentials: true }` is accepted and means
 * reflect-any-origin-with-credentials — see {@link CorsOptions.credentials}.
 *
 * @module
 */

import type { HTTPContext } from '../context/mod.ts';
import { RapidError } from '../errors/mod.ts';
import type { RapidMiddleware } from '../types/mod.ts';
import { MIDDLEWARE_SCOPE } from './scope.ts';

/** Preflight allow-methods default — the common REST verb set. */
const DEFAULT_METHODS = ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'];
/** RFC 9110 token — what a method or header name may be made of. */
const TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

/** Options for {@link cors}. */
export type CorsOptions = {
  /**
   * Allowed origins: `'*'` (any), an exact origin, a list, or a
   * predicate. With `credentials: true`, `'*'` echoes the caller's
   * origin instead (the spec forbids the literal wildcard there).
   * @default '*'
   */
  origin?: '*' | string | readonly string[] | ((origin: string) => boolean);
  /**
   * Preflight `access-control-allow-methods`.
   * @default GET, HEAD, PUT, PATCH, POST, DELETE
   */
  methods?: readonly string[];
  /**
   * Preflight `access-control-allow-headers`. Absent REFLECTS the
   * request's `access-control-request-headers` (and adds
   * `Vary: access-control-request-headers`); a fixed list is sent as
   * is; `[]` sends no allow-headers header at all.
   * @default reflected
   */
  allowedHeaders?: readonly string[];
  /**
   * `access-control-expose-headers` on actual responses — absent or `[]`
   * sends none.
   * @default none
   */
  exposedHeaders?: readonly string[];
  /**
   * Allow credentialed requests (cookies, Authorization).
   *
   * ⚠ `credentials: true` WITH `origin: '*'` means EVERY origin is
   * allowed to make credentialed cross-origin requests: the spec
   * forbids returning the literal `*` alongside credentials, so the
   * caller's own origin is echoed back instead — which is
   * reflect-anything, the classic CORS misconfiguration. It is
   * accepted here (it is what `'*'` literally asks for and some
   * internal tools rely on it) but it is almost never what a public
   * API wants: pair `credentials` with an explicit origin list or a
   * predicate instead.
   *
   * @default false
   */
  credentials?: boolean;
  /**
   * Preflight cache lifetime in SECONDS (`access-control-max-age`); a
   * non-negative integer. Browsers cap it themselves (Chromium at 7200,
   * Firefox at 86400), so larger values buy nothing.
   * @default unset — no `access-control-max-age` header
   */
  maxAge?: number;
};

/** A serialized origin: `scheme://host[:port]`, nothing else (RFC 6454). */
const isSerializedOrigin = (value: string): boolean => {
  try {
    return new URL(value).origin === value;
  } catch {
    return false;
  }
};

/**
 * Reject a malformed option at build.
 *
 * @throws {RapidError} RAPID_CONFIG — see {@link cors}.
 */
function validate(options: CorsOptions): void {
  const bad = (option: string, reason: string, value: unknown): never => {
    throw new RapidError('RAPID_CONFIG', {
      message: `cors ${option} ${reason}`,
      details: { [option]: value },
    });
  };
  const { origin, maxAge } = options;
  const origins = typeof origin === 'string' && origin !== '*'
    ? [origin]
    : Array.isArray(origin)
    ? origin
    : [];
  for (const value of origins) {
    if (!isSerializedOrigin(value)) {
      bad(
        'origin',
        'entries must be serialized origins (scheme://host[:port])',
        value,
      );
    }
  }
  if (Array.isArray(origin) && origin.length === 0) {
    bad(
      'origin',
      'list must not be empty — use a predicate to deny all',
      origin,
    );
  }
  if (maxAge !== undefined && (!Number.isInteger(maxAge) || maxAge < 0)) {
    bad('maxAge', 'must be a non-negative integer number of seconds', maxAge);
  }
  for (
    const [name, list] of [
      ['methods', options.methods],
      ['allowedHeaders', options.allowedHeaders],
      ['exposedHeaders', options.exposedHeaders],
    ] as const
  ) {
    if (list === undefined) continue;
    if (name === 'methods' && list.length === 0) {
      bad(name, 'must not be empty', list);
    }
    for (const value of list) {
      if (!TOKEN.test(value)) bad(name, 'entries must be HTTP tokens', value);
    }
  }
}

/**
 * Add `name` to the response's `Vary` without clobbering whatever is
 * already there (and without listing it twice).
 */
function appendVary(ctx: HTTPContext, name: string): void {
  const current = ctx.responseHeaders.get('vary');
  if (current === null || current.trim() === '') {
    ctx.setHeader('vary', name);
    return;
  }
  const listed = current.split(',').some((part) =>
    part.trim().toLowerCase() === name
  );
  if (!listed) ctx.setHeader('vary', `${current}, ${name}`);
}

/** The resolved allow-origin header value, or null when disallowed. */
function resolveOrigin(
  config: NonNullable<CorsOptions['origin']>,
  origin: string,
  credentials: boolean,
): string | null {
  if (config === '*') return credentials ? origin : '*';
  if (typeof config === 'string') return config === origin ? origin : null;
  if (typeof config === 'function') return config(origin) ? origin : null;
  return config.includes(origin) ? origin : null;
}

/**
 * Build the CORS middleware. Headers are stamped BEFORE `next()`, so
 * they survive the shared cycle's error overrides — a 429 or a 500 is
 * still readable by the browser client that triggered it. Preflights
 * (`OPTIONS` + `access-control-request-method`) are answered 204 and
 * SHORT-CIRCUITED — they never reach the router.
 *
 * @throws {RapidError} RAPID_CONFIG at build when an `origin` entry is not
 *   a serialized origin, the list is empty, `maxAge` is not a
 *   non-negative integer, `methods` is empty, or a `methods` /
 *   `allowedHeaders` / `exposedHeaders` entry is not an HTTP token.
 */
export function cors(options: CorsOptions = {}): RapidMiddleware {
  validate(options);
  const originConfig = options.origin ?? '*';
  const credentials = options.credentials ?? false;
  const methods = (options.methods ?? DEFAULT_METHODS).join(', ');
  const allowedHeaders = options.allowedHeaders?.join(', ');
  const exposedHeaders = options.exposedHeaders?.join(', ');

  const middleware: RapidMiddleware = async (ctx, next) => {
    if (ctx.type !== 'HTTP') return await next();
    const http: HTTPContext = ctx;
    const origin = http.headers.get('origin');
    // No Origin header → same-origin or non-browser → nothing to do.
    if (origin === null) return await next();

    const allowed = resolveOrigin(originConfig, origin, credentials);
    // Vary is stamped for EVERY origin-bearing request, allowed or
    // not: a disallowed origin gets a CORS-header-less response, and
    // without Vary a shared cache would serve that same response to an
    // allowed origin (and the reverse). Appended, never set, so an
    // app's own Vary (`accept-encoding`) survives.
    appendVary(http, 'origin');
    if (allowed !== null) {
      http.setHeader('access-control-allow-origin', allowed);
      if (credentials) {
        http.setHeader('access-control-allow-credentials', 'true');
      }
    }

    const requestMethod = http.headers.get('access-control-request-method');
    if (http.method === 'OPTIONS' && requestMethod !== null) {
      // Preflight — answered here, allowed or not (a disallowed one
      // simply carries no CORS headers; the browser does the rest).
      if (allowed !== null) {
        http.setHeader('access-control-allow-methods', methods);
        if (allowedHeaders === undefined) {
          // Reflected, so the answer varies by what was asked (a cache
          // must not replay one preflight's allow-list for another).
          appendVary(http, 'access-control-request-headers');
          const requested = http.headers.get('access-control-request-headers');
          if (requested !== null) {
            http.setHeader('access-control-allow-headers', requested);
          }
        } else if (allowedHeaders !== '') {
          http.setHeader('access-control-allow-headers', allowedHeaders);
        }
        if (options.maxAge !== undefined) {
          http.setHeader('access-control-max-age', String(options.maxAge));
        }
      }
      ctx.response = { status: 204, content: '' };
      return;
    }

    if (
      allowed !== null && exposedHeaders !== undefined && exposedHeaders !== ''
    ) {
      http.setHeader('access-control-expose-headers', exposedHeaders);
    }
    await next();
  };
  return Object.assign(middleware, { [MIDDLEWARE_SCOPE]: ['HTTP'] });
}
