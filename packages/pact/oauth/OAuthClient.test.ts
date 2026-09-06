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
import type { PactStoredUser } from '../types/mod.ts';

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
