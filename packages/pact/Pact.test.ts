/**
 * @fileoverview Tests for the Pact engine: definition validation, id-based
 * authorization, opt-in caching, register/API-key sugar, login/sessions,
 * the credential seam, the four authenticate schemes, JWT refresh
 * rotation, events, MFA, and content signing.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { Cacher } from '@tundralibs/cacher';
import { pbkdf2Hash, sha256 } from '@tundralibs/crypt/digest';
import { generateTOTP } from '@tundralibs/crypt/OTP';
import { signHMAC } from '@tundralibs/crypt/sign';
import { Pact } from './mod.ts';
import { PactError } from './errors/mod.ts';
import { deserializeGrants, serializeGrants } from './grants.ts';
import type {
  PactPrincipal,
  PactStoredApiKey,
  PactStoredResetToken,
  PactStoredSession,
  PactStoredUser,
} from './types/mod.ts';

const HASH = await pbkdf2Hash('secret123');

const BASE = {
  bits: { READ: 1n, EDIT: 2n, DELETE: 4n },
  modulePermissions: {
    Post: ['READ', 'EDIT', 'DELETE'],
    Billing: ['READ'],
  },
} as const;

async function expectCode(
  p: Promise<unknown>,
  code: string,
): Promise<PactError> {
  const error = await asserts.assertRejects(() => p, PactError);
  asserts.assertStrictEquals(error.code, code);
  return error;
}

function expectThrowCode(fn: () => unknown, code: string): PactError {
  const error = asserts.assertThrows(fn, PactError);
  asserts.assertStrictEquals(error.code, code);
  return error;
}

/** An in-memory user/session/key/reset store wired into pact hooks. */
function makeStore() {
  const byId = new Map<string, PactStoredUser>();
  const byIdentifier = new Map<string, string>();
  const sessions = new Map<string, PactStoredSession>();
  const keys = new Map<string, PactStoredApiKey>();
  const resets = new Map<string, PactStoredResetToken>();
  const store = {
    byId,
    byIdentifier,
    sessions,
    keys,
    resets,
    lastSetPassword: undefined as { userId: string; hash: string } | undefined,
    seed(id: string, identifier: string, extra: Partial<PactStoredUser> = {}) {
      byId.set(id, {
        id,
        status: 'ACTIVE',
        passwordHash: HASH,
        grants: serializeGrants({ Post: 1n }),
        ...extra,
      });
      byIdentifier.set(identifier, id);
    },
    hooks: {
      getUser: (q: { by: string; id?: string; identifier?: string }) => {
        if (q.by === 'ID') return byId.get(q.id!) ?? null;
        if (q.by === 'IDENTIFIER') {
          const id = byIdentifier.get(q.identifier!);
          return id === undefined ? null : byId.get(id) ?? null;
        }
        return null;
      },
      saveSession: (s: PactStoredSession) => {
        sessions.set(s.id, s);
      },
      getSession: (id: string) => sessions.get(id) ?? null,
      deleteSession: (id: string) => {
        sessions.delete(id);
      },
      deleteSessions: (userId: string) => {
        for (const [k, s] of sessions) {
          if (s.userId === userId) sessions.delete(k);
        }
      },
      saveApiKey: (k: PactStoredApiKey) => {
        keys.set(k.id, k);
      },
      getApiKey: (id: string) => keys.get(id) ?? null,
      revokeApiKey: (id: string) => {
        keys.delete(id);
      },
      setPassword: (userId: string, hash: string) => {
        store.lastSetPassword = { userId, hash };
        const user = byId.get(userId)!;
        byId.set(userId, { ...user, passwordHash: hash });
      },
      saveResetToken: (r: PactStoredResetToken) => {
        resets.set(r.id, r);
      },
      consumeResetToken: (id: string) => {
        const r = resets.get(id) ?? null;
        resets.delete(id);
        return r;
      },
    },
  };
  return store;
}

// =============================================================================
// Definition
// =============================================================================

