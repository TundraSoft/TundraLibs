/**
 * @fileoverview Tests for the fastify adapter against structural mocks.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { fastifyPact } from './fastify.ts';
import type { PactFastifyReply, PactFastifyRequest } from './fastify.ts';
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
  headers: Record<string, string | string[]> = {},
  request: Partial<PactFastifyRequest> = {},
): {
  request: PactFastifyRequest;
  reply: PactFastifyReply;
  sent: { status?: number; body?: unknown };
  sentHeaders: Map<string, string>;
} {
  const sent: { status?: number; body?: unknown } = {};
  const sentHeaders = new Map<string, string>();
  return {
    request: { method: 'GET', url: '/x?q=1', headers, ...request },
    reply: {
      code: (status) => {
        sent.status = status;
        return {
          send: (body) => {
            sent.body = body;
          },
        };
      },
      header: (name, value) => sentHeaders.set(name, value),
      statusCode: 200,
    },
    sent,
    sentHeaders,
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

describe('fastifyPact().authenticate', () => {
  it('should attach request.pact and send nothing on success', async () => {
    const m = run({ authorization: 'ApiKey k1:s1' });
    await fastifyPact(pact).authenticate(m.request, m.reply);
    asserts.assertStrictEquals(m.request.pact?.principal.id, 'k1');
    asserts.assertStrictEquals(m.sent.status, undefined);
  });

  it('should send 401 without a credential, unless optional', async () => {
    const denied = run();
    await fastifyPact(pact).authenticate(denied.request, denied.reply);
    asserts.assertEquals(denied.sent, {
      status: 401,
      body: { error: 'NO_CREDENTIALS' },
    });
    const optional = run();
    await fastifyPact(pact, { optional: true }).authenticate(
      optional.request,
      optional.reply,
    );
    asserts.assertStrictEquals(optional.sent.status, undefined);
    asserts.assertStrictEquals(optional.request.pact, undefined);
  });

  it('should send 401 for an invalid credential', async () => {
    const m = run({ authorization: 'ApiKey k1:wrong' });
    await fastifyPact(pact).authenticate(m.request, m.reply);
    asserts.assertEquals(m.sent, {
      status: 401,
      body: { error: 'INVALID_CREDENTIALS' },
    });
  });

  it('should verify a signed request from rawBody and sign the payload in onSend', async () => {
    const hooks = fastifyPact(pact, { hmac: {} });
    const m = run(await signedHeaders('PUT', '/x?next=/y?z=1', '{"n":1}'), {
      method: 'PUT',
      url: '/x?next=/y?z=1',
      rawBody: '{"n":1}',
      body: { n: 1 },
    });
    await hooks.authenticate(m.request, m.reply);
    asserts.assertStrictEquals(m.request.pact?.via, 'HMAC');
    asserts.assert(m.request.pactRespond !== undefined);
    m.reply.statusCode = 202;
    const payload = await hooks.respond(m.request, m.reply, '{"ok":true}');
    asserts.assertStrictEquals(payload, '{"ok":true}');
    asserts.assert(
      await verifyHMAC(
        `202\n${m.sentHeaders.get('x-timestamp')}\n${await contentDigest(
          '{"ok":true}',
        )}`,
        m.sentHeaders.get('x-signature')!,
        's1',
      ),
    );
    // Streams and unsigned callers pass through untouched.
    const stream = new ReadableStream();
    asserts.assertStrictEquals(
      await hooks.respond(m.request, m.reply, stream),
      stream,
    );
    const anonymous = run();
    asserts.assertStrictEquals(
      await hooks.respond(anonymous.request, anonymous.reply, 'x'),
      'x',
    );
  });

  it('should decrypt a JWE body into pactBody and encrypt the payload', async () => {
    const hooks = fastifyPact(pact, { encryption: {} });
    const m = run(
      { authorization: 'ApiKey k1:s1', 'content-type': 'application/jose' },
      { method: 'POST', body: await encryptJwe('s1', 'k1', 'in', 'A256GCM') },
    );
    await hooks.authenticate(m.request, m.reply);
    asserts.assertStrictEquals(
      new TextDecoder().decode(m.request.pactBody),
      'in',
    );
    const payload = await hooks.respond(m.request, m.reply, 'out');
    asserts.assertStrictEquals(
      m.sentHeaders.get('content-type'),
      'application/jose',
    );
    asserts.assertStrictEquals(
      new TextDecoder().decode(
        await decryptJwe('s1', 'k1', payload as string, ['A256GCM']),
      ),
      'out',
    );
  });

  it('should rethrow non-pact errors to fastify', async () => {
    const m = run({ authorization: 'ApiKey boom:s' });
    await asserts.assertRejects(
      () => fastifyPact(pact).authenticate(m.request, m.reply),
      TypeError,
    );
    asserts.assertStrictEquals(m.sent.status, undefined);
  });
});

describe('fastifyPact().authorize', () => {
  it('should pass a held permission and 403 a missing one', async () => {
    const auth = run({ authorization: 'ApiKey k1:s1' });
    await fastifyPact(pact).authenticate(auth.request, auth.reply);
    const ok = run();
    ok.request.pact = auth.request.pact;
    await fastifyPact(pact).authorize('Post', 'READ')(ok.request, ok.reply);
    asserts.assertStrictEquals(ok.sent.status, undefined);
    const denied = run();
    denied.request.pact = auth.request.pact;
    await fastifyPact(pact).authorize('Post', 'EDIT')(
      denied.request,
      denied.reply,
    );
    asserts.assertEquals(denied.sent, {
      status: 403,
      body: { error: 'PERMISSION_DENIED' },
    });
  });

  it('should send 401 when no auth context is attached', async () => {
    const m = run();
    await fastifyPact(pact).authorize('Post', 'READ')(m.request, m.reply);
    asserts.assertStrictEquals(m.sent.status, 401);
  });
});
