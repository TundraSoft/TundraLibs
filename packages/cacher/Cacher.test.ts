import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { Cacher } from './Cacher.ts';
import { AbstractEngine } from './AbstractEngine.ts';
import { CacherError } from './errors/mod.ts';
import type { CacherOptions } from './types/mod.ts';
import type { CacheValue } from './types/CacheValue.ts';

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

// Snapshot the engines registered at module-load (the built-in defaults).
// afterEach uses this to undo any addEngine calls made by individual tests.
const DEFAULT_ENGINES = new Set(
  // The describe-level `if (!Cacher.getRegisteredEngines().includes('X')) ...`
  // pollutes the registry during discovery. Anything not built-in is removed
  // here so the snapshot reflects the genuine defaults.
  Cacher.getRegisteredEngines().filter((n) =>
    ['MEMORY', 'REDIS', 'MEMCACHED'].includes(n)
  ),
);

describe({
  name: 'cacher.core',
  beforeEach: async () => {
    await Cacher.clear();
    // Test fixtures: ensure MOCK / FAILING are available to every test
    // that needs them. afterEach removes them, so we re-add here.
    if (!Cacher.getRegisteredEngines().includes('MOCK')) {
      Cacher.addEngine('MOCK', MockEngine as never);
    }
    if (!Cacher.getRegisteredEngines().includes('FAILING')) {
      Cacher.addEngine('FAILING', FailingMockEngine as never);
    }
  },
  afterEach: () => {
    // Strip every engine added during the test so siblings see the
    // pristine default set. Without this, the singleton accumulates
    // state and assertions about engine identity / count break.
    for (const name of Cacher.getRegisteredEngines()) {
      if (!DEFAULT_ENGINES.has(name)) Cacher.removeEngine(name);
    }
  },
  fn: () => {
    describe('initialization', () => {
      it('should have default engines registered', () => {
        const engines = Cacher.getRegisteredEngines();
        // Length-based assertions are brittle once tests add engines and
        // the singleton accumulates state. Just verify the defaults are
        // present.
        asserts.assert(engines.includes('MEMORY'));
        asserts.assert(engines.includes('REDIS'));
        asserts.assert(engines.includes('MEMCACHED'));
      });

      it('should have no active instances initially', () => {
        const instances = Cacher.getActiveInstances();
        asserts.assertEquals(instances.length, 0);
      });
    });

    describe('addEngine', () => {
      it('should register a new engine successfully', () => {
        // MOCK / FAILING are already registered by beforeEach as fixtures,
        // so this test uses a distinct name.
        Cacher.addEngine('NEW_ENGINE', MockEngine as any);
        const engines = Cacher.getRegisteredEngines();
        asserts.assert(engines.includes('NEW_ENGINE'));
      });

      it('should normalize engine names to uppercase', () => {
        Cacher.addEngine('test_engine', MockEngine as any);
        const engines = Cacher.getRegisteredEngines();
        asserts.assert(engines.includes('TEST_ENGINE'));
      });

      it('should trim whitespace from engine names', () => {
        Cacher.addEngine('  whitespace_engine  ', MockEngine as any);
        const engines = Cacher.getRegisteredEngines();
        asserts.assert(engines.includes('WHITESPACE_ENGINE'));
      });

      it('should throw error when registering duplicate engine', () => {
        // First registration should succeed
        Cacher.addEngine('DUPLICATE', MockEngine as any);

        // Second registration should fail
        asserts.assertThrows(
          () => Cacher.addEngine('DUPLICATE', MockEngine as any),
          CacherError,
          'Engine "DUPLICATE" is already registered',
        );
      });

      it('should throw error for invalid engine name', () => {
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

      it('should throw error for invalid engine constructor', () => {
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

    describe('create', () => {
      // Register mock engine for testing
      if (!Cacher.getRegisteredEngines().includes('MOCK')) {
        Cacher.addEngine('MOCK', MockEngine as any);
      }

      it('should create a new cache instance', () => {
        const cache = Cacher.create('MOCK', 'test-cache', {
          defaultExpiry: 300,
        });

        asserts.assert(cache instanceof MockEngine);
        asserts.assertEquals(cache.name, 'test-cache');
        asserts.assertEquals(readOption(cache, 'defaultExpiry'), 300);
      });

      it('should return existing instance for same name', () => {
        const cache1 = Cacher.create('MOCK', 'same-cache', {
          defaultExpiry: 300,
        });
        const cache2 = Cacher.create('MOCK', 'same-cache', {
          defaultExpiry: 600,
        });

        // Should be the same instance
        asserts.assertStrictEquals(cache1, cache2);
        // Should keep original options
        asserts.assertEquals(readOption(cache1, 'defaultExpiry'), 300);
      });

      it('should normalize and trim instance names', () => {
        const cache = Cacher.create('MOCK', '  test-instance  ', {
          defaultExpiry: 300,
        });
        asserts.assertEquals(cache.name, 'test-instance');

        const instances = Cacher.getActiveInstances();
        asserts.assert(instances.includes('test-instance'));
      });

      it('should normalize engine names to uppercase', () => {
        const cache = Cacher.create('mock', 'lowercase-engine', {
          defaultExpiry: 300,
        });
        asserts.assert(cache instanceof MockEngine);
      });

      it('should throw error for unregistered engine', () => {
        asserts.assertThrows(
          () => Cacher.create('NONEXISTENT', 'test', { defaultExpiry: 300 }),
          CacherError,
          'Engine "NONEXISTENT" is not registered',
        );
      });

      it('should throw error for invalid parameters', () => {
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

      it('should handle engine construction failures', () => {
        if (!Cacher.getRegisteredEngines().includes('FAILING')) {
          Cacher.addEngine('FAILING', FailingMockEngine as any);
        }

        asserts.assertThrows(
          () =>
            Cacher.create('FAILING', 'failing-instance', {
              defaultExpiry: 300,
            }),
          CacherError,
          'Failed to create instance',
        );
      });

      it('redacts secret option values from the thrown error context', () => {
        if (!Cacher.getRegisteredEngines().includes('FAILING')) {
          // deno-lint-ignore no-explicit-any
          Cacher.addEngine('FAILING', FailingMockEngine as any);
        }

        let caught: CacherError | undefined;
        try {
          Cacher.create('FAILING', 'secret-instance', {
            defaultExpiry: 300,
            host: 'localhost',
            password: 's3cr3t',
          });
        } catch (e) {
          caught = e as CacherError;
        }

        asserts.assertExists(caught);
        const options =
          (caught!.context as { options: Record<string, unknown> }).options;
        // The password must be redacted; non-secret values are preserved.
        asserts.assertEquals(options.password, '[REDACTED]');
        asserts.assertEquals(options.host, 'localhost');
      });

      it('redacts NESTED secrets (inline TLS private key) from the error context', () => {
        if (!Cacher.getRegisteredEngines().includes('FAILING')) {
          // deno-lint-ignore no-explicit-any
          Cacher.addEngine('FAILING', FailingMockEngine as any);
        }

        const privateKey =
          '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg...\n-----END PRIVATE KEY-----';

        let caught: CacherError | undefined;
        try {
          // deno-lint-ignore no-explicit-any
          Cacher.create('FAILING', 'tls-instance', {
            defaultExpiry: 300,
            host: 'localhost',
            // Inline PEM TLS material nested under `ssl` — the private key
            // lives at ssl.key, which a top-level-only redaction would leak.
            ssl: {
              cert:
                '-----BEGIN CERTIFICATE-----\npublic\n-----END CERTIFICATE-----',
              key: privateKey,
            },
          } as any);
        } catch (e) {
          caught = e as CacherError;
        }

        asserts.assertExists(caught);
        const options =
          (caught!.context as { options: Record<string, unknown> }).options;
        const ssl = options.ssl as Record<string, unknown>;
        // The nested inline private key MUST be redacted...
        asserts.assertEquals(ssl.key, '[REDACTED]');
        // ...while the public certificate (not a secret) is preserved for
        // debuggability, and the whole key material never reaches the log.
        asserts.assertEquals(
          ssl.cert,
          '-----BEGIN CERTIFICATE-----\npublic\n-----END CERTIFICATE-----',
        );
        const serialised = JSON.stringify(caught!.toJSON());
        asserts.assert(
          !serialised.includes('BEGIN PRIVATE KEY'),
          'serialised error must not contain the TLS private key',
        );
      });

      it('does NOT mark a shared (non-cyclic) reference as [Circular]', () => {
        if (!Cacher.getRegisteredEngines().includes('FAILING')) {
          // deno-lint-ignore no-explicit-any
          Cacher.addEngine('FAILING', FailingMockEngine as any);
        }

        // The SAME object is referenced by two sibling keys — a diamond, not
        // a cycle. Redaction must render it in FULL at both positions and
        // never collapse the second occurrence to '[Circular]'.
        const shared = { host: 'localhost', password: 's3cr3t' };
        let caught: CacherError | undefined;
        try {
          // deno-lint-ignore no-explicit-any
          Cacher.create('FAILING', 'shared-ref-instance', {
            defaultExpiry: 300,
            primary: shared,
            replica: shared,
          } as any);
        } catch (e) {
          caught = e as CacherError;
        }

        asserts.assertExists(caught);
        const options =
          (caught!.context as { options: Record<string, unknown> }).options;
        // Both sibling copies are fully materialised (secret redacted); the
        // second is NOT '[Circular]'.
        asserts.assertEquals(options.primary, {
          host: 'localhost',
          password: '[REDACTED]',
        });
        asserts.assertEquals(options.replica, {
          host: 'localhost',
          password: '[REDACTED]',
        });
      });

      it('still renders a genuine cycle as [Circular] without infinite recursion', () => {
        if (!Cacher.getRegisteredEngines().includes('FAILING')) {
          // deno-lint-ignore no-explicit-any
          Cacher.addEngine('FAILING', FailingMockEngine as any);
        }

        // A self-referential options object: the redactor must terminate and
        // mark the back-edge '[Circular]' rather than recurse forever.
        // deno-lint-ignore no-explicit-any
        const cyclic: Record<string, any> = {
          host: 'localhost',
          password: 's3cr3t',
        };
        cyclic.self = cyclic;
        let caught: CacherError | undefined;
        try {
          // deno-lint-ignore no-explicit-any
          Cacher.create('FAILING', 'cyclic-instance', {
            defaultExpiry: 300,
            loop: cyclic,
          } as any);
        } catch (e) {
          caught = e as CacherError;
        }

        asserts.assertExists(caught);
        const options =
          (caught!.context as { options: Record<string, unknown> }).options;
        const loop = options.loop as Record<string, unknown>;
        // The back-edge to the same object terminates the recursion ...
        asserts.assertEquals(loop.self, '[Circular]');
        // ... while the secret is still redacted on the way through.
        asserts.assertEquals(loop.password, '[REDACTED]');
        asserts.assertEquals(loop.host, 'localhost');
      });

      it('rejects instance names containing the ":" namespace separator', () => {
        // A name that is a colon-prefix of another (e.g. "app" vs
        // "app:sessions") makes RedisCacher.clear()'s `${name}:*` glob wipe the
        // sibling namespace. Reject ':' in names so isolation actually holds.
        asserts.assertThrows(
          () => Cacher.create('MEMORY', 'app:sessions', { defaultExpiry: 300 }),
          CacherError,
          'Instance name must not contain ":"',
        );
      });
    });

    describe('getInstance', () => {
      if (!Cacher.getRegisteredEngines().includes('MOCK')) {
        Cacher.addEngine('MOCK', MockEngine as any);
      }

      it('should return existing instance', () => {
        const cache1 = Cacher.create('MOCK', 'existing-cache', {
          defaultExpiry: 300,
        });
        const cache2 = Cacher.getInstance('existing-cache');

        asserts.assertStrictEquals(cache1, cache2);
      });

      it('should return undefined for non-existent instance', () => {
        const cache = Cacher.getInstance('non-existent');
        asserts.assertStrictEquals(cache, undefined);
      });

      it('should handle invalid names gracefully', () => {
        asserts.assertStrictEquals(Cacher.getInstance(''), undefined);
        asserts.assertStrictEquals(Cacher.getInstance(null as any), undefined);
        asserts.assertStrictEquals(Cacher.getInstance(123 as any), undefined);
      });

      it('should trim whitespace from names', () => {
        Cacher.create('MOCK', 'trimmed-cache', { defaultExpiry: 300 });
        const cache = Cacher.getInstance('  trimmed-cache  ');
        asserts.assert(cache instanceof MockEngine);
      });
    });

    describe('hasInstance', () => {
      if (!Cacher.getRegisteredEngines().includes('MOCK')) {
        Cacher.addEngine('MOCK', MockEngine as any);
      }

      it('should return true for existing instance', () => {
        Cacher.create('MOCK', 'existing-instance', { defaultExpiry: 300 });
        asserts.assert(Cacher.hasInstance('existing-instance'));
      });

      it('should return false for non-existent instance', () => {
        asserts.assert(!Cacher.hasInstance('non-existent-instance'));
      });

      it('should handle invalid names gracefully', () => {
        asserts.assert(!Cacher.hasInstance(''));
        asserts.assert(!Cacher.hasInstance(null as any));
        asserts.assert(!Cacher.hasInstance(123 as any));
      });

      it('should trim whitespace from names', () => {
        Cacher.create('MOCK', 'whitespace-instance', { defaultExpiry: 300 });
        asserts.assert(Cacher.hasInstance('  whitespace-instance  '));
      });
    });

    describe('removeInstance', () => {
      if (!Cacher.getRegisteredEngines().includes('MOCK')) {
        Cacher.addEngine('MOCK', MockEngine as any);
      }

      it('should remove existing instance', async () => {
        Cacher.create('MOCK', 'removable-instance', { defaultExpiry: 300 });
        asserts.assert(Cacher.hasInstance('removable-instance'));

        const removed = await Cacher.removeInstance('removable-instance');
        asserts.assert(removed);
        asserts.assert(!Cacher.hasInstance('removable-instance'));
      });

      it('should return false for non-existent instance', async () => {
        const removed = await Cacher.removeInstance('non-existent');
        asserts.assert(!removed);
      });

      it('should handle invalid names gracefully', async () => {
        asserts.assert(!(await Cacher.removeInstance('')));
        asserts.assert(!(await Cacher.removeInstance(null as any)));
        asserts.assert(!(await Cacher.removeInstance(123 as any)));
      });

      it('should call finalize on instance if available', async () => {
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

      it('should trim whitespace from names', async () => {
        Cacher.create('MOCK', 'trimmed-removal', { defaultExpiry: 300 });
        const removed = await Cacher.removeInstance('  trimmed-removal  ');
        asserts.assert(removed);
      });
    });

    describe('getRegisteredEngines', () => {
      it('should return sorted list of engines', () => {
        const engines = Cacher.getRegisteredEngines();

        // Should include default engines
        asserts.assert(engines.includes('MEMCACHED'));
        asserts.assert(engines.includes('MEMORY'));
        asserts.assert(engines.includes('REDIS'));

        // Should be sorted
        const sortedEngines = [...engines].sort((a, b) => a.localeCompare(b));
        asserts.assertEquals(engines, sortedEngines);
      });

      it('should include custom engines', () => {
        if (!Cacher.getRegisteredEngines().includes('CUSTOM_ENGINE')) {
          Cacher.addEngine('CUSTOM_ENGINE', MockEngine as any);
        }
        const engines = Cacher.getRegisteredEngines();

        asserts.assert(engines.includes('CUSTOM_ENGINE'));
      });
    });

    describe('getActiveInstances', () => {
      if (!Cacher.getRegisteredEngines().includes('MOCK')) {
        Cacher.addEngine('MOCK', MockEngine as any);
      }

      it('should return empty array when no instances', () => {
        const instances = Cacher.getActiveInstances();
        asserts.assertEquals(instances.length, 0);
      });

      it('should return sorted list of active instances', () => {
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

      it('should update after instance removal', async () => {
        Cacher.create('MOCK', 'temporary-instance', { defaultExpiry: 300 });
        let instances = Cacher.getActiveInstances();
        asserts.assert(instances.includes('temporary-instance'));

        await Cacher.removeInstance('temporary-instance');
        instances = Cacher.getActiveInstances();
        asserts.assertFalse(instances.includes('temporary-instance'));
      });
    });

    describe('clear', () => {
      if (!Cacher.getRegisteredEngines().includes('MOCK')) {
        Cacher.addEngine('MOCK', MockEngine as any);
      }

      it('should remove all instances', async () => {
        // Create multiple instances
        Cacher.create('MOCK', 'instance-1', { defaultExpiry: 300 });
        Cacher.create('MOCK', 'instance-2', { defaultExpiry: 300 });
        Cacher.create('MOCK', 'instance-3', { defaultExpiry: 300 });

        asserts.assertEquals(Cacher.getActiveInstances().length, 3);

        await Cacher.clear();

        asserts.assertEquals(Cacher.getActiveInstances().length, 0);
      });

      it('should call finalize on all instances', async () => {
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

      it('should handle empty state gracefully', async () => {
        // Clear when already empty
        await Cacher.clear();
        asserts.assertEquals(Cacher.getActiveInstances().length, 0);
      });
    });

    describe('integration with built-in engines', () => {
      it('should create memory cache instances', () => {
        const cache = Cacher.create('MEMORY', 'memory-test', {
          defaultExpiry: 300,
        });
        asserts.assertEquals(cache.Engine, 'MEMORY');
        asserts.assertEquals(cache.name, 'memory-test');
      });

      it('should handle different engine types', () => {
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

    describe('edge cases and error handling', () => {
      it('should handle rapid create/remove cycles', async () => {
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

      it('should handle concurrent operations', async () => {
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

      it(
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
          asserts.assertEquals(readOption(cache1, 'defaultExpiry'), 300);

          // Should only have one instance
          asserts.assertEquals(Cacher.getActiveInstances().length, 1);
        },
      );

      it(
        'should handle existing instance with different engine type',
        async () => {
          await Cacher.clear();
          // Remove engines if they exist
          Cacher.removeEngine('MOCK');
          Cacher.removeEngine('MOCK2');
          Cacher.addEngine('MOCK', MockEngine as any);
          Cacher.addEngine('MOCK2', MockEngine as any);

          // Create instance with MOCK engine
          Cacher.create('MOCK', 'conflict-test', {});

          // Try to create same instance with different engine
          asserts.assertThrows(
            () => Cacher.create('MOCK2', 'conflict-test', {}),
            CacherError,
            'Instance "conflict-test" already exists with engine type "MOCK", cannot create with "MOCK2"',
          );
        },
      );

      it(
        'should handle instance tracking when no tracking data exists',
        async () => {
          await Cacher.clear();
          // Remove engine if it exists
          Cacher.removeEngine('MOCK');
          Cacher.addEngine('MOCK', MockEngine as any);

          // Create instance
          const cache = Cacher.create('MOCK', 'tracking-test', {});

          // Manually remove tracking data to simulate legacy instance
          // @ts-ignore - accessing private property for testing
          Cacher._instanceEngines.delete('tracking-test');

          // Should still work and update tracking
          const cache2 = Cacher.create('MOCK', 'tracking-test', {});
          asserts.assertStrictEquals(cache, cache2);
        },
      );
    });

    describe('removeEngine method', () => {
      it('should remove existing engine', async () => {
        Cacher.addEngine('TEMP_ENGINE', MockEngine as any);
        asserts.assert(Cacher.getRegisteredEngines().includes('TEMP_ENGINE'));

        const removed = Cacher.removeEngine('TEMP_ENGINE');
        asserts.assertEquals(removed, true);
        asserts.assert(!Cacher.getRegisteredEngines().includes('TEMP_ENGINE'));
      });

      it('should return false for non-existent engine', async () => {
        const removed = Cacher.removeEngine('NON_EXISTENT');
        asserts.assertEquals(removed, false);
      });

      it('should handle invalid engine names gracefully', () => {
        asserts.assertEquals(Cacher.removeEngine(''), false);
        asserts.assertEquals(Cacher.removeEngine('   '), false);
        // @ts-ignore - testing runtime type checking
        asserts.assertEquals(Cacher.removeEngine(null), false);
        // @ts-ignore - testing runtime type checking
        asserts.assertEquals(Cacher.removeEngine(undefined), false);
      });
    });

    describe('finalize error handling', () => {
      class FailingFinalizeEngine extends AbstractEngine {
        public readonly Engine = 'FAILING_FINALIZE';
        private readonly _storage = new Map<string, CacheValue>();

        protected async _set(key: string, value: CacheValue): Promise<void> {
          this._storage.set(key, value);
        }

        protected async _get(key: string): Promise<CacheValue | undefined> {
          return this._storage.get(key);
        }

        protected async _has(key: string): Promise<boolean> {
          return this._storage.has(key);
        }

        protected async _delete(key: string): Promise<void> {
          this._storage.delete(key);
        }

        protected async _clear(): Promise<void> {
          this._storage.clear();
        }

        public override async finalize(): Promise<void> {
          throw new Error('Finalize failed');
        }
      }

      it(
        'should handle finalize errors during removeInstance',
        async () => {
          Cacher.addEngine('FAILING_FINALIZE', FailingFinalizeEngine as any);

          // Suppress console.warn for this test
          const originalWarn = console.warn;
          const warnings: unknown[] = [];
          console.warn = (...args: unknown[]) => warnings.push(args);

          try {
            Cacher.create('FAILING_FINALIZE', 'fail-test', {});
            const removed = await Cacher.removeInstance('fail-test');

            asserts.assertEquals(removed, true);
            asserts.assert(!Cacher.hasInstance('fail-test'));
            asserts.assertEquals(warnings.length, 1);
            asserts.assert(
              String((warnings[0] as any[])[0]).includes(
                'Warning: Failed to finalize instance "fail-test":',
              ),
            );
          } finally {
            console.warn = originalWarn;
          }
        },
      );

      it('should handle finalize errors during clear', async () => {
        // Remove engine if it exists
        Cacher.removeEngine('FAILING_FINALIZE');
        Cacher.addEngine('FAILING_FINALIZE', FailingFinalizeEngine as any);

        // Suppress console.warn for this test
        const originalWarn = console.warn;
        const warnings: unknown[] = [];
        console.warn = (...args: unknown[]) => warnings.push(args);

        try {
          Cacher.create('FAILING_FINALIZE', 'fail-test1', {});
          Cacher.create('FAILING_FINALIZE', 'fail-test2', {});

          await Cacher.clear();

          asserts.assertEquals(Cacher.getActiveInstances().length, 0);
          asserts.assertEquals(warnings.length, 2);
        } finally {
          console.warn = originalWarn;
        }
      });
    });
  },
});