describe('Pact definition', () => {
  it('should reject empty or junk activeStatuses', () => {
    expectThrowCode(
      () => Pact.create({ ...BASE, activeStatuses: [] }),
      'INVALID_STATUSES',
    );
    expectThrowCode(
      () => Pact.create({ ...BASE, activeStatuses: [' '] }),
      'INVALID_STATUSES',
    );
  });

  it('should reject malformed instance names', () => {
    for (const bad of ['', ' padded', 'a:b', 'a__b']) {
      expectThrowCode(
        () => Pact.create({ ...BASE, name: bad }),
        'INVALID_OPTION',
      );
    }
  });

  it('should auto-name unnamed instances uniquely', () => {
    const a = Pact.create({ ...BASE });
    const b = Pact.create({ ...BASE });
    asserts.assertMatch(a.name, /^pact-\d+$/);
    asserts.assertNotStrictEquals(a.name, b.name);
  });

  it('should require an explicit name to cache on a shared engine', () => {
    const error = expectThrowCode(
      () =>
        Pact.create({
          ...BASE,
          options: { cache: { engine: 'REDIS', ttl: { principal: 5 } } },
        }),
      'INVALID_OPTION',
    );
    asserts.assertStringIncludes(error.message, 'name');
    // MEMORY stays name-optional: per-process, collisions impossible.
    Pact.create({ ...BASE, options: { cache: { ttl: { principal: 5 } } } });
  });

  it('should surface a bad cache engine as CACHE_INIT_FAILED', () => {
    expectThrowCode(
      () =>
        Pact.create({
          ...BASE,
          name: 'pact-test-bad-engine',
          options: { cache: { engine: 'NOPE', ttl: { principal: 1 } } },
        }),
      'CACHE_INIT_FAILED',
    );
  });

  it('should construct the subclass when a subclass calls create()', async () => {
    class SubPact extends Pact<{ READ: 1n }, 'Post'> {}
    const sub = SubPact.create({
      bits: { READ: 1n },
      modulePermissions: { Post: ['READ'] },
      hooks: { getPrincipal: () => null },
    });
    asserts.assert(
      sub instanceof SubPact,
      'create() must construct the subclass',
    );
    asserts.assertFalse(await sub.hasPermission('ghost', 'Post', 'READ'));
  });
});

// =============================================================================
// Authorization
// =============================================================================

describe('Pact authorization', () => {
  const PRINCIPALS: Record<string, PactPrincipal<'Post' | 'Billing'>> = {
    u1: { kind: 'USER', id: 'u1', grants: { Post: 3n } },
    ak_1: { kind: 'APIKEY', id: 'ak_1', userId: 'u1', grants: { Billing: 1n } },
    neg: { kind: 'USER', id: 'neg', grants: { Post: -1n } },
    // deno-lint-ignore no-explicit-any
    junk: { kind: 'USER', id: 'junk', grants: { Post: 5 as any } },
  };
  const pact = Pact.create({
    ...BASE,
    hooks: { getPrincipal: (id) => PRINCIPALS[id] ?? null },
  });

  it('should evaluate grants by id and fail closed on the unknown', async () => {
    asserts.assert(await pact.hasPermission('u1', 'Post', 'READ'));
    asserts.assertFalse(await pact.hasPermission('u1', 'Post', 'DELETE'));
    asserts.assertFalse(
      await pact.hasPermission('u1', 'Billing', 'READ'),
      'module absent from grants',
    );
    asserts.assertFalse(await pact.hasPermission('ghost', 'Post', 'READ'));
  });

  it('should throw PERMISSION_DENIED from assert with actor context', async () => {
    await pact.assert('ak_1', 'Billing', 'READ');
    const denied = await expectCode(
      pact.assert('ak_1', 'Post', 'READ'),
      'PERMISSION_DENIED',
    );
    asserts.assertStringIncludes(denied.message, "APIKEY 'ak_1'");
    const ghost = await expectCode(
      pact.assert('ghost', 'Post', 'READ'),
      'PERMISSION_DENIED',
    );
    asserts.assertStringIncludes(ghost.message, "PRINCIPAL 'ghost'");
  });

  it('should keep definition misuse loud, never a boolean', async () => {
    await expectCode(
      pact.hasPermission('u1', 'Billing', 'EDIT'),
      'PERMISSION_NOT_IN_MODULE',
    );
    await expectCode(
      pact.hasPermission('u1', 'constructor' as never, 'READ'),
      'UNKNOWN_MODULE',
    );
    await expectCode(
      pact.hasPermission('u1', 'Post', 'toString' as never),
      'UNKNOWN_PERMISSION',
    );
  });

  it('should clamp hostile grants to no access', async () => {
    asserts.assertFalse(
      await pact.hasPermission('neg', 'Post', 'READ'),
      '-1n mask must never grant',
    );
    asserts.assertFalse(
      await pact.hasPermission('junk', 'Post', 'READ'),
      'non-bigint mask must never grant',
    );
  });

  it('should fail closed on padded or empty principal ids', async () => {
    asserts.assertFalse(await pact.hasPermission(' u1', 'Post', 'READ'));
    asserts.assertFalse(await pact.hasPermission('', 'Post', 'READ'));
  });

  it('should throw MISSING_HOOK when no resolution hook exists', async () => {
    const bare = Pact.create({ ...BASE });
    await expectCode(bare.hasPermission('u1', 'Post', 'READ'), 'MISSING_HOOK');
  });
});

