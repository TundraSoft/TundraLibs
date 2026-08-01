/**
 * @fileoverview Key normalisation for the signing primitives.
 *
 * The sign/verify functions accept a {@link SigningKey} — a PEM string, an
 * already-imported `CryptoKey`, or a JWK — and every one of them ends up as a
 * `CryptoKey` bound to exactly one operation. This module is where that
 * happens, and it is the **security boundary the widened key input creates**:
 * accepting a key the caller already holds means the key's own metadata is no
 * longer implied by the code path, so it has to be checked instead of trusted.
 *
 * Two entry points:
 *
 * - {@link describeKey} — cheap, synchronous, no import. Answers "what *kind*
 *   of key is this?" so a caller can reject an algorithm/key mismatch before
 *   any cryptography runs. The JWT verifier uses it to bind the token's `alg`
 *   to the key it was handed.
 * - {@link importSigningKey} — validates a key against a full
 *   {@link KeyRequirement} and returns the `CryptoKey` to sign or verify with.
 *
 * @module
 * @internal
 */

import { describeDerKey, sec1ToPkcs8 } from './asn1.ts';
import type { ECCurve, ECHashAlgorithm, SigningKey } from './types/mod.ts';

/**
 * The hash RFC 7518 §3.4 pairs with each curve — the default for an ECDSA
 * operation, and the only pairing the JOSE `ES*` algorithms permit.
 *
 * @internal
 */
export const EC_CURVE_HASH: Record<ECCurve, ECHashAlgorithm> = {
  'P-256': 'SHA-256',
  'P-384': 'SHA-384',
  'P-521': 'SHA-512',
};

/**
 * Width, in bytes, of the fixed-length `R‖S` signature each curve produces
 * (RFC 7515 §3.4). Each half is the curve's field size rounded up to whole
 * octets, so P-521 gives 2 × 66 = **132** bytes rather than the 128 its name
 * might suggest.
 *
 * @internal
 */
export const EC_SIGNATURE_BYTES: Record<ECCurve, number> = {
  'P-256': 64,
  'P-384': 96,
  'P-521': 132,
};

/**
 * The kind of cryptographic key an algorithm needs.
 *
 * - `'HMAC'` — symmetric; a raw secret, an `oct` JWK, or an HMAC `CryptoKey`.
 * - `'RSA'` — asymmetric RSA, for both `RS*` (PKCS#1 v1.5) and `PS*` (PSS).
 * - `'EC'` — asymmetric elliptic curve, for `ES*`.
 */
export type KeyFamily = 'HMAC' | 'RSA' | 'EC';

/** The operation a key is being requested for. */
export type KeyPurpose = 'sign' | 'verify';

/** What a key *is*, derived from the key material alone. */
export type KeyShape = {
  /** Family the key belongs to. */
  family: KeyFamily;
  /** Named curve — present only when `family` is `'EC'`. */
  curve?: ECCurve;
};

/** What an operation *needs* from a key. */
export type KeyRequirement = {
  /** Family the operation requires. */
  family: KeyFamily;
  /** Whether the key will sign or verify. */
  purpose: KeyPurpose;
  /** Hash the operation runs with. */
  hash: 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512';
  /** Required curve — mandatory when `family` is `'EC'`. */
  curve?: ECCurve;
  /** RSA signature scheme — mandatory when `family` is `'RSA'`. */
  scheme?: 'PSS' | 'PKCS1';
};

/** PEM armour, matching the detection the package has always used. */
const PEM_ARMOUR = /-----BEGIN [A-Z ]+-----/;

/** Captures a PEM block's label and body. */
const PEM_BLOCK =
  /-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END [A-Z0-9 ]+-----/;

