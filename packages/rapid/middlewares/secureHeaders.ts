/**
 * @fileoverview `secureHeaders` — helmet-lite response hardening for
 * the HTTP transport: `nosniff`, frame denial, referrer policy, and
 * opt-in HSTS/CSP (both OFF by default — TLS usually terminates
 * upstream, and CSP rarely fits an API's responses). HTTP-scoped:
 * other transports pass straight through.
 *
 * @module
 */

import type { RapidMiddleware } from '../types/mod.ts';
import { MIDDLEWARE_SCOPE } from './scope.ts';

/** HSTS default max-age — 180 days, helmet's long-standing default. */
const HSTS_DEFAULT_MAX_AGE = 15_552_000;

/** Options for {@link secureHeaders}. */
export type SecureHeadersOptions = {
  /**
   * `x-content-type-options: nosniff`.
   * @default true
   */
  contentTypeOptions?: boolean;
  /**
   * `x-frame-options` value, or `false` to omit.
   * @default 'DENY'
   */
  frameOptions?: 'DENY' | 'SAMEORIGIN' | false;
  /**
   * `referrer-policy` value, or `false` to omit.
   * @default 'no-referrer'
   */
  referrerPolicy?: string | false;
  /**
   * `strict-transport-security`: `true` for the defaults (180 days,
   * includeSubDomains), an object to tune, `false`/absent to omit —
   * OPT-IN because HSTS on a service that also answers plain HTTP
   * locks browsers out for max-age seconds.
   * @default false
   */
  hsts?: boolean | {
    maxAge?: number;
    includeSubDomains?: boolean;
    preload?: boolean;
  };
  /**
   * `content-security-policy` value, or `false` to omit.
   * @default false
   */
  contentSecurityPolicy?: string | false;
};

/**
 * Build the hardening middleware. The header set is computed ONCE at
 * factory time and stamped BEFORE `next()` on every HTTP response —
 * error responses included (they are exactly the ones reflected into
 * odd contexts).
 */
export function secureHeaders(
  options: SecureHeadersOptions = {},
): RapidMiddleware {
  const headers: [string, string][] = [];
  if (options.contentTypeOptions !== false) {
    headers.push(['x-content-type-options', 'nosniff']);
  }
  const frame = options.frameOptions ?? 'DENY';
  if (frame !== false) headers.push(['x-frame-options', frame]);
  const referrer = options.referrerPolicy ?? 'no-referrer';
  if (referrer !== false) headers.push(['referrer-policy', referrer]);
  if (options.hsts !== undefined && options.hsts !== false) {
    const hsts = options.hsts === true ? {} : options.hsts;
    const parts = [`max-age=${hsts.maxAge ?? HSTS_DEFAULT_MAX_AGE}`];
    if (hsts.includeSubDomains !== false) parts.push('includeSubDomains');
    if (hsts.preload === true) parts.push('preload');
    headers.push(['strict-transport-security', parts.join('; ')]);
  }
  if (
    options.contentSecurityPolicy !== undefined &&
    options.contentSecurityPolicy !== false
  ) {
    headers.push(['content-security-policy', options.contentSecurityPolicy]);
  }

  const middleware: RapidMiddleware = async (ctx, next) => {
    if (ctx.type === 'HTTP') {
      for (const [name, value] of headers) ctx.setHeader(name, value);
    }
    await next();
  };
  return Object.assign(middleware, { [MIDDLEWARE_SCOPE]: ['HTTP'] });
}