// =============================================================================
// Caching
// =============================================================================

describe('Pact caching', () => {
  function counting(options?: Parameters<typeof Pact.create>[0]['options']) {
    let fetches = 0;
    const pact = Pact.create({
      ...BASE,
      hooks: {
        getPrincipal: (id) => {
          fetches++;
          return { kind: 'USER', id, grants: { Post: 1n } };
        },
      },
      ...(options === undefined ? {} : { options }),
    });
    return { pact, fetches: () => fetches };
  }

  it('should hit the hook every time when caching is not configured', async () => {
    const { pact, fetches } = counting();
    await pact.hasPermission('a', 'Post', 'READ');
    await pact.hasPermission('a', 'Post', 'READ');
    asserts.assertStrictEquals(fetches(), 2);
    await pact.invalidatePrincipal('a'); // safe no-op
    await pact.hasPermission('a', 'Post', 'READ');
    asserts.assertStrictEquals(fetches(), 3);
  });

  it('should cache under a configured TTL and evict on invalidate', async () => {
    const { pact, fetches } = counting({ cache: { ttl: { principal: 1 } } });
    await pact.hasPermission('b', 'Post', 'READ');
    await pact.hasPermission('b', 'Post', 'EDIT');
    asserts.assertStrictEquals(fetches(), 1);
    await pact.invalidatePrincipal('b');
    await pact.hasPermission('b', 'Post', 'READ');
    asserts.assertStrictEquals(fetches(), 2);
  });

  it('should treat ttl 0 as the explicit opt-out', async () => {
    const { pact, fetches } = counting({ cache: { ttl: { principal: 0 } } });
    await pact.hasPermission('c', 'Post', 'READ');
    await pact.hasPermission('c', 'Post', 'READ');
    asserts.assertStrictEquals(fetches(), 2);
  });

  it('should namespace per-type caches by instance name and round-trip values', async () => {
    class TestPact extends Pact<typeof BASE.bits, 'Post' | 'Billing'> {
      constructor() {
        super(
          BASE.bits,
          BASE.modulePermissions,
          ['ACTIVE'],
          {},
          { cache: { ttl: { principal: 5 } } },
          'pact-test',
        );
      }
      put(key: string, value: unknown): Promise<void> {
        return this._cacheSet('principal', key, value);
      }
      take<T>(key: string): Promise<T | undefined> {
        return this._cacheGet<T>('principal', key);
      }
      putSession(key: string, value: unknown): Promise<void> {
        return this._cacheSet('session', key, value);
      }
      takeSession<T>(key: string): Promise<T | undefined> {
        return this._cacheGet<T>('session', key);
      }
    }
    const p = new TestPact();
    asserts.assert(Cacher.hasInstance('pact-test__principal'));
    asserts.assertFalse(
      Cacher.hasInstance('pact-test__session'),
      'a type without a TTL gets no cache instance',
    );
    const seen = new Date('2026-01-01T00:00:00Z');
    await p.put('u1', { id: 'u1', grants: 6n, seen });
    const got = await p.take<{ grants: bigint; seen: Date }>('u1');
    asserts.assertStrictEquals(got?.grants, 6n);
    asserts.assert(got?.seen instanceof Date);
    await p.clearCache();
    asserts.assertStrictEquals(await p.take('u1'), undefined);
    // A type without a TTL never caches.
    await p.putSession('s1', { x: 1 });
    asserts.assertStrictEquals(await p.takeSession('s1'), undefined);
  });
});

// =============================================================================
// Register and API keys
// =============================================================================

