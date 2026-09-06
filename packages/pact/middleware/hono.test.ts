/**
 * @fileoverview Tests for the hono adapter against structural mocks.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { honoAuth, honoGuard } from './hono.ts';
import type { PactHonoContext } from './hono.ts';
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

function run(headers: Record<string, string> = {}): {
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
  return {
    c: {
      req: {
        method: 'GET',
        path: '/x',
        header: (name) => lower[name.toLowerCase()],
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
    },
    vars,
    sent,
    nextCalls: () => calls,
    next: () => {
      calls++;
      return Promise.resolve();
    },
  };
}

describe('honoAuth', () => {
  it("should set c.get('pact') and call next on success", async () => {
    const m = run({ authorization: 'ApiKey k1:s1' });
    await honoAuth(pact)(m.c, m.next);
    asserts.assertStrictEquals(m.nextCalls(), 1);
    const auth = m.vars.get('pact') as { principal: { id: string } };
    asserts.assertStrictEquals(auth.principal.id, 'k1');
  });

  it('should return 401 without a credential, unless optional', async () => {
    const denied = run();
    await honoAuth(pact)(denied.c, denied.next);
    asserts.assertStrictEquals(denied.nextCalls(), 0);
    asserts.assertEquals(denied.sent, {
      status: 401,
      body: { error: 'NO_CREDENTIALS' },
    });
    const optional = run();
    await honoAuth(pact, { optional: true })(optional.c, optional.next);
    asserts.assertStrictEquals(optional.nextCalls(), 1);
  });

  it('should return 401 for an invalid credential', async () => {
    const m = run({ authorization: 'ApiKey k1:wrong' });
    await honoAuth(pact)(m.c, m.next);
    asserts.assertEquals(m.sent, {
      status: 401,
      body: { error: 'INVALID_CREDENTIALS' },
    });
  });

  it('should rethrow non-pact errors to hono', async () => {
    const m = run({ authorization: 'ApiKey boom:s' });
    await asserts.assertRejects(() => honoAuth(pact)(m.c, m.next), TypeError);
  });
});

describe('honoGuard', () => {
  it('should pass a held permission and 403 a missing one', async () => {
    const auth = run({ authorization: 'ApiKey k1:s1' });
    await honoAuth(pact)(auth.c, auth.next);
    const ok = run();
    ok.vars.set('pact', auth.vars.get('pact'));
    await honoGuard('Post', 'READ')(ok.c, ok.next);
    asserts.assertStrictEquals(ok.nextCalls(), 1);
    const denied = run();
    denied.vars.set('pact', auth.vars.get('pact'));
    await honoGuard('Post', 'EDIT')(denied.c, denied.next);
    asserts.assertEquals(denied.sent, {
      status: 403,
      body: { error: 'PERMISSION_DENIED' },
    });
  });

  it('should return 401 when no auth context is attached', async () => {
    const m = run();
    await honoGuard('Post', 'READ')(m.c, m.next);
    asserts.assertStrictEquals(m.sent.status, 401);
  });
});
