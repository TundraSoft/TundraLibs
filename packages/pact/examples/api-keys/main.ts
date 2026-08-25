/**
 * Issue API keys and authenticate with the `APIKEY` scheme.
 *
 * Mint a key for a user, authenticate a presented `keyId` + `secret`, scope a
 * key to fewer permissions than its owner, and revoke it — all backed by an
 * in-memory store. Swap the `hooks` for your database and the shape is
 * unchanged.
 *
 * Run:
 *   deno run packages/pact/examples/api-keys/main.ts
 *   bun run  packages/pact/examples/api-keys/main.ts
 *   node --import tsx packages/pact/examples/api-keys/main.ts
 */

import { Pact } from '@tundralibs/pact';
import type { PactStoredApiKey, PactStoredUser, PactUserQuery } from '@tundralibs/pact/types';

// ── an in-memory store standing in for YOUR database ──────────────────
const users = new Map<string, PactStoredUser>();
const apiKeys = new Map<string, PactStoredApiKey>();

// Seed one user directly: grants `{ Post: '1' }` = READ only (mask `1`).
users.set('u1', { id: 'u1', grants: { Post: '1' }, status: 'ACTIVE' });

// getUser resolves a principal by id — the APIKEY path only needs `by: 'ID'`.
const getUser = (q: PactUserQuery): PactStoredUser | null =>
  q.by === 'ID' ? users.get(q.id) ?? null : null;

// pact hands `saveApiKey` a record whose `secretHash` is ALREADY sha-256'd —
// hooks never see the plaintext secret.
const saveApiKey = (record: PactStoredApiKey): void => {
  apiKeys.set(record.id, record);
};
const getApiKey = (keyId: string): PactStoredApiKey | null => apiKeys.get(keyId) ?? null;
const revokeApiKey = (keyId: string): void => {
  const record = apiKeys.get(keyId);
  if (record !== undefined) record.revokedAt = Date.now();
};

const pact = Pact.create({
  // authorization: module × action over BigInt masks
  bits: { READ: 1n, EDIT: 2n, DELETE: 4n },
  modules: { Post: ['READ', 'EDIT', 'DELETE'] },
  // `apiKeys: true` enables the APIKEY + HMAC schemes and `issueApiKey()`. No
  // `secret` is needed — the APIKEY scheme signs nothing; it hashes and
  // constant-time-compares a per-request secret.
  apiKeys: true,
  hooks: { getUser, getApiKey, saveApiKey, revokeApiKey },
});

// ── issue → authenticate → scope → revoke ────────────────────────────

// The plaintext `secret` is returned ONCE and is unrecoverable — pact stored
// only its sha-256 hash via saveApiKey. Lose it and you must issue a new key.
const key = await pact.issueApiKey('u1');
console.log('issued key', key.id);
console.log('secret shown once:', key.secret.slice(0, 12) + '…');
console.log('store holds only the hash:', apiKeys.get(key.id)?.secretHash?.slice(0, 12) + '…');

// A correct keyId + secret authenticates → a principal carrying the user's
// grants (the key had none of its own, so it inherits READ on Post).
const principal = await pact.authenticate({ scheme: 'APIKEY', keyId: key.id, secret: key.secret });
console.log('authenticated principal', principal?.id);
console.log('can READ Post? ', pact.can(principal, 'READ', 'Post')); // true
console.log('can EDIT Post? ', pact.can(principal, 'EDIT', 'Post')); // false — user is READ-only

// A wrong secret resolves to null (constant-time compare), never an exception.
console.log(
  'wrong secret →',
  await pact.authenticate({ scheme: 'APIKEY', keyId: key.id, secret: 'not-the-secret' }),
);

// An unknown key id also resolves to null.
console.log(
  'unknown key →',
  await pact.authenticate({ scheme: 'APIKEY', keyId: 'pact_ak_nope', secret: 'whatever' }),
);

// A key can be SCOPED to its own grants, overriding the owner's. Here the key
// gets READ|EDIT (mask `3`) even though user u1 only has READ.
const scoped = await pact.issueApiKey('u1', { grants: { Post: 3n } });
const scopedPrincipal = await pact.authenticate({
  scheme: 'APIKEY',
  keyId: scoped.id,
  secret: scoped.secret,
});
console.log('scoped key can EDIT Post? ', pact.can(scopedPrincipal, 'EDIT', 'Post')); // true
console.log('scoped key can DELETE Post?', pact.can(scopedPrincipal, 'DELETE', 'Post')); // false

// Revoke the key (stamp `revokedAt` in the store) — authentication now fails.
console.log('before revoke →', (await pact.authenticate({
  scheme: 'APIKEY',
  keyId: scoped.id,
  secret: scoped.secret,
})) !== null);
revokeApiKey(scoped.id);
console.log('after revoke →', await pact.authenticate({
  scheme: 'APIKEY',
  keyId: scoped.id,
  secret: scoped.secret,
})); // null
