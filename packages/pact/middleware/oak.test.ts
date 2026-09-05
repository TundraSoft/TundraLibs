/**
 * @fileoverview Tests for the oak adapter against structural mocks.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { oakAuth, oakGuard } from './oak.ts';
import type { PactOakContext } from './oak.ts';
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
  ctx: PactOakContext;
  nextCalls: () => number;
  next: () => Promise<unknown>;
} {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
  let calls = 0;
  return {
    ctx: {
      request: {
        method: 'GET',
        url: { pathname: '/x' },
        headers: { get: (name) => lower[name.toLowerCase()] ?? null },
      },
      response: { status: 404, body: undefined },
      state: {},
    },
    nextCalls: () => calls,
    next: () => {
      calls++;
      return Promise.resolve();
    },
  };
}

describe('oakAuth', () => {
  it('should attach ctx.state.pact and call next on success', async () => {
    const m = run({ authorization: 'ApiKey k1:s1' });
    await oakAuth(pact)(m.ctx, m.next);
    asserts.assertStrictEquals(m.nextCalls(), 1);
    asserts.assertStrictEquals(m.ctx.state.pact?.principal.id, 'k1');
  });

  it('should respond 401 without a credential, unless optional', async () => {
    const denied = run();
    await oakAuth(pact)(denied.ctx, denied.next);
    asserts.assertStrictEquals(denied.nextCalls(), 0);
    asserts.assertStrictEquals(denied.ctx.response.status, 401);
    asserts.assertEquals(denied.ctx.response.body, { error: 'NO_CREDENTIALS' });
    const optional = run();
    await oakAuth(pact, { optional: true })(optional.ctx, optional.next);
    asserts.assertStrictEquals(optional.nextCalls(), 1);
  });

  it('should respond 401 for an invalid credential', async () => {
    const m = run({ authorization: 'ApiKey k1:wrong' });
    await oakAuth(pact)(m.ctx, m.next);
    asserts.assertStrictEquals(m.ctx.response.status, 401);
    asserts.assertEquals(m.ctx.response.body, { error: 'INVALID_CREDENTIALS' });
  });

  it('should extract HMAC credentials under a canonical contract', async () => {
    // Wrong signature still proves the extraction path end to end: the
    // request reaches authenticate and fails there, not at extraction.
    const m = run({ 'x-key-id': 'k1', 'x-signature': 'ab12' });
    await oakAuth(pact, {
      hmac: { canonical: (req) => `${req.method} ${req.path}` },
    })(m.ctx, m.next);
    asserts.assertStrictEquals(m.ctx.response.status, 401);
    asserts.assertEquals(m.ctx.response.body, { error: 'INVALID_CREDENTIALS' });
  });

  it('should rethrow non-pact errors to oak', async () => {
    const m = run({ authorization: 'ApiKey boom:s' });
    await asserts.assertRejects(() => oakAuth(pact)(m.ctx, m.next), TypeError);
  });
});

describe('oakGuard', () => {
  it('should pass a held permission and 403 a missing one', async () => {
    const auth = run({ authorization: 'ApiKey k1:s1' });
    await oakAuth(pact)(auth.ctx, auth.next);
    const ok = run();
    ok.ctx.state.pact = auth.ctx.state.pact;
    await oakGuard('Post', 'READ')(ok.ctx, ok.next);
    asserts.assertStrictEquals(ok.nextCalls(), 1);
    const denied = run();
    denied.ctx.state.pact = auth.ctx.state.pact;
    await oakGuard('Post', 'EDIT')(denied.ctx, denied.next);
    asserts.assertStrictEquals(denied.nextCalls(), 0);
    asserts.assertStrictEquals(denied.ctx.response.status, 403);
  });

  it('should respond 401 when no auth context is attached', async () => {
    const m = run();
    await oakGuard('Post', 'READ')(m.ctx, m.next);
    asserts.assertStrictEquals(m.ctx.response.status, 401);
  });
});
