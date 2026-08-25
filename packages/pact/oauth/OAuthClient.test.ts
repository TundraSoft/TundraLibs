import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { issueJWT } from '@tundralibs/crypt/JWT';
import { OAuthClient } from './OAuthClient.ts';
import { PactDefinitionError, PactOAuthError } from '../errors/mod.ts';

/**
 * Cross-runtime fetch stub for the RESTler `_fetch` seam. Normalizes both
 * call shapes (`fetch(url, init)` and `fetch(new Request(...))`) and
 * records every request with its body text.
 */
function mockFetch(
  routes: Array<[string, (url: string, body: string) => Response]>,
) {
  const seen: Array<{ url: string; body: string }> = [];
  const fn = (async (input: unknown, init?: RequestInit) => {
    let url: string;
    let body = '';
    if (input instanceof Request) {
      url = input.url;
      body = await input.clone().text().catch(() => '');
      if (body === '' && init?.body !== undefined) body = String(init.body);
    } else {
      url = String(input);
      if (init?.body !== undefined) body = String(init.body);
    }
    seen.push({ url, body });
    for (const [prefix, respond] of routes) {
      if (url.startsWith(prefix)) return respond(url, body);
    }
    return new Response('not found', { status: 404 });
  }) as unknown as typeof globalThis.fetch;
  return { fn, seen };
}
const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
const setFetch = (client: OAuthClient, fn: typeof globalThis.fetch): void => {
  (client as unknown as { _fetch: typeof globalThis.fetch })._fetch = fn;
};

const GOOGLE_CONFIG = {
  provider: 'GOOGLE' as const,
  clientId: 'cid',
  clientSecret: 'cs',
  redirectUri: 'https://app.example.com/cb',
};

describe('pact.OAuthClient construction', () => {
  it('rejects an unknown provider preset', () => {
    const err = asserts.assertThrows(
      () =>
        new OAuthClient('x', {
          ...GOOGLE_CONFIG,
          provider: 'MYSPACE' as never,
        }),
      PactDefinitionError,
    );
    asserts.assertEquals(
      (err as PactDefinitionError).code,
      'UNKNOWN_PROVIDER',
    );
  });

  it('OIDC requires an https issuer', () => {
    asserts.assertThrows(
      () => new OAuthClient('sso', { ...GOOGLE_CONFIG, provider: 'OIDC' }),
      PactDefinitionError,
    );
    const err = asserts.assertThrows(
      () =>
        new OAuthClient('sso', {
          ...GOOGLE_CONFIG,
          provider: 'OIDC',
          issuer: 'http://plain.example.com',
        }),
      PactDefinitionError,
    );
    asserts.assertEquals((err as PactDefinitionError).code, 'INVALID_OPTION');
  });
});

