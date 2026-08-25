import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { decodeBase64 } from '@std/encoding';
import { ecdsaDerToRaw, verifyEC } from './mod.ts';
import type { ECCurve } from './mod.ts';

/**
 * Encodes one non-negative big-endian value as a DER `INTEGER`: strip leading
 * zeros to minimal length, then prepend `0x00` when the top bit is set so the
 * value stays positive. The inverse of what {@link ecdsaDerToRaw} undoes.
 */
const toDerInteger = (bytes: Uint8Array): Uint8Array => {
  let i = 0;
  while (i < bytes.length - 1 && bytes[i] === 0) i += 1;
  let v = bytes.slice(i);
  if ((v[0]! & 0x80) !== 0) {
    const padded = new Uint8Array(v.length + 1);
    padded.set(v, 1);
    v = padded;
  }
  const out = new Uint8Array(2 + v.length);
  out[0] = 0x02;
  out[1] = v.length; // r/s content stays under 128 octets, so single-octet length
  out.set(v, 2);
  return out;
};

/** Wraps content in a DER `SEQUENCE`, using long-form length past 127 octets. */
const derSequence = (content: Uint8Array): Uint8Array => {
  const lenOctets = content.length < 128 ? [content.length] : [
    0x81,
    content.length,
  ];
  const out = new Uint8Array(1 + lenOctets.length + content.length);
  out[0] = 0x30;
  out.set(lenOctets, 1);
  out.set(content, 1 + lenOctets.length);
  return out;
};

/** Re-encodes a raw `R‖S` signature as a DER `Ecdsa-Sig-Value`. */
const rawToDer = (raw: Uint8Array): Uint8Array => {
  const half = raw.length / 2;
  const rInt = toDerInteger(raw.subarray(0, half));
  const sInt = toDerInteger(raw.subarray(half));
  const body = new Uint8Array(rInt.length + sInt.length);
  body.set(rInt, 0);
  body.set(sInt, rInt.length);
  return derSequence(body);
};

/** Concatenates byte buffers. */
const concat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

describe('crypt.sign.ecdsaDerToRaw', () => {
  const roundTrip = async (curve: ECCurve) => {
    const pair = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: curve },
      true,
      ['sign', 'verify'],
    );
    const publicKey = await crypto.subtle.exportKey('jwk', pair.publicKey);
    const data = new TextEncoder().encode(`assertion over ${curve}`);

    // Web Crypto signs to raw R‖S; re-encode as DER to feed the converter, so
    // any wrong byte would fail both the identity check and verification.
    const rawSig = new Uint8Array(
      await crypto.subtle.sign(
        { name: 'ECDSA', hash: curve === 'P-256' ? 'SHA-256' : 'SHA-384' },
        pair.privateKey,
        data,
      ),
    );
    const der = rawToDer(rawSig);
    const converted = ecdsaDerToRaw(der, curve);

    asserts.assertEquals(
      decodeBase64(converted),
      rawSig,
      'converted R‖S must equal the signature Web Crypto produced',
    );
    asserts.assertEquals(
      await verifyEC(data, converted, publicKey),
      true,
      'the converted signature must verify against the signer',
    );
  };

  it('round-trips a real P-256 signature through DER back to R‖S', async () => {
    // Several draws so a signature whose r or s happens to have a high top bit
    // (and so a 0x00 DER pad) is exercised, not just the common case.
    for (let n = 0; n < 5; n++) {
      await roundTrip('P-256');
    }
  });

  it('round-trips a real P-384 signature', async () => {
    await roundTrip('P-384');
  });

  it('left-pads short integers to the curve field width', () => {
    // SEQUENCE { INTEGER 0x07, INTEGER 0x08 }
    const der = new Uint8Array([
      0x30,
      0x06,
      0x02,
      0x01,
      0x07,
      0x02,
      0x01,
      0x08,
    ]);
    const raw = decodeBase64(ecdsaDerToRaw(der, 'P-256'));
    asserts.assertEquals(raw.length, 64);
    asserts.assertEquals(raw[31], 0x07);
    asserts.assertEquals(raw[63], 0x08);
    asserts.assertEquals(raw.slice(0, 31).every((b) => b === 0), true);
    asserts.assertEquals(raw.slice(32, 63).every((b) => b === 0), true);
  });

  it('strips the sign-guard 0x00 a high-bit integer carries', () => {
    // r = 0x0080 (128, DER-padded), s = 0x01
    const der = new Uint8Array([
      0x30,
      0x07,
      0x02,
      0x02,
      0x00,
      0x80,
      0x02,
      0x01,
      0x01,
    ]);
    const raw = decodeBase64(ecdsaDerToRaw(der, 'P-256'));
    asserts.assertEquals(raw.length, 64);
    asserts.assertEquals(raw[31], 0x80);
    asserts.assertEquals(raw[63], 0x01);
  });

  it('rejects DER that is not a SEQUENCE', () => {
    asserts.assertThrows(
      () => ecdsaDerToRaw(new Uint8Array([0x02, 0x01, 0x01]), 'P-256'),
      Error,
      'not a DER SEQUENCE',
    );
  });

  it('rejects trailing bytes after the SEQUENCE', () => {
    const der = concat(
      new Uint8Array([0x30, 0x06, 0x02, 0x01, 0x07, 0x02, 0x01, 0x08]),
      new Uint8Array([0x00]),
    );
    asserts.assertThrows(
      () => ecdsaDerToRaw(der, 'P-256'),
      Error,
      'trailing bytes',
    );
  });

  it('rejects a SEQUENCE with more than two integers', () => {
    const int = new Uint8Array([0x02, 0x01, 0x01]);
    const der = derSequence(concat(int, int, int));
    asserts.assertThrows(
      () => ecdsaDerToRaw(der, 'P-256'),
      Error,
      'more than two integers',
    );
  });

  it('rejects a first element that is not an INTEGER', () => {
    // SEQUENCE { OCTET STRING 0x01, INTEGER 0x01 }
    const der = derSequence(
      concat(
        new Uint8Array([0x04, 0x01, 0x01]),
        new Uint8Array([
          0x02,
          0x01,
          0x01,
        ]),
      ),
    );
    asserts.assertThrows(
      () => ecdsaDerToRaw(der, 'P-256'),
      Error,
      "'r' is not a DER INTEGER",
    );
  });

  it('rejects an integer wider than the curve field', () => {
    // A 33-octet r cannot belong to a P-256 signature (field is 32).
    const wide = concat(
      new Uint8Array([0x02, 0x21]),
      new Uint8Array(33).fill(1),
    );
    const der = derSequence(concat(wide, new Uint8Array([0x02, 0x01, 0x01])));
    asserts.assertThrows(
      () => ecdsaDerToRaw(der, 'P-256'),
      Error,
      'wider than',
    );
  });
});
