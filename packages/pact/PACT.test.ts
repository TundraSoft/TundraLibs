import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat';
import { generateRSAKeyPair } from '@tundralibs/crypt';
import { issueJWT } from '@tundralibs/crypt/JWT';
import { PACT } from './PACT.ts';
import { Groups } from './Groups.ts';
import { PROVIDERS } from './oauth/providers.ts';
import { combineGrants, deserializeGrants, serializeGrants } from './grants.ts';
import {
  PactDefinitionError,
  PactDeniedError,
  PactOAuthError,
  PactTokenError,
} from './errors/mod.ts';
import type { PACTEvents, PACTGrants } from './types/mod.ts';

/** Minimal cross-runtime fetch stub with call recording. */
type SeenInit = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};
function mockFetch(
  routes: Array<[string, (url: string, init?: SeenInit) => Response]>,
) {
  const seen: Array<{ url: string; init?: SeenInit }> = [];
  const fn = ((input: unknown, init?: SeenInit) => {
    const url = String(input);
    seen.push({ url, init });
    for (const [prefix, respond] of routes) {
      if (url.startsWith(prefix)) return Promise.resolve(respond(url, init));
    }
    return Promise.resolve(new Response('not found', { status: 404 }));
  }) as unknown as typeof globalThis.fetch;
  return { fn, seen };
}
const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
function setFetch(pact: unknown, fn: typeof globalThis.fetch): void {
  (pact as { _fetch: typeof globalThis.fetch })._fetch = fn;
}

const BITS = { READ: 1n, EDIT: 2n, DELETE: 4n } as const;
// ≥ 64 UTF-8 bytes so it satisfies every HS* minimum (RFC 7518 §3.2:
// HS256 ≥ 32 B, HS384 ≥ 48 B, HS512 ≥ 64 B) — the suite reuses it for HS512.
const SECRET =
  'test-secret-at-least-512-bits-long-for-the-pact-jwt-test-suite-okay';

describe('pact.PACT', () => {
  it('constructs via Options; config is readable through getOption', () => {
    const pact = new PACT({ bits: BITS, modules: { Post: ['READ', 'EDIT'] } });
    asserts.assertEquals(pact.getOption('bits').READ, 1n);
    asserts.assertEquals(pact.permissions.modules, ['Post']);
  });

  it('throws MISSING_OPTION when bits are omitted', () => {
    const err = asserts.assertThrows(
      // deno-lint-ignore no-explicit-any
      () => new PACT({} as any),
    );
    asserts.assertEquals((err as { code?: string }).code, 'MISSING_OPTION');
  });

  it('delegates authZ to the Permissions engine', () => {
    const pact = new PACT({
      bits: BITS,
      modules: { Post: ['READ', 'EDIT', 'DELETE'] },
    });
    const grants = { Post: 3n }; // READ|EDIT
    asserts.assert(pact.hasPermission('Post', 'READ', grants));
    asserts.assert(pact.can('Post', 'EDIT', grants));
    asserts.assertFalse(pact.can('Post', 'DELETE', grants));
    asserts.assert(pact.canAny('Post', ['DELETE', 'READ'], grants));
    asserts.assert(pact.canAll('Post', ['READ', 'EDIT'], grants));
    asserts.assertEquals(pact.grant(0n, 'READ', 'DELETE'), 5n);
    asserts.assertEquals(pact.toNames('Post', 3n), ['READ', 'EDIT']);
  });

  it('assert emits granted/denied (via _on handlers) and throws on denial', () => {
    const events: string[] = [];
    const pact = new PACT({
      bits: BITS,
      modules: { Post: ['READ', 'EDIT', 'DELETE'] },
      _ongranted: (m, p) => events.push(`granted:${m}:${String(p)}`),
      _ondenied: (m, p) => events.push(`denied:${m}:${String(p)}`),
    });
    pact.assert('Post', 'READ', { Post: 1n });
    asserts.assertThrows(
      () => pact.assert('Post', 'DELETE', { Post: 1n }),
      PactDeniedError,
    );
    asserts.assertEquals(events, ['granted:Post:READ', 'denied:Post:DELETE']);
  });

  it('supports .on() subscription', () => {
    const seen: string[] = [];
    const pact = new PACT({ bits: BITS });
    pact.on('denied', (m, p) => seen.push(`${m}:${String(p)}`));
    asserts.assertThrows(() => pact.assert('X', 'READ', {}), PactDeniedError);
    asserts.assertEquals(seen, ['X:READ']);
  });
});

describe('pact.PACT tokens', () => {
  it('generateJWT → verifyJWT round-trip stamps iat/exp/iss/aud + events', async () => {
    const events: string[] = [];
    const pact = new PACT({
      bits: BITS,
      secret: SECRET,
      issuer: 'pact-test',
      audience: 'api',
      expiry: 600,
      _onissue: () => events.push('issue'),
      _onverify: () => events.push('verify'),
    });
    const token = await pact.generateJWT({ sub: 'user-1', role: 'admin' });
    const claims = await pact.verifyJWT(token);
    asserts.assertEquals(claims.sub, 'user-1');
    asserts.assertEquals(claims.role, 'admin');
    asserts.assertEquals(claims.iss, 'pact-test');
    asserts.assertEquals(claims.aud, 'api');
    asserts.assert(typeof claims.iat === 'number');
    asserts.assertEquals(claims.exp, claims.iat! + 600);
    asserts.assertEquals(events, ['issue', 'verify']);
  });

  it('verifyJWT rejects a wrong-secret token and emits verifyFailed', async () => {
    const failures: Error[] = [];
    const pact = new PACT({
      bits: BITS,
      secret: SECRET,
      _onverifyFailed: (e) => failures.push(e),
    });
    const other = new PACT({ bits: BITS, secret: `${SECRET}-other` });
    const token = await other.generateJWT({ sub: 'x' });
    await asserts.assertRejects(() => pact.verifyJWT(token));
    asserts.assertEquals(failures.length, 1);
  });

  it('pins the algorithm: HS512-issued token fails on an HS256 instance', async () => {
    const hs512 = new PACT({ bits: BITS, secret: SECRET, algorithm: 'HS512' });
    const hs256 = new PACT({ bits: BITS, secret: SECRET });
    const token = await hs512.generateJWT({ sub: 'x' });
    await asserts.assertRejects(() => hs256.verifyJWT(token));
  });

  it('isRevoked seam vetoes a signature-valid token (TOKEN_REVOKED + events)', async () => {
    const events: string[] = [];
    const pact = new PACT({
      bits: BITS,
      secret: SECRET,
      isRevoked: (claims) => claims.jti === 'blocked',
      _onrevoked: () => events.push('revoked'),
      _onverifyFailed: () => events.push('verifyFailed'),
    });
    const ok = await pact.generateJWT({ sub: 'x', jti: 'fine' });
    asserts.assertEquals((await pact.verifyJWT(ok)).jti, 'fine');
    const bad = await pact.generateJWT({ sub: 'x', jti: 'blocked' });
    const err = await asserts.assertRejects(
      () => pact.verifyJWT(bad),
      PactTokenError,
    );
    asserts.assertEquals(err.code, 'TOKEN_REVOKED');
    asserts.assertEquals(events, ['revoked', 'verifyFailed']);
  });

  it('refreshJWT re-issues (claims preserved); revoked tokens cannot refresh', async () => {
    const seen: string[] = [];
    const pact = new PACT({
      bits: BITS,
      secret: SECRET,
      isRevoked: (c) => c.jti === 'blocked',
      _onrefresh: () => seen.push('refresh'),
    });
    const token = await pact.generateJWT({
      sub: 'u1',
      jti: 'fine',
      role: 'editor',
      tenant: 42,
    });
    const fresh = await pact.refreshJWT(token);
    const claims = await pact.verifyJWT(fresh);
    // Every claim must survive the refresh, not just `sub`. [L11]
    asserts.assertEquals(claims.sub, 'u1');
    asserts.assertEquals(claims.jti, 'fine');
    asserts.assertEquals(claims.role, 'editor');
    asserts.assertEquals(claims.tenant, 42);
    asserts.assertEquals(seen, ['refresh']);
    const blocked = await pact.generateJWT({ sub: 'u1', jti: 'blocked' });
    await asserts.assertRejects(() => pact.refreshJWT(blocked), PactTokenError);
  });

  it('decodeJWT returns header+payload without verification', async () => {
    const pact = new PACT({ bits: BITS, secret: SECRET, keyId: 'k1' });
    const token = await pact.generateJWT({ sub: 'u9' });
    const { header, payload } = pact.decodeJWT(token);
    asserts.assertEquals(header.alg, 'HS256');
    asserts.assertEquals(header.kid, 'k1');
    asserts.assertEquals(payload.sub, 'u9');
  });

  it('sign/verify HMAC round-trip; tamper fails; explicit key overrides', async () => {
    const pact = new PACT({ bits: BITS, secret: SECRET });
    const sig = await pact.sign('payload-body');
    asserts.assert(await pact.verify('payload-body', sig));
    asserts.assertFalse(await pact.verify('payload-tampered', sig));
    const sig2 = await pact.sign('data', 'other-key');
    asserts.assert(await pact.verify('data', sig2, 'other-key'));
    asserts.assertFalse(await pact.verify('data', sig2));
  });

  it('token ops without secret throw MISSING_OPTION; authZ still works', async () => {
    const pact = new PACT({ bits: BITS });
    await asserts.assertRejects(
      () => pact.generateJWT({ sub: 'x' }),
      PactDefinitionError,
    );
    await asserts.assertRejects(() => pact.sign('x'), PactDefinitionError);
    asserts.assert(pact.can('M', 'READ', { M: 1n }));
  });

  it('secret shape must match the algorithm family', () => {
    asserts.assertThrows(
      () =>
        new PACT({ bits: BITS, secret: { privateKey: 'a', publicKey: 'b' } }),
      PactDefinitionError,
    );
    asserts.assertThrows(
      () => new PACT({ bits: BITS, algorithm: 'RS256', secret: SECRET }),
      PactDefinitionError,
    );
  });
});