describe('Pact register and API keys', () => {
  const store = makeStore();
  const pact = Pact.create({
    ...BASE,
    activeStatuses: ['ACTIVE', 'TRIAL'],
    hooks: {
      ...store.hooks,
      createUser: (input) => {
        const user: PactStoredUser = {
          id: `fu${store.byId.size + 1}`,
          status: input.status,
          passwordHash: input.passwordHash,
          grants: input.grants,
          metadata: input.metadata,
        };
        store.byId.set(user.id, user);
        store.byIdentifier.set(input.identifier, user.id);
        return user;
      },
    },
  });

  it('should hash the password, default the status, and reject duplicates', async () => {
    const user = await pact.register({
      identifier: 'ada@example.dev',
      password: 'correct horse',
      grants: { Post: 3n },
    });
    asserts.assert(user.passwordHash?.startsWith('pbkdf2-'));
    asserts.assertStrictEquals(user.status, 'ACTIVE');
    await expectCode(
      pact.register({ identifier: 'ada@example.dev', password: 'x' }),
      'USER_EXISTS',
    );
  });

  it('should authorize any active status and fail closed on others', async () => {
    const trial = await pact.register({
      identifier: 'trial@example.dev',
      password: 'x',
      grants: { Post: 1n },
      status: 'TRIAL',
    });
    asserts.assert(await pact.hasPermission(trial.id, 'Post', 'READ'));
    const pending = await pact.register({
      identifier: 'pending@example.dev',
      password: 'x',
      grants: { Post: 1n },
      status: 'PENDING',
    });
    asserts.assertFalse(await pact.hasPermission(pending.id, 'Post', 'READ'));
  });

  it('should issue prefixed key pairs with serialized grants and revoke via hook', async () => {
    const pair = await pact.issueApiKey({
      userId: 'fu1',
      grants: { Post: 1n },
    });
    const saved = store.keys.get(pair.key);
    asserts.assertExists(saved);
    asserts.assertStrictEquals(saved.secret, pair.secret);
    asserts.assert(pair.key.startsWith('pact_ak_'));
    asserts.assert(pair.secret.startsWith('pact_as_'));
    asserts.assertStrictEquals(deserializeGrants(saved.grants).Post, 1n);
    await pact.revokeApiKey(pair.key);
    asserts.assertFalse(store.keys.has(pair.key));
  });

  it('should suspend keys whose owner can no longer authorize', async () => {
    store.seed('own-ok', 'own-ok@example.dev');
    store.seed('own-bad', 'own-bad@example.dev', { status: 'LOCKED' });
    const set = (id: string, userId?: string) =>
      store.keys.set(id, {
        id,
        userId,
        status: 'ACTIVE',
        secret: `s-${id}`,
        grants: serializeGrants({ Post: 1n }),
      });
    set('k-ok', 'own-ok');
    set('k-bad', 'own-bad');
    set('k-ghost', 'gone');
    set('k-free');
    const ok = await pact.authenticate({
      scheme: 'APIKEY',
      keyId: 'k-ok',
      secret: 's-k-ok',
    });
    asserts.assertStrictEquals(ok.principal.id, 'k-ok');
    const notActive = await expectCode(
      pact.authenticate({
        scheme: 'APIKEY',
        keyId: 'k-bad',
        secret: 's-k-bad',
      }),
      'NOT_ACTIVE',
    );
    asserts.assertStringIncludes(notActive.message, "'LOCKED'");
    await expectCode(
      pact.authenticate({
        scheme: 'APIKEY',
        keyId: 'k-ghost',
        secret: 's-k-ghost',
      }),
      'INVALID_CREDENTIALS',
    );
    const free = await pact.authenticate({
      scheme: 'APIKEY',
      keyId: 'k-free',
      secret: 's-k-free',
    });
    asserts.assertStrictEquals(free.via, 'APIKEY');
    // Id-based authz honors the same owner gate.
    asserts.assertFalse(await pact.hasPermission('k-bad', 'Post', 'READ'));
    asserts.assert(await pact.hasPermission('k-ok', 'Post', 'READ'));
  });

  it('should skip the owner gate when no user hooks can verify it', async () => {
    const keyOnly = Pact.create({
      ...BASE,
      hooks: { getApiKey: (id) => store.keys.get(id) ?? null },
    });
    const ctx = await keyOnly.authenticate({
      scheme: 'APIKEY',
      keyId: 'k-bad',
      secret: 's-k-bad',
    });
    asserts.assertStrictEquals(ctx.via, 'APIKEY');
  });
});

// =============================================================================
// Login, sessions, reset
// =============================================================================

