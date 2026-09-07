/**
 * @fileoverview The neutral core: verdict shapes, the shared challenge
 * (realm, off), the never-anonymous rule, the call-site catalog check on
 * the typed guard, the signed HMAC exchange (freshness, response
 * signature, nonce echo), and key-bound payload encryption both ways.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { signHMAC, verifyHMAC } from '@tundralibs/crypt/sign';
import { createPactMiddleware } from './core.ts';
import { contentDigest } from './template.ts';
import { decryptJwe, encryptJwe } from '../jwe.ts';
import { Pact, PactError } from '../mod.ts';
import { serializeGrants } from '../grants.ts';
import type { PactMiddlewareRequest } from './types/mod.ts';

const pact = Pact.create({
  bits: { READ: 1n, EDIT: 2n },
  modulePermissions: { Post: ['READ', 'EDIT'], Admin: ['READ'] },
  hooks: {
    getApiKey: (id) => {
      if (id === 'boom') throw new TypeError('backend down');
      return id === 'k1'
        ? {
          id: 'k1',
          status: 'ACTIVE',
          secret: 's1',
          grants: serializeGrants({ Post: 1n }),
        }
        : null;
    },
  },
});

const TEXT = new TextDecoder();

const req = (
  headers: Record<string, string> = {},
  extra: Partial<PactMiddlewareRequest> = {},
): PactMiddlewareRequest => ({
  method: 'GET',
  path: '/x',
  header: (name: string) => headers[name.toLowerCase()] ?? null,
  ...extra,
});

/** A request signed as a client would, over the default template. */
async function signed(
  input: {
    method?: string;
    path?: string;
    query?: string;
    body?: string | null;
    timestamp?: number;
    nonce?: string;
    headers?: Record<string, string>;
  } = {},
): Promise<PactMiddlewareRequest> {
  const method = input.method ?? 'POST';
  const path = input.path ?? '/orders';
  const query = input.query ?? '';
  const body = input.body === undefined ? '{"sku":"a1"}' : input.body;
  const timestamp = String(input.timestamp ?? Math.floor(Date.now() / 1000));
  const payload =
    `${method}\n${path}${query}\n${timestamp}\n${await contentDigest(
      body,
    )}`;
  const headers: Record<string, string> = {
    'x-key-id': 'k1',
    'x-signature': await signHMAC(payload, 's1'),
    'x-timestamp': timestamp,
    ...(input.nonce === undefined ? {} : { 'x-nonce': input.nonce }),
    ...input.headers,
  };
  let reads = 0;
  return req(headers, {
    method,
    path,
    query,
    body: () => {
      reads++;
      if (reads > 1) throw new Error('body read twice');
      return Promise.resolve(body);
    },
  });
}