describe('pact.grants', () => {
  it('serialize/deserialize round-trip (BigInt-safe past 53 bits)', () => {
    const grants = { Post: 6n, Billing: 1n << 70n };
    const wire = serializeGrants(grants);
    asserts.assertEquals(wire, {
      Post: '6',
      Billing: (1n << 70n).toString(),
    });
    asserts.assertEquals(deserializeGrants(wire), grants);
  });

  it('deserialize accepts number/bigint; rejects garbage and negatives', () => {
    asserts.assertEquals(deserializeGrants({ A: 3, B: 4n }), { A: 3n, B: 4n });
    const err = asserts.assertThrows(
      () => deserializeGrants({ A: 'not-a-number' }),
      PactDefinitionError,
    );
    asserts.assertEquals(err.code, 'INVALID_GRANTS');
    asserts.assertThrows(
      () => deserializeGrants({ A: '-5' }),
      PactDefinitionError,
    );
    // a negative BigInt passes the type guard but is caught by the sign check
    asserts.assertThrows(
      () => deserializeGrants({ A: -5n }),
      PactDefinitionError,
    );
  });

  it('deserialize rejects a negative number (the `number < 0` branch)', () => {
    const err = asserts.assertThrows(
      () => deserializeGrants({ A: -5 }),
      PactDefinitionError,
    );
    asserts.assertEquals(err.code, 'INVALID_GRANTS');
    // integer-but-negative is the branch under test; -0 stays a valid 0n
    asserts.assertEquals(deserializeGrants({ B: -0 }), { B: 0n });
  });

  it('combineGrants ORs module masks and skips undefined sets', () => {
    asserts.assertEquals(
      combineGrants({ P: 1n }, undefined, { P: 2n, Q: 4n }),
      { P: 3n, Q: 4n },
    );
  });
});

describe('pact.PACT groups', () => {
  const storeResolver = (store: Record<string, PACTGrants>) => {
    const calls: string[][] = [];
    const resolver = (ids: string[]): Promise<Record<string, PACTGrants>> => {
      calls.push([...ids]);
      return Promise.resolve(
        Object.fromEntries(ids.map((id) => [id, store[id] ?? {}])),
      );
    };
    return { resolver, calls };
  };

  it('resolves lazily, caches, and ORs across groups + direct grants', async () => {
    const { resolver, calls } = storeResolver({
      readers: { Post: 1n },
      editors: { Post: 2n },
    });
    const pact = new PACT({ bits: BITS, groupResolver: resolver });
    asserts.assert(
      await pact.hasPermissionForGroups('Post', 'READ', ['readers', 'editors']),
    );
    asserts.assert(
      await pact.hasPermissionForGroups('Post', 'EDIT', ['readers', 'editors']),
    );
    asserts.assertFalse(
      await pact.hasPermissionForGroups('Post', 'EDIT', ['readers']),
    );
    // unknown group defaults to no grants
    asserts.assertFalse(
      await pact.hasPermissionForGroups('Post', 'DELETE', ['readers', 'ghost']),
    );
    // direct grants OR in
    asserts.assert(
      await pact.hasPermissionForGroups('Post', 'DELETE', ['readers'], {
        Post: 4n,
      }),
    );
    // cached: readers/editors/ghost fetched exactly once each
    const fetched = calls.flat().sort();
    asserts.assertEquals(fetched, ['editors', 'ghost', 'readers']);
  });

  it('grantsForGroups returns the combined module → mask map', async () => {
    const { resolver } = storeResolver({
      readers: { Post: 1n },
      editors: { Post: 2n },
    });
    const pact = new PACT({ bits: BITS, groupResolver: resolver });
    asserts.assertEquals(
      await pact.grantsForGroups(['readers', 'editors'], { Billing: 8n }),
      { Post: 3n, Billing: 8n },
    );
  });

  it('syncGroups refreshes cached grants + emits sync', async () => {
    const store: Record<string, PACTGrants> = { g1: { Post: 3n } };
    const { resolver } = storeResolver(store);
    const synced: string[][] = [];
    const pact = new PACT({
      bits: BITS,
      groupResolver: resolver,
      _onsync: (ids) => synced.push(ids),
    });
    asserts.assert(await pact.hasPermissionForGroups('Post', 'EDIT', ['g1']));
    store.g1 = { Post: 1n }; // upstream revokes EDIT…
    asserts.assert(await pact.hasPermissionForGroups('Post', 'EDIT', ['g1'])); // …still cached
    await pact.syncGroups();
    asserts.assertFalse(
      await pact.hasPermissionForGroups('Post', 'EDIT', ['g1']),
    );
    asserts.assertEquals(synced, [['g1']]);
  });

  it('group ops without a resolver throw MISSING_OPTION', async () => {
    const pact = new PACT({ bits: BITS });
    await asserts.assertRejects(
      () => pact.hasPermissionForGroups('Post', 'READ', ['g1']),
      PactDefinitionError,
    );
    await asserts.assertRejects(() => pact.syncGroups(), PactDefinitionError);
  });

  it('syncInterval re-syncs cached groups until stopSync()', async () => {
    const { resolver, calls } = storeResolver({ g1: { Post: 1n } });
    const pact = new PACT({
      bits: BITS,
      groupResolver: resolver,
      syncInterval: 20,
    });
    await pact.hasPermissionForGroups('Post', 'READ', ['g1']); // seed cache
    const t0 = Date.now();
    while (calls.length < 2 && Date.now() - t0 < 2000) {
      await new Promise((r) => setTimeout(r, 10));
    }
    pact.stopSync();
    asserts.assert(calls.length >= 2, 'periodic sync should re-call resolver');
  });
});

describe('pact.PACT login', () => {
  const strategies = {
    password: (creds: unknown) => {
      const c = creds as { user: string; pass: string };
      if (c.pass !== 'hunter2') return null;
      return {
        principal: { id: `u-${c.user}` },
        isNew: c.user === 'newbie',
      };
    },
    plain: () => ({ id: 'plain-1' }),
    broken: () => {
      throw new Error('db down');
    },
  };

  it('runs a strategy: success, isNew wrapper, autoIssue token + events', async () => {
    const events: string[] = [];
    const pact = new PACT({
      bits: BITS,
      secret: SECRET,
      autoIssue: true,
      strategies,
      _onlogin: (s, p, isNew) => events.push(`login:${s}:${p.id}:${isNew}`),
      _onloginFailed: (s, e) => events.push(`failed:${s}:${e?.message ?? ''}`),
    });
    const ok = await pact.login('password', { user: 'alice', pass: 'hunter2' });
    asserts.assert(ok !== null);
    asserts.assertEquals(ok.principal.id, 'u-alice');
    asserts.assertFalse(ok.isNew);
    asserts.assert(typeof ok.token === 'string');
    asserts.assertEquals((await pact.verifyJWT(ok.token!)).sub, 'u-alice');

    const fresh = await pact.login('password', {
      user: 'newbie',
      pass: 'hunter2',
    });
    asserts.assert(fresh !== null && fresh.isNew);

    const bad = await pact.login('password', { user: 'alice', pass: 'nope' });
    asserts.assertEquals(bad, null);
    asserts.assertEquals(events, [
      'login:password:u-alice:false',
      'login:password:u-newbie:true',
      'failed:password:',
    ]);
  });

  it('plain-principal outcome; no token without autoIssue', async () => {
    const pact = new PACT({ bits: BITS, strategies });
    const result = await pact.login('plain', {});
    asserts.assert(result !== null);
    asserts.assertEquals(result.principal.id, 'plain-1');
    asserts.assertFalse(result.isNew);
    asserts.assertEquals(result.token, undefined);
  });

  it('strategy throw → loginFailed(error) + rethrow', async () => {
    const failures: Array<string> = [];
    const pact = new PACT({
      bits: BITS,
      strategies,
      _onloginFailed: (_s, e) => failures.push(e?.message ?? 'none'),
    });
    await asserts.assertRejects(
      () => pact.login('broken', {}),
      Error,
      'db down',
    );
    asserts.assertEquals(failures, ['db down']);
  });

  it('unknown strategy name throws UNKNOWN_STRATEGY', async () => {
    const pact = new PACT({ bits: BITS });
    await asserts.assertRejects(
      () => pact.login('nope', {}),
      PactDefinitionError,
    );
  });
});

/**
 * Apple id_token fixtures: a real RSA signer plus the JWKS document that
 * publishes it, so the Apple path can be exercised end-to-end (offline).
 * Generated once — RSA keygen is the slow part.
 */
let appleKeysCache:
  | Promise<{ privatePem: string; jwks: { keys: unknown[] } }>
  | undefined;
