import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { issueJWT } from './issue.ts';
import { JWTError } from './errors/mod.ts';
import type { JWTPayload, JWTVerifyOptions } from './types/mod.ts';
import { verifyJWT } from './verify.ts';

const TEST_SECRET = 'test-secret-at-least-256-bits-long-for-testing-purposes';

/**
 * Mint a genuinely-signed HS256 token from a caller-supplied header, so tests
 * can exercise header shapes `issueJWT` will not produce (notably a header
 * with no `typ` at all — Apple's OIDC id_token shape). Signed with the real
 * primitives rather than hand-assembled, so these tokens fail only on the
 * property under test, never on a bad signature.
 */
const mintHS256 = async (
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
): Promise<string> => {
  const { encodeBase64Url } = await import('@std/encoding');
  const { signHMAC } = await import('../sign/mod.ts');
  const { toJwtSignature } = await import('./helpers.ts');
  const h = encodeBase64Url(JSON.stringify(header));
  const p = encodeBase64Url(JSON.stringify(payload));
  const sig = await signHMAC(`${h}.${p}`, TEST_SECRET, {
    hashAlgorithm: 'SHA-256',
  });
  return `${h}.${p}.${toJwtSignature(sig, 'HMAC')}`;
};

/**
 * Mint a genuinely-HS256-signed token from raw header/payload JSON *strings*,
 * so a test can place a non-object segment (`null`, `42`, `[]`) that
 * `JSON.stringify` of a typed object could never produce. The signature is
 * real, so verification fails only on the segment shape under test.
 */
const mintRawHS256 = async (
  headerJson: string,
  payloadJson: string,
): Promise<string> => {
  const { encodeBase64Url } = await import('@std/encoding');
  const { signHMAC } = await import('../sign/mod.ts');
  const { toJwtSignature } = await import('./helpers.ts');
  const h = encodeBase64Url(headerJson);
  const p = encodeBase64Url(payloadJson);
  const sig = await signHMAC(`${h}.${p}`, TEST_SECRET, {
    hashAlgorithm: 'SHA-256',
  });
  return `${h}.${p}.${toJwtSignature(sig, 'HMAC')}`;
};

