import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { describeKey, importSigningKey, resolveECCurve } from './keys.ts';
import { generateECKeyPair, generateRSAKeyPair } from '../generators/key.ts';

const SEC1_P256 = `-----BEGIN EC PRIVATE KEY-----
MHcCAQEEIDogV1jG+c/EcX+YpB53qf6aD9TpKQLoqckCIW+93D6AoAoGCCqGSM49
AwEHoUQDQgAE3EwCtZAAytyIxtIpxbUTW1/KTNceXfXaITN6c0ZabGlOoh0FdFpn
ds7wUkca5iyvROqi80JD5gikerIbHaPpDQ==
-----END EC PRIVATE KEY-----`;

const SPKI_P256 = `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE3EwCtZAAytyIxtIpxbUTW1/KTNce
XfXaITN6c0ZabGlOoh0FdFpnds7wUkca5iyvROqi80JD5gikerIbHaPpDQ==
-----END PUBLIC KEY-----`;

const ENCRYPTED_P256 = `-----BEGIN ENCRYPTED PRIVATE KEY-----
MIH0MF8GCSqGSIb3DQEFDTBSMDEGCSqGSIb3DQEFDDAkBBBDd2tViii8CFizQYIf
yff2AgIIADAMBggqhkiG9w0CCQUAMB0GCWCGSAFlAwQBKgQQmWJaYHtiTYV7aRLs
-----END ENCRYPTED PRIVATE KEY-----`;

/** RFC 7515 Appendix A.3.1 — the public half of the ES256 example key. */
const RFC7515_A3_PUBLIC_JWK: JsonWebKey = {
  kty: 'EC',
  crv: 'P-256',
  x: 'f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU',
  y: 'x_FEzRu9m36HLN_tue659LNpXW6pCyStikYjKIWI5a0',
};