describe('createPactMiddleware', () => {
  it('authenticates a valid credential, denies an invalid one, and never downgrades an invalid one to anonymous', async () => {
    const core = createPactMiddleware(pact, { optional: true });
    const ok = await core.authenticate(req({ authorization: 'ApiKey k1:s1' }));
    asserts.assert(ok.ok && ok.auth?.principal.id === 'k1');
    const none = await core.authenticate(req());
    asserts.assertEquals(none, { ok: true, auth: undefined });
    const bad = await core.authenticate(
      req({ authorization: 'ApiKey k1:wrong' }),
    );
    asserts.assert(!bad.ok);
    asserts.assertEquals(bad.denial.status, 401);
    asserts.assertEquals(bad.denial.body, { error: 'INVALID_CREDENTIALS' });
  });

  it('every 401 carries the shared WWW-Authenticate challenge — realm when set, nothing when challenges are off', async () => {
    const plain = createPactMiddleware(pact);
    asserts.assertEquals(plain.challenge, 'Bearer, Basic, ApiKey');
    const none = await plain.authenticate(req());
    asserts.assert(!none.ok);
    asserts.assertEquals(none.denial.headers, {
      'www-authenticate': 'Bearer, Basic, ApiKey',
    });

    const realm = createPactMiddleware(pact, {
      schemes: ['BEARER', 'HMAC'],
      realm: 'api "quoted"',
    });
    asserts.assertEquals(
      realm.challenge,
      'Bearer realm="api quoted", HMAC realm="api quoted"',
    );

    const off = createPactMiddleware(pact, { challenge: false });
    const denied = await off.authenticate(req());
    asserts.assert(!denied.ok);
    asserts.assertEquals(denied.denial.headers, {});
    // A 403 never carries a challenge.
    const guard = plain.authorize('Post', 'EDIT');
    const ok = await plain.authenticate(req({ authorization: 'ApiKey k1:s1' }));
    asserts.assert(ok.ok);
    const forbidden = await guard(ok.auth);
    asserts.assertEquals(forbidden?.status, 403);
    asserts.assertEquals(forbidden?.headers, {});
  });

  it('authorize: 401 without a context, 403 without the grant, undefined when held', async () => {
    const core = createPactMiddleware(pact);
    const read = core.authorize('Post', 'READ');
    const edit = core.authorize('Post', 'EDIT');
    const anon = await read(undefined);
    asserts.assertEquals(anon?.status, 401);
    asserts.assertEquals(anon?.body, { error: 'NO_CREDENTIALS' });
    const ok = await core.authenticate(req({ authorization: 'ApiKey k1:s1' }));
    asserts.assert(ok.ok);
    asserts.assertEquals(await read(ok.auth), undefined);
    asserts.assertEquals((await edit(ok.auth))?.body, {
      error: 'PERMISSION_DENIED',
    });
  });

  it('authorize checks the catalog when the guard is BUILT — a typo is a boot error, not a first-request surprise', () => {
    const core = createPactMiddleware(pact);
    asserts.assertThrows(
      () => core.authorize('Nope' as never, 'READ'),
      PactError,
      "Module 'Nope' is not defined",
    );
    asserts.assertThrows(
      () => core.authorize('Admin', 'EDIT'),
      PactError,
      "Permission 'EDIT' is not allowed for module 'Admin'",
    );
  });

  it('a non-pact error from a hook is THROWN, not turned into a verdict', async () => {
    const core = createPactMiddleware(pact);
    await asserts.assertRejects(
      () => core.authenticate(req({ authorization: 'ApiKey boom:x' })),
      TypeError,
      'backend down',
    );
  });

  it('a plain API-key caller gets no respond() — nothing would sign or encrypt', async () => {
    const core = createPactMiddleware(pact, { hmac: {}, encryption: {} });
    const ok = await core.authenticate(
      req(
        { authorization: 'ApiKey k1:s1', 'content-type': 'application/json' },
        {
          body: () => Promise.resolve('{"plain":true}'),
        },
      ),
    );
    asserts.assert(ok.ok);
    asserts.assertStrictEquals(ok.respond, undefined);
    asserts.assertStrictEquals(ok.body, undefined);
  });

  it('the guard 401 carries the challenge like the authenticate 401', async () => {
    const core = createPactMiddleware(pact, { realm: 'r' });
    const denial = await core.authorize('Post', 'READ')(undefined);
    asserts.assertEquals(denial?.headers, {
      'www-authenticate': 'Bearer realm="r", Basic realm="r", ApiKey realm="r"',
    });
  });

  it('schemes listing HMAC without an hmac block uses the defaults end to end', async () => {
    const core = createPactMiddleware(pact, { schemes: ['HMAC'] });
    asserts.assertStrictEquals(core.challenge, 'HMAC');
    const ok = await core.authenticate(await signed());
    asserts.assert(ok.ok && ok.auth?.via === 'HMAC');
    const bearer = await core.authenticate(req({ authorization: 'Bearer t' }));
    asserts.assert(!bearer.ok && bearer.denial.body.error === 'NO_CREDENTIALS');
  });
});

