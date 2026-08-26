/**
 * @fileoverview The five pact credential extractors — pure `(ctx) =>
 * PactCredential | null` functions bridging a request's headers to what
 * `Pact.authenticate()` checks. pact never parses transport itself (see
 * `PactCredential`'s own fileoverview); this is exactly that bridge.
 * Extraction never throws on malformed input — a presented-but-broken
 * credential (bad base64, missing colon, absent header) resolves to
 * `null` and the caller falls through to anonymous, the same
 * never-throw contract pact's own verification uses.
 *
 * @module
 */

import type { Pact, PactCredential, PactPrincipal } from '@tundralibs/pact';
import type { RapidContext } from '../../types/mod.ts';
import { escapeRegExp } from '../../utils/mod.ts';

/** The five pact schemes — mirrors {@link PactCredential}'s discriminant. */
export type PactScheme = PactCredential['scheme'];

/** A scheme's request-side extractor: request in, credential (or `null`) out. */
export type PactSchemeExtractor = (
  ctx: RapidContext,
) => (PactCredential | null) | Promise<PactCredential | null>;

/**
 * Runs after `next()`, only when THIS scheme authenticated the request —
 * the app's chance to sign or annotate the response. `pact` is the same
 * instance `authenticate()` resolved, so an HMAC responder can call
 * `pact.signAs(ctx.auth.keyId, …)` directly. rapid does not decide what
 * a response needs; it only provides the hook.
 */
export type PactSchemeResponder = (
  ctx: RapidContext,
  pact: Pact,
) => void | Promise<void>;

/** One configured scheme: its extractor, and an optional response-side hook. */
export type PactResolvedScheme = {
  extract: PactSchemeExtractor;
  respond?: PactSchemeResponder;
};

/** Options shared by the token-shaped schemes (BEARER/TOKEN). */
type PactTokenLikeOptions = {
  /** Header carrying the credential. @default 'authorization' */
  header?: string;
  /** Scheme prefix before the token. */
  prefix?: string;
  respond?: PactSchemeResponder;
};

/** Options for the `BEARER` scheme. */
export type PactBearerSchemeOptions = PactTokenLikeOptions;

/** Options for the `TOKEN` scheme. */
export type PactTokenSchemeOptions = PactTokenLikeOptions;

/** Options for the `BASIC` scheme. */
export type PactBasicSchemeOptions = {
  /** Header carrying the `Basic` credentials. @default 'authorization' */
  header?: string;
  respond?: PactSchemeResponder;
};

/** Options for the `APIKEY` scheme. */
export type PactApiKeySchemeOptions = {
  /** Header carrying the key id. @default 'x-api-key' */
  header?: string;
  /** Header carrying the key secret. @default 'x-api-secret' */
  secretHeader?: string;
  respond?: PactSchemeResponder;
};

/** Options for the `HMAC` scheme. */
export type PactHmacSchemeOptions = {
  /** Header carrying the key id. @default 'x-api-key' */
  header?: string;
  /** Header carrying the signature. @default 'x-signature' */
  signatureHeader?: string;
  /**
   * Build the exact bytes/string the caller signed — method, path,
   * headers, body, whatever your integration's contract is. There is no
   * universal HMAC canonicalization spec (AWS SigV4, GitHub's
   * raw-body-only, and Stripe's `timestamp.rawBody` are all mutually
   * incompatible shapes), so this stays app-owned rather than
   * framework-guessed.
   */
  canonical: (
    ctx: RapidContext,
  ) => string | Uint8Array | Promise<string | Uint8Array>;
  respond?: PactSchemeResponder;
};

/** Read a header across the transports that have one; `null` on JOB. */
function header(ctx: RapidContext, name: string): string | null {
  if (ctx.type === 'HTTP') return ctx.headers.get(name);
  if (ctx.type === 'SOCKET') return ctx.connection.headers.get(name);
  return null;
}

