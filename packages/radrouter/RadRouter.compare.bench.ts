/**
 * Comparison benchmark: RadRouter vs popular Node.js routers.
 *
 * Run with:
 *   deno bench --allow-all packages/radrouter/RadRouter.compare.bench.ts
 *
 * Routers compared:
 *   - RadRouter     (this repo) — case-sensitive default + opt-in
 *                                 case-insensitive
 *   - find-my-way   (Fastify) — npm:find-my-way
 *   - radix3        (Nitro/Nuxt) — npm:radix3
 *
 * Fairness notes:
 *   - All routers register an identical set of paths (1000 static, 100
 *     parameterised, 50 greedy/wildcard). Param and wildcard segments
 *     are translated into each router's native syntax.
 *   - Each bench iteration cycles through 5 test paths (3 hits of
 *     different shapes, 1 deep hit, 1 miss) via a shared module-level
 *     counter — equivalent workload across all four benches.
 *   - Setup time is reported once at module load (see console output);
 *     it is not part of per-iteration measurement.
 *   - RadRouter is benchmarked without versioning to match the other
 *     routers. Per-shape RadRouter numbers live in RadRouter.bench.ts.
 *   - find-my-way / radix3 are skipped silently if their npm packages
 *     cannot be fetched.
 */

import { bench } from '@tundralibs/compat/bench';
import { RadRouter } from './RadRouter.ts';
import { assertEquals, assertExists } from '@std/asserts';

type BenchCtx = { state: { processed?: boolean } };
type BenchMW = (ctx: BenchCtx, next: () => Promise<void>) => Promise<void>;

const noop: BenchMW = async (_ctx, next) => {
  await next();
};

const NUM_STATIC = 1000;
const NUM_PARAM = 100;
const NUM_GREEDY = 50;

const TEST_PATHS = [
  '/api/v5/resource500/action', // deep static hit
  '/users/123/posts/456/comments/25', // 2-param hit
  '/files/10/documents', // single-segment greedy hit
  '/files/25/a/b/c/d.txt', // multi-segment greedy hit
  '/nonexistent/route', // miss
];

// Round-robin path selector shared across all benches. Each bench's
// per-iteration call advances the counter, so over millions of
// iterations each bench sees an equivalent mix.
let pathIdx = 0;
function nextPath(): string {
  return TEST_PATHS[pathIdx++ % TEST_PATHS.length]!;
}

// ---------- correctness sanity-check (runs at module load) ----------
{
  const r = new RadRouter<BenchMW>();
  r.get('/api/v5/resource500/action', [noop]);
  r.get('/users/:userId:/posts/:postId:/comments/25', [noop]);
  r.get('/files/10/:path:-*', [noop]);
  r.get('/files/25/:path:-*', [noop]);

  assertExists(r.find('GET', '/api/v5/resource500/action'));
  const m2 = r.find('GET', '/users/123/posts/456/comments/25');
  assertExists(m2);
  assertEquals(m2.params.userId, '123');
  assertEquals(m2.params.postId, '456');
  const m3 = r.find('GET', '/files/10/documents');
  assertExists(m3);
  assertEquals(m3.params.path, 'documents');
  const m4 = r.find('GET', '/files/25/a/b/c/d.txt');
  assertExists(m4);
  assertEquals(m4.params.path, 'a/b/c/d.txt');
  assertEquals(r.find('GET', '/nonexistent/route'), undefined);
}

// ---------- build & time each router (one-shot, outside benches) ----------

function timeSetup<T>(label: string, build: () => T): T {
  const start = performance.now();
  const result = build();
  const ms = performance.now() - start;
  console.log(`[setup] ${label.padEnd(24)} ${ms.toFixed(2).padStart(7)}ms`);
  return result;
}

console.log(
  `\nWorkload: ${NUM_STATIC} static + ${NUM_PARAM} param + ${NUM_GREEDY} greedy routes\n`,
);

const radRouter = timeSetup('RadRouter (CS)', () => {
  const r = new RadRouter<BenchMW>();
  for (let i = 0; i < NUM_STATIC; i++) {
    r.get(`/api/v${i % 10}/resource${i}/action`, [noop]);
  }
  for (let i = 0; i < NUM_PARAM; i++) {
    r.get(`/users/:userId:/posts/:postId:/comments/${i}`, [noop]);
  }
  for (let i = 0; i < NUM_GREEDY; i++) {
    r.get(`/files/${i}/:path:-*`, [noop]);
  }
  return r;
});

const radRouterCI = timeSetup('RadRouter (CI)', () => {
  const r = new RadRouter<BenchMW>({ caseSensitive: false });
  for (let i = 0; i < NUM_STATIC; i++) {
    r.get(`/api/v${i % 10}/resource${i}/action`, [noop]);
  }
  for (let i = 0; i < NUM_PARAM; i++) {
    r.get(`/users/:userId:/posts/:postId:/comments/${i}`, [noop]);
  }
  for (let i = 0; i < NUM_GREEDY; i++) {
    r.get(`/files/${i}/:path:-*`, [noop]);
  }
  return r;
});

// find-my-way (skipped if npm fetch fails)
// deno-lint-ignore no-explicit-any
let findMyWay: any = null;
try {
  const mod = await import('find-my-way');
  const Ctor = mod.default ?? mod;
  findMyWay = timeSetup('find-my-way', () => {
    const fmw = Ctor({ defaultRoute: () => {} });
    const handler = () => {};
    for (let i = 0; i < NUM_STATIC; i++) {
      fmw.on('GET', `/api/v${i % 10}/resource${i}/action`, handler);
    }
    for (let i = 0; i < NUM_PARAM; i++) {
      fmw.on('GET', `/users/:userId/posts/:postId/comments/${i}`, handler);
    }
    for (let i = 0; i < NUM_GREEDY; i++) {
      fmw.on('GET', `/files/${i}/*`, handler);
    }
    return fmw;
  });
} catch (err) {
  console.warn(`[setup] find-my-way skipped: ${(err as Error).message}`);
}

// radix3 (skipped if npm fetch fails)
// deno-lint-ignore no-explicit-any
let radix3: any = null;
try {
  const mod = await import('radix3');
  const createRouter = mod.createRouter ??
    (mod as { default?: typeof mod }).default?.createRouter;
  radix3 = timeSetup('radix3', () => {
    const r = createRouter();
    const handler = { handler: () => {} };
    for (let i = 0; i < NUM_STATIC; i++) {
      r.insert(`/api/v${i % 10}/resource${i}/action`, handler);
    }
    for (let i = 0; i < NUM_PARAM; i++) {
      r.insert(`/users/:userId/posts/:postId/comments/${i}`, handler);
    }
    for (let i = 0; i < NUM_GREEDY; i++) {
      r.insert(`/files/${i}/**:path`, handler);
    }
    return r;
  });
} catch (err) {
  console.warn(`[setup] radix3 skipped: ${(err as Error).message}`);
}

console.log('');

// ---------- benchmarks ----------

bench(
  'RadRouter (CS)',
  { group: 'comparison', baseline: true },
  () => {
    radRouter.find('GET', nextPath());
  },
);

bench('RadRouter (CI)', { group: 'comparison' }, () => {
  radRouterCI.find('GET', nextPath());
});

if (findMyWay) {
  bench('find-my-way (Fastify)', { group: 'comparison' }, () => {
    findMyWay.find('GET', nextPath());
  });
}

if (radix3) {
  bench('radix3 (Nitro)', { group: 'comparison' }, () => {
    radix3.lookup(nextPath());
  });
}
