/**
 * @fileoverview Tests for the fastify adapter against structural mocks.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { fastifyAuth, fastifyGuard } from './fastify.ts';
import type { PactFastifyReply, PactFastifyRequest } from './fastify.ts';
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

function run(headers: Record<string, string | string[]> = {}): {
  request: PactFastifyRequest;
  reply: PactFastifyReply;
  sent: { status?: number; body?: unknown };
} {
  const sent: { status?: number; body?: unknown } = {};
  return {
    request: { method: 'GET', url: '/x?q=1', headers },
    reply: {
      code: (status) => {
        sent.status = status;
        return {
          send: (body) => {
            sent.body = body;
          },
        };
      },
    },
    sent,
  };
}

describe('fastifyAuth', () => {
  it('should attach request.pact and send nothing on success', async () => {
    const m = run({ authorization: 'ApiKey k1:s1' });
    await fastifyAuth(pact)(m.request, m.reply);
    asserts.assertStrictEquals(m.request.pact?.principal.id, 'k1');
    asserts.assertStrictEquals(m.sent.status, undefined);
  });

  it('should send 401 without a credential, unless optional', async () => {
    const denied = run();
    await fastifyAuth(pact)(denied.request, denied.reply);
    asserts.assertEquals(denied.sent, {
      status: 401,
      body: { error: 'NO_CREDENTIALS' },
    });
    const optional = run();
    await fastifyAuth(pact, { optional: true })(
      optional.request,
      optional.reply,
    );
    asserts.assertStrictEquals(optional.sent.status, undefined);
    asserts.assertStrictEquals(optional.request.pact, undefined);
  });

  it('should send 401 for an invalid credential', async () => {
    const m = run({ authorization: 'ApiKey k1:wrong' });
    await fastifyAuth(pact)(m.request, m.reply);
    asserts.assertEquals(m.sent, {
      status: 401,
      body: { error: 'INVALID_CREDENTIALS' },
    });
  });

  it('should rethrow non-pact errors to fastify', async () => {
    const m = run({ authorization: 'ApiKey boom:s' });
    await asserts.assertRejects(
      () => fastifyAuth(pact)(m.request, m.reply),
      TypeError,
    );
    asserts.assertStrictEquals(m.sent.status, undefined);
  });
});

describe('fastifyGuard', () => {
  it('should pass a held permission and 403 a missing one', async () => {
    const auth = run({ authorization: 'ApiKey k1:s1' });
    await fastifyAuth(pact)(auth.request, auth.reply);
    const ok = run();
    ok.request.pact = auth.request.pact;
    await fastifyGuard('Post', 'READ')(ok.request, ok.reply);
    asserts.assertStrictEquals(ok.sent.status, undefined);
    const denied = run();
    denied.request.pact = auth.request.pact;
    await fastifyGuard('Post', 'EDIT')(denied.request, denied.reply);
    asserts.assertEquals(denied.sent, {
      status: 403,
      body: { error: 'PERMISSION_DENIED' },
    });
  });

  it('should send 401 when no auth context is attached', async () => {
    const m = run();
    await fastifyGuard('Post', 'READ')(m.request, m.reply);
    asserts.assertStrictEquals(m.sent.status, 401);
  });
});
