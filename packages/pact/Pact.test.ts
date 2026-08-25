import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { generateTOTP } from '@tundralibs/crypt/OTP';
import { signHMAC } from '@tundralibs/crypt/sign';
import { Pact } from './Pact.ts';
import {
  PactDefinitionError,
  PactDeniedError,
  PactTokenError,
} from './errors/mod.ts';
import type {
  PactHooks,
  PactStoredApiKey,
  PactStoredSession,
  PactStoredToken,
  PactStoredUser,
} from './types/mod.ts';

const BITS = { READ: 1n, EDIT: 2n, DELETE: 4n } as const;
// ≥ 64 UTF-8 bytes so it satisfies every HS* minimum (RFC 7518 §3.2).
const SECRET =
  'test-secret-at-least-512-bits-long-for-the-pact-jwt-test-suite-okay';

/** In-memory hook store — the app-side seam, five Maps and no magic. */
function makeStore() {
  const users = new Map<string, PactStoredUser>();
  const sessions = new Map<string, PactStoredSession>();
  const apiKeys = new Map<string, PactStoredApiKey>();
  const tokens = new Map<string, PactStoredToken>();
  const hooks: PactHooks = {
    getUser: (q) => {
      if (q.by === 'ID') return users.get(q.id) ?? null;
      if (q.by === 'IDENTIFIER') {
        return [...users.values()].find((u) =>
          u.metadata?.email === q.identifier
        ) ?? null;
      }
      return [...users.values()].find((u) =>
        u.metadata?.oauth === `${q.provider}:${q.subject}`
      ) ?? null;
    },
    createUser: (draft) => {
      const id = `u${users.size + 1}`;
      const user: PactStoredUser = {
        id,
        secret: draft.secret,
        grants: draft.grants,
        status: 'ACTIVE',
        metadata: {
          email: draft.identifier,
          ...(draft.oauth !== undefined
            ? { oauth: `${draft.oauth.provider}:${draft.oauth.subject}` }
            : {}),
          ...draft.metadata,
        },
      };
      users.set(id, user);
      return user;
    },
    updateUser: (id, patch) => {
      const user = users.get(id);
      if (user !== undefined) users.set(id, { ...user, ...patch });
    },
    saveSession: (s) => {
      sessions.set(s.id, s);
    },
    getSession: (id) => sessions.get(id) ?? null,
    deleteSession: (id) => {
      sessions.delete(id);
    },
    deleteUserSessions: (userId) => {
      for (const [id, s] of sessions) {
        if (s.userId === userId) sessions.delete(id);
      }
    },
    getApiKey: (id) => apiKeys.get(id) ?? null,
    saveApiKey: (r) => {
      apiKeys.set(r.id, r);
    },
    getToken: (h) => tokens.get(h) ?? null,
    saveToken: (r) => {
      tokens.set(r.hash, r);
    },
  };
  return { users, sessions, apiKeys, tokens, hooks };
}

describe('pact.Pact construction', () => {
  it('throws MISSING_OPTION when bits are omitted', () => {
    // deno-lint-ignore no-explicit-any
    const err = asserts.assertThrows(() => Pact.create({} as any));
    asserts.assertEquals((err as { code?: string }).code, 'MISSING_OPTION');
  });

  it('gates capability hooks: password without getUser → MISSING_HOOK', () => {
    const err = asserts.assertThrows(() =>
      Pact.create({ bits: BITS, secret: SECRET, password: true })
    );
    asserts.assertEquals((err as { code?: string }).code, 'MISSING_HOOK');
  });

  it('gates session hooks: OPAQUE / refresh without the trio → MISSING_HOOK', () => {
    for (
      const session of [
        { strategy: 'OPAQUE' as const },
        { refresh: {} },
      ]
    ) {
      const err = asserts.assertThrows(() =>
        Pact.create({ bits: BITS, session })
      );
      asserts.assertEquals((err as { code?: string }).code, 'MISSING_HOOK');
    }
  });

  it('JWT sessions with a minting method require secret → MISSING_OPTION', () => {
    const { hooks } = makeStore();
    const err = asserts.assertThrows(() =>
      Pact.create({ bits: BITS, password: true, hooks })
    );
    asserts.assertEquals((err as { code?: string }).code, 'MISSING_OPTION');
  });

  it('validates secret shape/length against the algorithm', () => {
    const short = asserts.assertThrows(() =>
      Pact.create({ bits: BITS, secret: 'too-short' })
    );
    asserts.assertEquals((short as { code?: string }).code, 'INVALID_OPTION');
    const pair = asserts.assertThrows(() =>
      Pact.create({
        bits: BITS,
        secret: { privateKey: 'a', publicKey: 'b' },
      })
    );
    asserts.assertEquals((pair as { code?: string }).code, 'INVALID_OPTION');
  });

  it('authorization-only construction needs zero hooks', () => {
    const pact = Pact.create({
      bits: BITS,
      modules: { Post: ['READ', 'EDIT'] },
    });
    asserts.assert(
      pact.can(
        { id: 'x', grants: { Post: 1n }, status: 'ACTIVE', metadata: {} },
        'READ',
        'Post',
      ),
    );
  });
});