/** JOSE algorithm names by family, indexed for the JWK `alg` cross-check. */
const JOSE_NAMES: Record<string, string> = {
  'HMAC:SHA-256': 'HS256',
  'HMAC:SHA-384': 'HS384',
  'HMAC:SHA-512': 'HS512',
  'RSA:PKCS1:SHA-256': 'RS256',
  'RSA:PKCS1:SHA-384': 'RS384',
  'RSA:PKCS1:SHA-512': 'RS512',
  'RSA:PSS:SHA-256': 'PS256',
  'RSA:PSS:SHA-384': 'PS384',
  'RSA:PSS:SHA-512': 'PS512',
  'EC:P-256': 'ES256',
  'EC:P-384': 'ES384',
  'EC:P-521': 'ES512',
};

/**
 * Detects a PEM-armoured key string.
 *
 * @param key - Key material supplied by a caller.
 * @returns `true` when the string carries PEM armour.
 * @internal
 */
export const isPEM = (key: string): boolean => PEM_ARMOUR.test(key);

/**
 * Splits a PEM block into its label and DER bytes.
 *
 * @param pem - PEM-armoured key.
 * @param what - Noun used in the error message (`'private key'`, …).
 * @returns The block's label (e.g. `'EC PRIVATE KEY'`) and decoded DER.
 * @throws {Error} When the body is not valid base64.
 * @internal
 */
export const pemToDer = (
  pem: string,
  what = 'key',
): { label: string; der: Uint8Array } => {
  const match = PEM_BLOCK.exec(pem);
  const label = match?.[1] ?? '';
  const body = (match?.[2] ?? pem)
    .replace(/-----BEGIN [A-Z0-9 ]+-----/, '')
    .replace(/-----END [A-Z0-9 ]+-----/, '')
    .replaceAll(/\s/g, '');
  try {
    return {
      label,
      der: Uint8Array.from(atob(body), (c) => c.codePointAt(0) ?? 0),
    };
  } catch {
    throw new Error(`Invalid PEM ${what} format`);
  }
};

/**
 * Duck-types a `CryptoKey`.
 *
 * `instanceof` alone is not enough: a key that crossed a realm boundary (a
 * worker, a vm context) is a genuine `CryptoKey` that fails the check, so the
 * structural test is the primary signal and `instanceof` only a fast path.
 *
 * @param value - Any non-string key argument.
 * @returns `true` when the value is a Web Crypto key.
 * @internal
 */
const isCryptoKey = (value: object): value is CryptoKey => {
  if (typeof CryptoKey !== 'undefined' && value instanceof CryptoKey) {
    return true;
  }
  return 'type' in value && 'algorithm' in value && 'usages' in value &&
    'extractable' in value;
};

/**
 * Reads the curve off an EC `CryptoKey`.
 *
 * @param key - An `ECDSA` key.
 * @returns The curve name Web Crypto reports.
 * @internal
 */
const cryptoKeyCurve = (key: CryptoKey): string | undefined =>
  (key.algorithm as { namedCurve?: string }).namedCurve;

/**
 * Reads the hash bound into an RSA or HMAC `CryptoKey`.
 *
 * @param key - An RSA or HMAC key.
 * @returns The hash name, or `undefined` when the key binds none.
 * @internal
 */
const cryptoKeyHash = (key: CryptoKey): string | undefined =>
  (key.algorithm as { hash?: { name?: string } }).hash?.name;

/**
 * Describes a key from its material alone, without importing it.
 *
 * This is what lets a caller reject an algorithm/key mismatch *before* any
 * cryptography runs — the JWT verifier compares the result against the token's
 * `alg` header, so a key of the wrong family or on the wrong curve is refused
 * rather than being asked to verify something it cannot.
 *
 * A PEM string this reader cannot structurally parse is reported as `'RSA'`,
 * which is the family every PEM had before EC support existed; the real error
 * then surfaces from Web Crypto at import time.
 *
 * @param key - Key material supplied by a caller.
 * @returns The key's {@link KeyShape}.
 * @throws {Error} When a `CryptoKey` carries an algorithm that cannot sign or
 *   verify, when a JWK's `kty` is unusable or an EC JWK's `crv` is missing or
 *   unsupported, when a PEM's EC curve is unsupported, or when the value is
 *   neither a string, a `CryptoKey`, nor a JWK object.
 * @internal
 */
