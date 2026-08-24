/**
 * @fileoverview Runnable demo: automatic span nesting across call depth, and
 * isolation between concurrent requests.
 *
 * Two claims from docs/Tracer-Concepts.md that are much easier to trust
 * watched than read:
 *
 *  1. A span opened three function calls deep (`checkout` -> `chargeCard` ->
 *     `recordLedgerEntry` -> `dbQuery`) still parents to whatever span was
 *     active when the call chain started — no span parameter threaded
 *     anywhere.
 *  2. Two "requests" running concurrently (`Promise.all`, interleaved on one
 *     event loop) never see each other's active span. This script proves it
 *     by re-deriving each trace's tree from the exported spans afterwards —
 *     if isolation had failed, a span would show up under the wrong root.
 *
 * Run:
 *   deno run packages/tracer/examples/nested-spans.ts
 *   bun run packages/tracer/examples/nested-spans.ts
 *   node --import tsx packages/tracer/examples/nested-spans.ts
 *
 * See docs/Tracer-Concepts.md ("Why nesting is automatic") for the mechanism
 * and docs/Tracer-Sampling.md for how children inherit their root's decision.
 */

import { MemoryExporter, SpanKind, Tracer } from '@tundralibs/tracer';
import type { SpanData } from '@tundralibs/tracer';

const exporter = new MemoryExporter();
const tracer = new Tracer({ serviceName: 'orders-demo', exporter });

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// --- the call graph -------------------------------------------------------
// Every span below is opened with no reference to its caller's span. Parenting
// happens entirely through the ambient active-span context.

async function dbQuery(table: string): Promise<void> {
  await tracer.startActiveSpan(
    'db.query',
    { kind: SpanKind.CLIENT, attributes: { 'db.collection.name': table } },
    async () => {
      await sleep(10 + Math.random() * 10);
    },
  );
}

async function recordLedgerEntry(): Promise<void> {
  // Three calls removed from `checkout` (checkout -> chargeCard ->
  // recordLedgerEntry -> here) — still parents to `payment.gateway`, the span
  // active when `chargeCard` opened it.
  await dbQuery('payments_ledger');
}

async function chargeCard(): Promise<void> {
  await tracer.startActiveSpan(
    'payment.gateway',
    { kind: SpanKind.CLIENT, attributes: { 'payment.provider': 'stripe' } },
    async () => {
      await sleep(15);
      await recordLedgerEntry(); // nests under payment.gateway, not checkout
    },
  );
}

async function verifyAuth(): Promise<void> {
  await tracer.startActiveSpan('auth.verify', async () => {
    await sleep(5);
  });
}

async function checkout(orderId: string): Promise<void> {
  await tracer.startActiveSpan(
    'checkout',
    { kind: SpanKind.SERVER, attributes: { 'order.id': orderId } },
    async () => {
      await verifyAuth();
      await dbQuery('orders');
      await chargeCard();
    },
  );
}

// --- run two requests concurrently, to prove isolation --------------------

await Promise.all([checkout('ord_1'), checkout('ord_2')]);
await tracer.shutdown();

// --- reconstruct and print each trace's tree from the exported spans ------
// This is only possible because every span really did carry the right
// traceId/parentSpanId through the interleaved execution above.

function printTree(spans: SpanData[]): void {
  const byTrace = new Map<string, SpanData[]>();
  for (const span of spans) {
    const list = byTrace.get(span.context.traceId) ?? [];
    list.push(span);
    byTrace.set(span.context.traceId, list);
  }

  console.log(`${spans.length} spans across ${byTrace.size} traces\n`);

  for (const [traceId, traceSpans] of byTrace) {
    console.log(`trace ${traceId.slice(0, 8)}…`);
    const render = (parentId: string | undefined, depth: number): void => {
      for (
        const span of traceSpans.filter((s) => s.parentSpanId === parentId)
      ) {
        const ms = span.endTime.getTime() - span.startTime.getTime();
        console.log(`${'  '.repeat(depth)}${span.name}  (${ms}ms)`);
        render(span.context.spanId, depth + 1);
      }
    };
    render(undefined, 0);
    console.log('');
  }
}

printTree(exporter.spans);