describe('pact.Pact register + password login + JWT sessions', () => {
  const setup = () => {
    const store = makeStore();
    const pact = Pact.create({
      bits: BITS,
      modules: { Post: ['READ', 'EDIT', 'DELETE'] },
      secret: SECRET,
      password: true,
      hooks: store.hooks,
    });
    return { store, pact };
  };

  it('register hashes the password (never stored plaintext) and emits', async () => {
    const { store, pact } = setup();
    const registered: string[] = [];
    pact.on('register', (p) => {
      registered.push(p.id);
    });
    const principal = await pact.register({
      identifier: 'a@x.io',
      password: 'correct horse battery staple',
      grants: { Post: '3' },
    });
    asserts.assertEquals(registered, [principal.id]);
    const stored = store.users.get(principal.id)!;
    asserts.assertNotEquals(stored.secret, 'correct horse battery staple');
    asserts.assert(stored.secret!.startsWith('pbkdf2-'));
    asserts.assertEquals(principal.grants.Post, 3n);
  });

  it('login → JWT → verify round-trips the principal', async () => {
    const { pact } = setup();
    await pact.register({
      identifier: 'a@x.io',
      password: 'pw-123456789',
      grants: { Post: '3' },
    });
    const result = await pact.login('password', {
      identifier: 'a@x.io',
      password: 'pw-123456789',
    });
    asserts.assert(result !== null);
    asserts.assert(result.token.split('.').length === 3); // compact JWT
    asserts.assertEquals(result.refreshToken, undefined);
    const principal = await pact.verify(result.token);
    asserts.assert(principal !== null);
    asserts.assertEquals(principal.grants.Post, 3n);
  });

  it('bad password / unknown user / non-ACTIVE → null + loginFailed(no error)', async () => {
    const { store, pact } = setup();
    const failures: Array<Error | undefined> = [];
    pact.on('loginFailed', (_m, error) => {
      failures.push(error);
    });
    const p = await pact.register({
      identifier: 'a@x.io',
      password: 'pw-123456789',
    });
    asserts.assertEquals(
      await pact.login('password', { identifier: 'a@x.io', password: 'nope' }),
      null,
    );
    asserts.assertEquals(
      await pact.login('password', { identifier: 'ghost', password: 'x' }),
      null,
    );
    store.users.set(p.id, { ...store.users.get(p.id)!, status: 'LOCKED' });
    asserts.assertEquals(
      await pact.login('password', {
        identifier: 'a@x.io',
        password: 'pw-123456789',
      }),
      null,
    );
    asserts.assertEquals(failures, [undefined, undefined, undefined]);
  });

  it('unknown login method throws UNKNOWN_STRATEGY', async () => {
    const { pact } = setup();
    const err = await asserts.assertRejects(() => pact.login('ldap', {}));
    asserts.assertEquals((err as { code?: string }).code, 'UNKNOWN_STRATEGY');
  });

  it('custom identifierField renames the credential key', async () => {
    const store = makeStore();
    const pact = Pact.create({
      bits: BITS,
      secret: SECRET,
      password: { identifierField: 'email' },
      hooks: store.hooks,
    });
    await pact.register({ identifier: 'a@x.io', password: 'pw-123456789' });
    const result = await pact.login('password', {
      email: 'a@x.io',
      password: 'pw-123456789',
    });
    asserts.assert(result !== null);
  });

  it('embedGrants: verify rebuilds the principal with zero store lookups', async () => {
    const store = makeStore();
    let idLookups = 0;
    const hooks: PactHooks = {
      ...store.hooks,
      getUser: (q) => {
        if (q.by === 'ID') idLookups++;
        return store.hooks.getUser!(q);
      },
    };
    const pact = Pact.create({
      bits: BITS,
      secret: SECRET,
      password: true,
      session: { embedGrants: true },
      hooks,
    });
    await pact.register({
      identifier: 'a@x.io',
      password: 'pw-123456789',
      grants: { Post: '7' },
    });
    const result = await pact.login('password', {
      identifier: 'a@x.io',
      password: 'pw-123456789',
    });
    const principal = await pact.verify(result!.token);
    asserts.assertEquals(principal!.grants.Post, 7n);
    asserts.assertEquals(idLookups, 0);
  });

  it('without embedGrants verify resolves fresh — a LOCKED user dies immediately', async () => {
    const { store, pact } = setup();
    const p = await pact.register({
      identifier: 'a@x.io',
      password: 'pw-123456789',
    });
    const result = await pact.login('password', {
      identifier: 'a@x.io',
      password: 'pw-123456789',
    });
    store.users.set(p.id, { ...store.users.get(p.id)!, status: 'LOCKED' });
    asserts.assertEquals(await pact.verify(result!.token), null);
  });

  it('a tampered token verifies to null and emits verifyFailed', async () => {
    const { pact } = setup();
    const failures: Error[] = [];
    pact.on('verifyFailed', (error) => {
      failures.push(error);
    });
    asserts.assertEquals(await pact.verify('not.a.jwt'), null);
    asserts.assertEquals(failures.length, 1);
  });

  it('isRevoked vetoes a signature-valid token (TOKEN_REVOKED)', async () => {
    const store = makeStore();
    const blocked = new Set<string>();
    const pact = Pact.create({
      bits: BITS,
      secret: SECRET,
      password: true,
      hooks: { ...store.hooks, isRevoked: (c) => blocked.has(String(c.sub)) },
    });
    const p = await pact.register({
      identifier: 'a@x.io',
      password: 'pw-123456789',
    });
    const result = await pact.login('password', {
      identifier: 'a@x.io',
      password: 'pw-123456789',
    });
    asserts.assert(await pact.verify(result!.token) !== null);
    blocked.add(p.id);
    const failures: Error[] = [];
    pact.on('verifyFailed', (error) => {
      failures.push(error);
    });
    asserts.assertEquals(await pact.verify(result!.token), null);
    asserts.assertEquals(
      (failures[0] as PactTokenError).code,
      'TOKEN_REVOKED',
    );
  });
});