describe('createPactMiddleware — HMAC', () => {
  it('verifies the default template over method, target, timestamp, and body digest; the body is read once', async () => {
    const core = createPactMiddleware(pact, { hmac: {} });
    const ok = await core.authenticate(await signed({ query: '?expand=1' }));
    asserts.assert(ok.ok && ok.auth?.via === 'HMAC');
    asserts.assertStrictEquals(ok.body, undefined);
    asserts.assert(ok.respond !== undefined);
    // Any covered component changing after signing fails verification.
    const tampered = await signed();
    const bad = await core.authenticate({ ...tampered, path: '/orders/2' });
    asserts.assert(!bad.ok);
    asserts.assertEquals(bad.denial.body, { error: 'INVALID_CREDENTIALS' });
    const other = await signed();
    const swapped = await core.authenticate({
      ...other,
      body: () => Promise.resolve('{"sku":"zz"}'),
    });
    asserts.assert(!swapped.ok);
  });

  it('rejects a missing, malformed, or stale timestamp before reading the body or verifying', async () => {
    const core = createPactMiddleware(pact, { hmac: { maxSkew: 60 } });
    const now = Math.floor(Date.now() / 1000);
    for (
      const input of [
        { timestamp: now - 61 },
        { timestamp: now + 61 },
        { headers: { 'x-timestamp': 'yesterday' } },
        { headers: { 'x-timestamp': '' } },
      ]
    ) {
      const request = await signed(input);
      const verdict = await core.authenticate({
        ...request,
        body: () => Promise.reject(new Error('body read for a stale request')),
      });
      asserts.assert(!verdict.ok, JSON.stringify(input));
      asserts.assertEquals(verdict.denial.status, 401);
      asserts.assertEquals(verdict.denial.body, { error: 'STALE_TIMESTAMP' });
    }
    const fresh = await core.authenticate(
      await signed({ timestamp: now - 59 }),
    );
    asserts.assert(fresh.ok);
  });

  it('signs the response over status, server timestamp, and body digest, echoing the nonce', async () => {
    const core = createPactMiddleware(pact, { hmac: {} });
    const ok = await core.authenticate(await signed({ nonce: 'n-42' }));
    asserts.assert(ok.ok && ok.respond !== undefined);
    const patch = await ok.respond({ status: 201, body: '{"id":7}' });
    asserts.assertStrictEquals(patch.body, undefined);
    asserts.assertStrictEquals(patch.headers['x-nonce'], 'n-42');
    const ts = patch.headers['x-timestamp']!;
    asserts.assert(Math.abs(Number(ts) - Date.now() / 1000) < 5);
    const expected = `201\n${ts}\n${await contentDigest('{"id":7}')}`;
    asserts.assert(
      await verifyHMAC(expected, patch.headers['x-signature']!, 's1'),
    );
    // Off: only the request is verified, and nothing runs on the response.
    const quiet = createPactMiddleware(pact, { hmac: { response: false } });
    const silent = await quiet.authenticate(await signed());
    asserts.assert(silent.ok && silent.auth?.via === 'HMAC');
    asserts.assertStrictEquals(silent.respond, undefined);
  });

  it('honours a custom response template, header names, and algorithm', async () => {
    const core = createPactMiddleware(pact, {
      hmac: {
        signatureHeader: 'x-sig',
        timestampHeader: 'x-ts',
        algorithm: 'SHA-512',
        template: '${@method} ${@path} ${x-timestamp} ${content-digest}',
        response:
          '${@status} ${@method} ${@path} ${x-key-id} ${x-timestamp} ${content-digest}',
      },
    });
    const ts = String(Math.floor(Date.now() / 1000));
    const payload = `DELETE /orders/9 ${ts} ${await contentDigest(null)}`;
    const verdict = await core.authenticate(
      req(
        {
          'x-key-id': 'k1',
          'x-sig': await signHMAC(payload, 's1', { hashAlgorithm: 'SHA-512' }),
          'x-ts': ts,
        },
        {
          method: 'delete',
          path: '/orders/9',
          body: () => Promise.resolve(null),
        },
      ),
    );
    asserts.assert(verdict.ok && verdict.respond !== undefined);
    const patch = await verdict.respond({ status: 204, body: null });
    asserts.assertEquals(Object.keys(patch.headers).sort(), ['x-sig', 'x-ts']);
    asserts.assert(
      await verifyHMAC(
        `204 DELETE /orders/9 k1 ${patch.headers['x-ts']} ${await contentDigest(
          null,
        )}`,
        patch.headers['x-sig']!,
        's1',
        { hashAlgorithm: 'SHA-512' },
      ),
    );
  });
});

