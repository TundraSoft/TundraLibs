/**
 * @fileoverview Tests for `authenticate(schemes?)` — over `app.fetch`
 * (no ports), mirroring how core's `auth.test.ts` tests the generic
 * seam.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { Doctor } from '@tundralibs/doctor';
import type { PactStoredApiKey, PactStoredUser } from '@tundralibs/pact';
import { Application } from '../../Application.ts';
import { authenticate } from './authenticate.ts';
import { PACT, pact } from './pact.ts';

const make = () =>
  Application.initialize({
    name: 'pact-authenticate-test',
    server: { port: 0, hostname: '127.0.0.1' },
    logger: { handlers: [] },
    uploads: { path: '/tmp/rapid-pact-authenticate-test' },
  });

/** An in-memory store, seeded directly (no register()/issueApiKey() ceremony). */
function makeStore() {
  const users = new Map<string, PactStoredUser>();
  const apiKeys = new Map<string, PactStoredApiKey>();
  return {
    users,
    apiKeys,
    hooks: {
      getUser: (q: { by: string; id?: string; identifier?: string }) =>
        q.by === 'ID'
          ? users.get(q.id!) ?? null
          : [...users.values()].find((u) =>
            u.metadata?.email === q.identifier
          ) ??
            null,
      getApiKey: (id: string) => apiKeys.get(id) ?? null,
      saveApiKey: (r: PactStoredApiKey) => {
        apiKeys.set(r.id, r);
      },
    },
  };
}