describe('pact.Pact OPAQUE sessions', () => {
  const setup = () => {
    const store = makeStore();
    const pact = Pact.create({
      bits: BITS,
      password: true,
      session: { strategy: 'OPAQUE', ttl: 60 },
      hooks: store.hooks,
    });
    return { store, pact };
  };

  it('login mints an opaque id; verify resolves; logout kills it', async () => {
    const { pact } = setup();
    await pact.register({ identifier: 'a@x.io', password: 'pw-123456789' });
    const result = await pact.login('password', {
      identifier: 'a@x.io',
      password: 'pw-123456789',
    });
    asserts.assert(result !== null);
    asserts.assertFalse(result.token.includes('.')); // opaque, not a JWT
    asserts.assert(await pact.verify(result.token) !== null);
    await pact.logout(result.token);
    asserts.assertEquals(await pact.verify(result.token), null);
  });

  it('an expired session verifies to null', async () => {
    const { store, pact } = setup();
    await pact.register({ identifier: 'a@x.io', password: 'pw-123456789' });
    const result = await pact.login('password', {
      identifier: 'a@x.io',
      password: 'pw-123456789',
    });
    const session = store.sessions.get(result!.token)!;
    store.sessions.set(session.id, { ...session, expiresAt: Date.now() - 1 });
    asserts.assertEquals(await pact.verify(result!.token), null);
  });

  it('logoutAll ends every session for the user', async () => {
    const { pact } = setup();
    const p = await pact.register({
      identifier: 'a@x.io',
      password: 'pw-123456789',
    });
    const creds = { identifier: 'a@x.io', password: 'pw-123456789' };
    const a = await pact.login('password', creds);
    const b = await pact.login('password', creds);
    await pact.logoutAll(p.id);
    asserts.assertEquals(await pact.verify(a!.token), null);
    asserts.assertEquals(await pact.verify(b!.token), null);
  });
});

describe('pact.Pact refresh rotation', () => {
  const setup = (grace = 5) => {
    const store = makeStore();
    const pact = Pact.create({
      bits: BITS,
      secret: SECRET,
      password: true,
      session: { ttl: 60, refresh: { ttl: 3_600, grace } },
      hooks: store.hooks,
    });
    return { store, pact };
  };
  const login = async (pact: Pact<typeof BITS>) => {
    await pact.register({ identifier: 'a@x.io', password: 'pw-123456789' });
    return (await pact.login('password', {
      identifier: 'a@x.io',
      password: 'pw-123456789',
    }))!;
  };

  it('login issues an access+refresh pair; refresh rotates both', async () => {
    const { pact } = setup();
    const first = await login(pact);
    asserts.assert(first.refreshToken !== undefined);
    asserts.assert(await pact.verify(first.token) !== null);
    const second = await pact.refresh(first.refreshToken!);
    asserts.assert(second !== null);
    asserts.assert(second.refreshToken !== first.refreshToken);
    asserts.assert(await pact.verify(second.token) !== null);
    // the rotated refresh token works again
    asserts.assert(await pact.refresh(second.refreshToken!) !== null);
  });

  it('a refresh token never passes verify (TOKEN_TYPE_MISMATCH)', async () => {
    const { pact } = setup();
    const result = await login(pact);
    const failures: Error[] = [];
    pact.on('verifyFailed', (error) => {
      failures.push(error);
    });
    asserts.assertEquals(await pact.verify(result.refreshToken!), null);
    asserts.assertEquals(
      (failures[0] as PactTokenError).code,
      'TOKEN_TYPE_MISMATCH',
    );
  });

  it('within grace, a concurrent refresh of the previous generation succeeds', async () => {
    const { pact } = setup(5);
    const first = await login(pact);
    await pact.refresh(first.refreshToken!);
    // Replaying the JUST-rotated generation inside the grace window is the
    // legitimate concurrent-refresh race — allowed, no family kill.
    const raced = await pact.refresh(first.refreshToken!);
    asserts.assert(raced !== null);
  });

  it('with grace 0, replaying an old refresh token kills the family', async () => {
    const { pact } = setup(0);
    const first = await login(pact);
    const reuse: Array<[string, string]> = [];
    pact.on('refreshReuse', (userId, familyId) => {
      reuse.push([userId, familyId]);
    });
    const second = await pact.refresh(first.refreshToken!);
    asserts.assert(second !== null);
    // Replay of the old generation → family revoked, event fired.
    asserts.assertEquals(await pact.refresh(first.refreshToken!), null);
    asserts.assertEquals(reuse.length, 1);
    // The whole family is dead — even the newest token fails now.
    asserts.assertEquals(await pact.refresh(second.refreshToken!), null);
  });

  it('logout via the access token kills the family', async () => {
    const { pact } = setup();
    const first = await login(pact);
    await pact.logout(first.token);
    asserts.assertEquals(await pact.refresh(first.refreshToken!), null);
  });

  it('refresh returns null when the user vanished between rotations', async () => {
    const { store, pact } = setup();
    const first = await login(pact);
    store.users.clear(); // user deleted; the family is still live
    asserts.assertEquals(await pact.refresh(first.refreshToken!), null);
  });

  it('a malformed / non-refresh token yields null (TOKEN_TYPE_MISMATCH)', async () => {
    const { pact } = setup();
    const first = await login(pact);
    const failures: Error[] = [];
    pact.on('verifyFailed', (e) => {
      failures.push(e);
    });
    // the ACCESS token is not a refresh token
    asserts.assertEquals(await pact.refresh(first.token), null);
    // garbage isn't a JWT at all
    asserts.assertEquals(await pact.refresh('not.a.jwt'), null);
    asserts.assert(failures.length >= 1);
  });
});