describe('createPactMiddleware — encryption', () => {
  it('opens a JWE request for the key and encrypts the response back', async () => {
    const core = createPactMiddleware(pact, { encryption: {} });
    const jwe = await encryptJwe('s1', 'k1', '{"card":"4111"}', 'A256GCM');
    const ok = await core.authenticate(
      req(
        { authorization: 'ApiKey k1:s1', 'content-type': 'application/jose' },
        { body: () => Promise.resolve(jwe) },
      ),
    );
    asserts.assert(ok.ok && ok.body !== undefined && ok.respond !== undefined);
    asserts.assertStrictEquals(TEXT.decode(ok.body), '{"card":"4111"}');
    const patch = await ok.respond({ status: 200, body: '{"ok":true}' });
    asserts.assertStrictEquals(
      patch.headers['content-type'],
      'application/jose',
    );
    asserts.assertStrictEquals(
      TEXT.decode(await decryptJwe('s1', 'k1', patch.body!, ['A256GCM'])),
      '{"ok":true}',
    );
    // An empty response body is not encrypted.
    asserts.assertEquals(await ok.respond({ status: 204, body: null }), {
      headers: {},
    });
  });

  it('signs the JWE bytes as sent when HMAC and encryption combine', async () => {
    const core = createPactMiddleware(pact, {
      hmac: {},
      encryption: { enc: 'A128GCM' },
    });
    const jwe = await encryptJwe('s1', 'k1', 'secret-body', 'A128GCM');
    const request = await signed({
      body: jwe,
      headers: { 'content-type': 'application/jose' },
    });
    const ok = await core.authenticate(request);
    asserts.assert(ok.ok && ok.body !== undefined && ok.respond !== undefined);
    asserts.assertStrictEquals(TEXT.decode(ok.body), 'secret-body');
    const patch = await ok.respond({ status: 200, body: 'reply' });
    asserts.assert(patch.body !== undefined);
    asserts.assert(
      await verifyHMAC(
        `200\n${patch.headers['x-timestamp']}\n${await contentDigest(
          patch.body,
        )}`,
        patch.headers['x-signature']!,
        's1',
      ),
      'the response signature covers the ciphertext, not the plaintext',
    );
  });

  it('encrypts the response only for callers who can read one: a JWE sender, an Accept, or required', async () => {
    const lax = createPactMiddleware(pact, { encryption: {} });
    const accepting = await lax.authenticate(
      req({ authorization: 'ApiKey k1:s1', accept: 'application/jose' }),
    );
    asserts.assert(accepting.ok && accepting.respond !== undefined);
    const patch = await accepting.respond({ status: 200, body: 'x' });
    asserts.assertStrictEquals(
      patch.headers['content-type'],
      'application/jose',
    );
    const strict = createPactMiddleware(pact, {
      encryption: { required: true },
    });
    const bodiless = await strict.authenticate(
      req({ authorization: 'ApiKey k1:s1' }),
    );
    asserts.assert(bodiless.ok && bodiless.respond !== undefined);
    asserts.assertStrictEquals(
      (await bodiless.respond({ status: 200, body: 'x' }))
        .headers['content-type'],
      'application/jose',
    );
    // A JOSE body with parameters on the content type still counts.
    const jwe = await encryptJwe('s1', 'k1', 'p', 'A256GCM');
    const parametrised = await lax.authenticate(
      req(
        {
          authorization: 'ApiKey k1:s1',
          'content-type': 'Application/JOSE; charset=utf-8',
        },
        { body: () => Promise.resolve(jwe) },
      ),
    );
    asserts.assert(parametrised.ok && parametrised.body !== undefined);
    asserts.assert(parametrised.respond !== undefined);
  });

  it('rejects a bad JWE with 400 and a plaintext body only when required', async () => {
    const lax = createPactMiddleware(pact, { encryption: {} });
    const plain = await lax.authenticate(
      req(
        { authorization: 'ApiKey k1:s1', 'content-type': 'application/json' },
        { body: () => Promise.resolve('{"open":1}') },
      ),
    );
    asserts.assert(plain.ok && plain.body === undefined);
    asserts.assertStrictEquals(plain.respond, undefined);
    const strict = createPactMiddleware(pact, {
      encryption: { required: true },
    });
    // The adapter cannot see the body (a parser consumed it): the framing
    // headers still prove a plaintext body arrived.
    const unseen = await strict.authenticate(
      req(
        {
          authorization: 'ApiKey k1:s1',
          'content-type': 'application/json',
          'content-length': '12',
        },
        { body: () => Promise.resolve(null) },
      ),
    );
    asserts.assert(!unseen.ok);
    asserts.assertEquals(unseen.denial.body, { error: 'ENCRYPTION_INVALID' });
    const unseenJose = await strict.authenticate(
      req(
        {
          authorization: 'ApiKey k1:s1',
          'content-type': 'application/jose',
          'transfer-encoding': 'chunked',
        },
        { body: () => Promise.resolve(null) },
      ),
    );
    asserts.assert(
      !unseenJose.ok,
      'a JOSE body the adapter cannot read is a 400',
    );
    const refused = await strict.authenticate(
      req(
        { authorization: 'ApiKey k1:s1', 'content-type': 'application/json' },
        { body: () => Promise.resolve('{"open":1}') },
      ),
    );
    asserts.assert(!refused.ok);
    asserts.assertEquals(refused.denial, {
      status: 400,
      body: { error: 'ENCRYPTION_INVALID' },
      headers: {},
    });
    const bodiless = await strict.authenticate(
      req({ authorization: 'ApiKey k1:s1' }, {
        body: () => Promise.resolve(null),
      }),
    );
    asserts.assert(bodiless.ok, 'no body is not a plaintext body');
    // Encrypted for another key id, or with the wrong enc.
    for (
      const jwe of [
        await encryptJwe('s1', 'k2', 'x', 'A256GCM'),
        await encryptJwe('s1', 'k1', 'x', 'A128GCM'),
        'not.a.jwe',
      ]
    ) {
      const bad = await lax.authenticate(
        req(
          { authorization: 'ApiKey k1:s1', 'content-type': 'application/jose' },
          { body: () => Promise.resolve(jwe) },
        ),
      );
      asserts.assert(!bad.ok);
      asserts.assertEquals(bad.denial.status, 400);
      asserts.assertEquals(bad.denial.body, { error: 'ENCRYPTION_INVALID' });
    }
    // Never reached without a valid credential first.
    const unauthenticated = await lax.authenticate(
      req(
        { authorization: 'ApiKey k1:nope', 'content-type': 'application/jose' },
        { body: () => Promise.reject(new Error('must not read the body')) },
      ),
    );
    asserts.assert(!unauthenticated.ok);
    asserts.assertEquals(unauthenticated.denial.status, 401);
  });
});