function appleKeys() {
  appleKeysCache ??= (async () => {
    const keys = await generateRSAKeyPair({
      algorithm: 'RSA-PSS',
      keySize: 2048,
      hashAlgorithm: 'SHA-256',
      format: 'PEM',
      extractable: true,
    });
    const jwk = await crypto.subtle.exportKey('jwk', keys.publicKey) as Record<
      string,
      unknown
    >;
    return {
      privatePem: keys.privateKeyExported as string,
      jwks: {
        keys: [{
          kty: jwk.kty,
          n: jwk.n,
          e: jwk.e,
          kid: 'apple-key-1',
          use: 'sig',
          alg: 'RS256',
        }],
      },
    };
  })();
  return appleKeysCache;
}

/** A well-formed Apple id_token signed by the fixture key. */
async function appleIdToken(
  extra: Record<string, unknown> = {},
): Promise<string> {
  const { privatePem } = await appleKeys();
  const now = Math.floor(Date.now() / 1000);
  return await issueJWT(
    'RS256',
    {
      iss: 'https://appleid.apple.com',
      aud: 'cid',
      sub: 'apple-1',
      iat: now,
      exp: now + 600,
      ...extra,
    },
    privatePem,
    'apple-key-1',
  );
}

const APPLE_CONFIG = {
  provider: 'apple' as const,
  clientId: 'cid',
  clientSecret: 'pre-minted-es256-jwt',
  redirectUri: 'https://app.example.com/cb',
};

describe('pact.PACT oauth', () => {
  const googleConfig = {
    provider: 'google' as const,
    clientId: 'cid',
    clientSecret: 'cs',
    redirectUri: 'https://app.example.com/cb',
  };

  it('getAuthorizationUrl: PKCE S256 + state + scopes + client params', async () => {
    const pact = new PACT({ bits: BITS, oauth: { google: googleConfig } });
    const { url, state, verifier } = await pact.getAuthorizationUrl('google');
    const u = new URL(url);
    asserts.assertEquals(
      `${u.origin}${u.pathname}`,
      'https://accounts.google.com/o/oauth2/v2/auth',
    );
    asserts.assertEquals(u.searchParams.get('response_type'), 'code');
    asserts.assertEquals(u.searchParams.get('client_id'), 'cid');
    asserts.assertEquals(
      u.searchParams.get('redirect_uri'),
      'https://app.example.com/cb',
    );
    asserts.assert(u.searchParams.get('scope')!.includes('openid'));
    asserts.assertEquals(u.searchParams.get('state'), state);
    asserts.assertEquals(u.searchParams.get('code_challenge_method'), 'S256');
    const challenge = u.searchParams.get('code_challenge')!;
    asserts.assert(challenge.length > 0 && challenge !== verifier);
    asserts.assertEquals(verifier.length, 64);
  });

  it('handleCallback: exchanges code (PKCE + secret) and normalizes profile', async () => {
    const pact = new PACT({ bits: BITS, oauth: { google: googleConfig } });
    const { fn, seen } = mockFetch([
      [
        'https://oauth2.googleapis.com/token',
        () => json({ access_token: 'AT', expires_in: 3600 }),
      ],
      [
        'https://openidconnect.googleapis.com/v1/userinfo',
        () =>
          json({
            sub: 'g-1',
            email: 'a@b.c',
            email_verified: true,
            name: 'Alice',
            picture: 'https://p.example/a.png',
          }),
      ],
    ]);
    setFetch(pact, fn);
    const profile = await pact.handleCallback('google', {
      code: 'CODE',
      verifier: 'VERIFIER',
    });
    asserts.assertEquals(profile.provider, 'google');
    asserts.assertEquals(profile.id, 'g-1');
    asserts.assertEquals(profile.email, 'a@b.c');
    asserts.assert(profile.emailVerified);
    asserts.assertEquals(profile.name, 'Alice');
    asserts.assertEquals(profile.tokens.accessToken, 'AT');
    asserts.assertEquals(profile.tokens.expiresIn, 3600);

    const token = seen.find((s) => s.url.includes('/token'))!;
    asserts.assertEquals(token.init?.method, 'POST');
    const body = token.init?.body ?? '';
    asserts.assert(body.includes('grant_type=authorization_code'));
    asserts.assert(body.includes('code=CODE'));
    asserts.assert(body.includes('code_verifier=VERIFIER'));
    asserts.assert(body.includes('client_secret=cs'));
    const userinfo = seen.find((s) => s.url.includes('/userinfo'))!;
    asserts.assertEquals(userinfo.init?.headers?.Authorization, 'Bearer AT');
  });

  it('state mismatch and failed exchange throw typed OAuth errors', async () => {
    const pact = new PACT({ bits: BITS, oauth: { google: googleConfig } });
    const mismatch = await asserts.assertRejects(
      () =>
        pact.handleCallback('google', {
          code: 'C',
          verifier: 'V',
          state: 'a',
          expectedState: 'b',
        }),
      PactOAuthError,
    );
    asserts.assertEquals(mismatch.code, 'OAUTH_STATE_MISMATCH');

    const { fn } = mockFetch([
      [
        'https://oauth2.googleapis.com/token',
        () => json({ error: 'bad_verification_code' }, 400),
      ],
    ]);
    setFetch(pact, fn);
    const failed = await asserts.assertRejects(
      () => pact.handleCallback('google', { code: 'C', verifier: 'V' }),
      PactOAuthError,
    );
    asserts.assertEquals(failed.code, 'OAUTH_EXCHANGE_FAILED');
  });

  it('apple derives the profile from the JWKS-verified id_token (no userinfo endpoint)', async () => {
    const idToken = await appleIdToken({
      email: 'x@y.z',
      email_verified: 'true',
    });
    const { jwks } = await appleKeys();
    const pact = new PACT({ bits: BITS, oauth: { apple: APPLE_CONFIG } });
    const { fn, seen } = mockFetch([
      [
        'https://appleid.apple.com/auth/token',
        () => json({ access_token: 'AT', id_token: idToken }),
      ],
      ['https://appleid.apple.com/auth/keys', () => json(jwks)],
    ]);
    setFetch(pact, fn);
    // via login(): apple acts as a strategy; default mapping applies
    const result = await pact.login('apple', { code: 'C', verifier: 'V' });
    asserts.assert(result !== null);
    asserts.assertEquals(result.principal.id, 'apple:apple-1');
    const profile = result.principal.profile as { emailVerified?: boolean };
    asserts.assert(profile.emailVerified);
    // the JWKS really was consulted — this is not a decode-only pass
    asserts.assertEquals(
      seen.filter((s) => s.url.includes('/auth/keys')).length,
      1,
    );
    // and the auth URL carries Apple's required response_mode
    const { url } = await pact.getAuthorizationUrl('apple');
    asserts.assertEquals(
      new URL(url).searchParams.get('response_mode'),
      'form_post',
    );
  });

  it('apple login REJECTS a tampered id_token even though it came from /token', async () => {
    const genuine = await appleIdToken();
    const { jwks } = await appleKeys();
    // A hostile token endpoint response: same signature, escalated subject.
    const [header, , signature] = genuine.split('.');
    const forgedPayload = btoa(
      JSON.stringify({
        iss: 'https://appleid.apple.com',
        aud: 'cid',
        sub: 'someone-elses-account',
        exp: Math.floor(Date.now() / 1000) + 600,
      }),
    ).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    const pact = new PACT({ bits: BITS, oauth: { apple: APPLE_CONFIG } });
    const { fn } = mockFetch([
      [
        'https://appleid.apple.com/auth/token',
        () =>
          json({
            access_token: 'AT',
            id_token: `${header}.${forgedPayload}.${signature}`,
          }),
      ],
      ['https://appleid.apple.com/auth/keys', () => json(jwks)],
    ]);
    setFetch(pact, fn);
    const err = await asserts.assertRejects(
      () => pact.login('apple', { code: 'C', verifier: 'V' }),
      PactOAuthError,
    );
    asserts.assertEquals(err.code, 'OAUTH_IDTOKEN_INVALID');
  });

  it('emits idTokenUnverified when the JWKS is unreachable (preferred policy)', async () => {
    const idToken = await appleIdToken();
    const downgrades: Array<[string, string]> = [];
    const pact = new PACT({
      bits: BITS,
      oauth: { apple: APPLE_CONFIG },
      _onidTokenUnverified: (provider, reason) =>
        downgrades.push([provider, reason]),
    });
    const { fn } = mockFetch([
      [
        'https://appleid.apple.com/auth/token',
        () => json({ access_token: 'AT', id_token: idToken }),
      ],
      ['https://appleid.apple.com/auth/keys', () => json({}, 503)],
    ]);
    setFetch(pact, fn);
    // Login still succeeds — availability is preferred over strictness — but
    // the downgrade is auditable rather than silent.
    const result = await pact.login('apple', { code: 'C', verifier: 'V' });
    asserts.assert(result !== null);
    asserts.assertEquals(result.principal.id, 'apple:apple-1');
    asserts.assertEquals(downgrades.length, 1);
    asserts.assertEquals(downgrades[0]![0], 'apple');
    asserts.assert(downgrades[0]![1].includes('503'));
  });

  it("idTokenVerification: 'required' turns a JWKS outage into a hard failure", async () => {
    const idToken = await appleIdToken();
    const pact = new PACT({
      bits: BITS,
      oauth: {
        apple: { ...APPLE_CONFIG, idTokenVerification: 'required' as const },
      },
    });
    const { fn } = mockFetch([
      [
        'https://appleid.apple.com/auth/token',
        () => json({ access_token: 'AT', id_token: idToken }),
      ],
      ['https://appleid.apple.com/auth/keys', () => json({}, 503)],
    ]);
    setFetch(pact, fn);
    const err = await asserts.assertRejects(
      () => pact.login('apple', { code: 'C', verifier: 'V' }),
      PactOAuthError,
    );
    asserts.assertEquals(err.code, 'OAUTH_JWKS_UNAVAILABLE');
  });

  it('oidc with no userinfo endpoint verifies the id_token via the discovered jwks_uri', async () => {
    const { privatePem, jwks } = await appleKeys();
    const now = Math.floor(Date.now() / 1000);
    const idToken = await issueJWT(
      'RS256',
      {
        iss: 'https://idp.example.com',
        aud: 'cid',
        sub: 'oidc-sub-1',
        iat: now,
        exp: now + 600,
      },
      privatePem,
      'apple-key-1',
    );

    const pact = new PACT({
      bits: BITS,
      oauth: {
        idp: {
          provider: 'oidc',
          issuer: 'https://idp.example.com',
          clientId: 'cid',
          redirectUri: 'https://app.example.com/cb',
        },
      },
    });
    const { fn, seen } = mockFetch([
      [
        'https://idp.example.com/.well-known/openid-configuration',
        () =>
          json({
            authorization_endpoint: 'https://idp.example.com/auth',
            token_endpoint: 'https://idp.example.com/token',
            jwks_uri: 'https://idp.example.com/jwks',
            // deliberately no userinfo_endpoint
          }),
      ],
      [
        'https://idp.example.com/token',
        () => json({ access_token: 'AT', id_token: idToken }),
      ],
      ['https://idp.example.com/jwks', () => json(jwks)],
    ]);
    setFetch(pact, fn);
    const profile = await pact.handleCallback('idp', {
      code: 'C',
      verifier: 'V',
    });
    asserts.assertEquals(profile.id, 'oidc-sub-1');
    asserts.assertEquals(
      seen.filter((s) => s.url.includes('/jwks')).length,
      1,
    );
  });

  it('oidc preset discovers endpoints once and caches them', async () => {
    const pact = new PACT({
      bits: BITS,
      oauth: {
        idp: {
          provider: 'oidc',
          issuer: 'https://idp.example.com',
          clientId: 'cid',
          redirectUri: 'https://app.example.com/cb',
        },
      },
    });
    const { fn, seen } = mockFetch([
      [
        'https://idp.example.com/.well-known/openid-configuration',
        () =>
          json({
            authorization_endpoint: 'https://idp.example.com/auth',
            token_endpoint: 'https://idp.example.com/token',
            userinfo_endpoint: 'https://idp.example.com/me',
          }),
      ],
      [
        'https://idp.example.com/token',
        () => json({ access_token: 'AT' }),
      ],
      [
        'https://idp.example.com/me',
        () => json({ sub: 'oidc-1', email: 'o@i.dc' }),
      ],
    ]);
    setFetch(pact, fn);
    const { url } = await pact.getAuthorizationUrl('idp');
    asserts.assert(url.startsWith('https://idp.example.com/auth?'));
    const profile = await pact.handleCallback('idp', {
      code: 'C',
      verifier: 'V',
    });
    asserts.assertEquals(profile.id, 'oidc-1');
    const discoveries = seen.filter((s) => s.url.includes('.well-known'));
    asserts.assertEquals(discoveries.length, 1);
  });

  it('oauth map hook drives find-or-create (isNew)', async () => {
    const pact = new PACT({
      bits: BITS,
      oauth: {
        google: {
          ...googleConfig,
          map: (profile) => ({
            principal: { id: `user-${profile.id}` },
            isNew: true,
          }),
        },
      },
    });
    const { fn } = mockFetch([
      [
        'https://oauth2.googleapis.com/token',
        () => json({ access_token: 'AT' }),
      ],
      [
        'https://openidconnect.googleapis.com/v1/userinfo',
        () => json({ sub: 'g-9' }),
      ],
    ]);
    setFetch(pact, fn);
    const result = await pact.login('google', { code: 'C', verifier: 'V' });
    asserts.assert(result !== null);
    asserts.assertEquals(result.principal.id, 'user-g-9');
    asserts.assert(result.isNew);
  });

  it('bad configs fail fast: unknown preset, oidc without issuer', () => {
    asserts.assertThrows(
      () =>
        new PACT({
          bits: BITS,
          oauth: {
            x: {
              provider: 'nope' as never,
              clientId: 'c',
              redirectUri: 'https://a/cb',
            },
          },
        }),
      PactDefinitionError,
    );
    asserts.assertThrows(
      () =>
        new PACT({
          bits: BITS,
          oauth: {
            x: {
              provider: 'oidc',
              clientId: 'c',
              redirectUri: 'https://a/cb',
            },
          },
        }),
      PactDefinitionError,
    );
  });
});

