import * as asserts from '@std/asserts';
import { decodeBase64Url } from '@std/encoding';
import { describe, it } from '@tundralibs/compat/test';
import { decodeCBOR } from './decode.ts';
import { coseToJwk } from './cose.ts';
import { CBORError } from './errors/mod.ts';
import type { CBORValue } from './types/mod.ts';

// A throwaway CBOR encoder — just enough (uints, negints, byte strings,
// maps) to serialise a COSE key so the decode → coseToJwk pipeline can be
// tested against a real, generated key. Its correctness is anchored by the
// importKey + verify round-trip below: garbage bytes would fail the verify.
function encodeUint(major: number, n: number): number[] {
  const head = major << 5;
  if (n < 24) return [head | n];
  if (n < 256) return [head | 24, n];
  if (n < 65536) return [head | 25, n >> 8, n & 0xff];
  throw new Error('test encoder: integer too large');
}
function enc(v: unknown): number[] {
  if (typeof v === 'number' && Number.isInteger(v)) {
    return v >= 0 ? encodeUint(0, v) : encodeUint(1, -1 - v);
  }
  if (v instanceof Uint8Array) return [...encodeUint(2, v.length), ...v];
  if (v instanceof Map) {
    const out = [...encodeUint(5, v.size)];
    for (const [k, val] of v) out.push(...enc(k), ...enc(val));
    return out;
  }
  throw new Error(`test encoder: unsupported ${typeof v}`);
}
const encodeCBOR = (v: unknown): Uint8Array => new Uint8Array(enc(v));

const MESSAGE = new TextEncoder().encode('authenticatorData‖clientDataHash');

describe('crypt.cbor coseToJwk — EC2', () => {
  it('round-trips a P-256 key: COSE → decode → jwk → import → verify', async () => {
    const pair = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify'],
    );
    const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
    // Build the COSE_Key: {1:2 (EC2), 3:-7 (ES256), -1:1 (P-256), -2:x, -3:y}
    const cose = new Map<CBORValue, CBORValue>([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, decodeBase64Url(jwk.x!)],
      [-3, decodeBase64Url(jwk.y!)],
    ]);

    const result = coseToJwk(decodeCBOR(encodeCBOR(cose)));
    asserts.assertEquals(result.algorithm, 'ES256');
    asserts.assertEquals(result.jwk.kty, 'EC');
    asserts.assertEquals(result.jwk.crv, 'P-256');
    asserts.assertEquals(result.jwk.x, jwk.x);
    asserts.assertEquals(result.jwk.y, jwk.y);

    // The anchor: the reconstructed key verifies a real signature.
    const signature = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      pair.privateKey,
      MESSAGE,
    );
    const imported = await crypto.subtle.importKey(
      'jwk',
      result.jwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    asserts.assert(
      await crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        imported,
        signature,
        MESSAGE,
      ),
    );
  });

  it('derives the algorithm from the curve when the alg label is absent', () => {
    const cose = new Map<CBORValue, CBORValue>([
      [1, 2],
      [-1, 1],
      [-2, new Uint8Array(32)],
      [-3, new Uint8Array(32)],
    ]);
    asserts.assertEquals(coseToJwk(cose).algorithm, 'ES256');
  });
});

describe('crypt.cbor coseToJwk — RSA', () => {
  it('round-trips an RS256 key: COSE → decode → jwk → import → verify', async () => {
    const pair = await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['sign', 'verify'],
    );
    const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
    const cose = new Map<CBORValue, CBORValue>([
      [1, 3],
      [3, -257],
      [-1, decodeBase64Url(jwk.n!)],
      [-2, decodeBase64Url(jwk.e!)],
    ]);

    const result = coseToJwk(decodeCBOR(encodeCBOR(cose)));
    asserts.assertEquals(result.algorithm, 'RS256');
    asserts.assertEquals(result.jwk.kty, 'RSA');
    asserts.assertEquals(result.jwk.n, jwk.n);
    asserts.assertEquals(result.jwk.e, jwk.e);

    const signature = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      pair.privateKey,
      MESSAGE,
    );
    const imported = await crypto.subtle.importKey(
      'jwk',
      result.jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    asserts.assert(
      await crypto.subtle.verify(
        'RSASSA-PKCS1-v1_5',
        imported,
        signature,
        MESSAGE,
      ),
    );
  });
});

describe('crypt.cbor coseToJwk — errors', () => {
  it('rejects a non-map, an unknown key type, and missing fields', () => {
    asserts.assertThrows(() => coseToJwk(42), CBORError);
    asserts.assertThrows(
      () => coseToJwk(new Map<CBORValue, CBORValue>([[1, 4]])), // kty 4 (unsupported)
      CBORError,
    );
    asserts.assertThrows(
      () =>
        coseToJwk(
          new Map<CBORValue, CBORValue>([[1, 2], [-1, 1], [
            -2,
            new Uint8Array(32),
          ]]),
        ), // EC2 missing y
      CBORError,
    );
    asserts.assertThrows(
      () =>
        coseToJwk(
          new Map<CBORValue, CBORValue>([[1, 2], [-1, 99], [
            -2,
            new Uint8Array(32),
          ], [
            -3,
            new Uint8Array(32),
          ]]),
        ), // unknown curve
      CBORError,
    );
  });
});
