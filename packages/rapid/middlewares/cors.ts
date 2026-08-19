/**
 * @fileoverview `cors` — Cross-Origin Resource Sharing for the HTTP
 * transport: allow-origin resolution (list/predicate/wildcard),
 * credentials, and preflight short-circuiting. HTTP-scoped: other
 * transports pass straight through (and the scope metadata marks it
 * as never socket-reaching for the boot diagnostics).
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
import type { RapidMiddleware } from '../types/mod.ts';
import { MIDDLEWARE_SCOPE } from './scope.ts';

/** Preflight allow-methods default — the common REST verb set. */
const DEFAULT_METHODS = ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'];

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
   * Preflight `access-control-allow-headers`. Default REFLECTS the
   * request's `access-control-request-headers`.
   */
  allowedHeaders?: readonly string[];
  /** `access-control-expose-headers` on actual responses. */
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
  /** Preflight cache seconds (`access-control-max-age`). */
  maxAge?: number;
};

/**
 * Add `origin` to the response's `Vary` without clobbering whatever is
 * already there (and without listing it twice).
 */
function appendVaryOrigin(ctx: HTTPContext): void {
  const current = ctx.responseHeaders.get('vary');
  if (current === null || current.trim() === '') {
    ctx.setHeader('vary', 'origin');
    return;
  }
  const listed = current.split(',').some((part) =>
    part.trim().toLowerCase() === 'origin'
  );
  if (!listed) ctx.setHeader('vary', `${current}, origin`);
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
 */
export function cors(options: CorsOptions = {}): RapidMiddleware {
  const originConfig = options.origin ?? '*';
  const credentials = options.credentials ?? false;
  const methods = (options.methods ?? DEFAULT_METHODS).join(', ');

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
    appendVaryOrigin(http);
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
        const allowHeaders = options.allowedHeaders?.join(', ') ??
          http.headers.get('access-control-request-headers') ?? undefined;
        if (allowHeaders !== undefined) {
          http.setHeader('access-control-allow-headers', allowHeaders);
        }
        if (options.maxAge !== undefined) {
          http.setHeader('access-control-max-age', String(options.maxAge));
        }
      }
      ctx.response = { status: 204, content: '' };
      return;
    }

    if (allowed !== null && (options.exposedHeaders?.length ?? 0) > 0) {
      http.setHeader(
        'access-control-expose-headers',
        options.exposedHeaders!.join(', '),
      );
    }
    await next();
  };
  return Object.assign(middleware, { [MIDDLEWARE_SCOPE]: ['HTTP'] });
}
