/**
 * Opaque static bearer tokens — the `TOKEN` scheme.
 *
 * Issue long-lived personal-access-style tokens, authenticate them, and watch
 * the expiry / revocation / unknown-token gates all resolve to `null`. Backed
 * by in-memory `Map`s; swap the `hooks` for your database and the shape holds.
 *
 * Run:
 *   deno run packages/pact/examples/simple-tokens/main.ts
 *   bun run  packages/pact/examples/simple-tokens/main.ts
 *   node --import tsx packages/pact/examples/simple-tokens/main.ts
 */

import { Pact } from '@tundralibs/pact';
import type {
  PactStoredToken,
  PactStoredUser,
  PactUserQuery,
} from '@tundralibs/pact/types';

// ── in-memory stores standing in for YOUR database ────────────────────
const users = new Map<string, PactStoredUser>([
  // grants are decimal-string masks; '1' = the READ bit defined below
  ['u1', { id: 'u1', grants: { Post: '1' }, status: 'ACTIVE' }],
]);
// keyed by the token's sha-256 hash — the raw token is NEVER stored
const tokens = new Map<string, PactStoredToken>();

// keep a handle on the last record pact stored, so the demo can revoke it
let lastStored: PactStoredToken | undefined;

const pact = Pact.create({
  // authorization: module × action over BigInt masks
  bits: { READ: 1n, EDIT: 2n },
  modules: { Post: ['READ', 'EDIT'] },
  // the TOKEN scheme + issueToken() — no `secret` needed (nothing is signed)
  tokens: true,
  hooks: {
    getUser: (q: PactUserQuery): PactStoredUser | null =>
      q.by === 'ID' ? users.get(q.id) ?? null : null,
    // pact hands us the sha-256 hash to look up — not the token
    getToken: (tokenHash: string): PactStoredToken | null =>
      tokens.get(tokenHash) ?? null,
    saveToken: (record: PactStoredToken): void => {
      tokens.set(record.hash, record);
      lastStored = record;
    },
  },
});

// ── (a) a non-expiring token authenticates to its principal ───────────
// issueToken returns the token ONCE; pact persists only its sha-256 hash.
const { token: liveToken } = await pact.issueToken('u1');
const principal = await pact.authenticate({
  scheme: 'TOKEN',
  token: liveToken,
});
console.log(
  '(a) authenticated:',
  principal?.id,
  '— can READ Post?',
  pact.can(principal, 'Post', 'READ'), // true
  '— can EDIT Post?',
  pact.can(principal, 'Post', 'EDIT'), // false (grant is READ-only)
);

// ── (b) an already-past expiry gates to null ──────────────────────────
const { token: expiredToken } = await pact.issueToken('u1', {
  expiresAt: Date.now() - 1_000, // one second in the past
});
console.log(
  '(b) expired token →',
  await pact.authenticate({ scheme: 'TOKEN', token: expiredToken }), // null
);

// ── (c) revoking a live token gates to null on the next check ─────────
const { token: doomedToken } = await pact.issueToken('u1');
const record = lastStored!; // the record pact just stored for doomedToken
console.log(
  '(c) before revoke →',
  (await pact.authenticate({ scheme: 'TOKEN', token: doomedToken }))?.id, // u1
);
record.revokedAt = Date.now(); // your store flips the flag; pact re-reads it
console.log(
  '(c) after revoke  →',
  await pact.authenticate({ scheme: 'TOKEN', token: doomedToken }), // null
);

// ── (d) a made-up token is just an unknown hash → null ────────────────
console.log(
  '(d) made-up token →',
  await pact.authenticate({ scheme: 'TOKEN', token: 'pact_tk_not-real' }), // null
);