describe('pact.PACT api-keys', () => {
  it('generateAPIKey mints id/secret/secretHash; verifyAPIKey round-trips', async () => {
    const pact = new PACT({ bits: BITS });
    const key = await pact.generateAPIKey();
    asserts.assert(key.id.startsWith('pact_ak_'));
    asserts.assert(key.secret.startsWith('pact_sk_'));
    asserts.assertEquals(key.secretHash.length, 64); // SHA-256 hex
    asserts.assert(await pact.verifyAPIKey(key.secret, key.secretHash));
    asserts.assertFalse(
      await pact.verifyAPIKey(`${key.secret}x`, key.secretHash),
    );
  });

  it('honours prefix + lengths; generations are unique', async () => {
    const pact = new PACT({ bits: BITS });
    const a = await pact.generateAPIKey({
      prefix: 'acme',
      idLength: 8,
      secretLength: 40,
    });
    asserts.assert(a.id.startsWith('acme_ak_'));
    asserts.assertEquals(a.id.length, 'acme_ak_'.length + 8);
    asserts.assertEquals(a.secret.length, 'acme_sk_'.length + 40);
    const b = await pact.generateAPIKey({ prefix: 'acme' });
    asserts.assert(a.id !== b.id && a.secret !== b.secret);
  });
});