export const describeKey = (key: SigningKey): KeyShape => {
  if (typeof key === 'string') {
    if (!isPEM(key)) {
      // No armour — a raw HMAC secret, exactly as before.
      return { family: 'HMAC' };
    }
    const { label, der } = pemToDer(key);
    if (label === 'EC PRIVATE KEY') {
      // SEC1: the curve lives in the key's own `[0] parameters`.
      return { family: 'EC', curve: sec1ToPkcs8(der).curve };
    }
    const info = describeDerKey(der);
    if (info?.family === 'EC') {
      return { family: 'EC', curve: info.curve };
    }
    return { family: 'RSA' };
  }

  if (typeof key !== 'object' || key === null) {
    throw new Error(
      'Key must be a PEM string, a raw secret, a CryptoKey, or a JWK object',
    );
  }

  if (isCryptoKey(key)) {
    const name = key.algorithm.name;
    if (name === 'HMAC') {
      return { family: 'HMAC' };
    }
    if (name === 'RSASSA-PKCS1-v1_5' || name === 'RSA-PSS') {
      return { family: 'RSA' };
    }
    if (name === 'ECDSA') {
      const curve = cryptoKeyCurve(key);
      if (curve !== 'P-256' && curve !== 'P-384' && curve !== 'P-521') {
        throw new Error(
          `Unsupported EC curve '${curve}': only P-256, P-384 and P-521 are ` +
            'supported',
        );
      }
      return { family: 'EC', curve };
    }
    throw new Error(
      `CryptoKey algorithm '${name}' cannot sign or verify. Supported: ` +
        'HMAC, RSASSA-PKCS1-v1_5, RSA-PSS, ECDSA',
    );
  }

  const jwk = key as JsonWebKey;
  switch (jwk.kty) {
    case 'oct':
      return { family: 'HMAC' };
    case 'RSA':
      return { family: 'RSA' };
    case 'EC': {
      const curve = jwk.crv;
      if (curve !== 'P-256' && curve !== 'P-384' && curve !== 'P-521') {
        throw new Error(
          `Unsupported EC JWK curve '${curve}': only P-256, P-384 and P-521 ` +
            'are supported',
        );
      }
      return { family: 'EC', curve };
    }
    default:
      throw new Error(
        `Unsupported JWK key type '${jwk.kty}': expected 'oct', 'RSA' or 'EC'`,
      );
  }
};

/**
 * Resolves the curve an ECDSA operation runs on, refusing a key that is not EC
 * or that lies on a curve other than the pinned one.
 *
 * This is the curve half of the algorithm-confusion defense: when the caller
 * pins a curve (as the JWT layer does, deriving P-256 from `ES256`), a key on
 * any other curve is rejected outright rather than being handed to Web Crypto,
 * which would merely report an invalid signature and leave the mismatch
 * indistinguishable from a forgery.
 *
 * @param key - Key material supplied by a caller.
 * @param pinned - Curve the operation requires, when it requires a specific one.
 * @returns The curve to run on.
 * @throws {Error} When the key is not an EC key, or when its curve is not
 *   `pinned`.
 * @internal
 */
export const resolveECCurve = (
  key: SigningKey,
  pinned?: ECCurve,
): ECCurve => {
  const shape = describeKey(key);
  if (shape.family !== 'EC' || shape.curve === undefined) {
    throw new Error(
      'ECDSA needs an EC key, but the supplied key is ' +
        (shape.family === 'HMAC' ? 'a raw secret or HMAC key' : 'an RSA key'),
    );
  }
  if (pinned !== undefined && shape.curve !== pinned) {
    throw new Error(
      `EC key is on curve '${shape.curve}' but this operation needs ` +
        `'${pinned}'`,
    );
  }
  return shape.curve;
};

/**
 * The Web Crypto algorithm name a requirement maps onto.
 *
 * @param need - The operation's {@link KeyRequirement}.
 * @returns The `SubtleCrypto` algorithm name.
 * @internal
 */
