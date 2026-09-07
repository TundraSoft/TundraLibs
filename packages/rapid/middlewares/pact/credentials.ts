/**
 * @fileoverview Credential extraction for the pact adapter: pact's own
 * `Authorization` carriers (through `@tundralibs/pact/middleware`'s
 * `extractCredential`) plus the transport-side forms pact deliberately
 * leaves to the framework — a configurable Bearer prefix, a
 * cookie-carried session token (browser UIs), split API-key headers,
 * and HMAC over a canonical string built from the rapid context (async,
 * so it may hash the body).
 *
 * @module
 */

import type { PactCredential } from '@tundralibs/pact';
import { extractCredential } from '@tundralibs/pact/middleware';
import type { HTTPContext, SOCKETContext } from '../../context/mod.ts';
import type { RapidContextState } from '../../types/mod.ts';
import { parseCookies } from '../../utils/cookies.ts';

/** One of pact's credential schemes. */
export type PactScheme = PactCredential['scheme'];

/** The context an HMAC `canonical` builder receives (HTTP or a socket frame). */
export type PactAuthContextArg =
  | HTTPContext<RapidContextState>
  | SOCKETContext<RapidContextState>;

/** Options for `pactAuth()` — the wire contract both middlewares share. */
export type PactAuthOptions = {
  /**
   * Schemes accepted. A presented credential of another scheme counts as
   * absent.
   * @default ['BEARER', 'BASIC', 'APIKEY'] (plus 'HMAC' when `hmac` is set)
   */
  schemes?: readonly PactScheme[];
  /**
   * `true`: a request with NO credential continues anonymous (`ctx.auth`
   * unset — `authorize()` still rejects it). `false`: it is a 401. A
   * credential that IS presented is always verified and fails with 401
   * when invalid, whatever this says.
   * @default true
   */
  optional?: boolean;
  /** Bearer carriers. */
  bearer?: {
    /**
     * The `Authorization` scheme word. A custom prefix REPLACES `Bearer`.
     * @default 'Bearer'
     */
    prefix?: string;
    /**
     * A cookie carrying the session token — how a browser UI presents the
     * token `login({ cookie })` set. Read when no `Authorization` header
     * is present; on a socket frame, from the upgrade request's cookies.
     */
    cookie?: string;
  };
  /**
   * Split API-key headers, in addition to pact's
   * `Authorization: ApiKey <keyId>:<secret>`. Setting `{}` enables the
   * defaults.
   */
  apiKey?: {
    /** @default 'x-api-key' */
    header?: string;
    /** @default 'x-api-secret' */
    secretHeader?: string;
  };
  /**
   * Enables HMAC. `canonical` returns the exact string the caller signed
   * — the contract between your clients and this server, so there is no
   * default (pact verifies the hex signature over it with the key's
   * secret). It receives the rapid context, so it may read `ctx.path`,
   * `ctx.method`, headers, and `await ctx.payload` for a body hash.
   */
  hmac?: {
    /** @default 'x-key-id' */
    keyHeader?: string;
    /** @default 'x-signature' */
    signatureHeader?: string;
    canonical: (ctx: PactAuthContextArg) => string | Promise<string>;
  };
  /**
   * Send `WWW-Authenticate` (one challenge per accepted scheme) on every
   * 401 the two middlewares raise.
   * @default true
   */
  challenge?: boolean;
  /** The `realm` parameter of those challenges. Omitted when unset. */
  realm?: string;
};

const DEFAULT_SCHEMES: readonly PactScheme[] = ['BEARER', 'BASIC', 'APIKEY'];

/** The accepted schemes as a set (HMAC joins only when configured). */
export function resolveSchemes(
  options: PactAuthOptions,
): ReadonlySet<PactScheme> {
  return new Set(
    options.schemes ??
      (options.hmac === undefined
        ? DEFAULT_SCHEMES
        : [...DEFAULT_SCHEMES, 'HMAC']),
  );
}

/** The scheme words a `WWW-Authenticate` challenge uses. */
const CHALLENGE_NAME: Record<PactScheme, string> = {
  BEARER: 'Bearer',
  BASIC: 'Basic',
  APIKEY: 'ApiKey',
  HMAC: 'HMAC',
};

/** The `WWW-Authenticate` value: one challenge per scheme (RFC 7235). */
export function challengeFor(
  schemes: ReadonlySet<PactScheme>,
  realm: string | undefined,
): string {
  const param = realm === undefined
    ? ''
    : ` realm="${realm.replace(/["\\]/g, '')}"`;
  return [...schemes].map((s) => `${CHALLENGE_NAME[s]}${param}`).join(', ');
}

/**
 * The credential a request presents, or `null` for none. Order: the
 * `Authorization` header (custom Bearer prefix first, then pact's standard
 * carriers), then the split API-key headers, then HMAC, then the bearer
 * cookie. A malformed carrier is `null`, never a throw.
 */
export async function extractCredentialFrom(
  ctx: PactAuthContextArg,
  headers: Headers,
  options: PactAuthOptions,
  schemes: ReadonlySet<PactScheme> = resolveSchemes(options),
): Promise<PactCredential | null> {
  const prefix = options.bearer?.prefix ?? 'Bearer';
  const authorization = headers.get('authorization');
  if (authorization !== null) {
    if (schemes.has('BEARER') && authorization.startsWith(`${prefix} `)) {
      const token = authorization.slice(prefix.length + 1).trim();
      return token === '' ? null : { scheme: 'BEARER', token };
    }
    // pact's standard carriers — minus Bearer when a custom prefix
    // replaced it, and never HMAC (that is header-borne, below).
    return extractCredential(
      {
        method: ctx.type === 'HTTP' ? ctx.method : 'SOCKET',
        path: ctx.type === 'HTTP' ? ctx.path : '',
        header: (name) => headers.get(name),
      },
      {
        schemes: [...schemes].filter((s) =>
          s !== 'HMAC' && (s !== 'BEARER' || prefix === 'Bearer')
        ),
      },
    );
  }
  if (schemes.has('APIKEY') && options.apiKey !== undefined) {
    const keyId = headers.get(options.apiKey.header ?? 'x-api-key');
    const secret = headers.get(options.apiKey.secretHeader ?? 'x-api-secret');
    if (keyId !== null && secret !== null) {
      return { scheme: 'APIKEY', keyId, secret };
    }
  }
  if (schemes.has('HMAC') && options.hmac !== undefined) {
    const keyId = headers.get(options.hmac.keyHeader ?? 'x-key-id');
    const signature = headers.get(
      options.hmac.signatureHeader ?? 'x-signature',
    );
    if (keyId !== null && signature !== null) {
      return {
        scheme: 'HMAC',
        keyId,
        signature,
        payload: await options.hmac.canonical(ctx),
      };
    }
  }
  if (schemes.has('BEARER') && options.bearer?.cookie !== undefined) {
    const token = parseCookies(headers.get('cookie'))[options.bearer.cookie];
    if (token !== undefined && token !== '') return { scheme: 'BEARER', token };
  }
  return null;
}