describe('rapid.middlewares.pact.authenticate', () => {
  it('authenticates via APIKEY and sanitizes ctx.auth — no secret leaks', async () => {
    Doctor.revoke(PACT);
    const store = makeStore();
    store.users.set('u1', { id: 'u1', status: 'ACTIVE' });
    const instance = pact({
      bits: { READ: 1n },
      apiKeys: true,
      apiKey: {},
      hooks: store.hooks,
    });
    const { id, secret } = await instance.issueApiKey('u1');

    const app = await make();
    app.use(authenticate());
    app.get('/me', (ctx) => {
      const auth = ctx.auth as Record<string, unknown> | undefined;
      return {
        content: {
          id: auth?.id ?? null,
          authMode: auth?.authMode ?? null,
          keyId: auth?.keyId ?? null,
          hasSecret: auth !== undefined && 'secret' in auth,
        },
      };
    });

    const ok = await (await app.fetch(
      new Request('http://app/me', {
        headers: { 'x-api-key': id, 'x-api-secret': secret },
      }),
    )).json();
    asserts.assertEquals(ok.id, 'u1');
    asserts.assertEquals(ok.authMode, 'APIKEY');
    asserts.assertEquals(ok.keyId, id);
    asserts.assertEquals(ok.hasSecret, false);

    await app.stop();
  });

  it('a wrong secret and an unknown key both stay anonymous — never a 500', async () => {
    Doctor.revoke(PACT);
    const store = makeStore();
    store.users.set('u1', { id: 'u1', status: 'ACTIVE' });
    const instance = pact({
      bits: { READ: 1n },
      apiKeys: true,
      apiKey: {},
      hooks: store.hooks,
    });
    const { id } = await instance.issueApiKey('u1');

    const app = await make();
    app.use(authenticate());
    app.get('/me', (ctx) => ({ content: { auth: ctx.auth ?? null } }));

    const wrongSecret = await app.fetch(
      new Request('http://app/me', {
        headers: { 'x-api-key': id, 'x-api-secret': 'not-it' },
      }),
    );
    asserts.assertEquals(wrongSecret.status, 200);
    asserts.assertEquals((await wrongSecret.json()).auth, null);

    const unknownKey = await app.fetch(
      new Request('http://app/me', {
        headers: { 'x-api-key': 'ghost', 'x-api-secret': 'whatever' },
      }),
    );
    asserts.assertEquals(unknownKey.status, 200);
    asserts.assertEquals((await unknownKey.json()).auth, null);

    await app.stop();
  });

  it('BASIC authenticates and keeps identifier, not the password', async () => {
    Doctor.revoke(PACT);
    const store = makeStore();
    const instance = pact({
      bits: { READ: 1n },
      password: true,
      secret: 'a-256-bit-shared-secret-for-hs256-tests!',
      basic: {},
      hooks: {
        getUser: store.hooks.getUser,
        createUser: (draft) => {
          const user: PactStoredUser = {
            id: 'u1',
            secret: draft.secret,
            status: 'ACTIVE',
            metadata: { email: draft.identifier },
          };
          store.users.set('u1', user);
          return user;
        },
      },
    });
    await instance.register({
      identifier: 'ada@x.io',
      password: 'pw-123456789',
    });

    const app = await make();
    app.use(authenticate());
    app.get('/me', (ctx) => ({ content: { auth: ctx.auth ?? null } }));

    const encoded = btoa('ada@x.io:pw-123456789');
    const ok = await (await app.fetch(
      new Request('http://app/me', {
        headers: { authorization: `Basic ${encoded}` },
      }),
    )).json();
    asserts.assertEquals(ok.auth.identifier, 'ada@x.io');
    asserts.assertEquals(ok.auth.authMode, 'BASIC');
    asserts.assertEquals(ok.auth.password, undefined);

    await app.stop();
  });

  it('a scheme restriction ignores credentials outside the allowed list', async () => {
    Doctor.revoke(PACT);
    const store = makeStore();
    store.users.set('u1', { id: 'u1', status: 'ACTIVE' });
    const instance = pact({
      bits: { READ: 1n },
      apiKeys: true,
      apiKey: {},
      hooks: store.hooks,
    });
    const { id, secret } = await instance.issueApiKey('u1');

    const app = await make();
    // Restricted to BEARER only — an APIKEY credential must be ignored,
    // even though pact() itself is fully configured for it.
    app.get(
      '/me',
      authenticate(['BEARER']),
      (ctx) => ({ content: { auth: ctx.auth ?? null } }),
    );

    const result = await (await app.fetch(
      new Request('http://app/me', {
        headers: { 'x-api-key': id, 'x-api-secret': secret },
      }),
    )).json();
    asserts.assertEquals(result.auth, null);

    await app.stop();
  });

  it("denies (403) when an earlier, broader authenticate() already set ctx.auth via a scheme outside this route's restriction", async () => {
    Doctor.revoke(PACT);
    const store = makeStore();
    store.users.set('u1', { id: 'u1', status: 'ACTIVE' });
    const instance = pact({
      bits: { READ: 1n },
      apiKeys: true,
      apiKey: {},
      hooks: store.hooks,
    });
    const { id, secret } = await instance.issueApiKey('u1');

    const app = await make();
    // A broad, global authenticate() runs first and accepts APIKEY...
    app.use(authenticate());
    // ...but this route declares HMAC-only. A caller presenting a VALID
    // API key must NOT be treated as satisfying that restriction.
    app.get(
      '/webhook',
      authenticate(['HMAC']),
      () => ({ content: 'ok' }),
    );

    const res = await app.fetch(
      new Request('http://app/webhook', {
        headers: { 'x-api-key': id, 'x-api-secret': secret },
      }),
    );
    asserts.assertEquals(res.status, 403);

    await app.stop();
  });

  it("calls the matched scheme's respond hook after next(), with (ctx, pact)", async () => {
    Doctor.revoke(PACT);
    const store = makeStore();
    store.users.set('u1', { id: 'u1', status: 'ACTIVE' });
    const seen: unknown[] = [];
    const instance = pact({
      bits: { READ: 1n },
      apiKeys: true,
      hooks: store.hooks,
      apiKey: {
        respond: (ctx, p) => {
          seen.push(p);
          if (ctx.type === 'HTTP') ctx.setHeader('x-responded', 'yes');
        },
      },
    });
    const { id, secret } = await instance.issueApiKey('u1');

    const app = await make();
    app.use(authenticate());
    app.get('/me', () => ({ content: 'ok' }));
    // A public route — no credential presented, respond must NOT fire.
    app.get('/public', () => ({ content: 'ok' }));

    const authed = await app.fetch(
      new Request('http://app/me', {
        headers: { 'x-api-key': id, 'x-api-secret': secret },
      }),
    );
    asserts.assertEquals(authed.headers.get('x-responded'), 'yes');
    asserts.assertEquals(seen, [instance]);

    const anon = await app.fetch(new Request('http://app/public'));
    asserts.assertEquals(anon.headers.get('x-responded'), null);
    asserts.assertEquals(seen.length, 1); // still just the one call

    await app.stop();
  });
});
