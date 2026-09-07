/**
 * @fileoverview Tests for the hono adapter against structural mocks.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { honoPact } from './hono.ts';
import type { PactHonoContext } from './hono.ts';
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
  request: { method?: string; body?: string; respond?: Response } = {},
): {
  c: PactHonoContext;
  vars: Map<string, unknown>;
  sent: { status?: number; body?: unknown };
  nextCalls: () => number;
  next: () => Promise<void>;
} {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
  const vars = new Map<string, unknown>();
  const sent: { status?: number; body?: unknown } = {};
  let calls = 0;
  const c: PactHonoContext = {
    req: {
      method: request.method ?? 'GET',
      path: '/x',
      url: 'https://api.test/x?q=1',
      header: (name) => lower[name.toLowerCase()],
      arrayBuffer: () =>
        Promise.resolve(new TextEncoder().encode(request.body ?? '').buffer),
    },
    json: (body, status) => {
      sent.body = body;
      sent.status = status ?? 200;
      return new Response(JSON.stringify(body), { status: status ?? 200 });
    },
    set: (key, value) => {
      vars.set(key, value);
    },
    get: (key) => vars.get(key),
  };
  return {
    c,
    vars,
    sent,
    nextCalls: () => calls,
    next: () => {
      calls++;
      if (request.respond !== undefined) c.res = request.respond;
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

describe('honoPact().authenticate', () => {
  it("should set c.get('pact') and call next on success", async () => {
    const m = run({ authorization: 'ApiKey k1:s1' });
    await honoPact(pact).authenticate(m.c, m.next);
    asserts.assertStrictEquals(m.nextCalls(), 1);
    const auth = m.vars.get('pact') as { principal: { id: string } };
    asserts.assertStrictEquals(auth.principal.id, 'k1');
  });

  it('should return 401 without a credential, unless optional', async () => {
    const denied = run();
    await honoPact(pact).authenticate(denied.c, denied.next);
    asserts.assertStrictEquals(denied.nextCalls(), 0);
    asserts.assertEquals(denied.sent, {
      status: 401,
      body: { error: 'NO_CREDENTIALS' },
    });
    const optional = run();
    await honoPact(pact, { optional: true }).authenticate(
      optional.c,
      optional.next,
    );
    asserts.assertStrictEquals(optional.nextCalls(), 1);
  });

  it('should return 401 for an invalid credential', async () => {
    const m = run({ authorization: 'ApiKey k1:wrong' });
    await honoPact(pact).authenticate(m.c, m.next);
    asserts.assertEquals(m.sent, {
      status: 401,
      body: { error: 'INVALID_CREDENTIALS' },
    });
  });

  it('should verify a signed request and replace c.res with a signed one', async () => {
    const m = run(await signedHeaders('POST', '/x?q=1', '{"n":1}'), {
      method: 'POST',
      body: '{"n":1}',
      respond: new Response('{"ok":true}', {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    });
    await honoPact(pact, { hmac: {} }).authenticate(m.c, m.next);
    asserts.assertStrictEquals(m.nextCalls(), 1);
    const res = m.c.res!;
    asserts.assertStrictEquals(res.status, 201);
    asserts.assertStrictEquals(
      res.headers.get('content-type'),
      'application/json',
    );
    asserts.assertStrictEquals(await res.text(), '{"ok":true}');
    asserts.assert(
      await verifyHMAC(
        `201\n${res.headers.get('x-timestamp')}\n${await contentDigest(
          '{"ok":true}',
        )}`,
        res.headers.get('x-signature')!,
        's1',
      ),
    );
  });

  it('should decrypt a JWE request into pactBody and encrypt the response', async () => {
    const jwe = await encryptJwe('s1', 'k1', 'hello', 'A256GCM');
    const m = run(
      { authorization: 'ApiKey k1:s1', 'content-type': 'application/jose' },
      { method: 'POST', body: jwe, respond: new Response('reply') },
    );
    await honoPact(pact, { encryption: {} }).authenticate(m.c, m.next);
    asserts.assertStrictEquals(
      new TextDecoder().decode(m.vars.get('pactBody') as Uint8Array),
      'hello',
    );
    const res = m.c.res!;
    asserts.assertStrictEquals(
      res.headers.get('content-type'),
      'application/jose',
    );
    asserts.assertStrictEquals(
      new TextDecoder().decode(
        await decryptJwe('s1', 'k1', await res.text(), ['A256GCM']),
      ),
      'reply',
    );
  });

  it('should rethrow non-pact errors to hono', async () => {
    const m = run({ authorization: 'ApiKey boom:s' });
    await asserts.assertRejects(
      () => honoPact(pact).authenticate(m.c, m.next),
      TypeError,
    );
  });
});

describe('honoPact().authorize', () => {
  it('should pass a held permission and 403 a missing one', async () => {
    const auth = run({ authorization: 'ApiKey k1:s1' });
    await honoPact(pact).authenticate(auth.c, auth.next);
    const ok = run();
    ok.vars.set('pact', auth.vars.get('pact'));
    await honoPact(pact).authorize('Post', 'READ')(ok.c, ok.next);
    asserts.assertStrictEquals(ok.nextCalls(), 1);
    const denied = run();
    denied.vars.set('pact', auth.vars.get('pact'));
    await honoPact(pact).authorize('Post', 'EDIT')(denied.c, denied.next);
    asserts.assertEquals(denied.sent, {
      status: 403,
      body: { error: 'PERMISSION_DENIED' },
    });
  });

  it('should return 401 when no auth context is attached', async () => {
    const m = run();
    await honoPact(pact).authorize('Post', 'READ')(m.c, m.next);
    asserts.assertStrictEquals(m.sent.status, 401);
  });
});
