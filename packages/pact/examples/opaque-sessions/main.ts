/**
 * Password login + OPAQUE sessions with instant, store-backed revocation.
 *
 * The opaque strategy keeps sessions in YOUR store instead of signing a JWT.
 * The token is just an opaque id — deleting its record kills the session
 * immediately, no waiting for an expiry. Swap the `hooks` for your database
 * and the shape is unchanged. (Because opaque sessions are store-backed, not
 * signed, no `secret` is needed.)
 *
 * Run:
 *   deno run packages/pact/examples/opaque-sessions/main.ts
 *   bun run  packages/pact/examples/opaque-sessions/main.ts
 *   node --import tsx packages/pact/examples/opaque-sessions/main.ts
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
  // No `secret` — OPAQUE sessions live in the store, they are not signed.
  password: true,
  session: { strategy: 'OPAQUE', ttl: 3600 },
  hooks: {
    getUser,
    createUser,
    // OPAQUE needs get/save/delete; logoutAll adds deleteUserSessions.
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
  },
});

// ── register → login → verify → revoke ────────────────────────────────
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
// The token is an opaque session id — NOT a JWT (no dots, no payload).
console.log('opaque token is not a JWT:', !login.token.includes('.'));
console.log('no refresh token for OPAQUE:', login.refreshToken === undefined);

const principal = await pact.verify(login.token);
console.log('verified principal', principal?.id, principal?.status);
console.log('can EDIT Post?', pact.can(principal, 'Post', 'EDIT')); // true

// logout deletes the store record — the token dies THE INSTANT it is gone,
// with no wait for expiry. This is the key contrast with a signed JWT.
await pact.logout(login.token);
console.log('after logout, verify →', await pact.verify(login.token)); // null

// ── logoutAll: kill every session for a user at once ──────────────────
const a = await pact.login('password', {
  identifier: 'alice@example.com',
  password: 'correct horse battery staple',
});
const b = await pact.login('password', {
  identifier: 'alice@example.com',
  password: 'correct horse battery staple',
});
if (a === null || b === null) throw new Error('logins should have succeeded');
console.log(
  'two live sessions verify:',
  (await pact.verify(a.token)) !== null,
  (await pact.verify(b.token)) !== null,
);

await pact.logoutAll(alice.id); // deletes ALL of alice's session records
console.log(
  'after logoutAll, both verify →',
  await pact.verify(a.token),
  await pact.verify(b.token),
); // null null
