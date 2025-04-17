import * as asserts from '$asserts';
import { RedisCacher, type RedisCacherOptions } from '../engines/mod.ts';
import { CacherConfigError } from '../errors/mod.ts';
import { RedisCacherConnectError } from '../engines/redis/errors/mod.ts';

Deno.test('Cacher.RedisCacher', async (t) => {
  let redis: RedisCacher;

  // Setup and teardown for tests that need an initialized client
  const setupRedis = () => {
    redis = new RedisCacher('redis-test', {
      host: 'localhost',
      port: 6379,
    });
    return redis;
  };

  const teardownRedis = async () => {
    if (redis) {
      try {
        await redis.clear();
        await redis.finalize();
      } catch (e) {
        // Ignore errors during teardown
      }
    }
  };

  await t.step('initialization', async (d) => {
    await d.step('should create an instance with default options', () => {
      const cacher = new RedisCacher('redis-test', {
        host: 'localhost',
        port: 6379,
      });

      asserts.assert(cacher instanceof RedisCacher);
      asserts.assertEquals(cacher.name, 'redis-test');
      asserts.assertEquals(cacher.Engine, 'REDIS');
      asserts.assertEquals(cacher.getOption('defaultExpiry'), 300);
    });

    await d.step('Should throw on invalid config', () => {
      asserts.assertThrows(
        () => {
          new RedisCacher('redis-test', {
            port: 6379,
          });
        },
        CacherConfigError,
        'Host is required',
      );

      // Test for the port error message
      asserts.assertThrows(
        () => {
          new RedisCacher('redis-test', {
            host: 'localhost',
            port: -1,
          });
        },
        CacherConfigError,
        'Redis port must be a positive number',
      );

      asserts.assertThrows(
        () => {
          new RedisCacher('redis-test', {
            host: 'localhost',
            port: 'invalid-port',
          } as unknown as RedisCacherOptions);
        },
        CacherConfigError,
      );
    });
  });

  await t.step('data operations', async (d) => {
    // Setup client before tests
    setupRedis();

    try {
      await redis.init();

      await d.step('should set and get string data', async () => {
        const key = 'test-string';
        const value = 'test-value';

        await redis.set(key, value);
        const result = await redis.get(key);

        asserts.assertEquals(result, value);
      });

      await d.step('should set and get numeric data', async () => {
        const key = 'test-number';
        const value = 12345;

        await redis.set(key, value);
        const result = await redis.get(key);

        asserts.assertEquals(result, value);
      });

      await d.step('should set and get object data', async () => {
        const key = 'test-object';
        const value = { name: 'test', value: 42, nested: { value: 'nested' } };

        await redis.set(key, value);
        const result = await redis.get(key);

        asserts.assertEquals(result, value);
      });

      await d.step('should set and get array data', async () => {
        const key = 'test-array';
        const value = [1, 2, 'three', { four: 4 }];

        await redis.set(key, value);
        const result = await redis.get(key);

        asserts.assertEquals(result, value);
      });

      await d.step('should check if key exists', async () => {
        const key = 'test-exists';

        await redis.set(key, 'test-value');
        const exists = await redis.has(key);
        const notExists = await redis.has('non-existent-key');

        asserts.assertEquals(exists, true);
        asserts.assertEquals(notExists, false);
      });

      await d.step('should delete a key', async () => {
        const key = 'test-delete';

        await redis.set(key, 'test-value');
        await redis.delete(key);
        const exists = await redis.has(key);

        asserts.assertEquals(exists, false);
      });
    } finally {
      // Cleanup after tests
      await teardownRedis();
    }
  });

  await t.step('expiry functionality', async (d) => {
    setupRedis();

    try {
      await redis.init();

      await d.step('should respect custom expiry time', async () => {
        const key = 'test-expiry';
        const value = 'expires-soon';

        // Set with 2 second expiry
        await redis.set(key, value, { expiry: 2 });

        // Verify it exists immediately
        let result = await redis.get(key);
        asserts.assertEquals(result, value);

        // Wait for expiry
        await new Promise((resolve) => setTimeout(resolve, 2100));

        // Verify it's gone
        result = await redis.get(key);
        asserts.assertEquals(result, undefined);
      });
    } finally {
      await teardownRedis();
    }
  });

  await t.step('window mode functionality', async (d) => {
    setupRedis();

    try {
      await redis.init();

      await d.step(
        'should extend expiry when window mode is enabled',
        async () => {
          const key = 'test-window-mode';
          const value = 'window-mode-value';

          // Set with 3 second expiry and window mode enabled
          await redis.set(key, value, { expiry: 3, window: true });

          // Verify it exists immediately
          let result = await redis.get(key);
          asserts.assertEquals(result, value);

          // Wait 2 seconds (less than expiry)
          await new Promise((resolve) => setTimeout(resolve, 2000));

          // Get it again - this should extend the expiry
          result = await redis.get(key);
          asserts.assertEquals(result, value);

          // Wait 2 more seconds - it should still exist because expiry was extended
          await new Promise((resolve) => setTimeout(resolve, 2000));

          result = await redis.get(key);
          asserts.assertEquals(result, value);
        },
      );
    } finally {
      await teardownRedis();
    }
  });

  await t.step('connection errors', async (d) => {
    await d.step('should throw on wrong connection info', async () => {
      const badCacher = new RedisCacher('bad-connection', {
        host: 'nonexistent-host',
        port: 6379,
      });

      await asserts.assertRejects(
        async () => {
          await badCacher.init();
          await badCacher.get('any-key');
        },
        RedisCacherConnectError,
      );
    });
  });
});
