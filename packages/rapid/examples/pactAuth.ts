/**
 * @fileoverview Real `@tundralibs/pact` wiring for the blog example — the
 * pact-backed counterpart to `auth.ts`'s BYO stand-in, using
 * `@tundralibs/rapid/middlewares/pact` instead of the generic
 * `authenticate`/`authorize` seam. In-memory hooks keep the demo
 * runnable with zero setup; a real app backs `getUser`/`getApiKey`/
 * `saveApiKey` with norm the same way `Posts`/`Comments` are (see
 * `docs/Rapid-Database.md`) — pact's hooks are just persistence, and it
 * doesn't care where they read from.
 *
 * @module
 */

import type { PactStoredApiKey, PactStoredUser } from '@tundralibs/pact';
import { pact } from '../middlewares/pact/mod.ts';

/**
 * Register the app's `Pact` instance (see `pact()` — exactly once, here)
 * and mint a demo API key for `curl`. Called explicitly from `main.ts`,
 * same as `registerBlogServices` — not an import side effect.
 */
export async function registerPactAuth(): Promise<
  { id: string; secret: string }
> {
  const users = new Map<string, PactStoredUser>();
  const apiKeys = new Map<string, PactStoredApiKey>();
  users.set('u-ada', { id: 'u-ada', status: 'ACTIVE', grants: { Admin: '1' } });

  const instance = pact({
    bits: { READ: 1n },
    modules: { Admin: ['READ'] },
    apiKeys: { prefix: 'blog' },
    apiKey: {},
    hooks: {
      getUser: (q) => (q.by === 'ID' ? users.get(q.id) ?? null : null),
      getApiKey: (id) => apiKeys.get(id) ?? null,
      saveApiKey: (r) => {
        apiKeys.set(r.id, r);
      },
    },
  });

  return await instance.issueApiKey('u-ada');
}