describe('pact.Pact logout edge cases', () => {
  it('stateless JWT logout is a no-op (nothing to revoke)', async () => {
    const store = makeStore();
    const pact = Pact.create({
      bits: BITS,
      secret: SECRET,
      password: true,
      hooks: store.hooks, // JWT, no refresh → stateless
    });
    await pact.register({ identifier: 'a@x.io', password: 'pw-123456789' });
    const r = await pact.login('password', {
      identifier: 'a@x.io',
      password: 'pw-123456789',
    });
    await pact.logout(r!.token); // resolves, throws nothing
    // the access token still verifies — stateless logout can't revoke it
    asserts.assert(await pact.verify(r!.token) !== null);
  });

  it('OPAQUE logout of an unknown token is a silent no-op', async () => {
    const store = makeStore();
    const pact = Pact.create({
      bits: BITS,
      password: true,
      session: { strategy: 'OPAQUE' },
      hooks: store.hooks,
    });
    await pact.logout('never-issued'); // no throw, no event
  });

  it('refresh() throws when refresh rotation is not configured', async () => {
    const store = makeStore();
    const pact = Pact.create({
      bits: BITS,
      secret: SECRET,
      password: true,
      hooks: store.hooks,
    });
    const err = await asserts.assertRejects(
      () => pact.refresh('x'),
      PactDefinitionError,
    );
    asserts.assertEquals((err as PactDefinitionError).code, 'MISSING_OPTION');
  });
});

