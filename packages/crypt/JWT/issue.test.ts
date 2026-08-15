import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { issueJWT } from './issue.ts';
import { verifyJWT } from './verify.ts';
import { JWTError } from './errors/mod.ts';
import type { JWTAlgorithm, JWTPayload } from './types/mod.ts';
const TEST_SECRET = 'test-secret-at-least-256-bits-long-for-testing-purposes';

describe('crypt.JWT.issue', () => {
  it('issueJWT - Basic Token Creation', async () => {
    const payload: JWTPayload = {
      sub: '1234567890',
      name: 'John Doe',
      admin: true,
    };

    const token = await issueJWT('HS256', payload, TEST_SECRET);

    asserts.assertEquals(typeof token, 'string');
    const parts = token.split('.');
    asserts.assertEquals(parts.length, 3);
  });

  it('issueJWT - All Algorithms', async () => {
    const payload: JWTPayload = { sub: 'test' };
    const algorithms: JWTAlgorithm[] = ['HS256', 'HS384', 'HS512'];

    for (const algo of algorithms) {
      const token = await issueJWT(algo, payload, TEST_SECRET);
      asserts.assertEquals(typeof token, 'string');
      const parts = token.split('.');
      asserts.assertEquals(parts.length, 3);
    }
  });

  it('issueJWT - Custom Claims', async () => {
    const payload: JWTPayload = {
      sub: 'user123',
      role: 'admin',
      permissions: ['read', 'write'],
      metadata: { department: 'engineering' },
    };

    const token = await issueJWT('HS256', payload, TEST_SECRET);
    asserts.assertEquals(typeof token, 'string');
    const parts = token.split('.');
    asserts.assertEquals(parts.length, 3);
  });

  it('issueJWT - Time-based Claims', async () => {
    const now = Math.floor(Date.now() / 1000);
    const payload: JWTPayload = {
      sub: 'test',
      exp: now + 3600, // Expires in 1 hour
      nbf: now, // Not before now
      iat: now, // Issued at now
    };

    const token = await issueJWT('HS256', payload, TEST_SECRET);
    asserts.assertEquals(typeof token, 'string');
  });

  it('issueJWT - Automatic iat Setting', async () => {
    const payload: JWTPayload = {
      sub: 'service-account',
      // iat will be set automatically
    };

    const token = await issueJWT('HS512', payload, TEST_SECRET);
    asserts.assertEquals(typeof token, 'string');
  });

  it('issueJWT - Audience Claims', async () => {
    const payload: JWTPayload = {
      sub: 'user456',
      iss: 'auth.example.com',
      aud: ['api.example.com', 'web.example.com'],
      exp: Math.floor(Date.now() / 1000) + 1800,
    };

    const token = await issueJWT('HS384', payload, TEST_SECRET);
    asserts.assertEquals(typeof token, 'string');
  });

  it('issueJWT - Single Audience', async () => {
    const payload: JWTPayload = {
      sub: 'user789',
      aud: 'api.example.com',
    };

    const token = await issueJWT('HS256', payload, TEST_SECRET);
    asserts.assertEquals(typeof token, 'string');
  });

  it('issueJWT - Empty Payload', async () => {
    const payload: JWTPayload = {};

    const token = await issueJWT('HS256', payload, TEST_SECRET);
    asserts.assertEquals(typeof token, 'string');
  });

  it('issueJWT - Long Secret', async () => {
    const longSecret = 'a'.repeat(1000);
    const payload: JWTPayload = { sub: 'test' };

    const token = await issueJWT('HS256', payload, longSecret);
    asserts.assertEquals(typeof token, 'string');
  });

  it('issueJWT - Unicode in Payload', async () => {
    const payload: JWTPayload = {
      sub: 'user123',
      name: '测试用户 🌍',
      message: 'Hello 世界',
    };

    const token = await issueJWT('HS256', payload, TEST_SECRET);
    asserts.assertEquals(typeof token, 'string');
  });

  it('issueJWT - Numeric Claims', async () => {
    const payload: JWTPayload = {
      sub: 'user123',
      version: 1.5,
      count: 42,
      pi: 3.14159,
    };

    const token = await issueJWT('HS256', payload, TEST_SECRET);
    asserts.assertEquals(typeof token, 'string');
  });

  it('issueJWT - Boolean Claims', async () => {
    const payload: JWTPayload = {
      sub: 'user123',
      isAdmin: true,
      isActive: false,
      emailVerified: true,
    };

    const token = await issueJWT('HS256', payload, TEST_SECRET);
    asserts.assertEquals(typeof token, 'string');
  });

  it('issueJWT - Error Handling', async () => {
    const payload: JWTPayload = { sub: 'test' };

    // Empty secret
    await asserts.assertRejects(
      async () => {
        await issueJWT('HS256', payload, '');
      },
      JWTError,
      'Key must be a non-empty string',
    );

    // Non-string secret
    await asserts.assertRejects(
      async () => {
        // @ts-expect-error Testing runtime error
        await issueJWT('HS256', payload, null);
      },
      JWTError,
      'Key must be a non-empty string',
    );

    // Invalid payload
    await asserts.assertRejects(
      async () => {
        // @ts-expect-error Testing runtime error
        await issueJWT('HS256', null, TEST_SECRET);
      },
      JWTError,
      'Payload must be an object',
    );

    // Non-object payload
    await asserts.assertRejects(
      async () => {
        // @ts-expect-error Testing runtime error
        await issueJWT('HS256', 'invalid', TEST_SECRET);
      },
      JWTError,
      'Payload must be an object',
    );
  });

  it('issueJWT - Invalid Claims Validation', async () => {
    // Invalid exp claim
    await asserts.assertRejects(
      async () => {
        // @ts-expect-error Testing runtime error
        await issueJWT('HS256', { exp: 'invalid' }, TEST_SECRET);
      },
      JWTError,
    );

    // Invalid iat claim
    await asserts.assertRejects(
      async () => {
        // @ts-expect-error Testing runtime error
        await issueJWT('HS256', { iat: 'invalid' }, TEST_SECRET);
      },
      JWTError,
    );

    // Invalid nbf claim
    await asserts.assertRejects(
      async () => {
        // @ts-expect-error Testing runtime error
        await issueJWT('HS256', { nbf: 'invalid' }, TEST_SECRET);
      },
      JWTError,
    );
  });

  it('issueJWT - Large Payload', async () => {
    const largePayload: JWTPayload = {
      sub: 'user123',
      data: 'x'.repeat(10000),
    };

    const token = await issueJWT('HS256', largePayload, TEST_SECRET);
    asserts.assertEquals(typeof token, 'string');
  });

  it('issueJWT - Nested Object Claims', async () => {
    const payload: JWTPayload = {
      sub: 'user123',
      profile: {
        name: 'John Doe',
        email: 'john@example.com',
        preferences: {
          theme: 'dark',
          language: 'en',
        },
      },
    };

    const token = await issueJWT('HS256', payload, TEST_SECRET);
    asserts.assertEquals(typeof token, 'string');
  });

  it('issueJWT - Array Claims', async () => {
    const payload: JWTPayload = {
      sub: 'user123',
      roles: ['admin', 'user'],
      permissions: ['read', 'write', 'delete'],
      tags: [],
    };

    const token = await issueJWT('HS256', payload, TEST_SECRET);
    asserts.assertEquals(typeof token, 'string');
  });

  it('issueJWT - Key ID (kid) in header', async () => {
    const payload: JWTPayload = { sub: 'test' };
    const token = await issueJWT(
      'HS256',
      payload,
      TEST_SECRET,
      'key-2024-01',
    );

    const { decodeJWT } = await import('./helpers.ts');
    const decoded = decodeJWT(token);
    asserts.assertEquals(decoded.header.kid, 'key-2024-01');
    asserts.assertEquals(decoded.header.alg, 'HS256');
  });

  it('issueJWT - Refresh token', async () => {
    const payload: JWTPayload = {
      sub: 'user456',
      role: 'admin',
      exp: Math.floor(Date.now() / 1000) + 1800,
    };

    const { refreshJWT, decodeJWT } = await import('./helpers.ts');
    const originalToken = await issueJWT('HS256', payload, TEST_SECRET);
    const originalDecoded = decodeJWT(originalToken);

    // Wait briefly to ensure iat changes
    await new Promise((resolve) => setTimeout(resolve, 1100));

    const refreshedToken = await refreshJWT(
      originalToken,
      TEST_SECRET,
      7200, // 2 hours
    );

    const refreshedDecoded = decodeJWT(refreshedToken);

    // Should have same subject and role
    asserts.assertEquals(refreshedDecoded.payload.sub, 'user456');
    asserts.assertEquals(refreshedDecoded.payload.role, 'admin');

    // Should have new iat and exp
    asserts.assert(
      refreshedDecoded.payload.iat! > originalDecoded.payload.iat!,
    );
    asserts.assert(
      refreshedDecoded.payload.exp! > originalDecoded.payload.exp!,
    );
  });

  it('issueJWT - Refresh with default extension', async () => {
    const payload: JWTPayload = { sub: 'test' };
    const token = await issueJWT('HS256', payload, TEST_SECRET);

    const { refreshJWT, decodeJWT } = await import('./helpers.ts');
    const refreshed = await refreshJWT(token, TEST_SECRET); // Default 3600s
    const decoded = decodeJWT(refreshed);

    const expectedExp = Math.floor(Date.now() / 1000) + 3600;
    asserts.assert(Math.abs(decoded.payload.exp! - expectedExp) < 5);
  });

  it('issueJWT - Preserve kid when refreshing', async () => {
    const payload: JWTPayload = { sub: 'test' };
    const originalToken = await issueJWT(
      'HS256',
      payload,
      TEST_SECRET,
      'key-v1',
    );

    const { refreshJWT, decodeJWT } = await import('./helpers.ts');
    const refreshedToken = await refreshJWT(originalToken, TEST_SECRET);
    const decoded = decodeJWT(refreshedToken);

    asserts.assertEquals(decoded.header.kid, 'key-v1');
  });

  it('issueJWT - Override kid when refreshing', async () => {
    const payload: JWTPayload = { sub: 'test' };
    const originalToken = await issueJWT(
      'HS256',
      payload,
      TEST_SECRET,
      'key-v1',
    );

    const { refreshJWT, decodeJWT } = await import('./helpers.ts');
    const refreshedToken = await refreshJWT(
      originalToken,
      TEST_SECRET,
      3600,
      'key-v2',
    );
    const decoded = decodeJWT(refreshedToken);

    asserts.assertEquals(decoded.header.kid, 'key-v2');
  });

  it('issueJWT - RSA token refresh with separate keys', async () => {
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
      sub: 'user456',
      role: 'admin',
      exp: Math.floor(Date.now() / 1000) + 1800,
    };

    const originalToken = await issueJWT(
      'RS256',
      payload,
      keys.privateKeyExported as string,
      'key-2024-01',
    );

    // Refresh RSA token with separate keys
    const refreshedToken = await refreshJWT(
      originalToken,
      {
        verifyKey: keys.publicKeyExported as string,
        signKey: keys.privateKeyExported as string,
      },
      7200,
      'key-2024-02',
    );

    const decoded = decodeJWT(refreshedToken);
    asserts.assertEquals(decoded.header.alg, 'RS256');
    asserts.assertEquals(decoded.header.kid, 'key-2024-02');
    asserts.assertEquals(decoded.payload.sub, 'user456');
    asserts.assertEquals(decoded.payload.role, 'admin');

    // Verify the refreshed token
    const verified = await verifyJWT(
      refreshedToken,
      keys.publicKeyExported as string,
    );
    asserts.assertEquals(verified.sub, 'user456');
  });

  it('issueJWT - RSA refresh error with single key', async () => {
    const { generateRSAKeyPair } = await import('../generators/key.ts');
    const { refreshJWT } = await import('./helpers.ts');

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

    // Should throw error when trying to refresh RSA token with single key
    await asserts.assertRejects(
      async () => {
        await refreshJWT(token, keys.privateKeyExported as string);
      },
      JWTError,
      'RSA tokens require separate verifyKey and signKey',
    );
  });

  it('issueJWT - HMAC refresh error with key object', async () => {
    const { refreshJWT } = await import('./helpers.ts');

    const payload: JWTPayload = { sub: 'test' };
    const token = await issueJWT('HS256', payload, TEST_SECRET);

    // Should throw error when trying to refresh HMAC token with key object
    await asserts.assertRejects(
      async () => {
        await refreshJWT(token, {
          verifyKey: TEST_SECRET,
          signKey: TEST_SECRET,
        });
      },
      JWTError,
      'HMAC tokens require a single secret key string',
    );
  });

  it('issueJWT - PS256 token refresh with separate keys', async () => {
    // Review regression: refreshJWT's key-config guards only recognized RS*
    // as RSA, so PS* tokens were routed down the wrong validation path. PS*
    // must behave exactly like RS*: refresh works with { verifyKey, signKey }.
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
      sub: 'ps-user',
      exp: Math.floor(Date.now() / 1000) + 1800,
    };
    const token = await issueJWT(
      'PS256',
      payload,
      keys.privateKeyExported as string,
    );

    const refreshedToken = await refreshJWT(
      token,
      {
        verifyKey: keys.publicKeyExported as string,
        signKey: keys.privateKeyExported as string,
      },
      3600,
    );

    const decoded = decodeJWT(refreshedToken);
    asserts.assertEquals(decoded.header.alg, 'PS256');
    asserts.assertEquals(decoded.payload.sub, 'ps-user');

    const verified = await verifyJWT(
      refreshedToken,
      keys.publicKeyExported as string,
      { algorithm: 'PS256' },
    );
    asserts.assertEquals(verified.sub, 'ps-user');
  });

  it('issueJWT - PS256 refresh error with single key', async () => {
    // Second half of the same regression: a PS* token refreshed with a single
    // string key must hit the SAME clear guard RS* tokens do — not fall
    // through to a confusing signature-verification failure.
    const { generateRSAKeyPair } = await import('../generators/key.ts');
    const { refreshJWT } = await import('./helpers.ts');

    const keys = await generateRSAKeyPair({
      algorithm: 'RSA-PSS',
      keySize: 2048,
      hashAlgorithm: 'SHA-256',
      format: 'PEM',
      extractable: true,
    });

    const payload: JWTPayload = { sub: 'ps-test' };
    const token = await issueJWT(
      'PS256',
      payload,
      keys.privateKeyExported as string,
    );

    await asserts.assertRejects(
      async () => {
        await refreshJWT(token, keys.privateKeyExported as string);
      },
      JWTError,
      'RSA tokens require separate verifyKey and signKey',
    );
  });

  it('issueJWT - RSA Algorithms (RS256/384/512)', async () => {
    const { generateRSAKeyPair } = await import('../generators/key.ts');
    const payload: JWTPayload = { sub: 'rsa-test', role: 'admin' };

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
    asserts.assertEquals(typeof token256, 'string');
    asserts.assertEquals(token256.split('.').length, 3);

    // Verify token header
    const { decodeJWT } = await import('./helpers.ts');
    const decoded256 = decodeJWT(token256);
    asserts.assertEquals(decoded256.header.alg, 'RS256');
    asserts.assertEquals(decoded256.payload.sub, 'rsa-test');

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
    asserts.assertEquals(typeof token384, 'string');
    const decoded384 = decodeJWT(token384);
    asserts.assertEquals(decoded384.header.alg, 'RS384');

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
    asserts.assertEquals(typeof token512, 'string');
    const decoded512 = decodeJWT(token512);
    asserts.assertEquals(decoded512.header.alg, 'RS512');
  });

  it('issueJWT - RSA with kid header', async () => {
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
      'rsa-key-2024-01',
    );

    const { decodeJWT } = await import('./helpers.ts');
    const decoded = decodeJWT(token);
    asserts.assertEquals(decoded.header.kid, 'rsa-key-2024-01');
    asserts.assertEquals(decoded.header.alg, 'RS256');
  });

  it('issueJWT - RSA Complex Payload', async () => {
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
      iss: 'auth.example.com',
      aud: ['api.example.com', 'web.example.com'],
      exp: Math.floor(Date.now() / 1000) + 3600,
      roles: ['admin', 'editor'],
      permissions: ['read', 'write', 'delete'],
      metadata: {
        sessionId: 'abc123',
        loginCount: 42,
      },
    };

    const token = await issueJWT(
      'RS256',
      payload,
      keys.privateKeyExported as string,
    );

    const { decodeJWT } = await import('./helpers.ts');
    const decoded = decodeJWT(token);
    asserts.assertEquals(decoded.payload.sub, 'user123');
    asserts.assertEquals(decoded.payload.iss, 'auth.example.com');
    asserts.assertArrayIncludes(decoded.payload.aud as string[], [
      'api.example.com',
    ]);
  });

  it('issueJWT - Invalid Audience Array', async () => {
    // Invalid audience - array with non-string
    await asserts.assertRejects(
      async () => {
        await issueJWT(
          'HS256',
          // @ts-expect-error Testing runtime error
          { sub: 'test', aud: [123] },
          TEST_SECRET,
        );
      },
      JWTError,
      'All audience values must be strings',
    );
  });

  it('issueJWT - Invalid Audience Type', async () => {
    // Invalid audience - not string or array
    await asserts.assertRejects(
      async () => {
        // @ts-expect-error Testing runtime error
        await issueJWT('HS256', { sub: 'test', aud: 123 }, TEST_SECRET);
      },
      JWTError,
      'Audience (aud) must be a string or array of strings',
    );
  });

  it('issueJWT - Unsupported algorithm throws UNSUPPORTED_ALGORITHM', async () => {
    // `EdDSA` (RFC 8037) is a real JOSE algorithm this package does not
    // implement — it stands in for "an algorithm we have never heard of".
    // (This slot used to hold `ES256`, which is now supported.)
    await asserts.assertRejects(
      async () => {
        // @ts-expect-error Testing unsupported algo
        await issueJWT('EdDSA', { sub: 'test' }, TEST_SECRET);
      },
      JWTError,
      'Unsupported algorithm',
    );
  });

  it('issueJWT - Non-JWTError inside try is wrapped as UNKNOWN_ERROR', async () => {
    // Pass a payload that causes JSON.stringify to throw (circular reference)
    const circular: Record<string, unknown> = { sub: 'test' };
    circular['self'] = circular;
    await asserts.assertRejects(
      async () => {
        await issueJWT('HS256', circular, TEST_SECRET);
      },
      JWTError,
    );
  });

  it('decodeJWT - empty header part throws INVALID_FORMAT', async () => {
    const { decodeJWT } = await import('./helpers.ts');
    // Token with 3 parts but empty header produces INVALID_FORMAT with 'missing parts'
    const badToken = `..fakesig`;
    asserts.assertThrows(
      () => decodeJWT(badToken),
      JWTError,
    );
  });

  it('decodeJWT - malformed base64 header throws INVALID_HEADER', async () => {
    const { decodeJWT } = await import('./helpers.ts');
    const { encodeBase64Url } = await import('@std/encoding');
    const validPayload = encodeBase64Url(JSON.stringify({ sub: 'test' }));
    // Use invalid base64 as header so decoding throws
    const badToken = `!!!invalid!!!.${validPayload}.fakesig`;
    asserts.assertThrows(
      () => decodeJWT(badToken),
      JWTError,
    );
  });

  it('decodeJWT - valid header but malformed payload throws INVALID_PAYLOAD', async () => {
    const { decodeJWT } = await import('./helpers.ts');
    const { encodeBase64Url } = await import('@std/encoding');
    const validHeader = encodeBase64Url(
      JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
    );
    // Use valid base64 but non-JSON payload
    const nonJsonBase64 = encodeBase64Url(
      new TextEncoder().encode('not-json-{{{'),
    );
    const badToken = `${validHeader}.${nonJsonBase64}.fakesig`;
    asserts.assertThrows(
      () => decodeJWT(badToken),
      JWTError,
      'Invalid JWT payload',
    );
  });

  it('issueJWT - signature segment is base64url (RFC 7515)', async () => {
    const base64url = /^[A-Za-z0-9_-]+$/;
    const hsSig = (await issueJWT('HS256', { sub: 'u' }, TEST_SECRET))
      .split('.')[2]!;
    asserts.assert(base64url.test(hsSig), `HS256 sig not base64url: ${hsSig}`);

    const { generateRSAKeyPair } = await import('../generators/key.ts');
    const keys = await generateRSAKeyPair({
      algorithm: 'RSA-PSS',
      keySize: 2048,
      hashAlgorithm: 'SHA-256',
      format: 'PEM',
      extractable: true,
    });
    const priv = keys.privateKeyExported as string;
    for (const alg of ['RS256', 'PS256'] as const) {
      const sig = (await issueJWT(alg, { sub: 'u' }, priv)).split('.')[2]!;
      asserts.assert(base64url.test(sig), `${alg} sig not base64url: ${sig}`);
    }
  });

  it('issueJWT - HS256 token verifies under an independent HMAC check (interop)', async () => {
    const { decodeBase64Url } = await import('@std/encoding');
    const token = await issueJWT('HS256', { sub: 'u' }, TEST_SECRET);
    const [h, p, sig] = token.split('.');
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(TEST_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    // An RFC 7515 verifier base64url-decodes the signature and checks the HMAC
    // over `header.payload`. If that passes, the token is standards-compatible.
    const ok = await crypto.subtle.verify(
      'HMAC',
      key,
      decodeBase64Url(sig!),
      new TextEncoder().encode(`${h}.${p}`),
    );
    asserts.assert(ok, 'token sig is not a base64url HMAC over header.payload');
  });

  it("issueJWT - REGRESSION: header typ defaults to 'JWT'", async () => {
    const { decodeJWT } = await import('./helpers.ts');

    // No 4th argument, a bare `kid` string, and an options object without
    // `typ` must all keep stamping the conventional type.
    for (
      const options of [
        undefined,
        'key-2024-01',
        {},
        { kid: 'key-2024-01' },
      ] as const
    ) {
      const token = await issueJWT('HS256', { sub: 'u' }, TEST_SECRET, options);
      asserts.assertEquals(decodeJWT(token).header.typ, 'JWT');
    }
  });

  it('issueJWT - the 4th argument still accepts a bare kid string', async () => {
    // Back-compat: the parameter used to be `kid?: string`. Existing callers
    // (pact passes its configured keyId positionally) must keep working.
    const { decodeJWT } = await import('./helpers.ts');

    const positional = await issueJWT(
      'HS256',
      { sub: 'u' },
      TEST_SECRET,
      'key-2024-01',
    );
    const viaOptions = await issueJWT('HS256', { sub: 'u' }, TEST_SECRET, {
      kid: 'key-2024-01',
    });

    asserts.assertEquals(decodeJWT(positional).header.kid, 'key-2024-01');
    asserts.assertEquals(decodeJWT(viaOptions).header.kid, 'key-2024-01');
  });

  it("issueJWT - emits an RFC 9068 access token with typ 'at+jwt'", async () => {
    const { decodeJWT } = await import('./helpers.ts');

    const token = await issueJWT(
      'HS256',
      {
        iss: 'https://auth.example.com',
        aud: 'https://api.example.com',
        sub: 'user-123',
        client_id: 'app-42',
        jti: 'tok-1',
        exp: Math.floor(Date.now() / 1000) + 300,
      },
      TEST_SECRET,
      { typ: 'at+jwt', kid: 'key-2024-01' },
    );

    const { header } = decodeJWT(token);
    asserts.assertEquals(header.typ, 'at+jwt');
    asserts.assertEquals(header.alg, 'HS256');
    asserts.assertEquals(header.kid, 'key-2024-01');

    // Round-trips through verification pinned to access tokens only.
    const claims = await verifyJWT(token, TEST_SECRET, { typ: 'at+jwt' });
    asserts.assertEquals(claims.client_id, 'app-42');
  });

  it('issueJWT - rejects an empty or non-string typ', async () => {
    await asserts.assertRejects(
      () => issueJWT('HS256', { sub: 'u' }, TEST_SECRET, { typ: '' }),
      JWTError,
      'Token type (typ) must be a non-empty string',
    );
    await asserts.assertRejects(
      () =>
        issueJWT('HS256', { sub: 'u' }, TEST_SECRET, {
          typ: 42 as unknown as string,
        }),
      JWTError,
      'Token type (typ) must be a non-empty string',
    );
  });

  it('refreshJWT - preserves the token type', async () => {
    const { decodeJWT, refreshJWT } = await import('./helpers.ts');
    const now = Math.floor(Date.now() / 1000);

    // A refreshed access token must stay an access token; silently
    // downgrading it to `typ: 'JWT'` would let it be replayed anywhere a
    // plain JWT is accepted.
    const access = await issueJWT(
      'HS256',
      {
        sub: 'u',
        exp: now + 60,
      },
      TEST_SECRET,
      { typ: 'at+jwt' },
    );
    const refreshedAccess = await refreshJWT(access, TEST_SECRET, 7200);
    asserts.assertEquals(decodeJWT(refreshedAccess).header.typ, 'at+jwt');
    asserts.assertEquals(
      (await verifyJWT(refreshedAccess, TEST_SECRET, { typ: 'at+jwt' })).sub,
      'u',
    );

    // …and a plain token still refreshes to a plain token.
    const plain = await issueJWT(
      'HS256',
      { sub: 'u', exp: now + 60 },
      TEST_SECRET,
    );
    const refreshedPlain = await refreshJWT(plain, TEST_SECRET, 7200);
    asserts.assertEquals(decodeJWT(refreshedPlain).header.typ, 'JWT');
  });

  it('issueJWT - ES* mints a header matching the key that signed it', async () => {
    const { generateECKeyPair } = await import('../generators/key.ts');
    const { decodeJWT } = await import('./helpers.ts');

    for (
      const [alg, curve] of [
        ['ES256', 'P-256'],
        ['ES384', 'P-384'],
        ['ES512', 'P-521'],
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
        { sub: 'ec' },
        keys.privateKeyExported as string,
      );
      const decoded = decodeJWT(token);
      asserts.assertEquals(decoded.header.alg, alg);
      asserts.assertEquals(decoded.header.typ, 'JWT');
      asserts.assertEquals(decoded.payload.sub, 'ec');
    }
  });

  it('issueJWT - SECURITY: ES* refuses a key on the wrong curve', async () => {
    // Minting an `ES256` header over a P-384 signature would produce a token
    // no conforming verifier can check — the header would misdescribe its own
    // signature. Caught at issue time rather than discovered by the recipient.
    const { generateECKeyPair, generateRSAKeyPair } = await import(
      '../generators/key.ts'
    );
    const p384 = await generateECKeyPair({
      algorithm: 'ECDSA',
      curve: 'P-384',
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

    await asserts.assertRejects(
      () => issueJWT('ES256', { sub: 'x' }, p384.privateKeyExported as string),
      JWTError,
      'requires an EC key on P-256 but the supplied key is on P-384',
    );
    // ES512 is P-521; P-384 is not a near-miss it should tolerate.
    await asserts.assertRejects(
      () => issueJWT('ES512', { sub: 'x' }, p384.privateKeyExported as string),
      JWTError,
      'requires an EC key on P-521',
    );
    // A non-EC key for an ES* algorithm.
    await asserts.assertRejects(
      () => issueJWT('ES256', { sub: 'x' }, rsa.privateKeyExported as string),
      JWTError,
      "'ES256' needs an EC key but a RSA key was supplied",
    );
    await asserts.assertRejects(
      () => issueJWT('ES256', { sub: 'x' }, TEST_SECRET),
      JWTError,
      "'ES256' needs an EC key but a HMAC key was supplied",
    );
  });

  it('issueJWT - accepts a CryptoKey and a private JWK', async () => {
    const { generateECKeyPair } = await import('../generators/key.ts');
    const { decodeJWT } = await import('./helpers.ts');
    const keys = await generateECKeyPair({
      algorithm: 'ECDSA',
      curve: 'P-256',
      format: 'JWK',
      extractable: true,
    });

    for (
      const key of [keys.privateKey, keys.privateKeyExported as JsonWebKey]
    ) {
      const token = await issueJWT('ES256', { sub: 'ec' }, key);
      asserts.assertEquals(decodeJWT(token).header.alg, 'ES256');
    }

    // A *public* JWK cannot sign — the private half is what issuance needs.
    await asserts.assertRejects(
      () =>
        issueJWT('ES256', { sub: 'ec' }, keys.publicKeyExported as JsonWebKey),
      JWTError,
      "Signing needs a private JWK, but the supplied key has no 'd'",
    );
  });
});