const algorithmName = (need: KeyRequirement): string => {
  if (need.family === 'HMAC') return 'HMAC';
  if (need.family === 'EC') return 'ECDSA';
  return need.scheme === 'PKCS1' ? 'RSASSA-PKCS1-v1_5' : 'RSA-PSS';
};

/**
 * The JOSE algorithm identifier a requirement corresponds to, when one exists.
 *
 * Used only to cross-check a JWK's own `alg` — a JWK that names `RS256` must
 * not be pressed into an `ES256` operation.
 *
 * @param need - The operation's {@link KeyRequirement}.
 * @returns The `alg` value, or `undefined` for combinations JOSE does not name
 *   (HMAC-SHA-1, for instance).
 * @internal
 */
const joseName = (need: KeyRequirement): string | undefined => {
  if (need.family === 'EC') return JOSE_NAMES[`EC:${need.curve}`];
  if (need.family === 'RSA') {
    return JOSE_NAMES[`RSA:${need.scheme ?? 'PSS'}:${need.hash}`];
  }
  return JOSE_NAMES[`HMAC:${need.hash}`];
};

/**
 * Human-readable description of a requirement, for error messages.
 *
 * @param need - The operation's {@link KeyRequirement}.
 * @returns A short phrase such as `` `ECDSA` on P-256 ``.
 * @internal
 */
const describeRequirement = (need: KeyRequirement): string =>
  need.family === 'EC'
    ? `${algorithmName(need)} on ${need.curve}`
    : `${algorithmName(need)} with ${need.hash}`;

/**
 * Validates a caller-supplied `CryptoKey` against the operation.
 *
 * Every property Web Crypto binds into a key is checked, because a key handed
 * in from outside carries no guarantee that it was imported for *this*
 * operation: the algorithm (so an EC key cannot serve `RS*` and an RSA key
 * cannot serve `ES*`), the curve (so a P-384 key cannot verify an `ES256`
 * signature), the hash RSA and HMAC keys bind at import time, the key's
 * public/private/secret type, and its permitted usages.
 *
 * @param key - The key the caller supplied.
 * @param need - The operation's {@link KeyRequirement}.
 * @returns The same key, once it is known to be usable.
 * @throws {Error} When any of the above contradicts the operation.
 * @internal
 */
const validateCryptoKey = (key: CryptoKey, need: KeyRequirement): CryptoKey => {
  const expected = algorithmName(need);
  if (key.algorithm.name !== expected) {
    throw new Error(
      `CryptoKey is for '${key.algorithm.name}' but this operation needs ` +
        `'${expected}'`,
    );
  }

  if (need.family === 'EC') {
    const curve = cryptoKeyCurve(key);
    if (curve !== need.curve) {
      throw new Error(
        `CryptoKey is on curve '${curve}' but this operation needs ` +
          `'${need.curve}'`,
      );
    }
  } else {
    // RSA and HMAC keys bind their hash at import time; ECDSA takes it per
    // operation, which is why the curve is checked instead above.
    const hash = cryptoKeyHash(key);
    if (hash !== undefined && hash !== need.hash) {
      throw new Error(
        `CryptoKey binds hash '${hash}' but this operation needs ` +
          `'${need.hash}'`,
      );
    }
  }

  const expectedType = need.family === 'HMAC'
    ? 'secret'
    : need.purpose === 'sign'
    ? 'private'
    : 'public';
  if (key.type !== expectedType) {
    throw new Error(
      `CryptoKey is a '${key.type}' key but ${need.purpose} needs a ` +
        `'${expectedType}' key`,
    );
  }

  if (!key.usages.includes(need.purpose)) {
    throw new Error(
      `CryptoKey does not permit '${need.purpose}' (usages: ` +
        `${key.usages.join(', ') || 'none'})`,
    );
  }

  return key;
};

