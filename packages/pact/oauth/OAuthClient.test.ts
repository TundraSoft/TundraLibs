/**
 * @fileoverview Tests for the OAuth flows through the pact surface:
 * hardened redirect URLs, callback verification, JIT provisioning, and
 * config validation. Token/userinfo exchanges are stubbed on the
 * RESTler seam — no network.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { Pact } from '../mod.ts';
import { PactError } from '../errors/mod.ts';
import { OAuthClient } from './mod.ts';
import type { PactOAuthProfile, PactStoredUser } from '../types/mod.ts';

const byId = new Map<string, PactStoredUser>();
const links = new Map<string, string>();
const identifiers = new Map<string, string>();
let created = 0;

// A pre-existing local account whose email a hostile provider might echo.
byId.set('victim', { id: 'victim', status: 'ACTIVE', grants: '{}' });
identifiers.set('taken@example.dev', 'victim');

const pact = Pact.create({
  bits: { READ: 1n },
  modulePermissions: { Post: ['READ'] },
  hooks: {
    getUser: (q) => {
      if (q.by === 'ID') return byId.get(q.id) ?? null;
      if (q.by === 'IDENTIFIER') {
        const id = identifiers.get(q.identifier);
        return id === undefined ? null : byId.get(id) ?? null;
      }
      const id = links.get(`${q.provider}:${q.subject}`);
      return id === undefined ? null : byId.get(id) ?? null;
    },
    createUser: (input) => {
      created++;
      const user: PactStoredUser = {
        id: `ou${created}`,
        status: input.status,
        grants: input.grants,
        metadata: input.metadata,
      };
      byId.set(user.id, user);
      if (input.oauth !== undefined) {
        links.set(`${input.oauth.provider}:${input.oauth.subject}`, user.id);
      }
      return user;
    },
  },
  options: {
    cache: { ttl: { session: 5 } }, // cache-only sessions for the store
    oauth: {
      google: {
        kind: 'GOOGLE',
        clientId: 'cid',
        clientSecret: 'sec',
        redirectUri: 'https://app.example.dev/cb',
        autoProvision: true,
        // Hostile config must not override the generated params.
        authParams: { state: 'evil', redirect_uri: 'https://evil.example' },
      },
      plain: {
        kind: 'GITHUB',
        clientId: 'gh',
        redirectUri: 'https://app.example.dev/gh',
      },
      ms: {
        kind: 'MICROSOFT',
        clientId: 'ms-cid',
        redirectUri: 'https://app.example.dev/ms',
        tenant: 'contoso',
      },
      apple: {
        kind: 'APPLE',
        clientId: 'app.example.svc',
        redirectUri: 'https://app.example.dev/apple',
      },
      jitv: {
        kind: 'GOOGLE',
        clientId: 'jitv-cid',
        redirectUri: 'https://app.example.dev/jitv',
        autoProvision: true,
      },
    },
  },
});

// Offline stub on the RESTler seam: POST = token exchange, GET = userinfo.
function stubClient(name: string, userinfo: Record<string, unknown>): void {
  // deno-lint-ignore no-explicit-any
  const client = (pact as any).__oauth.get(name);
  client._makeRequest = (opts: { method: string }) => {
    if (opts.method === 'POST') {
      return { status: 200, body: { access_token: 'at-123' } };
    }
    return { status: 200, body: userinfo };
  };
}
stubClient('google', { sub: 'g-1', email: 'ada@gmail.test', name: 'Ada' });
stubClient('plain', { id: 777, login: 'octo' });
stubClient('jitv', {
  sub: 'evil-1',
  email: 'taken@example.dev',
  email_verified: true,
});

async function expectCode(p: Promise<unknown>, code: string): Promise<void> {
  const error = await asserts.assertRejects(() => p, PactError);
  asserts.assertStrictEquals(error.code, code);
}

describe('oauthRedirect', () => {
  it('should build a hardened authorization URL', async () => {
    const r = await pact.oauthRedirect('google');
    const url = new URL(r.url);
    asserts.assertStrictEquals(url.origin, 'https://accounts.google.com');
    const q = url.searchParams;
    asserts.assertStrictEquals(q.get('client_id'), 'cid');
    asserts.assertStrictEquals(
      q.get('redirect_uri'),
      'https://app.example.dev/cb',
      'authParams must not override redirect_uri',
    );
    asserts.assertStrictEquals(q.get('state'), r.state);
    asserts.assertNotStrictEquals(r.state, 'evil');
    asserts.assertExists(q.get('code_challenge'));
    asserts.assertStrictEquals(q.get('code_challenge_method'), 'S256');
    asserts.assertStrictEquals(q.get('nonce'), r.nonce ?? null);
    asserts.assert(r.codeVerifier.length >= 32);
  });

  it('should omit the nonce for a non-OIDC provider', async () => {
    const gh = await pact.oauthRedirect('plain');
    asserts.assertStrictEquals(gh.nonce, undefined);
  });

  it('should substitute the tenant and apply apple quirks', async () => {
    const ms = await pact.oauthRedirect('ms');
    const msUrl = new URL(ms.url);
    asserts.assertStrictEquals(
      msUrl.origin,
      'https://login.microsoftonline.com',
    );
    asserts.assert(msUrl.pathname.startsWith('/contoso/'));
    const apple = await pact.oauthRedirect('apple');
    const appleUrl = new URL(apple.url);
    asserts.assertStrictEquals(appleUrl.origin, 'https://appleid.apple.com');
    asserts.assertStrictEquals(
      appleUrl.searchParams.get('response_mode'),
      'form_post',
    );
    asserts.assertExists(apple.nonce);
  });

  it('should throw UNKNOWN_PROVIDER for an unconfigured instance', async () => {
    await expectCode(pact.oauthRedirect('nope'), 'UNKNOWN_PROVIDER');
  });
});

describe('oauthLogin', () => {
  it('should fail closed on a state mismatch before any exchange', async () => {
    await expectCode(
      pact.oauthLogin('google', { code: 'c', state: 'bad' }, {
        state: 'good',
        codeVerifier: 'v',
      }),
      'OAUTH_STATE_MISMATCH',
    );
  });

  it('should JIT-provision on first login and reuse the link after', async () => {
    const first = await pact.oauthLogin('google', { code: 'c', state: 's1' }, {
      state: 's1',
      codeVerifier: 'v',
    });
    asserts.assertStrictEquals(first.profile.email, 'ada@gmail.test');
    asserts.assertStrictEquals(first.principal.id, 'ou1');
    asserts.assertStrictEquals(created, 1);
    asserts.assert(first.session.token.startsWith('pact_st_'));
    const again = await pact.oauthLogin('google', { code: 'c2', state: 's2' }, {
      state: 's2',
      codeVerifier: 'v',
    });
    asserts.assertStrictEquals(again.principal.id, 'ou1');
    asserts.assertStrictEquals(created, 1, 'repeat login must reuse the link');
    asserts.assertStrictEquals(again.profile.provider, 'google');
  });

  it('should throw OAUTH_UNLINKED without autoProvision', async () => {
    await expectCode(
      pact.oauthLogin('plain', { code: 'c', state: 'x' }, {
        state: 'x',
        codeVerifier: 'v',
      }),
      'OAUTH_UNLINKED',
    );
  });

  it('should refuse JIT that would claim an existing local identifier', async () => {
    await expectCode(
      pact.oauthLogin('jitv', { code: 'c', state: 'q' }, {
        state: 'q',
        codeVerifier: 'v',
      }),
      'USER_EXISTS',
    );
  });

  it('should map a schema-failing token response to OAUTH_EXCHANGE_FAILED', async () => {
    // deno-lint-ignore no-explicit-any
    const client = (pact as any).__oauth.get('plain');
    const original = client._makeRequest;
    client._makeRequest = () => ({ status: 200, body: { ok: true } });
    try {
      await expectCode(
        pact.oauthLogin('plain', { code: 'c', state: 'z' }, {
          state: 'z',
          codeVerifier: 'v',
        }),
        'OAUTH_EXCHANGE_FAILED',
      );
    } finally {
      client._makeRequest = original;
    }
  });
});

describe('provider config validation', () => {
  it('should reject a malformed provider config at construction', () => {
    const cases = [
      { kind: 'GOOGLE', clientId: '', redirectUri: 'not-a-url' },
      { kind: 'OIDC', clientId: 'x', redirectUri: 'https://a/cb' }, // no issuer
      {
        kind: 'OIDC',
        clientId: 'x',
        redirectUri: 'https://a/cb',
        issuer: 'https://idp.example',
        discoveryHosts: ['IdP.Other.example'],
      },
      {
        kind: 'GITHUB',
        clientId: 'x',
        redirectUri: 'https://a/cb',
        discoveryHosts: ['github.com'],
      },
    ] as const;
    for (const bad of cases) {
      const error = asserts.assertThrows(
        () =>
          Pact.create({
            bits: { READ: 1n },
            modulePermissions: { Post: ['READ'] },
            // deno-lint-ignore no-explicit-any
            options: { oauth: { bad: bad as any } },
          }),
        PactError,
      );
      asserts.assertStrictEquals(error.code, 'INVALID_OPTION');
    }
  });
});

describe('runtime OAuth provider mutation', () => {
  // A dedicated instance, isolated from the module-level `pact` the
  // flow tests above share — these tests mutate provider config, and
  // must never leak that into a test that runs later in this file.
  function freshPact() {
    return Pact.create({
      bits: { READ: 1n },
      modulePermissions: { Post: ['READ'] },
      hooks: { getUser: () => null },
      options: {
        oauth: {
          google: {
            kind: 'GOOGLE',
            clientId: 'cid',
            redirectUri: 'https://app.example.dev/cb',
          },
        },
      },
    });
  }

  it('oauthProviders lists exactly what the constructor configured', () => {
    const pact = freshPact();
    asserts.assertEquals(pact.oauthProviders, ['google']);
  });

  it('updateOAuth adds a new provider, validated the same way as construction', () => {
    const pact = freshPact();
    pact.updateOAuth('github', {
      kind: 'GITHUB',
      clientId: 'gh',
      redirectUri: 'https://app.example.dev/gh',
    });
    asserts.assertEquals([...pact.oauthProviders].sort(), ['github', 'google']);
  });

  it('updateOAuth on an existing name replaces it, not duplicates it', () => {
    const pact = freshPact();
    pact.updateOAuth('google', {
      kind: 'GOOGLE',
      clientId: 'a-different-client-id',
      redirectUri: 'https://app.example.dev/cb2',
    });
    asserts.assertEquals(pact.oauthProviders, ['google']);
  });

  it('a bad updateOAuth config throws INVALID_OPTION and never registers', () => {
    const pact = freshPact();
    const error = asserts.assertThrows(
      () =>
        pact.updateOAuth('bad', {
          kind: 'GOOGLE',
          clientId: '',
          redirectUri: 'not-a-url',
          // deno-lint-ignore no-explicit-any
        } as any),
      PactError,
    );
    asserts.assertStrictEquals(error.code, 'INVALID_OPTION');
    asserts.assertEquals(pact.oauthProviders, ['google']);
  });

  it('removeOAuth removes a provider and reports whether it existed', () => {
    const pact = freshPact();
    asserts.assertStrictEquals(pact.removeOAuth('google'), true);
    asserts.assertEquals(pact.oauthProviders, []);
    asserts.assertStrictEquals(pact.removeOAuth('google'), false);
  });

  it('a removed provider fails UNKNOWN_PROVIDER exactly like one never configured', async () => {
    const pact = freshPact();
    pact.removeOAuth('google');
    const error = await asserts.assertRejects(
      () => pact.oauthRedirect('google'),
      PactError,
    );
    asserts.assertStrictEquals(error.code, 'UNKNOWN_PROVIDER');
  });
});

describe('oauthLogin per-tenant provisioning', () => {
  /** Two tenants' IdPs asserting the same verified email. */
  function tenantPact(
    oauthIdentifier?: (id: string, profile: PactOAuthProfile) => string,
  ) {
    const users = new Map<string, PactStoredUser>();
    const idents = new Map<string, string>();
    const linked = new Map<string, string>();
    const provider = (redirectUri: string) => ({
      kind: 'GOOGLE' as const,
      clientId: 'cid',
      redirectUri,
      autoProvision: true,
    });
    const p = Pact.create({
      bits: { READ: 1n },
      modulePermissions: { Post: ['READ'] },
      hooks: {
        getUser: (q) => {
          const id = q.by === 'ID'
            ? q.id
            : q.by === 'IDENTIFIER'
            ? idents.get(q.identifier)
            : linked.get(`${q.provider}|${q.subject}`);
          return id === undefined ? null : users.get(id) ?? null;
        },
        createUser: (input) => {
          const user: PactStoredUser = {
            id: `u${users.size + 1}`,
            status: input.status,
            grants: input.grants,
          };
          users.set(user.id, user);
          idents.set(input.identifier, user.id);
          linked.set(
            `${input.oauth!.provider}|${input.oauth!.subject}`,
            user.id,
          );
          return user;
        },
        ...(oauthIdentifier === undefined ? {} : { oauthIdentifier }),
      },
      options: {
        cache: { ttl: { session: 5 } },
        oauth: {
          'acme:gw': provider('https://app.example.dev/acme'),
          'globex:gw': provider('https://app.example.dev/globex'),
        },
      },
    });
    for (const name of ['acme:gw', 'globex:gw']) {
      // deno-lint-ignore no-explicit-any
      (p as any).__oauth.get(name)._makeRequest = (o: { method: string }) =>
        o.method === 'POST' ? { status: 200, body: { access_token: 'at' } } : {
          status: 200,
          body: { sub: 'same-sub', email: 'ada@x.test', email_verified: true },
        };
    }
    const login = (name: string) =>
      p.oauthLogin(name, { code: 'c', state: 's' }, {
        state: 's',
        codeVerifier: 'v',
      });
    return { login, idents };
  }

  it('collides across tenants without the hook', async () => {
    const { login } = tenantPact();
    await login('acme:gw');
    await expectCode(login('globex:gw'), 'USER_EXISTS');
  });

  it('provisions one account per tenant through oauthIdentifier', async () => {
    const { login, idents } = tenantPact((id, profile) =>
      `${profile.provider.split(':')[0]}::${id}`
    );
    const acme = await login('acme:gw');
    const globex = await login('globex:gw');
    asserts.assertNotStrictEquals(acme.principal.id, globex.principal.id);
    asserts.assertEquals([...idents.keys()], [
      'acme::ada@x.test',
      'globex::ada@x.test',
    ]);
  });

  it('rejects an empty identifier from the hook', async () => {
    const { login } = tenantPact(() => '');
    await expectCode(login('acme:gw'), 'INVALID_OPTION');
  });
});

