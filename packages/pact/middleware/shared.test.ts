/**
 * @fileoverview Carriers (standard defaults, custom header/prefix, the
 * two-header key form, Basic as an API key), HMAC payload rendering, the
 * option validation, and the PactError → status mapping.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import {
  extractCredential,
  failureResponse,
  isFreshTimestamp,
  queryOf,
  resolveOptions,
} from './shared.ts';
import { contentDigest } from './template.ts';
import { PactError } from '../errors/mod.ts';
import type { PactMiddlewareRequest } from './types/mod.ts';

function request(
  headers: Record<string, string>,
  extra: Partial<PactMiddlewareRequest> = {},
): PactMiddlewareRequest {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
  return {
    method: 'get',
    path: '/x',
    header: (name) => lower[name.toLowerCase()] ?? null,
    ...extra,
  };
}

describe('extractCredential', () => {
  it('should parse each standard carrier into its scheme', async () => {
    asserts.assertEquals(
      await extractCredential(request({ authorization: 'Bearer tok-1' })),
      { scheme: 'BEARER', token: 'tok-1' },
    );
    asserts.assertEquals(
      await extractCredential(
        request({ Authorization: `basic ${btoa('ada:pw:1')}` }),
      ),
      // Scheme names are case-insensitive; only the first colon splits.
      { scheme: 'BASIC', identifier: 'ada', password: 'pw:1' },
    );
    asserts.assertEquals(
      await extractCredential(request({ authorization: 'ApiKey k1:s:1' })),
      { scheme: 'APIKEY', keyId: 'k1', secret: 's:1' },
    );
  });

  it('should return null for malformed, empty, or unknown carriers', async () => {
    const cases: Record<string, string>[] = [
      { authorization: 'Basic %%%not-base64%%%' },
      { authorization: `Basic ${btoa('no-colon')}` },
      { authorization: 'ApiKey no-colon' },
      { authorization: 'Bearer ' },
      { authorization: 'Bearertok' },
      { authorization: 'Digest whatever' },
      {},
    ];
    for (const headers of cases) {
      asserts.assertStrictEquals(
        await extractCredential(request(headers)),
        null,
        JSON.stringify(headers),
      );
    }
  });

  it('should honour custom headers and prefixes per carrier', async () => {
    const options = {
      bearer: { header: 'x-session', prefix: '' },
      basic: { prefix: 'Legacy' },
      apiKey: { keyHeader: 'x-api-key', secretHeader: 'x-api-secret' },
    };
    asserts.assertEquals(
      await extractCredential(request({ 'x-session': 'tok' }), options),
      { scheme: 'BEARER', token: 'tok' },
    );
    asserts.assertEquals(
      await extractCredential(
        request({ authorization: `Legacy ${btoa('u:p')}` }),
        options,
      ),
      { scheme: 'BASIC', identifier: 'u', password: 'p' },
    );
    // The standard prefix no longer matches once replaced.
    asserts.assertStrictEquals(
      await extractCredential(
        request({ authorization: `Basic ${btoa('u:p')}` }),
        options,
      ),
      null,
    );
    asserts.assertEquals(
      await extractCredential(
        request({ 'X-Api-Key': 'k9', 'X-Api-Secret': 's9' }),
        options,
      ),
      { scheme: 'APIKEY', keyId: 'k9', secret: 's9' },
    );
    asserts.assertStrictEquals(
      await extractCredential(request({ 'x-api-key': 'k9' }), options),
      null,
      'half of the two-header form is absent, not malformed',
    );
  });

  it('should route Basic to an API key when so configured', async () => {
    asserts.assertEquals(
      await extractCredential(
        request({ authorization: `Basic ${btoa('k1:s1')}` }),
        { basic: { credential: 'apiKey' } },
      ),
      { scheme: 'APIKEY', keyId: 'k1', secret: 's1' },
    );
    // Gated by the BASIC carrier, not the APIKEY scheme.
    asserts.assertStrictEquals(
      await extractCredential(
        request({ authorization: `Basic ${btoa('k1:s1')}` }),
        { schemes: ['APIKEY'], basic: { credential: 'apiKey' } },
      ),
      null,
    );
  });

  it('should ignore HMAC headers unless the scheme is on, then render the template', async () => {
    const headers = {
      'x-key-id': 'k1',
      'x-signature': 'ab12',
      'x-timestamp': '1700000000',
    };
    asserts.assertStrictEquals(await extractCredential(request(headers)), null);
    const req = request(headers, {
      method: 'post',
      path: '/billing',
      query: 'b=2&a=1',
      body: () => Promise.resolve('{"amount":5}'),
    });
    const credential = await extractCredential(req, { hmac: {} });
    asserts.assertEquals(credential, {
      scheme: 'HMAC',
      keyId: 'k1',
      signature: 'ab12',
      payload: `POST\n/billing?b=2&a=1\n1700000000\n${await contentDigest(
        '{"amount":5}',
      )}`,
      algorithm: 'SHA-256',
    });
    // Custom template: derived components, the nonce, a plain header,
    // an absent header rendering empty; custom header names still feed
    // the frozen keys.
    const custom = await extractCredential(
      request(
        {
          'x-kid': 'k1',
          'x-sig': 'ab12',
          'x-ts': '1',
          'x-nonce': 'n1',
          'x-tenant': 'acme',
        },
        {
          method: 'get',
          path: '/p',
          query: '?q=1',
          authority: 'API.Example.com:8443',
          scheme: 'HTTPS',
        },
      ),
      {
        hmac: {
          keyHeader: 'x-kid',
          signatureHeader: 'x-sig',
          timestampHeader: 'x-ts',
          algorithm: 'SHA-512',
          template:
            '${@method}|${@path}|${@request-target}|${@authority}|${@scheme}|${@target-uri}|${x-timestamp}|${x-nonce}|${x-key-id}|${x-tenant}|${x-missing}|${content-digest}',
        },
      },
    );
    asserts.assert(custom?.scheme === 'HMAC');
    asserts.assertStrictEquals(custom.algorithm, 'SHA-512');
    asserts.assertStrictEquals(
      custom.payload,
      `GET|/p|/p?q=1|api.example.com:8443|https|https://api.example.com:8443/p?q=1|1|n1|k1|acme||${await contentDigest(
        null,
      )}`,
    );
  });

  it('should treat a scheme excluded by options as absent', async () => {
    asserts.assertStrictEquals(
      await extractCredential(request({ authorization: 'Bearer t' }), {
        schemes: ['APIKEY'],
      }),
      null,
    );
    asserts.assertEquals(
      await extractCredential(request({ authorization: 'ApiKey k:s' }), {
        schemes: ['APIKEY'],
      }),
      { scheme: 'APIKEY', keyId: 'k', secret: 's' },
    );
  });
});

describe('resolveOptions', () => {
  it('should fill every default and reject bad header names and skews', () => {
    const config = resolveOptions();
    asserts.assertEquals([...config.schemes], ['BEARER', 'BASIC', 'APIKEY']);
    asserts.assertEquals(config.bearer, {
      header: 'authorization',
      prefix: 'Bearer',
    });
    asserts.assertEquals(config.hmac.keyHeader, 'x-key-id');
    asserts.assertStrictEquals(config.hmac.maxSkew, 300);
    asserts.assertStrictEquals(config.encryption, null);
    asserts.assertEquals(
      [...resolveOptions({ hmac: {} }).schemes],
      ['BEARER', 'BASIC', 'APIKEY', 'HMAC'],
    );
    asserts.assertStrictEquals(
      resolveOptions({ hmac: { response: false } }).hmac.response,
      null,
    );
    asserts.assertEquals(resolveOptions({ encryption: {} }).encryption, {
      enc: 'A256GCM',
      required: false,
    });
    asserts.assertStrictEquals(
      resolveOptions({ bearer: { header: 'X-Token' } }).bearer.header,
      'x-token',
    );
    // An empty prefix on its own header is fine; on a shared one it shadows.
    resolveOptions({ bearer: { header: 'x-token', prefix: '' } });
    resolveOptions({ schemes: ['BEARER'], bearer: { prefix: '' } });
    for (
      const [options, reason] of [
        [{ bearer: { header: 'bad header' } }, 'bearer.header'],
        [{ hmac: { maxSkew: 0 } }, "'hmac.maxSkew': 0 is not a positive"],
        [{ hmac: { template: '${@path}' } }, 'hmac.template'],
        [{ bearer: { prefix: 'Bearer ' } }, "'Bearer ' contains whitespace"],
        [{ bearer: { prefix: '' } }, 'would shadow the BASIC carrier'],
        [{ apiKey: { prefix: '' } }, 'would shadow the BEARER carrier'],
      ] as const
    ) {
      const error = asserts.assertThrows(
        () => resolveOptions(options),
        PactError,
      );
      asserts.assertStrictEquals(error.code, 'INVALID_OPTION');
      asserts.assertStringIncludes(error.message, reason);
    }
  });
});

describe('queryOf and isFreshTimestamp', () => {
  it('should read a bare ? as no query, like URL.search, and prefix a missing ?', () => {
    const q = (query?: string) =>
      queryOf({ method: 'GET', path: '/', header: () => null, query });
    asserts.assertStrictEquals(q(undefined), '');
    asserts.assertStrictEquals(q(''), '');
    asserts.assertStrictEquals(q('?'), '');
    asserts.assertStrictEquals(q('a=1'), '?a=1');
    asserts.assertStrictEquals(q('?a=1&b=?'), '?a=1&b=?');
  });

  it('should accept only integer seconds inside the window', () => {
    const now = Math.floor(Date.now() / 1000);
    asserts.assert(isFreshTimestamp(String(now - 30), 60));
    asserts.assertFalse(isFreshTimestamp(String(now - 61), 60));
    asserts.assertFalse(
      isFreshTimestamp(String(Date.now()), 60),
      'milliseconds',
    );
    asserts.assertFalse(isFreshTimestamp('-1', 60));
    asserts.assertFalse(isFreshTimestamp(null, 60));
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
      ['ENCRYPTION_INVALID', 400, 'ENCRYPTION_INVALID'],
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
          reason: 'r',
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
