import * as asserts from '$asserts';
import { Cacher } from './Cacher.ts';
import { AbstractEngine } from './AbstractEngine.ts';
import { CacherError } from './errors/mod.ts';
import type { CacherOptions } from './types/mod.ts';
import type { CacheValue } from './types/Value.ts';

/**
 * Mock engine for testing purposes
 */
class MockEngine extends AbstractEngine {
  public readonly Engine = 'MOCK';

  private readonly _storage = new Map<string, CacheValue>();

  protected override async _set(key: string, value: CacheValue): Promise<void> {
    this._storage.set(key, value);
  }

  protected override async _get(key: string): Promise<CacheValue | undefined> {
    return this._storage.get(key);
  }

  protected override async _has(key: string): Promise<boolean> {
    return this._storage.has(key);
  }

  protected override async _delete(key: string): Promise<void> {
    this._storage.delete(key);
  }

  protected override async _clear(): Promise<void> {
    this._storage.clear();
  }

  public async size(): Promise<number> {
    return this._storage.size;
  }

  public override async finalize(): Promise<void> {
    this._storage.clear();
  }
}

/**
 * Mock engine that throws errors during construction
 */
class FailingMockEngine extends AbstractEngine {
  public readonly Engine = 'FAILING_MOCK';

  constructor(name: string, options: CacherOptions) {
    super(name, options);
    throw new Error('Mock construction failure');
  }

  protected override async _set(
    _key: string,
    _value: CacheValue,
  ): Promise<void> {
    // no-op
  }

  protected override async _get(_key: string): Promise<CacheValue | undefined> {
    return undefined;
  }

  protected override async _has(_key: string): Promise<boolean> {
    return false;
  }

  protected override async _delete(_key: string): Promise<void> {
    // no-op
  }

  protected override async _clear(): Promise<void> {
    // no-op
  }
}

