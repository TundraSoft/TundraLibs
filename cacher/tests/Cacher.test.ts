import * as asserts from '$asserts';
import { Cacher } from '../Cacher.ts';
import { CacherConfigError } from '../errors/mod.ts';
import { MemCacher, MemoryCacher, RedisCacher } from '../engines/mod.ts';

// Helper to ensure all cachers are destroyed after tests
const destroyAll = async () => {
  await Cacher.destroyAll();
};

Deno.test('Cacher Instance Manager', async (t) => {
  await t.step('creating instances', async (d) => {
    await d.step('should create a MemoryCacher instance', async () => {
      try {
        const cacher = await Cacher.create('memory-test', {
          engine: 'MEMORY',
        });

        asserts.assert(cacher instanceof MemoryCacher);
        asserts.assertEquals(cacher.name, 'memory-test');
        asserts.assertEquals(cacher.Engine, 'MEMORY');
      } finally {
        await Cacher.destroy('memory-test');
      }
    });

    await d.step('should create a MemCacher instance', async () => {
      try {
        const cacher = await Cacher.create('memcached-test', {
          engine: 'MEMCACHED',
          host: 'localhost',
          port: 11211,
        });

        asserts.assert(cacher instanceof MemCacher);
        asserts.assertEquals(cacher.name, 'memcached-test');
        asserts.assertEquals(cacher.Engine, 'MEMCACHED');
      } finally {
        await Cacher.destroy('memcached-test');
      }
    });

    await d.step('should create a RedisCacher instance', async () => {
      try {
        const cacher = await Cacher.create('redis-test', {
          engine: 'REDIS',
          host: 'localhost',
          port: 6379,
        });

        asserts.assert(cacher instanceof RedisCacher);
        asserts.assertEquals(cacher.name, 'redis-test');
        asserts.assertEquals(cacher.Engine, 'REDIS');
      } finally {
        await Cacher.destroy('redis-test');
      }
    });

    await d.step('should reject invalid options for MemCacher', async () => {
      await asserts.assertRejects(
        async () => {
          await Cacher.create('invalid-memcached', {
            engine: 'MEMCACHED',
            // Missing host
          });
        },
        CacherConfigError,
        'Missing required property: host',
      );
    });

    await d.step('should reject invalid options for RedisCacher', async () => {
      await asserts.assertRejects(
        async () => {
          await Cacher.create('invalid-redis', {
            engine: 'REDIS',
            // Missing host
          });
        },
        CacherConfigError,
        'Missing required property: host',
      );
    });

    await d.step('should reject unknown engine', async () => {
      await asserts.assertRejects(
        async () => {
          await Cacher.create('invalid-engine', {
            engine: 'UNKNOWN' as any,
          });
        },
        Error,
        'Unsupported engine',
      );
    });
  });

  await t.step('getting instances', async (d) => {
    await d.step('should get an existing instance', async () => {
      try {
        // Create first
        await Cacher.create('get-test', {
          engine: 'MEMORY',
        });

        // Then get
        const instance = Cacher.get('get-test');

        asserts.assertNotEquals(instance, undefined);
        asserts.assert(instance instanceof MemoryCacher);
      } finally {
        await Cacher.destroy('get-test');
      }
    });

    await d.step('should return undefined for non-existent instance', () => {
      const instance = Cacher.get('non-existent');
      asserts.assertEquals(instance, undefined);
    });

    await d.step('should trim instance names when getting', async () => {
      try {
        // Create with normal name
        await Cacher.create('trim-test', {
          engine: 'MEMORY',
        });

        // Get with spaces
        const instance = Cacher.get('  trim-test  ');

        asserts.assertNotEquals(instance, undefined);
        asserts.assert(instance instanceof MemoryCacher);
      } finally {
        await Cacher.destroy('trim-test');
      }
    });
  });

  await t.step('checking instance existence', async (d) => {
    await d.step('should return true for existing instance', async () => {
      try {
        await Cacher.create('has-test', {
          engine: 'MEMORY',
        });

        const exists = Cacher.has('has-test');
        asserts.assertEquals(exists, true);
      } finally {
        await Cacher.destroy('has-test');
      }
    });

    await d.step('should return false for non-existent instance', () => {
      const exists = Cacher.has('non-existent');
      asserts.assertEquals(exists, false);
    });
  });

  await t.step('destroying instances', async (d) => {
    await d.step('should destroy a specific instance', async () => {
      // Create
      await Cacher.create('destroy-test', {
        engine: 'MEMORY',
      });

      // Verify it exists
      asserts.assertEquals(Cacher.has('destroy-test'), true);

      // Destroy
      await Cacher.destroy('destroy-test');

      // Verify it's gone
      asserts.assertEquals(Cacher.has('destroy-test'), false);
    });

    await d.step(
      'should do nothing when destroying non-existent instance',
      async () => {
        const result = await Cacher.destroy('non-existent');
        asserts.assertEquals(result, undefined);
      },
    );

    await d.step('should destroy all instances', async () => {
      // Create multiple instances
      await Cacher.create('destroy-all-1', { engine: 'MEMORY' });
      await Cacher.create('destroy-all-2', { engine: 'MEMORY' });
      await Cacher.create('destroy-all-3', { engine: 'MEMORY' });

      // Verify they exist
      asserts.assertEquals(Cacher.has('destroy-all-1'), true);
      asserts.assertEquals(Cacher.has('destroy-all-2'), true);
      asserts.assertEquals(Cacher.has('destroy-all-3'), true);

      // Destroy all
      await Cacher.destroyAll();

      // Verify they're all gone
      asserts.assertEquals(Cacher.has('destroy-all-1'), false);
      asserts.assertEquals(Cacher.has('destroy-all-2'), false);
      asserts.assertEquals(Cacher.has('destroy-all-3'), false);
    });
  });

  await t.step('reusing instance names', async (d) => {
    await d.step(
      'should return existing instance when creating with same name',
      async () => {
        try {
          // Create first instance
          const instance1 = await Cacher.create('reuse-test', {
            engine: 'MEMORY',
          });

          // Try to create again with same name
          const instance2 = await Cacher.create('reuse-test', {
            engine: 'MEMORY',
          });

          // Should be the same instance
          asserts.assertStrictEquals(instance1, instance2);
        } finally {
          await Cacher.destroy('reuse-test');
        }
      },
    );

    await d.step(
      'should be able to create new instance after destroying',
      async () => {
        // Create
        const instance1 = await Cacher.create('recreate-test', {
          engine: 'MEMORY',
        });

        // Destroy
        await Cacher.destroy('recreate-test');

        // Create again
        const instance2 = await Cacher.create('recreate-test', {
          engine: 'MEMORY',
        });

        // Should be different instances
        asserts.assertNotStrictEquals(instance1, instance2);

        // Clean up
        await Cacher.destroy('recreate-test');
      },
    );
  });

  // Final cleanup
  await Cacher.destroyAll();
});
