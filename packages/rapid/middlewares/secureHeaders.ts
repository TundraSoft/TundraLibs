/**
 * @fileoverview `secureHeaders` — response hardening for the HTTP
 * transport, helmet's default set: `nosniff`, frame denial, referrer
 * policy, cross-origin isolation policies (COOP/CORP, opt-in COEP),
 * origin-agent clustering, the legacy `X-*` constants, and opt-in
 * HSTS/CSP/Permissions-Policy (OFF by default — TLS usually terminates
 * upstream, and a policy must be written for the app). The
 * document-only policies (COOP, COEP, Origin-Agent-Cluster) are stamped
 * on the `ui` surface only; everything else on every HTTP response.
 * Other transports pass straight through.
 *
 * @module
 */

import { RapidError } from '../errors/mod.ts';
import type { RapidMiddleware } from '../types/mod.ts';
import { MIDDLEWARE_SCOPE } from './scope.ts';

/** HSTS default max-age — 180 days, helmet's long-standing default. */
const HSTS_DEFAULT_MAX_AGE = 15_552_000;
/** The preload list admits only policies of at least one year. */
const HSTS_PRELOAD_MIN_MAX_AGE = 31_536_000;
/** Permissions Policy feature name (an HTTP structured-field token). */
const FEATURE_NAME = /^[a-z][a-z0-9-]*$/;
/** Referrer Policy tokens (W3C Referrer Policy §4.1). */
const REFERRER_POLICIES = new Set([
  'no-referrer',
  'no-referrer-when-downgrade',
  'origin',
  'origin-when-cross-origin',
  'same-origin',
  'strict-origin',
  'strict-origin-when-cross-origin',
  'unsafe-url',
]);

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
   * `referrer-policy` value — one policy token, or a comma-separated
   * fallback list of them (the browser uses the last one it knows) — or
   * `false` to omit.
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
    /** Policy lifetime in SECONDS; `0` tells browsers to forget it. @default 15552000 */
    maxAge?: number;
    /** @default true */
    includeSubDomains?: boolean;
    /**
     * Add the `preload` token. The preload list only accepts a policy
     * with `maxAge` of at least one year and `includeSubDomains`, so
     * both are required here.
     * @default false
     */
    preload?: boolean;
  };
  /**
   * `content-security-policy` value, or `false` to omit.
   * @default false
   */
  contentSecurityPolicy?: string | false;
  /**
   * `cross-origin-opener-policy` — a document-only policy, stamped on
   * the `ui` surface. `'same-origin'` severs `window.opener`, which
   * breaks sign-in POPUP flows; use `'same-origin-allow-popups'` there.
   * @default 'same-origin'
   */
  crossOriginOpenerPolicy?:
    | 'same-origin'
    | 'same-origin-allow-popups'
    | 'unsafe-none'
    | false;
  /**
   * `cross-origin-resource-policy` — blocks no-cors cross-origin
   * embedding (`<img>`, `<script>`, fonts) of this response; CORS
   * `fetch` is unaffected. Assets embedded from another site need
   * `'same-site'` or `'cross-origin'`.
   * @default 'same-origin'
   */
  crossOriginResourcePolicy?:
    | 'same-origin'
    | 'same-site'
    | 'cross-origin'
    | false;
  /**
   * `cross-origin-embedder-policy` — a document-only policy, stamped on
   * the `ui` surface. OPT-IN: it breaks any page embedding third-party
   * resources that lack CORP/CORS headers.
   * @default false
   */
  crossOriginEmbedderPolicy?: 'require-corp' | 'credentialless' | false;
  /**
   * `origin-agent-cluster: ?1` — a document-only hint, stamped on the
   * `ui` surface.
   * @default true
   */
  originAgentCluster?: boolean;
  /**
   * `x-permitted-cross-domain-policies` (Flash/PDF cross-domain files).
   * @default 'none'
   */
  permittedCrossDomainPolicies?:
    | 'none'
    | 'master-only'
    | 'by-content-type'
    | 'all'
    | false;
  /**
   * `x-dns-prefetch-control`.
   * @default 'off'
   */
  dnsPrefetchControl?: 'off' | 'on' | false;
  /**
   * `x-xss-protection: 0` — disables the legacy browser auditor, which
   * was itself an XSS vector.
   * @default true
   */
  xssProtection?: boolean;
  /**
   * `permissions-policy`: a structured allowlist per feature —
   * `{ camera: [], geolocation: ['self'], fullscreen: ['self',
   * 'https://x.example'] }` serializes to `camera=(),
   * geolocation=(self), fullscreen=(self "https://x.example")`; `['*']`
   * allows everywhere — or a raw policy string, or `false` to omit.
   * @default false
   */
  permissionsPolicy?:
    | Readonly<Record<string, readonly string[]>>
    | string
    | false;
};

