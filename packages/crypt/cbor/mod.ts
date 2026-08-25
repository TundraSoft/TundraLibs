/**
 * @fileoverview `@tundralibs/crypt/cbor` — a minimal CBOR decoder plus
 * COSE-key → JWK conversion, scoped to what WebAuthn / CTAP2 needs:
 * decode an `attestationObject`, walk `authenticatorData`, and turn a
 * credential's COSE public key into an importable JWK.
 *
 * @example
 * ```ts
 * import { coseToJwk, decodeCBOR } from '@tundralibs/crypt/cbor';
 *
 * declare const attestationObject: Uint8Array; // from a WebAuthn ceremony
 * const decoded = decodeCBOR(attestationObject) as Map<unknown, unknown>;
 * // decoded.get('fmt'), decoded.get('authData'), decoded.get('attStmt') …
 * ```
 *
 * @module
 */

export { decodeCBOR, decodeCBORItem } from './decode.ts';
export { coseToJwk } from './cose.ts';
export { CBORError, type CBORErrorMeta } from './errors/mod.ts';
export type { CBORValue, CoseAlgorithm, CoseKeyResult } from './types/mod.ts';
