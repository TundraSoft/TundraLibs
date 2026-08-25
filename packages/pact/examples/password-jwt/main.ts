/**
 * Password login + JWT sessions with refresh-token rotation.
 *
 * The canonical getting-started flow: register → login → verify → authorize →
 * refresh → logout, backed by an in-memory store. Swap the `hooks` for your
 * database and it is production-shaped (mind the secret — see the note below).
 *
 * Run:
 *   deno run packages/pact/examples/password-jwt/main.ts
 *   bun run  packages/pact/examples/password-jwt/main.ts
 *   node --import tsx packages/pact/examples/password-jwt/main.ts
 */

import { Pact } from '@tundralibs/pact';
import type {
  PactNewUser,
  PactStoredSession,
  PactStoredUser,
  PactUserQuery,
} from '@tundralibs/pact/types';

// ── an in-memory store standing in for YOUR database ──────────────────
const usersById = new Map<string, PactStoredUser>();
const idByIdentifier = new Map<string, string>();
const sessions = new Map<string, PactStoredSession>();
let nextId = 1;

const getUser = (q: PactUserQuery): PactStoredUser | null => {
  if (q.by === 'ID') return usersById.get(q.id) ?? null;
  if (q.by === 'IDENTIFIER') {
    const id = idByIdentifier.get(q.identifier);
    return id !== undefined ? usersById.get(id) ?? null : null;
  }
  return null; // no OAuth in this example
};

const createUser = (draft: PactNewUser): PactStoredUser => {
  const id = `u${nextId++}`;
  // `draft.secret` is ALREADY pbkdf2-hashed by pact — store it verbatim.
  const user: PactStoredUser = {
    id,
    secret: draft.secret,
    grants: draft.grants,
    metadata: draft.metadata,
    status: 'ACTIVE',
  };
  usersById.set(id, user);
  if (draft.identifier !== undefined) idByIdentifier.set(draft.identifier, id);
  return user;
};

const pact = Pact.create({
  // authorization: module × action over BigInt masks
  bits: { READ: 1n, EDIT: 2n, DELETE: 4n, PUBLISH: 8n },
  modules: { Post: ['READ', 'EDIT', 'DELETE', 'PUBLISH'] },
  // ⚠️ Load this from an env var / secret manager in real code — never
  // hardcode or commit it. HS256 requires ≥ 32 bytes (RFC 7518 §3.2).
  secret: 'dev-only-hs256-secret-change-me!!',
  issuer: 'example-api',
  password: true,
  // short access token + a rotating refresh family behind it
  session: { ttl: 900, refresh: {} },
  hooks: {
    getUser,
    createUser,
    saveSession: (s) => {
      sessions.set(s.id, s);
    },
    getSession: (id) => sessions.get(id) ?? null,
    deleteSession: (id) => {
      sessions.delete(id);
    },
  },
});

// ── register → login → verify → authorize → refresh → logout ─────────
const alice = await pact.register({
  identifier: 'alice@example.com',
  password: 'correct horse battery staple',
  grants: { Post: '3' }, // READ|EDIT, as a decimal-string mask
});
console.log('registered', alice.id, 'grants', alice.grants);

const login = await pact.login('password', {
  identifier: 'alice@example.com',
  password: 'correct horse battery staple',
});
if (login === null) throw new Error('login should have succeeded');
console.log('logged in — refresh token issued:', login.refreshToken !== undefined);

// a wrong password resolves to null (never throws)
console.log(
  'wrong password →',
  await pact.login('password', {
    identifier: 'alice@example.com',
    password: 'nope',
  }),
);

const principal = await pact.verify(login.token);
console.log('verified principal', principal?.id, principal?.status);

console.log('can READ Post?  ', pact.can(principal, 'READ', 'Post')); // true
console.log('can DELETE Post?', pact.can(principal, 'DELETE', 'Post')); // false
try {
  pact.assert(principal, 'DELETE', 'Post');
} catch (err) {
  console.log('assert DELETE denied:', (err as Error).message);
}

// rotate the session without re-authenticating — the refresh token's
// generation is bumped (so it changes), and the fresh access token verifies
const rotated = await pact.refresh(login.refreshToken!);
if (rotated === null) throw new Error('refresh should have succeeded');
console.log('rotated — refresh token changed:', rotated.refreshToken !== login.refreshToken);
console.log('new access token verifies:', (await pact.verify(rotated.token)) !== null);

// logout kills the whole family; the old refresh token is now dead
await pact.logout(rotated.token);
console.log('after logout, refresh →', await pact.refresh(rotated.refreshToken!)); // null
