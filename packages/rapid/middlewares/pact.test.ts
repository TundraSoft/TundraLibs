/**
 * @fileoverview `pactAuth()` against a REAL `@tundralibs/pact` instance with
 * in-memory hooks: every carrier (Bearer header / custom prefix / cookie,
 * Basic, ApiKey header + two-header form), the optional-vs-required rule,
 * the "present but invalid is 401, never anonymous" rule, the typed guard
 * (401 with challenge / 403 / boot-time catalog check), the signed HMAC
 * exchange both ways, encrypted payloads both ways, transports, the
 * session handlers (`login` / `logout` / `refresh` / `me`).
 * @module
 */
import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { signHMAC, verifyHMAC } from '@tundralibs/crypt';
import {
  Pact,
  type PactAuthContext,
  type PactStoredApiKey,
  type PactStoredSession,
  type PactStoredUser,
} from '@tundralibs/pact';
import { contentDigest } from '@tundralibs/pact/middleware';
import { Application } from '../Application.ts';
import { RapidError } from '../errors/mod.ts';
import { pactAuth, type PactAuthOptions } from './pact.ts';

const PASSWORD = 'correct horse battery staple';

/** A real pact with in-memory persistence; one registered user. */
async function makePact(
  session?: {
    strategy: 'JWT';
    secret: string;
    refresh?: { ttl?: number; grace?: number };
  },
) {
  const users = new Map<string, PactStoredUser>();
  const byIdentifier = new Map<string, string>();
  const apiKeys = new Map<string, PactStoredApiKey>();
  const sessions = new Map<string, PactStoredSession>();
  const pact = Pact.create({
    name: 'rapid-adapter-test',
    bits: { READ: 1n, EDIT: 2n },
    modulePermissions: { Posts: ['READ', 'EDIT'], Admin: ['READ'] },
    ...(session !== undefined ? { options: { session } } : {}),
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

/** An app with `authenticate` global and guarded + echoing routes. */
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
  app.post('/echo', async (ctx) => ({
    status: 201,
    content: { got: await ctx.payload },
  }));
  return { app, authorize };
}

const get = (
  app: Application,
  path: string,
  headers: Record<string, string> = {},
) => app.fetch(new Request(`http://app${path}`, { headers }));

const TEXT = new TextDecoder();

/** Headers for a request signed over pact's default template. */
async function signed(
  secret: string,
  key: string,
  method: string,
  target: string,
  body: string | null,
  extra: Record<string, string> = {},
): Promise<Record<string, string>> {
  const timestamp = extra['x-timestamp'] ??
    String(Math.floor(Date.now() / 1000));
  const payload = `${method}\n${target}\n${timestamp}\n${await contentDigest(
    body,
  )}`;
  return {
    'x-key-id': key,
    'x-signature': await signHMAC(payload, secret),
    'x-timestamp': timestamp,
    ...extra,
  };
}

describe('rapid.middlewares.pactAuth()', () => {
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
    asserts.assertEquals(body.message, 'invalid credential'); // no pact code on the wire
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
    asserts.assertEquals((await r.json()).details, {
      schemes: ['BEARER', 'BASIC', 'APIKEY'],
    });
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

  it('authorize() checks the catalog at the CALL site, and a bad option is RAPID_CONFIG at build', async () => {
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
    asserts.assertThrows(
      () => pactAuth(pact, { hmac: { template: '${@path}' } }),
      RapidError,
      'hmac.template',
    );
  });

  it('Basic, the two-header API-key carrier, a custom Bearer prefix, and the bearer cookie all resolve', async () => {
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
      apiKey: { keyHeader: 'x-api-key', secretHeader: 'x-api-secret' },
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
    // A custom prefix replaces `Bearer`: the standard word is now absent → anonymous.
    const standard = await get(app, '/whoami', {
      authorization: `Bearer ${session.token}`,
    });
    asserts.assertEquals(await standard.json(), { anonymous: true });
    const cookie = await get(app, '/whoami', {
      cookie: `sid=${session.token}`,
    });
    asserts.assertEquals((await cookie.json()).via, 'SESSION');
    // A STALE cookie is the one credential treated as anonymous — and it is
    // cleared, so a logged-out browser can reach /login again.
    const badCookie = await get(app, '/whoami', { cookie: 'sid=nope' });
    asserts.assertEquals(await badCookie.json(), { anonymous: true });
    asserts.assertMatch(
      badCookie.headers.get('set-cookie') ?? '',
      /sid=;.*(Max-Age=0|Expires=)/,
    );
    await app.stop();
  });

  it('HMAC: verifies the default template over the raw body, rejects a stale timestamp, and signs the JSON response', async () => {
    const pact = await makePact();
    const { key, secret } = await pact.issueApiKey({
      userId: 'u-1',
      grants: { Posts: 1n },
    });
    const { app } = await makeApp(pact, { hmac: { maxSkew: 60 } });
    const body = '{"n":1}';
    const ok = await app.fetch(
      new Request('http://app/echo?x=1', {
        method: 'POST',
        headers: {
          ...await signed(secret, key, 'POST', '/echo?x=1', body),
          'content-type': 'application/json',
        },
        body,
      }),
    );
    asserts.assertEquals(ok.status, 201);
    const text = await ok.text();
    asserts.assertEquals(JSON.parse(text), { got: { n: 1 } });
    asserts.assertEquals(ok.headers.get('content-type'), 'application/json');
    const ts = ok.headers.get('x-timestamp')!;
    asserts.assert(
      await verifyHMAC(
        `201\n${ts}\n${await contentDigest(text)}`,
        ok.headers.get('x-signature')!,
        secret,
      ),
      'the response signature covers the bytes sent',
    );
    // Signed for another target, or with a body the digest does not match.
    const other = await get(
      app,
      '/read',
      await signed(secret, key, 'GET', '/whoami', null),
    );
    asserts.assertEquals(other.status, 401);
    asserts.assertEquals(
      other.headers.get('www-authenticate'),
      'Bearer, Basic, ApiKey, HMAC',
    );
    asserts.assertStrictEquals(other.headers.get('x-signature'), null);
    await other.body?.cancel();
    const stale = await get(
      app,
      '/whoami',
      await signed(secret, key, 'GET', '/whoami', null, {
        'x-timestamp': '1700000000',
      }),
    );
    asserts.assertEquals(stale.status, 401);
    asserts.assertEquals((await stale.json()).details, {
      reason: 'STALE_TIMESTAMP',
    });
    // A plain API-key caller is not signed back.
    const plain = await get(app, '/whoami', {
      authorization: `ApiKey ${key}:${secret}`,
    });
    asserts.assertStrictEquals(plain.headers.get('x-signature'), null);
    await plain.body?.cancel();
    await app.stop();
  });

  it('encryption: a JWE body reaches the handler decrypted through ctx.payload and the reply comes back as a JWE', async () => {
    const pact = await makePact();
    const { key, secret } = await pact.issueApiKey({
      userId: 'u-1',
      grants: { Posts: 1n },
    });
    const { app } = await makeApp(pact, { encryption: {} });
    const jwe = await pact.encryptFor(key, '{"card":"4111"}');
    const ok = await app.fetch(
      new Request('http://app/echo', {
        method: 'POST',
        headers: {
          authorization: `ApiKey ${key}:${secret}`,
          'content-type': 'application/jose',
        },
        body: jwe,
      }),
    );
    asserts.assertEquals(ok.status, 201);
    asserts.assertEquals(ok.headers.get('content-type'), 'application/jose');
    const plaintext = TEXT.decode(await pact.decryptFor(key, await ok.text()));
    asserts.assertEquals(JSON.parse(plaintext), { got: { card: '4111' } });
    // A plaintext caller gets a plaintext reply; a broken JWE is a 400.
    const plain = await get(app, '/whoami', {
      authorization: `ApiKey ${key}:${secret}`,
    });
    asserts.assertEquals(plain.headers.get('content-type'), 'application/json');
    await plain.body?.cancel();
    const broken = await app.fetch(
      new Request('http://app/echo', {
        method: 'POST',
        headers: {
          authorization: `ApiKey ${key}:${secret}`,
          'content-type': 'application/jose',
        },
        body: 'not.a.jwe',
      }),
    );
    asserts.assertEquals(broken.status, 400);
    asserts.assertEquals((await broken.json()).details, {
      reason: 'ENCRYPTION_INVALID',
    });
    await app.stop();
    void secret;
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

  it('login() / me() / logout(): one cookie name, one 401 for every failure, a minimal principal, idempotent logout', async () => {
    const pact = await makePact();
    const { authenticate, login, logout, me } = pactAuth(pact, {
      bearer: { cookie: 'session' },
      session: { cookie: { secure: false } },
    });
    const app = await Application.initialize({
      name: 'pact-session',
      server: { port: 0, hostname: '127.0.0.1' },
      logger: { handlers: [] },
    });
    app.use(authenticate);
    app.post('/login', login());
    app.post('/logout', logout());
    app.get('/me', me());
    app.get('/anon', (ctx) => ({
      content: { anonymous: ctx.auth === undefined },
    }));
    const post = (path: string, body?: unknown, cookie?: string) =>
      app.fetch(
        new Request(`http://app${path}`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(cookie !== undefined ? { cookie } : {}),
          },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        }),
      );

    const malformed = await post('/login', { user: 'ada' });
    asserts.assertEquals(malformed.status, 400);
    await malformed.body?.cancel();
    for (
      const creds of [{ identifier: 'ada', password: 'nope' }, {
        identifier: 'nobody',
        password: 'nope',
      }]
    ) {
      const res = await post('/login', creds);
      asserts.assertEquals(res.status, 401);
      const body = await res.json();
      asserts.assertEquals(body.code, 'RAPID_UNAUTHENTICATED');
      asserts.assertEquals(body.message, 'invalid credentials'); // no account oracle
    }
    const ok = await post('/login', { identifier: 'ada', password: PASSWORD });
    asserts.assertEquals(ok.status, 200);
    const body = await ok.json();
    asserts.assertEquals(body.principal, { id: 'u-1' });
    asserts.assertEquals(typeof body.token, 'string');
    asserts.assert(body.expiresAt.endsWith('Z'));
    asserts.assertEquals(body.refreshToken, undefined); // OPAQUE strategy
    const setCookie = ok.headers.get('set-cookie') ?? '';
    asserts.assertStringIncludes(setCookie, `session=${body.token}`);
    asserts.assertStringIncludes(setCookie, 'HttpOnly');
    asserts.assertStringIncludes(setCookie, 'SameSite=Lax');
    asserts.assertMatch(setCookie, /Max-Age=\d+/);

    const anon = await app.fetch(new Request('http://app/me'));
    asserts.assertEquals(anon.status, 401);
    await anon.body?.cancel();
    const who = await get(app, '/me', { cookie: `session=${body.token}` });
    asserts.assertEquals(await who.json(), {
      principal: { id: 'u-1' },
      via: 'SESSION',
    });

    const out = await post('/logout', undefined, `session=${body.token}`);
    asserts.assertEquals(out.status, 204);
    asserts.assertMatch(
      out.headers.get('set-cookie') ?? '',
      /session=;.*(Max-Age=0|Expires=)/,
    );
    const after = await get(app, '/me', { cookie: `session=${body.token}` });
    asserts.assertEquals(after.status, 401); // the session is gone
    await after.body?.cancel();
    const again = await post('/logout', undefined, `session=${body.token}`);
    asserts.assertEquals(again.status, 204); // idempotent
    await again.body?.cancel();
    // A STALE cookie is cleared and the request continues anonymous — the
    // browser keeps sending it, and a 401 would lock the user out of /login.
    const stale = await get(app, '/anon', { cookie: `session=${body.token}` });
    asserts.assertEquals(await stale.json(), { anonymous: true });
    asserts.assertMatch(
      stale.headers.get('set-cookie') ?? '',
      /session=;.*(Max-Age=0|Expires=)/,
    );
    const relogin = await post(
      '/login',
      { identifier: 'ada', password: PASSWORD },
      `session=${body.token}`,
    );
    asserts.assertEquals(relogin.status, 200);
    await relogin.body?.cancel();
    await app.stop();
  });

  it('refresh(): rotates a JWT session from the body or the refresh cookie; a reused token is 401; OPAQUE is RAPID_CONFIG', async () => {
    // grace: 0 — pact honours a reused refresh token inside the grace window
    // by design; the test wants the reuse verdict immediately.
    const jwt = await makePact({
      strategy: 'JWT',
      secret: 'a'.repeat(40),
      refresh: { grace: 0 },
    });
    const { login, refresh } = pactAuth(jwt, {
      bearer: { cookie: 'session' },
      session: { cookie: { secure: false }, refreshCookie: 'refresh' },
    });
    const app = await Application.initialize({
      name: 'pact-refresh',
      server: { port: 0, hostname: '127.0.0.1' },
      logger: { handlers: [] },
    });
    app.post('/login', login());
    app.post('/refresh', refresh());
    const post = (
      path: string,
      headers: Record<string, string> = {},
      body?: unknown,
    ) =>
      app.fetch(
        new Request(`http://app${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...headers },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        }),
      );
    const ok = await post('/login', {}, {
      identifier: 'ada',
      password: PASSWORD,
    });
    const first = await ok.json();
    asserts.assertEquals(first.refreshToken, undefined); // rides the cookie instead
    const cookies = ok.headers.get('set-cookie') ?? '';
    asserts.assertStringIncludes(cookies, 'refresh=');
    const refreshToken = /refresh=([^;]+)/.exec(cookies)![1]!;

    const rotated = await post('/refresh', {
      cookie: `refresh=${refreshToken}`,
    });
    asserts.assertEquals(rotated.status, 200);
    const second = await rotated.json();
    // Rotation is proven by the OLD refresh token being refused below — two
    // JWTs minted in the same second for the same session are byte-identical.
    asserts.assertEquals(typeof second.token, 'string');
    asserts.assertStringIncludes(
      rotated.headers.get('set-cookie') ?? '',
      'refresh=',
    );
    // Leave pact's concurrent-refresh window (`grace: 0` still spans the
    // rotation's own millisecond) before presenting the old token again.
    await new Promise((r) => setTimeout(r, 10));
    const reused = await post('/refresh', {
      cookie: `refresh=${refreshToken}`,
    });
    asserts.assertEquals(reused.status, 401);
    await reused.body?.cancel();
    const missing = await post('/refresh');
    asserts.assertEquals(missing.status, 400);
    await missing.body?.cancel();
    await app.stop();

    // Body form, and the OPAQUE strategy has no refresh at all.
    const opaque = await makePact();
    const bodyForm = pactAuth(opaque, {});
    const app2 = await Application.initialize({
      name: 'pact-refresh-opaque',
      server: { port: 0, hostname: '127.0.0.1' },
      logger: { handlers: [] },
    });
    app2.post('/refresh', bodyForm.refresh());
    const res = await app2.fetch(
      new Request('http://app/refresh', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken: 'x' }),
      }),
    );
    asserts.assertEquals(res.status, 500);
    asserts.assertEquals((await res.json()).code, 'RAPID_CONFIG');
    await app2.stop();
  });
});
