/**
 * @fileoverview Conformance test harness for {@link PubSubAdapter}.
 *
 * The Adapter contract is described in JSDoc on `PubSubAdapter` and
 * its members. This file is the executable version of those words:
 * any adapter that wants to claim it implements the contract can run
 * this suite against itself and observe the same assertions
 * `MemoryPubSubAdapter` is held to.
 *
 * Usage — note the dedicated `/conformance` sub-path:
 *
 * ```ts
 * import { runAdapterConformance } from '@tundralibs/rpc/conformance';
 * import { describe } from '@tundralibs/compat/test';
 * import { MyRedisAdapter } from './MyRedisAdapter.ts';
 *
 * describe('MyRedisAdapter', () => {
 *   runAdapterConformance(() => new MyRedisAdapter({ url: '...' }));
 *
 *   // …adapter-specific tests below
 * });
 * ```
 *
 * The harness covers the universal contract plus a few capability-
 * gated checks (ordering when `guaranteedOrder` is declared). It does
 * not cover features that aren't testable in-process — most notably
 * `crossProcess` broadcast, which requires a separate adapter
 * instance on another process. Run an out-of-process integration
 * test in addition to this suite for those.
 *
 * Reachable **only** through the `/conformance` sub-path — never from
 * `@tundralibs/rpc` or `@tundralibs/rpc/pubsub`. This module
 * statically imports `@tundralibs/compat/test`, which resolves
 * `bun:test` / `node:test`; those specifiers are unresolvable to
 * browser and edge-worker bundlers (Cloudflare Workers' esbuild fails
 * the build outright). Isolating the harness here keeps the runtime
 * barrels bundler-safe — import it from test files only.
 *
 * @module
 */

import { afterEach, beforeEach, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';

import type { PubSubAdapter } from './Adapter.ts';

/**
 * Factory that produces a fresh, ready-to-use adapter instance for
 * each test. May be sync or async — async return is needed for
 * adapters that connect over the network (Redis, RabbitMQ, etc.).
 *
 * The harness calls `factory()` once per test and `adapter.close()`
 * during teardown. Tests must not share state across calls.
 */
export type AdapterFactory = () => PubSubAdapter | Promise<PubSubAdapter>;

/**
 * Tuning knobs for the conformance harness.
 */
export type ConformanceOptions = {
  /**
   * Upper bound for how long the harness will wait for an expected
   * message to arrive at a handler before declaring failure. Default
   * `1000` ms. Increase for adapters with non-trivial wire latency
   * (Redis pub/sub, network adapters), keep low for in-process.
   */
  deliveryTimeoutMs?: number;
};

/**
 * Poll `predicate` until it returns `true` or the deadline passes.
 * Resolves on success, rejects with `AssertionError` on timeout.
 *
 * @internal
 */
const waitFor = async (
  predicate: () => boolean,
  timeoutMs: number,
  message: string,
): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise<void>((r) => setTimeout(r, 5));
  }
  if (!predicate()) {
    asserts.fail(`timed out after ${timeoutMs}ms: ${message}`);
  }
};

/**
 * Run the {@link PubSubAdapter} conformance suite against the
 * supplied factory. Call this inside a `describe()` block — each
 * assertion is registered as a top-level `it()` so callers can mix
 * in adapter-specific tests alongside.
 *
 * @param factory - Produces a fresh adapter instance per test.
 * @param options - Optional timing knobs; see {@link ConformanceOptions}.
 */
