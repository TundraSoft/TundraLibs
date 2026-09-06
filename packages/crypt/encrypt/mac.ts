/**
 * @fileoverview Encrypt-then-MAC secret derivation for the CBC/CTR envelope.
 *
 * Internal to `encrypt/` — shared between `encrypt.ts` and `decrypt.ts` so
 * neither depends on the other.
 *
 * @module
 * @internal
 */

/**
 * Domain-separation label for the encrypt-then-MAC key. The HMAC that
 * authenticates the unauthenticated AES modes (CBC/CTR) must not be keyed on
 * the same literal secret that derives the AES key, so it is keyed on
 * `secret + MAC_SECRET_LABEL` instead.
 */
export const MAC_SECRET_LABEL = '::tundralibs-aes-etm';

/**
 * Derives the HMAC secret used to authenticate CBC/CTR ciphertext
 * (encrypt-then-MAC), domain-separated from the AES-derivation secret.
 */
export const deriveMacSecret = (secret: string): string =>
  `${secret}${MAC_SECRET_LABEL}`;
