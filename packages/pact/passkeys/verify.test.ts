/**
 * @fileoverview Tests for WebAuthn ceremony verification against a
 * synthetic authenticator (real WebCrypto keys, spec-shaped payloads).
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import {
  normalizePasskeyConfig,
  verifyAssertionCeremony,
  verifyRegistrationCeremony,
} from './mod.ts';
import { createAuthenticator } from './fixtures/authenticator.ts';
import { PactError } from '../errors/mod.ts';
import type { PactStoredPasskey } from '../types/mod.ts';

const RP_ID = 'example.dev';
const ORIGIN = 'https://app.example.dev';
const CONFIG = normalizePasskeyConfig({
  rpId: RP_ID,
  rpName: 'Example',
  origins: [ORIGIN],
});
const UV_REQUIRED = normalizePasskeyConfig({
  rpId: RP_ID,
  rpName: 'Example',
  origins: [ORIGIN],
  userVerification: 'REQUIRED',
});
const CHALLENGE = 'dGVzdC1jaGFsbGVuZ2UtMzItYnl0ZXMtbG9uZyEh';

async function registered(
  algorithm: 'ES256' | 'RS256' = 'ES256',
): Promise<{
  authenticator: Awaited<ReturnType<typeof createAuthenticator>>;
  passkey: PactStoredPasskey;
}> {
  const authenticator = await createAuthenticator(RP_ID, algorithm);
  const verified = await verifyRegistrationCeremony(
    await authenticator.registrationResponse({
      challenge: CHALLENGE,
      origin: ORIGIN,
    }),
    CHALLENGE,
    CONFIG,
  );
  return { authenticator, passkey: { ...verified, userId: 'u1' } };
}

describe('normalizePasskeyConfig', () => {
  it('should apply defaults and canonicalize origins', () => {
    asserts.assertStrictEquals(CONFIG.userVerification, 'PREFERRED');
    asserts.assertEquals([...CONFIG.algorithms].sort(), ['ES256', 'RS256']);
    asserts.assertStrictEquals(CONFIG.timeout, 60_000);
    asserts.assert(CONFIG.origins.has(ORIGIN));
  });

  it('should reject malformed blocks with INVALID_OPTION', () => {
    const cases: Record<string, unknown>[] = [
      { rpId: '', rpName: 'x', origins: [ORIGIN] },
      { rpId: 'https://x.dev', rpName: 'x', origins: [ORIGIN] },
      { rpId: RP_ID, rpName: '', origins: [ORIGIN] },
      { rpId: RP_ID, rpName: 'x', origins: [] },
      { rpId: RP_ID, rpName: 'x', origins: ['not a url'] },
      // origin outside the rpId scope
      { rpId: RP_ID, rpName: 'x', origins: ['https://evil.example'] },
      // lowercase enum — pact option values are uppercase
      {
        rpId: RP_ID,
        rpName: 'x',
        origins: [ORIGIN],
        userVerification: 'preferred',
      },
      { rpId: RP_ID, rpName: 'x', origins: [ORIGIN], algorithms: [] },
      { rpId: RP_ID, rpName: 'x', origins: [ORIGIN], algorithms: ['ES512'] },
      { rpId: RP_ID, rpName: 'x', origins: [ORIGIN], timeout: -1 },
    ];
    for (const bad of cases) {
      const error = asserts.assertThrows(
        // deno-lint-ignore no-explicit-any
        () => normalizePasskeyConfig(bad as any),
        PactError,
      );
      asserts.assertStrictEquals(
        error.code,
        'INVALID_OPTION',
        JSON.stringify(bad),
      );
    }
  });
});

describe('verifyRegistrationCeremony', () => {
  it('should extract the stored shape from a valid ES256 ceremony', async () => {
    const authenticator = await createAuthenticator(RP_ID);
    const verified = await verifyRegistrationCeremony(
      await authenticator.registrationResponse({
        challenge: CHALLENGE,
        origin: ORIGIN,
        signCount: 5,
      }),
      CHALLENGE,
      CONFIG,
    );
    asserts.assertStrictEquals(verified.id, authenticator.credentialId);
    asserts.assertStrictEquals(verified.algorithm, 'ES256');
    asserts.assertStrictEquals(verified.signCount, 5);
    asserts.assertEquals(verified.transports, ['internal']);
    const jwk = JSON.parse(verified.publicKey) as { kty: string; crv: string };
    asserts.assertStrictEquals(jwk.kty, 'EC');
    asserts.assertStrictEquals(jwk.crv, 'P-256');
  });

  it('should accept RS256 when enabled', async () => {
    const authenticator = await createAuthenticator(RP_ID, 'RS256');
    const verified = await verifyRegistrationCeremony(
      await authenticator.registrationResponse({
        challenge: CHALLENGE,
        origin: ORIGIN,
      }),
      CHALLENGE,
      CONFIG,
    );
    asserts.assertStrictEquals(verified.algorithm, 'RS256');
  });

  it('should reject every tampered ceremony input with a reason', async () => {
    const authenticator = await createAuthenticator(RP_ID);
    const cases: [
      string,
      Parameters<typeof authenticator.registrationResponse>[0],
      string,
    ][] = [
      ['wrong type', {
        challenge: CHALLENGE,
        origin: ORIGIN,
        type: 'webauthn.get',
      }, CHALLENGE],
      ['wrong challenge', { challenge: 'ZXZpbA', origin: ORIGIN }, CHALLENGE],
      ['wrong origin', {
        challenge: CHALLENGE,
        origin: 'https://evil.example',
      }, CHALLENGE],
      ['foreign rpId', {
        challenge: CHALLENGE,
        origin: ORIGIN,
        rpId: 'evil.example',
      }, CHALLENGE],
      ['no attested credential', {
        challenge: CHALLENGE,
        origin: ORIGIN,
        flags: 0x01, // UP only, no AT
      }, CHALLENGE],
      ['no user presence', {
        challenge: CHALLENGE,
        origin: ORIGIN,
        flags: 0x40, // AT only
      }, CHALLENGE],
    ];
    for (const [name, input, expectedChallenge] of cases) {
      const error = await asserts.assertRejects(
        async () =>
          await verifyRegistrationCeremony(
            await authenticator.registrationResponse(input),
            expectedChallenge,
            CONFIG,
          ),
        PactError,
        undefined,
        name,
      );
      asserts.assertStrictEquals(error.code, 'PASSKEY_REGISTRATION_FAILED');
    }
  });

  it('should require user verification when configured REQUIRED', async () => {
    const authenticator = await createAuthenticator(RP_ID);
    const response = await authenticator.registrationResponse({
      challenge: CHALLENGE,
      origin: ORIGIN,
      flags: 0x01 | 0x40, // UP + AT, no UV
    });
    await asserts.assertRejects(
      () => verifyRegistrationCeremony(response, CHALLENGE, UV_REQUIRED),
      PactError,
      'user verification',
    );
  });

  it('should reject a disabled algorithm', async () => {
    const rsaOnly = normalizePasskeyConfig({
      rpId: RP_ID,
      rpName: 'Example',
      origins: [ORIGIN],
      algorithms: ['RS256'],
    });
    const authenticator = await createAuthenticator(RP_ID); // ES256
    await asserts.assertRejects(
      async () =>
        await verifyRegistrationCeremony(
          await authenticator.registrationResponse({
            challenge: CHALLENGE,
            origin: ORIGIN,
          }),
          CHALLENGE,
          rsaOnly,
        ),
      PactError,
      "algorithm 'ES256' is not enabled",
    );
  });

  it('should reject junk payloads without raw TypeErrors', async () => {
    const junk = [
      null,
      {},
      { id: 'x', response: {} },
      {
        id: 'x',
        response: { clientDataJSON: '%%%', attestationObject: '%%%' },
      },
      {
        id: 'x',
        response: { clientDataJSON: 'e30', attestationObject: 'e30' },
      },
    ];
    for (const payload of junk) {
      const error = await asserts.assertRejects(
        // deno-lint-ignore no-explicit-any
        () => verifyRegistrationCeremony(payload as any, CHALLENGE, CONFIG),
        PactError,
      );
      asserts.assertStrictEquals(error.code, 'PASSKEY_REGISTRATION_FAILED');
    }
  });
});

describe('verifyAssertionCeremony', () => {
  it('should validate a genuine assertion for both algorithms', async () => {
    for (const algorithm of ['ES256', 'RS256'] as const) {
      const { authenticator, passkey } = await registered(algorithm);
      const verdict = await verifyAssertionCeremony(
        await authenticator.assertionResponse({
          challenge: CHALLENGE,
          origin: ORIGIN,
          signCount: 1,
        }),
        CHALLENGE,
        CONFIG,
        passkey,
      );
      asserts.assert(verdict.valid, algorithm);
      asserts.assertStrictEquals(
        verdict.valid ? verdict.signCount : -1,
        1,
        algorithm,
      );
    }
  });

  it('should reject tampered or misdirected assertions', async () => {
    const { authenticator, passkey } = await registered();
    const inputs: [
      string,
      Parameters<typeof authenticator.assertionResponse>[0],
    ][] = [
      ['tampered signature', {
        challenge: CHALLENGE,
        origin: ORIGIN,
        signCount: 1,
        tamper: true,
      }],
      ['wrong challenge', {
        challenge: 'ZXZpbA',
        origin: ORIGIN,
        signCount: 1,
      }],
      ['wrong origin', {
        challenge: CHALLENGE,
        origin: 'https://evil.example',
        signCount: 1,
      }],
      ['wrong type', {
        challenge: CHALLENGE,
        origin: ORIGIN,
        signCount: 1,
        type: 'webauthn.create',
      }],
      ['foreign rpId', {
        challenge: CHALLENGE,
        origin: ORIGIN,
        signCount: 1,
        rpId: 'evil.example',
      }],
      ['no user presence', {
        challenge: CHALLENGE,
        origin: ORIGIN,
        signCount: 1,
        flags: 0,
      }],
    ];
    for (const [name, input] of inputs) {
      const verdict = await verifyAssertionCeremony(
        await authenticator.assertionResponse(input),
        CHALLENGE,
        CONFIG,
        passkey,
      );
      asserts.assertFalse(verdict.valid, name);
      asserts.assertFalse(
        verdict.valid === false && verdict.cloneSuspected,
        name,
      );
    }
  });

  it('should flag a counter regression as a suspected clone', async () => {
    const { authenticator, passkey } = await registered();
    const advanced: PactStoredPasskey = { ...passkey, signCount: 10 };
    const verdict = await verifyAssertionCeremony(
      await authenticator.assertionResponse({
        challenge: CHALLENGE,
        origin: ORIGIN,
        signCount: 10, // not greater than stored
      }),
      CHALLENGE,
      CONFIG,
      advanced,
    );
    asserts.assertFalse(verdict.valid);
    asserts.assert(verdict.valid === false && verdict.cloneSuspected);
  });

  it('should skip the counter check for synced passkeys at zero', async () => {
    const { authenticator, passkey } = await registered();
    const verdict = await verifyAssertionCeremony(
      await authenticator.assertionResponse({
        challenge: CHALLENGE,
        origin: ORIGIN,
        signCount: 0,
      }),
      CHALLENGE,
      CONFIG,
      { ...passkey, signCount: 0 },
    );
    asserts.assert(verdict.valid);
  });

  it('should require user verification when configured REQUIRED', async () => {
    const { authenticator, passkey } = await registered();
    const verdict = await verifyAssertionCeremony(
      await authenticator.assertionResponse({
        challenge: CHALLENGE,
        origin: ORIGIN,
        signCount: 1,
        flags: 0x01, // UP only
      }),
      CHALLENGE,
      UV_REQUIRED,
      passkey,
    );
    asserts.assertFalse(verdict.valid);
  });

  it('should fail closed on a corrupt stored public key', async () => {
    const { authenticator, passkey } = await registered();
    const verdict = await verifyAssertionCeremony(
      await authenticator.assertionResponse({
        challenge: CHALLENGE,
        origin: ORIGIN,
        signCount: 1,
      }),
      CHALLENGE,
      CONFIG,
      { ...passkey, publicKey: 'not json' },
    );
    asserts.assertFalse(verdict.valid);
  });
});

describe('hostile registration payloads', () => {
  async function hostileRegistration(
    cosePublicKey: Map<number, unknown>,
  ): Promise<Parameters<typeof verifyRegistrationCeremony>[0]> {
    const { cborEncode } = await import('./fixtures/authenticator.ts');
    const { encodeBase64Url } = await import('@std/encoding');
    const rpIdHash = new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(RP_ID)),
    );
    const credentialId = crypto.getRandomValues(new Uint8Array(16));
    const authData = new Uint8Array([
      ...rpIdHash,
      0x45, // UP | UV | AT
      0,
      0,
      0,
      0,
      ...new Uint8Array(16),
      0,
      credentialId.length,
      ...credentialId,
      ...cborEncode(cosePublicKey),
    ]);
    const attestationObject = cborEncode(
      new Map<string, unknown>([
        ['fmt', 'none'],
        ['attStmt', new Map()],
        ['authData', authData],
      ]),
    );
    const clientDataJSON = encodeBase64Url(
      new TextEncoder().encode(JSON.stringify({
        type: 'webauthn.create',
        challenge: CHALLENGE,
        origin: ORIGIN,
      })),
    );
    return {
      id: encodeBase64Url(credentialId),
      response: {
        clientDataJSON,
        attestationObject: encodeBase64Url(attestationObject),
      },
    };
  }

  it('should refuse self-inconsistent COSE keys', async () => {
    const rsa = await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['sign', 'verify'],
    );
    const jwk = await crypto.subtle.exportKey('jwk', rsa.publicKey);
    const { decodeBase64Url } = await import('@std/encoding');
    const n = decodeBase64Url(jwk.n!);
    const cases: [string, Map<number, unknown>][] = [
      [
        'RSA material labeled ES256',
        new Map<number, unknown>([
          [1, 3],
          [3, -7],
          [-1, n],
          [-2, decodeBase64Url(jwk.e!)],
        ]),
      ],
      [
        'RSA with forgeable exponent e=1',
        new Map<number, unknown>([
          [1, 3],
          [3, -257],
          [-1, n],
          [-2, new Uint8Array([1])],
        ]),
      ],
      [
        'short EC coordinates',
        new Map<number, unknown>([
          [1, 2],
          [3, -7],
          [-1, 1],
          [-2, new Uint8Array(31)],
          [-3, new Uint8Array(31)],
        ]),
      ],
    ];
    for (const [name, cose] of cases) {
      const error = await asserts.assertRejects(
        async () =>
          await verifyRegistrationCeremony(
            await hostileRegistration(cose),
            CHALLENGE,
            CONFIG,
          ),
        PactError,
        undefined,
        name,
      );
      asserts.assertStrictEquals(
        error.code,
        'PASSKEY_REGISTRATION_FAILED',
        name,
      );
    }
  });

  it('should reject a CBOR nesting bomb quickly with a typed error', async () => {
    const { encodeBase64Url } = await import('@std/encoding');
    const bomb = new Uint8Array(200_000).fill(0x81); // [[[[...
    bomb[bomb.length - 1] = 0x00;
    const started = Date.now();
    const error = await asserts.assertRejects(
      () =>
        verifyRegistrationCeremony(
          {
            id: 'YWJj',
            response: {
              clientDataJSON: encodeBase64Url(
                new TextEncoder().encode(JSON.stringify({
                  type: 'webauthn.create',
                  challenge: CHALLENGE,
                  origin: ORIGIN,
                })),
              ),
              attestationObject: encodeBase64Url(bomb),
            },
          },
          CHALLENGE,
          CONFIG,
        ),
      PactError,
    );
    asserts.assertStrictEquals(error.code, 'PASSKEY_REGISTRATION_FAILED');
    asserts.assert(Date.now() - started < 5_000, 'must fail fast');
  });
});

describe('registration response integrity', () => {
  it('should reject a response id that differs from the attested credential', async () => {
    const authenticator = await createAuthenticator(RP_ID);
    const response = await authenticator.registrationResponse({
      challenge: CHALLENGE,
      origin: ORIGIN,
    });
    const swapped = { ...response, id: 'c29tZW9uZS1lbHNl' };
    await asserts.assertRejects(
      () => verifyRegistrationCeremony(swapped, CHALLENGE, CONFIG),
      PactError,
      'does not match the attested credential',
    );
  });

  it('should sanitize junk transports instead of storing them', async () => {
    const authenticator = await createAuthenticator(RP_ID);
    const response = await authenticator.registrationResponse({
      challenge: CHALLENGE,
      origin: ORIGIN,
    });
    const junk = {
      ...response,
      response: {
        ...response.response,
        // deno-lint-ignore no-explicit-any
        transports: [7, null, 'x'.repeat(64)] as any,
      },
    };
    const verified = await verifyRegistrationCeremony(junk, CHALLENGE, CONFIG);
    asserts.assertStrictEquals(verified.transports, undefined);
  });
});
