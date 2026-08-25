/**
 * OAuth 2.0 / OIDC login — the redirect-URL half (runnable offline) plus the
 * first-login account-linking policy that pact deliberately leaves to you.
 *
 * The code→token exchange itself talks to the live provider, so it runs in
 * your callback route, not here — see the note at the bottom. What this file
 * demonstrates end-to-end offline: generating the authorization URL with its
 * CSRF `state`, PKCE `verifier`, and OIDC `nonce`; and the `createUser` linking
 * decision pact hands you on a first federated login.
 *
 * Run:
 *   deno run packages/pact/examples/oauth-login/main.ts
 *   bun run  packages/pact/examples/oauth-login/main.ts
 *   node --import tsx packages/pact/examples/oauth-login/main.ts
 */

import { Pact } from '@tundralibs/pact';
import type { PactNewUser, PactStoredUser } from '@tundralibs/pact/types';

// ── in-memory store standing in for YOUR database ─────────────────────
const usersById = new Map<string, PactStoredUser>();
const idByEmail = new Map<string, string>();
let nextId = 1;
// a pre-existing password account, to show verified-email linking
usersById.set('u1', {
  id: 'u1',
  status: 'ACTIVE',
  metadata: { email: 'alice@example.com' },
});
idByEmail.set('alice@example.com', 'u1');

// The first-login policy is just a function you write. Link to an existing
// account ONLY by a provider-VERIFIED email, otherwise create. Silent linking
// on an UNVERIFIED email is a classic account-takeover vector — which is why
// pact makes this YOUR decision instead of baking one in.
const linkOrCreate = (draft: PactNewUser): PactStoredUser => {
  const oauth = draft.oauth;
  if (oauth !== undefined && oauth.profile.emailVerified === true) {
    const existingId = idByEmail.get(oauth.profile.email ?? '');
    if (existingId !== undefined) {
      const existing = usersById.get(existingId)!;
      existing.metadata = {
        ...existing.metadata,
        oauth: `${oauth.provider}:${oauth.subject}`,
      };
      return existing; // linked to the existing account
    }
  }
  const id = `u${++nextId}`;
  const user: PactStoredUser = {
    id,
    status: 'ACTIVE',
    metadata: {
      email: oauth?.profile.email,
      oauth: oauth !== undefined
        ? `${oauth.provider}:${oauth.subject}`
        : undefined,
    },
  };
  usersById.set(id, user);
  return user; // brand-new account
};

const pact = Pact.create({
  bits: { READ: 1n, EDIT: 2n },
  secret: 'dev-only-hs256-secret-change-me!!', // load from env in production
  oauth: {
    // every key is a login method; `provider` picks the preset
    google: {
      provider: 'GOOGLE',
      clientId: 'your-google-client-id',
      clientSecret: 'your-google-client-secret',
      redirectUri: 'https://app.example.com/auth/google/callback',
      scopes: ['openid', 'email', 'profile'],
    },
  },
  hooks: {
    getUser: (q) => {
      if (q.by === 'ID') return usersById.get(q.id) ?? null;
      if (q.by === 'OAUTH') {
        return [...usersById.values()].find(
          (u) => u.metadata?.oauth === `${q.provider}:${q.subject}`,
        ) ?? null;
      }
      return null;
    },
    createUser: linkOrCreate,
  },
});

// ── 1. start the flow: build the redirect URL (no network) ───────────
const { url, state, verifier, nonce } = await pact.oauthRedirect('google');
const parsed = new URL(url);
console.log('authorization URL:', parsed.origin + parsed.pathname);
console.log('  code_challenge (PKCE):', parsed.searchParams.has('code_challenge'));
console.log('  state (CSRF) matches: ', parsed.searchParams.get('state') === state);
console.log('  nonce (OIDC replay):  ', parsed.searchParams.get('nonce') === nonce);
console.log('hold state/verifier/nonce for the callback (single-use, per-session):');
console.log('  state', state.slice(0, 10) + '…', 'verifier len', verifier.length);

// ── 2. the first-login linking policy (runnable, no network) ──────────
const linkDraft: PactNewUser = {
  oauth: {
    provider: 'google',
    subject: 'google-sub-123',
    profile: {
      provider: 'google',
      id: 'google-sub-123',
      email: 'alice@example.com', // matches the existing password account
      emailVerified: true,
      raw: {},
      tokens: { accessToken: 't', raw: {} },
    },
  },
};
const createDraft: PactNewUser = {
  oauth: {
    provider: 'google',
    subject: 'google-sub-999',
    profile: {
      provider: 'google',
      id: 'google-sub-999',
      email: 'brand-new@example.com',
      emailVerified: true,
      raw: {},
      tokens: { accessToken: 't', raw: {} },
    },
  },
};
console.log('verified-email draft links to existing account:', linkOrCreate(linkDraft).id === 'u1');
console.log('unknown-email draft creates a new account:     ', linkOrCreate(createDraft).id !== 'u1');

// ── 3. the callback (needs the live provider — not run here) ──────────
// In your `${redirectUri}` route you finish the flow with:
//
//   const result = await pact.login('google', {
//     code: query.code,
//     verifier,               // the PKCE verifier you stored
//     state: query.state,
//     expectedState: state,   // fail-closed CSRF guard  (MANDATORY)
//     expectedNonce: nonce,   // fail-closed replay guard (MANDATORY)
//   });
//
// pact exchanges the code, verifies the id_token against the provider JWKS,
// runs getUser({by:'OAUTH'}) → createUser (the policy above), and mints a
// normal pact session; `result.profile` carries the fresh verified profile.
console.log('callback step runs against the live provider — see the comment above');