describe('crypt.JWT.verify', () => {
  it('verifyJWT - Basic Verification', async () => {
    const payload: JWTPayload = {
      sub: '1234567890',
      name: 'John Doe',
      admin: true,
    };

    const token = await issueJWT('HS256', payload, TEST_SECRET);
    const decoded = await verifyJWT(token, TEST_SECRET);

    asserts.assertEquals(decoded.sub, payload.sub);
    asserts.assertEquals(decoded.name, payload.name);
    asserts.assertEquals(decoded.admin, payload.admin);
    asserts.assertEquals(typeof decoded.iat, 'number');
  });

  it('verifyJWT - Time-based Claims', async () => {
    const now = Math.floor(Date.now() / 1000);
    const payload: JWTPayload = {
      sub: 'test',
      exp: now + 3600, // Expires in 1 hour
    };

    const token = await issueJWT('HS256', payload, TEST_SECRET);
    const decoded = await verifyJWT(token, TEST_SECRET);
    asserts.assertEquals(decoded.exp, payload.exp);
  });

  it('verifyJWT - Expired Tokens', async () => {
    const now = Math.floor(Date.now() / 1000);
    const payload: JWTPayload = {
      sub: 'test',
      exp: now - 3600, // Expired 1 hour ago
    };

    const token = await issueJWT('HS256', payload, TEST_SECRET);

    await asserts.assertRejects(
      async () => {
        await verifyJWT(token, TEST_SECRET);
      },
      JWTError,
    );
  });

  it('verifyJWT - rejects a non-numeric exp claim', async () => {
    // A genuinely-signed token whose `exp` is a *string* must not verify. The
    // expiry check is arithmetic — `now > payload.exp + tolerance` — so a
    // string `exp` concatenates ("<exp>30") and coerces to a number far beyond
    // `now`, letting an already-expired token slip through. `issueJWT` rejects
    // such a payload, so the token is minted directly to reproduce a token
    // signed by the key holder with a malformed `exp`.
    const past = Math.floor(Date.now() / 1000) - 3600; // expired an hour ago
    const token = await mintHS256(
      { alg: 'HS256', typ: 'JWT' },
      { sub: 'test', iat: past, exp: String(past) },
    );

    await asserts.assertRejects(
      () => verifyJWT(token, TEST_SECRET, { clockTolerance: 30 }),
      JWTError,
      'must be a number',
    );
  });

  it('verifyJWT - Not Before Claims', async () => {
    const now = Math.floor(Date.now() / 1000);
    const payload: JWTPayload = {
      sub: 'test',
      nbf: now + 3600, // Not valid for 1 hour
    };

    const token = await issueJWT('HS256', payload, TEST_SECRET);

    await asserts.assertRejects(
      async () => {
        await verifyJWT(token, TEST_SECRET);
      },
      JWTError,
    );
  });

  it('verifyJWT - Clock Tolerance', async () => {
    const now = Math.floor(Date.now() / 1000);
    const payload: JWTPayload = {
      sub: 'test',
      exp: now - 10, // Expired 10 seconds ago
    };

    const token = await issueJWT('HS256', payload, TEST_SECRET);
    const options: JWTVerifyOptions = {
      clockTolerance: 30, // 30 seconds tolerance
    };

    const decoded = await verifyJWT(token, TEST_SECRET, options);
    asserts.assertEquals(decoded.sub, 'test');
  });

  it('verifyJWT - Maximum Age', async () => {
    const payload: JWTPayload = {
      sub: 'test',
      iat: Math.floor(Date.now() / 1000) - 10, // Token issued 10 seconds ago
    };

    const token = await issueJWT('HS256', payload, TEST_SECRET);

    const options: JWTVerifyOptions = {
      maxAge: 5, // 5 seconds max age, token is 10 seconds old
    };

    await asserts.assertRejects(
      async () => {
        await verifyJWT(token, TEST_SECRET, options);
      },
      JWTError,
      'JWT exceeds maximum age',
    );
  });

  it('verifyJWT - Issuer Validation', async () => {
    const payload: JWTPayload = {
      sub: 'test',
      iss: 'auth.example.com',
    };

    const token = await issueJWT('HS256', payload, TEST_SECRET);

    // Valid issuer
    const options1: JWTVerifyOptions = {
      iss: 'auth.example.com',
    };
    const decoded1 = await verifyJWT(token, TEST_SECRET, options1);
    asserts.assertEquals(decoded1.iss, 'auth.example.com');

    // Invalid issuer
    const options2: JWTVerifyOptions = {
      iss: 'wrong.example.com',
    };
    await asserts.assertRejects(
      async () => {
        await verifyJWT(token, TEST_SECRET, options2);
      },
      JWTError,
    );
  });

  it('verifyJWT - Subject Validation', async () => {
    const payload: JWTPayload = {
      sub: 'user123',
    };

    const token = await issueJWT('HS256', payload, TEST_SECRET);

    // Valid subject
    const options1: JWTVerifyOptions = {
      sub: 'user123',
    };
    const decoded1 = await verifyJWT(token, TEST_SECRET, options1);
    asserts.assertEquals(decoded1.sub, 'user123');

    // Invalid subject
    const options2: JWTVerifyOptions = {
      sub: 'user456',
    };
    await asserts.assertRejects(
      async () => {
        await verifyJWT(token, TEST_SECRET, options2);
      },
      JWTError,
    );
  });

  it('verifyJWT - Audience Validation (String)', async () => {
    const payload: JWTPayload = {
      sub: 'test',
      aud: 'api.example.com',
    };

    const token = await issueJWT('HS256', payload, TEST_SECRET);

    // Valid audience
    const options1: JWTVerifyOptions = {
      aud: 'api.example.com',
    };
    const decoded1 = await verifyJWT(token, TEST_SECRET, options1);
    asserts.assertEquals(decoded1.aud, 'api.example.com');

    // Invalid audience
    const options2: JWTVerifyOptions = {
      aud: 'wrong.example.com',
    };
    await asserts.assertRejects(
      async () => {
        await verifyJWT(token, TEST_SECRET, options2);
      },
      JWTError,
    );
  });

  it('verifyJWT - Audience Validation (Array)', async () => {
    const payload: JWTPayload = {
      sub: 'test',
      aud: ['api.example.com', 'web.example.com'],
    };

    const token = await issueJWT('HS256', payload, TEST_SECRET);

    // Valid audience (matches one)
    const options1: JWTVerifyOptions = {
      aud: 'api.example.com',
    };
    const decoded1 = await verifyJWT(token, TEST_SECRET, options1);
    asserts.assertEquals(decoded1.aud, ['api.example.com', 'web.example.com']);

    // Valid audience (array)
    const options2: JWTVerifyOptions = {
      aud: ['api.example.com'],
    };
    const decoded2 = await verifyJWT(token, TEST_SECRET, options2);
    asserts.assertEquals(decoded2.aud, ['api.example.com', 'web.example.com']);
  });

  it('verifyJWT - Ignore Options', async () => {
    const now = Math.floor(Date.now() / 1000);
    const payload: JWTPayload = {
      sub: 'test',
      exp: now - 3600, // Expired
      nbf: now + 3600, // Not yet valid
    };

    const token = await issueJWT('HS256', payload, TEST_SECRET);

    const options: JWTVerifyOptions = {
      ignoreExpiration: true,
      ignoreNotBefore: true,
    };

    const decoded = await verifyJWT(token, TEST_SECRET, options);
    asserts.assertEquals(decoded.sub, 'test');
  });

  it('verifyJWT - Invalid Token Format', async () => {
    await asserts.assertRejects(
      async () => {
        await verifyJWT('invalid.token', TEST_SECRET);
      },
      JWTError,
    );

    await asserts.assertRejects(
      async () => {
        await verifyJWT('invalid', TEST_SECRET);
      },
      JWTError,
    );

    await asserts.assertRejects(
      async () => {
        await verifyJWT('', TEST_SECRET);
      },
      JWTError,
    );
  });

  it('verifyJWT - Invalid Signature', async () => {
    const payload: JWTPayload = { sub: 'test' };
    const token = await issueJWT('HS256', payload, TEST_SECRET);
    const wrongSecret = 'wrong-secret';

    await asserts.assertRejects(
      async () => {
        await verifyJWT(token, wrongSecret);
      },
      JWTError,
    );
  });

  it('verifyJWT - Malformed JWT Parts', async () => {
    const validToken = await issueJWT('HS256', { sub: 'test' }, TEST_SECRET);
    const parts = validToken.split('.');

    // Invalid header
    const invalidHeader = 'invalid.' + parts[1] + '.' + parts[2];
    await asserts.assertRejects(
      async () => {
        await verifyJWT(invalidHeader, TEST_SECRET);
      },
      JWTError,
    );

    // Invalid payload
    const invalidPayload = parts[0] + '.invalid.' + parts[2];
    await asserts.assertRejects(
      async () => {
        await verifyJWT(invalidPayload, TEST_SECRET);
      },
      JWTError,
    );
  });

  it('verifyJWT - Empty Secret', async () => {
    const token = await issueJWT('HS256', { sub: 'test' }, TEST_SECRET);

    await asserts.assertRejects(
      async () => {
        await verifyJWT(token, '');
      },
      JWTError,
    );
  });

  it('verifyJWT - All Algorithms', async () => {
    const payload: JWTPayload = { sub: 'test' };
    const algorithms = ['HS256', 'HS384', 'HS512'] as const;

    for (const algo of algorithms) {
      const token = await issueJWT(algo, payload, TEST_SECRET);
      const decoded = await verifyJWT(token, TEST_SECRET);
      asserts.assertEquals(decoded.sub, 'test');
    }
  });

  it('verifyJWT - Complex Payload', async () => {
    const payload: JWTPayload = {
      sub: 'user123',
      role: 'admin',
      permissions: ['read', 'write'],
      metadata: { department: 'engineering' },
    };

    const token = await issueJWT('HS256', payload, TEST_SECRET);
    const decoded = await verifyJWT(token, TEST_SECRET);

    asserts.assertEquals(decoded.sub, payload.sub);
    asserts.assertEquals(decoded.role, payload.role);
    asserts.assertEquals(decoded.permissions, payload.permissions);
    asserts.assertEquals(decoded.metadata, payload.metadata);
  });

  it('verifyJWT - Token with no token string', async () => {
    await asserts.assertRejects(
      async () => {
        await verifyJWT('', TEST_SECRET);
      },
      JWTError,
      'Token must be a non-empty string',
    );
  });

  it('verifyJWT - Token with null token', async () => {
    await asserts.assertRejects(
      async () => {
        // @ts-ignore: Testing invalid input
        await verifyJWT(null, TEST_SECRET);
      },
      JWTError,
      'Token must be a non-empty string',
    );
  });

  it('verifyJWT - Token with invalid parts count', async () => {
    await asserts.assertRejects(
      async () => {
        await verifyJWT('header.payload', TEST_SECRET);
      },
      JWTError,
      'Invalid JWT format',
    );

    await asserts.assertRejects(
      async () => {
        await verifyJWT('header.payload.signature.extra', TEST_SECRET);
      },
      JWTError,
      'Invalid JWT format',
    );
  });

  it('verifyJWT - Token with empty parts', async () => {
    await asserts.assertRejects(
      async () => {
        await verifyJWT('.payload.signature', TEST_SECRET);
      },
      JWTError,
      'Invalid JWT format - missing parts',
    );

    await asserts.assertRejects(
      async () => {
        await verifyJWT('header..signature', TEST_SECRET);
      },
      JWTError,
      'Invalid JWT format - missing parts',
    );

    await asserts.assertRejects(
      async () => {
        await verifyJWT('header.payload.', TEST_SECRET);
      },
      JWTError,
      'Invalid JWT format - missing parts',
    );
  });

  it('verifyJWT - Invalid header JSON', async () => {
    const invalidHeaderToken = 'invalid-base64.eyJzdWIiOiJ0ZXN0In0.signature';

    await asserts.assertRejects(
      async () => {
        await verifyJWT(invalidHeaderToken, TEST_SECRET);
      },
      JWTError,
      'Invalid JWT header',
    );
  });

  it('verifyJWT - Header missing required fields', async () => {
    // Header without alg
    const noAlgHeader = btoa(JSON.stringify({ typ: 'JWT' }));
    const noAlgToken = `${noAlgHeader}.eyJzdWIiOiJ0ZXN0In0.signature`;

    await asserts.assertRejects(
      async () => {
        await verifyJWT(noAlgToken, TEST_SECRET);
      },
      JWTError,
      'Invalid JWT header format',
    );

    // A header without `typ` is NOT malformed — RFC 7519 §5.1 makes it
    // optional — so it must get past the header check and fail later on the
    // signature instead. (Coverage for the accepted typ-less path lives in
    // 'a token with no typ header verifies by default'.)
    const noTypHeader = btoa(JSON.stringify({ alg: 'HS256' }));
    const noTypToken = `${noTypHeader}.eyJzdWIiOiJ0ZXN0In0.signature`;

    await asserts.assertRejects(
      async () => {
        await verifyJWT(noTypToken, TEST_SECRET);
      },
      JWTError,
      'Signature verification failed',
    );

    // An unfamiliar `typ` is likewise not a malformed header by default — it
    // only becomes a rejection when the caller pins `options.typ` (asserted in
    // 'pinning options.typ REQUIRES a matching typ to be present').
    const wrongTypHeader = btoa(
      JSON.stringify({ alg: 'HS256', typ: 'NOT_JWT' }),
    );
    const wrongTypToken = `${wrongTypHeader}.eyJzdWIiOiJ0ZXN0In0.signature`;

    await asserts.assertRejects(
      async () => {
        await verifyJWT(wrongTypToken, TEST_SECRET);
      },
      JWTError,
      'Signature verification failed',
    );

    // …but a non-string `typ` IS malformed: it carries a media type.
    const badTypHeader = btoa(JSON.stringify({ alg: 'HS256', typ: 42 }));
    await asserts.assertRejects(
      async () => {
        await verifyJWT(
          `${badTypHeader}.eyJzdWIiOiJ0ZXN0In0.signature`,
          TEST_SECRET,
        );
      },
      JWTError,
      'Invalid JWT header format',
    );
  });

  it('verifyJWT - Unsupported algorithm', async () => {
    // Test with a truly unsupported algorithm (not HS*, RS*, PS* or ES*).
    // `EdDSA` (RFC 8037) is a real JOSE algorithm this package does not
    // implement. (This slot used to hold `ES256`, now supported.)
    const unsupportedHeader = btoa(
      JSON.stringify({ alg: 'EdDSA', typ: 'JWT' }),
    );
    const unsupportedToken =
      `${unsupportedHeader}.eyJzdWIiOiJ0ZXN0In0.signature`;

    await asserts.assertRejects(
      async () => {
        await verifyJWT(unsupportedToken, TEST_SECRET);
      },
      JWTError,
      'Unsupported algorithm: EdDSA',
    );
  });

  it(
    'verifyJWT - Signature verification error handling',
    async () => {
      const payload = { sub: 'test' };
      const token = await issueJWT('HS256', payload, TEST_SECRET);

      // Test with wrong secret
      await asserts.assertRejects(
        async () => {
          await verifyJWT(token, 'wrong-secret');
        },
        JWTError,
        'Invalid signature',
      );
    },
  );

  it('verifyJWT - Decode without verification', async () => {
    const payload: JWTPayload = {
      sub: 'test',
      role: 'admin',
      permissions: ['read', 'write'],
    };

    const token = await issueJWT('HS256', payload, TEST_SECRET);

    const { decodeJWT } = await import('./helpers.ts');
    const decoded = decodeJWT(token);

    asserts.assertEquals(decoded.header.alg, 'HS256');
    asserts.assertEquals(decoded.header.typ, 'JWT');
    asserts.assertEquals(decoded.payload.sub, 'test');
    asserts.assertEquals(decoded.payload.role, 'admin');
  });

  it('verifyJWT - Decode invalid JWT', async () => {
    const { decodeJWT } = await import('./helpers.ts');

    asserts.assertThrows(
      () => decodeJWT('invalid.token'),
      JWTError,
      'Invalid JWT format',
    );

    asserts.assertThrows(
      () => decodeJWT(''),
      JWTError,
      'Token must be a non-empty string',
    );
  });

  it('verifyJWT - Validate jwtId (jti) claim', async () => {
    const payload: JWTPayload = {
      sub: 'test',
      jti: 'unique-token-id-123',
    };

    const token = await issueJWT('HS256', payload, TEST_SECRET);

    // Should pass with correct jwtId
    const verified = await verifyJWT(token, TEST_SECRET, {
      jti: 'unique-token-id-123',
    });
    asserts.assertEquals(verified.jti, 'unique-token-id-123');

    // Should fail with wrong jwtId
    await asserts.assertRejects(
      async () => {
        await verifyJWT(token, TEST_SECRET, {
          jti: 'wrong-id',
        });
      },
      JWTError,
      'Invalid JWT ID',
    );
  });

  it('verifyJWT - Validate required claims', async () => {
    const payload: JWTPayload = {
      sub: 'test',
      role: 'admin',
    };

    const token = await issueJWT('HS256', payload, TEST_SECRET);

    // Should pass with all required claims present
    await verifyJWT(token, TEST_SECRET, {
      requiredClaims: ['sub', 'role', 'iat'],
    });

    // Should fail with missing required claim
    await asserts.assertRejects(
      async () => {
        await verifyJWT(token, TEST_SECRET, {
          requiredClaims: ['sub', 'role', 'email'], // email not in payload
        });
      },
      JWTError,
      'Missing required claims',
    );
  });

  it('verifyJWT - Validate algorithm option', async () => {
    const payload: JWTPayload = { sub: 'test' };
    const token = await issueJWT('HS256', payload, TEST_SECRET);

    // Should pass with correct algorithm
    await verifyJWT(token, TEST_SECRET, {
      algorithm: 'HS256',
    });

    // Should fail with wrong algorithm
    await asserts.assertRejects(
      async () => {
        await verifyJWT(token, TEST_SECRET, {
          algorithm: 'HS384',
        });
      },
      JWTError,
      'Algorithm mismatch',
    );
  });

  it('verifyJWT - Generic payload types', async () => {
    type CustomPayload = JWTPayload & {
      userId: string;
      roles: string[];
      metadata: {
        loginCount: number;
      };
    };

    const payload: CustomPayload = {
      userId: 'user-123',
      roles: ['admin', 'editor'],
      metadata: {
        loginCount: 42,
      },
      sub: 'user-123',
    };

    const token = await issueJWT<CustomPayload>('HS256', payload, TEST_SECRET);
    const verified = await verifyJWT<CustomPayload>(token, TEST_SECRET);

    asserts.assertEquals(verified.userId, 'user-123');
    asserts.assertArrayIncludes(verified.roles, ['admin', 'editor']);
    asserts.assertEquals(verified.metadata.loginCount, 42);
  });

  it('verifyJWT - RSA Signature Verification (RS256)', async () => {
    const { generateRSAKeyPair } = await import('../generators/key.ts');

    const keys = await generateRSAKeyPair({
      algorithm: 'RSA-PSS',
      keySize: 2048,
      hashAlgorithm: 'SHA-256',
      format: 'PEM',
      extractable: true,
    });

    const payload: JWTPayload = {
      sub: 'user123',
      exp: Math.floor(Date.now() / 1000) + 3600,
    };

    const token = await issueJWT(
      'RS256',
      payload,
      keys.privateKeyExported as string,
    );

    // Verify with correct public key
    const verified = await verifyJWT(token, keys.publicKeyExported as string, {
      algorithm: 'RS256',
    });

    asserts.assertEquals(verified.sub, 'user123');
    asserts.assert(verified.iat !== undefined);
    asserts.assert(verified.exp !== undefined);
  });

  it('verifyJWT - RSA All Algorithms (RS256/384/512)', async () => {
    const { generateRSAKeyPair } = await import('../generators/key.ts');
    const payload: JWTPayload = { sub: 'test', role: 'admin' };

    // Test RS256
    const keys256 = await generateRSAKeyPair({
      algorithm: 'RSA-PSS',
      keySize: 2048,
      hashAlgorithm: 'SHA-256',
      format: 'PEM',
      extractable: true,
    });

    const token256 = await issueJWT(
      'RS256',
      payload,
      keys256.privateKeyExported as string,
    );
    const verified256 = await verifyJWT(
      token256,
      keys256.publicKeyExported as string,
      { algorithm: 'RS256' },
    );
    asserts.assertEquals(verified256.sub, 'test');

    // Test RS384
    const keys384 = await generateRSAKeyPair({
      algorithm: 'RSA-PSS',
      keySize: 2048,
      hashAlgorithm: 'SHA-384',
      format: 'PEM',
      extractable: true,
    });

    const token384 = await issueJWT(
      'RS384',
      payload,
      keys384.privateKeyExported as string,
    );
    const verified384 = await verifyJWT(
      token384,
      keys384.publicKeyExported as string,
      { algorithm: 'RS384' },
    );
    asserts.assertEquals(verified384.sub, 'test');

    // Test RS512
    const keys512 = await generateRSAKeyPair({
      algorithm: 'RSA-PSS',
      keySize: 2048,
      hashAlgorithm: 'SHA-512',
      format: 'PEM',
      extractable: true,
    });

    const token512 = await issueJWT(
      'RS512',
      payload,
      keys512.privateKeyExported as string,
    );
    const verified512 = await verifyJWT(
      token512,
      keys512.publicKeyExported as string,
      { algorithm: 'RS512' },
    );
    asserts.assertEquals(verified512.sub, 'test');
  });

  it('verifyJWT - RSA Invalid Signature (Wrong Key)', async () => {
    const { generateRSAKeyPair } = await import('../generators/key.ts');

    const keys1 = await generateRSAKeyPair({
      algorithm: 'RSA-PSS',
      keySize: 2048,
      hashAlgorithm: 'SHA-256',
      format: 'PEM',
      extractable: true,
    });

    const keys2 = await generateRSAKeyPair({
      algorithm: 'RSA-PSS',
      keySize: 2048,
      hashAlgorithm: 'SHA-256',
      format: 'PEM',
      extractable: true,
    });

    const payload: JWTPayload = { sub: 'test' };
    const token = await issueJWT(
      'RS256',
      payload,
      keys1.privateKeyExported as string,
    );

    // Try to verify with wrong public key
    await asserts.assertRejects(
      async () => {
        await verifyJWT(token, keys2.publicKeyExported as string, {
          algorithm: 'RS256',
        });
      },
      JWTError,
      'Invalid signature',
    );
  });

  it('verifyJWT - RSA Algorithm Mismatch', async () => {
    const { generateRSAKeyPair } = await import('../generators/key.ts');

    const keys = await generateRSAKeyPair({
      algorithm: 'RSA-PSS',
      keySize: 2048,
      hashAlgorithm: 'SHA-256',
      format: 'PEM',
      extractable: true,
    });

    const payload: JWTPayload = { sub: 'test' };
    const token = await issueJWT(
      'RS256',
      payload,
      keys.privateKeyExported as string,
    );

    // Expect RS384 but token is RS256
    await asserts.assertRejects(
      async () => {
        await verifyJWT(token, keys.publicKeyExported as string, {
          algorithm: 'RS384',
        });
      },
      JWTError,
      'Algorithm mismatch',
    );
  });

  it('verifyJWT - RSA With All Claims Validation', async () => {
    const { generateRSAKeyPair } = await import('../generators/key.ts');

    const keys = await generateRSAKeyPair({
      algorithm: 'RSA-PSS',
      keySize: 2048,
      hashAlgorithm: 'SHA-256',
      format: 'PEM',
      extractable: true,
    });

    const now = Math.floor(Date.now() / 1000);
    const payload: JWTPayload = {
      sub: 'user123',
      iss: 'auth.example.com',
      aud: ['api.example.com', 'web.example.com'],
      exp: now + 3600,
      jti: 'token-id-123',
      role: 'admin',
    };

    const token = await issueJWT(
      'RS256',
      payload,
      keys.privateKeyExported as string,
    );

    // Verify with all claim validations
    const verified = await verifyJWT(token, keys.publicKeyExported as string, {
      algorithm: 'RS256',
      iss: 'auth.example.com',
      aud: 'api.example.com',
      sub: 'user123',
      jti: 'token-id-123',
      requiredClaims: ['sub', 'role', 'iss'],
    });

    asserts.assertEquals(verified.sub, 'user123');
    asserts.assertEquals(verified.iss, 'auth.example.com');
    asserts.assertEquals(verified.role, 'admin');
  });

  it('verifyJWT - RSA Refresh Token', async () => {
    const { generateRSAKeyPair } = await import('../generators/key.ts');
    const { refreshJWT, decodeJWT } = await import('./helpers.ts');

    const keys = await generateRSAKeyPair({
      algorithm: 'RSA-PSS',
      keySize: 2048,
      hashAlgorithm: 'SHA-256',
      format: 'PEM',
      extractable: true,
    });

    const payload: JWTPayload = {
      sub: 'user123',
      role: 'admin',
      exp: Math.floor(Date.now() / 1000) + 1800,
    };

    const originalToken = await issueJWT(
      'RS256',
      payload,
      keys.privateKeyExported as string,
    );

    // Verify original token
    const originalVerified = await verifyJWT(
      originalToken,
      keys.publicKeyExported as string,
    );
    asserts.assertEquals(originalVerified.sub, 'user123');

    // Wait to ensure iat changes
    await new Promise((resolve) => setTimeout(resolve, 1100));

    // Use refreshJWT with separate keys for RSA
    const refreshedToken = await refreshJWT(
      originalToken,
      {
        verifyKey: keys.publicKeyExported as string,
        signKey: keys.privateKeyExported as string,
      },
      3600,
    );

    // Verify refreshed token
    const verified = await verifyJWT(
      refreshedToken,
      keys.publicKeyExported as string,
    );

    asserts.assertEquals(verified.sub, 'user123');
    asserts.assertEquals(verified.role, 'admin');
    asserts.assert(verified.iat! > originalVerified.iat!);

    const decoded = decodeJWT(refreshedToken);
    asserts.assertEquals(decoded.header.alg, 'RS256');
  });

  it('verifyJWT - RSA Generic Payload Types', async () => {
    const { generateRSAKeyPair } = await import('../generators/key.ts');

    const keys = await generateRSAKeyPair({
      algorithm: 'RSA-PSS',
      keySize: 2048,
      hashAlgorithm: 'SHA-256',
      format: 'PEM',
      extractable: true,
    });

    type CustomPayload = JWTPayload & {
      userId: string;
      roles: string[];
      permissions: string[];
    };

    const payload: CustomPayload = {
      userId: 'user-456',
      roles: ['admin', 'superuser'],
      permissions: ['read', 'write', 'execute'],
      sub: 'user-456',
    };

    const token = await issueJWT<CustomPayload>(
      'RS256',
      payload,
      keys.privateKeyExported as string,
    );

    const verified = await verifyJWT<CustomPayload>(
      token,
      keys.publicKeyExported as string,
    );

    asserts.assertEquals(verified.userId, 'user-456');
    asserts.assertArrayIncludes(verified.roles, ['admin', 'superuser']);
    asserts.assertArrayIncludes(verified.permissions, [
      'read',
      'write',
      'execute',
    ]);
  });

  it('verifyJWT - Missing issuer claim', async () => {
    const payload: JWTPayload = {
      sub: 'test-user',
      // No issuer in token
    };

    const token = await issueJWT('HS256', payload, TEST_SECRET);

    // Expect issuer but token has none
    await asserts.assertRejects(
      async () => {
        await verifyJWT(token, TEST_SECRET, {
          iss: 'expected-issuer',
        });
      },
      JWTError,
      'Invalid issuer',
    );
  });

  it('verifyJWT - Array issuer validation', async () => {
    const payload: JWTPayload = {
      sub: 'test-user',
      iss: 'auth.example.com',
    };

    const token = await issueJWT('HS256', payload, TEST_SECRET);

    // Valid issuer from array
    const verified = await verifyJWT(token, TEST_SECRET, {
      iss: ['auth.example.com', 'auth2.example.com'],
    });
    asserts.assertEquals(verified.iss, 'auth.example.com');

    // Invalid issuer - not in array
    await asserts.assertRejects(
      async () => {
        await verifyJWT(token, TEST_SECRET, {
          iss: ['wrong1.example.com', 'wrong2.example.com'],
        });
      },
      JWTError,
      'Invalid issuer',
    );
  });

  it('verifyJWT - Missing audience claim', async () => {
    const payload: JWTPayload = {
      sub: 'test-user',
      // No audience in token
    };

    const token = await issueJWT('HS256', payload, TEST_SECRET);

    // Expect audience but token has none
    await asserts.assertRejects(
      async () => {
        await verifyJWT(token, TEST_SECRET, {
          aud: 'api.example.com',
        });
      },
      JWTError,
      'Invalid audience',
    );
  });

  it('verifyJWT - Missing subject claim', async () => {
    const payload: JWTPayload = {
      // No sub claim
      iss: 'issuer',
    };

    const token = await issueJWT('HS256', payload, TEST_SECRET);

    // Expect subject but token has none
    await asserts.assertRejects(
      async () => {
        await verifyJWT(token, TEST_SECRET, {
          sub: 'expected-subject',
        });
      },
      JWTError,
      'Invalid subject',
    );
  });

  it('verifyJWT - Missing jwtId claim', async () => {
    const payload: JWTPayload = {
      sub: 'test-user',
      // No jti claim
    };

    const token = await issueJWT('HS256', payload, TEST_SECRET);

    // Expect jwtId but token has none
    await asserts.assertRejects(
      async () => {
        await verifyJWT(token, TEST_SECRET, {
          jti: 'expected-jti',
        });
      },
      JWTError,
      'Invalid JWT ID',
    );
  });

  it('verifyJWT - maxAge fails closed when the token carries no iat', async () => {
    // A self-issued token always carries iat, so maxAge validates normally.
    const selfIssued = await issueJWT(
      'HS256',
      { sub: 'test-user' },
      TEST_SECRET,
    );
    const verified = await verifyJWT(selfIssued, TEST_SECRET, { maxAge: 3600 });
    asserts.assert(verified.iat !== undefined);

    // A foreign token may omit iat (RFC 7519 §4.1.6 makes it OPTIONAL). maxAge
    // is a freshness bound — "token must not be older than this" — so with no
    // iat the age is unknowable. Rather than silently accept an arbitrarily old
    // token (the pre-fix behaviour), fail closed with INVALID_CLAIMS.
    const noIat = await mintHS256({ alg: 'HS256', typ: 'JWT' }, { sub: 'x' });
    const err = await asserts.assertRejects(
      () => verifyJWT(noIat, TEST_SECRET, { maxAge: 300 }),
      JWTError,
    );
    asserts.assertEquals((err as JWTError).context.code, 'INVALID_CLAIMS');

    // Without maxAge, a missing iat is perfectly fine — iat stays optional.
    asserts.assertEquals((await verifyJWT(noIat, TEST_SECRET)).sub, 'x');
  });

  it('verifyJWT - RSA PEM Format Variations', async () => {
    // Test that RSA keys with different PEM formatting styles work
    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'RSA-PSS',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['sign', 'verify'],
    );

    const publicKeyRaw = await crypto.subtle.exportKey(
      'spki',
      keyPair.publicKey,
    );
    const privateKeyRaw = await crypto.subtle.exportKey(
      'pkcs8',
      keyPair.privateKey,
    );

    const publicKeyBase64 = btoa(
      String.fromCodePoint(...new Uint8Array(publicKeyRaw)),
    );
    const privateKeyBase64 = btoa(
      String.fromCodePoint(...new Uint8Array(privateKeyRaw)),
    );

    const payload: JWTPayload = { sub: 'test-pem-formats' };

    // Standard 64-character line breaks in private key
    const standardPrivateKeyPEM = `-----BEGIN PRIVATE KEY-----\n${
      privateKeyBase64.match(/.{1,64}/g)?.join('\n')
    }\n-----END PRIVATE KEY-----`;
    const token = await issueJWT('RS256', payload, standardPrivateKeyPEM);

    // Verify with standard public key format
    const standardPublicKeyPEM = `-----BEGIN PUBLIC KEY-----\n${
      publicKeyBase64.match(/.{1,64}/g)?.join('\n')
    }\n-----END PUBLIC KEY-----`;
    const decoded1 = await verifyJWT(token, standardPublicKeyPEM);
    asserts.assertEquals(decoded1.sub, 'test-pem-formats');

    // Verify with single-line public key format
    const singleLinePublicKeyPEM =
      `-----BEGIN PUBLIC KEY-----\n${publicKeyBase64}\n-----END PUBLIC KEY-----`;
    const decoded2 = await verifyJWT(token, singleLinePublicKeyPEM);
    asserts.assertEquals(decoded2.sub, 'test-pem-formats');

    // Verify with extra whitespace
    const spacedPublicKeyPEM = `-----BEGIN PUBLIC KEY-----
    ${publicKeyBase64.match(/.{1,64}/g)?.join('\n    ')}
    -----END PUBLIC KEY-----`;
    const decoded3 = await verifyJWT(token, spacedPublicKeyPEM);
    asserts.assertEquals(decoded3.sub, 'test-pem-formats');

    // Verify with different line lengths
    const irregularPublicKeyPEM = `-----BEGIN PUBLIC KEY-----\n${
      publicKeyBase64.match(/.{1,80}/g)?.join('\n')
    }\n-----END PUBLIC KEY-----`;
    const decoded4 = await verifyJWT(token, irregularPublicKeyPEM);
    asserts.assertEquals(decoded4.sub, 'test-pem-formats');
  });

  it('verifyJWT - Token with Whitespace Handling', async () => {
    // JWT tokens might get whitespace during copy-paste
    const payload: JWTPayload = { sub: 'test-whitespace' };
    const token = await issueJWT('HS256', payload, TEST_SECRET);

    // Token with leading/trailing whitespace should work (after trim)
    const tokenWithSpaces = ` ${token} `;
    const decoded1 = await verifyJWT(tokenWithSpaces.trim(), TEST_SECRET);
    asserts.assertEquals(decoded1.sub, 'test-whitespace');

    // Token with newline (might happen in config files)
    const tokenWithNewline = `${token}\n`;
    const decoded2 = await verifyJWT(
      tokenWithNewline.trim(),
      TEST_SECRET,
    );
    asserts.assertEquals(decoded2.sub, 'test-whitespace');

    // Note: JWT spec doesn't allow whitespace inside the token
    // Inserting whitespace between parts should fail
    const parts = token.split('.');
    const tokenWithInternalSpace = `${parts[0]} .${parts[1]}.${parts[2]}`;
    await asserts.assertRejects(
      async () => {
        await verifyJWT(tokenWithInternalSpace, TEST_SECRET);
      },
      JWTError,
    );
  });

  it('verifyJWT - Unsupported algorithm throws UNSUPPORTED_ALGORITHM', async () => {
    // Craft a JWT with an unsupported algorithm header manually. `EdDSA`
    // (RFC 8037) is a real JOSE algorithm this package does not implement.
    const { encodeBase64Url } = await import('@std/encoding');
    const header = encodeBase64Url(
      JSON.stringify({ alg: 'EdDSA', typ: 'JWT' }),
    );
    const payload = encodeBase64Url(JSON.stringify({ sub: 'test' }));
    const fakeToken = `${header}.${payload}.fakesig`;
    await asserts.assertRejects(
      () => verifyJWT(fakeToken, TEST_SECRET),
      JWTError,
      'Unsupported algorithm',
    );
  });

  it('verifyJWT - rejects alg:"none" (and case variants)', async () => {
    // Classic CVE-2015-9235-style attack: attacker forges a token with
    // `alg: 'none'` and an empty (or arbitrary) signature, hoping the
    // verifier accepts unsigned tokens. The verify path uses an
    // explicit allow-list of HS*/RS* algorithms so any variant of
    // 'none' must be rejected with UNSUPPORTED_ALGORITHM.
    const { encodeBase64Url } = await import('@std/encoding');
    const payload = encodeBase64Url(JSON.stringify({ sub: 'attacker' }));

    for (const algValue of ['none', 'None', 'NONE', 'nOnE']) {
      const header = encodeBase64Url(
        JSON.stringify({ alg: algValue, typ: 'JWT' }),
      );
      // Try both empty-sig and arbitrary-sig forms.
      for (const sig of ['', 'AAAA']) {
        const fakeToken = `${header}.${payload}.${sig}`;
        if (sig === '') {
          // Empty signature is rejected at the format-parse stage.
          await asserts.assertRejects(
            () => verifyJWT(fakeToken, TEST_SECRET),
            JWTError,
          );
        } else {
          await asserts.assertRejects(
            () => verifyJWT(fakeToken, TEST_SECRET),
            JWTError,
            'Unsupported algorithm',
          );
        }
      }
    }
  });

  it('verifyJWT - rejects empty alg field', async () => {
    const { encodeBase64Url } = await import('@std/encoding');
    const header = encodeBase64Url(JSON.stringify({ alg: '', typ: 'JWT' }));
    const payload = encodeBase64Url(JSON.stringify({ sub: 'test' }));
    const fakeToken = `${header}.${payload}.AAAA`;
    await asserts.assertRejects(
      () => verifyJWT(fakeToken, TEST_SECRET),
      JWTError,
      'Invalid JWT header',
    );
  });

  it('verifyJWT - rejects algorithm-confusion (token alg differs from options.algorithm)', async () => {
    // Algorithm-confusion attack: server expects RS256 (and supplies a
    // public key as `key`), attacker submits a token signed HS256 using
    // that same public key as the HMAC secret. If the verifier doesn't
    // pin algorithm to caller-expected, the HMAC check would pass.
    // Our `options.algorithm` is the pin point.
    const token = await issueJWT('HS256', { sub: 'test' }, TEST_SECRET);
    await asserts.assertRejects(
      () => verifyJWT(token, TEST_SECRET, { algorithm: 'RS256' }),
      JWTError,
      'Algorithm mismatch',
    );
  });

  it('verifyJWT - Non-JWTError during signature verification wrapped as INVALID_SIGNATURE', async () => {
    // Craft a token with RS256 header but an invalid key (not PEM) to trigger non-JWTError
    const { encodeBase64Url } = await import('@std/encoding');
    const header = encodeBase64Url(
      JSON.stringify({ alg: 'RS256', typ: 'JWT' }),
    );
    const payload = encodeBase64Url(JSON.stringify({ sub: 'test' }));
    const data = `${header}.${payload}`;
    const fakeToken = `${data}.fakesig`;
    await asserts.assertRejects(
      () => verifyJWT(fakeToken, 'not-a-pem-key'),
      JWTError,
    );
  });

  it('verifyJWT - SECURITY: HS256 forged with the RSA public key is rejected (algorithm confusion)', async () => {
    // Algorithm-confusion attack: a service verifies RS256 tokens with an RSA
    // public key; the attacker forges an HS256 token, HMAC-keyed with that
    // (public, attacker-known) key as the secret. A verifier that trusts
    // header.alg would route it to HMAC and accept it. Both the algorithm pin
    // and the key-shape guard must reject it — the latter even with no pin.
    const { generateRSAKeyPair } = await import('../generators/key.ts');
    const { signHMAC } = await import('../sign/mod.ts');

    const keys = await generateRSAKeyPair({
      algorithm: 'RSA-PSS',
      keySize: 2048,
      hashAlgorithm: 'SHA-256',
      format: 'PEM',
      extractable: true,
    });
    const publicKey = keys.publicKeyExported as string;

    const forged = await issueJWT(
      'HS256',
      { sub: 'attacker', admin: true },
      publicKey,
    );

    // Premise: the forgery really is a valid HMAC over header.payload using the
    // public-key bytes — i.e. it WOULD verify under a naive HMAC check.
    const [h, p, sig] = forged.split('.');
    const expectedMac = await signHMAC(`${h}.${p}`, publicKey, {
      hashAlgorithm: 'SHA-256',
    });
    // The token's signature segment is base64url (RFC 7515); signHMAC returns
    // hex, so compare via the same hex→base64url conversion the issuer applies.
    const { toJwtSignature } = await import('./helpers.ts');
    asserts.assertEquals(sig, toJwtSignature(expectedMac, 'HMAC'));

    // Rejected when the caller pins RS256.
    await asserts.assertRejects(
      () => verifyJWT(forged, publicKey, { algorithm: 'RS256' }),
      JWTError,
      'Algorithm mismatch',
    );

    // Rejected against an RS-only allow-list.
    await asserts.assertRejects(
      () =>
        verifyJWT(forged, publicKey, {
          algorithm: ['RS256', 'RS384', 'RS512'],
        }),
      JWTError,
      'Algorithm mismatch',
    );

    // Headline regression: rejected even with NO algorithm pin, because the
    // verification primitive is bound to the key shape (PEM => RSA-only).
    const err = await asserts.assertRejects(
      () => verifyJWT(forged, publicKey),
      JWTError,
      'Algorithm confusion',
    );
    asserts.assertEquals(
      (err as JWTError).context.code,
      'UNSUPPORTED_ALGORITHM',
    );
  });

  it('verifyJWT - SECURITY: RS-headed token rejected when only an HMAC secret is supplied', async () => {
    // Reverse confusion: a verifier configured for HMAC must never route an
    // RS* token into RSA verification. The arbitrary signature is never even
    // checked.
    const { encodeBase64Url } = await import('@std/encoding');
    const header = encodeBase64Url(
      JSON.stringify({ alg: 'RS256', typ: 'JWT' }),
    );
    const payload = encodeBase64Url(JSON.stringify({ sub: 'attacker' }));
    const token = `${header}.${payload}.AAAA`;

    await asserts.assertRejects(
      () => verifyJWT(token, TEST_SECRET),
      JWTError,
      'Algorithm confusion',
    );
  });

  it('verifyJWT - SECURITY: legitimately-signed RS256 token still verifies (unpinned, pinned, allow-list)', async () => {
    const { generateRSAKeyPair } = await import('../generators/key.ts');
    const keys = await generateRSAKeyPair({
      algorithm: 'RSA-PSS',
      keySize: 2048,
      hashAlgorithm: 'SHA-256',
      format: 'PEM',
      extractable: true,
    });
    const publicKey = keys.publicKeyExported as string;
    const token = await issueJWT(
      'RS256',
      { sub: 'user' },
      keys.privateKeyExported as string,
    );

    const unpinned = await verifyJWT(token, publicKey);
    asserts.assertEquals(unpinned.sub, 'user');

    const pinned = await verifyJWT(token, publicKey, { algorithm: 'RS256' });
    asserts.assertEquals(pinned.sub, 'user');

    const allowList = await verifyJWT(token, publicKey, {
      algorithm: ['RS256', 'HS256'],
    });
    asserts.assertEquals(allowList.sub, 'user');
  });

  it('verifyJWT - SECURITY: algorithm allow-list accepts members and rejects non-members', async () => {
    const inList = await issueJWT('HS256', { sub: 'u' }, TEST_SECRET);
    const ok = await verifyJWT(inList, TEST_SECRET, {
      algorithm: ['HS256', 'HS384'],
    });
    asserts.assertEquals(ok.sub, 'u');

    const notInList = await issueJWT('HS512', { sub: 'u' }, TEST_SECRET);
    await asserts.assertRejects(
      () =>
        verifyJWT(notInList, TEST_SECRET, { algorithm: ['HS256', 'HS384'] }),
      JWTError,
      'Algorithm mismatch',
    );
  });

  it('verifyJWT - SECURITY: refreshJWT rejects forged HS256 and round-trips legit RS256', async () => {
    const { generateRSAKeyPair } = await import('../generators/key.ts');
    const { refreshJWT, decodeJWT } = await import('./helpers.ts');
    const keys = await generateRSAKeyPair({
      algorithm: 'RSA-PSS',
      keySize: 2048,
      hashAlgorithm: 'SHA-256',
      format: 'PEM',
      extractable: true,
    });
    const publicKey = keys.publicKeyExported as string;
    const privateKey = keys.privateKeyExported as string;

    // A forged HS256 token (HMAC-keyed with the public key) handed to an RSA
    // refresh setup is rejected by the key-config guard before verification.
    const forged = await issueJWT('HS256', { sub: 'attacker' }, publicKey);
    await asserts.assertRejects(
      () => refreshJWT(forged, { verifyKey: publicKey, signKey: privateKey }),
      JWTError,
      'HMAC tokens require a single secret key string',
    );

    // A legitimate RS256 token round-trips and keeps its algorithm.
    const original = await issueJWT(
      'RS256',
      { sub: 'user', role: 'admin', exp: Math.floor(Date.now() / 1000) + 1800 },
      privateKey,
    );
    const refreshed = await refreshJWT(
      original,
      { verifyKey: publicKey, signKey: privateKey },
      3600,
    );
    asserts.assertEquals(decodeJWT(refreshed).header.alg, 'RS256');
    const verified = await verifyJWT(refreshed, publicKey, {
      algorithm: 'RS256',
    });
    asserts.assertEquals(verified.sub, 'user');
    asserts.assertEquals(verified.role, 'admin');
  });

  it('verifyJWT - SECURITY: key-shape helpers classify PEM keys vs raw secrets', async () => {
    const { generateRSAKeyPair } = await import('../generators/key.ts');
    const { algorithmFamily, isPEMKey, keyAlgorithmFamily } = await import(
      './helpers.ts'
    );
    const keys = await generateRSAKeyPair({
      algorithm: 'RSA-PSS',
      keySize: 2048,
      hashAlgorithm: 'SHA-256',
      format: 'PEM',
      extractable: true,
    });
    const publicKey = keys.publicKeyExported as string;
    const privateKey = keys.privateKeyExported as string;

    asserts.assert(isPEMKey(publicKey));
    asserts.assert(isPEMKey(privateKey));
    asserts.assert(!isPEMKey(TEST_SECRET));
    asserts.assert(!isPEMKey(''));

    asserts.assertEquals(keyAlgorithmFamily(publicKey), 'RSA');
    asserts.assertEquals(keyAlgorithmFamily(TEST_SECRET), 'HMAC');

    asserts.assertEquals(algorithmFamily('RS256'), 'RSA');
    asserts.assertEquals(algorithmFamily('HS512'), 'HMAC');
  });

  it('verifyJWT - PS* (RSA-PSS) round-trip for all hash sizes', async () => {
    const { generateRSAKeyPair } = await import('../generators/key.ts');
    const keys = await generateRSAKeyPair({
      algorithm: 'RSA-PSS',
      keySize: 2048,
      hashAlgorithm: 'SHA-256',
      format: 'PEM',
      extractable: true,
    });
    const priv = keys.privateKeyExported as string;
    const pub = keys.publicKeyExported as string;

    for (const alg of ['PS256', 'PS384', 'PS512'] as const) {
      const token = await issueJWT(alg, { sub: 'u' }, priv);
      // Pinning {algorithm: alg} also asserts the header advertises it.
      const verified = await verifyJWT(token, pub, { algorithm: alg });
      asserts.assertEquals(verified.sub, 'u');
    }
  });

  it('verifyJWT - RS256 (PKCS#1 v1.5) and PS256 (PSS) are distinct', async () => {
    const { generateRSAKeyPair } = await import('../generators/key.ts');
    const keys = await generateRSAKeyPair({
      algorithm: 'RSA-PSS',
      keySize: 2048,
      hashAlgorithm: 'SHA-256',
      format: 'PEM',
      extractable: true,
    });
    const priv = keys.privateKeyExported as string;
    const pub = keys.publicKeyExported as string;

    const rs = await issueJWT('RS256', { sub: 'u' }, priv);
    const ps = await issueJWT('PS256', { sub: 'u' }, priv);
    asserts.assertEquals(
      (await verifyJWT(rs, pub, { algorithm: 'RS256' })).sub,
      'u',
    );
    asserts.assertEquals(
      (await verifyJWT(ps, pub, { algorithm: 'PS256' })).sub,
      'u',
    );
    // Pinning the other RSA scheme rejects the token.
    await asserts.assertRejects(
      () => verifyJWT(rs, pub, { algorithm: 'PS256' }),
      JWTError,
    );
    await asserts.assertRejects(
      () => verifyJWT(ps, pub, { algorithm: 'RS256' }),
      JWTError,
    );
  });

  it("verifyJWT - accepts RFC 9068 'at+jwt' access tokens in every legal spelling", async () => {
    // RFC 9068 §2.1 stamps `typ: "at+jwt"` on OAuth 2.0 access tokens. RFC 7515
    // §4.1.9 makes `typ` a media type: case-insensitive, with the
    // `application/` prefix optional. All of these are the same type and a
    // spec-compliant authorization server may emit any of them.
    for (
      const typ of [
        'at+jwt',
        'AT+JWT',
        'At+Jwt',
        'application/at+jwt',
        'Application/AT+JWT',
      ]
    ) {
      const token = await issueJWT(
        'HS256',
        {
          sub: 'user-123',
          iss: 'https://auth.example.com',
          aud: 'https://api.example.com',
          client_id: 'app-42',
          jti: 'tok-1',
        },
        TEST_SECRET,
        { typ },
      );

      const claims = await verifyJWT(token, TEST_SECRET, {
        iss: 'https://auth.example.com',
        aud: 'https://api.example.com',
      });
      asserts.assertEquals(claims.sub, 'user-123', `typ '${typ}' rejected`);
      asserts.assertEquals(claims.client_id, 'app-42');
    }
  });

  it("verifyJWT - REGRESSION: plain 'JWT' tokens still verify by default", async () => {
    // The pre-existing default must not shift: an ordinary token verifies with
    // no options at all, and the equivalent media-type spellings do too.
    for (const typ of ['JWT', 'jwt', 'application/jwt', 'APPLICATION/JWT']) {
      const token = await issueJWT('HS256', { sub: 'plain' }, TEST_SECRET, {
        typ,
      });
      asserts.assertEquals(
        (await verifyJWT(token, TEST_SECRET)).sub,
        'plain',
        `typ '${typ}' rejected`,
      );
    }
  });

  it('verifyJWT - a token with no typ header verifies by default', async () => {
    // RFC 7519 §5.1 makes `typ` OPTIONAL and says implementations ignore it.
    // Apple's OIDC id_token header is exactly `{kid, alg}` — refusing it would
    // reject a legitimate token, so the default path must not require `typ`.
    const token = await mintHS256(
      { alg: 'HS256', kid: 'apple-key-1' },
      { sub: 'no-typ' },
    );
    asserts.assertEquals((await verifyJWT(token, TEST_SECRET)).sub, 'no-typ');
  });

  it('verifyJWT - an unfamiliar typ is ignored by default (RFC 7519 §5.1)', async () => {
    // These are all real JOSE/JWT profiles. A general-purpose verifier cannot
    // enumerate them, and RFC 7519 §5.1 says processing `typ` is the
    // application's job — so none of them may be rejected by default. Callers
    // whose profile cares opt in via `options.typ` (asserted below).
    const ignored = [
      'id_token+jwt', // OIDC id_token
      'secevent+jwt', // RFC 8417 security event token
      'logout+jwt', // OIDC back-channel logout token
      'dpop+jwt', // RFC 9449 DPoP proof
      'JOSE',
      'text/jwt',
    ];

    for (const typ of ignored) {
      const token = await issueJWT('HS256', { sub: 'x' }, TEST_SECRET, { typ });
      asserts.assertEquals(
        (await verifyJWT(token, TEST_SECRET)).sub,
        'x',
        `typ '${typ}' should be ignored by default`,
      );
    }
  });

  it('verifyJWT - pinning options.typ REQUIRES a matching typ to be present', async () => {
    // Opting in is what makes `typ` load-bearing: an RFC 9068 resource server
    // pins `at+jwt`, and then both a wrong type AND a missing one must fail —
    // a typ-less token must not slip past a pin by simply omitting the header.
    const wrong = await issueJWT('HS256', { sub: 'x' }, TEST_SECRET, {
      typ: 'id_token+jwt',
    });
    const wrongErr = await asserts.assertRejects(
      () => verifyJWT(wrong, TEST_SECRET, { typ: 'at+jwt' }),
      JWTError,
    );
    asserts.assertEquals((wrongErr as JWTError).context.code, 'INVALID_HEADER');
    asserts.assertStringIncludes(
      (wrongErr as JWTError).message,
      'not in the accepted set',
    );

    // ...and the absent case, which is the one a pin exists to close.
    const typeless = await mintHS256({ alg: 'HS256' }, { sub: 'x' });
    const missingErr = await asserts.assertRejects(
      () => verifyJWT(typeless, TEST_SECRET, { typ: 'at+jwt' }),
      JWTError,
    );
    asserts.assertEquals(
      (missingErr as JWTError).context.code,
      'INVALID_HEADER',
    );
    asserts.assertStringIncludes(
      (missingErr as JWTError).message,
      "carries no 'typ'",
    );
  });

  it('verifyJWT - a non-string typ is still a malformed header', async () => {
    // Optional does not mean "any shape": `typ` carries a media type.
    const token = await mintHS256({ alg: 'HS256', typ: 42 }, { sub: 'x' });
    const error = await asserts.assertRejects(
      () => verifyJWT(token, TEST_SECRET),
      JWTError,
      'Invalid JWT header format',
    );
    asserts.assertEquals((error as JWTError).context.code, 'INVALID_HEADER');
  });

  it('verifyJWT - options.typ narrows the accepted set (cross-type confusion)', async () => {
    // A resource server should honour access tokens only. Pinning `typ` makes
    // an id_token (or a plain JWT) minted by the *same issuer with the same
    // key* unusable there — the signature is perfectly valid, only the type
    // is wrong, which is exactly the attack `typ` exists to stop.
    const accessToken = await issueJWT('HS256', { sub: 'u' }, TEST_SECRET, {
      typ: 'at+jwt',
    });
    const idToken = await issueJWT('HS256', { sub: 'u' }, TEST_SECRET, {
      typ: 'id_token+jwt',
    });
    const plainToken = await issueJWT('HS256', { sub: 'u' }, TEST_SECRET);

    asserts.assertEquals(
      (await verifyJWT(accessToken, TEST_SECRET, { typ: 'at+jwt' })).sub,
      'u',
    );
    // Both are validly signed; both are the wrong type for this endpoint.
    for (const token of [idToken, plainToken]) {
      await asserts.assertRejects(
        () => verifyJWT(token, TEST_SECRET, { typ: 'at+jwt' }),
        JWTError,
        'Invalid JWT header format',
      );
    }
    // …and the default allow-list still takes the plain one.
    asserts.assertEquals((await verifyJWT(plainToken, TEST_SECRET)).sub, 'u');
  });

  it('verifyJWT - options.typ widens the accepted set', async () => {
    const { JWT_DEFAULT_TYPES } = await import('./helpers.ts');
    const token = await issueJWT('HS256', { sub: 'u' }, TEST_SECRET, {
      typ: 'my+jwt',
    });

    // Ignored by default (RFC 7519 §5.1 leaves `typ` to the application)…
    asserts.assertEquals((await verifyJWT(token, TEST_SECRET)).sub, 'u');
    // …and rejected once the caller pins a set that excludes it.
    await asserts.assertRejects(
      () => verifyJWT(token, TEST_SECRET, { typ: JWT_DEFAULT_TYPES }),
      JWTError,
      'not in the accepted set',
    );
    // …accepted when explicitly allow-listed, without losing the defaults.
    const allowed = [...JWT_DEFAULT_TYPES, 'my+jwt'];
    asserts.assertEquals(
      (await verifyJWT(token, TEST_SECRET, { typ: allowed })).sub,
      'u',
    );
    const plain = await issueJWT('HS256', { sub: 'p' }, TEST_SECRET);
    asserts.assertEquals(
      (await verifyJWT(plain, TEST_SECRET, { typ: allowed })).sub,
      'p',
    );
  });

  it('verifyJWT - options.typ is normalised the same way the header is', async () => {
    // The caller's allow-list goes through the same RFC 7515 §4.1.9
    // normalisation, so a caller writing 'AT+JWT' still matches a token
    // stamped 'application/at+jwt' and vice versa.
    const compact = await issueJWT('HS256', { sub: 'u' }, TEST_SECRET, {
      typ: 'at+jwt',
    });
    const prefixed = await issueJWT('HS256', { sub: 'u' }, TEST_SECRET, {
      typ: 'application/AT+JWT',
    });

    for (const allow of ['AT+JWT', 'application/at+jwt', 'at+jwt']) {
      for (const token of [compact, prefixed]) {
        asserts.assertEquals(
          (await verifyJWT(token, TEST_SECRET, { typ: allow })).sub,
          'u',
        );
      }
    }
  });

  it('verifyJWT - an empty typ allow-list accepts nothing', async () => {
    // Taken literally rather than silently falling back to the defaults —
    // `typ: []` means "no type is acceptable".
    const token = await issueJWT('HS256', { sub: 'u' }, TEST_SECRET);
    await asserts.assertRejects(
      () => verifyJWT(token, TEST_SECRET, { typ: [] }),
      JWTError,
      'Invalid JWT header format',
    );
  });

  it('verifyJWT - SECURITY: typ cannot be re-typed after signing', async () => {
    // `typ` lives in the signed header, so an attacker holding an access token
    // cannot relabel it as a plain JWT (or vice versa) to slip past an
    // endpoint's type check — the signature covers the header bytes.
    const { encodeBase64Url } = await import('@std/encoding');
    const accessToken = await issueJWT('HS256', { sub: 'u' }, TEST_SECRET, {
      typ: 'at+jwt',
    });
    const [, payload, signature] = accessToken.split('.');
    const forgedHeader = encodeBase64Url(
      JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
    );
    const forged = `${forgedHeader}.${payload}.${signature}`;

    // The forged type passes the allow-list but the signature no longer binds.
    await asserts.assertRejects(
      () => verifyJWT(forged, TEST_SECRET),
      JWTError,
      'Invalid signature',
    );
  });

  it('verifyJWT - normalizeTyp applies the application/ prefix rule exactly', async () => {
    // RFC 7515 §4.1.9: a recipient MUST treat a `typ` with no '/' as if
    // `application/` were prepended — and must leave anything that already
    // carries a type/subtype alone.
    const { normalizeTyp } = await import('./helpers.ts');

    asserts.assertEquals(normalizeTyp('JWT'), 'application/jwt');
    asserts.assertEquals(normalizeTyp('at+jwt'), 'application/at+jwt');
    asserts.assertEquals(normalizeTyp('AT+JWT'), 'application/at+jwt');
    asserts.assertEquals(
      normalizeTyp('application/at+jwt'),
      'application/at+jwt',
    );
    asserts.assertEquals(
      normalizeTyp('Application/AT+JWT'),
      'application/at+jwt',
    );
    // Contains a '/', so the prefix is NOT applied — no application/text/plain.
    asserts.assertEquals(normalizeTyp('text/plain'), 'text/plain');
    // Whitespace is significant: ' JWT' is not a legal media type.
    asserts.assertNotEquals(normalizeTyp(' JWT'), 'application/jwt');
  });

  // ── ECDSA (ES*) ──────────────────────────────────────────────────────

  it('verifyJWT - RFC 7515 A.3: verifies the published ES256 vector', async () => {
    // The complete worked example from RFC 7515 Appendix A.3 — signature and
    // key both copied verbatim from the RFC, not produced by this package.
    // ECDSA is randomised, so the signature cannot be reproduced by signing;
    // verifying the published one is the only vector-based check available,
    // and it proves the R‖S handling interoperates with the specification.
    const token = 'eyJhbGciOiJFUzI1NiJ9.' +
      'eyJpc3MiOiJqb2UiLA0KICJleHAiOjEzMDA4MTkzODAsDQogImh0dHA6Ly9leGFtcGxlLmNvbS9pc19yb290Ijp0cnVlfQ.' +
      'DtEhU3ljbEg8L38VWAfUAqOyKAM6-Xx-F4GawxaepmXFCgfTjDxw5djxLa8ISlSApmWQxfKTUJqPP3-Kg6NU1Q';

    // RFC 7515 A.3.1, public half only (the RFC also lists `d`).
    const publicJwk: JsonWebKey = {
      kty: 'EC',
      crv: 'P-256',
      x: 'f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU',
      y: 'x_FEzRu9m36HLN_tue659LNpXW6pCyStikYjKIWI5a0',
    };

    // `exp` is 1300819380 (March 2011), so expiry is ignored deliberately —
    // the point of the vector is the signature, not the clock. The header
    // carries no `typ`, which is legal (RFC 7519 §5.1) and unchecked here.
    const payload = await verifyJWT(token, publicJwk, {
      algorithm: 'ES256',
      ignoreExpiration: true,
    });
    asserts.assertEquals(payload.iss, 'joe');
    asserts.assertEquals(payload.exp, 1300819380);
    asserts.assertEquals(payload['http://example.com/is_root'], true);

    // The signature segment is exactly 64 bytes — raw R‖S, per RFC 7515 §3.4.
    const { decodeBase64Url } = await import('@std/encoding');
    asserts.assertEquals(decodeBase64Url(token.split('.')[2]!).length, 64);
  });

  it('verifyJWT - RFC 7515 A.3 vector fails on any tampering', async () => {
    // Guards against the vector "passing" for the wrong reason.
    const publicJwk: JsonWebKey = {
      kty: 'EC',
      crv: 'P-256',
      x: 'f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU',
      y: 'x_FEzRu9m36HLN_tue659LNpXW6pCyStikYjKIWI5a0',
    };
    const header = 'eyJhbGciOiJFUzI1NiJ9';
    const body =
      'eyJpc3MiOiJqb2UiLA0KICJleHAiOjEzMDA4MTkzODAsDQogImh0dHA6Ly9leGFtcGxlLmNvbS9pc19yb290Ijp0cnVlfQ';
    const sig =
      'DtEhU3ljbEg8L38VWAfUAqOyKAM6-Xx-F4GawxaepmXFCgfTjDxw5djxLa8ISlSApmWQxfKTUJqPP3-Kg6NU1Q';

    // A different payload under the same signature must not verify.
    const { encodeBase64Url } = await import('@std/encoding');
    const forgedBody = encodeBase64Url(
      JSON.stringify({ iss: 'attacker', exp: 1300819380 }),
    );
    await asserts.assertRejects(
      () =>
        verifyJWT(`${header}.${forgedBody}.${sig}`, publicJwk, {
          algorithm: 'ES256',
          ignoreExpiration: true,
        }),
      JWTError,
      'Invalid signature',
    );

    // One flipped character in the signature must not verify.
    const flipped = (sig[0] === 'D' ? 'E' : 'D') + sig.slice(1);
    await asserts.assertRejects(
      () =>
        verifyJWT(`${header}.${body}.${flipped}`, publicJwk, {
          algorithm: 'ES256',
          ignoreExpiration: true,
        }),
      JWTError,
      'Invalid signature',
    );
  });

  it('verifyJWT - ES256/384/512 round-trip, including the P-521 pairing', async () => {
    const { generateECKeyPair } = await import('../generators/key.ts');
    const { decodeBase64Url } = await import('@std/encoding');

    // ES512 is bound to P-521 — the names deliberately do not line up.
    for (
      const [alg, curve, sigBytes] of [
        ['ES256', 'P-256', 64],
        ['ES384', 'P-384', 96],
        ['ES512', 'P-521', 132],
      ] as const
    ) {
      const keys = await generateECKeyPair({
        algorithm: 'ECDSA',
        curve,
        format: 'PEM',
        extractable: true,
      });
      const token = await issueJWT(
        alg,
        { sub: 'ec-user' },
        keys.privateKeyExported as string,
      );

      asserts.assertEquals(
        JSON.parse(
          new TextDecoder().decode(decodeBase64Url(token.split('.')[0]!)),
        ).alg,
        alg,
      );
      asserts.assertEquals(
        decodeBase64Url(token.split('.')[2]!).length,
        sigBytes,
        `${alg} signature must be ${sigBytes} bytes of R‖S`,
      );

      const payload = await verifyJWT(
        token,
        keys.publicKeyExported as string,
        { algorithm: alg },
      );
      asserts.assertEquals(payload.sub, 'ec-user');
    }
  });

  it('verifyJWT - SECURITY: an ES256 token cannot be verified with a P-384 key', async () => {
    // RFC 7518 §3.4 binds ES256 to P-256 and nothing else. A key on another
    // curve must be refused as a *key* error, distinguishable from a forged
    // signature, so an operator can tell misconfiguration from attack.
    const { generateECKeyPair } = await import('../generators/key.ts');
    const p256 = await generateECKeyPair({
      algorithm: 'ECDSA',
      curve: 'P-256',
      format: 'PEM',
      extractable: true,
    });
    const p384 = await generateECKeyPair({
      algorithm: 'ECDSA',
      curve: 'P-384',
      format: 'PEM',
      extractable: true,
    });

    const token = await issueJWT(
      'ES256',
      { sub: 'user' },
      p256.privateKeyExported as string,
    );

    await asserts.assertRejects(
      () => verifyJWT(token, p384.publicKeyExported as string),
      JWTError,
      'requires an EC key on P-256 but the supplied key is on P-384',
    );
    // Pinning the algorithm does not change the outcome — the curve check is
    // always on, not a consequence of pinning.
    await asserts.assertRejects(
      () =>
        verifyJWT(token, p384.publicKeyExported as string, {
          algorithm: 'ES256',
        }),
      JWTError,
      'Curve mismatch',
    );
  });

  it('verifyJWT - SECURITY: EC and RSA keys cannot be swapped across families', async () => {
    const { generateECKeyPair, generateRSAKeyPair } = await import(
      '../generators/key.ts'
    );
    const ec = await generateECKeyPair({
      algorithm: 'ECDSA',
      curve: 'P-256',
      format: 'PEM',
      extractable: true,
    });
    const rsa = await generateRSAKeyPair({
      algorithm: 'RSA-PSS',
      keySize: 2048,
      hashAlgorithm: 'SHA-256',
      format: 'PEM',
      extractable: true,
    });

    const esToken = await issueJWT(
      'ES256',
      { sub: 'user' },
      ec.privateKeyExported as string,
    );
    const rsToken = await issueJWT(
      'RS256',
      { sub: 'user' },
      rsa.privateKeyExported as string,
    );

    // An EC key offered for an RS256 token.
    await asserts.assertRejects(
      () => verifyJWT(rsToken, ec.publicKeyExported as string),
      JWTError,
      'Algorithm confusion detected',
    );
    // An RSA key offered for an ES256 token.
    await asserts.assertRejects(
      () => verifyJWT(esToken, rsa.publicKeyExported as string),
      JWTError,
      'Algorithm confusion detected',
    );
    // The classic: an ES256 token replayed as HS256, HMAC-keyed with the
    // public key bytes the attacker can read from the JWKS.
    const forged = await issueJWT(
      'HS256',
      { sub: 'attacker' },
      ec.publicKeyExported as string,
    );
    await asserts.assertRejects(
      () => verifyJWT(forged, ec.publicKeyExported as string),
      JWTError,
      'Algorithm confusion detected',
    );
    // A raw secret cannot verify an EC token either.
    await asserts.assertRejects(
      () => verifyJWT(esToken, TEST_SECRET),
      JWTError,
      'Algorithm confusion detected',
    );
  });

  // ── Key formats: CryptoKey and JWK ───────────────────────────────────

  it('verifyJWT - accepts a CryptoKey and a JWK for every asymmetric family', async () => {
    const { generateECKeyPair, generateRSAKeyPair } = await import(
      '../generators/key.ts'
    );
    const ec = await generateECKeyPair({
      algorithm: 'ECDSA',
      curve: 'P-256',
      format: 'JWK',
      extractable: true,
    });
    const rsa = await generateRSAKeyPair({
      algorithm: 'RSA-PSS',
      keySize: 2048,
      hashAlgorithm: 'SHA-256',
      format: 'JWK',
      extractable: true,
    });

    // Issue with a CryptoKey, verify with a CryptoKey and with a JWK.
    const esToken = await issueJWT('ES256', { sub: 'u' }, ec.privateKey);
    asserts.assertEquals(
      (await verifyJWT(esToken, ec.publicKey, { algorithm: 'ES256' })).sub,
      'u',
    );
    asserts.assertEquals(
      (await verifyJWT(esToken, ec.publicKeyExported as JsonWebKey, {
        algorithm: 'ES256',
      })).sub,
      'u',
    );

    // Same for RSA — PS256 here, since the generated key is RSA-PSS.
    const psToken = await issueJWT('PS256', { sub: 'u' }, rsa.privateKey);
    asserts.assertEquals(
      (await verifyJWT(psToken, rsa.publicKey, { algorithm: 'PS256' })).sub,
      'u',
    );
    asserts.assertEquals(
      (await verifyJWT(psToken, rsa.publicKeyExported as JsonWebKey, {
        algorithm: 'PS256',
      })).sub,
      'u',
    );

    // And a JWK issued token verifies against the PEM form of the same key —
    // the three key forms are interchangeable, not three separate paths.
    const pem = await generateECKeyPair({
      algorithm: 'ECDSA',
      curve: 'P-256',
      format: 'PEM',
      extractable: true,
    });
    const fromPem = await issueJWT(
      'ES256',
      { sub: 'u' },
      pem.privateKeyExported as string,
    );
    asserts.assertEquals(
      (await verifyJWT(fromPem, pem.publicKey, { algorithm: 'ES256' })).sub,
      'u',
    );
  });

  it('verifyJWT - SECURITY: a JWK that contradicts the operation is refused', async () => {
    const { generateECKeyPair } = await import('../generators/key.ts');
    const ec = await generateECKeyPair({
      algorithm: 'ECDSA',
      curve: 'P-256',
      format: 'JWK',
      extractable: true,
    });
    const token = await issueJWT('ES256', { sub: 'u' }, ec.privateKey);
    const jwk = ec.publicKeyExported as JsonWebKey;

    // Widening the key input means the key's own declarations become
    // attack surface: each of these must be honoured, not ignored.
    const cases: Array<[JsonWebKey, string]> = [
      [{ ...jwk, alg: 'RS256' }, "JWK 'alg' is 'RS256'"],
      [{ ...jwk, use: 'enc' }, "JWK 'use' is 'enc'"],
      [{ ...jwk, key_ops: ['encrypt'] }, "JWK 'key_ops' does not permit"],
      [{ ...jwk, crv: 'P-384' }, 'Curve mismatch'],
    ];
    for (const [candidate, message] of cases) {
      await asserts.assertRejects(
        () => verifyJWT(token, candidate, { algorithm: 'ES256' }),
        JWTError,
        message,
      );
    }

    // A private JWK handed to a verifier is a key-handling bug — and would
    // mean the signing key had leaked into a verification path.
    const privateJwk = ec.privateKeyExported as JsonWebKey;
    asserts.assertExists(privateJwk.d, 'fixture must be a private JWK');
    await asserts.assertRejects(
      () => verifyJWT(token, privateJwk, { algorithm: 'ES256' }),
      JWTError,
      "carries private material ('d')",
    );
  });

  it('verifyJWT - SECURITY: a CryptoKey that cannot do the job is refused', async () => {
    const { generateECKeyPair, generateRSAKeyPair } = await import(
      '../generators/key.ts'
    );
    const ec = await generateECKeyPair({
      algorithm: 'ECDSA',
      curve: 'P-256',
      extractable: true,
    });
    const rsa = await generateRSAKeyPair({
      algorithm: 'RSA-OAEP',
      keySize: 2048,
      hashAlgorithm: 'SHA-256',
      extractable: true,
    });
    const token = await issueJWT('ES256', { sub: 'u' }, ec.privateKey);

    // An encryption key is not a verification key, whatever its family — and
    // it is reported as a *key* problem, not as a forged signature.
    await asserts.assertRejects(
      () => verifyJWT(token, rsa.publicKey, { algorithm: 'ES256' }),
      JWTError,
      "CryptoKey algorithm 'RSA-OAEP' cannot sign or verify",
    );

    // A private key is not a public key: verification must not accept the
    // signing half even though it is on the right curve.
    await asserts.assertRejects(
      () => verifyJWT(token, ec.privateKey, { algorithm: 'ES256' }),
      JWTError,
      "CryptoKey is a 'private' key but verify needs a 'public' key",
    );
  });

  it('verifyJWT - refreshJWT round-trips an ES256 token', async () => {
    const { generateECKeyPair } = await import('../generators/key.ts');
    const { refreshJWT, decodeJWT } = await import('./helpers.ts');
    const keys = await generateECKeyPair({
      algorithm: 'ECDSA',
      curve: 'P-256',
      format: 'PEM',
      extractable: true,
    });
    const publicKey = keys.publicKeyExported as string;
    const privateKey = keys.privateKeyExported as string;

    const token = await issueJWT('ES256', {
      sub: 'ec-user',
      exp: Math.floor(Date.now() / 1000) + 1800,
    }, privateKey);

    const refreshed = await refreshJWT(
      token,
      { verifyKey: publicKey, signKey: privateKey },
      3600,
    );
    asserts.assertEquals(decodeJWT(refreshed).header.alg, 'ES256');
    asserts.assertEquals(
      (await verifyJWT(refreshed, publicKey, { algorithm: 'ES256' })).sub,
      'ec-user',
    );

    // Like RSA, an EC token refreshed with a single key hits the key-config
    // guard rather than a confusing signature failure.
    await asserts.assertRejects(
      () => refreshJWT(token, privateKey),
      JWTError,
      'EC tokens require separate verifyKey and signKey',
    );
  });

  it('verifyJWT - SECURITY: a validly-signed non-object payload is INVALID_PAYLOAD, not a raw TypeError', async () => {
    // JWS permits any payload; a correctly-signed token minted by another stack
    // can carry `null`, a bare number or an array. Before the object-shape
    // guard, `null` made validateClaims read `payload.exp` on null (a raw
    // TypeError outside the JWTError taxonomy), `42` was RETURNED typed as
    // JWTPayload in violation of the return type, and `42` + requiredClaims
    // threw "Cannot use 'in' operator". RFC 7519 §7.2 makes the claims set a
    // JSON object, so every non-object payload must be INVALID_PAYLOAD.
    for (const raw of ['null', '42', '"a string"', 'true', '[]']) {
      const token = await mintRawHS256(
        JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
        raw,
      );
      const err = await asserts.assertRejects(
        () => verifyJWT(token, TEST_SECRET),
        JWTError,
        undefined,
        `payload '${raw}' should be INVALID_PAYLOAD`,
      );
      asserts.assertEquals(
        (err as JWTError).context.code,
        'INVALID_PAYLOAD',
        `payload '${raw}' code`,
      );
    }

    // The requiredClaims path (`claim in payload`) is guarded too.
    const numToken = await mintRawHS256(
      JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
      '42',
    );
    const err = await asserts.assertRejects(
      () => verifyJWT(numToken, TEST_SECRET, { requiredClaims: ['sub'] }),
      JWTError,
    );
    asserts.assertEquals((err as JWTError).context.code, 'INVALID_PAYLOAD');
  });

  it('verifyJWT - SECURITY: a JSON-null header is INVALID_HEADER, not a raw TypeError', async () => {
    // Header parsing precedes signature verification, so unauthenticated input
    // reaches it. `base64url('null')` parses to `null`; before the guard
    // `!header.alg` dereferenced null and threw a raw TypeError outside any
    // catch, breaking the documented `instanceof JWTError` handling on every
    // malformed-token probe. A JWT header MUST be a JSON object (RFC 7515 §4).
    const nullHeaderToken = await mintRawHS256(
      'null',
      JSON.stringify({ sub: 'x' }),
    );
    const err = await asserts.assertRejects(
      () => verifyJWT(nullHeaderToken, TEST_SECRET),
      JWTError,
    );
    asserts.assertEquals((err as JWTError).context.code, 'INVALID_HEADER');

    // The exact token from the finding — no key or signature knowledge needed.
    const err2 = await asserts.assertRejects(
      () => verifyJWT('bnVsbA.e30.AA', TEST_SECRET),
      JWTError,
    );
    asserts.assertEquals((err2 as JWTError).context.code, 'INVALID_HEADER');

    // decodeJWT must not silently return { header: null } — that cascades into
    // refreshJWT reading header.alg. Both header-null and payload-null throw.
    const { decodeJWT } = await import('./helpers.ts');
    asserts.assertThrows(() => decodeJWT('bnVsbA.e30.AA'), JWTError);
    asserts.assertThrows(
      // valid header, payload segment is base64url('null')
      () => decodeJWT('eyJhbGciOiJIUzI1NiJ9.bnVsbA.AA'),
      JWTError,
    );
  });

  it('refreshJWT/decodeJWT - SECURITY: a header with a missing or non-string `alg` is INVALID_HEADER, not a raw TypeError', async () => {
    // Round-4 regression guard. The round-3 fix only rejected a *non-object*
    // header (null / array / primitive). A header that IS a JSON object but
    // whose required `alg` (RFC 7515 §4.1.1) is missing or not a string still
    // slipped through decodeJWT's `parsedHeader as JWTHeader` cast, so
    // refreshJWT — which reads `header.alg` and calls algorithmFamily
    // (`alg.startsWith(...)`) *before* verifyJWT runs — threw a raw TypeError
    // outside the JWTError taxonomy on an unauthenticated malformed-token
    // probe, turning a would-be 401 into a 500 under the documented
    // `catch (e) { if (e instanceof JWTError) ... }` pattern. No key or
    // signature knowledge is needed to reach the crash.
    const { decodeJWT, refreshJWT } = await import('./helpers.ts');
    const { encodeBase64Url } = await import('@std/encoding');
    const mint = (headerJson: string): string =>
      `${encodeBase64Url(new TextEncoder().encode(headerJson))}.${
        encodeBase64Url(new TextEncoder().encode('{}'))
      }.AA`;

    for (
      const headerJson of [
        '{}', // alg missing entirely
        '{"typ":"JWT"}', // alg missing, other fields present
        '{"alg":123}', // alg is a number
        '{"alg":null}', // alg is null
        '{"alg":{"x":1}}', // alg is an object
        '{"alg":""}', // alg is an empty string
      ]
    ) {
      const token = mint(headerJson);

      // decodeJWT must throw a typed JWTError, never a raw TypeError.
      const decErr = asserts.assertThrows(
        () => decodeJWT(token),
        JWTError,
        undefined,
        `decodeJWT should throw JWTError for header ${headerJson}`,
      );
      asserts.assertEquals((decErr as JWTError).context.code, 'INVALID_HEADER');

      // refreshJWT reaches algorithmFamily(header.alg) before verifyJWT, so it
      // must surface the same typed error rather than a raw TypeError.
      const refErr = await asserts.assertRejects(
        () => refreshJWT(token, TEST_SECRET),
        JWTError,
        undefined,
        `refreshJWT should throw JWTError for header ${headerJson}`,
      );
      asserts.assert(
        refErr instanceof JWTError,
        `refreshJWT threw a non-JWTError for header ${headerJson}`,
      );
    }

    // Regression: the round-3 null-header case must remain INVALID_HEADER.
    asserts.assertThrows(() => decodeJWT('bnVsbA.e30.AA'), JWTError);
  });

  it("verifyJWT - a bespoke issued 'typ' verifies by default (JWTIssueOptions.typ contract)", async () => {
    // JWTIssueOptions.typ's doc once claimed verifyJWT "only accepts 'JWT' and
    // 'at+jwt' unless its own typ allow-list is widened" — false since commit
    // 4272b62 made typ unchecked by default. A token minted with a bespoke typ
    // verifies fine when the resource server passes no `typ`, so the cross-type
    // guard a reader might infer from that doc does NOT exist by default; it is
    // opt-in via options.typ.
    const token = await issueJWT('HS256', { sub: 'u1' }, TEST_SECRET, {
      typ: 'refresh+jwt',
    });
    asserts.assertEquals((await verifyJWT(token, TEST_SECRET)).sub, 'u1');
    // Only an explicit pin refuses the cross-type replay.
    await asserts.assertRejects(
      () => verifyJWT(token, TEST_SECRET, { typ: 'at+jwt' }),
      JWTError,
    );
  });

  it('verifyJWT - iss/aud/jti are the enforcing keys, not issuer/audience/jwtId', async () => {
    // The verify.ts JSDoc example once passed `audience`/`issuer`/`jwtId` —
    // keys validateClaims never reads — so it silently ran ZERO issuer/audience
    // checking (fail-open). The real keys are `aud`/`iss`/`jti`. This pins that
    // the correct keys enforce and documents why the wrong ones are a trap.
    const token = await issueJWT('HS256', {
      sub: 'u1',
      iss: 'evil.example.com',
      aud: 'other.example.com',
    }, TEST_SECRET);

    // Correct keys enforce: a wrong issuer is rejected.
    await asserts.assertRejects(
      () =>
        verifyJWT(token, TEST_SECRET, {
          iss: 'auth.example.com',
          aud: 'api.example.com',
        }),
      JWTError,
      'Invalid issuer',
    );

    // The old example's wrong keys are silently ignored — the mismatched token
    // verifies. This is exactly the fail-open the corrected example avoids.
    const wrongKeys = {
      audience: 'api.example.com',
      issuer: 'auth.example.com',
      jwtId: 'some-id',
    } as unknown as JWTVerifyOptions;
    asserts.assertEquals(
      (await verifyJWT(token, TEST_SECRET, wrongKeys)).sub,
      'u1',
    );
  });
});
