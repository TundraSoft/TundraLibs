import * as asserts from '$asserts';
import { MemCacher, type MemCacherOptions } from './mod.ts';
import { CacherEngineError } from '../../errors/mod.ts';
import { envArgs } from '@tundralibs/utils';

const env = envArgs('./cacher/engines/');
Deno.test('cacher.engines.memcached', async (t) => {
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

  await t.step('initialization', async (u) => {
    await u.step('should create an instance with default options', () => {
      const cacher = new MemCacher('memory-test', {
        host: 'localhost',
        port: 11211,
      });

      asserts.assert(cacher instanceof MemCacher);
      asserts.assertEquals(cacher.name, 'memory-test');
      asserts.assertEquals(cacher.Engine, 'MEMCACHED');
      asserts.assertEquals(cacher.getOption('defaultExpiry'), 300);
    });

    await u.step('set port and maxBufferSize', () => {
      const cacher = new MemCacher('boo', {
        host: 'localhost',
        port: undefined,
        maxBufferSize: undefined,
      });

      asserts.assertEquals(cacher.getOption('port'), 11211);
      asserts.assertEquals(cacher.getOption('maxBufferSize'), 10);
    });

    await u.step('Should throw on invalid config', () => {
      asserts.assertThrows(
        () => {
          const _ = new MemCacher('memory-test', {
            port: 11211,
          });
        },
        CacherEngineError,
        'Configuration key host is missing',
      );

      // Test for the corrected port error message
      asserts.assertThrows(
        () => {
          const _ = new MemCacher('memory-test', {
            host: 'localhost',
            port: -1,
          });
        },
        CacherEngineError,
        'Configuration value for port is invalid: must be a positive number between 0 and 65535',
      );

      asserts.assertThrows(
        () => {
          const _ = new MemCacher('memory-test', {
            host: 'localhost',
            port: 'daf',
          } as unknown as MemCacherOptions);
        },
        CacherEngineError,
      );

      asserts.assertThrows(
        () => {
          const _ = new MemCacher('memory-test', {
            host: null,
            port: 11211,
          } as unknown as MemCacherOptions);
        },
        CacherEngineError,
        'Configuration key host is missing',
      );

      asserts.assertThrows(
        () => {
          const _ = new MemCacher('memory-test', {
            host: 'localhost',
            port: 11211,
            maxBufferSize: -1,
          } as unknown as MemCacherOptions);
        },
        CacherEngineError,
        'Configuration value for maxBufferSize is invalid: must be a positive number',
      );

      asserts.assertThrows(
        () => {
          const _ = new MemCacher('memory-test', {
            host: 'localhost',
            port: 11211,
            maxBufferSize: 'dasfsdf',
          } as unknown as MemCacherOptions);
        },
        CacherEngineError,
        'Configuration value for maxBufferSize is invalid: must be a positive number',
      );
    });

    await u.step('should allow custom defaultExpiry', () => {
      const cacher = new MemCacher('memcached-test', {
        host: 'localhost',
        port: 11211,
        defaultExpiry: 600,
      });

      asserts.assertEquals(cacher.getOption('defaultExpiry'), 600);
    });

    await u.step('should validate port range', () => {
      asserts.assertThrows(
        () => {
          const _ = new MemCacher('memcached-test', {
            host: 'localhost',
            port: 70000, // Invalid port
          });
        },
        CacherEngineError,
        'Configuration value for port is invalid: must be a positive number between 0 and 65535',
      );
    });

    await u.step(
      'should reuse existing connection on multiple init calls',
      async () => {
        const cacher = new MemCacher('memcached-test', {
          host: env.get('MEMCACHED_HOST') || 'localhost',
          port: parseInt(env.get('MEMCACHED_PORT'), 0) || 11211,
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

  await t.step('data operations', async (u) => {
    // Setup client before tests
    setupMemcached();

    try {
      await memcached.init();

      await u.step('should set and get string data', async () => {
        const key = 'test-string';
        const value = 'test-value';

        await memcached.set(key, value);
        const result = await memcached.get(key);

        asserts.assertEquals(result, value);
      });

      await u.step('should set and get numeric data', async () => {
        const key = 'test-number';
        const value = 12345;

        await memcached.set(key, value);
        const result = await memcached.get<number>(key);

        asserts.assertEquals(result, value);
      });

      await u.step('should set and get object data', async () => {
        const key = 'test-object';
        const value = { name: 'test', value: 42, nested: { value: 'nested' } };

        await memcached.set(key, value);
        const result = await memcached.get(key);

        asserts.assertEquals(result, value);
      });

      await u.step('should set and get array data', async () => {
        const key = 'test-array';
        const value = [1, 2, 'three', { four: 4 }];

        await memcached.set(key, value);
        const result = await memcached.get(key);

        asserts.assertEquals(result, value);
      });

      await u.step('should check if key exists', async () => {
        const key = 'test-exists';

        await memcached.set(key, 'test-value');
        const exists = await memcached.has(key);
        const notExists = await memcached.has('non-existent-key');

        asserts.assertEquals(exists, true);
        asserts.assertEquals(notExists, false);
      });

      await u.step('should delete a key', async () => {
        const key = 'test-delete';

        await memcached.set(key, 'test-value');
        await memcached.delete(key);
        const exists = await memcached.has(key);

        asserts.assertEquals(exists, false);
      });

      await u.step('should handle null values', async () => {
        const key = 'test-null';
        await memcached.set(key, null);
        const result = await memcached.get(key);

        asserts.assertEquals(result, null);
      });

      await u.step('should handle empty strings', async () => {
        const key = 'test-empty';
        await memcached.set(key, '');
        const result = await memcached.get<string>(key);

        asserts.assertEquals(result, '');
      });

      await u.step('should handle large objects', async () => {
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
        const result = await memcached.get(key);

        asserts.assertEquals(result, largeObj);
      });
    } finally {
      // Cleanup after tests
      await teardownMemcached();
    }
  });

  await t.step('expiry functionality', async (u) => {
    setupMemcached();

    try {
      await memcached.init();

      await u.step('should respect custom expiry time', async () => {
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

  await t.step('window mode functionality', async (u) => {
    setupMemcached();

    try {
      await memcached.init();

      await u.step(
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

  await t.step('connection errors', async (u) => {
    await u.step('should throw on wrong connection info', async () => {
      const badCacher = new MemCacher('bad-connection', {
        host: 'nonexistent-host',
        port: 11211,
      });

      await asserts.assertRejects(
        async () => {
          await badCacher.init();
          await badCacher.get('any-key');
        },
        CacherEngineError,
      );
    });
  });

  await t.step('error handling', async (u) => {
    await u.step('should finalize properly', async () => {
      const cacher = new MemCacher('memcached-test', {
        host: env.get('MEMCACHED_HOST') || 'localhost',
        port: parseInt(env.get('MEMCACHED_PORT'), 0) || 11211,
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

    await u.step(
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
            CacherEngineError,
          );

          await asserts.assertRejects(
            () => uninitializedCacher.set('any-key', 'value'),
            CacherEngineError,
          );

          await asserts.assertRejects(
            () => uninitializedCacher.delete('any-key'),
            CacherEngineError,
          );

          await asserts.assertRejects(
            () => uninitializedCacher.has('any-key'),
            CacherEngineError,
          );

          await asserts.assertRejects(
            () => uninitializedCacher.clear(),
            CacherEngineError,
          );
        } finally {
          // Make sure to finalize the instance even though it's not initialized
          await uninitializedCacher.finalize();
        }
      },
    );
  });
});
