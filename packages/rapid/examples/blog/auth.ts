/**
 * @fileoverview The blog's `@tundralibs/pact` wiring, through
 * `@tundralibs/rapid/middlewares/pact`: one instance with in-memory hooks
 * (users, sessions, API keys — a real app backs `getUser`/`getApiKey`/
 * `saveSession` with norm the same way `Posts`/`Comments` are, see
 * `docs/Rapid-Database.md`; pact's hooks are just persistence), two demo
 * accounts, and the two middlewares every route imports.
 *
 * Created at module load (not in `main.ts`) so `authorize` can be used
 * inside route decorators too.
 *
 * @module
 */

import {
  Pact,
  type PactAuthContext,
  type PactStoredApiKey,
  type PactStoredSession,
  type PactStoredUser,
} from '@tundralibs/pact';
import { pactAuth } from '../../middlewares/pact.ts';

const users = new Map<string, PactStoredUser>();
const byIdentifier = new Map<string, string>();
const apiKeys = new Map<string, PactStoredApiKey>();
const sessions = new Map<string, PactStoredSession>();

/** The blog's pact instance: one module, one permission. */
export const pact = Pact.create({
  name: 'blog',
  bits: { READ: 1n },
  modulePermissions: { Admin: ['READ'] },
  hooks: {
    getUser: (q) => {
      if (q.by === 'ID') return users.get(q.id) ?? null;
      if (q.by === 'IDENTIFIER') {
        return users.get(byIdentifier.get(q.identifier) ?? '') ?? null;
      }
      return null;
    },
    createUser: (input) => {
      const user: PactStoredUser = {
        id: `u-${input.identifier}`,
        status: input.status,
        passwordHash: input.passwordHash,
        grants: input.grants,
        metadata: input.metadata,
      };
      users.set(user.id, user);
      byIdentifier.set(input.identifier, user.id);
      return user;
    },
    getApiKey: (id) => apiKeys.get(id) ?? null,
    saveApiKey: (key) => {
      apiKeys.set(key.id, key);
    },
    revokeApiKey: (id) => {
      apiKeys.delete(id);
    },
    saveSession: (s) => {
      sessions.set(s.id, s);
    },
    getSession: (id) => sessions.get(id) ?? null,
    deleteSession: (id) => {
      sessions.delete(id);
    },
    deleteSessions: (userId) => {
      for (const [id, s] of sessions) {
        if (s.userId === userId) sessions.delete(id);
      }
    },
  },
});

/**
 * The two demo accounts — ada holds `Admin: READ` (an author), bob holds
 * nothing (a reader). Passwords are here so the `/login/as/:username:`
 * browser convenience can sign in without a form; a real app has neither.
 */
export const DEMO_ACCOUNTS: Readonly<Record<string, string>> = {
  ada: 'lovelace',
  bob: 'builder',
};
await pact.register({
  identifier: 'ada',
  password: DEMO_ACCOUNTS['ada']!,
  grants: { Admin: 1n },
  metadata: { username: 'ada' },
});
await pact.register({
  identifier: 'bob',
  password: DEMO_ACCOUNTS['bob']!,
  metadata: { username: 'bob' },
});

/**
 * Sessions as a bearer token or the `session` cookie `login()` sets;
 * API keys as the `x-api-key` / `x-api-secret` pair. `authenticate` runs
 * app-wide, `authorize('Admin', 'READ')` gates the admin routes.
 */
export const { authenticate, authorize } = pactAuth(pact, {
  bearer: { cookie: 'session' },
  apiKey: { keyHeader: 'x-api-key', secretHeader: 'x-api-secret' },
});

/** The display name the projection hands templates (`metadata.username`). */
export function usernameOf(auth: PactAuthContext): string {
  const name = auth.principal.metadata?.['username'];
  return typeof name === 'string' ? name : auth.principal.id;
}

/**
 * Whether the caller holds `Admin: READ` — read synchronously off the
 * bound principal's grants for the menu projection (the route guard is
 * `authorize`, which asks pact properly).
 */
export function isAuthor(auth: PactAuthContext | undefined): boolean {
  return ((auth?.principal.grants.Admin ?? 0n) & 1n) === 1n;
}

/** Mint the demo API key for `curl` — called explicitly from `main.ts`. */
export function issueDemoApiKey(): Promise<{ key: string; secret: string }> {
  return pact.issueApiKey({ userId: 'u-ada', grants: { Admin: 1n } });
}
