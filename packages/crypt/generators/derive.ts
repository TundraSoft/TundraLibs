/**
 * @fileoverview Key derivation functions.
 *
 * - {@link derivePBKDF2Key} — PBKDF2-SHA-256 key stretching, deriving a
 *   non-extractable AES key from a secret + salt.
 * - {@link hkdf} — fast HKDF (RFC 5869) for **domain separation**: derive
 *   independent sub-keys from one high-entropy secret by varying `info`.
 *
 * For hashing a low-entropy password for at-rest storage, see
 * {@link ../digest/pbkdf2.ts | pbkdf2Hash} in `@tundralibs/crypt/digest`.
 *
 * @module
 */

import { DIGEST_OUTPUT_BYTES } from '../digest/mod.ts';

/**
 * PBKDF2 iteration count for deriving an AES key from a passphrase. Kept at
 * 210 000: the AES envelope does not record the count, so raising it would
 * break decryption of ciphertexts already written.
 */
export const PBKDF2_ITERATIONS = 210_000;

/**
 * Derives an AES key from a secret + salt using PBKDF2-SHA-256.
 *
 * The returned key is non-extractable and bound to a single AES algorithm
 * + key length, ready for `crypto.subtle.encrypt` / `crypto.subtle.decrypt`.
 */
export const derivePBKDF2Key = async (
  secret: string,
  salt: Uint8Array,
  algorithm: 'AES-GCM' | 'AES-CBC' | 'AES-CTR',
  keyLengthBits: 128 | 192 | 256,
): Promise<CryptoKey> => {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret) as BufferSource,
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  return await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: algorithm, length: keyLengthBits },
    false,
    ['encrypt', 'decrypt'],
  );
};

/** Digest choices for {@link hkdf}. */
export type HKDFHash = 'SHA-256' | 'SHA-384' | 'SHA-512';

const toBytes = (v: string | Uint8Array | undefined): Uint8Array =>
  v === undefined
    ? new Uint8Array(0)
    : typeof v === 'string'
    ? new TextEncoder().encode(v)
    : v;

/**
 * HKDF (RFC 5869) — derive one or more independent sub-keys from a single
 * high-entropy secret. Unlike {@link derivePBKDF2Key} / the digest module's
 * `pbkdf2Hash` (deliberately slow password stretchers), HKDF is fast and is
 * the correct primitive for **domain separation**: derive keys for distinct
 * purposes from the same secret by varying `info`, with the guarantee that
 * no derived key reveals the secret or any sibling key. Prefer it over
 * ad-hoc `secret + label` concatenation.
 *
 * @param ikm Input keying material — the shared high-entropy secret. Not for
 *   low-entropy passwords (use `pbkdf2Hash` from `@tundralibs/crypt/digest`
 *   for those).
 * @param options.salt Optional salt (HKDF-Extract). Defaults to empty — fine
 *   when `ikm` is already high-entropy.
 * @param options.info Context/application label — the domain-separation tag.
 *   Two calls that differ only in `info` yield independent keys.
 * @param options.length Output length in **bytes** (default 32; max
 *   255 × hash-length).
 * @param options.hash Underlying digest (default `'SHA-256'`).
 * @returns the derived key material.
 *
 * @throws {RangeError} When `length` is not an integer in `1..255×hashLen`.
 *
 * @example
 * ```ts
 * declare const secret: Uint8Array;
 *
 * const signKey = await hkdf(secret, { info: 'jwt' });
 * const macKey = await hkdf(secret, { info: 'hmac' }); // independent of signKey
 * ```
 */
export const hkdf = async (
  ikm: string | Uint8Array,
  options?: {
    salt?: string | Uint8Array;
    info?: string | Uint8Array;
    length?: number;
    hash?: HKDFHash;
  },
): Promise<Uint8Array> => {
  const hash = options?.hash ?? 'SHA-256';
  const length = options?.length ?? 32;
  // Output-length ceiling per digest is 255 × hash-length (RFC 5869 §2.3).
  const max = 255 * DIGEST_OUTPUT_BYTES[hash];
  if (!Number.isInteger(length) || length < 1 || length > max) {
    throw new RangeError(
      `hkdf: length must be an integer in 1..${max} bytes for ${hash} (got ${length})`,
    );
  }
  const baseKey = await crypto.subtle.importKey(
    'raw',
    toBytes(ikm) as BufferSource,
    'HKDF',
    false,
    ['deriveBits'],
  );
  const derived = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash,
      salt: toBytes(options?.salt) as BufferSource,
      info: toBytes(options?.info) as BufferSource,
    },
    baseKey,
    length * 8,
  );
  return new Uint8Array(derived);
};
