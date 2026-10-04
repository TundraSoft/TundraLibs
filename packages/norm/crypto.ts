/**
 * @module
 *
 * Crypto surface: algorithm unions, defaults (AES via
 * `@tundralibs/crypt`), the override seam, and the plaintext CODEC
 * for encrypted non-string columns. One `secret` + `algorithm` bound
 * per Norm instance serves every encrypted column on every registered
 * entity.
 *
 * Digest algorithms are NOT instance config: encrypt-siblings are
 * PINNED to SHA-256 ({@linkcode SIBLING_HASH_ALGORITHM} — system-
 * controlled, so the physical VARCHAR(64) never moves), and digest
 * columns (`Column.hash(algo)`) carry their algorithm in the
 * DEFINITION.
 *
 * @since 1.0.0
 */

import {
  type AESKeyLength,
  type AESMode,
  decryptAES,
  encryptAES,
} from '@tundralibs/crypt/encrypt';
import { deriveHKDFKey, derivePBKDF2Key } from '@tundralibs/crypt/generators';
import {
  digest,
  type DigestAlgorithms,
  pbkdf2Hash as cryptPbkdf2Hash,
  pbkdf2Verify,
} from '@tundralibs/crypt/digest';
import { signHMAC } from '@tundralibs/crypt/sign';

/**
 * Verify a plaintext against a stored `Column.password('PBKDF2')` hash
 * (re-exported from `@tundralibs/crypt`). Read the row's password field,
 * then `pbkdf2Verify(candidate, row.password)` — a salted PBKDF2 hash
 * can't be matched by an equality filter, so verification is the flow.
 */
export { pbkdf2Verify };

/** Default salted-PBKDF2 password hash — OWASP-iteration default. Backs
 * `Column.password('PBKDF2')`; override via `crypto.pbkdf2Hash`. */
export const defaultPbkdf2Hash = (plaintext: string): Promise<string> =>
  cryptPbkdf2Hash(plaintext);

/** Cipher used for reversible at-rest encryption of `.encrypt()`
 * columns. Set engine-wide via `new Norm({ algorithm })`; defaults to
 * {@link DEFAULT_ENCRYPT_ALGORITHM}. */
export type EncryptAlgorithm =
  | 'AES-128-GCM'
  | 'AES-192-GCM'
  | 'AES-256-GCM'
  | 'AES-128-CBC'
  | 'AES-192-CBC'
  | 'AES-256-CBC'
  | 'AES-128-CTR'
  | 'AES-192-CTR'
  | 'AES-256-CTR';

/** Canonical list of the one-way digest algorithms norm supports. The
 * {@link HashAlgorithm} union, {@link VALID_HASH_ALGORITHMS} set, and
 * `DigestAlgorithm` / `DIGEST_LENGTHS` in `definition/Column.ts` all
 * derive from this — add an algorithm in ONE place. */
export const HASH_ALGORITHMS = ['SHA-256', 'SHA-384', 'SHA-512'] as const;

/** One-way digest used for `Column.hash()` columns and encrypt-sibling
 * digests. Sibling digests are always SHA-256 (see
 * {@link SIBLING_HASH_ALGORITHM}); standalone `Column.hash()` may pick
 * any of these. The canonical `DigestAlgorithm` is an alias of this. */
export type HashAlgorithm = typeof HASH_ALGORITHMS[number];

/** Cipher used when `new Norm({...})` gets no `algorithm`. */
export const DEFAULT_ENCRYPT_ALGORITHM: EncryptAlgorithm = 'AES-256-GCM';
/** Digest used for `Column.hash()` when no algorithm is given. */
export const DEFAULT_HASH_ALGORITHM: HashAlgorithm = 'SHA-256';

/** Encrypt-sibling digests are pinned — never configurable. The
 * synthesized `<col>_hash` column is VARCHAR(64) by construction. */
export const SIBLING_HASH_ALGORITHM: HashAlgorithm = 'SHA-256';

export const VALID_ENCRYPT_ALGORITHMS: ReadonlySet<EncryptAlgorithm> = new Set<
  EncryptAlgorithm