describe('pact.PACT review fixes', () => {
  it('H1: sign() cannot forge a JWT (domain-separated key)', async () => {
    const pact = new PACT({ bits: BITS, secret: SECRET });
    // Attacker controls the "content": a JWT signing input.
    const token = await pact.generateJWT({ sub: 'attacker' });
    const [header, payload] = token.split('.');
    const forgedSig = await pact.sign(`${header}.${payload}`);
    // Re-encode the hex HMAC to base64url and assemble a token.
    const bytes = (forgedSig.match(/../g) ?? []).map((h) => parseInt(h, 16));
    const b64 = btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const forged = `${header}.${payload}.${b64}`;
    await asserts.assertRejects(() => pact.verifyJWT(forged)); // rejected ✔
    // And the legitimately-issued token still verifies.
    asserts.assertEquals((await pact.verifyJWT(token)).sub, 'attacker');
  });

  it('M2: the secret never surfaces via getOption/getOptions', () => {
    const pact = new PACT({ bits: BITS, secret: SECRET, issuer: 'x' });
    asserts.assertEquals(
      (pact as unknown as { getOption(k: string): unknown }).getOption(
        'secret',
      ),
      undefined,
    );
    asserts.assertEquals(
      (pact.getOptions() as { secret?: unknown }).secret,
      undefined,
    );
    asserts.assertEquals(pact.getOption('issuer'), 'x'); // non-secret opts fine
  });

  it('L3: HS* enforces the RFC 7518 §3.2 per-algorithm secret minimum', () => {
    // HS256 (default): floor is 32 bytes — unchanged behaviour.
    asserts.assertThrows(
      () => new PACT({ bits: BITS, secret: 'too-short' }),
      PactDefinitionError,
    );
    new PACT({ bits: BITS, secret: 'x'.repeat(32) }); // exactly 32 → ok

    // HS384: floor is 48 bytes. A 32-byte secret is now REJECTED (it was
    // silently accepted before this gate); 47 is short too, 48 clears it.
    asserts.assertThrows(
      () =>
        new PACT({ bits: BITS, algorithm: 'HS384', secret: 'x'.repeat(32) }),
      PactDefinitionError,
    );
    asserts.assertThrows(
      () =>
        new PACT({ bits: BITS, algorithm: 'HS384', secret: 'x'.repeat(47) }),
      PactDefinitionError,
    );
    new PACT({ bits: BITS, algorithm: 'HS384', secret: 'x'.repeat(48) });

    // HS512: floor is 64 bytes. 63 is rejected, 64 is accepted.
    asserts.assertThrows(
      () =>
        new PACT({ bits: BITS, algorithm: 'HS512', secret: 'x'.repeat(63) }),
      PactDefinitionError,
    );
    new PACT({ bits: BITS, algorithm: 'HS512', secret: 'x'.repeat(64) });

    // The floor is measured in UTF-8 BYTES, not string length. U+00E9 is one
    // code unit but two UTF-8 bytes, so 32 of them = 64 bytes clears HS512…
    new PACT({ bits: BITS, algorithm: 'HS512', secret: 'é'.repeat(32) });
    // …while 23 (46 bytes) falls short of HS384's 48 and 24 (48 bytes) clears
    // it — proving `.length` (23/24) is not what the gate measures.
    asserts.assertThrows(
      () =>
        new PACT({
          bits: BITS,
          algorithm: 'HS384',
          secret: 'é'.repeat(23),
        }),
      PactDefinitionError,
    );
    new PACT({ bits: BITS, algorithm: 'HS384', secret: 'é'.repeat(24) });
  });

  it('M3: OAuth state is fail-closed once expectedState is supplied', async () => {
    const pact = new PACT({
      bits: BITS,
      oauth: {
        google: {
          provider: 'google',
          clientId: 'c',
          clientSecret: 's',
          redirectUri: 'https://a/cb',
        },
      },
    });
    // expectedState set but callback state missing → must throw (no bypass).
    const err = await asserts.assertRejects(
      () =>
        pact.handleCallback('google', {
          code: 'C',
          verifier: 'V',
          expectedState: 'sess-123',
        }),
      PactOAuthError,
    );
    asserts.assertEquals(err.code, 'OAUTH_STATE_MISMATCH');
  });

  it('L1: OIDC issuer must be https', () => {
    asserts.assertThrows(
      () =>
        new PACT({
          bits: BITS,
          oauth: {
            idp: {
              provider: 'oidc',
              issuer: 'http://idp.example.com',
              clientId: 'c',
              redirectUri: 'https://a/cb',
            },
          },
        }),
      PactDefinitionError,
    );
  });

  it('L5: deserializeGrants rejects non-decimal / empty, keeps decimals', () => {
    asserts.assertEquals(deserializeGrants({ A: '6', B: 12 }), {
      A: 6n,
      B: 12n,
    });
    for (const bad of ['', '   ', '0x1F', '0o17', '3.14', 'abc']) {
      asserts.assertThrows(
        () => deserializeGrants({ A: bad }),
        PactDefinitionError,
      );
    }
    const err = asserts.assertThrows(
      () => deserializeGrants({ A: 3.5 }),
      PactDefinitionError,
    );
    asserts.assertEquals(err.code, 'INVALID_GRANTS');
  });

  it('L6: contract-violating principal fails closed (no undefined principal)', async () => {
    const pact = new PACT({
      bits: BITS,
      strategies: {
        // returns a wrapper whose principal has a non-string id
        bad: () => ({ principal: { id: 42 as unknown as string } }),
        // returns a bare object with a non-string id
        bare: () => ({ id: 7 as unknown as string }),
      },
    });
    asserts.assertEquals(await pact.login('bad', {}), null);
    asserts.assertEquals(await pact.login('bare', {}), null);
  });

  it('L6: autoIssue failure routes through loginFailed (inside try)', async () => {
    const failures: string[] = [];
    const pact = new PACT({
      // autoIssue on but NO secret → generateJWT throws inside login()
      bits: BITS,
      autoIssue: true,
      strategies: { ok: () => ({ id: 'u1' }) },
      _onloginFailed: (s) => failures.push(s),
    });
    await asserts.assertRejects(
      () => pact.login('ok', {}),
      PactDefinitionError,
    );
    asserts.assertEquals(failures, ['ok']);
  });

  it('L12/L13: OAuth failure carries provider/status meta; id_token decode chains cause', async () => {
    const pact = new PACT({
      bits: BITS,
      oauth: {
        google: {
          provider: 'google',
          clientId: 'c',
          clientSecret: 's',
          redirectUri: 'https://a/cb',
        },
        apple: {
          provider: 'apple',
          clientId: 'c',
          clientSecret: 's',
          redirectUri: 'https://a/cb',
        },
      },
    });
    // exchange 200 but no access_token → OAUTH_EXCHANGE_FAILED with status
    const noToken = mockFetch([
      ['https://oauth2.googleapis.com/token', () => json({ scope: 'x' })],
    ]);
    setFetch(pact, noToken.fn);
    const e1 = await asserts.assertRejects(
      () => pact.handleCallback('google', { code: 'C', verifier: 'V' }),
      PactOAuthError,
    );
    asserts.assertEquals(e1.code, 'OAUTH_EXCHANGE_FAILED');
    asserts.assertEquals(e1.context.provider, 'google');
    asserts.assertEquals(e1.context.status, 200);

    // profile fetch fails → OAUTH_PROFILE_FAILED with status
    const badProfile = mockFetch([
      [
        'https://oauth2.googleapis.com/token',
        () => json({ access_token: 'AT' }),
      ],
      [
        'https://openidconnect.googleapis.com/v1/userinfo',
        () => new Response('nope', { status: 500 }),
      ],
    ]);
    setFetch(pact, badProfile.fn);
    const e2 = await asserts.assertRejects(
      () => pact.handleCallback('google', { code: 'C', verifier: 'V' }),
      PactOAuthError,
    );
    asserts.assertEquals(e2.code, 'OAUTH_PROFILE_FAILED');
    asserts.assertEquals(e2.context.status, 500);

    // Apple id_token undecodable → OAUTH_PROFILE_FAILED with a chained cause.
    const badIdToken = mockFetch([
      [
        'https://appleid.apple.com/auth/token',
        () => json({ access_token: 'AT', id_token: 'not-a-jwt' }),
      ],
    ]);
    setFetch(pact, badIdToken.fn);
    const e3 = await asserts.assertRejects(
      () => pact.handleCallback('apple', { code: 'C', verifier: 'V' }),
      PactOAuthError,
    );
    asserts.assertEquals(e3.code, 'OAUTH_PROFILE_FAILED');
    asserts.assert(e3.cause instanceof Error); // [L13] cause chained
  });

  it('F1: a throwing verify listener cannot reject a valid token or fire verifyFailed', async () => {
    const failures: Error[] = [];
    let verifies = 0;
    const pact = new PACT({
      bits: BITS,
      secret: SECRET,
      _onverify: () => {
        verifies++;
        throw new Error('audit sink down');
      },
      _onverifyFailed: (e) => failures.push(e),
    });
    const token = await pact.generateJWT({ sub: 'u1' });
    // The token is cryptographically valid — the listener throw must not
    // flip it into a rejection or a reported failure.
    const claims = await pact.verifyJWT(token);
    asserts.assertEquals(claims.sub, 'u1');
    asserts.assertEquals(verifies, 1); // the listener DID run…
    asserts.assertEquals(failures, []); // …but NO verifyFailed fired
    // Failure paths still report: a tampered token fires verifyFailed.
    await asserts.assertRejects(() => pact.verifyJWT(`${token}x`));
    asserts.assertEquals(failures.length, 1);
  });

  it('F1: a throwing login listener cannot fail a successful login or fire loginFailed', async () => {
    const failed: string[] = [];
    let logins = 0;
    const pact = new PACT({
      bits: BITS,
      secret: SECRET,
      autoIssue: true,
      strategies: { ok: () => ({ id: 'u-ok' }) },
      _onlogin: () => {
        logins++;
        throw new Error('audit sink down');
      },
      _onloginFailed: (s) => failed.push(s),
    });
    const result = await pact.login('ok', {});
    asserts.assert(result !== null);
    asserts.assertEquals(result.principal.id, 'u-ok');
    // The autoIssue JWT was already minted — it must not be lost.
    asserts.assertEquals((await pact.verifyJWT(result.token!)).sub, 'u-ok');
    asserts.assertEquals(logins, 1);
    asserts.assertEquals(failed, []);
  });

  it('F1: refresh path — throwing verify/refresh listeners cannot reject a refresh', async () => {
    const failures: Error[] = [];
    const events: string[] = [];
    const pact = new PACT({
      bits: BITS,
      secret: SECRET,
      _onverify: () => {
        events.push('verify');
        throw new Error('verify sink down');
      },
      _onrefresh: () => {
        events.push('refresh');
        throw new Error('refresh sink down');
      },
      _onverifyFailed: (e) => failures.push(e),
    });
    const token = await pact.generateJWT({ sub: 'u2' });
    const fresh = await pact.refreshJWT(token); // resolves despite both throws
    asserts.assertEquals(events, ['verify', 'refresh']); // both fired, in order
    asserts.assertEquals(failures, []);
    asserts.assertEquals((await pact.verifyJWT(fresh)).sub, 'u2'); // fresh is valid
  });

  it('F2: __proto__ / constructor module keys round-trip through the grants helpers', () => {
    const proto = '__proto__';
    // build (deserialize): stored as plain own properties, not prototype writes
    const grants = deserializeGrants({ [proto]: '3', constructor: '5' });
    asserts.assertEquals(grants[proto], 3n);
    asserts.assertEquals(grants['constructor'], 5n);
    asserts.assertEquals(Object.keys(grants).sort(), [
      '__proto__',
      'constructor',
    ]);
    // combine: ORs the masks instead of dropping the key / TypeError-ing on
    // inherited Object.prototype reads
    const combined = combineGrants(grants, { [proto]: 4n, Post: 1n });
    asserts.assertEquals(combined[proto], 7n);
    asserts.assertEquals(combined['constructor'], 5n);
    asserts.assertEquals(combined.Post, 1n);
    // has(): the facade reads the own property, not Object.prototype
    const pact = new PACT({ bits: BITS });
    asserts.assert(pact.hasPermission(proto, 'READ', combined));
    asserts.assert(pact.hasPermission(proto, 'EDIT', combined));
    asserts.assertFalse(pact.hasPermission('constructor', 'EDIT', combined));
    // serialize → deserialize survives the wire form intact
    const wire = serializeGrants(combined);
    asserts.assertEquals(wire[proto], '7');
    asserts.assertEquals(wire['constructor'], '5');
    const back = deserializeGrants(wire);
    asserts.assertEquals(back[proto], 7n);
    asserts.assertEquals(back['constructor'], 5n);
    asserts.assertEquals(back.Post, 1n);
    // and no global pollution: a fresh object still has a clean prototype
    asserts.assert(Object.getPrototypeOf({}) === Object.prototype);
  });

  it('a throwing granted listener cannot flip an authorized assert into a non-PactDeniedError throw', () => {
    const pact = new PACT({
      bits: BITS,
      _ongranted: () => {
        throw new Error('audit sink down');
      },
    });
    // Authorized: the `granted` audit emit runs, but its exception is isolated
    // so `assert()` still returns normally rather than throwing the sink error.
    pact.assert('Post', 'READ', { Post: 1n });
  });

  it('a throwing denied listener cannot replace the PactDeniedError on an unauthorized assert', () => {
    const pact = new PACT({
      bits: BITS,
      _ondenied: () => {
        throw new Error('audit sink down');
      },
    });
    const err = asserts.assertThrows(
      () => pact.assert('Post', 'DELETE', { Post: 1n }),
      PactDeniedError,
    );
    asserts.assertEquals(
      (err as PactDeniedError).code,
      'PERMISSION_DENIED',
    );
  });

  it('a throwing revoked listener cannot replace the TOKEN_REVOKED PactTokenError', async () => {
    const pact = new PACT({
      bits: BITS,
      secret: SECRET,
      isRevoked: () => true,
      _onrevoked: () => {
        throw new Error('audit sink down');
      },
    });
    const token = await pact.generateJWT({ sub: 'x' });
    const err = await asserts.assertRejects(
      () => pact.verifyJWT(token),
      PactTokenError,
    );
    asserts.assertEquals((err as PactTokenError).code, 'TOKEN_REVOKED');
  });

  it('L1: OIDC discovery returning a non-https token endpoint is rejected before any secret is sent', async () => {
    const pact = new PACT({
      bits: BITS,
      oauth: {
        idp: {
          provider: 'oidc',
          issuer: 'https://idp.example.com',
          clientId: 'c',
          clientSecret: 'shh',
          redirectUri: 'https://a/cb',
        },
      },
    });
    const { fn, seen } = mockFetch([
      [
        'https://idp.example.com/.well-known',
        () =>
          json({
            authorization_endpoint: 'https://idp.example.com/auth',
            token_endpoint: 'http://idp.example.com/token', // plaintext!
          }),
      ],
    ]);
    setFetch(pact, fn);
    // Discovery validates every declared endpoint up front, so even the
    // authorization-URL path (which only needs the auth endpoint) fails fast.
    const err = await asserts.assertRejects(
      () => pact.getAuthorizationUrl('idp'),
      PactOAuthError,
    );
    asserts.assertEquals(
      (err as PactOAuthError).code,
      'OAUTH_EXCHANGE_FAILED',
    );
    // The plaintext token endpoint (which would carry code + client_secret)
    // is never contacted. [L1]
    asserts.assertFalse(seen.some((s) => s.url.startsWith('http://')));
  });
});

