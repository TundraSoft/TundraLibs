/**
 * @fileoverview {@link PactJweEncryption} — the content encryption a
 * key-bound JWE uses.
 *
 * @module
 */

/**
 * JWE `enc` values pact offers — AEAD only (AES-GCM); the content key is
 * derived from the API key's secret with HKDF, never the secret itself.
 */
export type PactJweEncryption = 'A128GCM' | 'A256GCM';