>([
  'AES-128-GCM',
  'AES-192-GCM',
  'AES-256-GCM',
  'AES-128-CBC',
  'AES-192-CBC',
  'AES-256-CBC',
  'AES-128-CTR',
  'AES-192-CTR',
  'AES-256-CTR',
]);

export const VALID_HASH_ALGORITHMS: ReadonlySet<HashAlgorithm> = new Set(
  HASH_ALGORITHMS,
);

/** BYO crypto callbacks (default: AES + SHA digest from crypt). */
/**
 * How the AES cell key is derived from the instance `secret`.
 *
 * - `'PBKDF2'` (default) stretches the secret with 210 000 rounds — right
 *   for a secret a person chose, and refused by Cloudflare Workers, which
 *   caps PBKDF2 at 100 000.
 * - `'HKDF'` derives the key in one step with no stretching — fast and
 *   Workers-safe, but only for a high-entropy secret (32+ random
 *   characters; checked at construction). Cells it writes are stamped
 *   `k2.` so a read knows which derivation to use.
 */
export type KeyDerivation = 'PBKDF2' | 'HKDF';

/** The minimum `secret` / `hashPepper` length the keyed paths accept. */
export const MIN_KEY_LENGTH = 32;

export type CryptoOverrides = {
  encrypt?: (
    plaintext: string,
    secret: string,
    algorithm: EncryptAlgorithm,
  ) => Promise<string>;
  decrypt?: (
    ciphertext: string,
    secret: string,
    algorithm: EncryptAlgorithm,
  ) => Promise<string>;
  hash?: (plaintext: string, algorithm: HashAlgorithm) => Promise<string>;
  /** Salted password KDF for `Column.password('PBKDF2')` columns. */
  pbkdf2Hash?: (plaintext: string) => Promise<string>;
};

function parseAlgorithm(
  algorithm: EncryptAlgorithm,
): { mode: AESMode; keyLength: AESKeyLength } {
  const [, len, mode] = algorithm.split('-');
  return {
    mode: mode as AESMode,
    keyLength: Number(len) as AESKeyLength,
  };
}

// ─── Instance cell key (GCM fast path) ───────────────────────────────────
//
// PBKDF2 at 210k iterations costs ~22 ms; paying it per CELL made bulk
// writes and reads measurably heavy. The GCM path now derives one
// non-extractable AES key per secret+keyLength per process and hands
// it to encryptAES/decryptAES directly, so each cell is a plain AES-GCM
// operation. The derivation salt comes from the secret itself
// (domain-separated SHA-256, first 16 bytes): with ONE secret serving
// every cell, a per-message salt added no brute-force cost — an
// attacker guessing passphrases pays the same 210k iterations per
// candidate either way — while a deterministic salt lets every process
// re-derive the identical key with nothing extra stored.
//
// Envelope shapes tell the two generations apart: key-based cells are
// 2-part `data:iv`, legacy per-message-salt cells are 3-part
// `data:iv:salt` — 4-part with a MAC for CBC/CTR — and keep decrypting
// through the per-cell path. `rotateKey()` re-encrypts, so it also
// upgrades legacy cells to the fast envelope as it runs.

const CELL_KEY_CACHE = new Map<string, Promise<CryptoKey>>();
/** Rotation holds two keys; a generous cap keeps pathological
 * many-secret usage (test suites) from growing the cache unbounded. */
const CELL_KEY_CACHE_MAX = 32;

