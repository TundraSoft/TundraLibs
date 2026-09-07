/**
 * @fileoverview `pactAuth()` against a REAL `@tundralibs/pact` instance with
 * in-memory hooks: every carrier (Bearer header / custom prefix / cookie,
 * Basic, ApiKey header + split headers, HMAC), the optional-vs-required
 * rule, the "present but invalid is 401, never anonymous" rule, the typed
 * guard (401 with challenge / 403 / boot-time catalog check), transports,
 * and the `login()` endpoint end to end.
 * @module
 */
import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { signHMAC } from '@tundralibs/crypt';
import {
  Pact,
  type PactAuthContext,
  type PactStoredApiKey,
  type PactStoredSession,
  type PactStoredUser,
} from '@tundralibs/pact';
import { Application } from '../../Application.ts';
import { RapidError } from '../../errors/mod.ts';
import { login } from '../../endpoints/mod.ts';
import { pactAuth, type PactAuthOptions } from './mod.ts';

const PASSWORD = 'correct horse battery staple';

/** A real pact with in-memory persistence; one registered user. */
async function makePact() {
  const users = new Map<string, PactStoredUser>();
  const byIdentifier = new Map<string, string>();
  const apiKeys = new Map<string, PactStoredApiKey>();
  const sessions = new Map<string, PactStoredSession>();
  const pact = Pact.create({
    name: 'rapid-adapter-test',
    bits: { READ: 1n, EDIT: 2n },
    modulePermissions: { Posts: ['READ', 'EDIT'], Admin: ['READ'] },
    hooks: {
      getUser: (q) => {
        if (q.by === 'ID') return users.get(q.id) ?? null;
        if (q.by === 'IDENTIFIER') {
          return users.get(byIdentifier.get(q.identifier) ?? '') ?? null;
        }
        return null;
      },
      createUser: (input) => {
        const id = `u-${users.size + 1}`;
        const user: PactStoredUser = {
          id,
          status: input.status,
          ...(input.passwordHash !== undefined
            ? { passwordHash: input.passwordHash }
            : {}),
          grants: input.grants,
        };
        users.set(id, user);
        byIdentifier.set(input.identifier, id);
        return user;
      },
      getApiKey: (id) => apiKeys.get(id) ?? null,
      saveApiKey: (key) => {
        apiKeys.set(key.id, key);
      },
      revokeApiKey: (id) => {
        apiKeys.delete(id);
      },
      saveSession: (s) => {
        sessions.set(s.id, s);
      },
      getSession: (id) => sessions.get(id) ?? null,
      deleteSession: (id) => {
        sessions.delete(id);
      },
      deleteSessions: (userId) => {
        for (const [k, s] of sessions) {
          if (s.userId === userId) sessions.delete(k);
        }
      },
    },
  });
  await pact.register({
    identifier: 'ada',
    password: PASSWORD,
    grants: { Posts: 3n, Admin: 1n },
  });
  return pact;
}

type TestPact = Awaited<ReturnType<typeof makePact>>;

/** An app with `authenticate` global and three guarded routes. */
async function makeApp(pact: TestPact, options: PactAuthOptions = {}) {
  const { authenticate, authorize } = pactAuth(pact, options);
  const app = await Application.initialize({
    name: 'pact-adapter',
    server: { port: 0, hostname: '127.0.0.1' },
    logger: { handlers: [] },
  });
  app.use(authenticate);
  app.get('/whoami', (ctx) => {
    const auth = ctx.auth as PactAuthContext | undefined;
    return {
      content: auth === undefined
        ? { anonymous: true }
        : { id: auth.principal.id, kind: auth.principal.kind, via: auth.via },
    };
  });
  app.get(
    '/read',
    authorize('Posts', 'READ'),
    () => ({ content: { ok: true } }),
  );
  app.get(
    '/edit',
    authorize('Posts', 'EDIT'),
    () => ({ content: { ok: true } }),
  );
  return { app, authorize };
}

const get = (
  app: Application,
  path: string,
  headers: Record<string, string> = {},
) => app.fetch(new Request(`http://app${path}`, { headers }));

