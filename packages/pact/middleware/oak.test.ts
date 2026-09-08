/**
 * @fileoverview Tests for the oak adapter against structural mocks.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { oakPact } from './oak.ts';
import type { PactOakContext } from './oak.ts';
import { signHMAC, verifyHMAC } from '@tundralibs/crypt/sign';
import { contentDigest } from './template.ts';
import { decryptJwe, encryptJwe } from '../jwe.ts';
import { Pact } from '../mod.ts';
import { serializeGrants } from '../grants.ts';

const pact = Pact.create({
  bits: { READ: 1n, EDIT: 2n },
  modulePermissions: { Post: ['READ', 'EDIT'] },
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

function run(
  headers: Record<string, string> = {},
  request: { method?: string; body?: string; respond?: unknown } = {},
): {
  ctx: PactOakContext;
  sentHeaders: Map<string, string>;
  nextCalls: () => number;
  next: () => Promise<unknown>;
} {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
  const sentHeaders = new Map<string, string>();
  let calls = 0;
  const ctx: PactOakContext = {
    request: {
      method: request.method ?? 'GET',
      url: { pathname: '/x', search: '', host: 'api.test', protocol: 'https:' },
      headers: { get: (name) => lower[name.toLowerCase()] ?? null },
      body: request.body === undefined ? undefined : {
        has: true,
        arrayBuffer: () =>
          Promise.resolve(new TextEncoder().encode(request.body).buffer),
      },
    },
    response: {
      status: 404,
      body: undefined,
      headers: { set: (name, value) => sentHeaders.set(name, value) },
    },
    state: {},
  };
  return {
    ctx,
    sentHeaders,
    nextCalls: () => calls,
    next: () => {
      calls++;
      if (request.respond !== undefined) {
        ctx.response.status = 200;
        ctx.response.body = request.respond;
      }
      return Promise.resolve();
    },
  };
}

/** Headers for a client-signed request over the default template. */
async function signedHeaders(
  method: string,
  target: string,
  body: string | null,
): Promise<Record<string, string>> {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const payload = `${method}\n${target}\n${timestamp}\n${await contentDigest(
    body,
  )}`;
  return {
    'x-key-id': 'k1',
    'x-signature': await signHMAC(payload, 's1'),
    'x-timestamp': timestamp,
  };
}