const ENUMS: Record<string, readonly string[]> = {
  frameOptions: ['DENY', 'SAMEORIGIN'],
  crossOriginOpenerPolicy: [
    'same-origin',
    'same-origin-allow-popups',
    'unsafe-none',
  ],
  crossOriginResourcePolicy: ['same-origin', 'same-site', 'cross-origin'],
  crossOriginEmbedderPolicy: ['require-corp', 'credentialless'],
  permittedCrossDomainPolicies: [
    'none',
    'master-only',
    'by-content-type',
    'all',
  ],
  dnsPrefetchControl: ['off', 'on'],
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
 * Serialize a structured Permissions Policy (W3C Permissions Policy
 * §7.1): `feature=(self "https://origin")`, `feature=()` to deny,
 * `feature=*` to allow everywhere.
 */
const serializePermissionsPolicy = (
  policy: Readonly<Record<string, readonly string[]>>,
): string =>
  Object.entries(policy).map(([feature, allow]) => {
    if (allow.includes('*')) return `${feature}=*`;
    const members = allow.map((m) => m === 'self' ? 'self' : `"${m}"`);
    return `${feature}=(${members.join(' ')})`;
  }).join(', ');

/**
 * Reject a value that would produce a malformed or ignored header.
 *
 * @throws {RapidError} RAPID_CONFIG — see {@link secureHeaders}.
 */
function validate(options: SecureHeadersOptions): void {
  const bad = (option: string, reason: string, value: unknown): never => {
    throw new RapidError('RAPID_CONFIG', {
      message: `secureHeaders ${option} ${reason}`,
      details: { [option]: value },
    });
  };
  for (const [option, allowed] of Object.entries(ENUMS)) {
    const value = (options as Record<string, unknown>)[option];
    if (
      value !== undefined && value !== false &&
      !allowed.includes(value as string)
    ) {
      bad(option, `must be one of ${allowed.join(', ')}, or false`, value);
    }
  }
  const referrer = options.referrerPolicy;
  if (typeof referrer === 'string') {
    const tokens = referrer.split(',').map((t) => t.trim());
    if (tokens.some((t) => !REFERRER_POLICIES.has(t))) {
      bad(
        'referrerPolicy',
        `must be Referrer Policy tokens (${[...REFERRER_POLICIES].join(', ')})`,
        referrer,
      );
    }
  }
  if (typeof options.hsts === 'object') {
    const { maxAge, includeSubDomains, preload } = options.hsts;
    if (maxAge !== undefined && (!Number.isInteger(maxAge) || maxAge < 0)) {
      bad(
        'hsts.maxAge',
        'must be a non-negative integer number of seconds',
        maxAge,
      );
    }
    if (preload === true) {
      const age = maxAge ?? HSTS_DEFAULT_MAX_AGE;
      if (age < HSTS_PRELOAD_MIN_MAX_AGE || includeSubDomains === false) {
        bad(
          'hsts.preload',
          `requires maxAge of at least ${HSTS_PRELOAD_MIN_MAX_AGE} seconds (one year) and includeSubDomains`,
          options.hsts,
        );
      }
    }
  }
  const csp = options.contentSecurityPolicy;
  if (typeof csp === 'string' && (csp.trim() === '' || /[\r\n\0]/.test(csp))) {
    bad('contentSecurityPolicy', 'must be a non-empty single-line policy', csp);
  }
  const pp = options.permissionsPolicy;
  if (typeof pp === 'string' && (pp.trim() === '' || /[\r\n\0]/.test(pp))) {
    bad('permissionsPolicy', 'must be a non-empty single-line policy', pp);
  } else if (typeof pp === 'object') {
    if (Object.keys(pp).length === 0) {
      bad('permissionsPolicy', 'must name at least one feature', pp);
    }
    for (const [feature, allow] of Object.entries(pp)) {
      if (!FEATURE_NAME.test(feature)) {
        bad(
          'permissionsPolicy',
          `feature '${feature}' is not a valid feature name`,
          feature,
        );
      }
      for (const member of allow) {
        if (
          member !== 'self' && member !== '*' && !isSerializedOrigin(member)
        ) {
          bad(
            'permissionsPolicy',
            `allowlist entries must be 'self', '*', or a serialized origin — '${feature}' has '${member}'`,
            member,
          );
        }
      }
    }
  }
}

/**
 * Build the hardening middleware. The header set is computed ONCE at
 * factory time and stamped BEFORE `next()` on every HTTP response —
 * error responses included (they are exactly the ones reflected into
 * odd contexts).
 *
 * The document-only policies (COOP, COEP, Origin-Agent-Cluster) go on
 * `ui`-surface responses only.
 *
 * @throws {RapidError} RAPID_CONFIG at build when an enum option holds
 *   a value outside its spec vocabulary, `referrerPolicy` is not made of
 *   spec tokens, `hsts.maxAge` is not a non-negative integer,
 *   `hsts.preload` lacks the one-year `maxAge` + `includeSubDomains` the
 *   preload list requires, `contentSecurityPolicy` / a string
 *   `permissionsPolicy` is empty or spans lines, or a structured
 *   `permissionsPolicy` names a bad feature or allowlist entry.
 */
export function secureHeaders(
  options: SecureHeadersOptions = {},
): RapidMiddleware {
  validate(options);
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
  const corp = options.crossOriginResourcePolicy ?? 'same-origin';
  if (corp !== false) headers.push(['cross-origin-resource-policy', corp]);
  const pcdp = options.permittedCrossDomainPolicies ?? 'none';
  if (pcdp !== false) headers.push(['x-permitted-cross-domain-policies', pcdp]);
  const dns = options.dnsPrefetchControl ?? 'off';
  if (dns !== false) headers.push(['x-dns-prefetch-control', dns]);
  if (options.xssProtection !== false) headers.push(['x-xss-protection', '0']);
  const pp = options.permissionsPolicy;
  if (pp !== undefined && pp !== false) {
    headers.push([
      'permissions-policy',
      typeof pp === 'string' ? pp : serializePermissionsPolicy(pp),
    ]);
  }
  // Document-only: meaningful on an HTML document, noise on JSON.
  const documentHeaders: [string, string][] = [];
  const coop = options.crossOriginOpenerPolicy ?? 'same-origin';
  if (coop !== false) {
    documentHeaders.push(['cross-origin-opener-policy', coop]);
  }
  const coep = options.crossOriginEmbedderPolicy ?? false;
  if (coep !== false) {
    documentHeaders.push(['cross-origin-embedder-policy', coep]);
  }
  if (options.originAgentCluster !== false) {
    documentHeaders.push(['origin-agent-cluster', '?1']);
  }

  const middleware: RapidMiddleware = async (ctx, next) => {
    if (ctx.type === 'HTTP') {
      for (const [name, value] of headers) ctx.setHeader(name, value);
      if (ctx.surface === 'ui') {
        for (const [name, value] of documentHeaders) ctx.setHeader(name, value);
      }
    }
    await next();
  };
  return Object.assign(middleware, { [MIDDLEWARE_SCOPE]: ['HTTP'] });
}
