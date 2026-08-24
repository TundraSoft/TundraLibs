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
    const err = asserts.assertThrows(() => new Pact({} as any));
    asserts.assertEquals((err as { code?: string }).code, 'MISSING_OPTION');
  });

  it('gates capability hooks: password without getUser → MISSING_HOOK', () => {
    const err = asserts.assertThrows(() =>
      new Pact({ bits: BITS, secret: SECRET, password: true })
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
      const err = asserts.assertThrows(() => new Pact({ bits: BITS, session }));
      asserts.assertEquals((err as { code?: string }).code, 'MISSING_HOOK');
    }
  });

  it('JWT sessions with a minting method require secret → MISSING_OPTION', () => {
    const { hooks } = makeStore();
    const err = asserts.assertThrows(() =>
      new Pact({ bits: BITS, password: true, hooks })
    );
    asserts.assertEquals((err as { code?: string }).code, 'MISSING_OPTION');
  });

  it('validates secret shape/length against the algorithm', () => {
    const short = asserts.assertThrows(() =>
      new Pact({ bits: BITS, secret: 'too-short' })
    );
    asserts.assertEquals((short as { code?: string }).code, 'INVALID_OPTION');
    const pair = asserts.assertThrows(() =>
      new Pact({
        bits: BITS,
        secret: { privateKey: 'a', publicKey: 'b' },
      })
    );
    asserts.assertEquals((pair as { code?: string }).code, 'INVALID_OPTION');
  });

  it('authorization-only construction needs zero hooks', () => {
    const pact = new Pact({ bits: BITS, modules: { Post: ['READ', 'EDIT'] } });
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
    const pact = new Pact({
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
    const pact = new Pact({
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
    const pact = new Pact({
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
    const pact = new Pact({
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
    const pact = new Pact({
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
    const pact = new Pact({
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
});

describe('pact.Pact authenticate schemes', () => {
  const setup = () => {
    const store = makeStore();
    const pact = new Pact({
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

describe('pact.Pact otp + strategies + authZ', () => {
  it('enrollOtp stores a seed; verifyOtp accepts a live TOTP code', async () => {
    const store = makeStore();
    const pact = new Pact({
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
    const pact = new Pact({
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
    const pact = new Pact({
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
    const pact = new Pact({ bits: BITS });
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