describe('pact.Pact authenticate schemes', () => {
  const setup = () => {
    const store = makeStore();
    const pact = Pact.create({
      bits: BITS,
      secret: SECRET,
      password: true,
      apiKeys: { prefix: 'acme' },
      tokens: true,
      hooks: store.hooks,
    });
    return { store, pact };
  };

  it('BASIC verifies identifier+password per request', async () => {
    const { pact } = setup();
    const p = await pact.register({
      identifier: 'a@x.io',
      password: 'pw-123456789',
    });
    const ok = await pact.authenticate({
      scheme: 'BASIC',
      identifier: 'a@x.io',
      password: 'pw-123456789',
    });
    asserts.assertEquals(ok?.id, p.id);
    asserts.assertEquals(
      await pact.authenticate({
        scheme: 'BASIC',
        identifier: 'a@x.io',
        password: 'wrong',
      }),
      null,
    );
  });

  it('BEARER delegates to verify()', async () => {
    const { pact } = setup();
    await pact.register({ identifier: 'a@x.io', password: 'pw-123456789' });
    const result = await pact.login('password', {
      identifier: 'a@x.io',
      password: 'pw-123456789',
    });
    const principal = await pact.authenticate({
      scheme: 'BEARER',
      token: result!.token,
    });
    asserts.assert(principal !== null);
  });

  it('TOKEN: issueToken → authenticate; grants override; revocation', async () => {
    const { store, pact } = setup();
    const p = await pact.register({
      identifier: 'a@x.io',
      password: 'pw-123456789',
      grants: { Post: '7' },
    });
    const { token } = await pact.issueToken(p.id, {
      grants: { Post: 1n },
      expiresAt: Date.now() + 60_000,
    });
    asserts.assert(token.startsWith('pact_tk_'));
    const principal = await pact.authenticate({ scheme: 'TOKEN', token });
    asserts.assertEquals(principal?.grants.Post, 1n); // scoped, not the user's 7n
    asserts.assertEquals(
      await pact.authenticate({ scheme: 'TOKEN', token: 'pact_tk_bogus' }),
      null,
    );
    for (const record of store.tokens.values()) {
      store.tokens.set(record.hash, { ...record, revokedAt: Date.now() });
    }
    asserts.assertEquals(
      await pact.authenticate({ scheme: 'TOKEN', token }),
      null,
    );
  });

  it('APIKEY: issueApiKey → authenticate with keyId+secret', async () => {
    const { pact } = setup();
    const p = await pact.register({
      identifier: 'a@x.io',
      password: 'pw-123456789',
    });
    const { id, secret } = await pact.issueApiKey(p.id);
    asserts.assert(id.startsWith('acme_ak_'));
    asserts.assert(secret.startsWith('acme_sk_'));
    const principal = await pact.authenticate({
      scheme: 'APIKEY',
      keyId: id,
      secret,
    });
    asserts.assertEquals(principal?.id, p.id);
    asserts.assertEquals(
      await pact.authenticate({ scheme: 'APIKEY', keyId: id, secret: 'no' }),
      null,
    );
  });

  it('APIKEY with a hash-only-missing record, and HMAC with no stored secret, reject', async () => {
    const { store, pact } = setup();
    const p = await pact.register({
      identifier: 'a@x.io',
      password: 'pw-123456789',
    });
    // A signing-style key (only `secret`, no `secretHash`) can't be presented
    // as an APIKEY.
    store.apiKeys.set('k_ak_1', {
      id: 'k_ak_1',
      userId: p.id,
      secret: 'signing-only',
    });
    asserts.assertEquals(
      await pact.authenticate({
        scheme: 'APIKEY',
        keyId: 'k_ak_1',
        secret: 'signing-only',
      }),
      null,
    );
    // A presented-style key (only `secretHash`) can't verify HMAC signatures.
    store.apiKeys.set('k_ak_2', {
      id: 'k_ak_2',
      userId: p.id,
      secretHash: await (async () => 'deadbeef')(),
    });
    asserts.assertEquals(
      await pact.authenticate({
        scheme: 'HMAC',
        keyId: 'k_ak_2',
        signature: await signHMAC('x', 'whatever'),
        payload: 'x',
      }),
      null,
    );
    // unknown key id → null (both schemes)
    asserts.assertEquals(
      await pact.authenticate({
        scheme: 'APIKEY',
        keyId: 'ghost',
        secret: 's',
      }),
      null,
    );
  });

  it('HMAC verifies a signature against the stored signing secret', async () => {
    const { store, pact } = setup();
    const p = await pact.register({
      identifier: 'a@x.io',
      password: 'pw-123456789',
    });
    store.apiKeys.set('sign_ak_1', {
      id: 'sign_ak_1',
      userId: p.id,
      secret: 'the-signing-secret',
    });
    const payload = 'POST /orders {"total":42}';
    const signature = await signHMAC(payload, 'the-signing-secret');
    const principal = await pact.authenticate({
      scheme: 'HMAC',
      keyId: 'sign_ak_1',
      signature,
      payload,
    });
    asserts.assertEquals(principal?.id, p.id);
    asserts.assertEquals(
      await pact.authenticate({
        scheme: 'HMAC',
        keyId: 'sign_ak_1',
        signature,
        payload: 'POST /orders {"total":9000}', // tampered
      }),
      null,
    );
  });
});

describe('pact.Pact OAuth login', () => {
  const setup = () => {
    const store = makeStore();
    const pact = Pact.create({
      bits: BITS,
      secret: SECRET,
      oauth: {
        google: {
          provider: 'GOOGLE',
          clientId: 'cid',
          clientSecret: 'cs',
          redirectUri: 'https://app.example.com/cb',
        },
      },
      hooks: store.hooks,
    });
    // Inject a stub fetch into the internal OAuth client's `_fetch` seam so
    // the login pipeline runs end-to-end without touching the network.
    const stub = ((input: unknown) => {
      const url = String(input);
      const body = url.includes('/token')
        ? { access_token: 'at' }
        : { sub: 'g-1', email: 'a@x.io' };
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          headers: { 'content-type': 'application/json' },
        }),
      );
    }) as unknown as typeof fetch;
    (pact as unknown as {
      __oauth: Map<string, { _fetch: typeof fetch }>;
    }).__oauth.get('google')!._fetch = stub;
    return { store, pact };
  };

  it('first login provisions via createUser (isNew); repeat login finds the user', async () => {
    const { pact } = setup();
    const first = await pact.login('google', { code: 'c', verifier: 'v' });
    asserts.assert(first !== null);
    asserts.assertEquals(first.isNew, true); // provisioned
    asserts.assertEquals(first.profile?.id, 'g-1'); // fresh profile rides along
    asserts.assertEquals(first.profile?.email, 'a@x.io');
    asserts.assert(await pact.verify(first.token) !== null);

    const second = await pact.login('google', { code: 'c2', verifier: 'v2' });
    asserts.assert(second !== null);
    asserts.assertEquals(second.isNew, false); // existing account found
    asserts.assertEquals(second.principal.id, first.principal.id);
  });

  it('oauthRedirect returns url/state/verifier/nonce; unknown provider throws', async () => {
    const { pact } = setup();
    const { url, state, verifier, nonce } = await pact.oauthRedirect('google');
    asserts.assertEquals(new URL(url).origin, 'https://accounts.google.com');
    asserts.assert(state.length > 0 && verifier.length > 0 && nonce.length > 0);
    const err = asserts.assertThrows(() => {
      pact.oauthRedirect('ghost');
    });
    asserts.assertEquals((err as { code?: string }).code, 'UNKNOWN_STRATEGY');
  });
});

