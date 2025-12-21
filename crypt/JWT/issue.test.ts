import * as asserts from '$asserts';
import { issueJWT } from './issue.ts';
import { verifyJWT } from './verify.ts';
import { JWTError } from './Error.ts';
import type { JWTAlgorithm, JWTPayload } from './types.ts';
const TEST_SECRET = 'test-secret-at-least-256-bits-long-for-testing-purposes';

Deno.test('crypt.JWT.issue', async (t) => {
  await t.step('issueJWT - Basic Token Creation', async () => {
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

  await t.step('issueJWT - All Algorithms', async () => {
    const payload: JWTPayload = { sub: 'test' };
    const algorithms: JWTAlgorithm[] = ['HS256', 'HS384', 'HS512'];

    for (const algo of algorithms) {
      const token = await issueJWT(algo, payload, TEST_SECRET);
      asserts.assertEquals(typeof token, 'string');
      const parts = token.split('.');
      asserts.assertEquals(parts.length, 3);
    }
  });

  await t.step('issueJWT - Custom Claims', async () => {
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

  await t.step('issueJWT - Time-based Claims', async () => {
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

  await t.step('issueJWT - Automatic iat Setting', async () => {
    const payload: JWTPayload = {
      sub: 'service-account',
      // iat will be set automatically
    };

    const token = await issueJWT('HS512', payload, TEST_SECRET);
    asserts.assertEquals(typeof token, 'string');
  });

  await t.step('issueJWT - Audience Claims', async () => {
    const payload: JWTPayload = {
      sub: 'user456',
      iss: 'auth.example.com',
      aud: ['api.example.com', 'web.example.com'],
      exp: Math.floor(Date.now() / 1000) + 1800,
    };

    const token = await issueJWT('HS384', payload, TEST_SECRET);
    asserts.assertEquals(typeof token, 'string');
  });

  await t.step('issueJWT - Single Audience', async () => {
    const payload: JWTPayload = {
      sub: 'user789',
      aud: 'api.example.com',
    };

    const token = await issueJWT('HS256', payload, TEST_SECRET);
    asserts.assertEquals(typeof token, 'string');
  });

  await t.step('issueJWT - Empty Payload', async () => {
    const payload: JWTPayload = {};

    const token = await issueJWT('HS256', payload, TEST_SECRET);
    asserts.assertEquals(typeof token, 'string');
  });

  await t.step('issueJWT - Long Secret', async () => {
    const longSecret = 'a'.repeat(1000);
    const payload: JWTPayload = { sub: 'test' };

    const token = await issueJWT('HS256', payload, longSecret);
    asserts.assertEquals(typeof token, 'string');
  });

  await t.step('issueJWT - Unicode in Payload', async () => {
    const payload: JWTPayload = {
      sub: 'user123',
      name: '测试用户 🌍',
      message: 'Hello 世界',
    };

    const token = await issueJWT('HS256', payload, TEST_SECRET);
    asserts.assertEquals(typeof token, 'string');
  });

  await t.step('issueJWT - Numeric Claims', async () => {
    const payload: JWTPayload = {
      sub: 'user123',
      version: 1.5,
      count: 42,
      pi: 3.14159,
    };

    const token = await issueJWT('HS256', payload, TEST_SECRET);
    asserts.assertEquals(typeof token, 'string');
  });

  await t.step('issueJWT - Boolean Claims', async () => {
    const payload: JWTPayload = {
      sub: 'user123',
      isAdmin: true,
      isActive: false,
      emailVerified: true,
    };

    const token = await issueJWT('HS256', payload, TEST_SECRET);
    asserts.assertEquals(typeof token, 'string');
  });

  await t.step('issueJWT - Error Handling', async () => {
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
        await issueJWT('HS256', payload, null as any);
      },
      JWTError,
      'Key must be a non-empty string',
    );

    // Invalid payload
    await asserts.assertRejects(
      async () => {
        await issueJWT('HS256', null as any, TEST_SECRET);
      },
      JWTError,
      'Payload must be an object',
    );

    // Non-object payload
    await asserts.assertRejects(
      async () => {
        await issueJWT('HS256', 'invalid' as any, TEST_SECRET);
      },
      JWTError,
      'Payload must be an object',
    );
  });

  await t.step('issueJWT - Invalid Claims Validation', async () => {
    // Invalid exp claim
    await asserts.assertRejects(
      async () => {
        await issueJWT('HS256', { exp: 'invalid' as any }, TEST_SECRET);
      },
      JWTError,
    );

    // Invalid iat claim
    await asserts.assertRejects(
      async () => {
        await issueJWT('HS256', { iat: 'invalid' as any }, TEST_SECRET);
      },
      JWTError,
    );

    // Invalid nbf claim
    await asserts.assertRejects(
      async () => {
        await issueJWT('HS256', { nbf: 'invalid' as any }, TEST_SECRET);
      },
      JWTError,
    );
  });

  await t.step('issueJWT - Large Payload', async () => {
    const largePayload: JWTPayload = {
      sub: 'user123',
      data: 'x'.repeat(10000),
    };

    const token = await issueJWT('HS256', largePayload, TEST_SECRET);
    asserts.assertEquals(typeof token, 'string');
  });

  await t.step('issueJWT - Nested Object Claims', async () => {
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

  await t.step('issueJWT - Array Claims', async () => {
    const payload: JWTPayload = {
      sub: 'user123',
      roles: ['admin', 'user'],
      permissions: ['read', 'write', 'delete'],
      tags: [],
    };

    const token = await issueJWT('HS256', payload, TEST_SECRET);
    asserts.assertEquals(typeof token, 'string');
  });

  await t.step('issueJWT - Key ID (kid) in header', async () => {
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

  await t.step('issueJWT - Refresh token', async () => {
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

  await t.step('issueJWT - Refresh with default extension', async () => {
    const payload: JWTPayload = { sub: 'test' };
    const token = await issueJWT('HS256', payload, TEST_SECRET);

    const { refreshJWT, decodeJWT } = await import('./helpers.ts');
    const refreshed = await refreshJWT(token, TEST_SECRET); // Default 3600s
    const decoded = decodeJWT(refreshed);

    const expectedExp = Math.floor(Date.now() / 1000) + 3600;
    asserts.assert(Math.abs(decoded.payload.exp! - expectedExp) < 5);
  });

  await t.step('issueJWT - Preserve kid when refreshing', async () => {
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

  await t.step('issueJWT - Override kid when refreshing', async () => {
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

  await t.step('issueJWT - RSA token refresh with separate keys', async () => {
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

  await t.step('issueJWT - RSA refresh error with single key', async () => {
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

  await t.step('issueJWT - HMAC refresh error with key object', async () => {
    const { refreshJWT } = await import('./helpers.ts');

    const payload: JWTPayload = { sub: 'test' };
    const token = await issueJWT('HS256', payload, TEST_SECRET);

    // Should throw error when trying to refresh HMAC token with key object
    await asserts.assertRejects(
      async () => {
        await refreshJWT(token, {
          verifyKey: TEST_SECRET,
          signKey: TEST_SECRET,
        } as any);
      },
      JWTError,
      'HMAC tokens require a single secret key string',
    );
  });

  await t.step('issueJWT - RSA Algorithms (RS256/384/512)', async () => {
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

  await t.step('issueJWT - RSA with kid header', async () => {
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

  await t.step('issueJWT - RSA Complex Payload', async () => {
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

  await t.step('issueJWT - Invalid Audience Array', async () => {
    // Invalid audience - array with non-string
    await asserts.assertRejects(
      async () => {
        await issueJWT(
          'HS256',
          { sub: 'test', aud: [123] as any },
          TEST_SECRET,
        );
      },
      JWTError,
      'All audience values must be strings',
    );
  });

  await t.step('issueJWT - Invalid Audience Type', async () => {
    // Invalid audience - not string or array
    await asserts.assertRejects(
      async () => {
        await issueJWT('HS256', { sub: 'test', aud: 123 as any }, TEST_SECRET);
      },
      JWTError,
      'Audience (aud) must be a string or array of strings',
    );
  });
});