describe('crypt.sign.keys', () => {
  it('describeKey - raw secrets are HMAC, PEM keys are RSA or EC', async () => {
    asserts.assertEquals(describeKey('a-raw-secret'), { family: 'HMAC' });
    asserts.assertEquals(describeKey(''), { family: 'HMAC' });
    // A secret that merely *looks* structured is still a secret.
    asserts.assertEquals(describeKey('not-a-pem-key'), { family: 'HMAC' });

    asserts.assertEquals(describeKey(SPKI_P256), {
      family: 'EC',
      curve: 'P-256',
    });
    asserts.assertEquals(describeKey(SEC1_P256), {
      family: 'EC',
      curve: 'P-256',
    });

    const rsa = await generateRSAKeyPair({
      algorithm: 'RSA-PSS',
      keySize: 2048,
      hashAlgorithm: 'SHA-256',
      format: 'PEM',
      extractable: true,
    });
    asserts.assertEquals(describeKey(rsa.publicKeyExported as string), {
      family: 'RSA',
    });
  });

  it('describeKey - reads CryptoKey and JWK shapes', async () => {
    const ec = await generateECKeyPair({
      algorithm: 'ECDSA',
      curve: 'P-384',
      format: 'JWK',
      extractable: true,
    });
    asserts.assertEquals(describeKey(ec.publicKey), {
      family: 'EC',
      curve: 'P-384',
    });
    asserts.assertEquals(describeKey(ec.publicKeyExported as JsonWebKey), {
      family: 'EC',
      curve: 'P-384',
    });

    const rsa = await generateRSAKeyPair({
      algorithm: 'RSA-PSS',
      keySize: 2048,
      hashAlgorithm: 'SHA-256',
      format: 'JWK',
      extractable: true,
    });
    asserts.assertEquals(describeKey(rsa.publicKey), { family: 'RSA' });
    asserts.assertEquals(describeKey(rsa.publicKeyExported as JsonWebKey), {
      family: 'RSA',
    });

    asserts.assertEquals(describeKey({ kty: 'oct', k: 'AAAA' }), {
      family: 'HMAC',
    });
  });

  it('describeKey - rejects key material it cannot use', async () => {
    asserts.assertThrows(
      () => describeKey({ kty: 'OKP', crv: 'Ed25519', x: 'AAAA' }),
      Error,
      "Unsupported JWK key type 'OKP'",
    );
    asserts.assertThrows(
      () => describeKey({ kty: 'EC', crv: 'secp256k1', x: 'A', y: 'B' }),
      Error,
      'Unsupported EC JWK curve',
    );
    asserts.assertThrows(
      // @ts-expect-error a number is not key material
      () => describeKey(42),
      Error,
      'Key must be a PEM string',
    );

    // An ECDH key is an EC key, but it can never sign or verify.
    const ecdh = await generateECKeyPair({
      algorithm: 'ECDH',
      curve: 'P-256',
      extractable: true,
    });
    asserts.assertThrows(
      () => describeKey(ecdh.publicKey),
      Error,
      "CryptoKey algorithm 'ECDH' cannot sign or verify",
    );
  });

  it('resolveECCurve - pins the curve and names the mismatch', async () => {
    asserts.assertEquals(resolveECCurve(SPKI_P256), 'P-256');
    asserts.assertEquals(resolveECCurve(SPKI_P256, 'P-256'), 'P-256');

    // SECURITY: pinning a curve the key is not on must fail loudly rather
    // than fall back to the key's own curve.
    asserts.assertThrows(
      () => resolveECCurve(SPKI_P256, 'P-384'),
      Error,
      "EC key is on curve 'P-256' but this operation needs 'P-384'",
    );
    asserts.assertThrows(
      () => resolveECCurve('a-raw-secret'),
      Error,
      'ECDSA needs an EC key',
    );

    const rsa = await generateRSAKeyPair({
      algorithm: 'RSA-PSS',
      keySize: 2048,
      hashAlgorithm: 'SHA-256',
      format: 'PEM',
      extractable: true,
    });
    asserts.assertThrows(
      () => resolveECCurve(rsa.publicKeyExported as string),
      Error,
      'ECDSA needs an EC key, but the supplied key is an RSA key',
    );
  });

  it('importSigningKey - imports every accepted key form', async () => {
    // PEM (SPKI), PEM (SEC1), JWK and CryptoKey all reach the same place.
    const spki = await importSigningKey(SPKI_P256, {
      family: 'EC',
      purpose: 'verify',
      hash: 'SHA-256',
      curve: 'P-256',
    });
    asserts.assertEquals(spki.type, 'public');

    const sec1 = await importSigningKey(SEC1_P256, {
      family: 'EC',
      purpose: 'sign',
      hash: 'SHA-256',
      curve: 'P-256',
    });
    asserts.assertEquals(sec1.type, 'private');

    const jwk = await importSigningKey(RFC7515_A3_PUBLIC_JWK, {
      family: 'EC',
      purpose: 'verify',
      hash: 'SHA-256',
      curve: 'P-256',
    });
    asserts.assertEquals(jwk.type, 'public');

    const generated = await generateECKeyPair({
      algorithm: 'ECDSA',
      curve: 'P-256',
      extractable: true,
    });
    const passthrough = await importSigningKey(generated.publicKey, {
      family: 'EC',
      purpose: 'verify',
      hash: 'SHA-256',
      curve: 'P-256',
    });
    // A CryptoKey is used as-is, not re-imported.
    asserts.assertStrictEquals(passthrough, generated.publicKey);
  });

  it('importSigningKey - rejects encrypted PEM with an actionable message', () => {
    asserts.assertRejects(
      () =>
        importSigningKey(ENCRYPTED_P256, {
          family: 'EC',
          purpose: 'sign',
          hash: 'SHA-256',
          curve: 'P-256',
        }),
      Error,
      'Encrypted PEM private keys are not supported',
    );
  });

  it('importSigningKey - SECURITY: validates a supplied CryptoKey', async () => {
    const ec256 = await generateECKeyPair({
      algorithm: 'ECDSA',
      curve: 'P-256',
      extractable: true,
    });
    const ec384 = await generateECKeyPair({
      algorithm: 'ECDSA',
      curve: 'P-384',
      extractable: true,
    });
    const rsa = await generateRSAKeyPair({
      algorithm: 'RSA-PSS',
      keySize: 2048,
      hashAlgorithm: 'SHA-256',
      extractable: true,
    });

    // Wrong curve — the whole point of curve binding.
    await asserts.assertRejects(
      () =>
        importSigningKey(ec384.publicKey, {
          family: 'EC',
          purpose: 'verify',
          hash: 'SHA-256',
          curve: 'P-256',
        }),
      Error,
      "CryptoKey is on curve 'P-384' but this operation needs 'P-256'",
    );

    // Wrong algorithm entirely: an RSA key offered to ECDSA and vice versa.
    await asserts.assertRejects(
      () =>
        importSigningKey(rsa.publicKey, {
          family: 'EC',
          purpose: 'verify',
          hash: 'SHA-256',
          curve: 'P-256',
        }),
      Error,
      "CryptoKey is for 'RSA-PSS' but this operation needs 'ECDSA'",
    );
    await asserts.assertRejects(
      () =>
        importSigningKey(ec256.publicKey, {
          family: 'RSA',
          purpose: 'verify',
          hash: 'SHA-256',
          scheme: 'PSS',
        }),
      Error,
      "CryptoKey is for 'ECDSA' but this operation needs 'RSA-PSS'",
    );

    // An RSA-PSS key cannot serve RS* (PKCS#1 v1.5) — different primitive.
    await asserts.assertRejects(
      () =>
        importSigningKey(rsa.publicKey, {
          family: 'RSA',
          purpose: 'verify',
          hash: 'SHA-256',
          scheme: 'PKCS1',
        }),
      Error,
      "needs 'RSASSA-PKCS1-v1_5'",
    );

    // RSA binds its hash at import time, so a SHA-256 key cannot do SHA-512.
    await asserts.assertRejects(
      () =>
        importSigningKey(rsa.publicKey, {
          family: 'RSA',
          purpose: 'verify',
          hash: 'SHA-512',
          scheme: 'PSS',
        }),
      Error,
      "CryptoKey binds hash 'SHA-256' but this operation needs 'SHA-512'",
    );

    // A public key cannot sign, and a private key is not what verify wants.
    await asserts.assertRejects(
      () =>
        importSigningKey(ec256.publicKey, {
          family: 'EC',
          purpose: 'sign',
          hash: 'SHA-256',
          curve: 'P-256',
        }),
      Error,
      "CryptoKey is a 'public' key but sign needs a 'private' key",
    );

    // A key imported without the usage cannot be pressed into it.
    const verifyOnly = await crypto.subtle.importKey(
      'jwk',
      RFC7515_A3_PUBLIC_JWK,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    asserts.assertEquals(verifyOnly.usages, ['verify']);
  });

  it("importSigningKey - SECURITY: honours a JWK's declared metadata", async () => {
    const need = {
      family: 'EC',
      purpose: 'verify',
      hash: 'SHA-256',
      curve: 'P-256',
    } as const;

    // RFC 7517 §4.4 — `alg` names exactly one algorithm. A key that says
    // RS256 must never be pressed into ES256.
    await asserts.assertRejects(
      () => importSigningKey({ ...RFC7515_A3_PUBLIC_JWK, alg: 'RS256' }, need),
      Error,
      "JWK 'alg' is 'RS256' but this operation is 'ES256'",
    );
    // …and one that agrees is accepted.
    const agreeing = await importSigningKey(
      { ...RFC7515_A3_PUBLIC_JWK, alg: 'ES256' },
      need,
    );
    asserts.assertEquals(agreeing.type, 'public');

    // RFC 7517 §4.2 — an encryption key must not verify signatures.
    await asserts.assertRejects(
      () => importSigningKey({ ...RFC7515_A3_PUBLIC_JWK, use: 'enc' }, need),
      Error,
      "JWK 'use' is 'enc'",
    );

    // RFC 7517 §4.3 — when key_ops is present it is exhaustive.
    await asserts.assertRejects(
      () =>
        importSigningKey(
          { ...RFC7515_A3_PUBLIC_JWK, key_ops: ['encrypt'] },
          need,
        ),
      Error,
      "JWK 'key_ops' does not permit 'verify'",
    );

    // kty / crv must match the operation.
    await asserts.assertRejects(
      () => importSigningKey({ kty: 'oct', k: 'AAAA' }, need),
      Error,
      "JWK 'kty' is 'oct' but this operation needs 'EC'",
    );
    await asserts.assertRejects(
      () => importSigningKey({ ...RFC7515_A3_PUBLIC_JWK, crv: 'P-384' }, need),
      Error,
      "JWK 'crv' is 'P-384' but this operation needs 'P-256'",
    );

    // A JWK carrying `d` is private material and has no business being
    // handed to a verifier — that is a key-confusion bug, not a public key.
    await asserts.assertRejects(
      () =>
        importSigningKey(
          {
            ...RFC7515_A3_PUBLIC_JWK,
            d: 'jpsQnnGQmL-YBIffH1136cspYG6-0iY7X1fCE9-E9LI',
          },
          need,
        ),
      Error,
      "carries private material ('d')",
    );

    // …and the converse: signing needs `d`.
    await asserts.assertRejects(
      () =>
        importSigningKey(RFC7515_A3_PUBLIC_JWK, {
          family: 'EC',
          purpose: 'sign',
          hash: 'SHA-256',
          curve: 'P-256',
        }),
      Error,
      "Signing needs a private JWK, but the supplied key has no 'd'",
    );
  });
});