describe('pact.Pact otp + strategies + authZ', () => {
  it('enrollOtp stores a seed; verifyOtp accepts a live TOTP code', async () => {
    const store = makeStore();
    const pact = Pact.create({
      bits: BITS,
      issuer: 'test.pact',
      hooks: store.hooks,
    });
    const user: PactStoredUser = { id: 'u1', metadata: { email: 'a@x.io' } };
    store.users.set('u1', user);
    const { secret, url } = await pact.enrollOtp('u1', {
      accountName: 'a@x.io',
    });
    asserts.assert(url.startsWith('otpauth://totp/'));
    asserts.assert(url.includes('test.pact'));
    asserts.assertEquals(store.users.get('u1')!.otpSecret, secret);
    const code = await generateTOTP(secret);
    asserts.assert(await pact.verifyOtp('u1', code));
    asserts.assertFalse(await pact.verifyOtp('u1', '000000'));
    asserts.assertFalse(await pact.verifyOtp('ghost', code));
  });

  it('custom strategies mint sessions through the same pipeline', async () => {
    const store = makeStore();
    const pact = Pact.create({
      bits: BITS,
      secret: SECRET,
      strategies: {
        ldap: (creds) =>
          (creds as { user?: string }).user === 'ok'
            ? {
              ok: true,
              user: { id: 'ldap-1', grants: { Post: '3' } },
              isNew: true,
            }
            : { ok: false },
      },
      hooks: store.hooks,
    });
    const result = await pact.login('ldap', { user: 'ok' });
    asserts.assert(result !== null);
    asserts.assertEquals(result.isNew, true);
    asserts.assertEquals(result.principal.grants.Post, 3n);
    asserts.assertEquals(await pact.login('ldap', { user: 'no' }), null);
  });

  it('can/assert gate on status and emit denied before throwing', () => {
    const pact = Pact.create({
      bits: BITS,
      modules: { Post: ['READ', 'EDIT', 'DELETE'] },
    });
    const denied: string[] = [];
    pact.on('denied', (_p, permission, module) => {
      denied.push(`${module}:${String(permission)}`);
    });
    const active = {
      id: 'u1',
      grants: { Post: 3n },
      status: 'ACTIVE' as const,
      metadata: {},
    };
    asserts.assert(pact.can(active, 'READ', 'Post'));
    asserts.assertFalse(pact.can(null, 'READ', 'Post'));
    asserts.assertFalse(
      pact.can({ ...active, status: 'LOCKED' }, 'READ', 'Post'),
    );
    pact.assert(active, 'EDIT', 'Post');
    asserts.assertThrows(
      () => pact.assert(active, 'DELETE', 'Post'),
      PactDeniedError,
    );
    asserts.assertEquals(denied, ['Post:DELETE']);
  });

  it('call-time hook gating throws MISSING_HOOK', async () => {
    const pact = Pact.create({ bits: BITS });
    const err = await asserts.assertRejects(
      () => pact.register({ identifier: 'x' }),
      PactDefinitionError,
    );
    asserts.assertEquals(
      (err as PactDefinitionError).code,
      'MISSING_HOOK',
    );
  });
});

describe('pact.Pact content signing', () => {
  const pact = Pact.create({ bits: BITS, secret: SECRET });

  it('sign → verifySignature round-trips (string and bytes)', async () => {
    const sig = await pact.sign('the response body');
    asserts.assert(await pact.verifySignature('the response body', sig));
    asserts.assertFalse(await pact.verifySignature('tampered', sig));
    asserts.assertFalse(
      await pact.verifySignature('the response body', 'nope'),
    );

    const bytes = new TextEncoder().encode('binary payload');
    const bsig = await pact.sign(bytes);
    asserts.assert(await pact.verifySignature(bytes, bsig));
  });

  it('derives a domain-separated key — NOT the raw JWT secret', async () => {
    // The default (derived) signature must differ from one made with the
    // raw secret as an explicit key: content signed via pact can never be
    // a valid HS* JWT signature under the same secret.
    const derived = await pact.sign('x');
    const rawKeyed = await pact.sign('x', SECRET);
    asserts.assertNotEquals(derived, rawKeyed);
  });

  it('honours an explicit key on both sides', async () => {
    const sig = await pact.sign('payload', 'my-own-key');
    asserts.assert(await pact.verifySignature('payload', sig, 'my-own-key'));
    // wrong key fails; the derived key also does not match an explicit one
    asserts.assertFalse(
      await pact.verifySignature('payload', sig, 'other-key'),
    );
    asserts.assertFalse(await pact.verifySignature('payload', sig));
  });

  it('derived signing requires a shared secret (RSA/none → MISSING_OPTION)', async () => {
    const rsa = Pact.create({
      bits: BITS,
      algorithm: 'RS256',
      secret: { privateKey: 'x', publicKey: 'y' },
    });
    const err = await asserts.assertRejects(
      () => rsa.sign('x'),
      PactDefinitionError,
    );
    asserts.assertEquals((err as PactDefinitionError).code, 'MISSING_OPTION');
    // but an explicit key works even with an RSA pair
    asserts.assert(
      await rsa.verifySignature('x', await rsa.sign('x', 'k'), 'k'),
    );

    const authzOnly = Pact.create({ bits: BITS });
    await asserts.assertRejects(() => authzOnly.sign('x'), PactDefinitionError);
  });
});

