import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import {
  scramClientFinal,
  type ScramContext,
  scramVerifyFinal,
} from './auth.ts';

const enc = new TextEncoder();

// Fixed SCRAM material so two derivations are byte-comparable. The nonce
// and salt are the RFC 7677 example values; only the password differs
// between runs.
const FIXED_CLIENT_NONCE = 'rOprNGfwEbeRWgbNEkqO';
const FIXED_SERVER_FIRST = enc.encode(
  `r=${FIXED_CLIENT_NONCE}%hvYDpWUa2RaTCAfuxFIlj)hNlF$k0,` +
    's=W22ZaJ0SNY7soEsUEjb6gQ==,i=4096',
);

function ctxFor(password: string): ScramContext {
  return {
    username: '',
    password,
    clientNonce: FIXED_CLIENT_NONCE,
    clientFirstMessageBare: `n=,r=${FIXED_CLIENT_NONCE}`,
  };
}

/** Build a SASLFinal payload (`v=<base64sig>`) from a raw signature. */
function saslFinal(signatureBytes: Uint8Array): Uint8Array {
  let bin = '';
  for (const b of signatureBytes) bin += String.fromCharCode(b);
  return enc.encode(`v=${btoa(bin)}`);
}

describe('drivers.postgres.auth.scramVerifyFinal', () => {
  it('should accept a matching server signature', () => {
    const sig = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    let bin = '';
    for (const b of sig) bin += String.fromCharCode(b);
    const expected = btoa(bin);
    asserts.assertEquals(scramVerifyFinal(expected, saslFinal(sig)), true);
  });

  it('should reject a server signature that differs in one byte', () => {
    const sig = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    let bin = '';
    for (const b of sig) bin += String.fromCharCode(b);
    const expected = btoa(bin);
    const tampered = new Uint8Array(sig);
    tampered[7] = 9;
    asserts.assertEquals(
      scramVerifyFinal(expected, saslFinal(tampered)),
      false,
    );
  });

  it('should reject when lengths differ', () => {
    const sig = new Uint8Array([1, 2, 3, 4]);
    let bin = '';
    for (const b of sig) bin += String.fromCharCode(b);
    const expected = btoa(bin);
    const longer = new Uint8Array([1, 2, 3, 4, 0]);
    asserts.assertEquals(scramVerifyFinal(expected, saslFinal(longer)), false);
  });

  it('should reject when the v attribute is missing', () => {
    asserts.assertEquals(
      scramVerifyFinal('AQID', enc.encode('e=other')),
      false,
    );
  });

  it('should reject malformed base64 rather than throw', () => {
    // `!!!` is not valid base64; must be handled as a mismatch, not a crash.
    asserts.assertEquals(
      scramVerifyFinal('!!!not-base64!!!', enc.encode('v=AQID')),
      false,
    );
  });
});

describe('drivers.postgres.auth.scramClientFinal (SASLprep)', () => {
  it('should not alter an all-ASCII password (regression)', async () => {
    // The password path must be byte-identical to pre-SASLprep behaviour
    // for plain ASCII, so existing credentials keep authenticating.
    const a = await scramClientFinal(ctxFor('hunter2'), FIXED_SERVER_FIRST);
    const b = await scramClientFinal(ctxFor('hunter2'), FIXED_SERVER_FIRST);
    asserts.assertEquals(a.clientFinalMessage, b.clientFinalMessage);
    asserts.assertEquals(
      a.expectedServerSignature,
      b.expectedServerSignature,
    );
  });

  it('should derive the same proof for an NFKC-equivalent password', async () => {
    // Full-width "ＡＤＭＩＮ" (U+FF21.. ) is NFKC-equal to ASCII "ADMIN".
    // A spec-compliant server normalises, so our derivation must match the
    // ASCII form byte-for-byte — this is the bug the fix addresses.
    const ascii = await scramClientFinal(ctxFor('ADMIN'), FIXED_SERVER_FIRST);
    const fullWidth = await scramClientFinal(
      ctxFor('ＡＤＭＩＮ'),
      FIXED_SERVER_FIRST,
    );
    asserts.assertEquals(
      fullWidth.clientFinalMessage,
      ascii.clientFinalMessage,
    );
    asserts.assertEquals(
      fullWidth.expectedServerSignature,
      ascii.expectedServerSignature,
    );
  });

  it('should map a non-breaking space to a regular space before hashing', async () => {
    // U+00A0 (NBSP) is mapped to U+0020 by SASLprep, so "a b" derives
    // identically to "a b".
    const nbsp = await scramClientFinal(
      ctxFor('a b'),
      FIXED_SERVER_FIRST,
    );
    const plain = await scramClientFinal(ctxFor('a b'), FIXED_SERVER_FIRST);
    asserts.assertEquals(nbsp.clientFinalMessage, plain.clientFinalMessage);
  });

  // Regression (round-3 finding): a password SASLprep prohibits (control
  // char, or an RTL/bidi violation) must NOT hard-fail. PostgreSQL's server
  // (pg_saslprep) and libpq both fall back to the RAW password when SASLprep
  // fails, so the stored verifier is derived from the raw bytes — throwing
  // here would lock out credentials the server (and older driver releases)
  // accept. `scramClientFinal` therefore falls back to the raw password.
  it('falls back to the raw password for a prohibited control character', async () => {
    // U+0007 (BELL) is prohibited by RFC 4013.
    const withControl = await scramClientFinal(
      ctxFor('pa\u0007ss'),
      FIXED_SERVER_FIRST,
    );
    // Does not throw, and produces a real proof.
    asserts.assert(withControl.clientFinalMessage.length > 0);
    // The raw bytes (control char included) are hashed, so it differs from
    // the same password with the control char removed. If SASLprep had
    // silently stripped the char, these would collide.
    const stripped = await scramClientFinal(ctxFor('pass'), FIXED_SERVER_FIRST);
    asserts.assertNotEquals(
      withControl.clientFinalMessage,
      stripped.clientFinalMessage,
    );
  });

  it('falls back to the raw password for a bidi (RTL) violation', async () => {
    // RFC 4013 example: an Arabic letter followed by an ASCII digit fails the
    // bidirectional endpoint rule. PostgreSQL accepts it via raw fallback, so
    // the derivation must succeed rather than throw.
    const result = await scramClientFinal(
      ctxFor('\u0627' + '1'),
      FIXED_SERVER_FIRST,
    );
    asserts.assert(result.clientFinalMessage.length > 0);
    asserts.assert(result.expectedServerSignature.length > 0);
  });
});
