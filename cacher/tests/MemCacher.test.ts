import * as asserts from '$asserts';
import { MemCacher, type MemCacherOptions } from '../engines/mod.ts';
import { CacherConfigError } from '../errors/mod.ts';
import {
  MemCacherConnectError,
  MemCacherOperationError,
} from '../engines/memcached/errors/mod.ts';

Deno.test('Cacher.MemCacher', async (t) => {
  let memcached: MemCacher;

  // Setup and teardown for tests that need an initialized client
  const setupMemcached = () => {
    memcached = new MemCacher('memcached-test', {
      host: 'localhost',
      port: 11211,
    });
    return memcached;
  };

  const teardownMemcached = async () => {
    if (memcached) {
      try {
        await memcached.clear();
        await memcached.finalize();
      } catch (e) {
        // Ignore errors during teardown
      }
    }
  };

  await t.step('initialization', async (d) => {
    await d.step('should create an instance with default options', () => {
      const cacher = new MemCacher('memory-test', {
        host: 'localhost',
        port: 11211,
      });

      asserts.assert(cacher instanceof MemCacher);
      asserts.assertEquals(cacher.name, 'memory-test');
      asserts.assertEquals(cacher.Engine, 'MEMCACHED');
      asserts.assertEquals(cacher.getOption('defaultExpiry'), 300);
    });

    await d.step('Should throw on invalid config', () => {
      asserts.assertThrows(
        () => {
          new MemCacher('memory-test', {
            port: 11211,
          });
        },
        CacherConfigError,
        'Host is required',
      );

      // Test for the corrected port error message
      asserts.assertThrows(
        () => {
          new MemCacher('memory-test', {
            host: 'localhost',
            port: -1,
          });
        },
        CacherConfigError,
        'Memcached port must be a positive number',
      );

      asserts.assertThrows(
        () => {
          new MemCacher('memory-test', {
            host: 'localhost',
            port: 'daf',
          } as unknown as MemCacherOptions);
        },
        CacherConfigError,
      );
    });
  });

  await t.step('data operations', async (d) => {
    // Setup client before tests
    setupMemcached();

    try {
      await memcached.init();

      await d.step('should set and get string data', async () => {
        const key = 'test-string';
        const value = 'test-value';

        await memcached.set(key, value);
        const result = await memcached.get(key);

        asserts.assertEquals(result, value);
      });

      await d.step('should set and get numeric data', async () => {
        const key = 'test-number';
        const value = 12345;

        await memcached.set(key, value);
        const result = await memcached.get<number>(key);

        asserts.assertEquals(result, value);
      });

      await d.step('should set and get object data', async () => {
        const key = 'test-object';
        const value = { name: 'test', value: 42, nested: { value: 'nested' } };

        await memcached.set(key, value);
        const result = await memcached.get(key);

        asserts.assertEquals(result, value);
      });

      await d.step('should set and get array data', async () => {
        const key = 'test-array';
        const value = [1, 2, 'three', { four: 4 }];

        await memcached.set(key, value);
        const result = await memcached.get(key);

        asserts.assertEquals(result, value);
      });

      await d.step('should check if key exists', async () => {
        const key = 'test-exists';

        await memcached.set(key, 'test-value');
        const exists = await memcached.has(key);
        const notExists = await memcached.has('non-existent-key');

        asserts.assertEquals(exists, true);
        asserts.assertEquals(notExists, false);
      });

      await d.step('should delete a key', async () => {
        const key = 'test-delete';

        await memcached.set(key, 'test-value');
        await memcached.delete(key);
        const exists = await memcached.has(key);

        asserts.assertEquals(exists, false);
      });
    } finally {
      // Cleanup after tests
      await teardownMemcached();
    }
  });

  await t.step('expiry functionality', async (d) => {
    setupMemcached();

    try {
      await memcached.init();

      await d.step('should respect custom expiry time', async () => {
        const key = 'test-expiry';
        const value = 'expires-soon';

        // Set with 2 second expiry
        await memcached.set(key, value, { expiry: 2 });

        // Verify it exists immediately
        let result = await memcached.get(key);
        asserts.assertEquals(result, value);

        // Wait for expiry
        await new Promise((resolve) => setTimeout(resolve, 2100));

        // Verify it's gone
        result = await memcached.get(key);
        asserts.assertEquals(result, undefined);
      });
    } finally {
      await teardownMemcached();
    }
  });

  await t.step('window mode functionality', async (d) => {
    setupMemcached();

    try {
      await memcached.init();

      await d.step(
        'should extend expiry when window mode is enabled',
        async () => {
          const key = 'test-window-mode';
          const value = 'window-mode-value';

          // Set with 3 second expiry and window mode enabled
          await memcached.set(key, value, { expiry: 3, window: true });

          // Verify it exists immediately
          let result = await memcached.get(key);
          asserts.assertEquals(result, value);

          // Wait 2 seconds (less than expiry)
          await new Promise((resolve) => setTimeout(resolve, 2000));

          // Get it again - this should extend the expiry
          result = await memcached.get(key);
          asserts.assertEquals(result, value);

          // Wait 2 more seconds - it should still exist because expiry was extended
          await new Promise((resolve) => setTimeout(resolve, 2000));

          result = await memcached.get(key);
          asserts.assertEquals(result, value);
        },
      );
    } finally {
      await teardownMemcached();
    }
  });

  await t.step('connection errors', async (d) => {
    await d.step('should throw on wrong connection info', async () => {
      const badCacher = new MemCacher('bad-connection', {
        host: 'nonexistent-host',
        port: 11211,
      });

      await asserts.assertRejects(
        async () => {
          await badCacher.init();
          await badCacher.get('any-key');
        },
        MemCacherConnectError,
      );
    });
  });
});