describe('pact.Pact — security-path coverage', () => {
  it('rejects an RS* algorithm handed a string secret → INVALID_OPTION', () => {
    const err = asserts.assertThrows(() =>
      Pact.create({ bits: BITS, algorithm: 'RS256', secret: SECRET })
    );
    asserts.assertEquals((err as { code?: string }).code, 'INVALID_OPTION');
  });

  it('gates oauth hooks: missing getUser or createUser → MISSING_HOOK', () => {
    const { hooks } = makeStore();
    const oauth = {
      google: {
        provider: 'GOOGLE' as const,
        clientId: 'c',
        clientSecret: 's',
        redirectUri: 'https://app.example/cb',
      },
    };
    const err1 = asserts.assertThrows(() =>
      Pact.create({
        bits: BITS,
        secret: SECRET,
        oauth,
        hooks: { getUser: hooks.getUser },
      })
    );
    asserts.assertEquals((err1 as { code?: string }).code, 'MISSING_HOOK');
    const err2 = asserts.assertThrows(() =>
      Pact.create({ bits: BITS, secret: SECRET, oauth, hooks: {} })
    );
    asserts.assertEquals((err2 as { code?: string }).code, 'MISSING_HOOK');
  });

  it('gates apiKeys hooks: missing getApiKey or getUser → MISSING_HOOK', () => {
    const { hooks } = makeStore();
    const err1 = asserts.assertThrows(() =>
      Pact.create({
        bits: BITS,
        apiKeys: true,
        hooks: { getUser: hooks.getUser },
      })
    );
    asserts.assertEquals((err1 as { code?: string }).code, 'MISSING_HOOK');
    const err2 = asserts.assertThrows(() =>
      Pact.create({
        bits: BITS,
        apiKeys: true,
        hooks: { getApiKey: hooks.getApiKey },
      })
    );
    asserts.assertEquals((err2 as { code?: string }).code, 'MISSING_HOOK');
  });

  it('gates tokens hooks: missing getToken or getUser → MISSING_HOOK', () => {
    const { hooks } = makeStore();
    const err1 = asserts.assertThrows(() =>
      Pact.create({
        bits: BITS,
        tokens: true,
        hooks: { getUser: hooks.getUser },
      })
    );
    asserts.assertEquals((err1 as { code?: string }).code, 'MISSING_HOOK');
    const err2 = asserts.assertThrows(() =>
      Pact.create({
        bits: BITS,
        tokens: true,
        hooks: { getToken: hooks.getToken },
      })
    );
    asserts.assertEquals((err2 as { code?: string }).code, 'MISSING_HOOK');
  });

  it('verify rejects a token whose issuer does not match config', async () => {
    const store = makeStore();
    const mint = Pact.create({
      bits: BITS,
      secret: SECRET,
      issuer: 'iss-a',
      audience: 'aud-a',
      password: true,
      hooks: store.hooks,
    });
    await mint.register({ identifier: 'a@x', password: 'pw-pw-pw-pw' });
    const login = await mint.login('password', {
      identifier: 'a@x',
      password: 'pw-pw-pw-pw',
    });
    asserts.assertExists(login);
    // the minting pact (matching iss/aud) accepts its own token…
    asserts.assertExists(await mint.verify(login.token));
    // …a checker expecting a DIFFERENT issuer rejects it → null
    const checker = Pact.create({
      bits: BITS,
      secret: SECRET,
      issuer: 'iss-b',
      audience: 'aud-a',
      password: true,
      hooks: store.hooks,
    });
    asserts.assertEquals(await checker.verify(login.token), null);
  });

  it('login rethrows an operational error and emits loginFailed with it', async () => {
    const { hooks } = makeStore();
    const boom = new Error('ldap down');
    let captured: Error | undefined;
    const pact = Pact.create({
      bits: BITS,
      secret: SECRET,
      strategies: {
        flaky: () => {
          throw boom;
        },
      },
      hooks,
    });
    pact.on('loginFailed', (_method, err) => {
      captured = err;
    });
    await asserts.assertRejects(
      () => pact.login('flaky', {}),
      Error,
      'ldap down',
    );
    asserts.assertStrictEquals(captured, boom);
  });

  it('BASIC authenticate → null for an unknown or passwordless user', async () => {
    const { hooks, users } = makeStore();
    const pact = Pact.create({
      bits: BITS,
      secret: SECRET,
      password: true,
      hooks,
    });
    asserts.assertEquals(
      await pact.authenticate({
        scheme: 'BASIC',
        identifier: 'ghost@x',
        password: 'p',
      }),
      null,
    );
    users.set('u9', {
      id: 'u9',
      status: 'ACTIVE',
      metadata: { email: 'oauth@x' },
    });
    asserts.assertEquals(
      await pact.authenticate({
        scheme: 'BASIC',
        identifier: 'oauth@x',
        password: 'p',
      }),
      null,
    );
  });

  it('TOKEN authenticate → null for an expired record', async () => {
    const { hooks, users } = makeStore();
    users.set('u1', { id: 'u1', status: 'ACTIVE', grants: { Post: '1' } });
    const pact = Pact.create({ bits: BITS, tokens: true, hooks });
    const { token } = await pact.issueToken('u1', {
      expiresAt: Date.now() - 1000,
    });
    asserts.assertEquals(
      await pact.authenticate({ scheme: 'TOKEN', token }),
      null,
    );
  });

  it('APIKEY and HMAC authenticate → null for a revoked key', async () => {
    const { hooks, users, apiKeys } = makeStore();
    users.set('u1', { id: 'u1', status: 'ACTIVE', grants: { Post: '1' } });
    const pact = Pact.create({ bits: BITS, apiKeys: true, hooks });
    const key = await pact.issueApiKey('u1');
    apiKeys.set(key.id, { ...apiKeys.get(key.id)!, revokedAt: Date.now() });
    asserts.assertEquals(
      await pact.authenticate({
        scheme: 'APIKEY',
        keyId: key.id,
        secret: key.secret,
      }),
      null,
    );
    apiKeys.set('h1', {
      id: 'h1',
      userId: 'u1',
      secret: 'shared-hmac-secret',
      revokedAt: Date.now(),
    });
    const sig = await signHMAC('payload', 'shared-hmac-secret');
    asserts.assertEquals(
      await pact.authenticate({
        scheme: 'HMAC',
        keyId: 'h1',
        signature: sig,
        payload: 'payload',
      }),
      null,
    );
  });

  it('authenticate → null when the resolved user is non-ACTIVE', async () => {
    const { hooks, users } = makeStore();
    users.set('u1', { id: 'u1', status: 'LOCKED', grants: { Post: '1' } });
    const pact = Pact.create({ bits: BITS, tokens: true, hooks });
    const { token } = await pact.issueToken('u1');
    asserts.assertEquals(
      await pact.authenticate({ scheme: 'TOKEN', token }),
      null,
    );
  });

  it('refresh applies the default grace window (previous gen re-issued)', async () => {
    const { hooks } = makeStore();
    const pact = Pact.create({
      bits: BITS,
      secret: SECRET,
      password: true,
      session: { refresh: {} },
      hooks,
    });
    await pact.register({ identifier: 'a@x', password: 'pw-pw-pw-pw' });
    const login = await pact.login('password', {
      identifier: 'a@x',
      password: 'pw-pw-pw-pw',
    });
    asserts.assertExists(login);
    const r1 = await pact.refresh(login.refreshToken!);
    asserts.assertExists(r1);
    // replaying the ORIGINAL (previous-gen) token within the default 5 s grace
    // is a concurrent refresh, not reuse → re-issued, family NOT revoked
    const r2 = await pact.refresh(login.refreshToken!);
    asserts.assertExists(r2);
  });

  it('refresh → null when the family record has expired', async () => {
    const { hooks, sessions } = makeStore();
    const pact = Pact.create({
      bits: BITS,
      secret: SECRET,
      password: true,
      session: { refresh: {} },
      hooks,
    });
    await pact.register({ identifier: 'a@x', password: 'pw-pw-pw-pw' });
    const login = await pact.login('password', {
      identifier: 'a@x',
      password: 'pw-pw-pw-pw',
    });
    asserts.assertExists(login);
    for (const [id, s] of sessions) {
      sessions.set(id, { ...s, expiresAt: Date.now() - 1000 });
    }
    asserts.assertEquals(await pact.refresh(login.refreshToken!), null);
  });

  it('setPassword hashes via updateUser; without it → MISSING_HOOK', async () => {
    const { hooks, users } = makeStore();
    users.set('u1', { id: 'u1', status: 'ACTIVE' });
    const pact = Pact.create({ bits: BITS, secret: SECRET, hooks });
    await pact.setPassword('u1', 'a-brand-new-password');
    const stored = users.get('u1');
    asserts.assertExists(stored?.secret);
    asserts.assert(stored!.secret !== 'a-brand-new-password'); // hashed
    const bare = Pact.create({ bits: BITS, secret: SECRET, hooks: {} });
    await asserts.assertRejects(
      () => bare.setPassword('u1', 'x'),
      PactDefinitionError,
    );
  });

  it('verifyOtp → false for a not-enrolled or non-ACTIVE user', async () => {
    const { hooks, users } = makeStore();
    users.set('u1', { id: 'u1', status: 'ACTIVE' }); // no otpSecret
    users.set('u2', {
      id: 'u2',
      status: 'LOCKED',
      otpSecret: 'JBSWY3DPEHPK3PXP',
    });
    const pact = Pact.create({ bits: BITS, secret: SECRET, hooks });
    asserts.assertEquals(await pact.verifyOtp('u1', '000000'), false);
    const code = await generateTOTP('JBSWY3DPEHPK3PXP');
    asserts.assertEquals(await pact.verifyOtp('u2', code), false);
  });
});