export function runAdapterConformance(
  factory: AdapterFactory,
  options: ConformanceOptions = {},
): void {
  const deliveryTimeoutMs = options.deliveryTimeoutMs ?? 1000;
  let adapter: PubSubAdapter;

  beforeEach(async () => {
    adapter = await factory();
  });

  afterEach(async () => {
    try {
      await adapter.close();
    } catch {
      // Teardown errors are ignored — the adapter being already closed
      // (e.g. by a test that exercises double-close) is intentional.
    }
  });

  // ---------------------------------------------------------------------------
  // Subscribe + publish
  // ---------------------------------------------------------------------------

  it('subscribe + publish delivers data to the handler', async () => {
    const received: unknown[] = [];
    adapter.subscribe('t', (data) => {
      received.push(data);
    });
    await adapter.publish('t', 'hello');
    await waitFor(
      () => received.length === 1,
      deliveryTimeoutMs,
      'expected one message on topic "t"',
    );
    asserts.assertEquals(received, ['hello']);
  });

  it('fans out to every subscriber on the same topic', async () => {
    const a: unknown[] = [];
    const b: unknown[] = [];
    adapter.subscribe('t', (d) => a.push(d));
    adapter.subscribe('t', (d) => b.push(d));
    await adapter.publish('t', 1);
    await adapter.publish('t', 2);
    await waitFor(
      () => a.length === 2 && b.length === 2,
      deliveryTimeoutMs,
      'expected both subscribers to see two messages',
    );
    asserts.assertEquals(a.sort(), [1, 2]);
    asserts.assertEquals(b.sort(), [1, 2]);
  });

  it('does not deliver across topics', async () => {
    const received: unknown[] = [];
    adapter.subscribe('t-a', (d) => received.push(d));
    await adapter.publish('t-b', 'wrong');
    // Give the adapter time to deliver if it were going to (which it
    // shouldn't). A short fixed wait is acceptable here — the negative
    // assertion has no positive predicate to poll on.
    await new Promise<void>((r) => setTimeout(r, 50));
    asserts.assertEquals(received, []);
  });

  // ---------------------------------------------------------------------------
  // Unsubscribe
  // ---------------------------------------------------------------------------

  it('unsubscribe stops further delivery to that handler', async () => {
    const received: unknown[] = [];
    const sub = adapter.subscribe('t', (d) => received.push(d));
    await adapter.publish('t', 'before');
    await waitFor(
      () => received.length === 1,
      deliveryTimeoutMs,
      'expected "before" to arrive',
    );
    sub.unsubscribe();
    await adapter.publish('t', 'after');
    await new Promise<void>((r) => setTimeout(r, 50));
    asserts.assertEquals(received, ['before']);
  });

  it('unsubscribe is idempotent', () => {
    const sub = adapter.subscribe('t', () => {});
    sub.unsubscribe();
    sub.unsubscribe(); // must not throw
  });

  // ---------------------------------------------------------------------------
  // Fan-out resilience
  // ---------------------------------------------------------------------------

  it('a throwing subscriber does not prevent others from running', async () => {
    const reached: string[] = [];
    adapter.subscribe('t', () => {
      throw new Error('boom from first');
    });
    adapter.subscribe('t', () => {
      reached.push('second');
    });
    await adapter.publish('t', null);
    await waitFor(
      () => reached.length === 1,
      deliveryTimeoutMs,
      'expected the second subscriber to still run after the first threw',
    );
    asserts.assertEquals(reached, ['second']);
  });

  // ---------------------------------------------------------------------------
  // No implicit replay
  // ---------------------------------------------------------------------------

  it('subscribers added after publish do not see prior messages', async () => {
    await adapter.publish('t', 'before-anyone');
    const received: unknown[] = [];
    adapter.subscribe('t', (d) => received.push(d));
    await new Promise<void>((r) => setTimeout(r, 50));
    asserts.assertEquals(received, []);
  });

  // ---------------------------------------------------------------------------
  // Close
  // ---------------------------------------------------------------------------

  it('publish after close does not deliver to surviving subscribers', async () => {
    const received: unknown[] = [];
    adapter.subscribe('t', (d) => received.push(d));
    await adapter.close();
    await adapter.publish('t', 'after-close');
    await new Promise<void>((r) => setTimeout(r, 50));
    asserts.assertEquals(received, []);
  });

  it('close is idempotent', async () => {
    await adapter.close();
    await adapter.close(); // must not throw
  });

  // ---------------------------------------------------------------------------
  // Capability-gated assertions
  // ---------------------------------------------------------------------------

  it('honors guaranteedOrder when declared', async () => {
    if (!adapter.capabilities.guaranteedOrder) return;

    const received: number[] = [];
    adapter.subscribe('t', (d) => received.push(d as number));
    await adapter.publish('t', 1);
    await adapter.publish('t', 2);
    await adapter.publish('t', 3);
    await waitFor(
      () => received.length === 3,
      deliveryTimeoutMs,
      'expected 3 ordered messages',
    );
    asserts.assertEquals(received, [1, 2, 3]);
  });
}
