import * as asserts from '$asserts';
import { MemoryCacher } from '../engines/memory/Cacher.ts';

Deno.test('Cacher.MemoryCacher', async (t) => {
  await t.step('initialization', async (t) => {
    await t.step('should create an instance with default options', async () => {
      const cacher = new MemoryCacher('memory-test', {});

      try {
        asserts.assert(cacher instanceof MemoryCacher);
        asserts.assertEquals(cacher.name, 'memory-test');
        asserts.assertEquals(cacher.Engine, 'MEMORY');
        asserts.assertEquals(cacher.getOption('defaultExpiry'), 300);
      } finally {
        await cacher.finalize();
      }
    });

    await t.step('should create an instance with custom options', async () => {
      const cacher = new MemoryCacher('memory-test', {
        defaultExpiry: 600,
      });

      try {
        asserts.assertEquals(cacher.getOption('defaultExpiry'), 600);
      } finally {
        await cacher.finalize();
      }
    });

    await t.step('should explicitly initialize without errors', async () => {
      const cacher = new MemoryCacher('memory-test', {});

      try {
        // init() is a no-op for MemoryCacher but should still be callable
        await cacher.init();

        // Should be able to perform operations after explicit init
        await cacher.set('test-init', 'value');
        const value = await cacher.get('test-init');
        asserts.assertEquals(value, 'value');
      } finally {
        await cacher.finalize();
      }
    });
  });

  await t.step('cache operations', async (t) => {
    await t.step('should set and get different data types', async () => {
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
        await cacher.finalize();
      }
    });

    await t.step('should return undefined for non-existent keys', async () => {
      const cacher = new MemoryCacher('memory-test', {});

      try {
        const result = await cacher.get('non-existent');
        asserts.assertEquals(result, undefined);
      } finally {
        await cacher.finalize();
      }
    });

    await t.step(
      'should handle key case sensitivity and trimming',
      async () => {
        const cacher = new MemoryCacher('memory-test', {});

        try {
          await cacher.set('MIXEDCASE', 'value');
          // Keys should be normalized to lowercase internally
          const result = await cacher.get('mixedcase');
          asserts.assertEquals(result, 'value');

          await cacher.set(' spaced-key ', 'spaced');
          // Keys should be trimmed
          const spacedResult = await cacher.get('spaced-key');
          asserts.assertEquals(spacedResult, 'spaced');
        } finally {
          await cacher.finalize();
        }
      },
    );

    await t.step('should check if a key exists', async () => {
      const cacher = new MemoryCacher('memory-test', {});
      const testData = { name: 'test', value: 123 };

      try {
        await cacher.set('exists-key', testData, { expiry: 60 });
        const exists = await cacher.has('exists-key');
        const notExists = await cacher.has('not-exists-key');

        asserts.assertEquals(exists, true);
        asserts.assertEquals(notExists, false);
      } finally {
        await cacher.finalize();
      }
    });

    await t.step('should delete a key', async () => {
      const cacher = new MemoryCacher('memory-test', {});
      const testData = { name: 'test', value: 123 };

      try {
        await cacher.set('delete-key', testData, { expiry: 60 });
        await cacher.delete('delete-key');
        const exists = await cacher.has('delete-key');

        asserts.assertEquals(exists, false);
      } finally {
        await cacher.finalize();
      }
    });

    await t.step('should clear all keys', async () => {
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
        await cacher.finalize();
      }
    });

    await t.step('should respect namespace isolation', async () => {
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
        await cacher1.finalize();
        await cacher2.finalize();
      }
    });
  });

  await t.step('expiry behavior', async (t) => {
    await t.step('should handle automatic expiry', async () => {
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
        await cacher.finalize();
      }
    });

    await t.step('should use default expiry when none provided', async () => {
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
        await cacher.finalize();
      }
    });

    await t.step('should handle no expiry when set to 0', async () => {
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
        await cacher.finalize();
      }
    });

    await t.step('should handle sliding window expiry', async () => {
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
        await cacher.finalize();
      }
    });

    await t.step('should only refresh window on get, not has', async () => {
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
        await cacher.finalize();
      }
    });
  });

  await t.step('cleanup', async (t) => {
    await t.step('should clean up resources on finalize()', async () => {
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
        await cacher.finalize();

        // All keys should be gone
        asserts.assertEquals(await cacher.has('finalize-key1'), false);
        asserts.assertEquals(await cacher.has('finalize-key2'), false);
        asserts.assertEquals(await cacher.has('finalize-key3'), false);

        // Should be able to use cacher again after finalize
        await cacher.set('post-finalize', 'value');
        asserts.assertEquals(await cacher.get('post-finalize'), 'value');
      } finally {
        // Call finalize again to clean up the post-finalize test data
        await cacher.finalize();
      }
    });
  });
});