describe('oakPact().authenticate', () => {
  it('should attach ctx.state.pact and call next on success', async () => {
    const m = run({ authorization: 'ApiKey k1:s1' });
    await oakPact(pact).authenticate(m.ctx, m.next);
    asserts.assertStrictEquals(m.nextCalls(), 1);
    asserts.assertStrictEquals(m.ctx.state.pact?.principal.id, 'k1');
  });

  it('should respond 401 without a credential, unless optional', async () => {
    const denied = run();
    await oakPact(pact).authenticate(denied.ctx, denied.next);
    asserts.assertStrictEquals(denied.nextCalls(), 0);
    asserts.assertStrictEquals(denied.ctx.response.status, 401);
    asserts.assertEquals(denied.ctx.response.body, { error: 'NO_CREDENTIALS' });
    const optional = run();
    await oakPact(pact, { optional: true }).authenticate(
      optional.ctx,
      optional.next,
    );
    asserts.assertStrictEquals(optional.nextCalls(), 1);
  });

  it('should respond 401 for an invalid credential', async () => {
    const m = run({ authorization: 'ApiKey k1:wrong' });
    await oakPact(pact).authenticate(m.ctx, m.next);
    asserts.assertStrictEquals(m.ctx.response.status, 401);
    asserts.assertEquals(m.ctx.response.body, { error: 'INVALID_CREDENTIALS' });
  });

  it('should verify a signed request, expose the consumed body, and sign the serialized response', async () => {
    const m = run(await signedHeaders('POST', '/x', '{"n":1}'), {
      method: 'POST',
      body: '{"n":1}',
      respond: { ok: true },
    });
    await oakPact(pact, { hmac: {} }).authenticate(m.ctx, m.next);
    asserts.assertStrictEquals(m.nextCalls(), 1);
    asserts.assertStrictEquals(m.ctx.state.pact?.via, 'HMAC');
    asserts.assertEquals(
      m.ctx.state.pactBody,
      new TextEncoder().encode('{"n":1}'),
    );
    // Serialized by the adapter so the signed bytes are the sent bytes.
    asserts.assertStrictEquals(m.ctx.response.body, '{"ok":true}');
    asserts.assertStrictEquals(
      m.ctx.response.type,
      'application/json; charset=UTF-8',
    );
    const ts = m.sentHeaders.get('x-timestamp')!;
    asserts.assert(
      await verifyHMAC(
        `200\n${ts}\n${await contentDigest('{"ok":true}')}`,
        m.sentHeaders.get('x-signature')!,
        's1',
      ),
    );
    // A stale signature is refused before the handler runs.
    const stale = run({
      ...await signedHeaders('GET', '/x', null),
      'x-timestamp': '1',
    });
    await oakPact(pact, { hmac: {} }).authenticate(stale.ctx, stale.next);
    asserts.assertStrictEquals(stale.nextCalls(), 0);
    asserts.assertEquals(stale.ctx.response.body, { error: 'STALE_TIMESTAMP' });
  });

  it('should decrypt a JWE request into state and encrypt the response', async () => {
    const jwe = await encryptJwe('s1', 'k1', '{"pin":"0000"}', 'A256GCM');
    const m = run(
      { authorization: 'ApiKey k1:s1', 'content-type': 'application/jose' },
      { method: 'POST', body: jwe, respond: 'plain reply' },
    );
    await oakPact(pact, { encryption: {} }).authenticate(m.ctx, m.next);
    asserts.assertStrictEquals(
      new TextDecoder().decode(m.ctx.state.pactBody),
      '{"pin":"0000"}',
    );
    asserts.assertStrictEquals(m.ctx.response.type, 'application/jose');
    asserts.assertStrictEquals(
      new TextDecoder().decode(
        await decryptJwe('s1', 'k1', m.ctx.response.body as string, [
          'A256GCM',
        ]),
      ),
      'plain reply',
    );
  });

  it('should sign primitive and byte-view bodies without replacing them, and leave a plain API-key caller untouched', async () => {
    const n = run(await signedHeaders('GET', '/x', null), { respond: 42 });
    await oakPact(pact, { hmac: {} }).authenticate(n.ctx, n.next);
    asserts.assertStrictEquals(n.ctx.response.body, 42);
    asserts.assertStrictEquals(n.ctx.response.type, undefined);
    asserts.assert(
      await verifyHMAC(
        `200\n${n.sentHeaders.get('x-timestamp')}\n${await contentDigest(
          '42',
        )}`,
        n.sentHeaders.get('x-signature')!,
        's1',
      ),
    );
    const bytes = new Uint16Array([1, 2]);
    const b = run(await signedHeaders('GET', '/x', null), { respond: bytes });
    await oakPact(pact, { hmac: {} }).authenticate(b.ctx, b.next);
    asserts.assertStrictEquals(b.ctx.response.body, bytes);
    asserts.assert(
      await verifyHMAC(
        `200\n${b.sentHeaders.get('x-timestamp')}\n${await contentDigest(
          new Uint8Array(bytes.buffer),
        )}`,
        b.sentHeaders.get('x-signature')!,
        's1',
      ),
    );
    const plain = run({ authorization: 'ApiKey k1:s1' }, { respond: { a: 1 } });
    plain.ctx.response.type = 'application/problem+json';
    await oakPact(pact, { hmac: {} }).authenticate(plain.ctx, plain.next);
    asserts.assertEquals(plain.ctx.response.body, { a: 1 });
    asserts.assertStrictEquals(
      plain.ctx.response.type,
      'application/problem+json',
    );
    asserts.assertStrictEquals(plain.sentHeaders.size, 0);
  });

  it('should leave a streamed response body alone', async () => {
    const stream = new ReadableStream();
    const m = run(await signedHeaders('GET', '/x', null), { respond: stream });
    await oakPact(pact, { hmac: {} }).authenticate(m.ctx, m.next);
    asserts.assertStrictEquals(m.ctx.response.body, stream);
    asserts.assertStrictEquals(m.sentHeaders.has('x-signature'), false);
  });

  it('should rethrow non-pact errors to oak', async () => {
    const m = run({ authorization: 'ApiKey boom:s' });
    await asserts.assertRejects(
      () => oakPact(pact).authenticate(m.ctx, m.next),
      TypeError,
    );
  });
});

describe('oakPact().authorize', () => {
  it('should pass a held permission and 403 a missing one', async () => {
    const auth = run({ authorization: 'ApiKey k1:s1' });
    await oakPact(pact).authenticate(auth.ctx, auth.next);
    const ok = run();
    ok.ctx.state.pact = auth.ctx.state.pact;
    await oakPact(pact).authorize('Post', 'READ')(ok.ctx, ok.next);
    asserts.assertStrictEquals(ok.nextCalls(), 1);
    const denied = run();
    denied.ctx.state.pact = auth.ctx.state.pact;
    await oakPact(pact).authorize('Post', 'EDIT')(denied.ctx, denied.next);
    asserts.assertStrictEquals(denied.nextCalls(), 0);
    asserts.assertStrictEquals(denied.ctx.response.status, 403);
  });

  it('should respond 401 when no auth context is attached', async () => {
    const m = run();
    await oakPact(pact).authorize('Post', 'READ')(m.ctx, m.next);
    asserts.assertStrictEquals(m.ctx.response.status, 401);
  });
});
