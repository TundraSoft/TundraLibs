import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import type { MemcachedEngine } from '@tundralibs/drivers/memcached';
import { MemCacher, type MemCacherOptions } from './mod.ts';
import { CacherEngineError } from '../../errors/mod.ts';
import { envArgs } from '@tundralibs/utils';

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

const env = envArgs('./packages/cacher/engines/');

/** Resolve the configured Memcached port, falling back to the default. */
const memcachedPort = (): number | undefined =>
  env.has('MEMCACHED_PORT')
    ? Number.parseInt(env.get('MEMCACHED_PORT'))
    : undefined;

/**
 * Probe whether a live Memcached is configured and reachable. The whole
 * suite is gated on this so it runs in CI (where `MEMCACHED_HOST` points at
 * a running server) and skips cleanly in local/offline environments, matching
 * the drivers Memcached suite's gating pattern.
 */
async function isMemcachedAvailable(): Promise<boolean> {
  const host = env.get('MEMCACHED_HOST');
  if (host === undefined || host.trim() === '') {
    return false;
  }
  const probe = new MemCacher('memcached-probe', {
    host,
    port: memcachedPort(),
  });
  try {
    await probe.init();
    probe.finalize();
    return true;
  } catch {
    try {
      probe.finalize();
    } catch {
      // Ignore probe teardown errors.
    }
    return false;
  }
}

const memcachedAvailable = await isMemcachedAvailable();