describe('pact.PACT coverage gaps', () => {
  it('RS256 key-pair path: issue/verify/refresh; sign() rejects (no shared secret)', async () => {
    const keys = await generateRSAKeyPair({
      algorithm: 'RSA-PSS',
      keySize: 2048,
      hashAlgorithm: 'SHA-256',
      format: 'PEM',
      extractable: true,
    });
    const pact = new PACT({
      bits: BITS,
      algorithm: 'RS256',
      secret: {
        privateKey: keys.privateKeyExported as string,
        publicKey: keys.publicKeyExported as string,
      },
    });
    const token = await pact.generateJWT({ sub: 'rsa-user' });
    asserts.assertEquals((await pact.verifyJWT(token)).sub, 'rsa-user');
    const fresh = await pact.refreshJWT(token);
    asserts.assertEquals((await pact.verifyJWT(fresh)).sub, 'rsa-user');
    // HMAC sign/verify has no shared secret under an RSA config.
    await asserts.assertRejects(() => pact.sign('data'), PactDefinitionError);
  });

  it('Groups epoch fence: a slow earlier resolve cannot clobber a newer one [M1]', async () => {
    let call = 0;
    let releaseStale!: () => void;
    const resolver = (ids: string[]): Promise<Record<string, PACTGrants>> => {
      call++;
      if (call === 1) {
        return new Promise((res) => {
          releaseStale = () => res({ g1: { Post: 3n } }); // stale: READ|EDIT
        });
      }
      return Promise.resolve({ g1: { Post: 1n } }); // fresh: READ only
    };
    const groups = new Groups(resolver);
    const slow = groups.sync(['g1']); // gen 1 (pending, stale)
    await groups.sync(['g1']); // gen 2 (resolves now → cache g1 = {Post:1n})
    releaseStale(); // gen 1 resolves late with stale data
    await slow;
    // The stale gen-1 write must NOT overwrite the fresher gen-2 value.
    asserts.assertEquals((await groups.combined(['g1'])).Post, 1n);
  });

  it('Groups cached / clear / empty-sync', async () => {
    const resolver = (ids: string[]): Promise<Record<string, PACTGrants>> =>
      Promise.resolve(Object.fromEntries(ids.map((i) => [i, { Post: 1n }])));
    const groups = new Groups(resolver);
    asserts.assertEquals(await groups.sync(), []); // empty cache, no ids → []
    await groups.ensure(['a', 'b']);
    asserts.assertEquals([...groups.cached].sort(), ['a', 'b']);
    groups.clear();
    asserts.assertEquals(groups.cached, []);
  });

  it('timer syncFailed handler that throws is isolated (no unhandled rejection) [L4]', async () => {
    let call = 0;
    const resolver = (_ids: string[]): Promise<Record<string, PACTGrants>> => {
      call++;
      return call === 1
        ? Promise.resolve({ g1: { Post: 1n } })
        : Promise.reject(new Error('resolver down'));
    };
    let failed = 0;
    const pact = new PACT({
      bits: BITS,
      groupResolver: resolver,
      syncInterval: 15,
      _onsyncFailed: () => {
        failed++;
        throw new Error('handler boom'); // must be swallowed by the timer
      },
    });
    await pact.hasPermissionForGroups('Post', 'READ', ['g1']); // seed cache
    const t0 = Date.now();
    while (failed < 1 && Date.now() - t0 < 2000) {
      await new Promise((r) => setTimeout(r, 10));
    }
    pact.stopSync();
    asserts.assert(
      failed >= 1,
      'syncFailed fired despite the throwing handler',
    );
  });

  it('provider normalizers: github/microsoft/discord/facebook', () => {
    asserts.assertEquals(
      PROVIDERS.github.profile({ id: 5, login: 'octo', avatar_url: 'a' }),
      { id: '5', email: undefined, name: 'octo', avatar: 'a' },
    );
    asserts.assertEquals(
      PROVIDERS.microsoft.profile({ sub: 'm1', email: 'm@x', name: 'M' }),
      { id: 'm1', email: 'm@x', name: 'M', avatar: undefined },
    );
    const d = PROVIDERS.discord.profile({
      id: '123',
      avatar: 'abc',
      global_name: 'GN',
      email: 'd@x',
      verified: true,
    });
    asserts.assertEquals(
      d.avatar,
      'https://cdn.discordapp.com/avatars/123/abc.png',
    );
    asserts.assertEquals(d.name, 'GN');
    asserts.assert(d.emailVerified);
    // discord username fallback + no-avatar
    const d2 = PROVIDERS.discord.profile({ id: '1', username: 'u' });
    asserts.assertEquals(d2.name, 'u');
    asserts.assertEquals(d2.avatar, undefined);
    asserts.assertEquals(
      PROVIDERS.facebook.profile({
        id: '7',
        name: 'F',
        picture: { data: { url: 'pu' } },
      }).avatar,
      'pu',
    );
  });

  it('OIDC discovery failure throws OAUTH_EXCHANGE_FAILED', async () => {
    const pact = new PACT({
      bits: BITS,
      oauth: {
        idp: {
          provider: 'oidc',
          issuer: 'https://idp.example.com',
          clientId: 'c',
          redirectUri: 'https://a/cb',
        },
      },
    });
    const { fn } = mockFetch([
      [
        'https://idp.example.com/.well-known',
        () => new Response('no', { status: 503 }),
      ],
    ]);
    setFetch(pact, fn);
    const err = await asserts.assertRejects(
      () => pact.getAuthorizationUrl('idp'),
      PactOAuthError,
    );
    asserts.assertEquals(err.code, 'OAUTH_EXCHANGE_FAILED');
  });

  it('unknown provider is rejected by getAuthorizationUrl + handleCallback', () => {
    const pact = new PACT({ bits: BITS });
    asserts.assertThrows(
      () => pact.getAuthorizationUrl('nope'),
      PactDefinitionError,
    );
    asserts.assertThrows(
      () => pact.handleCallback('nope', { code: 'c', verifier: 'v' }),
      PactDefinitionError,
    );
  });

  it('verifyAPIKey returns false for a wrong-length stored hash', async () => {
    const pact = new PACT({ bits: BITS });
    asserts.assertFalse(await pact.verifyAPIKey('anything', 'short'));
  });

  it('facade mask-math delegates (revoke / diff / toMask)', () => {
    const pact = new PACT({
      bits: BITS,
      modules: { Post: ['READ', 'EDIT', 'DELETE'] },
    });
    asserts.assertEquals(pact.revoke(7n, 'EDIT'), 5n);
    asserts.assertEquals(pact.diff(3n, 6n), { added: 4n, removed: 1n });
    asserts.assertEquals(pact.toMask('Post', ['READ', 'DELETE']), 5n);
  });
});