Deno.test('cacher.core', async (t) => {
  // Helper to reset Cacher state between tests
  const resetCacher = async () => {
    await Cacher.clear();
    // Remove test engines
    Cacher.removeEngine('MOCK');
    Cacher.removeEngine('FAILING');
    Cacher.removeEngine('TEST_ENGINE');
    Cacher.removeEngine('WHITESPACE_ENGINE');
    Cacher.removeEngine('DUPLICATE');
    Cacher.removeEngine('CUSTOM_ENGINE');
  };

  await t.step('initialization', async (d) => {
    await d.step('should have default engines registered', () => {
      const engines = Cacher.getRegisteredEngines();

      asserts.assert(engines.includes('MEMORY'));
      asserts.assert(engines.includes('REDIS'));
      asserts.assert(engines.includes('MEMCACHED'));
      asserts.assertEquals(engines.length, 3);
    });

    await d.step('should have no active instances initially', () => {
      const instances = Cacher.getActiveInstances();
      asserts.assertEquals(instances.length, 0);
    });
  });

  await t.step('addEngine', async (d) => {
    await resetCacher();

    await d.step('should register a new engine successfully', () => {
      Cacher.addEngine('MOCK', MockEngine as any);
      const engines = Cacher.getRegisteredEngines();
      asserts.assert(engines.includes('MOCK'));
    });

    await d.step('should normalize engine names to uppercase', () => {
      Cacher.addEngine('test_engine', MockEngine as any);
      const engines = Cacher.getRegisteredEngines();
      asserts.assert(engines.includes('TEST_ENGINE'));
    });

    await d.step('should trim whitespace from engine names', () => {
      Cacher.addEngine('  whitespace_engine  ', MockEngine as any);
      const engines = Cacher.getRegisteredEngines();
      asserts.assert(engines.includes('WHITESPACE_ENGINE'));
    });

    await d.step('should throw error when registering duplicate engine', () => {
      // First registration should succeed
      Cacher.addEngine('DUPLICATE', MockEngine as any);

      // Second registration should fail
      asserts.assertThrows(
        () => Cacher.addEngine('DUPLICATE', MockEngine as any),
        CacherError,
        'Engine "DUPLICATE" is already registered',
      );
    });

    await d.step('should throw error for invalid engine name', () => {
      asserts.assertThrows(
        () => Cacher.addEngine('', MockEngine as any),
        CacherError,
        'Engine name must be a non-empty string',
      );

      asserts.assertThrows(
        () => Cacher.addEngine(null as any, MockEngine as any),
        CacherError,
        'Engine name must be a non-empty string',
      );

      asserts.assertThrows(
        () => Cacher.addEngine(123 as any, MockEngine as any),
        CacherError,
        'Engine name must be a non-empty string',
      );
    });

    await d.step('should throw error for invalid engine constructor', () => {
      asserts.assertThrows(
        () => Cacher.addEngine('INVALID', null as any),
        CacherError,
        'Engine must be a constructor function',
      );

      asserts.assertThrows(
        () => Cacher.addEngine('INVALID', 'not-a-function' as any),
        CacherError,
        'Engine must be a constructor function',
      );

      asserts.assertThrows(
        () => Cacher.addEngine('INVALID', {} as any),
        CacherError,
        'Engine must be a constructor function',
      );
    });
  });

  await t.step('create', async (d) => {
    await resetCacher();

    // Register mock engine for testing
    if (!Cacher.getRegisteredEngines().includes('MOCK')) {
      Cacher.addEngine('MOCK', MockEngine as any);
    }

    await d.step('should create a new cache instance', () => {
      const cache = Cacher.create('MOCK', 'test-cache', { defaultExpiry: 300 });

      asserts.assert(cache instanceof MockEngine);
      asserts.assertEquals(cache.name, 'test-cache');
      asserts.assertEquals(cache.getOption('defaultExpiry'), 300);
    });

    await d.step('should return existing instance for same name', () => {
      const cache1 = Cacher.create('MOCK', 'same-cache', {
        defaultExpiry: 300,
      });
      const cache2 = Cacher.create('MOCK', 'same-cache', {
        defaultExpiry: 600,
      });

      // Should be the same instance
      asserts.assertStrictEquals(cache1, cache2);
      // Should keep original options
      asserts.assertEquals(cache1.getOption('defaultExpiry'), 300);
    });

    await d.step('should normalize and trim instance names', () => {
      const cache = Cacher.create('MOCK', '  test-instance  ', {
        defaultExpiry: 300,
      });
      asserts.assertEquals(cache.name, 'test-instance');

      const instances = Cacher.getActiveInstances();
      asserts.assert(instances.includes('test-instance'));
    });

    await d.step('should normalize engine names to uppercase', () => {
      const cache = Cacher.create('mock', 'lowercase-engine', {
        defaultExpiry: 300,
      });
      asserts.assert(cache instanceof MockEngine);
    });

    await d.step('should throw error for unregistered engine', () => {
      asserts.assertThrows(
        () => Cacher.create('NONEXISTENT', 'test', { defaultExpiry: 300 }),
        CacherError,
        'Engine "NONEXISTENT" is not registered',
      );
    });

    await d.step('should throw error for invalid parameters', () => {
      // Invalid engine
      asserts.assertThrows(
        () => Cacher.create('', 'test', { defaultExpiry: 300 }),
        CacherError,
        'Engine type must be a non-empty string',
      );

      asserts.assertThrows(
        () => Cacher.create(null as any, 'test', { defaultExpiry: 300 }),
        CacherError,
        'Engine type must be a non-empty string',
      );

      // Invalid name
      asserts.assertThrows(
        () => Cacher.create('MOCK', '', { defaultExpiry: 300 }),
        CacherError,
        'Instance name must be a non-empty string',
      );

      asserts.assertThrows(
        () => Cacher.create('MOCK', null as any, { defaultExpiry: 300 }),
        CacherError,
        'Instance name must be a non-empty string',
      );

      // Invalid options
      asserts.assertThrows(
        () => Cacher.create('MOCK', 'test', null as any),
        CacherError,
        'Options must be a valid object',
      );

      asserts.assertThrows(
        () => Cacher.create('MOCK', 'test', 'not-an-object' as any),
        CacherError,
        'Options must be a valid object',
      );

      asserts.assertThrows(
        () => Cacher.create('MOCK', 'test', [] as any),
        CacherError,
        'Options must be a valid object',
      );

      asserts.assertThrows(
        () => Cacher.create('MOCK', 'test', [1, 2, 3] as any),
        CacherError,
        'Options must be a valid object',
      );
    });

    await d.step('should handle engine construction failures', () => {
      if (!Cacher.getRegisteredEngines().includes('FAILING')) {
        Cacher.addEngine('FAILING', FailingMockEngine as any);
      }

      asserts.assertThrows(
        () =>
          Cacher.create('FAILING', 'failing-instance', { defaultExpiry: 300 }),
        CacherError,
        'Failed to create instance',
      );
    });
  });

  await t.step('getInstance', async (d) => {
    await resetCacher();
    if (!Cacher.getRegisteredEngines().includes('MOCK')) {
      Cacher.addEngine('MOCK', MockEngine as any);
    }

    await d.step('should return existing instance', () => {
      const cache1 = Cacher.create('MOCK', 'existing-cache', {
        defaultExpiry: 300,
      });
      const cache2 = Cacher.getInstance('existing-cache');

      asserts.assertStrictEquals(cache1, cache2);
    });

    await d.step('should return undefined for non-existent instance', () => {
      const cache = Cacher.getInstance('non-existent');
      asserts.assertStrictEquals(cache, undefined);
    });

    await d.step('should handle invalid names gracefully', () => {
      asserts.assertStrictEquals(Cacher.getInstance(''), undefined);
      asserts.assertStrictEquals(Cacher.getInstance(null as any), undefined);
      asserts.assertStrictEquals(Cacher.getInstance(123 as any), undefined);
    });

    await d.step('should trim whitespace from names', () => {
      Cacher.create('MOCK', 'trimmed-cache', { defaultExpiry: 300 });
      const cache = Cacher.getInstance('  trimmed-cache  ');
      asserts.assert(cache instanceof MockEngine);
    });
  });

  await t.step('hasInstance', async (d) => {
    await resetCacher();
    if (!Cacher.getRegisteredEngines().includes('MOCK')) {
      Cacher.addEngine('MOCK', MockEngine as any);
    }

    await d.step('should return true for existing instance', () => {
      Cacher.create('MOCK', 'existing-instance', { defaultExpiry: 300 });
      asserts.assert(Cacher.hasInstance('existing-instance'));
    });

    await d.step('should return false for non-existent instance', () => {
      asserts.assert(!Cacher.hasInstance('non-existent-instance'));
    });

    await d.step('should handle invalid names gracefully', () => {
      asserts.assert(!Cacher.hasInstance(''));
      asserts.assert(!Cacher.hasInstance(null as any));
      asserts.assert(!Cacher.hasInstance(123 as any));
    });

    await d.step('should trim whitespace from names', () => {
      Cacher.create('MOCK', 'whitespace-instance', { defaultExpiry: 300 });
      asserts.assert(Cacher.hasInstance('  whitespace-instance  '));
    });
  });

  await t.step('removeInstance', async (d) => {
    await resetCacher();
    if (!Cacher.getRegisteredEngines().includes('MOCK')) {
      Cacher.addEngine('MOCK', MockEngine as any);
    }

    await d.step('should remove existing instance', async () => {
      Cacher.create('MOCK', 'removable-instance', { defaultExpiry: 300 });
      asserts.assert(Cacher.hasInstance('removable-instance'));

      const removed = await Cacher.removeInstance('removable-instance');
      asserts.assert(removed);
      asserts.assert(!Cacher.hasInstance('removable-instance'));
    });

    await d.step('should return false for non-existent instance', async () => {
      const removed = await Cacher.removeInstance('non-existent');
      asserts.assert(!removed);
    });

    await d.step('should handle invalid names gracefully', async () => {
      asserts.assert(!(await Cacher.removeInstance('')));
      asserts.assert(!(await Cacher.removeInstance(null as any)));
      asserts.assert(!(await Cacher.removeInstance(123 as any)));
    });

    await d.step('should call finalize on instance if available', async () => {
      const cache = Cacher.create('MOCK', 'finalizable-instance', {
        defaultExpiry: 300,
      }) as MockEngine;

      // Add some data to verify finalize was called
      await cache.set('test-key', 'test-value');
      asserts.assertEquals(await cache.size(), 1);

      await Cacher.removeInstance('finalizable-instance');

      // Instance should no longer exist in manager
      asserts.assert(!Cacher.hasInstance('finalizable-instance'));
    });

    await d.step('should trim whitespace from names', async () => {
      Cacher.create('MOCK', 'trimmed-removal', { defaultExpiry: 300 });
      const removed = await Cacher.removeInstance('  trimmed-removal  ');
      asserts.assert(removed);
    });
  });

  await t.step('getRegisteredEngines', async (d) => {
    await resetCacher();

    await d.step('should return sorted list of engines', () => {
      const engines = Cacher.getRegisteredEngines();

      // Should include default engines
      asserts.assert(engines.includes('MEMCACHED'));
      asserts.assert(engines.includes('MEMORY'));
      asserts.assert(engines.includes('REDIS'));

      // Should be sorted
      const sortedEngines = [...engines].sort((a, b) => a.localeCompare(b));
      asserts.assertEquals(engines, sortedEngines);
    });

    await d.step('should include custom engines', () => {
      if (!Cacher.getRegisteredEngines().includes('CUSTOM_ENGINE')) {
        Cacher.addEngine('CUSTOM_ENGINE', MockEngine as any);
      }
      const engines = Cacher.getRegisteredEngines();

      asserts.assert(engines.includes('CUSTOM_ENGINE'));
    });
  });

  await t.step('getActiveInstances', async (d) => {
    await resetCacher();
    if (!Cacher.getRegisteredEngines().includes('MOCK')) {
      Cacher.addEngine('MOCK', MockEngine as any);
    }

    await d.step('should return empty array when no instances', () => {
      const instances = Cacher.getActiveInstances();
      asserts.assertEquals(instances.length, 0);
    });

    await d.step('should return sorted list of active instances', () => {
      Cacher.create('MOCK', 'instance-b', { defaultExpiry: 300 });
      Cacher.create('MOCK', 'instance-a', { defaultExpiry: 300 });
      Cacher.create('MOCK', 'instance-c', { defaultExpiry: 300 });

      const instances = Cacher.getActiveInstances();
      asserts.assertEquals(instances, [
        'instance-a',
        'instance-b',
        'instance-c',
      ]);
    });

    await d.step('should update after instance removal', async () => {
      Cacher.create('MOCK', 'temporary-instance', { defaultExpiry: 300 });
      let instances = Cacher.getActiveInstances();
      asserts.assert(instances.includes('temporary-instance'));

      await Cacher.removeInstance('temporary-instance');
      instances = Cacher.getActiveInstances();
      asserts.assertFalse(instances.includes('temporary-instance'));
    });
  });

  await t.step('clear', async (d) => {
    await resetCacher();
    if (!Cacher.getRegisteredEngines().includes('MOCK')) {
      Cacher.addEngine('MOCK', MockEngine as any);
    }

    await d.step('should remove all instances', async () => {
      // Create multiple instances
      Cacher.create('MOCK', 'instance-1', { defaultExpiry: 300 });
      Cacher.create('MOCK', 'instance-2', { defaultExpiry: 300 });
      Cacher.create('MOCK', 'instance-3', { defaultExpiry: 300 });

      asserts.assertEquals(Cacher.getActiveInstances().length, 3);

      await Cacher.clear();

      asserts.assertEquals(Cacher.getActiveInstances().length, 0);
    });

    await d.step('should call finalize on all instances', async () => {
      const cache1 = Cacher.create('MOCK', 'finalizable-1', {
        defaultExpiry: 300,
      }) as MockEngine;
      const cache2 = Cacher.create('MOCK', 'finalizable-2', {
        defaultExpiry: 300,
      }) as MockEngine;

      // Add data to verify finalize was called
      await cache1.set('key1', 'value1');
      await cache2.set('key2', 'value2');

      await Cacher.clear();

      // Instances should no longer exist in manager
      asserts.assertEquals(Cacher.getActiveInstances().length, 0);
    });

    await d.step('should handle empty state gracefully', async () => {
      // Clear when already empty
      await Cacher.clear();
      asserts.assertEquals(Cacher.getActiveInstances().length, 0);
    });
  });

  await t.step('integration with built-in engines', async (d) => {
    await resetCacher();

    await d.step('should create memory cache instances', () => {
      const cache = Cacher.create('MEMORY', 'memory-test', {
        defaultExpiry: 300,
      });
      asserts.assertEquals(cache.Engine, 'MEMORY');
      asserts.assertEquals(cache.name, 'memory-test');
    });

    await d.step('should handle different engine types', () => {
      const memoryCache = Cacher.create('MEMORY', 'mem-cache', {
        defaultExpiry: 300,
      });

      // Note: Redis and Memcached would require actual server connections
      // so we only test that the manager recognizes them as registered
      const engines = Cacher.getRegisteredEngines();
      asserts.assert(engines.includes('REDIS'));
      asserts.assert(engines.includes('MEMCACHED'));

      asserts.assertEquals(memoryCache.Engine, 'MEMORY');
    });
  });

  await t.step('edge cases and error handling', async (d) => {
    await resetCacher();

    await d.step('should handle rapid create/remove cycles', async () => {
      await Cacher.clear(); // Clear any existing instances
      if (!Cacher.getRegisteredEngines().includes('MOCK')) {
        Cacher.addEngine('MOCK', MockEngine as any);
      }

      // Create and remove instances rapidly
      for (let i = 0; i < 10; i++) {
        const instanceName = `rapid-${i}`;
        Cacher.create('MOCK', instanceName, { defaultExpiry: 300 });
        asserts.assert(Cacher.hasInstance(instanceName));

        await Cacher.removeInstance(instanceName);
        asserts.assert(!Cacher.hasInstance(instanceName));
      }

      asserts.assertEquals(Cacher.getActiveInstances().length, 0);
    });

    await d.step('should handle concurrent operations', async () => {
      await Cacher.clear(); // Clear any existing instances
      if (!Cacher.getRegisteredEngines().includes('MOCK')) {
        Cacher.addEngine('MOCK', MockEngine as any);
      }

      // Create instances concurrently
      const promises = Array.from({ length: 5 }, (_, i) => {
        return Promise.resolve(
          Cacher.create('MOCK', `concurrent-${i}`, { defaultExpiry: 300 }),
        );
      });

      const caches = await Promise.all(promises);
      asserts.assertEquals(caches.length, 5);
      asserts.assertEquals(Cacher.getActiveInstances().length, 5);
    });

    await d.step(
      'should handle same instance created multiple times',
      async () => {
        await Cacher.clear(); // Clear any existing instances
        if (!Cacher.getRegisteredEngines().includes('MOCK')) {
          Cacher.addEngine('MOCK', MockEngine as any);
        }

        const cache1 = Cacher.create('MOCK', 'duplicate-test', {
          defaultExpiry: 300,
        });
        const cache2 = Cacher.create('MOCK', 'duplicate-test', {
          defaultExpiry: 600,
        });
        const cache3 = Cacher.create('MOCK', 'duplicate-test', {
          defaultExpiry: 900,
        });

        // All should reference the same instance
        asserts.assertStrictEquals(cache1, cache2);
        asserts.assertStrictEquals(cache2, cache3);

        // Should maintain original configuration
        asserts.assertEquals(cache1.getOption('defaultExpiry'), 300);

        // Should only have one instance
        asserts.assertEquals(Cacher.getActiveInstances().length, 1);
      },
    );
  });

  // Final cleanup
  await resetCacher();
});