describe('pact.OAuthClient authorizationUrl', () => {
  it('builds the redirect with PKCE, state, nonce, and declared claims', async () => {
    const client = new OAuthClient('google', {
      ...GOOGLE_CONFIG,
      claims: { birthdate: { from: 'birthdate', type: 'DATE' }, loc: 'locale' },
    });
    const { url, state, verifier, nonce } = await client.authorizationUrl();
    const parsed = new URL(url);
    asserts.assertEquals(
      parsed.origin + parsed.pathname,
      'https://accounts.google.com/o/oauth2/v2/auth',
    );
    asserts.assertEquals(parsed.searchParams.get('client_id'), 'cid');
    asserts.assertEquals(parsed.searchParams.get('state'), state);
    asserts.assertEquals(parsed.searchParams.get('nonce'), nonce);
    asserts.assertEquals(
      parsed.searchParams.get('code_challenge_method'),
      'S256',
    );
    asserts.assert(parsed.searchParams.get('code_challenge') !== null);
    asserts.assert(verifier.length >= 43); // PKCE floor
    // The DECLARED claims ride the OIDC claims request parameter.
    asserts.assertEquals(
      JSON.parse(parsed.searchParams.get('claims')!),
      { userinfo: { birthdate: null, locale: null } },
    );
  });

  it('honours state/scope overrides', async () => {
    const client = new OAuthClient('google', GOOGLE_CONFIG);
    const { url, state } = await client.authorizationUrl({
      state: 'held-by-app',
      scopes: ['openid'],
    });
    const parsed = new URL(url);
    asserts.assertEquals(state, 'held-by-app');
    asserts.assertEquals(parsed.searchParams.get('state'), 'held-by-app');
    asserts.assertEquals(parsed.searchParams.get('scope'), 'openid');
  });

  it('config authParams / options.params cannot override generated state or PKCE', async () => {
    const client = new OAuthClient('google', {
      ...GOOGLE_CONFIG,
      // A hostile (or careless) config must not be able to pin state/PKCE.
      authParams: {
        state: 'attacker-state',
        code_challenge: 'attacker-challenge',
        code_challenge_method: 'plain',
        redirect_uri: 'https://evil.example.com/cb',
        prompt: 'consent', // a legitimate non-colliding param survives
      },
    });
    const { url, state } = await client.authorizationUrl({
      params: {
        response_type: 'token', // implicit-flow downgrade attempt
        state: 'also-attacker',
      },
    });
    const p = new URL(url).searchParams;
    // Generated security params win over both app-supplied channels.
    asserts.assertEquals(p.get('state'), state);
    asserts.assertNotEquals(state, 'attacker-state');
    asserts.assertNotEquals(state, 'also-attacker');
    asserts.assertEquals(p.get('response_type'), 'code');
    asserts.assertEquals(p.get('code_challenge_method'), 'S256');
    asserts.assertNotEquals(p.get('code_challenge'), 'attacker-challenge');
    asserts.assert(p.get('code_challenge') !== null);
    asserts.assertEquals(p.get('redirect_uri'), 'https://app.example.com/cb');
    // A non-colliding custom param still rides along.
    asserts.assertEquals(p.get('prompt'), 'consent');
  });

  it('a non-OIDC provider (GitHub) gets no nonce/claims params', async () => {
    const client = new OAuthClient('github', {
      ...GOOGLE_CONFIG,
      provider: 'GITHUB',
      claims: { login: 'login' }, // ignored — GitHub does not speak OIDC claims
    });
    const parsed = new URL((await client.authorizationUrl()).url);
    asserts.assertEquals(parsed.searchParams.get('nonce'), null);
    asserts.assertEquals(parsed.searchParams.get('claims'), null);
  });

  it('an id_token provider (Apple) targets the id_token claims set and skips dot-paths', async () => {
    const client = new OAuthClient('apple', {
      ...GOOGLE_CONFIG,
      provider: 'APPLE',
      claims: {
        real_user_status: 'real_user_status',
        nested: { from: 'a.b.c' }, // dot-path → provider returns it on its own
      },
    });
    const parsed = new URL((await client.authorizationUrl()).url);
    asserts.assertEquals(
      JSON.parse(parsed.searchParams.get('claims')!),
      { id_token: { real_user_status: null } }, // targets id_token, no dot-path
    );
    asserts.assertEquals(parsed.searchParams.get('response_mode'), 'form_post');
  });
});

describe('pact.OAuthClient callback', () => {
  it('exchanges the code (form POST) and normalizes the profile + claims', async () => {
    const client = new OAuthClient('google', {
      ...GOOGLE_CONFIG,
      claims: { birthdate: { from: 'birthdate', type: 'DATE' }, loc: 'locale' },
    });
    const { fn, seen } = mockFetch([
      [
        'https://oauth2.googleapis.com/token',
        () => json({ access_token: 'at-1', expires_in: 3600 }),
      ],
      [
        'https://openidconnect.googleapis.com/v1/userinfo',
        () =>
          json({
            sub: 'g-123',
            email: 'a@x.io',
            email_verified: true,
            name: 'Ada',
            birthdate: '1990-05-17',
            locale: '  en-GB  ',
          }),
      ],
    ]);
    setFetch(client, fn);
    const profile = await client.callback({ code: 'c0de', verifier: 'v3r' });
    asserts.assertEquals(profile.provider, 'google');
    asserts.assertEquals(profile.id, 'g-123');
    asserts.assertEquals(profile.email, 'a@x.io');
    asserts.assertEquals(profile.tokens.accessToken, 'at-1');
    // declared claims: DATE cast + trimmed string, raw untouched
    asserts.assert(profile.claims!.birthdate instanceof Date);
    asserts.assertEquals(profile.claims!.loc, 'en-GB');
    asserts.assertEquals(profile.raw.locale, '  en-GB  ');
    // the exchange carried the code + PKCE verifier, form-encoded
    const exchange = seen.find((s) => s.url.includes('/token'))!;
    asserts.assert(exchange.body.includes('code=c0de'));
    asserts.assert(exchange.body.includes('code_verifier=v3r'));
    asserts.assert(exchange.body.includes('client_secret=cs'));
  });

  it('a public (PKCE-only) client sends no client_secret', async () => {
    const client = new OAuthClient('google', {
      provider: 'GOOGLE',
      clientId: 'cid',
      redirectUri: 'https://app.example.com/cb', // no clientSecret
    });
    const { fn, seen } = mockFetch([
      [
        'https://oauth2.googleapis.com/token',
        () => json({ access_token: 'at' }),
      ],
      [
        'https://openidconnect.googleapis.com/v1/userinfo',
        () => json({ sub: 'g-1' }),
      ],
    ]);
    setFetch(client, fn);
    await client.callback({ code: 'c', verifier: 'v' });
    const exchange = seen.find((s) => s.url.includes('/token'))!;
    asserts.assertFalse(exchange.body.includes('client_secret'));
  });

  it('fail-closed state check: mismatched or missing state rejects', async () => {
    const client = new OAuthClient('google', GOOGLE_CONFIG);
    for (const state of ['tampered', undefined]) {
      const err = await asserts.assertRejects(
        () =>
          client.callback({
            code: 'c',
            verifier: 'v',
            expectedState: 'held',
            state,
          }),
        PactOAuthError,
      );
      asserts.assertEquals(
        (err as PactOAuthError).code,
        'OAUTH_STATE_MISMATCH',
      );
    }
  });

  it('a failed exchange surfaces OAUTH_EXCHANGE_FAILED', async () => {
    const client = new OAuthClient('google', GOOGLE_CONFIG);
    const { fn } = mockFetch([
      [
        'https://oauth2.googleapis.com/token',
        () => json({ error: 'invalid_grant' }, 400),
      ],
    ]);
    setFetch(client, fn);
    const err = await asserts.assertRejects(
      () => client.callback({ code: 'bad', verifier: 'v' }),
      PactOAuthError,
    );
    asserts.assertEquals(
      (err as PactOAuthError).code,
      'OAUTH_EXCHANGE_FAILED',
    );
  });

  it('a subject-less profile fails closed (no fabricated principal id)', async () => {
    const client = new OAuthClient('google', GOOGLE_CONFIG);
    const { fn } = mockFetch([
      [
        'https://oauth2.googleapis.com/token',
        () => json({ access_token: 'at' }),
      ],
      [
        'https://openidconnect.googleapis.com/v1/userinfo',
        () => json({ email: 'no-subject@x.io' }),
      ],
    ]);
    setFetch(client, fn);
    const err = await asserts.assertRejects(
      () => client.callback({ code: 'c', verifier: 'v' }),
      PactOAuthError,
    );
    asserts.assertEquals(
      (err as PactOAuthError).code,
      'OAUTH_PROFILE_FAILED',
    );
  });
});

