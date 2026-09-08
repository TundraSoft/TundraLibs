/**
 * @fileoverview Key-bound JWE (RFC 7516, compact serialization, `alg: dir`):
 * the confidentiality layer an API-key client and the server share. The
 * content key is HKDF-derived from the key's secret — salted with the key
 * id, labelled with the `enc` — so the raw secret never keys a cipher
 * directly; the protected header is the AEAD's additional data, so `kid`
 * and `enc` are integrity-bound to the ciphertext. AES-GCM only.
 *
 * @module
 */
import { decodeBase64Url, encodeBase64Url } from '@std/encoding';
import { hkdf } from '@tundralibs/crypt/generators';
import { PactError } from './errors/mod.ts';
import type { PactJweEncryption } from './types/mod.ts';

/** Every `enc` pact offers (AEAD only). */
export const JWE_ENCRYPTIONS: readonly PactJweEncryption[] = [
  'A128GCM',
  'A256GCM',
];

const KEY_BYTES: Record<PactJweEncryption, number> = {
  A128GCM: 16,
  A256GCM: 32,
};
const IV_BYTES = 12;
const TAG_BYTES = 16;
const ENCODER = new TextEncoder();

/** The content encryption key for one (secret, keyId, enc) triple. */
async function contentKey(
  secret: string,
  keyId: string,
  enc: PactJweEncryption,
  usage: 'encrypt' | 'decrypt',
): Promise<CryptoKey> {
  const raw = await hkdf(secret, {
    salt: keyId,
    info: `pact-jwe-${enc}`,
    length: KEY_BYTES[enc],
  });
  return await crypto.subtle.importKey(
    'raw',
    raw as BufferSource,
    'AES-GCM',
    false,
    [usage],
  );
}

/**
 * Encrypt `plaintext` for the key: compact JWE
 * `header..iv.ciphertext.tag` with `{ alg: 'dir', enc, kid: keyId }`.
 */
export async function encryptJwe(
  secret: string,
  keyId: string,
  plaintext: string | Uint8Array,
  enc: PactJweEncryption,
): Promise<string> {
  const header = encodeBase64Url(
    ENCODER.encode(JSON.stringify({ alg: 'dir', enc, kid: keyId })),
  );
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await contentKey(secret, keyId, enc, 'encrypt');
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv,
        additionalData: ENCODER.encode(header),
        tagLength: TAG_BYTES * 8,
      },
      key,
      (typeof plaintext === 'string'
        ? ENCODER.encode(plaintext)
        : plaintext) as BufferSource,
    ),
  );
  const ciphertext = sealed.subarray(0, sealed.length - TAG_BYTES);
  const tag = sealed.subarray(sealed.length - TAG_BYTES);
  return `${header}..${encodeBase64Url(iv)}.${encodeBase64Url(ciphertext)}.${
    encodeBase64Url(tag)
  }`;
}

/** The parsed protected header of a compact JWE, or `null` when malformed. */
export function parseJweHeader(
  jwe: string,
): { alg?: unknown; enc?: unknown; kid?: unknown } | null {
  const first = jwe.split('.', 1)[0];
  if (first === undefined || first === '') return null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(decodeBase64Url(first)));
    return typeof parsed === 'object' && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Open a compact JWE produced by {@link encryptJwe} (or any `alg: dir` +
 * AES-GCM producer following the same derivation).
 *
 * @throws {PactError} ENCRYPTION_INVALID on a malformed token, an `alg`
 *   other than `dir`, an `enc` outside `allowed`, a `kid` that is not
 *   `keyId`, or a failed authentication tag.
 */
export async function decryptJwe(
  secret: string,
  keyId: string,
  jwe: string,
  allowed: readonly PactJweEncryption[],
): Promise<Uint8Array> {
  const reject = (reason: string): never => {
    throw new PactError('ENCRYPTION_INVALID', { reason });
  };
  const parts = jwe.split('.');
  if (parts.length !== 5) return reject('not a compact JWE');
  const [headerB64, encryptedKey, ivB64, ctB64, tagB64] = parts as [
    string,
    string,
    string,
    string,
    string,
  ];
  if (encryptedKey !== '') return reject('only alg "dir" is supported');
  const header = parseJweHeader(jwe);
  if (header === null) return reject('unreadable protected header');
  if (header.alg !== 'dir') return reject('only alg "dir" is supported');
  if (
    typeof header.enc !== 'string' ||
    !allowed.includes(header.enc as PactJweEncryption)
  ) {
    return reject(`enc must be one of ${allowed.join(', ')}`);
  }
  if (header.kid !== keyId) return reject('kid is not the authenticated key');
  const enc = header.enc as PactJweEncryption;
  let iv: Uint8Array, ciphertext: Uint8Array, tag: Uint8Array;
  try {
    iv = decodeBase64Url(ivB64);
    ciphertext = decodeBase64Url(ctB64);
    tag = decodeBase64Url(tagB64);
  } catch {
    return reject('malformed base64url');
  }
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    return reject('malformed iv or tag');
  }
  const sealed = new Uint8Array(ciphertext.length + tag.length);
  sealed.set(ciphertext);
  sealed.set(tag, ciphertext.length);
  const key = await contentKey(secret, keyId, enc, 'decrypt');
  try {
    return new Uint8Array(
      await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: iv as BufferSource,
          additionalData: ENCODER.encode(headerB64),
          tagLength: TAG_BYTES * 8,
        },
        key,
        sealed as BufferSource,
      ),
    );
  } catch {
    return reject('authentication tag mismatch');
  }
}
