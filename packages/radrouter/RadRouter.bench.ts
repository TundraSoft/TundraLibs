/**
 * RadRouter performance benchmarks.
 *
 * Run with:
 *   deno bench --allow-all packages/radrouter/RadRouter.bench.ts
 *
 * Two benchmark groups:
 *   - `lookup`        — six lookup shapes against a fully-loaded
 *                       case-sensitive router (1150 routes). Static is
 *                       the baseline; everything else is relative.
 *   - `ci-overhead`   — case-sensitive vs case-insensitive on the same
 *                       lookup, to quantify the CI fast-path cost.
 *
 * Compare against find-my-way / radix3 in `RadRouter.compare.bench.ts`.
 */

import { bench } from '@tundralibs/compat/bench';
import { RadRouter } from './RadRouter.ts';

type BenchCtx = { state: { processed?: boolean } };
type BenchMW = (ctx: BenchCtx, next: () => Promise<void>) => Promise<void>;

const noop: BenchMW = async (_ctx, next) => {
  await next();
};

function buildRouter(opts?: { caseSensitive?: boolean }): RadRouter<BenchMW> {
  const router = new RadRouter<BenchMW>(opts);
  // 1000 versioned static routes (10 versions × 100 resources each)
  for (let i = 0; i < 1000; i++) {
    router.get(`/api/v${i % 10}/resource${i}/action`, [noop], `v${i % 10}`);
  }
  // 100 parameter routes
  for (let i = 0; i < 100; i++) {
    router.get(`/users/:userId:/posts/:postId:/comments/${i}`, [noop]);
  }
  // 50 greedy-suffix routes
  for (let i = 0; i < 50; i++) {
    router.get(`/files/${i}/:path:-*`, [noop]);
  }
  return router;
}

// Routers are built once at module load and reused — registration cost
// is not part of the per-iteration measurement.
const router = buildRouter();
const ciRouter = buildRouter({ caseSensitive: false });

// ---------- lookup group: shape comparison on case-sensitive router ----------

bench(
  'static (versioned)',
  { group: 'lookup', baseline: true },
  () => {
    router.find('GET', '/api/v5/resource500/action', 'v5');
  },
);

bench('static (deep, unversioned)', { group: 'lookup' }, () => {
  router.find('GET', '/api/v5/resource500/action');
});

bench('param (2 params)', { group: 'lookup' }, () => {
  router.find('GET', '/users/123/posts/456/comments/25');
});

bench('greedy (single segment)', { group: 'lookup' }, () => {
  router.find('GET', '/files/10/documents');
});

bench('greedy (multi segment)', { group: 'lookup' }, () => {
  router.find('GET', '/files/25/a/b/c/d.txt');
});

bench('miss', { group: 'lookup' }, () => {
  router.find('GET', '/nonexistent/route');
});

// ---------- ci-overhead group: case-sensitive vs case-insensitive ----------

bench(
  'case-sensitive',
  { group: 'ci-overhead', baseline: true },
  () => {
    router.find('GET', '/api/v5/resource500/action');
  },
);

bench('case-insensitive', { group: 'ci-overhead' }, () => {
  ciRouter.find('GET', '/API/V5/RESOURCE500/ACTION');
});
