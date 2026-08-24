/**
 * @fileoverview Runnable example: request correlation end to end.
 *
 * Simulates one inbound "request" — an edge middleware opens the scope with
 * `ambient.run()`, a handler several `await`s and function calls deep reads
 * and enriches it with `ambient.get()` / `ambient.set()`, two concurrent
 * requests prove isolation, a mis-mounted sub-app demonstrates the
 * nested-`run()`-replaces-not-merges footgun (and `ambient.child()` as the
 * fix), and a queued background job shows the rehydration pattern — plus a
 * second, independent `createContext()` store for non-request data.
 *
 * Concepts are explained in ../../docs/Ambient-Concepts.md and
 * ../../docs/Ambient-Integration.md; this file only shows them running.
 *
 * Run with `deno run`, `bun run`, or `node --import tsx` — see this
 * directory's README.md for exact commands.
 */

import { ambient, createContext } from '@tundralibs/ambient';

// -----------------------------------------------------------------------
// 1. Edge middleware: the only place that opens the request scope.
// -----------------------------------------------------------------------

type InboundRequest = {
  method: string;
  path: string;
  headers: Record<string, string>;
};

async function withRequestContext(
  req: InboundRequest,
  next: () => Promise<void>,
): Promise<void> {
  const correlationId = req.headers['x-correlation-id'] ??
    `generated-${req.path}`;
  await ambient.run(
    { correlationId, method: req.method, path: req.path },
    next,
  );
}

// -----------------------------------------------------------------------
// 2. Deep call chain — none of these take a context parameter.
// -----------------------------------------------------------------------

async function chargeOrder(orderId: string): Promise<void> {
  const ctx = ambient.get();
  console.log(
    `  [chargeOrder] correlationId=${ctx?.correlationId} userId=${ctx?.userId} orderId=${orderId}`,
  );

  // The bag is mutable and live: this write is visible to every later
  // reader in the same scope, not just callers further down the stack.
  ambient.set('paymentStep', 'charged');

  await auditLog(orderId);
  queue.push({ orderId, correlationId: ctx?.correlationId });
}

async function auditLog(orderId: string): Promise<void> {
  await Promise.resolve(); // one more await — the bag still survives it
  const ctx = ambient.get();
  console.log(
    `  [auditLog] correlationId=${ctx?.correlationId} paymentStep=${ctx?.paymentStep} orderId=${orderId}`,
  );
}

// -----------------------------------------------------------------------
// 3. The footgun: a mounted sub-app that calls ambient.run() again.
// -----------------------------------------------------------------------

function misMountedSubApp(): void {
  const before = ambient.get();
  console.log(
    `  [misMountedSubApp] before nested run(): correlationId=${before?.correlationId} userId=${before?.userId}`,
  );

  // run() does NOT merge with an already-active scope — it opens a brand
  // new bag for fn's duration. correlationId and userId (set above by the
  // outer scope) are gone inside here, not just the fields this call adds.
  // See docs/Ambient-Concepts.md#scopes-run-and-child.
  ambient.run({ correlationId: 'sub-app-own-id' }, () => {
    const inside = ambient.get();
    console.log(
      `  [misMountedSubApp] inside nested run(): correlationId=${inside?.correlationId} userId=${inside?.userId} (outer fields dropped)`,
    );
  });

  const after = ambient.get();
  console.log(
    `  [misMountedSubApp] after nested run() returns: correlationId=${after?.correlationId} userId=${after?.userId} (outer bag reappears untouched)`,
  );
}

function properlyMountedSubApp(): void {
  // child() overlays on the inherited context instead of replacing it —
  // this is the fix for the footgun above.
  ambient.child({ module: 'billing' }, () => {
    const ctx = ambient.get();
    console.log(
      `  [properlyMountedSubApp] correlationId=${ctx?.correlationId} userId=${ctx?.userId} module=${ctx?.module}`,
    );
  });
}

async function handleOrder(orderId: string): Promise<void> {
  console.log(`[handleOrder] correlationId=${ambient.get()?.correlationId}`);
  ambient.set('userId', 'u_123'); // e.g. resolved by an auth layer
  await chargeOrder(orderId);
  misMountedSubApp();
  properlyMountedSubApp();
}

// -----------------------------------------------------------------------
// 4. Concurrency: two requests in flight at once never see each other's bag.
// -----------------------------------------------------------------------

async function readBackAfterAwait(label: string): Promise<string> {
  await new Promise((resolve) => setTimeout(resolve, 5));
  return `${label}:${ambient.get()?.correlationId}`;
}

async function runConcurrentRequests(): Promise<void> {
  const [a, b] = await Promise.all([
    withRequestContextReturning(
      { method: 'GET', path: '/a', headers: { 'x-correlation-id': 'req-A' } },
      () => readBackAfterAwait('A'),
    ),
    withRequestContextReturning(
      { method: 'GET', path: '/b', headers: { 'x-correlation-id': 'req-B' } },
      () => readBackAfterAwait('B'),
    ),
  ]);
  const isolated = a === 'A:req-A' && b === 'B:req-B';
  console.log(`  results: ${a}, ${b}`);
  console.log(`  RESULT: isolation ${isolated ? 'held' : 'FAILED'}`);
}

// withRequestContext returns void; this variant returns fn's result, the
// same shape ambient.run itself supports.
async function withRequestContextReturning<R>(
  req: InboundRequest,
  next: () => Promise<R>,
): Promise<R> {
  const correlationId = req.headers['x-correlation-id'] ??
    `generated-${req.path}`;
  return await ambient.run(
    { correlationId, method: req.method, path: req.path },
    next,
  );
}

// -----------------------------------------------------------------------
// 5. Background job: request context dies with the request, so a worker
//    must rebuild its scope from whatever travelled with the message.
//    A second, independent createContext() store carries the tenant —
//    request-shaped data and tenant data don't belong in the same bag.
// -----------------------------------------------------------------------

type Job = { orderId: string; correlationId?: string };
const queue: Job[] = [];

type Tenant = { id: string; schema: string };
const tenantCtx = createContext<Tenant>();

function currentSchema(): string {
  // getOr only exists on a createContext() store, not on ambient itself —
  // ambient.get() has no fallback parameter.
  return tenantCtx.getOr({ id: 'public', schema: 'public' }).schema;
}

async function processQueuedJob(tenant: Tenant): Promise<void> {
  const job = queue.shift();
  if (!job) return;

  console.log(
    `  [worker] before processing: ambient.active()=${ambient.active()} schema=${currentSchema()} (no tenant scope yet)`,
  );

  await ambient.run(
    { correlationId: job.correlationId ?? `generated-job-${job.orderId}` },
    () =>
      tenantCtx.run(tenant, () => {
        console.log(
          `  [worker] rehydrated: correlationId=${ambient.get()?.correlationId} orderId=${job.orderId} schema=${currentSchema()}`,
        );
      }),
  );
}

// -----------------------------------------------------------------------
// Run it.
// -----------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('=== 1. one request, full depth ===');
  await withRequestContext(
    {
      method: 'POST',
      path: '/orders',
      headers: { 'x-correlation-id': 'req-1' },
    },
    () => handleOrder('ord_1'),
  );

  console.log('\n=== 2. two concurrent requests, no bleed ===');
  await runConcurrentRequests();

  console.log('\n=== 3. background worker, scope rebuilt from the job ===');
  await processQueuedJob({ id: 't_acme', schema: 'tenant_acme' });

  console.log('\n=== 4. outside every scope ===');
  console.log(
    `  ambient.get()=${ambient.get()} ambient.active()=${ambient.active()} schema=${currentSchema()}`,
  );
}

await main();