/**
 * Capture unhandled promise rejections across runtimes for the duration of a
 * test: Deno/Bun fire the web `unhandledrejection` event (we `preventDefault`
 * so it does not crash the process), Node reports via `process`. An escaped
 * async-listener rejection lands in `rejections`; a correctly isolated one
 * leaves it empty.
 */
function captureRejections(): { rejections: unknown[]; restore: () => void } {
  const rejections: unknown[] = [];
  const g = globalThis as unknown as {
    addEventListener?: (t: string, h: (e: unknown) => void) => void;
    removeEventListener?: (t: string, h: (e: unknown) => void) => void;
    process?: {
      on?: (e: string, h: (r: unknown) => void) => void;
      off?: (e: string, h: (r: unknown) => void) => void;
    };
  };
  const evtHandler = (e: unknown): void => {
    const ev = e as { preventDefault?: () => void; reason?: unknown };
    ev.preventDefault?.();
    rejections.push(ev.reason);
  };
  const nodeHandler = (reason: unknown): void => {
    rejections.push(reason);
  };
  g.addEventListener?.('unhandledrejection', evtHandler);
  g.process?.on?.('unhandledRejection', nodeHandler);
  return {
    rejections,
    restore: () => {
      g.removeEventListener?.('unhandledrejection', evtHandler);
      g.process?.off?.('unhandledRejection', nodeHandler);
    },
  };
}

/** Yield long enough for any escaped rejection to be reported. */
const flushRejections = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 25));

describe('pact.PACT round-3 review findings', () => {
  it('[HIGH] an async (rejecting) verify listener neither rejects the token nor escapes as an unhandled rejection', async () => {
    const cap = captureRejections();
    try {
      const pact = new PACT({
        bits: BITS,
        secret: SECRET,
        // A natural async audit sink whose write rejects once.
        _onverify: async () => {
          await Promise.resolve();
          throw new Error('audit DB write failed');
        },
      });
      const token = await pact.generateJWT({ sub: 'u1' });
      // The token is cryptographically valid — verifyJWT must resolve …
      const claims = await pact.verifyJWT(token);
      asserts.assertEquals(claims.sub, 'u1');
      await flushRejections();
      // … and the async listener's rejection must NOT escape (which would
      // otherwise terminate the process under Deno/Node default policy).
      asserts.assertEquals(cap.rejections, []);
    } finally {
      cap.restore();
    }
  });

  it('[HIGH] an async (rejecting) login listener cannot fail a login nor escape as an unhandled rejection', async () => {
    const cap = captureRejections();
    try {
      const failed: string[] = [];
      const pact = new PACT({
        bits: BITS,
        secret: SECRET,
        autoIssue: true,
        strategies: { ok: () => ({ id: 'u-ok' }) },
        _onlogin: async () => {
          await Promise.resolve();
          throw new Error('audit sink down');
        },
        _onloginFailed: (s) => failed.push(s),
      });
      const result = await pact.login('ok', {});
      asserts.assert(result !== null);
      asserts.assertEquals(result.principal.id, 'u-ok');
      asserts.assertEquals((await pact.verifyJWT(result.token!)).sub, 'u-ok');
      await flushRejections();
      asserts.assertEquals(cap.rejections, []);
      asserts.assertEquals(failed, []);
    } finally {
      cap.restore();
    }
  });

  it('[HIGH] an async (rejecting) refresh listener cannot reject a refresh nor escape', async () => {
    const cap = captureRejections();
    try {
      const pact = new PACT({
        bits: BITS,
        secret: SECRET,
        _onverify: async () => {
          throw new Error('verify sink down');
        },
        _onrefresh: async () => {
          throw new Error('refresh sink down');
        },
      });
      const token = await pact.generateJWT({ sub: 'u2' });
      const fresh = await pact.refreshJWT(token);
      asserts.assertEquals((await pact.verifyJWT(fresh)).sub, 'u2');
      await flushRejections();
      asserts.assertEquals(cap.rejections, []);
    } finally {
      cap.restore();
    }
  });

  it('[MED] a throwing verifyFailed listener cannot replace the TOKEN_REVOKED PactTokenError', async () => {
    const pact = new PACT({
      bits: BITS,
      secret: SECRET,
      isRevoked: () => true,
      _onverifyFailed: () => {
        throw new Error('audit sink down');
      },
    });
    const token = await pact.generateJWT({ sub: 'x' });
    const err = await asserts.assertRejects(
      () => pact.verifyJWT(token),
      PactTokenError,
    );
    asserts.assertEquals((err as PactTokenError).code, 'TOKEN_REVOKED');
  });

  it('[MED] a throwing verifyFailed listener cannot replace the crypt error on a bad signature', async () => {
    const pact = new PACT({
      bits: BITS,
      secret: SECRET,
      _onverifyFailed: () => {
        throw new Error('audit sink down');
      },
    });
    const other = new PACT({ bits: BITS, secret: `${SECRET}-other` });
    const token = await other.generateJWT({ sub: 'x' });
    const err = await asserts.assertRejects(() => pact.verifyJWT(token));
    // The surfaced error is the crypt verification error, not the sink's.
    asserts.assert(!/audit sink down/.test((err as Error).message));
  });

  it('[MED] a throwing loginFailed listener does not double-fire and keeps the bad-credentials null contract', async () => {
    let fired = 0;
    const pact = new PACT({
      bits: BITS,
      strategies: {
        pw: (c) => (c as { ok?: boolean }).ok === true ? { id: 'u' } : null,
      },
      _onloginFailed: () => {
        fired++;
        throw new Error('audit sink down');
      },
    });
    // Bad credentials: must return null (not throw), and loginFailed must
    // fire exactly once (an unisolated throwing listener made it fire twice
    // and converted the null return into a thrown error).
    const result = await pact.login('pw', { ok: false });
    asserts.assertEquals(result, null);
    asserts.assertEquals(fired, 1);
  });

  it('[MED] Groups.clear() during an in-flight resolve does not resurrect stale grants and re-resolves', async () => {
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const resolver = async (
      ids: string[],
    ): Promise<Record<string, PACTGrants>> => {
      calls++;
      // Resolve #1 carries the pre-revocation grants (DELETE); it is held
      // in flight until released. Resolve #2 carries the post-revocation
      // grants (READ only).
      const mask = calls === 1 ? 7n : 1n;
      if (calls === 1) await gate;
      return Object.fromEntries(ids.map((id) => [id, { Post: mask }]));
    };
    const groups = new Groups(resolver);
    const inFlight = groups.combined(['admins']); // starts resolve #1 (blocked)
    groups.clear(); // revocation: force fresh resolution
    release(); // resolve #1 now completes — AFTER the clear
    await inFlight; // its stale grants must NOT be written back to the cache
    const after = await groups.combined(['admins']); // must re-resolve
    asserts.assertEquals(calls, 2); // the cleared id genuinely re-resolved
    asserts.assertEquals(after['Post'], 1n); // fresh (post-revocation) mask
    asserts.assertEquals(groups.cached, ['admins']);
  });

  it('[MED] an OAuth userinfo payload without a subject fails closed instead of minting <provider>:undefined', async () => {
    const pact = new PACT({
      bits: BITS,
      oauth: {
        google: {
          provider: 'google',
          clientId: 'c',
          clientSecret: 's',
          redirectUri: 'https://a/cb',
        },
      },
    });
    const { fn } = mockFetch([
      [
        'https://oauth2.googleapis.com/token',
        () => json({ access_token: 'AT' }),
      ],
      [
        'https://openidconnect.googleapis.com/v1/userinfo',
        // 200 body with NO `sub` claim (misconfigured/nonconforming IdP).
        () => json({ name: 'No Subject', email: 'x@example.com' }),
      ],
    ]);
    setFetch(pact, fn);
    const err = await asserts.assertRejects(
      () => pact.handleCallback('google', { code: 'C', verifier: 'V' }),
      PactOAuthError,
    );
    asserts.assertEquals(err.code, 'OAUTH_PROFILE_FAILED');
  });

  it('[MED] the missing-subject normalizer yields undefined (never the literal "undefined")', () => {
    asserts.assertEquals(
      PROVIDERS.google.profile({ email: 'x@y' }).id,
      undefined,
    );
    asserts.assertEquals(
      PROVIDERS.github.profile({ login: 'octo' }).id,
      undefined,
    );
    // A present numeric subject still normalizes to its string form.
    asserts.assertEquals(PROVIDERS.github.profile({ id: 42 }).id, '42');
  });
});

