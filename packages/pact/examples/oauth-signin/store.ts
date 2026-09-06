/**
 * In-memory storage hooks for the oauth-signin example. Real apps back
 * these with a database; the shapes are the same. Sessions need no
 * hooks here — the example opts into pact's cache-only session mode.
 */
import {
  type PactCreateUserInput,
  type PactHooks,
  type PactStoredUser,
  type PactUserQuery,
  serializeGrants,
} from '@tundralibs/pact';

export type Modules = 'Notes';

const users = new Map<string, PactStoredUser>();
const byIdentifier = new Map<string, string>();
const byOAuth = new Map<string, string>(); // "provider:subject" -> userId
let seq = 0;

export const hooks: PactHooks<Modules> = {
  getUser: (query: PactUserQuery) => {
    if (query.by === 'ID') return users.get(query.id) ?? null;
    if (query.by === 'IDENTIFIER') {
      const id = byIdentifier.get(query.identifier);
      return id === undefined ? null : users.get(id) ?? null;
    }
    const id = byOAuth.get(`${query.provider}:${query.subject}`);
    return id === undefined ? null : users.get(id) ?? null;
  },
  createUser: (input: PactCreateUserInput) => {
    const user: PactStoredUser = {
      id: `u${++seq}`,
      status: input.status,
      // Grants are the app's decision — the example gives every new
      // sign-in read/write on Notes (READ 1n | WRITE 2n).
      grants: serializeGrants({ Notes: 3n }),
      metadata: input.oauth === undefined
        ? undefined
        : { name: input.oauth.profile.name, email: input.oauth.profile.email },
    };
    users.set(user.id, user);
    byIdentifier.set(input.identifier, user.id);
    if (input.oauth !== undefined) {
      byOAuth.set(`${input.oauth.provider}:${input.oauth.subject}`, user.id);
    }
    return user;
  },
};
