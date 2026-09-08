/**
 * @fileoverview {@link PactHmacAlgorithm} — the digest behind an HMAC
 * credential or a key-bound signature.
 *
 * @module
 */

/** The HMAC digest. Fixed per deployment, never negotiated per request. */
export type PactHmacAlgorithm = 'SHA-256' | 'SHA-384' | 'SHA-512';