describe('pact.PACT round-4 review findings', () => {
  it('[HIGH] an unset optional `_on<Event>` hook is ignored instead of crashing the constructor', async () => {
    // The real-world shape: a wrapper factory forwards optional audit hooks
    // straight from its own config. `EventOptionKeys` types `_on*` as
    // optional, so this type-checks with no cast even when the hook is unset.
    type Cfg = {
      auditVerify?: PACTEvents['verify'];
      auditIssue?: PACTEvents['issue'];
    };
    const cfg: Cfg = {}; // this deployment configures neither hook
    const pact = new PACT({
      bits: BITS,
      secret: SECRET,
      _onverify: cfg.auditVerify,
      _onissue: cfg.auditIssue,
    });
    // …and the un-registered listener must not poison the event either: a
    // real listener added afterwards still fires (storing `undefined` in the
    // listener set aborts `Events.emit` before the later listeners run).
    const seen: string[] = [];
    pact.on('verify', (claims) => {
      seen.push(String(claims.sub));
    });
    const token = await pact.generateJWT({ sub: 'u1' });
    asserts.assertEquals((await pact.verifyJWT(token)).sub, 'u1');
    asserts.assertEquals(seen, ['u1']);
  });

  it('[HIGH] on()/once() ignore a non-function listener and keep the event usable', async () => {
    const pact = new PACT({ bits: BITS, secret: SECRET });
    const nothing = undefined as unknown as PACTEvents['verify'];
    pact.on('verify', nothing);
    pact.once('verify', nothing);
    pact.on('verify', [nothing]);
    const seen: string[] = [];
    let onceCount = 0;
    pact.on('verify', (claims) => {
      seen.push(String(claims.sub));
    });
    pact.once('verify', () => {
      onceCount++;
    });
    const token = await pact.generateJWT({ sub: 'u2' });
    await pact.verifyJWT(token);
    await pact.verifyJWT(token);
    asserts.assertEquals(seen, ['u2', 'u2']);
    asserts.assertEquals(onceCount, 1); // once() still fires exactly once
    // …and off() still removes a wrapped listener by its original identity.
    const listener: PACTEvents['verify'] = (claims) => {
      seen.push(`off:${claims.sub}`);
    };
    pact.on('verify', listener);
    pact.off('verify', listener);
    await pact.verifyJWT(token);
    asserts.assertEquals(seen, ['u2', 'u2', 'u2']);
    // …and registering the same listener twice still fires it once (the
    // wrapper is memoized per listener, so the base Set still de-duplicates).
    pact.on('verify', listener);
    pact.on('verify', listener);
    await pact.verifyJWT(token);
    asserts.assertEquals(seen.filter((s) => s.startsWith('off:')).length, 1);
  });

  it('[MED] emitSync awaits async listeners in order on a PACT instance', async () => {
    const pact = new PACT({ bits: BITS, secret: SECRET });
    const order: string[] = [];
    pact.on('verify', async () => {
      order.push('A-start');
      await new Promise((r) => setTimeout(r, 20));
      order.push('A-end');
    });
    pact.on('verify', async () => {
      order.push('B-start');
      await new Promise((r) => setTimeout(r, 1));
      order.push('B-end');
    });
    await pact.emitSync('verify', { sub: 'u' }, 'tok');
    // emitSync's contract: the next listener does not start until the
    // previous one resolves, and it returns only once all are done.
    asserts.assertEquals(order, ['A-start', 'A-end', 'B-start', 'B-end']);
  });

  it('[MED] emitSync surfaces an async listener rejection to its caller', async () => {
    const pact = new PACT({ bits: BITS, secret: SECRET });
    pact.on('verify', () => Promise.reject(new Error('audit write failed')));
    const err = await asserts.assertRejects(
      () => pact.emitSync('verify', { sub: 'u' }, 'tok'),
      Error,
    );
    asserts.assertEquals((err as Error).message, 'audit write failed');
  });

  it('[MED] a rejecting listener on a non-isolated emit still cannot escape unhandled', async () => {
    const cap = captureRejections();
    try {
      const pact = new PACT({
        bits: BITS,
        secret: SECRET,
        // `issue` is emitted through the plain (non-isolated) emit path.
        _onissue: () => Promise.reject(new Error('issue sink down')),
      });
      const token = await pact.generateJWT({ sub: 'u3' });
      asserts.assert(token.length > 0);
      await flushRejections();
      asserts.assertEquals(cap.rejections, []);
    } finally {
      cap.restore();
    }
  });

  it('[MED] a combined() in flight across a clear() returns the fresh grants, never an empty map', async () => {
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const resolver = async (
      ids: string[],
    ): Promise<Record<string, PACTGrants>> => {
      calls++;
      const mask = calls === 1 ? 7n : 1n; // #1 pre-clear, #2 post-clear
      if (calls === 1) await gate;
      return Object.fromEntries(ids.map((id) => [id, { Post: mask }]));
    };
    const groups = new Groups(resolver);
    const inFlight = groups.combined(['admins']); // resolve #1 (blocked)
    groups.clear();
    release();
    const grants = await inFlight;
    // The fenced write must not leave the caller with NO grants — that is a
    // silent false-deny. The caller gets the post-clear values.
    asserts.assertEquals(grants['Post'], 1n);
    asserts.assertEquals(calls, 2);
    asserts.assertEquals(groups.cached, ['admins']);
  });

  it('[MED] ensure()/sync() keep their contracts across a clear()', async () => {
    let calls = 0;
    let release!: () => void;
    let gate = new Promise<void>((r) => {
      release = r;
    });
    const resolver = async (
      ids: string[],
    ): Promise<Record<string, PACTGrants>> => {
      calls++;
      const mask = calls === 1 ? 7n : 1n;
      if (calls === 1) await gate;
      return Object.fromEntries(ids.map((id) => [id, { Post: mask }]));
    };
    const groups = new Groups(resolver);
    // ensure(): "make sure every id is cached" must hold across a clear().
    const ensuring = groups.ensure(['a', 'b']);
    groups.clear();
    release();
    await ensuring;
    asserts.assertEquals([...groups.cached].sort(), ['a', 'b']);
    asserts.assertEquals((await groups.combined(['a']))['Post'], 1n);

    // sync(): "@returns the ids that were refreshed" must match what landed.
    calls = 0;
    gate = new Promise<void>((r) => {
      release = r;
    });
    const groups2 = new Groups(resolver);
    const syncing = groups2.sync(['a']);
    groups2.clear();
    release();
    const refreshed = await syncing;
    asserts.assertEquals(refreshed, ['a']);
    asserts.assertEquals(groups2.cached, ['a']); // it really was written
    asserts.assertEquals((await groups2.combined(['a']))['Post'], 1n);
  });

  it('[MED] a clear() fence never drops an unrelated id resolved in the same batch', async () => {
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const resolver = async (
      ids: string[],
    ): Promise<Record<string, PACTGrants>> => {
      calls++;
      if (calls === 1) await gate;
      return Object.fromEntries(ids.map((id) => [id, { Post: 1n }]));
    };
    const groups = new Groups(resolver);
    const inFlight = groups.combined(['revoked', 'unrelated']);
    groups.clear();
    release();
    const grants = await inFlight;
    asserts.assertEquals(grants['Post'], 1n);
    asserts.assertEquals([...groups.cached].sort(), ['revoked', 'unrelated']);
  });

  it('[MED] a clear() that evicts an id mid-call still yields its grants, not a deny', async () => {
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const resolver = async (
      ids: string[],
    ): Promise<Record<string, PACTGrants>> => {
      calls++;
      if (calls === 2) await gate; // the mixed cached/uncached call
      return Object.fromEntries(ids.map((id) => [id, { Post: 1n }]));
    };
    const groups = new Groups(resolver);
    await groups.ensure(['a']); // 'a' is cached before the racing call
    const inFlight = groups.combined(['a', 'b']); // resolves 'b' (blocked)
    groups.clear(); // evicts 'a' while the call is awaiting
    release();
    const grants = await inFlight;
    // 'a' was evicted mid-call: it must be re-resolved, not reported as {}.
    asserts.assertEquals(grants['Post'], 1n);
    asserts.assertEquals([...groups.cached].sort(), ['a', 'b']);
  });

  it('[R6] ensure() re-caches a pre-cached id a clear() evicts mid-resolve', async () => {
    // Sibling of the combined() test above, on the ensure() path. ensure()'s
    // "make sure every id is cached" contract must survive a clear() that
    // lands while a *different* id is resolving and evicts an already-cached
    // id — the case the earlier ensure() sub-test (empty cache) never hit.
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const resolver = async (
      ids: string[],
    ): Promise<Record<string, PACTGrants>> => {
      calls++;
      if (calls === 2) await gate; // block only the mixed cached/uncached call
      return Object.fromEntries(ids.map((id) => [id, { Post: 1n }]));
    };
    const groups = new Groups(resolver);
    await groups.ensure(['a']); // 'a' is cached before the racing call
    const inFlight = groups.ensure(['a', 'b']); // resolves 'b' (blocked)
    groups.clear(); // evicts 'a' while the call is awaiting
    release();
    await inFlight;
    // Assert the CACHE, not just that the call resolved: 'a' — never in the
    // initial `missing` set — must have been re-resolved and re-cached.
    asserts.assertEquals([...groups.cached].sort(), ['a', 'b']);
    asserts.assertEquals((await groups.combined(['a']))['Post'], 1n);
    asserts.assertEquals((await groups.combined(['b']))['Post'], 1n);
  });
});