function cellKey(
  secret: string,
  keyLength: AESKeyLength,
  kdf: KeyDerivation,
): Promise<CryptoKey> {
  const id = `${kdf}\u0000${keyLength}\u0000${secret}`;
  const hit = CELL_KEY_CACHE.get(id);
  if (hit !== undefined) return hit;
  const derived = (async () => {
    // HKDF: one extract-and-expand step, no iteration count — the
    // derivation Workers can run. Domain-separated by `info`; no salt is
    // needed for a secret that is already random.
    if (kdf === 'HKDF') {
      return await deriveHKDFKey(secret, { info: 'norm-cell-key', keyLength });
    }
    const salt = new Uint8Array(
      await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(
          `norm-cell-key\u0000${secret}`,
        ) as BufferSource,
      ),
    ).slice(0, 16);
    return await derivePBKDF2Key(secret, salt, 'AES-GCM', keyLength);
  })();
  // A failed derivation must not stick as a poisoned cache entry.
  derived.catch(() => CELL_KEY_CACHE.delete(id));
  CELL_KEY_CACHE.set(id, derived);
  if (CELL_KEY_CACHE.size > CELL_KEY_CACHE_MAX) {
    const oldest = CELL_KEY_CACHE.keys().next().value;
    if (oldest !== undefined) CELL_KEY_CACHE.delete(oldest);
  }
  return derived;
}

export async function defaultEncrypt(
  plaintext: string,
  secret: string,
  algorithm: EncryptAlgorithm,
  kdf: KeyDerivation = 'PBKDF2',
): Promise<string> {
  const { mode, keyLength } = parseAlgorithm(algorithm);
  if (mode === 'GCM') {
    return await encryptAES(plaintext, await cellKey(secret, keyLength, kdf));
  }
  // CBC needs encrypt-then-MAC keyed off the string secret — crypt
  // restricts CryptoKey secrets to GCM, so this stays per-cell PBKDF2
  // (and HKDF is refused with CBC/CTR at construction).
  return await encryptAES(plaintext, secret, { mode, keyLength });
}

export async function defaultDecrypt(
  ciphertext: string,
  secret: string,
  algorithm: EncryptAlgorithm,
  kdf: KeyDerivation = 'PBKDF2',
): Promise<string> {
  const { mode, keyLength } = parseAlgorithm(algorithm);
  // 2-part = key-based envelope; 3-part = legacy per-message-salt cell
  // written before the fast path existed (still decrypted per-cell).
  if (mode === 'GCM' && ciphertext.split(':').length === 2) {
    return await decryptAES(
      ciphertext,
      await cellKey(secret, keyLength, kdf),
    );
  }
  return await decryptAES(ciphertext, secret, { mode, keyLength });
}

export async function defaultHash(
  plaintext: string,
  algorithm: HashAlgorithm,
): Promise<string> {
  return await digest(plaintext, { algorithm: algorithm as DigestAlgorithms });
}

/**
 * Keyed digest: HMAC-`algorithm` of the plaintext under the instance
 * `hashPepper`, as hex. Same length as the plain digest of the same
 * algorithm (64/96/128), so a sibling or digest column needs no schema
 * change. Without the pepper an attacker holding the rows cannot
 * brute-force low-entropy values (phone numbers, emails) offline.
 */
export async function keyedHash(
  plaintext: string,
  algorithm: HashAlgorithm,
  pepper: string,
): Promise<string> {
  return await signHMAC(plaintext, pepper, {
    hashAlgorithm: algorithm as DigestAlgorithms,
  });
}

// ─── Key-id envelope (rotation support) ──────────────────────────────
//
// So a read — or a key rotation — can tell WHICH key produced a
// ciphertext, every value written from now on is stamped with a short
// fingerprint of the key that encrypted it:
//
//     k1.<fp>.<cipher-body>
//
// `k1` is the scheme version; `<fp>` is 8 hex of a domain-separated
// SHA-256 of the secret (one-way, and far too short to help brute-force
// a high-entropy key); `<cipher-body>` is whatever the underlying cipher
// produced (colon-delimited hex — never contains a dot, so the split
// is unambiguous). Ciphertext WITHOUT the `k1.` prefix is "legacy" —
// written before rotation support — and is decrypted with the current
// key directly. `rotateKey()` upgrades legacy cells to the stamped form
// as it re-encrypts them.

/** Envelope scheme version. Bump only on a breaking format change. */
export const KEY_ENVELOPE_TAG = 'k1';
/** Envelope tag for a cell whose key was derived with HKDF (same body
 * format as `k1`; only the derivation differs, so the tag must say). */
