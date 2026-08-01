/**
 * @fileoverview Tests for MemoryPubSubAdapter.
 *
 * The universal {@link PubSubAdapter} contract is covered by
 * {@link runAdapterConformance}; only Memory-specific behaviours
 * (synchronous delivery, throw-on-subscribe-after-close,
 * unsubscribe-mid-publish ordering) live in this file.
 */

import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';

import { MemoryPubSubAdapter } from './MemoryPubSubAdapter.ts';
import { runAdapterConformance } from './conformance.ts';

describe({
  name: 'rpc.pubsub.MemoryAdapter',
  fn: () => {
    // The universal contract.
    runAdapterConformance(() => new MemoryPubSubAdapter());

    // Memory-specific behaviour that the universal contract intentionally
    // does not pin (other adapters are free to differ).
    describe('memory-specific', () => {
      it('capabilities — in-process only with ordered guaranteed delivery', () => {
        const adapter = new MemoryPubSubAdapter();
        asserts.assertStrictEquals(adapter.capabilities.crossProcess, false);
        asserts.assertStrictEquals(adapter.capabilities.guaranteedOrder, true);
        asserts.assertStrictEquals(
          adapter.capabilities.guaranteedDelivery,
          true,
        );
        asserts.assertStrictEquals(
          adapter.capabilities.patternSubscribe,
          false,
        );
      });

      it('throws on subscribe after close (Memory chooses throw; contract allows either)', async () => {
        const adapter = new MemoryPubSubAdapter();
        await adapter.close();
        asserts.assertThrows(
          () => adapter.subscribe('topic', () => {}),
          Error,
          'subscribe after close',
        );
      });

      it('delivery is synchronous — handlers run within the publish microtask', async () => {
        // Memory fans out inside the publish call; a real network adapter
        // would defer. Pinning this lets us reason about state immediately
        // after publish without waitFor() in Memory consumers.
        const adapter = new MemoryPubSubAdapter();
        const received: unknown[] = [];
        adapter.subscribe('t', (d) => received.push(d));
        await adapter.publish('t', 'sync');
        asserts.assertEquals(received, ['sync']);
        await adapter.close();
      });

      it('a subscriber unsubscribing during publish still receives the current message', async () => {
        // The Set iteration captures the snapshot at publish time, so
        // a handler that unsubscribes itself still runs to completion
        // for this message but is gone for the next.
        const adapter = new MemoryPubSubAdapter();
        const order: string[] = [];
        const subA = adapter.subscribe('topic', () => {
          order.push('a');
          subA.unsubscribe();
        });
        adapter.subscribe('topic', () => {
          order.push('b');
        });
        await adapter.publish('topic', 1);
        asserts.assertEquals(
          order.toSorted((x, y) => x.localeCompare(y)),
          ['a', 'b'],
        );
        order.length = 0;
        await adapter.publish('topic', 2);
        asserts.assertEquals(order, ['b']);
        await adapter.close();
      });
    });
  },
});