describe('rapid.middlewares.pact pactAuth()', () => {
  it('Bearer session token → ctx.auth is the PactAuthContext; a bad token is 401 with a challenge, never anonymous', async () => {
    const pact = await makePact();
    const { app } = await makeApp(pact);
    const { session } = await pact.login({
      identifier: 'ada',
      password: PASSWORD,
    });
    const ok = await get(app, '/whoami', {
      authorization: `Bearer ${session.token}`,
    });
    asserts.assertEquals(await ok.json(), {
      id: 'u-1',
      kind: 'USER',
      via: 'SESSION',
    });
    const bad = await get(app, '/whoami', { authorization: 'Bearer nope' });
    asserts.assertEquals(bad.status, 401);
    asserts.assertEquals(
      bad.headers.get('www-authenticate'),
      'Bearer, Basic, ApiKey',
    );
    const body = await bad.json();
    asserts.assertEquals(body.code, 'RAPID_UNAUTHENTICATED');
    asserts.assertEquals(body.details, { scheme: 'BEARER' }); // no pact code on the wire
    await app.stop();
  });

  it('no credential: anonymous by default, 401 with optional: false', async () => {
    const pact = await makePact();
    const { app } = await makeApp(pact);
    const anon = await get(app, '/whoami');
    asserts.assertEquals(await anon.json(), { anonymous: true });
    await app.stop();
    const { app: strict } = await makeApp(pact, {
      optional: false,
      realm: 'api',
    });
    const r = await get(strict, '/whoami');
    asserts.assertEquals(r.status, 401);
    asserts.assertEquals(
      r.headers.get('www-authenticate'),
      'Bearer realm="api", Basic realm="api", ApiKey realm="api"',
    );
    await r.body?.cancel();
    await strict.stop();
  });

  it('authorize: 401 + challenge when anonymous, 403 when the grant is missing, 200 when held', async () => {
    const pact = await makePact();
    const { app } = await makeApp(pact);
    const anon = await get(app, '/read');
    asserts.assertEquals(anon.status, 401);
    asserts.assertEquals(
      anon.headers.get('www-authenticate'),
      'Bearer, Basic, ApiKey',
    );
    await anon.body?.cancel();
    const { key, secret } = await pact.issueApiKey({
      userId: 'u-1',
      grants: { Posts: 1n },
    });
    const headers = { authorization: `ApiKey ${key}:${secret}` };
    const read = await get(app, '/read', headers);
    asserts.assertEquals(await read.json(), { ok: true });
    const edit = await get(app, '/edit', headers);
    asserts.assertEquals(edit.status, 403);
    asserts.assertEquals((await edit.json()).details, {
      module: 'Posts',
      permission: 'EDIT',
    });
    await app.stop();
  });

  it('authorize() checks the catalog at the CALL site — an unknown module or permission is RAPID_CONFIG at boot', async () => {
    const pact = await makePact();
    const { authorize } = pactAuth(pact);
    asserts.assertThrows(
      () => authorize('Nope' as never, 'READ'),
      RapidError,
      "'Nope' is not a module",
    );
    asserts.assertThrows(
      () => authorize('Admin', 'EDIT'),
      RapidError,
      "'EDIT' is not a permission of module 'Admin'",
    );
  });

  it('Basic, split API-key headers, a custom Bearer prefix, and the bearer cookie all resolve', async () => {
    const pact = await makePact();
    const { session } = await pact.login({
      identifier: 'ada',
      password: PASSWORD,
    });
    const { key, secret } = await pact.issueApiKey({
      userId: 'u-1',
      grants: { Posts: 1n },
    });
    const { app } = await makeApp(pact, {
      apiKey: {},
      bearer: { prefix: 'Token', cookie: 'sid' },
    });
    const basic = await get(app, '/whoami', {
      authorization: `Basic ${btoa(`ada:${PASSWORD}`)}`,
    });
    asserts.assertEquals((await basic.json()).via, 'BASIC');
    const split = await get(app, '/whoami', {
      'x-api-key': key,
      'x-api-secret': secret,
    });
    asserts.assertEquals(await split.json(), {
      id: key,
      kind: 'APIKEY',
      via: 'APIKEY',
    });
    const custom = await get(app, '/whoami', {
      authorization: `Token ${session.token}`,
    });
    asserts.assertEquals((await custom.json()).via, 'SESSION');
    // A custom prefix REPLACES `Bearer`: the standard word is now absent → anonymous.
    const standard = await get(app, '/whoami', {
      authorization: `Bearer ${session.token}`,
    });
    asserts.assertEquals(await standard.json(), { anonymous: true });
    const cookie = await get(app, '/whoami', {
      cookie: `sid=${session.token}`,
    });
    asserts.assertEquals((await cookie.json()).via, 'SESSION');
    await app.stop();
  });

  it('HMAC: the caller signs the canonical string with the key secret; a tampered signature is 401', async () => {
    const pact = await makePact();
    const { key, secret } = await pact.issueApiKey({
      userId: 'u-1',
      grants: { Posts: 1n },
    });
    const { app } = await makeApp(pact, {
      hmac: {
        canonical: (ctx) =>
          ctx.type === 'HTTP' ? `${ctx.method} ${ctx.path}` : '',
      },
    });
    const signature = await signHMAC('GET /whoami', secret);
    const ok = await get(app, '/whoami', {
      'x-key-id': key,
      'x-signature': signature,
    });
    asserts.assertEquals(await ok.json(), {
      id: key,
      kind: 'APIKEY',
      via: 'HMAC',
    });
    const other = await get(app, '/read', {
      'x-key-id': key,
      'x-signature': signature,
    }); // signed for another path
    asserts.assertEquals(other.status, 401);
    asserts.assertEquals(
      other.headers.get('www-authenticate'),
      'Bearer, Basic, ApiKey, HMAC',
    );
    await other.body?.cancel();
    await app.stop();
  });

  it('a job passes through authenticate (no client) but authorize fails CLOSED there', async () => {
    const pact = await makePact();
    const { authenticate, authorize } = pactAuth(pact);
    const open = await Application.initialize({
      name: 'pact-jobs-open',
      server: { enabled: false },
      logger: { handlers: [] },
    });
    open.use(authenticate);
    open.job('j', '0 6 * * *', () => ({ content: 'ran' }));
    asserts.assertEquals((await open.triggerJob('j')).status, 200);
    const guarded = await Application.initialize({
      name: 'pact-jobs-guarded',
      server: { enabled: false },
      logger: { handlers: [] },
    });
    guarded.use(authenticate, authorize('Admin', 'READ'));
    guarded.job('j', '0 6 * * *', () => ({ content: 'ran' }));
    const outcome = await guarded.triggerJob('j');
    asserts.assertEquals(outcome.status, 401);
    asserts.assertEquals(outcome.handlerRan, false);
  });

  it('login({ pact, cookie }): 200 + token + HttpOnly cookie the bearer-cookie carrier then accepts; 401 on a wrong password; 400 on a malformed body', async () => {
    const pact = await makePact();
    const { app } = await makeApp(pact, { bearer: { cookie: 'session' } });
    app.post(
      '/login',
      login({ pact, cookie: { name: 'session', secure: false } }),
    );
    const post = (body: unknown) =>
      app.fetch(
        new Request('http://app/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
      );
    const ok = await post({ identifier: 'ada', password: PASSWORD });
    asserts.assertEquals(ok.status, 200);
    const body = await ok.json();
    asserts.assertEquals(body.principal, { id: 'u-1' });
    asserts.assert(
      typeof body.token === 'string' && body.expiresAt.endsWith('Z'),
    );
    const setCookie = ok.headers.get('set-cookie') ?? '';
    asserts.assertStringIncludes(setCookie, `session=${body.token}`);
    asserts.assertStringIncludes(setCookie, 'HttpOnly');
    const me = await get(app, '/whoami', { cookie: `session=${body.token}` });
    asserts.assertEquals((await me.json()).via, 'SESSION');

    const wrong = await post({ identifier: 'ada', password: 'nope' });
    asserts.assertEquals(wrong.status, 401);
    asserts.assertEquals((await wrong.json()).code, 'RAPID_UNAUTHENTICATED');
    const unknown = await post({ identifier: 'nobody', password: 'nope' });
    asserts.assertEquals(unknown.status, 401); // same answer — no account oracle
    await unknown.body?.cancel();
    const malformed = await post({ user: 'ada' });
    asserts.assertEquals(malformed.status, 400);
    await malformed.body?.cancel();
    await app.stop();
  });
});
