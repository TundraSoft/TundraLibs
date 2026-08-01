/**
 * @fileoverview Multiple API versions sharing the same router.
 *
 * Demonstrates the three-tier fallback: exact requested version wins
 * over `defaultVersion`, which wins over the unversioned slot.
 *
 * Run:
 *   deno run packages/radrouter/examples/versioned-api.ts
 */

import { RadRouter } from '../mod.ts';

type AppCtx = { request: Request };
type AppMw = (ctx: AppCtx, next: () => Promise<void>) => Promise<void>;

// v2 is the implicit current — unversioned lookups land on v2 handlers.
const router = new RadRouter<AppMw>({ defaultVersion: 'v2' });

router.get('/users/:id:', [
  async (_ctx, next) => {
    console.log('v1 handler (older payload shape)');
    await next();
  },
], 'v1');

router.get('/users/:id:', [
  async (_ctx, next) => {
    console.log('v2 handler (current payload shape)');
    await next();
  },
], 'v2');

// Unversioned fallback — only reached if no version-matched handler exists.
router.get('/health', [
  async (_ctx, next) => {
    console.log('health check (version-agnostic)');
    await next();
  },
]);

const cases = [
  { path: '/users/42', version: 'v1' }, // → v1
  { path: '/users/42', version: 'v2' }, // → v2
  { path: '/users/42', version: undefined }, // → v2 via defaultVersion
  { path: '/users/42', version: 'v3' }, // → no exact v3, falls back to v2 (defaultVersion)
  { path: '/health', version: 'v9' }, // → unversioned slot
];

for (const c of cases) {
  const match = router.find('GET', c.path, c.version);
  console.log(
    `GET ${c.path} (version=${c.version ?? 'none'}) → ${
      match ? `${match.middlewares.length} mw` : 'no match'
    }`,
  );
}
