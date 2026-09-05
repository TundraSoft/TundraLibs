/**
 * @fileoverview Framework-neutral middleware core: credential extraction
 * from headers and the PactError → HTTP status mapping. The per-framework
 * adapters (express, fastify, oak, hono) are thin glue over these two
 * functions — an adapter for any other stack is a few lines on top.
 *
 * @module
 */
import type {
  PactMiddlewareOptions,
  PactMiddlewareRequest,
} from './types/mod.ts';
import type { PactCredential } from '../types/mod.ts';
import { PACT_AUTH_FAILURE_CODES, PactError } from '../errors/mod.ts';

/** Schemes accepted when `options.schemes` is not given (HMAC joins
 * them only when `options.hmac` is configured). */
export const DEFAULT_SCHEMES: readonly PactCredential['scheme'][] = [
  'BEARER',
  'BASIC',
  'APIKEY',
];

/**
 * Extract one {@link PactCredential} from a request, or null when none
 * is presented. Recognized carriers:
 *
 * - `Authorization: Bearer <token>` → BEARER
 * - `Authorization: Basic <base64 id:password>` → BASIC
 * - `Authorization: ApiKey <keyId>:<secret>` → APIKEY
 * - `x-key-id` + `x-signature` headers → HMAC, only when `options.hmac`
 *   provides the canonicalization contract
 *
 * A malformed carrier (undecodable base64, missing halves) and a scheme
 * excluded by `options.schemes` both return null — the adapter then
 * rejects with 401 or continues, per `options.optional`.
 */
export function extractCredential(
  req: PactMiddlewareRequest,
  options?: PactMiddlewareOptions,
): PactCredential | null {
  const schemes = options?.schemes ??
    (options?.hmac === undefined
      ? DEFAULT_SCHEMES
      : [...DEFAULT_SCHEMES, 'HMAC']);
  const allowed = new Set(schemes);
  const auth = req.header('authorization');
  if (auth !== null) {
    if (allowed.has('BEARER') && auth.startsWith('Bearer ')) {
      return { scheme: 'BEARER', token: auth.slice(7) };
    }
    if (allowed.has('BASIC') && auth.startsWith('Basic ')) {
      let decoded: string;
      try {
        decoded = atob(auth.slice(6));
      } catch {
        return null;
      }
      const separator = decoded.indexOf(':');
      if (separator === -1) return null;
      return {
        scheme: 'BASIC',
        identifier: decoded.slice(0, separator),
        password: decoded.slice(separator + 1),
      };
    }
    if (allowed.has('APIKEY') && auth.startsWith('ApiKey ')) {
      const separator = auth.indexOf(':', 7);
      if (separator === -1) return null;
      return {
        scheme: 'APIKEY',
        keyId: auth.slice(7, separator),
        secret: auth.slice(separator + 1),
      };
    }
    return null;
  }
  if (allowed.has('HMAC') && options?.hmac !== undefined) {
    const keyId = req.header('x-key-id');
    const signature = req.header('x-signature');
    if (keyId !== null && signature !== null) {
      return {
        scheme: 'HMAC',
        keyId,
        signature,
        payload: options.hmac.canonical(req),
      };
    }
  }
  return null;
}

/**
 * Map a thrown error to the HTTP response an auth boundary should send:
 * authentication failures (`PACT_AUTH_FAILURE_CODES`) are 401,
 * `PERMISSION_DENIED` is 403, `USER_EXISTS` is 409, any other PactError
 * is 500 with the code hidden. Returns null for non-pact errors — the
 * adapter rethrows those to the framework's own error handling.
 */
export function failureResponse(
  error: unknown,
): { status: number; body: { error: string } } | null {
  if (!(error instanceof PactError)) return null;
  if (PACT_AUTH_FAILURE_CODES.has(error.code)) {
    return { status: 401, body: { error: error.code } };
  }
  if (error.code === 'PERMISSION_DENIED') {
    return { status: 403, body: { error: error.code } };
  }
  if (error.code === 'USER_EXISTS') {
    return { status: 409, body: { error: error.code } };
  }
  return { status: 500, body: { error: 'INTERNAL' } };
}

/** The 401 body sent when a route requires a credential and none was
 * presented (or none survived extraction). */
export const NO_CREDENTIALS: { status: 401; body: { error: string } } = {
  status: 401,
  body: { error: 'NO_CREDENTIALS' },
};