describe('Pact login and sessions', () => {
  const store = makeStore();
  store.seed('lu1', 'ada@example.dev');
  store.seed('lu2', 'pending@example.dev', { status: 'PENDING' });
  const pact = Pact.create({ ...BASE, hooks: store.hooks });

  it('should mint an opaque session stored by sha-256 and delete on logout', async () => {
    const result = await pact.login({
      identifier: 'ada@example.dev',
      password: 'secret123',
    });
    asserts.assert(result.session.token.startsWith('pact_st_'));
    asserts.assertStrictEquals(result.principal.id, 'lu1');
    asserts.assert(result.session.expiresAt.getTime() > Date.now());
    const id = await sha256(result.session.token);
    asserts.assertStrictEquals(store.sessions.get(id)?.userId, 'lu1');
    await pact.logout(result.session.token);
    asserts.assertFalse(store.sessions.has(id));
  });

  it('should collapse failures and order NOT_ACTIVE after verification', async () => {
    await expectCode(
      pact.login({ identifier: 'ada@example.dev', password: 'wrong' }),
      'INVALID_CREDENTIALS',
    );
    await expectCode(
      pact.login({ identifier: 'ghost@example.dev', password: 'secret123' }),
      'INVALID_CREDENTIALS',
    );
    // Wrong password on an inactive account must not reveal the status.
    await expectCode(
      pact.login({ identifier: 'pending@example.dev', password: 'wrong' }),
      'INVALID_CREDENTIALS',
    );
    const notActive = await expectCode(
      pact.login({ identifier: 'pending@example.dev', password: 'secret123' }),
      'NOT_ACTIVE',
    );
    asserts.assertStringIncludes(notActive.message, "'PENDING'");
  });

  it('should run the password reset end to end, single-use and windowed', async () => {
    asserts.assertStrictEquals(
      await pact.requestPasswordReset('ghost@example.dev'),
      null,
    );
    const reset = await pact.requestPasswordReset('ada@example.dev');
    asserts.assertExists(reset);
    asserts.assert(reset.token.startsWith('pact_pr_'));
    asserts.assert(await pact.resetPassword(reset.token, 'newpass456'));
    asserts.assert(store.lastSetPassword?.hash.startsWith('pbkdf2-'));
    asserts.assertFalse(
      await pact.resetPassword(reset.token, 'again'),
      'token must be single-use',
    );
    await pact.login({ identifier: 'ada@example.dev', password: 'newpass456' });
    const expired = await pact.requestPasswordReset('ada@example.dev');
    const rec = store.resets.get(await sha256(expired!.token))!;
    store.resets.set(rec.id, {
      ...rec,
      expiresAt: new Date(Date.now() - 1000),
    });
    asserts.assertFalse(await pact.resetPassword(expired!.token, 'x'));
  });

  it('should use the session cache as the store in cache-only mode', async () => {
    const cacheOnly = Pact.create({
      ...BASE,
      name: 'login-cache-only',
      hooks: { getUser: store.hooks.getUser },
      options: { cache: { ttl: { session: 5 } } },
    });
    const result = await cacheOnly.login({
      identifier: 'ada@example.dev',
      password: 'newpass456',
    });
    const id = await sha256(result.session.token);
    const engine = Cacher.getInstance('login-cache-only__session');
    asserts.assert(await engine?.has(id));
    await cacheOnly.logout(result.session.token);
    asserts.assertFalse(await engine?.has(id));
  });

  it('should throw MISSING_HOOK when no session store exists at all', async () => {
    const storeless = Pact.create({
      ...BASE,
      hooks: { getUser: store.hooks.getUser },
    });
    await expectCode(
      storeless.login({
        identifier: 'ada@example.dev',
        password: 'newpass456',
      }),
      'MISSING_HOOK',
    );
  });
});

// =============================================================================
// The credential seam (verifyCredentials / createSession)
// =============================================================================