/**
 * Validates a JWK's declared metadata against the operation.
 *
 * RFC 7517 lets a JWK state what it is for, and a key whose own declaration
 * contradicts the operation is a key that must not be used: `kty`/`crv` fix the
 * family and curve (§4.1, RFC 7518 §6.2.1.1), `use` restricts it to signatures
 * or encryption (§4.2), `key_ops` enumerates the permitted operations (§4.3),
 * and `alg` names the one algorithm it is intended for (§4.4). Presence of `d`
 * distinguishes private key material from public.
 *
 * @param jwk - The JWK the caller supplied.
 * @param need - The operation's {@link KeyRequirement}.
 * @throws {Error} When any declared field contradicts the operation.
 * @internal
 */
const validateJwk = (jwk: JsonWebKey, need: KeyRequirement): void => {
  const expectedKty = need.family === 'HMAC'
    ? 'oct'
    : need.family === 'EC'
    ? 'EC'
    : 'RSA';
  if (jwk.kty !== expectedKty) {
    throw new Error(
      `JWK 'kty' is '${jwk.kty}' but this operation needs '${expectedKty}'`,
    );
  }

  if (need.family === 'EC' && jwk.crv !== need.curve) {
    throw new Error(
      `JWK 'crv' is '${jwk.crv}' but this operation needs '${need.curve}'`,
    );
  }

  // Checked before the declarative metadata below because it is the more
  // fundamental — and more dangerous — mistake: a private JWK reaching a
  // verification path means signing material has leaked into one. Its
  // `key_ops` would also catch this, but would report it as a permissions
  // quibble rather than naming what actually went wrong.
  if (need.family !== 'HMAC') {
    const isPrivate = jwk.d !== undefined;
    if (need.purpose === 'sign' && !isPrivate) {
      throw new Error(
        "Signing needs a private JWK, but the supplied key has no 'd'",
      );
    }
    if (need.purpose === 'verify' && isPrivate) {
      throw new Error(
        'Verification needs a public JWK, but the supplied key carries ' +
          "private material ('d')",
      );
    }
  }

  // RFC 7517 §4.2 — 'sig' or 'enc'. An encryption key must never sign.
  if (jwk.use !== undefined && jwk.use !== 'sig') {
    throw new Error(
      `JWK 'use' is '${jwk.use}', so the key may not be used for signatures`,
    );
  }

  // RFC 7517 §4.3 — when present, key_ops is exhaustive.
  if (jwk.key_ops !== undefined && !jwk.key_ops.includes(need.purpose)) {
    throw new Error(
      `JWK 'key_ops' does not permit '${need.purpose}' (${
        jwk.key_ops.join(', ') || 'none'
      })`,
    );
  }

  // RFC 7517 §4.4 — a JWK that names its algorithm names exactly one.
  const jose = joseName(need);
  if (jwk.alg !== undefined && jose !== undefined && jwk.alg !== jose) {
    throw new Error(
      `JWK 'alg' is '${jwk.alg}' but this operation is '${jose}'`,
    );
  }
};

/**
 * Rebuilds a JWK from only the fields Web Crypto consumes.
 *
 * The declared metadata (`alg`, `use`, `key_ops`, `kid`, …) has already been
 * validated by {@link validateJwk}, and passing it on to `importKey` buys
 * nothing while inviting cross-runtime disagreement — implementations differ on
 * how strictly they re-check `alg` against the requested algorithm, so a JWK
 * that imports on one runtime can be refused on another.
 *
 * @param jwk - The validated JWK.
 * @param need - The operation's {@link KeyRequirement}.
 * @returns A JWK holding key material only.
 * @internal
 */
const sanitiseJwk = (jwk: JsonWebKey, need: KeyRequirement): JsonWebKey => {
  if (need.family === 'HMAC') {
    return { kty: 'oct', k: jwk.k, ext: true };
  }
  if (need.family === 'EC') {
    const base: JsonWebKey = {
      kty: 'EC',
      crv: need.curve,
      x: jwk.x,
      y: jwk.y,
      ext: true,
    };
    return jwk.d === undefined ? base : { ...base, d: jwk.d };
  }
  const base: JsonWebKey = { kty: 'RSA', n: jwk.n, e: jwk.e, ext: true };
  if (jwk.d === undefined) {
    return base;
  }
  // RSA private keys carry the CRT parameters; pass through whichever the
  // caller supplied and let Web Crypto decide whether the set is complete.
  const priv: JsonWebKey = { ...base, d: jwk.d };
  for (const field of ['p', 'q', 'dp', 'dq', 'qi'] as const) {
    if (jwk[field] !== undefined) {
      priv[field] = jwk[field];
    }
  }
  return priv;
};