export const HKDF_ENVELOPE_TAG = 'k2';

/** The envelope tag a write under `kdf` stamps. */
export const envelopeTagOf = (kdf: KeyDerivation): string =>
  kdf === 'HKDF' ? HKDF_ENVELOPE_TAG : KEY_ENVELOPE_TAG;

/** Split a stamped ciphertext into tag, key-id and body; `null` for a
 * legacy (un-stamped) value or a malformed prefix. */
export function readEnvelope(
  ciphertext: string,
): { tag: string; keyId: string; body: string } | null {
  for (const tag of [KEY_ENVELOPE_TAG, HKDF_ENVELOPE_TAG]) {
    const prefix = `${tag}.`;
    if (!ciphertext.startsWith(prefix)) continue;
    const rest = ciphertext.slice(prefix.length);
    const dot = rest.indexOf('.');
    return dot > 0
      ? { tag, keyId: rest.slice(0, dot), body: rest.slice(dot + 1) }
      : null;
  }
  return null;
}

/** Short, stable, one-way fingerprint of a secret — the public key-id
 * stamped on ciphertext. Domain-separated so it can't be correlated with
 * a plain `SHA-256(secret)` used elsewhere; truncated to 8 hex (32 bits),
 * enough to distinguish keys without meaningfully narrowing a preimage
 * search against a high-entropy secret. */
export async function keyFingerprint(secret: string): Promise<string> {
  const d = await digest(`norm-key-id\u0000${secret}`, {
    algorithm: 'SHA-256',
  });
  return d.slice(0, 8);
}

/** Read the key-id a ciphertext was stamped with, or `null` for a legacy
 * (un-stamped) value. Pure and total — a malformed prefix reads as
 * legacy and surfaces later at the real decrypt, never here. */
export function readKeyId(ciphertext: string): string | null {
  return readEnvelope(ciphertext)?.keyId ?? null;
}

/** A cipher callback; the default ones take the key derivation as a
 * fourth argument (BYO overrides ignore it). */
type CipherFn = (
  text: string,
  secret: string,
  algorithm: EncryptAlgorithm,
  kdf?: KeyDerivation,
) => Promise<string>;

/** Wrap an encrypt fn so its output is stamped `<tag>.<fp>.<body>` with
 * the fingerprint of the key that produced it — `k1` for PBKDF2 (and BYO
 * ciphers), `k2` for HKDF. */
export function stampKeyId(
  enc: CipherFn,
  kdf: KeyDerivation = 'PBKDF2',
): (
  plaintext: string,
  secret: string,
  algorithm: EncryptAlgorithm,
) => Promise<string> {
  const tag = envelopeTagOf(kdf);
  return async (plaintext, secret, algorithm) => {
    const body = await enc(plaintext, secret, algorithm, kdf);
    return `${tag}.${await keyFingerprint(secret)}.${body}`;
  };
}

/** Wrap a decrypt fn to understand the key-id envelope: if the value is
 * stamped, the stamped fingerprint MUST match `secret` (else the cell is
 * under a different key — throw, so the read-path policy handles it) and
 * the TAG picks the key derivation (`k1` PBKDF2, `k2` HKDF), whatever the
 * instance writes with — so a store mid-migration reads both. Legacy
 * (un-stamped) values decrypt with `secret` directly under PBKDF2. */
export function verifyKeyId(
  dec: CipherFn,
): (
  ciphertext: string,
  secret: string,
  algorithm: EncryptAlgorithm,
) => Promise<string> {
  return async (ciphertext, secret, algorithm) => {
    const stamped = readEnvelope(ciphertext);
    if (stamped === null) {
      if (
        ciphertext.startsWith(`${KEY_ENVELOPE_TAG}.`) ||
        ciphertext.startsWith(`${HKDF_ENVELOPE_TAG}.`)
      ) {
        throw new Error('malformed key-id envelope: no fingerprint delimiter');
      }
      return await dec(ciphertext, secret, algorithm); // legacy, un-stamped
    }
    const fp = await keyFingerprint(secret);
    if (stamped.keyId !== fp) {
      throw new Error(
        `ciphertext is under key '${stamped.keyId}', not the supplied key '${fp}'`,
      );
    }
    const kdf: KeyDerivation = stamped.tag === HKDF_ENVELOPE_TAG
      ? 'HKDF'
      : 'PBKDF2';
    return await dec(stamped.body, secret, algorithm, kdf);
  };
}

