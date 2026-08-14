/**
 * @fileoverview Key derivation functions.
 *
 * - {@link pbkdf2} — slow, salted **password stretching** (SHA-256), backing
 *   AES key derivation and {@link pbkdf2Hash} / {@link pbkdf2Verify} for
 *   password storage. Replaces the prior zero-padding scheme, making
 *   brute-forcing short/low-entropy secrets meaningfully expensive.
 * - {@link hkdf} — fast HKDF (RFC 5869) for **domain separation**: derive
 *   independent sub-keys from one high-entropy secret by varying `info`.
 *
 * @module
 */

/** PBKDF2 iteration count. Tracks current OWASP guidance for SHA-256. */
export const PBKDF2_ITERATIONS = 210_000;

/** Per-message salt length in bytes. */
export const SALT_BYTES = 16;

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

/** Digest choices for {@link pbkdf2Hash}. */
export type PBKDF2Hash = 'SHA-256' | 'SHA-384' | 'SHA-512';

const HASH_BITS: Record<PBKDF2Hash, number> = {
  'SHA-256': 256,
  'SHA-384': 384,
  'SHA-512': 512,
};
const HASH_BY_LABEL: Record<string, PBKDF2Hash> = {
  sha256: 'SHA-256',
  sha384: 'SHA-384',
  sha512: 'SHA-512',
};

const toHex = (b: Uint8Array): string =>
  Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const fromHex = (h: string): Uint8Array => {
  const out = new Uint8Array(h.length >> 1);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
};
/** Constant-time byte comparison (no early-out on the first mismatch). */
const timingSafeEqual = (a: Uint8Array, b: Uint8Array): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
};

/**
 * Low-level PBKDF2 derivation to raw bytes — the primitive both AES key
 * derivation and password hashing build on. Import it to derive AES key
 * material (`pbkdf2(secret, salt, PBKDF2_ITERATIONS, 256)` → 32 bytes) or
 * any other keyed material.
 *
 * @param password Secret / password to stretch.
 * @param salt Random salt (see {@link SALT_BYTES}); MUST be stored to
 *   re-derive.
 * @param iterations PBKDF2 rounds (default {@link PBKDF2_ITERATIONS}).
 * @param bits Output length in bits (default 256).
 * @param hash Underlying digest (default `'SHA-256'`).
 */
export const pbkdf2 = async (
  password: string,
  salt: Uint8Array,
  iterations: number = PBKDF2_ITERATIONS,
  bits: number = 256,
  hash: PBKDF2Hash = 'SHA-256',
): Promise<Uint8Array> => {
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
};

/**
 * Hash a password with **salted** PBKDF2 for at-rest storage. Returns a
 * self-describing string — `pbkdf2-<hash>$<iterations>$<salt-hex>$<hash-hex>`
 * — that carries everything {@link pbkdf2Verify} needs.
 *
 * Unlike a bare {@link ../digest/digest.ts | digest}, the random salt makes
 * every hash of the same password unique, so the output **cannot be matched
 * by equality** — you verify a candidate, you do not look a user up by their
 * password hash. This is the correct primitive for password storage; a fast
 * SHA digest is not.
 *
 * @example
 * ```ts
 * const stored = await pbkdf2Hash('correct horse battery staple');
 * await pbkdf2Verify('correct horse battery staple', stored); // true
 * ```
 */
export const pbkdf2Hash = async (
  password: string,
  opts?: { iterations?: number; hash?: PBKDF2Hash },
): Promise<string> => {
  const iterations = opts?.iterations ?? PBKDF2_ITERATIONS;
  const hash = opts?.hash ?? 'SHA-256';
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const derived = await pbkdf2(
    password,
    salt,
    iterations,
    HASH_BITS[hash],
    hash,
  );
  const label = hash.replace('-', '').toLowerCase();
  return `pbkdf2-${label}$${iterations}$${toHex(salt)}$${toHex(derived)}`;
};

/**
 * Verify a password against a {@link pbkdf2Hash} output. Constant-time on
 * the digest comparison; returns `false` on any malformed / unrecognised
 * input rather than throwing.
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
  // A non-positive iteration count is malformed: Web Crypto rejects
  // `iterations: 0` with an OperationError. Treat it as unrecognised input so
  // the documented never-throws contract holds.
  if (iterations < 1) return false;
  const salt = fromHex(m[3]!);
  const expected = fromHex(m[4]!);
  try {
    const derived = await pbkdf2(
      password,
      salt,
      iterations,
      expected.length * 8,
      hash,
    );
    return timingSafeEqual(derived, expected);
  } catch {
    // Belt-and-suspenders: any unexpected crypto rejection counts as a failed
    // verification rather than propagating out of this never-throws API.
    return false;
  }
};

/** Digest choices for {@link hkdf}. */
export type HKDFHash = 'SHA-256' | 'SHA-384' | 'SHA-512';

/** Output-length ceiling per digest is 255 × hash-length (RFC 5869 §2.3). */
const HKDF_HASH_BYTES: Record<HKDFHash, number> = {
  'SHA-256': 32,
  'SHA-384': 48,
  'SHA-512': 64,
};

const toBytes = (v: string | Uint8Array | undefined): Uint8Array =>
  v === undefined
    ? new Uint8Array(0)
    : typeof v === 'string'
    ? new TextEncoder().encode(v)
    : v;

/**
 * HKDF (RFC 5869) — derive one or more independent sub-keys from a single
 * high-entropy secret. Unlike {@link pbkdf2} (a deliberately slow password
 * stretcher), HKDF is fast and is the correct primitive for **domain
 * separation**: derive keys for distinct purposes from the same secret by
 * varying `info`, with the guarantee that no derived key reveals the secret
 * or any sibling key. Prefer it over ad-hoc `secret + label` concatenation.
 *
 * @param ikm Input keying material — the shared high-entropy secret. Not for
 *   low-entropy passwords (use {@link pbkdf2Hash} for those).
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
  const max = 255 * HKDF_HASH_BYTES[hash];
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
