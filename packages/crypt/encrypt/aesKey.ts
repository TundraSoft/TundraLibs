/**
 * @fileoverview Validation for caller-supplied AES `CryptoKey` secrets.
 *
 * Internal to `encrypt/` — shared between `encrypt.ts` and `decrypt.ts`. A
 * key handed in from outside carries no guarantee it was created for this
 * operation, so its algorithm, length, and usages are checked instead of
 * trusted.
 *
 * @module
 * @internal
 */

/**
 * Validates a pre-derived AES key against the requested operation. `CryptoKey`
 * secrets are GCM-only (AEAD — CBC/CTR's encrypt-then-MAC needs a string
 * secret to derive the MAC key), and an explicit `keyLength` option that
 * contradicts the key's own length is refused rather than silently ignored.
 */
export const validateAESKey = (
  key: CryptoKey,
  mode: string,
  keyLength: number | undefined,
  purpose: 'encrypt' | 'decrypt',
): void => {
  if (mode !== 'GCM') {
    throw new Error(
      'A CryptoKey secret supports GCM only — CBC/CTR authenticate with ' +
        'encrypt-then-MAC, which needs a string secret to derive the MAC key',
    );
  }
  if (key.algorithm.name !== 'AES-GCM') {
    throw new Error(
      `CryptoKey is for '${key.algorithm.name}' but this operation needs ` +
        `'AES-GCM'`,
    );
  }
  const actualLength = (key.algorithm as AesKeyAlgorithm).length;
  if (keyLength !== undefined && actualLength !== keyLength) {
    throw new Error(
      `CryptoKey is ${actualLength}-bit but options.keyLength says ` +
        `${keyLength} — drop the option or supply a matching key`,
    );
  }
  if (!key.usages.includes(purpose)) {
    throw new Error(
      `CryptoKey does not permit '${purpose}' (usages: ` +
        `${key.usages.join(', ') || 'none'})`,
    );
  }
};