// ─── Plaintext codec (encrypted non-string columns) ──────────────────
//
// Encryption operates on strings; the logical column type stays what
// the definition says. canonicalizePlain() maps a validated JS value
// to a deterministic string BEFORE encrypt/digest, decodePlain() maps
// the decrypted string back. Canonical forms are timezone-stable and
// re-digestable (the same value always yields the same digest).

const DATE_TYPES: ReadonlySet<string> = new Set([
  'DATE',
  'TIME',
  'DATETIME',
  'TIMESTAMP',
  'TIMESTAMPTZ',
]);
const NUMBER_TYPES: ReadonlySet<string> = new Set([
  'INTEGER',
  'INT',
  'TINYINT',
  'SMALLINT',
  'DECIMAL',
  'NUMERIC',
  'FLOAT',
  'DOUBLE',
  'REAL',
  'BIT',
]);

/**
 * Canonicalize a plaintext value for encryption/digesting, per the
 * column's LOGICAL type.
 *
 * @throws Error naming the expected plaintext kind on a mismatch —
 *   callers wrap it with entity/column context.
 */
export function canonicalizePlain(v: unknown, type: string): string {
  if (DATE_TYPES.has(type)) {
    if (!(v instanceof Date) || Number.isNaN(v.getTime())) {
      throw new Error('accepts plaintext Date');
    }
    return v.toISOString();
  }
  if (type === 'BIGINT') {
    if (typeof v !== 'bigint') throw new Error('accepts plaintext bigint');
    return v.toString();
  }
  if (NUMBER_TYPES.has(type)) {
    if (typeof v !== 'number' || Number.isNaN(v)) {
      throw new Error('accepts plaintext number');
    }
    return String(v);
  }
  if (type === 'BOOLEAN') {
    if (typeof v !== 'boolean') throw new Error('accepts plaintext boolean');
    return v ? 'true' : 'false';
  }
  if (type === 'JSON' || type === 'JSONB') {
    if (typeof v !== 'object' || v === null) {
      throw new Error('accepts plaintext object');
    }
    // Key-SORTED stringify: digests of semantically equal objects must
    // agree regardless of insertion order.
    return stableJson(v);
  }
  // String kinds (VARCHAR / CHAR / TEXT / UUID / …).
  if (typeof v !== 'string') throw new Error('accepts plaintext string');
  return v;
}

/** Decode a decrypted canonical string back to the logical type.
 * Corrupted / pre-codec values fall back to the RAW string on every
 * branch — one bad cell must neither abort the whole read nor
 * silently flip into a legal-looking value. */
export function decodePlain(s: string, type: string): unknown {
  if (DATE_TYPES.has(type)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? s : d;
  }
  if (type === 'BIGINT') {
    try {
      return s.trim() === '' ? s : BigInt(s);
    } catch {
      return s;
    }
  }
  if (NUMBER_TYPES.has(type)) {
    const n = Number(s);
    return s.trim() === '' || Number.isNaN(n) ? s : n;
  }
  if (type === 'BOOLEAN') {
    return s === 'true' ? true : s === 'false' ? false : s;
  }
  if (type === 'JSON' || type === 'JSONB') {
    try {
      return JSON.parse(s);
    } catch {
      return s;
    }
  }
  return s;
}

/** Deterministic (recursively key-sorted) JSON text. */
function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`;
  if (typeof v === 'object' && v !== null) {
    const rec = v as Record<string, unknown>;
    return `{${
      Object.keys(rec).sort().map((k) =>
        `${JSON.stringify(k)}:${stableJson(rec[k])}`
      ).join(',')
    }}`;
  }
  return JSON.stringify(v) ?? 'null';
}
