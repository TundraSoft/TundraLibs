import * as asserts from '$asserts';
import { MemCacher, type MemCacherOptions } from '../../mod.ts';
import { CacherConfigError } from '../../../errors/mod.ts';
import { MemCacherConnectError } from '../errors/mod.ts';
import { envArgs } from '@tundralibs/utils';
import { MemCacherOperationError } from '../mod.ts';

const env = envArgs('./cacher/engines/memcached/tests/');
Deno.test('Cacher.MemCacher', async (t) => {
  let memcached: MemCacher;

  // Helper function to create a delay
  // const delay = (ms: number) =>
  //   new Promise((resolve) => setTimeout(resolve, ms));

  // Setup and teardown for tests that need an initialized client
  const setupMemcached = () => {
    memcached = new MemCacher('memcached-test', {
      host: env.get('MEMCACHED_HOST'),
      port: parseInt(env.get('MEMCACHED_PORT')),
      maxBufferSize: parseInt(env.get('MEMCACHED_SIZE')),
    });
    return memcached;
  };

  const teardownMemcached = async () => {
    if (memcached) {
      try {
        await memcached.clear();
        await memcached.finalize();
      } catch {
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

    await d.step('set port and maxBufferSize', () => {
      const cacher = new MemCacher('boo', {
        host: 'localhost',
        port: undefined,
        maxBufferSize: undefined,
      });

      asserts.assertEquals(cacher.getOption('port'), 11211);
      asserts.assertEquals(cacher.getOption('maxBufferSize'), 10);
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

    await d.step('should allow custom defaultExpiry', () => {
      const cacher = new MemCacher('memcached-test', {
        host: 'localhost',
        port: 11211,
        defaultExpiry: 600,
      });

      asserts.assertEquals(cacher.getOption('defaultExpiry'), 600);
    });

    await d.step('should validate port range', () => {
      asserts.assertThrows(
        () => {
          new MemCacher('memcached-test', {
            host: 'localhost',
            port: 70000, // Invalid port
          });
        },
        CacherConfigError,
        'Memcached port must be a positive number between 0 and 65535',
      );
    });

    await d.step(
      'should reuse existing connection on multiple init calls',
      async () => {
        const cacher = new MemCacher('memcached-test', {
          host: 'localhost',
          port: 11211,
        });

        try {
          await cacher.init();
          const client = (cacher as any)._client;

          // Call init again
          await cacher.init();

          // Client should be the same instance
          asserts.assertEquals((cacher as any)._client, client);
        } finally {
          await cacher.finalize();
        }
      },
    );
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
        // await delay(100); // Add delay after set
        const result = await memcached.get(key);

        asserts.assertEquals(result, value);
      });

      await d.step('should set and get numeric data', async () => {
        const key = 'test-number';
        const value = 12345;

        await memcached.set(key, value);
        // await delay(100); // Add delay after set
        const result = await memcached.get<number>(key);

        asserts.assertEquals(result, value);
      });

      await d.step('should set and get object data', async () => {
        const key = 'test-object';
        const value = { name: 'test', value: 42, nested: { value: 'nested' } };

        await memcached.set(key, value);
        // await delay(100); // Add delay after set
        const result = await memcached.get(key);

        asserts.assertEquals(result, value);
      });

      await d.step('should set and get array data', async () => {
        const key = 'test-array';
        const value = [1, 2, 'three', { four: 4 }];

        await memcached.set(key, value);
        // await delay(100); // Add delay after set
        const result = await memcached.get(key);

        asserts.assertEquals(result, value);
      });

      await d.step('should check if key exists', async () => {
        const key = 'test-exists';

        await memcached.set(key, 'test-value');
        // await delay(100); // Add delay after set
        const exists = await memcached.has(key);
        const notExists = await memcached.has('non-existent-key');

        asserts.assertEquals(exists, true);
        asserts.assertEquals(notExists, false);
      });

      await d.step('should delete a key', async () => {
        const key = 'test-delete';

        await memcached.set(key, 'test-value');
        // await delay(100); // Add delay after set
        await memcached.delete(key);
        // await delay(100); // Add delay after delete
        const exists = await memcached.has(key);

        asserts.assertEquals(exists, false);
      });

      await d.step('should handle null values', async () => {
        const key = 'test-null';
        await memcached.set(key, null);
        // await delay(100);
        const result = await memcached.get(key);

        asserts.assertEquals(result, null);
      });

      await d.step('should handle empty strings', async () => {
        const key = 'test-empty';
        await memcached.set(key, '');
        // await delay(100);
        const result = await memcached.get<string>(key);

        asserts.assertEquals(result, '');
      });

      await d.step('should handle large objects', async () => {
        const key = 'test-large';
        const largeObj = {
          id: 'test',
          items: Array(100).fill(0).map((_, i) => ({
            id: i,
            value: `value-${i}`,
          })),
          nested: {
            deep: {
              deeper: {
                deepest: 'value',
                array: Array(50).fill('test'),
              },
            },
          },
        };

        await memcached.set(key, largeObj);
        // await delay(100);
        const result = await memcached.get(key);

        asserts.assertEquals(result, largeObj);
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
        // await delay(100); // Add delay after set

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
          // await delay(100); // Add delay after set

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

  await t.step('error handling', async (d) => {
    await d.step('should finalize properly', async () => {
      const cacher = new MemCacher('memcached-test', {
        host: 'localhost',
        port: 11211,
      });

      try {
        await cacher.init();

        // Verify client exists
        asserts.assert((cacher as any)._client !== undefined);

        // Finalize
        await cacher.finalize();

        // Client should be undefined after finalize
        asserts.assertEquals((cacher as any)._client, undefined);

        // Calling finalize again should be safe
        await cacher.finalize();
      } finally {
        // Ensure finalize is called even if assertions fail
        await cacher.finalize();
      }
    });

    await d.step(
      'should throw operation errors for invalid operations',
      async () => {
        // Create a new cacher that's not initialized to test connection errors
        class NoClient extends MemCacher {
          public override async init(): Promise<void> {
            // Do not call super.init() to simulate a failed connection
          }
        }

        const uninitializedCacher = new NoClient('test-errors', {
          host: 'localhost',
          port: 11211,
        });

        try {
          // These should all throw connect errors since client isn't initialized
          await asserts.assertRejects(
            () => uninitializedCacher.get('any-key'),
            MemCacherOperationError,
          );

          await asserts.assertRejects(
            () => uninitializedCacher.set('any-key', 'value'),
            MemCacherOperationError,
          );

          await asserts.assertRejects(
            () => uninitializedCacher.delete('any-key'),
            MemCacherOperationError,
          );

          await asserts.assertRejects(
            () => uninitializedCacher.has('any-key'),
            MemCacherOperationError,
          );

          await asserts.assertRejects(
            () => uninitializedCacher.clear(),
            MemCacherOperationError,
          );
        } finally {
          // Make sure to finalize the instance even though it's not initialized
          await uninitializedCacher.finalize();
        }
      },
    );
  });
});