/** Base64 → UTF-8 string; `null` on malformed base64 OR invalid UTF-8 (never throws). */
function decodeBase64Utf8(value: string): string | null {
  try {
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** `Authorization: <prefix> <token>` → `{ scheme: 'BEARER', token }`. */
export function bearerExtractor(
  options: PactBearerSchemeOptions,
): PactSchemeExtractor {
  const headerName = options.header ?? 'authorization';
  const pattern = new RegExp(
    `^${escapeRegExp(options.prefix ?? 'Bearer')}\\s+(.+)$`,
    'i',
  );
  return (ctx) => {
    const value = header(ctx, headerName);
    if (value === null) return null;
    const match = pattern.exec(value.trim());
    return match ? { scheme: 'BEARER', token: match[1]! } : null;
  };
}

/** `Authorization: <prefix> <token>` → `{ scheme: 'TOKEN', token }`. */
export function tokenExtractor(
  options: PactTokenSchemeOptions,
): PactSchemeExtractor {
  const headerName = options.header ?? 'authorization';
  const pattern = new RegExp(
    `^${escapeRegExp(options.prefix ?? 'Token')}\\s+(.+)$`,
    'i',
  );
  return (ctx) => {
    const value = header(ctx, headerName);
    if (value === null) return null;
    const match = pattern.exec(value.trim());
    return match ? { scheme: 'TOKEN', token: match[1]! } : null;
  };
}

/** `Authorization: Basic <base64>` prefix pattern, built once (see bearer/token siblings). */
const BASIC_PATTERN = /^Basic\s+(.+)$/i;

/** `Authorization: Basic <base64(identifier:password)>` → `{ scheme: 'BASIC', … }`. */
export function basicExtractor(
  options: PactBasicSchemeOptions,
): PactSchemeExtractor {
  const headerName = options.header ?? 'authorization';
  return (ctx) => {
    const value = header(ctx, headerName);
    if (value === null) return null;
    const match = BASIC_PATTERN.exec(value.trim());
    if (!match) return null;
    const decoded = decodeBase64Utf8(match[1]!);
    if (decoded === null) return null;
    const colon = decoded.indexOf(':');
    if (colon < 0) return null;
    return {
      scheme: 'BASIC',
      identifier: decoded.slice(0, colon),
      password: decoded.slice(colon + 1),
    };
  };
}

/** `x-api-key` + `x-api-secret` headers → `{ scheme: 'APIKEY', keyId, secret }`. */
export function apiKeyExtractor(
  options: PactApiKeySchemeOptions,
): PactSchemeExtractor {
  const keyHeader = options.header ?? 'x-api-key';
  const secretHeader = options.secretHeader ?? 'x-api-secret';
  return (ctx) => {
    const keyId = header(ctx, keyHeader);
    if (keyId === null || keyId === '') return null;
    const secret = header(ctx, secretHeader);
    if (secret === null || secret === '') return null;
    return { scheme: 'APIKEY', keyId, secret };
  };
}

/**
 * `x-api-key` + a signature header → `{ scheme: 'HMAC', keyId, signature,
 * payload }`, `payload` built by `options.canonical`. The canonical
 * builder only runs once both headers are present, so a request with no
 * HMAC attempt never pays for it (and never has its body read for
 * nothing).
 */
export function hmacExtractor(
  options: PactHmacSchemeOptions,
): PactSchemeExtractor {
  const keyHeader = options.header ?? 'x-api-key';
  const sigHeader = options.signatureHeader ?? 'x-signature';
  return async (ctx) => {
    const keyId = header(ctx, keyHeader);
    if (keyId === null || keyId === '') return null;
    const signature = header(ctx, sigHeader);
    if (signature === null || signature === '') return null;
    const payload = await options.canonical(ctx);
    return { scheme: 'HMAC', keyId, signature, payload };
  };
}

/**
 * Build `ctx.auth` from a resolved principal plus the credential that
 * proved it: the principal (`id`/`grants`/`status`/`metadata`) is
 * ALWAYS included, plus `authMode` and whichever credential fields are
 * safe to expose — never a secret (`password`/`token`/`secret`/
 * `signature`/`payload`). `keyId` survives for APIKEY/HMAC since it is a
 * public identifier (like an AWS access-key id), not the secret itself,
 * and it's what an HMAC response-signing hook needs to call
 * `pact.signAs(keyId, …)`.
 */
export function sanitizeAuth(
  principal: PactPrincipal,
  credential: PactCredential,
): Record<string, unknown> {
  const authMode = credential.scheme;
  switch (credential.scheme) {
    case 'BASIC':
      return { ...principal, authMode, identifier: credential.identifier };
    case 'APIKEY':
    case 'HMAC':
      return { ...principal, authMode, keyId: credential.keyId };
    default:
      return { ...principal, authMode };
  }
}