describe('Pact credential seam', () => {
  const store = makeStore();
  store.seed('ada', 'ada@example.dev');
  store.seed('mia', 'mia@example.dev', { mfaSecret: 'JBSWY3DPEHPK3PXPJBSW' });
  store.seed('sam', 'sam@example.dev', { status: 'LOCKED' });
  store.keys.set('k1', {
    id: 'k1',
    status: 'ACTIVE',
    secret: 's1',
    grants: serializeGrants({ Post: 1n }),
  });
  const events: { event: string; detail: unknown[] }[] = [];
  const pact = Pact.create({
    ...BASE,
    name: 'seam-check',
    hooks: { getUser: store.hooks.getUser, getApiKey: store.hooks.getApiKey },
    options: { cache: { ttl: { session: 5 } } },
  });
  pact.on('login', (principal, method) => {
    events.push({ event: 'login', detail: [principal.id, method] });
  });
  pact.on('loginFailed', (identifier, code) => {
    events.push({ event: 'loginFailed', detail: [identifier, code] });
  });

  it('should prove identity without minting and flag MFA enrollment', async () => {
    const plain = await pact.verifyCredentials('ada@example.dev', 'secret123');
    asserts.assertFalse(plain.mfaRequired);
    asserts.assertStrictEquals(
      typeof plain.principal.hasPermission,
      'function',
    );
    asserts.assert(await plain.principal.hasPermission('Post', 'READ'));
    const mfa = await pact.verifyCredentials('mia@example.dev', 'secret123');
    asserts.assert(mfa.mfaRequired);
  });

  it('should keep login failure semantics and emit the audit events', async () => {
    events.length = 0;
    await expectCode(
      pact.verifyCredentials('ada@example.dev', 'wrong'),
      'INVALID_CREDENTIALS',
    );
    await expectCode(
      pact.verifyCredentials('sam@example.dev', 'secret123'),
      'NOT_ACTIVE',
    );
    const failed = events.filter((e) => e.event === 'loginFailed');
    asserts.assertStrictEquals(failed.length, 2);
    asserts.assertStrictEquals(failed[0]!.detail[1], 'INVALID_CREDENTIALS');
    asserts.assertStrictEquals(failed[1]!.detail[1], 'NOT_ACTIVE');
  });

  it('should mint a working session by id with metadata and event label', async () => {
    events.length = 0;
    const result = await pact.createSession('ada', {
      method: 'MAGIC_LINK',
      metadata: { device: 'probe' },
    });
    const ctx = await pact.authenticate({
      scheme: 'BEARER',
      token: result.session.token,
    });
    asserts.assertStrictEquals(ctx.principal.id, 'ada');
    const engine = Cacher.getInstance('seam-check__session');
    const raw = JSON.stringify(
      await engine?.get(await sha256(result.session.token)),
    );
    asserts.assertStringIncludes(raw, '"device"');
    asserts.assertStringIncludes(raw, '"probe"');
    const login = events.find((e) => e.event === 'login');
    asserts.assertEquals(login?.detail, ['ada', 'MAGIC_LINK']);
  });

  it('should refuse unknown ids, API keys, and inactive users', async () => {
    await expectCode(pact.createSession('nobody'), 'INVALID_CREDENTIALS');
    await expectCode(pact.createSession('k1'), 'INVALID_CREDENTIALS');
    await expectCode(pact.createSession('sam'), 'INVALID_CREDENTIALS');
  });

  it('should compose the MFA-gated flow end to end', async () => {
    const { principal, mfaRequired } = await pact.verifyCredentials(
      'mia@example.dev',
      'secret123',
    );
    asserts.assert(mfaRequired);
    const result = await pact.createSession(principal.id, { method: 'MFA' });
    const ctx = await pact.authenticate({
      scheme: 'BEARER',
      token: result.session.token,
    });
    asserts.assertStrictEquals(ctx.principal.id, 'mia');
  });
});

// =============================================================================
// Authenticate schemes
// =============================================================================

describe('Pact authenticate', () => {
  const store = makeStore();
  store.seed('va1', 'val@example.dev');
  store.seed('va2', 'valpending@example.dev', { status: 'PENDING' });
  const pact = Pact.create({ ...BASE, hooks: store.hooks });

  it('should validate a bearer session into the envelope', async () => {
    const { session } = await pact.login({
      identifier: 'val@example.dev',
      password: 'secret123',
    });
    const ctx = await pact.authenticate({
      scheme: 'BEARER',
      token: session.token,
    });
    asserts.assertStrictEquals(ctx.via, 'SESSION');
    asserts.assertStrictEquals(ctx.principal.id, 'va1');
    asserts.assertStrictEquals(ctx.sessionId, await sha256(session.token));
    await expectCode(
      pact.authenticate({ scheme: 'BEARER', token: 'pact_st_garbage' }),
      'INVALID_CREDENTIALS',
    );
  });

  it('should expire a stale session with best-effort cleanup', async () => {
    const { session } = await pact.login({
      identifier: 'val@example.dev',
      password: 'secret123',
    });
    const id = await sha256(session.token);
    store.sessions.set(id, {
      ...store.sessions.get(id)!,
      expiresAt: new Date(Date.now() - 1),
    });
    await expectCode(
      pact.authenticate({ scheme: 'BEARER', token: session.token }),
      'SESSION_EXPIRED',
    );
    asserts.assertFalse(store.sessions.has(id));
  });

  it('should verify BASIC per request without minting', async () => {
    const before = store.sessions.size;
    const ctx = await pact.authenticate({
      scheme: 'BASIC',
      identifier: 'val@example.dev',
      password: 'secret123',
    });
    asserts.assertStrictEquals(ctx.via, 'BASIC');
    asserts.assertStrictEquals(ctx.sessionId, undefined);
    asserts.assertStrictEquals(store.sessions.size, before);
    await expectCode(
      pact.authenticate({
        scheme: 'BASIC',
        identifier: 'val@example.dev',
        password: 'nope',
      }),
      'INVALID_CREDENTIALS',
    );
    await expectCode(
      pact.authenticate({
        scheme: 'BASIC',
        identifier: 'valpending@example.dev',
        password: 'secret123',
      }),
      'NOT_ACTIVE',
    );
  });

  it('should verify APIKEY and HMAC against the stored raw secret', async () => {
    const pair = await pact.issueApiKey({
      userId: 'va1',
      grants: { Post: 1n },
    });
    const ctx = await pact.authenticate({
      scheme: 'APIKEY',
      keyId: pair.key,
      secret: pair.secret,
    });
    asserts.assertStrictEquals(ctx.principal.kind, 'APIKEY');
    asserts.assertStrictEquals(
      ctx.principal.kind === 'APIKEY' ? ctx.principal.userId : undefined,
      'va1',
    );
    await expectCode(
      pact.authenticate({ scheme: 'APIKEY', keyId: pair.key, secret: 'wrong' }),
      'INVALID_CREDENTIALS',
    );
    const payload = 'POST /billing 1725450000 {"amount":1}';
    const signature = await signHMAC(payload, pair.secret);
    const hctx = await pact.authenticate({
      scheme: 'HMAC',
      keyId: pair.key,
      signature,
      payload,
    });
    asserts.assertStrictEquals(hctx.via, 'HMAC');
    await expectCode(
      pact.authenticate({
        scheme: 'HMAC',
        keyId: pair.key,
        signature,
        payload: payload + 'tampered',
      }),
      'INVALID_CREDENTIALS',
    );
    await expectCode(
      pact.authenticate({
        scheme: 'HMAC',
        keyId: pair.key,
        signature: 'zz-not-hex',
        payload,
      }),
      'INVALID_CREDENTIALS',
    );
    // A status flip surfaces post-verification.
    store.keys.set(pair.key, {
      ...store.keys.get(pair.key)!,
      status: 'REVOKED',
    });
    await expectCode(
      pact.authenticate({
        scheme: 'APIKEY',
        keyId: pair.key,
        secret: pair.secret,
      }),
      'NOT_ACTIVE',
    );
  });

  it('should collapse junk credentials to 401s, never TypeErrors', async () => {
    const cases = [
      null,
      { scheme: 'MAGIC' },
      { scheme: 'BEARER', token: 123 },
      { scheme: 'APIKEY', keyId: 'k' },
      { scheme: 'APIKEY', keyId: 'k', secret: '' },
      { scheme: 'HMAC', keyId: 'k', signature: 'ab', payload: '' },
    ];
    for (const credential of cases) {
      await expectCode(
        // deno-lint-ignore no-explicit-any
        pact.authenticate(credential as any),
        'INVALID_CREDENTIALS',
      );
    }
  });
});