describe('pact.OAuthClient OIDC discovery', () => {
  const ISSUER = 'https://sso.example.com';
  const DISCOVERY = {
    authorization_endpoint: `${ISSUER}/auth`,
    token_endpoint: `${ISSUER}/token`,
    userinfo_endpoint: `${ISSUER}/userinfo`,
    jwks_uri: `${ISSUER}/jwks`,
  };

  it('discovers endpoints once and caches them', async () => {
    const client = new OAuthClient('sso', {
      ...GOOGLE_CONFIG,
      provider: 'OIDC',
      issuer: ISSUER,
    });
    const { fn, seen } = mockFetch([
      [`${ISSUER}/.well-known`, () => json(DISCOVERY)],
      [`${ISSUER}/token`, () => json({ access_token: 'at' })],
      [`${ISSUER}/userinfo`, () => json({ sub: 'sso-1' })],
    ]);
    setFetch(client, fn);
    await client.callback({ code: 'c', verifier: 'v' });
    await client.callback({ code: 'c2', verifier: 'v2' });
    const discoveries = seen.filter((s) => s.url.includes('.well-known'));
    asserts.assertEquals(discoveries.length, 1); // cached after first use
  });

  it('rejects a discovery document declaring a plaintext endpoint', async () => {
    const client = new OAuthClient('sso', {
      ...GOOGLE_CONFIG,
      provider: 'OIDC',
      issuer: ISSUER,
    });
    const { fn } = mockFetch([
      [
        `${ISSUER}/.well-known`,
        () =>
          json({ ...DISCOVERY, token_endpoint: 'http://sso.example.com/t' }),
      ],
    ]);
    setFetch(client, fn);
    const err = await asserts.assertRejects(
      () => client.callback({ code: 'c', verifier: 'v' }),
      PactOAuthError,
    );
    asserts.assertEquals(
      (err as PactOAuthError).code,
      'OAUTH_EXCHANGE_FAILED',
    );
  });

  it('serves stale endpoints when a past-TTL rediscovery fails', async () => {
    const client = new OAuthClient('sso', {
      ...GOOGLE_CONFIG,
      provider: 'OIDC',
      issuer: ISSUER,
    });
    let discoveryUp = true;
    const { fn, seen } = mockFetch([
      [
        `${ISSUER}/.well-known`,
        () => (discoveryUp ? json(DISCOVERY) : json({}, 503)),
      ],
      [`${ISSUER}/token`, () => json({ access_token: 'at' })],
      [`${ISSUER}/userinfo`, () => json({ sub: 'sso-1' })],
    ]);
    setFetch(client, fn);
    // First login discovers + caches the endpoints.
    await client.callback({ code: 'c', verifier: 'v' });
    // Age the cache past the TTL and take discovery down.
    (client as unknown as { __discoveredAt: number }).__discoveredAt = 0;
    discoveryUp = false;
    // Rediscovery is attempted and fails (503); the still-valid cached
    // endpoints must carry the login rather than hard-failing it.
    const profile = await client.callback({ code: 'c2', verifier: 'v2' });
    asserts.assertEquals(profile.id, 'sso-1');
    // Rediscovery was re-attempted (not silently pinned to stale) — the
    // unadvanced `__discoveredAt` keeps each __endpoints() call trying while
    // it degrades, so the count climbs past the single initial discovery.
    const discoveries = seen.filter((s) => s.url.includes('.well-known'));
    asserts.assert(discoveries.length >= 2);
  });
});