let memcached: MemCacher;
describe({
  name: 'cacher.engines.memcached',
  ignore: !memcachedAvailable,
  beforeAll: () => {
  },
  beforeEach: async () => {
    memcached = new MemCacher('memcached-test', {
      host: env.get('MEMCACHED_HOST'),
      port: memcachedPort(),
      // maxBufferSize: (env.has('MEMCACHED_SIZE')) ? Number.parseInt(env.get('MEMCACHED_SIZE')) : undefined,
    });
  },
  afterEach: async () => {
    if (memcached) {
      try {
        await memcached.clear();
        memcached.finalize();
      } catch {
        // Ignore errors during teardown
      }
    }
  },
  fn: () => {
    describe('initialization', () => {
      it('should create an instance with default options', () => {
        const cacher = new MemCacher('memory-test', {
          host: 'localhost',
          port: 11211,
        });

        asserts.assert(cacher instanceof MemCacher);
        asserts.assertEquals(cacher.name, 'memory-test');
        asserts.assertEquals(cacher.Engine, 'MEMCACHED');
        asserts.assertEquals(readOption(cacher, 'defaultExpiry'), 300);
      });

      it('set port and maxBufferSize', () => {
        const cacher = new MemCacher('boo', {
          host: 'localhost',
          port: undefined,
          maxBufferSize: undefined,
        });

        asserts.assertEquals(readOption(cacher, 'port'), 11211);
        asserts.assertEquals(readOption(cacher, 'maxBufferSize'), 10);
      });

      it('Should throw on invalid config', () => {
        asserts.assertThrows(
          () => {
            const _ = new MemCacher('memory-test', {
              port: 11211,
            } as unknown as MemCacherOptions);
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

      it('should allow custom defaultExpiry', () => {
        const cacher = new MemCacher('memcached-test', {
          host: 'localhost',
          port: 11211,
          defaultExpiry: 600,
        });

        asserts.assertEquals(readOption(cacher, 'defaultExpiry'), 600);
      });

      it('should validate port range', () => {
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

      it(
        'should reuse existing connection on multiple init calls',
        async () => {
          const cacher = new MemCacher('memcached-test', {
            host: env.get('MEMCACHED_HOST') || 'localhost',
            port: Number.parseInt(env.get('MEMCACHED_PORT'), 0) || 11211,
          });

          try {
            await cacher.init();
            const client = (cacher as any)._client;

            // Call init again
            await cacher.init();

            // Client should be the same instance
            asserts.assertEquals((cacher as any)._client, client);
          } finally {
            cacher.finalize();
          }
        },
      );
    });

    describe('data operations', () => {
      it('should set and get string data', async () => {
        const key = 'test-string';
        const value = 'test-value';

        await memcached.set(key, value);
        const result = await memcached.get(key);

        asserts.assertEquals(result, value);
      });

      it('should set and get numeric data', async () => {
        const key = 'test-number';
        const value = 12345;

        await memcached.set(key, value);
        const result = await memcached.get<number>(key);

        asserts.assertEquals(result, value);
      });

      it('should set and get object data', async () => {
        const key = 'test-object';
        const value = { name: 'test', value: 42, nested: { value: 'nested' } };

        await memcached.set(key, value);
        const result = await memcached.get(key);

        asserts.assertEquals(result, value);
      });

      it('should set and get array data', async () => {
        const key = 'test-array';
        const value = [1, 2, 'three', { four: 4 }];

        await memcached.set(key, value);
        const result = await memcached.get(key);

        asserts.assertEquals(result, value);
      });

      it('should check if key exists', async () => {
        const key = 'test-exists';

        await memcached.set(key, 'test-value');
        const exists = await memcached.has(key);
        const notExists = await memcached.has('non-existent-key');

        asserts.assertEquals(exists, true);
        asserts.assertEquals(notExists, false);
      });

      it('should delete a key', async () => {
        const key = 'test-delete';

        await memcached.set(key, 'test-value');
        await memcached.delete(key);
        const exists = await memcached.has(key);

        asserts.assertEquals(exists, false);
      });

      it('should handle null values', async () => {
        const key = 'test-null';
        await memcached.set(key, null);
        const result = await memcached.get(key);

        asserts.assertEquals(result, null);
      });

      it('should handle empty strings', async () => {
        const key = 'test-empty';
        await memcached.set(key, '');
        const result = await memcached.get<string>(key);

        asserts.assertEquals(result, '');
      });

      it('should handle large objects', async () => {
        const key = 'test-large';
        const largeObj = {
          id: 'test',
          items: new Array(100).fill(0).map((_, i) => ({
            id: i,
            value: `value-${i}`,
          })),
          nested: {
            deep: {
              deeper: {
                deepest: 'value',
                array: new Array(50).fill('test'),
              },
            },
          },
        };

        await memcached.set(key, largeObj);
        const result = await memcached.get(key);

        asserts.assertEquals(result, largeObj);
      });
    });

    describe('special functionality', () => {
      it('should respect custom expiry time', async () => {
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

      it(
        'should extend expiry when window mode is enabled',
        async () => {
          const key = 'test-window-mode';
          const value = 'window-mode-value';

          // TIMING: memcached expiry has WHOLE-SECOND granularity — an item
          // set at wall time S with TTL n gets `exptime = floor(S) + n`, so
          // it is only guaranteed alive while age < n-1, and guaranteed dead
          // once age >= n. The margins below are chosen against those two
          // bounds, NOT against the nominal TTL (this test used TTL 3 with a
          // read at age 2.0s — a zero-margin race that flaked on loaded CI
          // runners). Total runtime must also stay under bun's 5s default
          // per-test timeout, which rules out simply using a bigger TTL.
          await memcached.set(key, value, { expiry: 4, window: true });

          // Verify it exists immediately
          let result = await memcached.get(key);
          asserts.assertEquals(result, value);

          // Read at age ~2.0s: guaranteed alive until age 3.0 → ~1s margin.
          // This get re-arms the sliding window (touch back to TTL 4).
          await new Promise((resolve) => setTimeout(resolve, 2000));
          result = await memcached.get(key);
          asserts.assertEquals(result, value);

          // Read at age ~4.3s. Two things must hold:
          // - the ORIGINAL item is guaranteed dead by age 4.0, so surviving
          //   here proves the window extension did it (setTimeout never
          //   fires early, so age >= 4.3 always);
          // - the EXTENDED item (re-armed at age >= 2.0) is guaranteed alive
          //   until at least age 5.0 → >= 0.7s margin, and a late first read
          //   pushes that bound later by the same amount, so sleep overshoot
          //   cannot flip this.
          await new Promise((resolve) => setTimeout(resolve, 2300));
          result = await memcached.get(key);
          asserts.assertEquals(result, value);
        },
      );
    });

    describe('error handling', () => {
      it('should throw on wrong connection info', async () => {
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

      it('should finalize properly', async () => {
        const cacher = new MemCacher('memcached-test', {
          host: env.get('MEMCACHED_HOST') || 'localhost',
          port: Number.parseInt(env.get('MEMCACHED_PORT'), 0) || 11211,
        });

        try {
          await cacher.init();

          // Verify client exists
          asserts.assert((cacher as any)._client !== undefined);

          // Finalize
          cacher.finalize();

          // Client should be undefined after finalize
          asserts.assertEquals((cacher as any)._client, undefined);

          // Calling finalize again should be safe
          cacher.finalize();
        } finally {
          // Ensure finalize is called even if assertions fail
          cacher.finalize();
        }
      });

      it(
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
            uninitializedCacher.finalize();
          }
        },
      );
    });

    describe('namespace-scoped clear (regression)', () => {
      it(
        'clear() must not wipe another namespace on the same server',
        async () => {
          // Two cachers, distinct namespaces, one shared Memcached server —
          // the exact scenario the old flush_all-based clear() corrupted.
          const sessions = new MemCacher('rr-clear-sessions', {
            host: env.get('MEMCACHED_HOST'),
            port: memcachedPort(),
          });
          const products = new MemCacher('rr-clear-products', {
            host: env.get('MEMCACHED_HOST'),
            port: memcachedPort(),
          });
          try {
            await sessions.set('token', 'abc123');
            await products.set('sku-1', { price: 9.99 });

            // Both are readable before the clear.
            asserts.assertEquals(await sessions.get('token'), 'abc123');
            asserts.assertEquals(await products.get('sku-1'), { price: 9.99 });

            // Clear ONLY the sessions namespace.
            await sessions.clear();

            // Its own keys are now unreachable...
            asserts.assertEquals(await sessions.get('token'), undefined);
            // ...but the products namespace must be untouched. The old
            // flush_all implementation wiped the whole server, so this
            // returned undefined (cross-namespace data loss).
            asserts.assertEquals(await products.get('sku-1'), { price: 9.99 });
          } finally {
            try {
              await products.clear();
            } catch {
              // Ignore teardown errors.
            }
            sessions.finalize();
            products.finalize();
          }
        },
      );

      it('clear() invalidates this namespace and stays usable', async () => {
        await memcached.set('k1', 'v1');
        await memcached.set('k2', 'v2');
        asserts.assertEquals(await memcached.has('k1'), true);

        await memcached.clear();

        asserts.assertEquals(await memcached.get('k1'), undefined);
        asserts.assertEquals(await memcached.get('k2'), undefined);
        asserts.assertEquals(await memcached.has('k1'), false);

        // A fresh write after clear() lands under the new version and reads
        // back normally — the namespace is not broken by the version bump.
        await memcached.set('k3', 'v3');
        asserts.assertEquals(await memcached.get('k3'), 'v3');
      });
    });

    describe('permanent entries (expiry 0) (regression)', () => {
      it(
        'expiry:0 persists past the old 1-second clamp',
        async () => {
          const key = 'permanent-explicit';
          await memcached.set(key, 'forever', { expiry: 0 });

          // The pre-fix driver clamped ttl=0 up to a 1s TTL (Math.max(1, ttl)),
          // so a "never expire" entry vanished after ~1s. The merged driver
          // fix maps ttl=0 to exptime 0 and MemCacher forwards expiry
          // unchanged. Wait well past the old clamp and assert it survives.
          await new Promise((resolve) => setTimeout(resolve, 1500));

          asserts.assertEquals(await memcached.get(key), 'forever');
        },
      );

      it(
        'defaultExpiry:0 persists past the old 1-second clamp',
        async () => {
          const permanent = new MemCacher('rr-permanent', {
            host: env.get('MEMCACHED_HOST'),
            port: memcachedPort(),
            defaultExpiry: 0,
          });
          try {
            await permanent.set('feature-flags', { beta: true });
            await new Promise((resolve) => setTimeout(resolve, 1500));
            asserts.assertEquals(
              await permanent.get('feature-flags'),
              { beta: true },
            );
          } finally {
            try {
              await permanent.clear();
            } catch {
              // Ignore teardown errors.
            }
            permanent.finalize();
          }
        },
      );
    });
  },
});

/**
 * Minimal in-memory stand-in for the `MemcachedEngine` client, backing every
 * cacher that shares it with one `Map` — so two namespaces can be exercised
 * against a single simulated server. It implements just the methods MemCacher
 * calls and mimics the semantics that matter here: `incr` rejects on a missing
 * key (like Memcached's `NOT_FOUND`), `add` only stores when absent, and
 * `flush` wipes the whole shared store (the old, server-wide behaviour).
 *
 * These tests run with no live Memcached, so the namespace-scoped clear and
 * expiry pass-through are verifiable on every runtime (and provide the
 * red-before / green-after signal the live suite can only give in CI).
 */
class FakeMemcached {
  /** Every `set` recorded as `{ key, ttl }`, to assert expiry pass-through. */
  public readonly setCalls: Array<{ key: string; ttl: number }> = [];
  /** Every `touch` recorded as `{ key, ttl }`, to assert window refresh. */
  public readonly touchCalls: Array<{ key: string; ttl: number }> = [];

  constructor(private readonly store: Map<string, string>) {}

  /**
   * Mirror the real driver's key guard (Engine.__validateKey): reject keys
   * with whitespace / control characters or exceeding 250 bytes. Without this
   * the fake would silently accept protocol-illegal keys and the cross-runtime
   * key-contract regression could not go RED.
   */
  private validateKey(key: string): void {
    // deno-lint-ignore no-control-regex
    if (key.length === 0 || /[\x00-\x20\x7f]/.test(key)) {
      throw new Error('must not contain whitespace or control characters');
    }
    if (new TextEncoder().encode(key).length > 250) {
      throw new Error('must not exceed 250 bytes');
    }
  }

  get(key: string): Promise<string | null> {
    this.validateKey(key);
    return Promise.resolve(this.store.has(key) ? this.store.get(key)! : null);
  }

  set(key: string, value: string, ttl = 30): Promise<boolean> {
    this.validateKey(key);
    this.setCalls.push({ key, ttl });
    this.store.set(key, value);
    return Promise.resolve(true);
  }

  touch(key: string, ttl = 30): Promise<boolean> {
    this.validateKey(key);
    this.touchCalls.push({ key, ttl });
    // TTL-only refresh: never rewrites the stored value (that's the whole
    // point — a concurrent writer's value must survive a window refresh).
    return Promise.resolve(this.store.has(key));
  }

  delete(key: string): Promise<boolean> {
    this.validateKey(key);
    return Promise.resolve(this.store.delete(key));
  }

  add(key: string, value: string, _ttl = 30): Promise<boolean> {
    this.validateKey(key);
    if (this.store.has(key)) return Promise.resolve(false);
    this.store.set(key, value);
    return Promise.resolve(true);
  }

  incr(key: string, delta = 1): Promise<number> {
    this.validateKey(key);
    if (!this.store.has(key)) {
      // Mirror Memcached's NOT_FOUND on a missing counter.
      return Promise.reject(new Error('NOT_FOUND'));
    }
    const next = Number.parseInt(this.store.get(key)!, 10) + delta;
    this.store.set(key, String(next));
    return Promise.resolve(next);
  }

  flush(): Promise<boolean> {
    this.store.clear();
    return Promise.resolve(true);
  }

  disconnect(): void {}
}

/** Build a MemCacher wired to a FakeMemcached over the shared `store`. */
const mockCacher = (
  name: string,
  store: Map<string, string>,
  options: Partial<MemCacherOptions> = {},
): { cacher: MemCacher; client: FakeMemcached } => {
  const cacher = new MemCacher(name, { host: 'localhost', ...options });
  const client = new FakeMemcached(store);
  // Inject the fake so init() is a no-op and no real socket is opened.
  // deno-lint-ignore no-explicit-any
  (cacher as any)._client = client;
  return { cacher, client };
};

describe('cacher.engines.memcached (offline, mocked client)', () => {
  describe('namespace-scoped clear (regression)', () => {
    it(
      'clear() on one namespace must not wipe another sharing the server',
      async () => {
        // One simulated server (shared store), two namespaces.
        const store = new Map<string, string>();
        const { cacher: sessions } = mockCacher('sessions', store);
        const { cacher: products } = mockCacher('products', store);

        await sessions.set('token', 'abc123');
        await products.set('sku-1', { price: 9.99 });

        asserts.assertEquals(await sessions.get('token'), 'abc123');
        asserts.assertEquals(await products.get('sku-1'), { price: 9.99 });

        // Clear ONLY the sessions namespace.
        await sessions.clear();

        // sessions is emptied...
        asserts.assertEquals(await sessions.get('token'), undefined);
        // ...but products survives. The old flush_all clear() wiped the
        // whole shared store, so this assertion was the bug's tripwire.
        asserts.assertEquals(await products.get('sku-1'), { price: 9.99 });
      },
    );

    it('clear() bumps the namespace version and stays usable', async () => {
      const store = new Map<string, string>();
      const { cacher } = mockCacher('app', store);

      await cacher.set('k1', 'v1');
      await cacher.set('k2', 'v2');
      asserts.assertEquals(await cacher.has('k1'), true);

      await cacher.clear();

      asserts.assertEquals(await cacher.get('k1'), undefined);
      asserts.assertEquals(await cacher.get('k2'), undefined);
      asserts.assertEquals(await cacher.has('k1'), false);

      // The per-namespace version counter was created and incremented; no
      // server-wide flush was needed.
      asserts.assertEquals(store.get('app:__ns_version__'), '2');

      // A fresh write lands under the new version and reads back.
      await cacher.set('k3', 'v3');
      asserts.assertEquals(await cacher.get('k3'), 'v3');
    });

    it('data keys are version-scoped, metadata keys are not', async () => {
      const store = new Map<string, string>();
      const { cacher } = mockCacher('ns', store);

      await cacher.set('user', { id: 1 });

      // The data key carries the version segment...
      asserts.assert(store.has('ns:v1:user'));
      // ...and there is no un-versioned data key that clear() could miss.
      asserts.assert(!store.has('ns:user'));
    });
  });

  describe('expiry pass-through (regression)', () => {
    it('forwards expiry:0 to the client unchanged (never clamped)', async () => {
      const store = new Map<string, string>();
      const { cacher, client } = mockCacher('cfg', store);

      await cacher.set('feature-flags', { beta: true }, { expiry: 0 });

      // MemCacher must hand the driver ttl=0 verbatim; the driver maps that
      // to Memcached exptime 0 ("never expire"). A clamp to 1 here would be
      // the resurrected bug.
      const dataSet = client.setCalls.find((c) =>
        c.key === 'cfg:v1:feature-flags'
      );
      asserts.assertExists(dataSet);
      asserts.assertEquals(dataSet!.ttl, 0);
    });

    it('forwards defaultExpiry:0 to the client unchanged', async () => {
      const store = new Map<string, string>();
      const { cacher, client } = mockCacher('cfg', store, { defaultExpiry: 0 });

      await cacher.set('always', 'here');

      const dataSet = client.setCalls.find((c) => c.key === 'cfg:v1:always');
      asserts.assertExists(dataSet);
      asserts.assertEquals(dataSet!.ttl, 0);
    });
  });

  describe('cross-instance clear staleness (regression)', () => {
    it(
      'a peer picks up another instance clear() within the bounded TTL, no split-brain',
      async () => {
        // Two long-lived instances (A, B) share one server. Both warm the
        // namespace version to 1.
        const store = new Map<string, string>();
        const { cacher: a } = mockCacher('app', store);
        const { cacher: b } = mockCacher('app', store);

        await a.set('token', 'v1-value'); // A warms v1, writes app:v1:token
        asserts.assertEquals(await b.get('token'), 'v1-value'); // B warms v1

        // A clears the namespace: the server counter advances to v2 and A's
        // own cache follows immediately.
        await a.clear();

        // B still trusts its cached v1. Simulate the NS_VERSION_TTL_MS window
        // elapsing (deterministic, no wall-clock sleep) so B's next operation
        // re-reads the counter. On the pre-fix code B cached v1 *forever* — it
        // has no read-timestamp field, so poking it is a no-op and B keeps
        // serving cleared data and writing invisible v1 keys.
        // deno-lint-ignore no-explicit-any
        (b as any).__nsVersionReadAt = 0;

        // Read side: B no longer serves the cleared v1 entry.
        asserts.assertEquals(await b.get('token'), undefined);

        // Write side: B's fresh write lands under v2 and is visible to A (the
        // split-brain symptom was B writing invisible v1 keys).
        await b.set('fresh', 'from-B');
        asserts.assertEquals(await a.get('fresh'), 'from-B');

        // The counter moved exactly once (A's clear); B never issued a flush.
        asserts.assertEquals(store.get('app:__ns_version__'), '2');
      },
    );
  });

  describe('window-mode refresh (regression)', () => {
    it(
      'refreshes the sliding TTL with touch (never rewrites the value), so a concurrent write survives',
      async () => {
        const store = new Map<string, string>();
        const { cacher: reader, client: readerClient } = mockCacher(
          'sess',
          store,
        );
        const { cacher: writer } = mockCacher('sess', store);

        await writer.set('s', { cart: ['x'] }, { window: true, expiry: 100 });

        // Simulate a peer's write committing between the reader's read and its
        // window-TTL refresh: hook the reader's client.get so that, right after
        // it returns the value the reader observes, a newer value is committed.
        const origGet = readerClient.get.bind(readerClient);
        let injected = false;
        readerClient.get = async (key: string): Promise<string | null> => {
          const res = await origGet(key);
          if (!injected && key === 'sess:v1:s') {
            injected = true;
            await writer.set('s', { cart: ['x', 'y'] }, {
              window: true,
              expiry: 100,
            });
          }
          return res;
        };

        // The read triggers the window-mode TTL refresh.
        await reader.get('s');

        // The concurrent update must survive. The pre-fix get-then-set refresh
        // rewrote the whole entry with the stale {cart:['x']}, clobbering the
        // peer's write (silent lost update); the touch-based refresh leaves the
        // value untouched.
        asserts.assertEquals(await writer.get('s'), { cart: ['x', 'y'] });
        // And the refresh went through touch, not a value-rewriting set.
        asserts.assertEquals(readerClient.touchCalls.length, 1);
        asserts.assertEquals(readerClient.touchCalls[0]!.key, 'sess:v1:s');
      },
    );
  });

  describe('memcached-safe key contract (regression)', () => {
    it('accepts keys with whitespace (same contract as Memory/Redis)', async () => {
      const store = new Map<string, string>();
      const { cacher } = mockCacher('geo', store);

      // A human-derived key with a space: rejected outright by the memcached
      // driver's key guard, so the pre-fix engine threw OPERATION_FAILED where
      // MEMORY/REDIS accept the same key.
      await cacher.set('city:New York', { pop: 8_000_000 });
      asserts.assertEquals(await cacher.get('city:New York'), {
        pop: 8_000_000,
      });
      // The space is percent-encoded on the wire so the driver accepts it.
      asserts.assert(
        [...store.keys()].some((k) => k.includes('city:New%20York')),
      );
    });

    it('accepts control characters in keys', async () => {
      const store = new Map<string, string>();
      const { cacher } = mockCacher('ctrl', store);

      await cacher.set('a\tb\nc', 'ok');
      asserts.assertEquals(await cacher.get('a\tb\nc'), 'ok');
    });

    it('accepts keys longer than the 250-byte memcached limit (hashed)', async () => {
      const store = new Map<string, string>();
      const { cacher } = mockCacher('big', store);

      const longKey = 'k'.repeat(300); // > 250 bytes even before the prefix
      await cacher.set(longKey, 'big-value');
      asserts.assertEquals(await cacher.get(longKey), 'big-value');
      // Stored under a short hashed wire key that fits the 250-byte limit.
      const wireKey = [...store.keys()].find((k) => k.startsWith('big:v1:'))!;
      asserts.assert(
        new TextEncoder().encode(wireKey).length <= 250,
        'wire key must fit the memcached 250-byte limit',
      );
    });
  });

  describe('instance name validation (regression)', () => {
    it('rejects a ":" in the instance name on direct construction', () => {
      // Sibling-path sweep for the round-4 colon-guard fix.
      asserts.assertThrows(
        () => new MemCacher('mc-app:sessions', { host: 'localhost' }),
        CacherEngineError,
        'must not contain ":"',
      );
    });
  });

  describe('memcached-safe instance name (regression)', () => {
    // Round-4: the round-3 key-contract fix sanitised only the user-key
    // segment; `this.name` was still interpolated raw into the probe key
    // (`${name}:__cacher_probe__`), the version-counter key
    // (`${name}:__ns_version__`) and the data-key prefix (`${name}:v{v}:...`).
    // A name Memory/Redis accept (whitespace / control chars / >250 bytes)
    // therefore produced a MEMCACHED-only hard failure. FakeMemcached mirrors
    // the driver's key guard, so any un-sanitised wire key makes these RED.

    it('sanitises a whitespace instance name in the version + data wire keys', async () => {
      const store = new Map<string, string>();
      const { cacher } = mockCacher('user cache', store); // space in the NAME

      // Pre-fix: the version-counter read `user cache:__ns_version__` and the
      // data key `user cache:v1:k` both carried the raw space -> driver reject.
      await cacher.set('k', 'v');
      asserts.assertEquals(await cacher.get('k'), 'v');
      // Space is percent-encoded in the name segment; the data key is on the
      // wire under the encoded prefix.
      asserts.assert(store.has('user%20cache:v1:k'));

      // clear() writes the version-counter key — it must be sanitised too.
      await cacher.clear();
      asserts.assert(store.has('user%20cache:__ns_version__'));

      // A fresh write lands under the bumped version, still sanitised.
      await cacher.set('k2', 'v2');
      asserts.assert(store.has('user%20cache:v2:k2'));
    });

    it('sanitises a whitespace instance name in the init() connectivity probe', async () => {
      const store = new Map<string, string>();
      // Unlike mockCacher (which pre-injects the client so init() is a no-op),
      // this drives the real init() probe against a key-validating fake.
      class FakeClientMemCacher extends MemCacher {
        protected override _createClient(): MemcachedEngine {
          return new FakeMemcached(store) as unknown as MemcachedEngine;
        }
      }
      const cacher = new FakeClientMemCacher('user cache', {
        host: 'localhost',
      });

      // Pre-fix: probe key `user cache:__cacher_probe__` carried the raw space,
      // the driver rejected it, and init() threw CONNECTION_FAILED.
      await cacher.init();
      asserts.assert(store.has('user%20cache:__cacher_probe__'));
    });

    it('sanitises control characters in the instance name', async () => {
      const store = new Map<string, string>();
      const { cacher } = mockCacher('tab\tname', store);

      await cacher.set('k', 'v');
      asserts.assertEquals(await cacher.get('k'), 'v');
      // The tab (0x09) is percent-encoded to %09 in every wire key.
      asserts.assert(store.has('tab%09name:v1:k'));
    });

    it('hashes an over-long instance name so every wire key fits 250 bytes', async () => {
      const store = new Map<string, string>();
      const longName = 'n'.repeat(300); // > 250 bytes on its own
      const { cacher } = mockCacher(longName, store);

      // Pre-fix: `${300-char name}:__ns_version__` alone blew the 250-byte cap.
      await cacher.set('k', 'v');
      asserts.assertEquals(await cacher.get('k'), 'v');
      await cacher.clear();

      // Every wire key the fake accepted is <= 250 bytes (the fake would have
      // thrown otherwise); assert it explicitly for good measure.
      for (const key of store.keys()) {
        asserts.assert(
          new TextEncoder().encode(key).length <= 250,
          `wire key must fit the 250-byte limit: ${key.length} chars`,
        );
      }
    });

    it('keeps the wire key <= 250 bytes for a long name AND a long user key', async () => {
      const store = new Map<string, string>();
      const longName = 'n'.repeat(200);
      const longKey = 'k'.repeat(300);
      const { cacher } = mockCacher(longName, store);

      // Pre-fix: a long name shrank the user-key budget below the 64-byte SHA
      // fallback, so the fallback key still overflowed the cap and threw.
      await cacher.set(longKey, 'v');
      asserts.assertEquals(await cacher.get(longKey), 'v');

      const wireKey = [...store.keys()][0]!;
      asserts.assert(
        new TextEncoder().encode(wireKey).length <= 250,
        `wire key must fit the 250-byte limit: ${wireKey.length} chars`,
      );
    });
  });

  describe('init connectivity-probe reset (regression)', () => {
    // A client whose probe (`set`) fails while `up === false`, mimicking a
    // server that is down at boot and lazily connects per operation.
    class ProbeControlledMemCacher extends MemCacher {
      public up = false;
      protected override _createClient(): MemcachedEngine {
        const self = this;
        const reject = () =>
          self.up
            ? Promise.resolve(true)
            : Promise.reject(new Error('connect ECONNREFUSED'));
        return {
          set: reject,
          get: () => (self.up ? Promise.resolve(null) : reject()),
          disconnect: () => {},
        } as unknown as MemcachedEngine;
      }
    }

    it(
      'discards the client after a failed probe so later ops re-classify the outage as CONNECTION_FAILED',
      async () => {
        const cacher = new ProbeControlledMemCacher('down', {
          host: 'localhost',
          port: 11211,
        });

        const err1 = await asserts.assertRejects(
          () => cacher.init(),
          CacherEngineError,
        );
        asserts.assertEquals(
          (err1 as CacherEngineError).code,
          'CONNECTION_FAILED',
        );

        // The fix: the failed client must be discarded so init() re-runs the
        // probe on the next operation instead of becoming a permanent no-op.
        // deno-lint-ignore no-explicit-any
        asserts.assertEquals((cacher as any)._client, undefined);

        // While the server is still down, a data operation must re-run the
        // probe and again report CONNECTION_FAILED — not a data-path
        // OPERATION_FAILED that would mis-diagnose the outage.
        const err2 = await asserts.assertRejects(
          () => cacher.get('any-key'),
          CacherEngineError,
        );
        asserts.assertEquals(
          (err2 as CacherEngineError).code,
          'CONNECTION_FAILED',
        );
      },
    );
  });
});