describe('OIDC discovery host guard', () => {
  /** An OIDC client whose discovery document declares `endpoints`. */
  function discovering(
    endpoints: Record<string, string>,
    discoveryHosts?: string[],
  ): OAuthClient {
    const client = new OAuthClient('sso', {
      kind: 'OIDC',
      clientId: 'cid',
      redirectUri: 'https://app.example.dev/cb',
      issuer: 'https://login.acme.example',
      ...(discoveryHosts === undefined ? {} : { discoveryHosts }),
    });
    // deno-lint-ignore no-explicit-any
    (client as any)._makeRequest = () => ({ status: 200, body: endpoints });
    return client;
  }
  const SAME_HOST = {
    authorization_endpoint: 'https://login.acme.example/authorize',
    token_endpoint: 'https://auth.login.acme.example/token',
    jwks_uri: 'https://login.acme.example/keys',
  };

  it('accepts endpoints on the issuer host or a subdomain of it', async () => {
    const { url } = await discovering(SAME_HOST).authorizationUrl();
    asserts.assert(url.startsWith('https://login.acme.example/authorize?'));
  });

  it('refuses an authorization, token, userinfo or JWKS endpoint on another host', async () => {
    for (
      const [field, kind] of [
        ['authorization_endpoint', 'authorization'],
        ['token_endpoint', 'token'],
        ['userinfo_endpoint', 'userinfo'],
        ['jwks_uri', 'jwks'],
      ]
    ) {
      const client = discovering({
        ...SAME_HOST,
        [field!]: 'https://evillogin.acme.example/x',
      });
      const error = await asserts.assertRejects(
        () => client.authorizationUrl(),
        PactError,
      );
      asserts.assertStrictEquals(error.code, 'OAUTH_EXCHANGE_FAILED');
      asserts.assertStringIncludes(
        error.message,
        `${kind} endpoint on 'evillogin.acme.example'`,
      );
    }
  });

  it('accepts a host listed in discoveryHosts', async () => {
    const client = discovering(
      { ...SAME_HOST, token_endpoint: 'https://tokens.acme-cdn.example/t' },
      ['tokens.acme-cdn.example'],
    );
    asserts.assert((await client.authorizationUrl()).url !== '');
  });
});

