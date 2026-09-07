/**
 * @fileoverview Tests for the express adapter against structural mocks.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { expressPact } from './express.ts';
import type { PactExpressRequest, PactExpressResponse } from './express.ts';
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

type Sent = { status?: number; body?: unknown };

function run(
  headers: Record<string, string | string[]> = {},
  request: Partial<PactExpressRequest> = {},
): {
  req: PactExpressRequest;
  res: PactExpressResponse;
  sent: Sent;
  sentHeaders: Map<string, string>;
  nextCalls: () => number;
  nextError: () => unknown;
  next: (error?: unknown) => void;
} {
  const sent: Sent = {};
  const sentHeaders = new Map<string, string>();
  let calls = 0;
  let caught: unknown;
  const res: PactExpressResponse = {
    statusCode: 200,
    status: (code) => {
      sent.status = code;
      res.statusCode = code;
      return res as { json: (body: unknown) => unknown };
    },
    json: (body) => {
      sent.body = body;
    },
    send: (body) => {
      sent.body = body;
    },
    setHeader: (name, value) => sentHeaders.set(name, value),
  };
  return {
    req: { method: 'GET', url: '/x?q=1', headers, ...request },
    res,
    sent,
    sentHeaders,
    nextCalls: () => calls,
    nextError: () => caught,
    next: (error?: unknown) => {
      calls++;
      if (error !== undefined) caught = error;
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

describe('expressPact().authenticate', () => {
  it('should attach req.pact and call next on success', async () => {
    const m = run({ authorization: 'ApiKey k1:s1' });
    await expressPact(pact).authenticate(m.req, m.res, m.next);
    asserts.assertStrictEquals(m.nextCalls(), 1);
    asserts.assertStrictEquals(m.req.pact?.principal.id, 'k1');
    asserts.assertStrictEquals(m.req.pact?.via, 'APIKEY');
  });

  it('should respond 401 without a credential', async () => {
    const m = run();
    await expressPact(pact).authenticate(m.req, m.res, m.next);
    asserts.assertStrictEquals(m.nextCalls(), 0);
    asserts.assertEquals(m.sent, {
      status: 401,
      body: { error: 'NO_CREDENTIALS' },
    });
  });

  it('should continue unauthenticated when optional', async () => {
    const m = run();
    await expressPact(pact, { optional: true }).authenticate(
      m.req,
      m.res,
      m.next,
    );
    asserts.assertStrictEquals(m.nextCalls(), 1);
    asserts.assertStrictEquals(m.req.pact, undefined);
  });

  it('should respond 401 for an invalid credential even when optional', async () => {
    const m = run({ authorization: 'ApiKey k1:wrong' });
    await expressPact(pact, { optional: true }).authenticate(
      m.req,
      m.res,
      m.next,
    );
    asserts.assertStrictEquals(m.nextCalls(), 0);
    asserts.assertEquals(m.sent.status, 401);
  });

  it('should pass non-pact errors to next(error)', async () => {
    const m = run({ authorization: 'ApiKey boom:s' });
    await expressPact(pact).authenticate(m.req, m.res, m.next);
    asserts.assertStrictEquals(m.sent.status, undefined);
    asserts.assert(m.nextError() instanceof TypeError);
  });

  it('should comma-join array-valued headers, so a duplicated Authorization is invalid', async () => {
    const m = run({ authorization: ['ApiKey k1:s1', 'ApiKey k1:x'] });
    await expressPact(pact).authenticate(m.req, m.res, m.next);
    asserts.assertStrictEquals(m.req.pact, undefined);
    asserts.assertStrictEquals(m.sent.status, 401);
  });

  it('should verify a signed request from rawBody and sign what res.json sends', async () => {
    const m = run(await signedHeaders('POST', '/x?q=1', '{"n":1}'), {
      method: 'POST',
      rawBody: new TextEncoder().encode('{"n":1}'),
      body: { n: 1 },
    });
    await expressPact(pact, { hmac: {} }).authenticate(m.req, m.res, m.next);
    asserts.assertStrictEquals(m.nextCalls(), 1);
    asserts.assertStrictEquals(m.req.pact?.via, 'HMAC');
    m.res.status(201).json({ ok: true });
    await new Promise((resolve) => setTimeout(resolve, 10));
    asserts.assertStrictEquals(m.sent.body, '{"ok":true}');
    asserts.assertStrictEquals(
      m.sentHeaders.get('content-type'),
      'application/json; charset=utf-8',
    );
    asserts.assert(
      await verifyHMAC(
        `201\n${m.sentHeaders.get('x-timestamp')}\n${await contentDigest(
          '{"ok":true}',
        )}`,
        m.sentHeaders.get('x-signature')!,
        's1',
      ),
    );
  });

  it('should decrypt a JWE body into pactBody and encrypt what res.json sends', async () => {
    const m = run(
      { authorization: 'ApiKey k1:s1', 'content-type': 'application/jose' },
      {
        method: 'POST',
        body: await encryptJwe('s1', 'k1', '{"a":1}', 'A256GCM'),
      },
    );
    await expressPact(pact, { encryption: {} }).authenticate(
      m.req,
      m.res,
      m.next,
    );
    asserts.assertStrictEquals(
      new TextDecoder().decode(m.req.pactBody),
      '{"a":1}',
    );
    m.res.json!({ b: 2 });
    await new Promise((resolve) => setTimeout(resolve, 10));
    asserts.assertStrictEquals(
      m.sentHeaders.get('content-type'),
      'application/jose',
    );
    asserts.assertStrictEquals(
      new TextDecoder().decode(
        await decryptJwe('s1', 'k1', m.sent.body as string, ['A256GCM']),
      ),
      '{"b":2}',
    );
  });
});

describe('expressPact().authorize', () => {
  it('should pass a held permission and 403 a missing one', async () => {
    const auth = run({ authorization: 'ApiKey k1:s1' });
    await expressPact(pact).authenticate(auth.req, auth.res, auth.next);
    const ok = run();
    ok.req.pact = auth.req.pact;
    await expressPact(pact).authorize('Post', 'READ')(ok.req, ok.res, ok.next);
    asserts.assertStrictEquals(ok.nextCalls(), 1);
    const denied = run();
    denied.req.pact = auth.req.pact;
    await expressPact(pact).authorize('Post', 'EDIT')(
      denied.req,
      denied.res,
      denied.next,
    );
    asserts.assertStrictEquals(denied.nextCalls(), 0);
    asserts.assertEquals(denied.sent, {
      status: 403,
      body: { error: 'PERMISSION_DENIED' },
    });
  });

  it('should respond 401 when no auth context is attached', async () => {
    const m = run();
    await expressPact(pact).authorize('Post', 'READ')(m.req, m.res, m.next);
    asserts.assertEquals(m.sent.status, 401);
  });
});
