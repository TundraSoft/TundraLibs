import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat';
import { MemoryCacher } from './mod.ts';
import { CacherEngineError } from '../../errors/mod.ts';

// Wave-note: emission/option accessors are protected now — tests reach
// them through deliberate casts.
// deno-lint-ignore no-explicit-any
const readOption = (t: unknown, k: string): any =>
  // deno-lint-ignore no-explicit-any
  (t as any)._getOption(k);
// deno-lint-ignore no-explicit-any
const readOptions = (t: unknown): any =>
  // deno-lint-ignore no-explicit-any
  (t as any)._getOptions();
// deno-lint-ignore no-explicit-any
const fireEvent = (t: unknown, e: string, ...a: unknown[]): any =>
  // deno-lint-ignore no-explicit-any
  (t as any)._emitRaw(e, ...a);

describe('cacher.engines.memory', () => {
  describe('initialization', () => {
    it('should reject a ":" in the instance name on direct construction', () => {
      // Sibling-path sweep for the round-4 colon-guard fix: the invariant lives
      // in AbstractEngine, so directly-constructed engines reject a reserved-
      // separator name the same way Cacher.create() does.
      asserts.assertThrows(
        () => new MemoryCacher('mem-app:sessions', {}),
        CacherEngineError,
        'must not contain ":"',
      );
    });

    it('should create an instance with default options', async () => {
      const cacher = new MemoryCacher('memory-test', {});

      try {
        asserts.assert(cacher instanceof MemoryCacher);
        asserts.assertEquals(cacher.name, 'memory-test');
        asserts.assertEquals(cacher.Engine, 'MEMORY');
        asserts.assertEquals(readOption(cacher, 'defaultExpiry'), 300);
      } finally {
        cacher.finalize();
      }
    });

    it('should create an instance with custom options', async () => {
      const cacher = new MemoryCacher('memory-test', {
        defaultExpiry: 600,
      });

      try {
        asserts.assertEquals(readOption(cacher, 'defaultExpiry'), 600);
      } finally {
        cacher.finalize();
      }
    });

    it('should explicitly initialize without errors', async () => {
      const cacher = new MemoryCacher('memory-test', {});

      try {
        // init() is a no-op for MemoryCacher but should still be callable
        await cacher.init();

        // Should be able to perform operations after explicit init
        await cacher.set('test-init', 'value');
        const value = await cacher.get('test-init');
        asserts.assertEquals(value, 'value');
      } finally {
        cacher.finalize();
      }
    });
  });

  describe('cache operations', () => {
    it('should set and get different data types', async () => {
      const cacher = new MemoryCacher('memory-types', {});

      try {
        await cacher.init();

        // Test with string
        await cacher.set('string-key', 'test string');
        const stringResult = await cacher.get<string>('string-key');
        asserts.assertEquals(stringResult, 'test string');

        // Test with number
        await cacher.set('number-key', 12345);
        const numberResult = await cacher.get<number>('number-key');
        asserts.assertEquals(numberResult, 12345);

        // Test with boolean
        await cacher.set('bool-key', true);
        const boolResult = await cacher.get<boolean>('bool-key');
        asserts.assertEquals(boolResult, true);

        // Test with array
        const testArray = [1, 2, 'three', { four: 4 }];
        await cacher.set('array-key', testArray);
        const arrayResult = await cacher.get<typeof testArray>('array-key');
        asserts.assertEquals(arrayResult, testArray);

        // Test with complex object
        const testObj = {
          name: 'test',
          nested: { value: 42 },
          items: [1, 2, 3],
        };
        await cacher.set('object-key', testObj);
        const objResult = await cacher.get<typeof testObj>('object-key');
        asserts.assertEquals(objResult, testObj);

        // Test with null value
        await cacher.set('null-key', null);
        const nullResult = await cacher.get('null-key');
        asserts.assertEquals(nullResult, null);
      } finally {
        cacher.finalize();
      }
    });

    it('should return undefined for non-existent keys', async () => {
      const cacher = new MemoryCacher('memory-test', {});

      try {
        const result = await cacher.get('non-existent');
        asserts.assertEquals(result, undefined);
      } finally {
        cacher.finalize();
      }
    });

    it(
      'should be case-sensitive and trim keys',
      async () => {
        const cacher = new MemoryCacher('memory-test', {});

        try {
          await cacher.set('MIXEDCASE', 'value');
          // Keys are case-sensitive: a different case is a different key.
          asserts.assertEquals(await cacher.get('mixedcase'), undefined);
          asserts.assertEquals(await cacher.get('MIXEDCASE'), 'value');

          // Keys that differ only in case must not collide.
          await cacher.set('User:1', 'upper');
          await cacher.set('user:1', 'lower');
          asserts.assertEquals(await cacher.get('User:1'), 'upper');
          asserts.assertEquals(await cacher.get('user:1'), 'lower');

          await cacher.set(' spaced-key ', 'spaced');
          // Keys should be trimmed
          const spacedResult = await cacher.get('spaced-key');
          asserts.assertEquals(spacedResult, 'spaced');
        } finally {
          cacher.finalize();
        }
      },
    );

    it('should check if a key exists', async () => {
      const cacher = new MemoryCacher('memory-test', {});
      const testData = { name: 'test', value: 123 };

      try {
        await cacher.set('exists-key', testData, { expiry: 60 });
        const exists = await cacher.has('exists-key');
        const notExists = await cacher.has('not-exists-key');

        asserts.assertEquals(exists, true);
        asserts.assertEquals(notExists, false);
      } finally {
        cacher.finalize();
      }
    });

    it('should delete a key', async () => {
      const cacher = new MemoryCacher('memory-test', {});
      const testData = { name: 'test', value: 123 };

      try {
        await cacher.set('delete-key', testData, { expiry: 60 });
        await cacher.delete('delete-key');
        const exists = await cacher.has('delete-key');

        asserts.assertEquals(exists, false);
      } finally {
        cacher.finalize();
      }
    });

    it('should clear all keys', async () => {
      const cacher = new MemoryCacher('memory-test', {});
      const testData = { name: 'test', value: 123 };

      try {
        await cacher.set('clear-key-1', testData, { expiry: 60 });
        await cacher.set('clear-key-2', testData, { expiry: 60 });
        await cacher.clear();

        const exists1 = await cacher.has('clear-key-1');
        const exists2 = await cacher.has('clear-key-2');

        asserts.assertEquals(exists1, false);
        asserts.assertEquals(exists2, false);
      } finally {
        cacher.finalize();
      }
    });

    it('should respect namespace isolation', async () => {
      const cacher1 = new MemoryCacher('namespace1', {});
      const cacher2 = new MemoryCacher('namespace2', {});

      try {
        // Set same key in both cachers
        await cacher1.set('shared-key', 'cacher1-value');
        await cacher2.set('shared-key', 'cacher2-value');

        // Each should get its own value
        const value1 = await cacher1.get<string>('shared-key');
        const value2 = await cacher2.get<string>('shared-key');

        asserts.assertEquals(value1, 'cacher1-value');
        asserts.assertEquals(value2, 'cacher2-value');

        // Clear one cacher shouldn't affect the other
        await cacher1.clear();
        const stillExists = await cacher2.has('shared-key');
        asserts.assertEquals(stillExists, true);
      } finally {
        // Clean up both cachers
        cacher1.finalize();
        cacher2.finalize();
      }
    });
  });

  describe('expiry behavior', () => {
    it('should handle automatic expiry', async () => {
      const cacher = new MemoryCacher('memory-test', {});
      const testData = { name: 'test', value: 123 };

      try {
        // Set with 100ms expiry
        await cacher.set('expiry-key', testData, { expiry: 0.1 });

        // Check immediately
        let exists = await cacher.has('expiry-key');
        asserts.assertEquals(exists, true);

        // Wait for expiry
        await new Promise((resolve) => setTimeout(resolve, 200));

        // Check after expiry
        exists = await cacher.has('expiry-key');
        asserts.assertEquals(exists, false);
      } finally {
        cacher.finalize();
      }
    });

    it('should use default expiry when none provided', async () => {
      const cacher = new MemoryCacher('memory-test', {
        defaultExpiry: 0.1, // 100ms default
      });

      try {
        // Set without specifying expiry
        await cacher.set('default-expiry', 'test');

        // Should exist immediately
        let exists = await cacher.has('default-expiry');
        asserts.assertEquals(exists, true);

        // Wait for default expiry
        await new Promise((resolve) => setTimeout(resolve, 200));

        // Should be gone
        exists = await cacher.has('default-expiry');
        asserts.assertEquals(exists, false);
      } finally {
        cacher.finalize();
      }
    });

    it('should handle no expiry when set to 0', async () => {
      const cacher = new MemoryCacher('memory-test', {});

      try {
        // Set with explicit 0 expiry
        await cacher.set('no-expiry', 'forever', { expiry: 0 });

        // Wait some time
        await new Promise((resolve) => setTimeout(resolve, 200));

        // Should still exist
        const exists = await cacher.has('no-expiry');
        asserts.assertEquals(exists, true);
      } finally {
        cacher.finalize();
      }
    });

    it('should handle sliding window expiry', async () => {
      const cacher = new MemoryCacher('memory-test', {});
      const testData = { name: 'test', value: 123 };

      try {
        // Set with 300ms expiry and sliding window
        await cacher.set('window-key', testData, { expiry: 0.3, window: true });

        // Check immediately
        let exists = await cacher.has('window-key');
        asserts.assertEquals(exists, true);

        // Wait 200ms and access to refresh
        await new Promise((resolve) => setTimeout(resolve, 200));
        const result = await cacher.get('window-key');
        asserts.assertNotEquals(result, undefined);

        // Wait 200ms more (still within new window)
        await new Promise((resolve) => setTimeout(resolve, 200));
        exists = await cacher.has('window-key');
        asserts.assertEquals(exists, true);

        // Wait for full expiry
        await new Promise((resolve) => setTimeout(resolve, 400));
        exists = await cacher.has('window-key');
        asserts.assertEquals(exists, false);
      } finally {
        cacher.finalize();
      }
    });

    it('should not early-evict when a key is re-set (no orphan timer)', async () => {
      const cacher = new MemoryCacher('memory-test', {});

      try {
        // First set with a short 150ms expiry.
        await cacher.set('reset-key', 'first', { expiry: 0.15 });

        // Re-set the same key with a longer 500ms expiry before the first
        // timer fires. The original timer must be cancelled, otherwise it
        // would evict the freshly-set value at ~150ms.
        await new Promise((resolve) => setTimeout(resolve, 50));
        await cacher.set('reset-key', 'second', { expiry: 0.5 });

        // Past the ORIGINAL deadline (~150ms): value must still be present.
        await new Promise((resolve) => setTimeout(resolve, 150));
        asserts.assertEquals(await cacher.get('reset-key'), 'second');

        // Past the NEW deadline (~500ms from re-set): value is gone.
        await new Promise((resolve) => setTimeout(resolve, 450));
        asserts.assertEquals(await cacher.has('reset-key'), false);
      } finally {
        cacher.finalize();
      }
    });

    it('should lazily expire on read past the absolute deadline', async () => {
      const cacher = new MemoryCacher('memory-test', {});

      try {
        await cacher.set('lazy-key', 'value', { expiry: 0.1 });

        // Simulate a throttled/never-fired timer by clearing the scheduled
        // timeout out from under the cacher. The absolute deadline must still
        // make the value read as expired.
        const timers = (cacher as unknown as {
          _expiryTimers: Map<string, ReturnType<typeof setTimeout>>;
        })._expiryTimers;
        const handle = timers.get('memory-test:lazy-key');
        if (handle !== undefined) {
          clearTimeout(handle);
        }

        // Wait past the deadline; timer will not fire because we cleared it.
        await new Promise((resolve) => setTimeout(resolve, 200));

        asserts.assertEquals(await cacher.get('lazy-key'), undefined);
      } finally {
        cacher.finalize();
      }
    });

    it('should not overflow the timer for very large expiry values', async () => {
      const cacher = new MemoryCacher('memory-test', {});

      try {
        // The max allowed expiry (30 days = 2_592_000s ≈ 2.59e9 ms) still
        // exceeds the 32-bit setTimeout limit (~2.15e9 ms), so the timer must
        // be clamped and the value must NOT fire immediately.
        await cacher.set('huge-expiry', 'value', { expiry: 2_592_000 });

        await new Promise((resolve) => setTimeout(resolve, 150));

        asserts.assertEquals(await cacher.get('huge-expiry'), 'value');
      } finally {
        cacher.finalize();
      }
    });

    it('has() and get() agree once the deadline passes (throttled timer)', async () => {
      const cacher = new MemoryCacher('memory-test', {});
      try {
        await cacher.set('lazy-key', 'value', { expiry: 0.05 }); // 50ms deadline
        // Simulate a throttled / never-firing eviction timer by clearing it,
        // so only the lazy absolute-deadline check can expire the key.
        const timers =
          (cacher as unknown as { _expiryTimers: Map<string, number> })
            ._expiryTimers;
        for (const t of timers.values()) clearTimeout(t);

        await new Promise((resolve) => setTimeout(resolve, 120)); // past deadline

        // The bug: has() returned true while get() returned undefined for the
        // same key. Both must now agree the key is expired.
        asserts.assertEquals(await cacher.has('lazy-key'), false);
        asserts.assertEquals(await cacher.get('lazy-key'), undefined);
      } finally {
        cacher.finalize();
      }
    });

    it('should only refresh window on get, not has', async () => {
      const cacher = new MemoryCacher('memory-test', {});

      try {
        // Set with 300ms expiry and sliding window
        await cacher.set('window-key-has', 'test', {
          expiry: 0.3,
          window: true,
        });

        // Wait 200ms and check with has (shouldn't refresh)
        await new Promise((resolve) => setTimeout(resolve, 200));
        const exists = await cacher.has('window-key-has');
        asserts.assertEquals(exists, true);

        // Wait 200ms more (should expire now)
        await new Promise((resolve) => setTimeout(resolve, 200));
        const existsAfter = await cacher.has('window-key-has');
        asserts.assertEquals(
          existsAfter,
          false,
          'Key should expire even after has() check',
        );
      } finally {
        cacher.finalize();
      }
    });
  });

  describe('cleanup', () => {
    it('should clean up resources on finalize()', async () => {
      const cacher = new MemoryCacher('memory-test', {});

      try {
        // Set some data with different expiry times
        await cacher.set('finalize-key1', 'test1', { expiry: 60 });
        await cacher.set('finalize-key2', 'test2', { expiry: 0 });
        await cacher.set('finalize-key3', 'test3', { expiry: 3600 });

        // Verify data exists
        asserts.assertEquals(await cacher.has('finalize-key1'), true);
        asserts.assertEquals(await cacher.has('finalize-key2'), true);

        // Finalize should clear all data and timers
        cacher.finalize();

        // All keys should be gone
        asserts.assertEquals(await cacher.has('finalize-key1'), false);
        asserts.assertEquals(await cacher.has('finalize-key2'), false);
        asserts.assertEquals(await cacher.has('finalize-key3'), false);

        // Should be able to use cacher again after finalize
        await cacher.set('post-finalize', 'value');
        asserts.assertEquals(await cacher.get('post-finalize'), 'value');
      } finally {
        // Call finalize again to clean up the post-finalize test data
        cacher.finalize();
      }
    });
  });

  describe('expiry timer lifecycle (regression)', () => {
    it(
      'unrefs the expiry timer so a pending TTL never pins the process open',
      async () => {
        const cacher = new MemoryCacher('unref-test', {});
        try {
          // Default TTL is 300s; without unref this timer would keep the event
          // loop (and the whole process) alive for the full 5 minutes.
          await cacher.set('k', 'v', { expiry: 300 });

          // deno-lint-ignore no-explicit-any
          const timers = (cacher as any)._expiryTimers as Map<
            string,
            { hasRef?: () => boolean }
          >;
          const timer = timers.get('unref-test:k');
          asserts.assertExists(timer);

          // Node/Bun and modern Deno expose `hasRef()` on the timer handle. An
          // unref'd timer does not hold the event loop open → hasRef() === false.
          // On the pre-fix code the timer was never unref'd, so this was true.
          if (typeof timer.hasRef === 'function') {
            asserts.assertEquals(
              timer.hasRef(),
              false,
              "expiry timer must be unref'd so it cannot keep the process alive",
            );
          }
        } finally {
          cacher.finalize();
        }
      },
    );
  });
});
