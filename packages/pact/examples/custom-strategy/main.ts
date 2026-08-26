/**
 * Custom login strategy — the `strategies` escape hatch.
 *
 * Some login methods pact does NOT verify itself: LDAP, SSO, or — here — a
 * one-time "magic link" that an email service already validated. You verify
 * the credential however you like and hand pact a typed result; pact mints a
 * normal JWT session from it. The rule: pact-verifies → hook; externally
 * verified → strategy.
 *
 * Run:
 *   deno run packages/pact/examples/custom-strategy/main.ts
 *   bun run  packages/pact/examples/custom-strategy/main.ts
 *   node --import tsx packages/pact/examples/custom-strategy/main.ts
 */

import { Pact } from '@tundralibs/pact';
import type {
  PactStoredUser,
  PactStrategy,
  PactUserQuery,
} from '@tundralibs/pact/types';

// ── in-memory stores standing in for YOUR database + link service ─────
const usersById = new Map<string, PactStoredUser>([
  ['u1', { id: 'u1', grants: { Post: '1' }, status: 'ACTIVE' }],
]);
// The mock magic-link store: a single-use token → the user it logs in.
const magicTokens = new Map<string, string>();

// `verify()` resolves the principal by ID from the minted token, so getUser
// is still required — even though the strategy itself supplies the user, so
// the login path never calls this.
const getUser = (q: PactUserQuery): PactStoredUser | null =>
  q.by === 'ID' ? usersById.get(q.id) ?? null : null;

// The strategy: pact hands it whatever `login()` was called with. It returns
// the typed union — `{ ok: true, user }` to mint a session, or `{ ok: false }`
// to reject cleanly. A THROWN error is different (see the replay note below).
const magiclink: PactStrategy = (credentials) => {
  const token = (credentials as { token?: unknown })?.token;
  if (typeof token !== 'string') return { ok: false, reason: 'no token' };
  const userId = magicTokens.get(token);
  if (userId === undefined) return { ok: false, reason: 'invalid or used link' };
  const user = usersById.get(userId);
  if (user === undefined) return { ok: false, reason: 'invalid or used link' };
  magicTokens.delete(token); // single-use: consume the link so it can't replay
  return { ok: true, user };
};

const pact = Pact.create({
  // authorization: module × action over BigInt masks
  bits: { READ: 1n, EDIT: 2n, DELETE: 4n },
  modules: { Post: ['READ', 'EDIT', 'DELETE'] },
  // ⚠️ A JWT session is minted, so `secret` is required — load it from a
  // secret manager in real code, and keep it ≥ 32 bytes for HS256.
  secret: 'dev-only-hs256-secret-change-me!!',
  issuer: 'example-api',
  // the escape hatch: named methods pact does not verify itself
  strategies: { magiclink },
  hooks: { getUser },
});

// ── issue a link → log in with it → verify → authorize ───────────────
// The email/SMS service (not pact) minted and delivered this token.
const magicToken = 'mlink-2f9c1a';
magicTokens.set(magicToken, 'u1');

const login = await pact.login('magiclink', { token: magicToken });
if (login === null) throw new Error('login should have succeeded');
console.log('logged in as', login.principal.id, '— session minted');

const principal = await pact.verify(login.token);
console.log('verified principal', principal?.id, principal?.status);
console.log('can READ Post?  ', pact.can(principal, 'Post', 'READ')); // true
console.log('can DELETE Post?', pact.can(principal, 'Post', 'DELETE')); // false

// ── the link is single-use — replaying it fails cleanly ──────────────
// A strategy that returns `{ ok: false }` resolves to null and emits
// `loginFailed` with NO error. (Only an operational THROW inside the strategy
// rethrows out of login() and emits `loginFailed` WITH the error.)
console.log(
  'replay same link →',
  await pact.login('magiclink', { token: magicToken }), // null — consumed
);
console.log(
  'unknown link    →',
  await pact.login('magiclink', { token: 'mlink-nope' }), // null — never issued
);
