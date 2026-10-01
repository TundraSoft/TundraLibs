/**
 * @fileoverview PBKDF2 password hashing for at-rest storage.
 *
 * Slow, salted **password stretching** (SHA-256/384/512), replacing the
 * prior zero-padding scheme and making brute-forcing short/low-entropy
 * secrets meaningfully expensive. For deriving symmetric keys (AES,
 * domain-separated sub-keys), see `@tundralibs/crypt/generators`.
 *
 * @module
 */

import { decodeHex, encodeHex } from '@std/encoding';
import type { PBKDF2Hash } from './types/mod.ts';
import { DIGEST_OUTPUT_BYTES } from './helper.ts';
import { DigestError } from './errors/mod.ts';

/** Per-message salt length in bytes. */
export const SALT_BYTES = 16;

/** Largest PBKDF2 iteration count Web Crypto accepts (WebIDL unsigned long). */
const MAX_UNSIGNED_LONG = 4_294_967_295;

/**
 * Default PBKDF2 iteration counts for **password storage**, per current OWASP
 * guidance. The count is digest-aware because SHA-256 needs more rounds than
 * the SHA-512 family for equivalent brute-force cost: SHA-256 → 600 000,
 * SHA-384/512 → 210 000. {@link pbkdf2Hash} selects the count from the chosen
 * digest; the stored string records it, so raising a default here never breaks
 * verification of hashes written under an older count.
 */
export const PBKDF2_PASSWORD_ITERATIONS: Record<PBKDF2Hash, number> = {
  'SHA-256': 600_000,
  'SHA-384': 210_000,
  'SHA-512': 210_000,
};
const HASH_BY_LABEL: Record<string, PBKDF2Hash> = {
  sha256: 'SHA-256',
  sha384: 'SHA-384',
  sha512: 'SHA-512',
};

/** Constant-time byte comparison (no early-out on the first mismatch). */
const timingSafeEqual = (a: Uint8Array, b: Uint8Array): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
};

/**
 * Low-level PBKDF2 derivation to raw bytes — the primitive {@link pbkdf2Hash}
 * builds on. Import it directly to derive keyed material for other uses
 * (`pbkdf2(secret, salt, iterations, 256)` → 32 bytes).
 *
 * @param password Secret / password to stretch.
 * @param salt Random salt (see {@link SALT_BYTES}); MUST be stored to
 *   re-derive.
 * @param iterations PBKDF2 rounds.
 * @param bits Output length in bits (default 256).
 * @param hash Underlying digest (default `'SHA-256'`).
 *
 * @throws {DigestError} When the runtime rejects the derivation, e.g.
 *   Cloudflare Workers refusing more than 100 000 iterations.
 */
export const pbkdf2 = async (
  password: string,
  salt: Uint8Array,
  iterations: number,
  bits: number = 256,
  hash: PBKDF2Hash = 'SHA-256',
): Promise<Uint8Array> => {
  try {
    const baseKey = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password) as BufferSource,
      'PBKDF2',
      false,
      ['deriveBits'],
    );
    const derived = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash },
      baseKey,
      bits,
    );
    return new Uint8Array(derived);
  } catch (e) {
    throw new DigestError(
      'PBKDF2-${hash} derivation at ${iterations} iterations was rejected by the runtime',
      { hash, iterations },
      e as Error,
    );
  }
};

/**
 * Hash a password with **salted** PBKDF2 for at-rest storage. Returns a
 * self-describing string — `pbkdf2-<hash>$<iterations>$<salt-hex>$<hash-hex>`
 * — that carries everything {@link pbkdf2Verify} needs. Iterations default to
 * the digest-aware {@link PBKDF2_PASSWORD_ITERATIONS} (600 000 for the default
 * SHA-256); override with `opts.iterations` / `opts.hash`. Cloudflare Workers
 * refuses more than 100 000 iterations, so a Workers deployment must pass
 * `{ iterations: 100_000 }` or fewer.
 *
 * Unlike a bare {@link ./digest.ts | digest}, the random salt makes every
 * hash of the same password unique, so the output **cannot be matched by
 * equality** — you verify a candidate, you do not look a user up by their
 * password hash. This is the correct primitive for password storage; a fast
 * SHA digest is not.
 *
 * @example
 * ```ts
 * const stored = await pbkdf2Hash('correct horse battery staple');
 * await pbkdf2Verify('correct horse battery staple', stored); // true
 * ```
 *
 * @throws {DigestError} When the runtime rejects the derivation (e.g. more
 *   than 100 000 iterations on Cloudflare Workers).
 */
export const pbkdf2Hash = async (
  password: string,
  opts?: { iterations?: number; hash?: PBKDF2Hash },
): Promise<string> => {
  const hash = opts?.hash ?? 'SHA-256';
  const iterations = opts?.iterations ?? PBKDF2_PASSWORD_ITERATIONS[hash];
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const derived = await pbkdf2(
    password,
    salt,
    iterations,
    DIGEST_OUTPUT_BYTES[hash] * 8,
    hash,
  );
  const label = hash.replace('-', '').toLowerCase();
  return `pbkdf2-${label}$${iterations}$${encodeHex(salt)}$${
    encodeHex(derived)
  }`;
};

/**
 * Verify a password against a {@link pbkdf2Hash} output. Constant-time on
 * the digest comparison. A wrong password or a malformed / unrecognised
 * stored string returns `false`.
 *
 * @throws {DigestError} When the runtime rejects the derivation the stored
 *   string asks for — e.g. a 600 000-iteration hash checked on Cloudflare
 *   Workers, which refuses more than 100 000. That is a deployment problem,
 *   not a wrong password, so it is not reported as `false`.
 */
export const pbkdf2Verify = async (
  password: string,
  stored: string,
): Promise<boolean> => {
  const m = /^pbkdf2-(sha256|sha384|sha512)\$(\d+)\$([0-9a-f]+)\$([0-9a-f]+)$/i
    .exec(stored);
  if (m === null) return false;
  const hash = HASH_BY_LABEL[m[1]!.toLowerCase()];
  if (hash === undefined) return false;
  const iterations = Number(m[2]);
  // A count outside Web Crypto's unsigned-long range is malformed input, not
  // a runtime limit, so it must not surface as a DigestError.
  if (!Number.isInteger(iterations) || iterations < 1) return false;
  if (iterations > MAX_UNSIGNED_LONG) return false;
  let salt: Uint8Array;
  let expected: Uint8Array;
  try {
    // decodeHex throws on odd-length hex, which the regex permits.
    salt = decodeHex(m[3]!);
    expected = decodeHex(m[4]!);
  } catch {
    return false;
  }
  const derived = await pbkdf2(
    password,
    salt,
    iterations,
    expected.length * 8,
    hash,
  );
  return timingSafeEqual(derived, expected);
};