/**
 * Web Crypto import parameters for a requirement.
 *
 * @param need - The operation's {@link KeyRequirement}.
 * @returns The algorithm object to pass to `importKey`.
 * @internal
 */
const importParams = (
  need: KeyRequirement,
): EcKeyImportParams | HmacImportParams | RsaHashedImportParams =>
  need.family === 'EC'
    ? { name: 'ECDSA', namedCurve: need.curve as string }
    : { name: algorithmName(need), hash: need.hash };

/**
 * Imports PEM or raw-secret key material.
 *
 * @param key - PEM-armoured key, or a raw HMAC secret.
 * @param need - The operation's {@link KeyRequirement}.
 * @returns The imported key.
 * @throws {Error} When the PEM is encrypted, when its curve contradicts
 *   `need.curve`, or when Web Crypto refuses the key material.
 * @internal
 */
const importStringKey = (
  key: string,
  need: KeyRequirement,
): Promise<CryptoKey> => {
  if (need.family === 'HMAC') {
    return crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(key) as BufferSource,
      { name: 'HMAC', hash: need.hash },
      false,
      [need.purpose],
    );
  }

  const what = need.purpose === 'sign' ? 'private key' : 'public key';
  const { label, der } = pemToDer(key, what);

  if (label === 'ENCRYPTED PRIVATE KEY') {
    throw new Error(
      'Encrypted PEM private keys are not supported. Decrypt the key first ' +
        '(`openssl pkcs8 -topk8 -nocrypt`) and supply the result.',
    );
  }

  let material = der;
  if (need.family === 'EC' && label === 'EC PRIVATE KEY') {
    // Web Crypto has no SEC1 import; rewrap as PKCS#8.
    const converted = sec1ToPkcs8(der);
    if (converted.curve !== need.curve) {
      throw new Error(
        `EC private key is on curve '${converted.curve}' but this operation ` +
          `needs '${need.curve}'`,
      );
    }
    material = converted.pkcs8;
  }

  return crypto.subtle.importKey(
    need.purpose === 'sign' ? 'pkcs8' : 'spki',
    material as BufferSource,
    importParams(need),
    false,
    [need.purpose],
  );
};

/**
 * Turns any {@link SigningKey} into a `CryptoKey` bound to one operation,
 * refusing keys the operation must not use.
 *
 * @param key - Key material supplied by a caller.
 * @param need - The operation's {@link KeyRequirement}.
 * @returns The key to sign or verify with.
 * @throws {Error} When the key's family, curve, hash, type, usages or declared
 *   JWK metadata contradict `need`; when a PEM is malformed or encrypted; or
 *   when Web Crypto refuses the key material.
 * @internal
 */
export const importSigningKey = async (
  key: SigningKey,
  need: KeyRequirement,
): Promise<CryptoKey> => {
  if (typeof key === 'string') {
    return await importStringKey(key, need);
  }

  if (typeof key !== 'object' || key === null) {
    throw new Error(
      'Key must be a PEM string, a raw secret, a CryptoKey, or a JWK object',
    );
  }

  if (isCryptoKey(key)) {
    return validateCryptoKey(key, need);
  }

  const jwk = key as JsonWebKey;
  validateJwk(jwk, need);
  try {
    return await crypto.subtle.importKey(
      'jwk',
      sanitiseJwk(jwk, need),
      importParams(need),
      false,
      [need.purpose],
    );
  } catch (error) {
    throw new Error(
      `JWK could not be imported for ${describeRequirement(need)}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
};
