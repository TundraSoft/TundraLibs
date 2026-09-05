/**
 * @fileoverview Tests for the framework-neutral middleware core.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { extractCredential, failureResponse } from './shared.ts';
import { PactError } from '../errors/mod.ts';
import type { PactMiddlewareRequest } from './types/mod.ts';

function request(
  headers: Record<string, string>,
  method = 'GET',
  path = '/x',
): PactMiddlewareRequest {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
  return { method, path, header: (name) => lower[name.toLowerCase()] ?? null };
}

describe('extractCredential', () => {
  it('should parse each Authorization carrier into its scheme', () => {
    asserts.assertEquals(
      extractCredential(request({ authorization: 'Bearer tok-1' })),
      { scheme: 'BEARER', token: 'tok-1' },
    );
    asserts.assertEquals(
      extractCredential(
        request({ authorization: `Basic ${btoa('ada:pw:1')}` }),
      ),
      // Only the first colon splits — passwords may contain colons.
      { scheme: 'BASIC', identifier: 'ada', password: 'pw:1' },
    );
    asserts.assertEquals(
      extractCredential(request({ authorization: 'ApiKey k1:s:1' })),
      { scheme: 'APIKEY', keyId: 'k1', secret: 's:1' },
    );
  });

  it('should return null for malformed or unknown carriers', () => {
    const cases: Record<string, string>[] = [
      { authorization: 'Basic %%%not-base64%%%' },
      { authorization: `Basic ${btoa('no-colon')}` },
      { authorization: 'ApiKey no-colon' },
      { authorization: 'Digest whatever' },
      {},
    ];
    for (const headers of cases) {
      asserts.assertStrictEquals(extractCredential(request(headers)), null);
    }
  });

  it('should ignore HMAC headers unless the canonical contract is configured', () => {
    const headers = { 'x-key-id': 'k1', 'x-signature': 'ab12' };
    asserts.assertStrictEquals(extractCredential(request(headers)), null);
    const credential = extractCredential(
      request(headers, 'POST', '/billing'),
      { hmac: { canonical: (req) => `${req.method} ${req.path}` } },
    );
    asserts.assertEquals(credential, {
      scheme: 'HMAC',
      keyId: 'k1',
      signature: 'ab12',
      payload: 'POST /billing',
    });
  });

  it('should treat a scheme excluded by options as absent', () => {
    asserts.assertStrictEquals(
      extractCredential(request({ authorization: 'Bearer t' }), {
        schemes: ['APIKEY'],
      }),
      null,
    );
    asserts.assertEquals(
      extractCredential(request({ authorization: 'ApiKey k:s' }), {
        schemes: ['APIKEY'],
      }),
      { scheme: 'APIKEY', keyId: 'k', secret: 's' },
    );
  });
});

describe('failureResponse', () => {
  it('should map pact error codes to their HTTP statuses', () => {
    const cases: [string, number, string][] = [
      ['INVALID_CREDENTIALS', 401, 'INVALID_CREDENTIALS'],
      ['SESSION_EXPIRED', 401, 'SESSION_EXPIRED'],
      ['REFRESH_REUSED', 401, 'REFRESH_REUSED'],
      ['PERMISSION_DENIED', 403, 'PERMISSION_DENIED'],
      ['USER_EXISTS', 409, 'USER_EXISTS'],
      // Config/storage failures are 500 with the code hidden.
      ['MISSING_HOOK', 500, 'INTERNAL'],
    ];
    for (const [code, status, body] of cases) {
      const failure = failureResponse(
        // deno-lint-ignore no-explicit-any
        new PactError(code as any, {
          hook: 'x',
          status: 'y',
          userId: 'z',
          kind: 'USER',
          principal: 'p',
          permission: 'READ',
          module: 'Post',
          identifier: 'i',
        }),
      );
      asserts.assertStrictEquals(failure?.status, status, code);
      asserts.assertStrictEquals(failure?.body.error, body, code);
    }
  });

  it('should return null for non-pact errors', () => {
    asserts.assertStrictEquals(failureResponse(new TypeError('boom')), null);
    asserts.assertStrictEquals(failureResponse('junk'), null);
  });
});
