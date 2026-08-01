/**
 * @fileoverview Greedy-suffix patterns for static-asset mounts.
 *
 * Demonstrates `:name:-*` (consumes the segment plus every remaining
 * segment, joined by `/`), `:name:<literal>` (single-segment with a
 * literal anchor), and the matching-priority sort that puts the most
 * specific literal first.
 *
 * Run:
 *   deno run packages/radrouter/examples/static-assets.ts
 */

import { RadRouter } from '../mod.ts';

type AppCtx = { request: Request };
type AppMw = (ctx: AppCtx, next: () => Promise<void>) => Promise<void>;

const router = new RadRouter<AppMw>();

// Suffix-literal — longest suffix wins.
router.get('/files/:name:.tar.gz', [
  async (_ctx, next) => {
    console.log('tarball handler');
    await next();
  },
]);

router.get('/files/:name:.gz', [
  async (_ctx, next) => {
    console.log('gzip handler');
    await next();
  },
]);

// Greedy suffix — consumes the rest of the path.
router.get('/static/:path:-*', [
  async (_ctx, next) => {
    console.log('static handler');
    await next();
  },
]);

const cases = [
  { path: '/files/backup.tar.gz' }, // → tarball (longest literal)
  { path: '/files/log.gz' }, // → gzip
  { path: '/files/notes.txt' }, // → no match (no .gz suffix)
  { path: '/static/index.html' }, // → static, path='index.html'
  { path: '/static/css/site.css' }, // → static, path='css/site.css'
  { path: '/static/img/logo/v2.png' }, // → static, path='img/logo/v2.png'
  { path: '/static' }, // → no match (greedy needs ≥1 segment)
];

for (const c of cases) {
  const match = router.find('GET', c.path);
  if (match) {
    console.log(`GET ${c.path} → params=${JSON.stringify(match.params)}`);
  } else {
    console.log(`GET ${c.path} → no match`);
  }
}