describe('verifyOAuth, email trust and verified-email linking', () => {
  const EXPECTED = { state: 's', codeVerifier: 'v' };
  const PARAMS = { code: 'c', state: 's' };

  /**
   * A pact over one provider whose stubbed GETs answer by path, plus the
   * links and sessions it writes.
   */
  function world(
    config: Record<string, unknown>,
    gets: Record<string, unknown>,
    hooks: { linkOAuth?: boolean } = {},
  ) {
    const users = new Map<string, PactStoredUser>([
      ['acct', { id: 'acct', status: 'ACTIVE', grants: '{}' }],
    ]);
    const identifiers = new Map([['ada@example.dev', 'acct']]);
    const linked = new Map<string, string>();
    const p = Pact.create({
      bits: { READ: 1n },
      modulePermissions: { Post: ['READ'] },
      hooks: {
        getUser: (q) => {
          if (q.by === 'ID') return users.get(q.id) ?? null;
          if (q.by === 'IDENTIFIER') {
            return users.get(identifiers.get(q.identifier) ?? '') ?? null;
          }
          return users.get(linked.get(`${q.provider}:${q.subject}`) ?? '') ??
            null;
        },
        ...(hooks.linkOAuth === false ? {} : {
          linkOAuth: (userId, link) => {
            linked.set(`${link.provider}:${link.subject}`, userId);
          },
        }),
      },
      options: {
        cache: { ttl: { session: 5 } },
        oauth: {
          idp: {
            clientId: 'cid',
            redirectUri: 'https://app.example.dev/cb',
            ...config,
          } as never,
        },
      },
    });
    // deno-lint-ignore no-explicit-any
    const client = (p as any).__oauth.get('idp');
    client._makeRequest = (opts: { method: string; path: string }) =>
      opts.method === 'POST'
        ? { status: 200, body: { access_token: 'at' } }
        : { status: 200, body: gets[opts.path] };
    return { pact: p, linked };
  }

  it('returns the identity without a session; null for an unlinked one', async () => {
    const { pact: p, linked } = world({ kind: 'GITHUB' }, {
      '/user': { id: 7, login: 'octo' },
    });
    const unlinked = await p.verifyOAuth('idp', PARAMS, EXPECTED);
    asserts.assertStrictEquals(unlinked.principal, null);
    asserts.assertStrictEquals(unlinked.profile.id, '7');
    linked.set('idp:7', 'acct');
    const known = await p.verifyOAuth('idp', PARAMS, EXPECTED);
    asserts.assertStrictEquals(known.principal?.id, 'acct');
    asserts.assertFalse(known.mfaRequired);
  });

  it("takes GitHub's verified primary address from /user/emails", async () => {
    const { pact: p } = world({ kind: 'GITHUB' }, {
      '/user': { id: 7, login: 'octo', email: 'public@example.dev' },
      '/user/emails': [
        { email: 'old@example.dev', primary: false, verified: true },
        { email: 'Ada@Example.dev', primary: true, verified: true },
      ],
    });
    const { profile } = await p.verifyOAuth('idp', PARAMS, EXPECTED);
    asserts.assertStrictEquals(profile.email, 'Ada@Example.dev');
    asserts.assert(profile.emailVerified);
    const unverified = world({ kind: 'GITHUB' }, {
      '/user': { id: 7, email: 'public@example.dev' },
      '/user/emails': [
        { email: 'public@example.dev', primary: true, verified: false },
      ],
    });
    const plain = await unverified.pact.verifyOAuth('idp', PARAMS, EXPECTED);
    asserts.assertFalse(plain.profile.emailVerified);
  });

  it('emailTrust overrides the provider claim either way', async () => {
    const gets = {
      '/v1/userinfo': { sub: 'g1', email: 'a@x.dev', email_verified: false },
    };
    const always = world({ kind: 'GOOGLE', emailTrust: 'ALWAYS' }, gets);
    asserts.assert(
      (await always.pact.verifyOAuth('idp', PARAMS, EXPECTED)).profile
        .emailVerified,
    );
    const never = world({ kind: 'GOOGLE', emailTrust: 'NEVER' }, {
      '/v1/userinfo': { sub: 'g1', email: 'a@x.dev', email_verified: true },
    });
    asserts.assertFalse(
      (await never.pact.verifyOAuth('idp', PARAMS, EXPECTED)).profile
        .emailVerified,
    );
    asserts.assertThrows(
      () => world({ kind: 'GOOGLE', emailTrust: 'SOMETIMES' }, gets),
      PactError,
    );
  });

  it('linkVerifiedEmail links a verified address to its account and never an unverified one', async () => {
    const verified = {
      '/v1/userinfo': {
        sub: 'g1',
        email: 'ada@example.dev',
        email_verified: true,
      },
    };
    const { pact: p, linked } = world(
      { kind: 'GOOGLE', linkVerifiedEmail: true },
      verified,
    );
    const first = await p.oauthLogin('idp', PARAMS, EXPECTED);
    asserts.assertStrictEquals(first.principal.id, 'acct');
    asserts.assertEquals([...linked], [['idp:g1', 'acct']]);

    const unverified = world({ kind: 'GOOGLE', linkVerifiedEmail: true }, {
      '/v1/userinfo': {
        sub: 'g2',
        email: 'ada@example.dev',
        email_verified: false,
      },
    });
    await expectCode(
      unverified.pact.oauthLogin('idp', PARAMS, EXPECTED),
      'OAUTH_UNLINKED',
    );
    asserts.assertEquals(unverified.linked.size, 0);

    const hookless = world(
      { kind: 'GOOGLE', linkVerifiedEmail: true },
      verified,
      { linkOAuth: false },
    );
    await expectCode(
      hookless.pact.verifyOAuth('idp', PARAMS, EXPECTED),
      'MISSING_HOOK',
    );
  });
});
