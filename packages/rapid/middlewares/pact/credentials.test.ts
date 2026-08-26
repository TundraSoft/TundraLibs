/**
 * @fileoverview Tests for the five pact credential extractors + the
 * `ctx.auth` sanitizer.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import type { PactPrincipal } from '@tundralibs/pact';
import type { RapidContext } from '../../types/mod.ts';
import {
  apiKeyExtractor,
  basicExtractor,
  bearerExtractor,
  hmacExtractor,
  sanitizeAuth,
  tokenExtractor,
} from './credentials.ts';

const httpCtx = (headers: Record<string, string>): RapidContext =>
  ({ type: 'HTTP', headers: new Headers(headers) }) as unknown as RapidContext;

const socketCtx = (headers: Record<string, string>): RapidContext =>
  ({
    type: 'SOCKET',
    connection: { headers: new Headers(headers) },
  }) as unknown as RapidContext;

const jobCtx = (): RapidContext => ({ type: 'JOB' }) as unknown as RapidContext;

const PRINCIPAL: PactPrincipal = {
  id: 'u1',
  grants: {},
  status: 'ACTIVE',
  metadata: {},
};

describe('rapid.middlewares.pact.credentials', () => {
  describe('bearerExtractor', () => {
    it('extracts the token after the default Bearer prefix', async () => {
      const extract = bearerExtractor({});
      asserts.assertEquals(
        await extract(httpCtx({ authorization: 'Bearer abc123' })),
        { scheme: 'BEARER', token: 'abc123' },
      );
    });

    it('reads a custom header and prefix', async () => {
      const extract = bearerExtractor({ header: 'x-token', prefix: 'Tok' });
      asserts.assertEquals(
        await extract(httpCtx({ 'x-token': 'Tok xyz' })),
        { scheme: 'BEARER', token: 'xyz' },
      );
    });

    it('reads the SOCKET connection headers', async () => {
      const extract = bearerExtractor({});
      asserts.assertEquals(
        await extract(socketCtx({ authorization: 'Bearer abc' })),
        { scheme: 'BEARER', token: 'abc' },
      );
    });

    it('resolves null on a missing header, wrong scheme, or JOB', async () => {
      const extract = bearerExtractor({});
      asserts.assertEquals(await extract(httpCtx({})), null);
      asserts.assertEquals(
        await extract(httpCtx({ authorization: 'Basic abc' })),
        null,
      );
      asserts.assertEquals(await extract(jobCtx()), null);
    });
  });

  describe('tokenExtractor', () => {
    it('defaults to the Token prefix (distinct from Bearer)', async () => {
      const extract = tokenExtractor({});
      asserts.assertEquals(
        await extract(httpCtx({ authorization: 'Token abc123' })),
        { scheme: 'TOKEN', token: 'abc123' },
      );
      asserts.assertEquals(
        await extract(httpCtx({ authorization: 'Bearer abc123' })),
        null,
      );
    });
  });

  describe('basicExtractor', () => {
    it('decodes identifier:password from base64', async () => {
      const extract = basicExtractor({});
      const encoded = btoa('ada@example.com:hunter2');
      asserts.assertEquals(
        await extract(httpCtx({ authorization: `Basic ${encoded}` })),
        { scheme: 'BASIC', identifier: 'ada@example.com', password: 'hunter2' },
      );
    });

    it('splits only on the FIRST colon (a password may contain one)', async () => {
      const extract = basicExtractor({});
      const encoded = btoa('ada:pass:word');
      asserts.assertEquals(
        await extract(httpCtx({ authorization: `Basic ${encoded}` })),
        { scheme: 'BASIC', identifier: 'ada', password: 'pass:word' },
      );
    });

    it('resolves null on malformed base64 or a missing colon — never throws', async () => {
      const extract = basicExtractor({});
      asserts.assertEquals(
        await extract(httpCtx({ authorization: 'Basic not-base64!!' })),
        null,
      );
      asserts.assertEquals(
        await extract(httpCtx({ authorization: `Basic ${btoa('nocolon')}` })),
        null,
      );
    });

    it('resolves null on valid base64 that decodes to invalid UTF-8', async () => {
      const extract = basicExtractor({});
      // A lone continuation byte (0x80) followed by ':pw' — valid base64,
      // invalid UTF-8. Must not silently become U+FFFD.
      const bytes = new Uint8Array([0x80, 0x3a, 0x70, 0x77]);
      const encoded = btoa(String.fromCharCode(...bytes));
      asserts.assertEquals(
        await extract(httpCtx({ authorization: `Basic ${encoded}` })),
        null,
      );
    });
  });

  describe('apiKeyExtractor', () => {
    it('requires BOTH the key id and secret headers, non-empty', async () => {
      const extract = apiKeyExtractor({});
      asserts.assertEquals(
        await extract(httpCtx({ 'x-api-key': 'k1', 'x-api-secret': 's1' })),
        { scheme: 'APIKEY', keyId: 'k1', secret: 's1' },
      );
      asserts.assertEquals(await extract(httpCtx({ 'x-api-key': 'k1' })), null);
      asserts.assertEquals(
        await extract(httpCtx({ 'x-api-secret': 's1' })),
        null,
      );
      asserts.assertEquals(
        await extract(httpCtx({ 'x-api-key': '', 'x-api-secret': 's1' })),
        null,
      );
      asserts.assertEquals(
        await extract(httpCtx({ 'x-api-key': 'k1', 'x-api-secret': '' })),
        null,
      );
    });
  });

  describe('hmacExtractor', () => {
    it('builds the payload via the canonical callback only when both headers are present and non-empty', async () => {
      let calls = 0;
      const extract = hmacExtractor({
        canonical: () => {
          calls++;
          return 'canonical-string';
        },
      });
      asserts.assertEquals(
        await extract(httpCtx({ 'x-api-key': 'k1', 'x-signature': 'sig1' })),
        {
          scheme: 'HMAC',
          keyId: 'k1',
          signature: 'sig1',
          payload: 'canonical-string',
        },
      );
      asserts.assertEquals(calls, 1);
      // Missing signature header — canonical() must NOT run (no wasted body read).
      asserts.assertEquals(
        await extract(httpCtx({ 'x-api-key': 'k1' })),
        null,
      );
      asserts.assertEquals(calls, 1);
      // Present-but-empty signature header — same as missing.
      asserts.assertEquals(
        await extract(httpCtx({ 'x-api-key': 'k1', 'x-signature': '' })),
        null,
      );
      asserts.assertEquals(calls, 1);
    });
  });

  describe('sanitizeAuth', () => {
    it('always includes the principal fields plus authMode', () => {
      const result = sanitizeAuth(PRINCIPAL, { scheme: 'BEARER', token: 'x' });
      asserts.assertEquals(result, { ...PRINCIPAL, authMode: 'BEARER' });
    });

    it('keeps identifier for BASIC, keyId for APIKEY/HMAC — never the secret', () => {
      const basic = sanitizeAuth(PRINCIPAL, {
        scheme: 'BASIC',
        identifier: 'ada',
        password: 'hunter2',
      });
      asserts.assertEquals(basic, {
        ...PRINCIPAL,
        authMode: 'BASIC',
        identifier: 'ada',
      });
      asserts.assertEquals(
        (basic as { password?: unknown }).password,
        undefined,
      );

      const apiKey = sanitizeAuth(PRINCIPAL, {
        scheme: 'APIKEY',
        keyId: 'k1',
        secret: 's1',
      });
      asserts.assertEquals(apiKey, {
        ...PRINCIPAL,
        authMode: 'APIKEY',
        keyId: 'k1',
      });
      asserts.assertEquals((apiKey as { secret?: unknown }).secret, undefined);

      const hmac = sanitizeAuth(PRINCIPAL, {
        scheme: 'HMAC',
        keyId: 'k1',
        signature: 'sig',
        payload: 'p',
      });
      asserts.assertEquals(hmac, {
        ...PRINCIPAL,
        authMode: 'HMAC',
        keyId: 'k1',
      });
      asserts.assertEquals(
        (hmac as { signature?: unknown }).signature,
        undefined,
      );
      asserts.assertEquals((hmac as { payload?: unknown }).payload, undefined);
    });

    it('drops the token for TOKEN — holding it is the auth', () => {
      const result = sanitizeAuth(PRINCIPAL, {
        scheme: 'TOKEN',
        token: 'raw-token',
      });
      asserts.assertEquals(result, { ...PRINCIPAL, authMode: 'TOKEN' });
      asserts.assertEquals((result as { token?: unknown }).token, undefined);
    });
  });
});
