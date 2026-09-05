/**
 * In-memory storage hooks for the passkey-signin example: passwordless
 * users plus the four passkey hooks. Real apps back these with the
 * tables in docs/Pact-Storage.md; the shapes are the same.
 */
import {
  type PactHooks,
  type PactStoredPasskey,
  type PactStoredUser,
  serializeGrants,
} from '@tundralibs/pact';

export type Modules = 'Notes';

const users = new Map<string, PactStoredUser>();
const byIdentifier = new Map<string, string>();
const passkeys = new Map<string, PactStoredPasskey>();
let seq = 0;

/** Create a new user; null when the username is taken — the route
 * answers 409, never an existing account's id. */
export function createUser(username: string): PactStoredUser | null {
  if (byIdentifier.has(username)) return null;
  const user: PactStoredUser = {
    id: `u${++seq}`,
    status: 'ACTIVE',
    grants: serializeGrants({ Notes: 1n }),
    metadata: { username },
  };
  users.set(user.id, user);
  byIdentifier.set(username, user.id);
  return user;
}

export function passkeyCount(userId: string): number {
  return [...passkeys.values()].filter((p) => p.userId === userId).length;
}

export const hooks: PactHooks<Modules> = {
  getUser: (query) => {
    if (query.by === 'ID') return users.get(query.id) ?? null;
    if (query.by === 'IDENTIFIER') {
      const id = byIdentifier.get(query.identifier);
      return id === undefined ? null : users.get(id) ?? null;
    }
    return null;
  },
  getPasskey: (id) => passkeys.get(id) ?? null,
  getPasskeys: (userId) =>
    [...passkeys.values()].filter((p) => p.userId === userId),
  savePasskey: (record) => {
    passkeys.set(record.id, record);
  },
  updatePasskeyCounter: (id, signCount) => {
    const existing = passkeys.get(id);
    if (existing !== undefined) passkeys.set(id, { ...existing, signCount });
  },
};
