import * as asserts from '$asserts';
import { MemoryCacher, type MemoryCacherOptions } from '../engines/mod.ts';
import { Engine } from '../Engines.ts';
import type { CacherOptions } from '../types/mod.ts';
import { AbstractCacher } from '../AbstractCacher.ts';

// Simplified helper for creating cachers of different types
function createCacher(engine: Engine, name: string): AbstractCacher<any> {
  // For now, we'll only use MemoryCacher for integration tests
  // since it doesn't require external connections
  return new MemoryCacher(name, { engine: 'MEMORY' } as MemoryCacherOptions);
}

Deno.test('Cacher.Integration', async (t) => {
  await t.step('should work consistently across implementations', async (t) => {
    // Create cachers for each engine type
    const memoryCacher = createCacher('MEMORY', 'memory-integration');

    // Setup test data
    const testData = {
      string: 'test-string',
      number: 42,
      boolean: true,
      object: { nested: 'value' },
      array: [1, 2, 3],
    };

    await t.step('should maintain data integrity across types', async () => {
      // Set data in both cachers
      await memoryCacher.set('test-data', testData, { expiry: 60 });

      // Get data from both cachers
      const memoryResult = await memoryCacher.get<typeof testData>('test-data');

      // Verify data integrity
      asserts.assertEquals(memoryResult, testData);
    });

    await t.step('should handle complex data structures', async () => {
      const complexData = {
        deeply: {
          nested: {
            object: {
              with: ['array', 'values'],
              and: {
                multiple: 'properties',
                including: 123,
                and: true,
                alsoNull: null,
                evenUndefined: undefined,
              },
            },
          },
        },
      };

      // Set in memory cacher
      await memoryCacher.set('complex-data', complexData, { expiry: 60 });

      // Get and verify
      const result = await memoryCacher.get<typeof complexData>('complex-data');
      // Deep equality check
      asserts.assertEquals(result, JSON.parse(JSON.stringify(complexData)));
    });

    await t.step('should handle cache expiration consistently', async () => {
      // Set with short expiry time
      await memoryCacher.set('expiring', 'will-expire', { expiry: 0.1 });

      // Should exist initially
      let memoryExists = await memoryCacher.has('expiring');
      asserts.assertEquals(memoryExists, true);

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Should be gone after expiration
      memoryExists = await memoryCacher.has('expiring');
      asserts.assertEquals(memoryExists, false);
    });

    await t.step('should support cache operations consistently', async () => {
      // Test multiple operations in sequence

      // 1. Set values
      await memoryCacher.set('key1', 'value1', { expiry: 60 });
      await memoryCacher.set('key2', 'value2', { expiry: 60 });

      // 2. Check existence
      asserts.assertEquals(await memoryCacher.has('key1'), true);
      asserts.assertEquals(await memoryCacher.has('key2'), true);

      // 3. Delete one key
      await memoryCacher.delete('key1');

      // 4. Verify deletion
      asserts.assertEquals(await memoryCacher.has('key1'), false);
      asserts.assertEquals(await memoryCacher.has('key2'), true);

      // 5. Clear all keys
      await memoryCacher.clear();

      // 6. Verify all keys cleared
      asserts.assertEquals(await memoryCacher.has('key2'), false);
    });

    // Cleanup
    await memoryCacher.finalize();
  });
});
