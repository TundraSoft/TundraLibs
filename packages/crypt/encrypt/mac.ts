/**
 * @fileoverview Encrypt-then-MAC secret derivation for the CBC/CTR envelope.
 *
 * Internal to `encrypt/` — shared between `encrypt.ts` and `decrypt.ts` so
 * neither depends on the other.
 *
 * @module
 * @internal
 */

import type { PBKDF2Hash } from '../digest/mod.ts';
import { PBKDF2_ITERATIONS } from '../generators/mod.ts';

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

/**
 * Fifth part of a CBC/CTR envelope whose MAC also covers the settings its key
 * was derived with. A 4-part envelope predates it: its MAC covers only
 * `data:iv:salt`.
 */
export const ENVELOPE_VERSION = 'v2';

/**
 * The text a {@link ENVELOPE_VERSION} MAC signs: the mode, key length and
 * PBKDF2 settings, then the `data:iv:salt` envelope. Decrypting with any other
 * setting derives a different AES key, and this makes that fail authentication
 * instead of returning garbage.
 *
 * @throws {RangeError} When `pbkdf2.iterations` is not a positive integer
 */
export const macMessage = (
  envelope: string,
  mode: string,
  keyLength: number,
  pbkdf2?: { iterations?: number; hash?: PBKDF2Hash },
): string => {
  const iterations = pbkdf2?.iterations ?? PBKDF2_ITERATIONS;
  if (!Number.isInteger(iterations) || iterations < 1) {
    throw new RangeError(
      `iterations must be a positive integer (got ${iterations})`,
    );
  }
  const hash = pbkdf2?.hash ?? 'SHA-256';
  return `${ENVELOPE_VERSION}:${mode}:${keyLength}:${iterations}:${hash}:${envelope}`;
};