// =============================================================================
// JWT strategy and refresh rotation
// =============================================================================

describe('Pact JWT and refresh', () => {
  const store = makeStore();
  store.seed('rf1', 'rf@example.dev');
  const pact = Pact.create({
    ...BASE,
    hooks: store.hooks,
    options: {
      session: {
        ttl: 60,
        strategy: 'JWT',
        secret: 'unit-test-signing-secret-32-chars-ok',
        refresh: { ttl: 60, grace: 30 },
      },
    },
  });

  it('should mint a JWT pair and pin tokens to their use claim', async () => {
    const result = await pact.login({
      identifier: 'rf@example.dev',
      password: 'secret123',
    });
    asserts.assertExists(result.session.refreshToken);
    const ctx = await pact.authenticate({
      scheme: 'BEARER',
      token: result.session.token,
    });
    asserts.assertStrictEquals(ctx.principal.id, 'rf1');
    await expectCode(
      pact.authenticate({
        scheme: 'BEARER',
        token: result.session.refreshToken,
      }),
      'INVALID_CREDENTIALS',
    );
    await expectCode(pact.refresh(result.session.token), 'INVALID_CREDENTIALS');
  });

  it('should rotate on refresh, absorb races in grace, kill the family on reuse', async () => {
    const login = await pact.login({
      identifier: 'rf@example.dev',
      password: 'secret123',
    });
    const r0 = login.session.refreshToken!;
    const rot1 = await pact.refresh(r0);
    const grace = await pact.refresh(r0); // previous generation, in grace
    asserts.assertExists(grace.session.refreshToken);
    await pact.refresh(rot1.session.refreshToken!);
    let reused = false;
    pact.on('refreshReused', () => {
      reused = true;
    });
    await expectCode(pact.refresh(r0), 'REFRESH_REUSED');
    await new Promise((resolve) => setTimeout(resolve, 10));
    asserts.assert(reused, 'refreshReused event must fire');
    await expectCode(
      pact.refresh(grace.session.refreshToken),
      'INVALID_CREDENTIALS',
    );
    await expectCode(
      pact.authenticate({ scheme: 'BEARER', token: login.session.token }),
      'INVALID_CREDENTIALS',
    );
  });

  it('should reject refresh outside the JWT strategy', async () => {
    const opaque = Pact.create({ ...BASE, hooks: { getUser: () => null } });
    await expectCode(opaque.refresh('anything'), 'INVALID_OPTION');
  });

  it('should require a secret for the JWT strategy at construction', () => {
    expectThrowCode(
      () =>
        Pact.create({
          ...BASE,
          options: { session: { strategy: 'JWT' } },
        }),
      'INVALID_OPTION',
    );
  });
});

