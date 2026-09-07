/**
 * @fileoverview Real `@tundralibs/pact` wiring for the blog example — the
 * pact-backed counterpart to `auth.ts`'s BYO stand-in, through
 * `@tundralibs/rapid/middlewares/pact`. In-memory hooks keep the demo
 * runnable with zero setup; a real app backs `getUser`/`getApiKey`/
 * `saveApiKey` with norm the same way `Posts`/`Comments` are (see
 * `docs/Rapid-Database.md`) — pact's hooks are just persistence.
 *
 * Created at module load (not in `main.ts`) so `pactAuthorize` can be used
 * inside route decorators too.
 *
 * @module
 */

import {
  Pact,
  type PactStoredApiKey,
  type PactStoredUser,
  serializeGrants,
} from '@tundralibs/pact';
import { pactAuth } from '../../middlewares/pact/mod.ts';

const users = new Map<string, PactStoredUser>([
  ['u-ada', { id: 'u-ada', status: 'ACTIVE', grants: serializeGrants({ Admin: 1n }) }],
]);
const apiKeys = new Map<string, PactStoredApiKey>();

/** The blog's pact instance: one module, one permission, API keys only. */
export const pact = Pact.create({
  name: 'blog',
  bits: { READ: 1n },
  modulePermissions: { Admin: ['READ'] },
  hooks: {
    getUser: (q) => (q.by === 'ID' ? users.get(q.id) ?? null : null),
    getApiKey: (id) => apiKeys.get(id) ?? null,
    saveApiKey: (key) => {
      apiKeys.set(key.id, key);
    },
  },
});

/** API keys only, via `x-api-key` / `x-api-secret` (or `Authorization: ApiKey k:s`). */
export const { authenticate: pactAuthenticate, authorize: pactAuthorize } =
  pactAuth(pact, { schemes: ['APIKEY'], apiKey: {} });

/** Mint the demo API key for `curl` — called explicitly from `main.ts`. */
export function issueDemoApiKey(): Promise<{ key: string; secret: string }> {
  return pact.issueApiKey({ userId: 'u-ada', grants: { Admin: 1n } });
}