describe('pact.OAuthClient id_token identity (userinfo-less)', () => {
  const ISSUER = 'https://sso.example.com';
  // Discovery WITHOUT a userinfo_endpoint → identity comes from the id_token.
  const DISCOVERY = {
    authorization_endpoint: `${ISSUER}/auth`,
    token_endpoint: `${ISSUER}/token`,
    jwks_uri: `${ISSUER}/jwks`,
  };
  const config = {
    provider: 'OIDC' as const,
    clientId: 'cid',
    clientSecret: 'cs',
    redirectUri: 'https://app.example.com/cb',
    issuer: ISSUER,
  };
  const idToken = (claims: Record<string, unknown>) =>
    issueJWT('HS256', {
      iss: ISSUER,
      aud: 'cid',
      exp: Math.floor(Date.now() / 1000) + 3600,
      ...claims,
    }, 'irrelevant-when-jwks-unreachable');

  const flow = (jwksResponder: () => Response, token: string) =>
    mockFetch([
      [`${ISSUER}/.well-known`, () => json(DISCOVERY)],
      [`${ISSUER}/token`, () => json({ access_token: 'at', id_token: token })],
      [`${ISSUER}/jwks`, jwksResponder],
    ]);

  it('PREFERRED (default) degrades to claim-validated decoding when JWKS is unreachable', async () => {
    const degraded: string[] = [];
    const client = new OAuthClient('sso', config, (r) => degraded.push(r));
    const { fn } = flow(
      () => new Response('boom', { status: 500 }),
      await idToken({ sub: 'oidc-1', email: 'a@x.io' }),
    );
    setFetch(client, fn);
    const profile = await client.callback({ code: 'c', verifier: 'v' });
    asserts.assertEquals(profile.id, 'oidc-1');
    asserts.assertEquals(profile.email, 'a@x.io');
    asserts.assertEquals(degraded.length, 1); // the downgrade was reported
  });

  it('REQUIRED makes an unreachable JWKS fatal (OAUTH_JWKS_UNAVAILABLE)', async () => {
    const client = new OAuthClient('sso', {
      ...config,
      idTokenVerification: 'REQUIRED',
    });
    const { fn } = flow(
      () => new Response('boom', { status: 500 }),
      await idToken({ sub: 'oidc-1' }),
    );
    setFetch(client, fn);
    const err = await asserts.assertRejects(
      () => client.callback({ code: 'c', verifier: 'v' }),
      PactOAuthError,
    );
    asserts.assertEquals(
      (err as PactOAuthError).code,
      'OAUTH_JWKS_UNAVAILABLE',
    );
  });

  it('a bad claim is fatal even on the degraded path (OAUTH_IDTOKEN_INVALID)', async () => {
    const client = new OAuthClient('sso', config);
    const { fn } = flow(
      () => new Response('boom', { status: 500 }),
      await idToken({ sub: 'oidc-1', aud: 'someone-else' }), // wrong audience
    );
    setFetch(client, fn);
    const err = await asserts.assertRejects(
      () => client.callback({ code: 'c', verifier: 'v' }),
      PactOAuthError,
    );
    asserts.assertEquals(
      (err as PactOAuthError).code,
      'OAUTH_IDTOKEN_INVALID',
    );
  });

  it('a nonce mismatch is rejected when expectedNonce is supplied', async () => {
    const client = new OAuthClient('sso', config);
    const { fn } = flow(
      () => new Response('boom', { status: 500 }),
      await idToken({ sub: 'oidc-1', nonce: 'real-nonce' }),
    );
    setFetch(client, fn);
    const err = await asserts.assertRejects(
      () =>
        client.callback({
          code: 'c',
          verifier: 'v',
          expectedNonce: 'attacker-nonce',
        }),
      PactOAuthError,
    );
    asserts.assertEquals(
      (err as PactOAuthError).code,
      'OAUTH_IDTOKEN_INVALID',
    );
  });
});
