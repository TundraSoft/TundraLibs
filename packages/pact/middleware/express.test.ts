/**
 * @fileoverview Tests for the express adapter against structural mocks.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { expressAuth, expressGuard } from './express.ts';
import type { PactExpressRequest, PactExpressResponse } from './express.ts';
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

type Sent = { status?: number; body?: unknown };

function run(headers: Record<string, string | string[]> = {}): {
  req: PactExpressRequest;
  res: PactExpressResponse;
  sent: Sent;
  nextCalls: () => number;
  nextError: () => unknown;
  next: (error?: unknown) => void;
} {
  const sent: Sent = {};
  let calls = 0;
  let caught: unknown;
  return {
    req: { method: 'GET', url: '/x?q=1', headers },
    res: {
      status: (code) => {
        sent.status = code;
        return {
          json: (body) => {
            sent.body = body;
          },
        };
      },
    },
    sent,
    nextCalls: () => calls,
    nextError: () => caught,
    next: (error?: unknown) => {
      calls++;
      if (error !== undefined) caught = error;
    },
  };
}

describe('expressAuth', () => {
  it('should attach req.pact and call next on success', async () => {
    const m = run({ authorization: 'ApiKey k1:s1' });
    await expressAuth(pact)(m.req, m.res, m.next);
    asserts.assertStrictEquals(m.nextCalls(), 1);
    asserts.assertStrictEquals(m.req.pact?.principal.id, 'k1');
    asserts.assertStrictEquals(m.req.pact?.via, 'APIKEY');
  });

  it('should respond 401 without a credential', async () => {
    const m = run();
    await expressAuth(pact)(m.req, m.res, m.next);
    asserts.assertStrictEquals(m.nextCalls(), 0);
    asserts.assertEquals(m.sent, {
      status: 401,
      body: { error: 'NO_CREDENTIALS' },
    });
  });

  it('should continue unauthenticated when optional', async () => {
    const m = run();
    await expressAuth(pact, { optional: true })(m.req, m.res, m.next);
    asserts.assertStrictEquals(m.nextCalls(), 1);
    asserts.assertStrictEquals(m.req.pact, undefined);
  });

  it('should respond 401 for an invalid credential even when optional', async () => {
    const m = run({ authorization: 'ApiKey k1:wrong' });
    await expressAuth(pact, { optional: true })(m.req, m.res, m.next);
    asserts.assertStrictEquals(m.nextCalls(), 0);
    asserts.assertEquals(m.sent.status, 401);
  });

  it('should pass non-pact errors to next(error)', async () => {
    const m = run({ authorization: 'ApiKey boom:s' });
    await expressAuth(pact)(m.req, m.res, m.next);
    asserts.assertStrictEquals(m.sent.status, undefined);
    asserts.assert(m.nextError() instanceof TypeError);
  });

  it('should read array-valued headers by their first entry', async () => {
    const m = run({ authorization: ['ApiKey k1:s1', 'ApiKey k1:x'] });
    await expressAuth(pact)(m.req, m.res, m.next);
    asserts.assertStrictEquals(m.req.pact?.principal.id, 'k1');
  });
});

describe('expressGuard', () => {
  it('should pass a held permission and 403 a missing one', async () => {
    const auth = run({ authorization: 'ApiKey k1:s1' });
    await expressAuth(pact)(auth.req, auth.res, auth.next);
    const ok = run();
    ok.req.pact = auth.req.pact;
    await expressGuard('Post', 'READ')(ok.req, ok.res, ok.next);
    asserts.assertStrictEquals(ok.nextCalls(), 1);
    const denied = run();
    denied.req.pact = auth.req.pact;
    await expressGuard('Post', 'EDIT')(denied.req, denied.res, denied.next);
    asserts.assertStrictEquals(denied.nextCalls(), 0);
    asserts.assertEquals(denied.sent, {
      status: 403,
      body: { error: 'PERMISSION_DENIED' },
    });
  });

  it('should respond 401 when no auth context is attached', async () => {
    const m = run();
    await expressGuard('Post', 'READ')(m.req, m.res, m.next);
    asserts.assertEquals(m.sent.status, 401);
  });
});
