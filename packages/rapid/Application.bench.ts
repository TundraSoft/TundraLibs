/**
 * @fileoverview Benchmarks for rAPId's per-request hot path, measured
 * IN-PROCESS — no network, no server bind — so each number is the
 * framework's own per-request CPU cost, not transport round-trip time
 * (which, at ~40µs, would swamp these µs/ns-scale deltas and hide the
 * very overhead we're investigating). These are the exact pieces
 * `HTTPTransport` runs on every request: context construction, the
 * lazy query/paging parse, route matching, response serialization, and
 * request-id minting. The end-to-end HTTP throughput comparison against
 * oak/express lives in `bench/` (autocannon) — that's a different
 * question (concurrency throughput) the micro-harness can't answer.
 *
 * @module
 */

import { bench } from '@tundralibs/compat/bench';
import { RadRouter } from '@tundralibs/radrouter';
import { Application } from './Application.ts';
import { HTTPContext } from './context/mod.ts';
import { serializeResponse } from './utils/mod.ts';
import type { RapidRouteEntry } from './types/mod.ts';

// One app, two routes — the same minimal shape the server bench uses.
const app = new Application({ name: 'bench', mode: 'PRODUCTION' });
app.get('/', () => ({ content: { ok: true } }));
app.get('/users/:id:', (ctx) => ({ content: { id: ctx.args.params.id } }));

// A router populated exactly as HTTPTransport.start() does.
const router = new RadRouter<RapidRouteEntry>();
for (const entry of app.routes) {
  router.addRoute(entry.method, entry.path, [entry], entry.version);
}

// Pre-built Requests — building a Request is NOT rapid's cost, so it is
// excluded from the measured section (reused across iterations; GET
// bodies are never consumed).
const reqUserPlain = new Request('http://localhost/users/42');
const reqUserQuery = new Request(
  'http://localhost/users/42?status=active&role=admin&sort=name&page=2&size=25',
);
const OUT_HEADERS = new Headers({ 'content-type': 'application/json' });
const FIXED_ID = '01JABCDEF0123456789ABCDEF';

// --- context construction (every request builds one) ---
bench(
  'HTTPContext - construct (action + id supplied)',
  () =>
    new HTTPContext(app, {
      request: reqUserPlain,
      remoteAddress: '127.0.0.1',
      params: { id: '42' },
      action: 'GET /users/:id:',
      matched: true,
      requestId: FIXED_ID,
    }),
);

// --- args access: params are immediate (known from the route match);
// query + paging parse LAZILY, each only when read. The two benches are
// grouped so the fast path (a handler that reads only params) is directly
// comparable to the full cost (a handler that reads the parsed query and
// paging window) — the gap is exactly what a params-only handler no
// longer pays.
bench('ctx.args.params - fast path (no parse)', {
  group: 'ctx.args',
  baseline: true,
}, () => {
  const ctx = new HTTPContext(app, {
    request: reqUserQuery,
    remoteAddress: '127.0.0.1',
    params: { id: '42' },
    matched: true,
    requestId: FIXED_ID,
  });
  return ctx.args.params;
});
bench('ctx.args query+paging - 4 filters (full parse)', {
  group: 'ctx.args',
}, () => {
  const ctx = new HTTPContext(app, {
    request: reqUserQuery,
    remoteAddress: '127.0.0.1',
    params: { id: '42' },
    matched: true,
    requestId: FIXED_ID,
  });
  // Read both lazy fields to force the query-filter + paging parse.
  const a = ctx.args;
  return [a.query, a.paging];
});

// --- route matching (radrouter trie walk) ---
bench(
  'radrouter.find - static /',
  { group: 'find', baseline: true },
  () => router.find('GET', '/'),
);
bench(
  'radrouter.find - param /users/:id',
  { group: 'find' },
  () => router.find('GET', '/users/42'),
);
bench(
  'radrouter.find - miss (404)',
  { group: 'find' },
  () => router.find('GET', '/nope/nowhere'),
);

// --- response serialization ---
bench(
  'serializeResponse - small JSON',
  { group: 'serialize', baseline: true },
  () => serializeResponse({ id: '42' }, 200, OUT_HEADERS),
);
bench(
  'serializeResponse - string body',
  { group: 'serialize' },
  () => serializeResponse('ok', 200, OUT_HEADERS),
);

// --- request-id policy (minted per request unless a safe inbound one) ---
bench(
  'newRequestId - mint ULID',
  { group: 'requestId', baseline: true },
  () => app.newRequestId(),
);
bench(
  'newRequestId - adopt inbound',
  { group: 'requestId' },
  () => app.newRequestId('client-supplied-trace-0001'),
);

// --- integrated: rAPId's whole synchronous request spine in one, so
// the pieces above sum to a single per-request figure. This is a
// DIAGNOSTIC total (where rAPId's own time goes), NOT a peer
// comparison — the framework-vs-framework question (rAPId vs oak vs
// express) is end-to-end HTTP throughput and lives in the autocannon
// scripts under `bench/`, which is where those deps belong.
bench('SPINE - construct + args.params + serialize (param route)', () => {
  const ctx = new HTTPContext(app, {
    request: reqUserQuery,
    remoteAddress: '127.0.0.1',
    params: { id: '42' },
    action: 'GET /users/:id:',
    matched: true,
    requestId: FIXED_ID,
  });
  // The common handler shape reads only params (see the `/users/:id`
  // handler above) — the fast path, no query/paging parse.
  void ctx.args.params.id;
  return serializeResponse({ id: '42' }, 200, OUT_HEADERS);
});