// =============================================================================
// Events and MFA
// =============================================================================

describe('Pact events and MFA', () => {
  const store = makeStore();
  const events: unknown[][] = [];
  const record = (name: string) => (...args: unknown[]) => {
    events.push([name, ...args]);
  };
  const pact = Pact.create({
    ...BASE,
    hooks: { getUser: store.hooks.getUser },
    options: {
      // Listener registration via the option-key form.
      _onloginFailed: record('loginFailed'),
      cache: { ttl: { session: 5 } },
    },
  });
  pact.on('login', record('login'));
  pact.on('logout', record('logout'));
  pact.on('authenticateFailed', record('authenticateFailed'));

  it('should fire events across the auth lifecycle', async () => {
    store.seed('ev1', 'eve@example.dev');
    const { principal, session } = await pact.login({
      identifier: 'eve@example.dev',
      password: 'secret123',
    });
    await pact.logout(session.token);
    await expectCode(
      pact.login({ identifier: 'eve@example.dev', password: 'nope' }),
      'INVALID_CREDENTIALS',
    );
    await expectCode(
      pact.authenticate({ scheme: 'BEARER', token: 'pact_st_junk' }),
      'INVALID_CREDENTIALS',
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    const login = events.find((e) => e[0] === 'login');
    asserts.assertStrictEquals((login?.[1] as { id: string }).id, principal.id);
    asserts.assertStrictEquals(login?.[2], 'PASSWORD');
    asserts.assertExists(events.find((e) => e[0] === 'logout'));
    const failed = events.find((e) => e[0] === 'loginFailed');
    asserts.assertEquals(failed?.slice(1), [
      'eve@example.dev',
      'INVALID_CREDENTIALS',
    ]);
    const authFailed = events.find((e) => e[0] === 'authenticateFailed');
    asserts.assertEquals(authFailed?.slice(1), [
      'BEARER',
      'INVALID_CREDENTIALS',
    ]);
  });

  it('should verify TOTP against the enrolled seed only', async () => {
    const seed = pact.generateMFASecret();
    store.seed('ev2', 'mfa@example.dev', { mfaSecret: seed });
    store.seed('ev3', 'nomfa@example.dev');
    const code = await generateTOTP(seed);
    asserts.assert(await pact.verifyMFA('ev2', code));
    const wrong = code === '123456' ? '654321' : '123456';
    asserts.assertFalse(await pact.verifyMFA('ev2', wrong));
    asserts.assertFalse(await pact.verifyMFA('ev3', code), 'unenrolled');
    asserts.assertFalse(await pact.verifyMFA('ghost', code), 'unknown user');
  });

  it('should honor the boolean contract for a corrupt MFA seed', async () => {
    store.seed('ev4', 'badseed@example.dev', { mfaSecret: 'short' });
    asserts.assertFalse(await pact.verifyMFA('ev4', '123456'));
  });

  it('should build an otpauth enrollment URL', () => {
    const seed = pact.generateMFASecret();
    const url = pact.generateMFAAuthURL(seed, 'mfa@example.dev', 'PactApp');
    asserts.assert(url.startsWith('otpauth://totp/'));
    asserts.assertStringIncludes(url, seed);
  });
});

// =============================================================================
// Content signing
// =============================================================================

describe('Pact content signing', () => {
  it('should round-trip with a key derived from the session secret', async () => {
    const SECRET = 'content-signing-secret-32-chars-min!!';
    const signer = Pact.create({
      ...BASE,
      options: { session: { strategy: 'JWT', secret: SECRET } },
    });
    const sig = await signer.sign('payload-1');
    asserts.assert(await signer.verifySignature('payload-1', sig));
    asserts.assertFalse(await signer.verifySignature('payload-2', sig));
    asserts.assertFalse(
      await signer.verifySignature('payload-1', 'zz-not-hex'),
      'garbage signatures are false, not thrown',
    );
    // Domain separation from the raw session secret.
    asserts.assertNotStrictEquals(await signHMAC('payload-1', SECRET), sig);
  });

  it('should sign with an explicit key and demand one otherwise', async () => {
    const bare = Pact.create({ ...BASE });
    const sig = await bare.sign('x', 'explicit-key');
    asserts.assert(await bare.verifySignature('x', sig, 'explicit-key'));
    await expectCode(bare.sign('x'), 'INVALID_OPTION');
  });
});
