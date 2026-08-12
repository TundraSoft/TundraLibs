import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat';
import type { Connection } from '@tundralibs/compat';
import { envArgs } from '@tundralibs/utils';
import { MemcachedEngine } from './Engine.ts';
import { EngineError } from '../../errors/mod.ts';

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

const env = envArgs('./packages/drivers/');

const TEST_CONFIG = {
  host: env.get('MEMCACHED_HOST') || 'localhost',
  // This suite calls global flush(); CI points it at a dedicated memcached
  // (MEMCACHED_PORT2) so it never clobbers cacher's suite, which shares the
  // primary instance. Locally, falls back to the single MEMCACHED_PORT.
  port: Number.parseInt(
    env.get('MEMCACHED_PORT2') || env.get('MEMCACHED_PORT') || '11211',
    10,
  ),
};

/**
 * Probe the configured Memcached server. The whole suite is skipped when
 * the server is unreachable so unit tests can still run in environments
 * without Memcached available.
 */
async function isMemcachedAvailable(): Promise<boolean> {
  const probe = new MemcachedEngine('memcached-probe', TEST_CONFIG);
  try {
    await probe.connect();
    const ok = await probe.ping();
    await probe.disconnect();
    return ok;
  } catch {
    try {
      await probe.disconnect();
    } catch {
      // ignore
    }
    return false;
  }
}

const memcachedAvailable = await isMemcachedAvailable();

/** Generate a unique key prefix per test to avoid cross-test contamination. */
let keyCounter = 0;
const k = (label: string) =>
  `tundra-test:${Date.now()}:${++keyCounter}:${label}`;

describe({
  name: 'drivers.MemcachedEngine',
  ignore: !memcachedAvailable,
  fn: () => {
    describe('configuration', () => {
      it('should expose Engine and Capabilities', () => {
        const engine = new MemcachedEngine('cfg-1', TEST_CONFIG);
        asserts.assertEquals(engine.Engine, 'MEMCACHED');
        asserts.assertEquals(engine.Capabilities.pooledConnections, true);
        asserts.assertEquals(engine.Name, 'cfg-1');
        asserts.assertEquals(engine.instanceId, 'MEMCACHED::cfg-1');
      });

      it('should default port to 11211', () => {
        const { port: _port, ...withoutPort } = TEST_CONFIG;
        const engine = new MemcachedEngine('cfg-2', {
          ...withoutPort,
          host: TEST_CONFIG.host,
        });
        asserts.assertEquals(readOption(engine, 'port'), 11211);
      });

      it('should default maxBufferSize to 2 (MB)', () => {
        const engine = new MemcachedEngine('cfg-3', TEST_CONFIG);
        asserts.assertEquals(readOption(engine, 'maxBufferSize'), 2);
      });

      it('should require host', () => {
        asserts.assertThrows(
          // deno-lint-ignore no-explicit-any
          () => new MemcachedEngine('cfg-4', {} as any),
          EngineError,
          'host',
        );
      });

      it('should reject empty host', () => {
        asserts.assertThrows(
          () => new MemcachedEngine('cfg-5', { host: '' }),
          EngineError,
          'must be a non-empty string',
        );
      });

      it('should reject invalid port', () => {
        asserts.assertThrows(
          () => new MemcachedEngine('cfg-6', { ...TEST_CONFIG, port: -1 }),
          EngineError,
          'between 1 and 65535',
        );
        asserts.assertThrows(
          () =>
            new MemcachedEngine('cfg-7', {
              ...TEST_CONFIG,
              port: 99999,
            }),
          EngineError,
          'between 1 and 65535',
        );
      });

      it('should reject non-positive maxBufferSize', () => {
        asserts.assertThrows(
          () =>
            new MemcachedEngine('cfg-8', {
              ...TEST_CONFIG,
              maxBufferSize: 0,
            }),
          EngineError,
          'positive number',
        );
        asserts.assertThrows(
          () =>
            new MemcachedEngine('cfg-9', {
              ...TEST_CONFIG,
              maxBufferSize: -5,
            }),
          EngineError,
          'positive number',
        );
      });
    });

    describe('lifecycle', () => {
      it('should connect, ping, and disconnect', async () => {
        const engine = new MemcachedEngine('life-1', TEST_CONFIG);
        asserts.assertEquals(engine.status, 'CLOSED');
        await engine.connect();
        asserts.assertEquals(engine.status, 'READY');
        asserts.assertEquals(await engine.ping(), true);
        await engine.disconnect();
        asserts.assertEquals(engine.status, 'CLOSED');
      });

      it('should be idempotent on repeated connect/disconnect', async () => {
        const engine = new MemcachedEngine('life-2', TEST_CONFIG);
        await engine.connect();
        await engine.connect();
        await engine.disconnect();
        await engine.disconnect();
        asserts.assertEquals(engine.status, 'CLOSED');
      });

      it('should fail to connect with an unreachable host', async () => {
        const engine = new MemcachedEngine('life-3', {
          host: '127.0.0.1',
          port: 1, // reserved, should refuse
          pool: { min: 1, acquireTimeoutSeconds: 1 },
        });
        await asserts.assertRejects(() => engine.connect(), EngineError);
      });

      it('should return false from ping when not connected', async () => {
        const engine = new MemcachedEngine('life-4', TEST_CONFIG);
        asserts.assertEquals(await engine.ping(), false);
      });

      it('should emit connect event', async () => {
        let received = '';
        const engine = new MemcachedEngine('life-5', {
          ...TEST_CONFIG,
          _onconnect: (id: string) => {
            received = id;
          },
        });
        await engine.connect();
        asserts.assertEquals(received, 'MEMCACHED::life-5');
        await engine.disconnect();
      });
    });

    describe('storage operations', () => {
      it('should set and get a value', async () => {
        const engine = new MemcachedEngine('store-1', TEST_CONFIG);
        await engine.connect();
        const key = k('basic');
        await engine.set(key, 'hello-world', 60);
        asserts.assertEquals(await engine.get(key), 'hello-world');
        await engine.delete(key);
        await engine.disconnect();
      });

      it('should overwrite an existing key with set', async () => {
        const engine = new MemcachedEngine('store-2', TEST_CONFIG);
        await engine.connect();
        const key = k('overwrite');
        await engine.set(key, 'first', 60);
        await engine.set(key, 'second', 60);
        asserts.assertEquals(await engine.get(key), 'second');
        await engine.delete(key);
        await engine.disconnect();
      });

      it('should return null for a missing key', async () => {
        const engine = new MemcachedEngine('store-3', TEST_CONFIG);
        await engine.connect();
        asserts.assertEquals(await engine.get(k('missing')), null);
        await engine.disconnect();
      });

      it('should preserve special characters in values', async () => {
        const engine = new MemcachedEngine('store-4', TEST_CONFIG);
        await engine.connect();
        const key = k('special');
        const value = 'special!@#$%^&*()_+-=[]{}|;\':",./<>?';
        await engine.set(key, value, 60);
        asserts.assertEquals(await engine.get(key), value);
        await engine.delete(key);
        await engine.disconnect();
      });

      it('should preserve multi-byte UTF-8 values', async () => {
        const engine = new MemcachedEngine('store-5', TEST_CONFIG);
        await engine.connect();
        const key = k('utf8');
        const value = '日本語 🚀 émoji';
        await engine.set(key, value, 60);
        asserts.assertEquals(await engine.get(key), value);
        await engine.delete(key);
        await engine.disconnect();
      });

      it('should round-trip JSON payloads', async () => {
        const engine = new MemcachedEngine('store-6', TEST_CONFIG);
        await engine.connect();
        const key = k('json');
        const payload = {
          user: { id: 42, name: 'Alice', tags: ['admin', 'beta'] },
          ts: new Date('2026-01-01').toISOString(),
        };
        await engine.set(key, JSON.stringify(payload), 60);
        const raw = await engine.get(key);
        asserts.assertExists(raw);
        asserts.assertEquals(JSON.parse(raw), payload);
        await engine.delete(key);
        await engine.disconnect();
      });

      it('should expire values after their TTL', async () => {
        const engine = new MemcachedEngine('store-7', TEST_CONFIG);
        await engine.connect();
        const key = k('ttl');
        await engine.set(key, 'short-lived', 1);
        asserts.assertEquals(await engine.get(key), 'short-lived');
        await new Promise((r) => setTimeout(r, 1500));
        asserts.assertEquals(await engine.get(key), null);
        await engine.disconnect();
      });
    });

    describe('gets / cas', () => {
      it('gets should return value and a cas token for an existing key', async () => {
        const engine = new MemcachedEngine('cas-1', TEST_CONFIG);
        await engine.connect();
        const key = k('cas-hit');
        await engine.set(key, 'initial', 60);
        const result = await engine.gets(key);
        asserts.assertExists(result);
        asserts.assertEquals(result.value, 'initial');
        asserts.assert(result.cas.length > 0);
        await engine.delete(key);
        await engine.disconnect();
      });

      it('gets should return null for a missing key', async () => {
        const engine = new MemcachedEngine('cas-2', TEST_CONFIG);
        await engine.connect();
        asserts.assertEquals(await engine.gets(k('cas-miss')), null);
        await engine.disconnect();
      });

      it('cas should succeed when token matches', async () => {
        const engine = new MemcachedEngine('cas-3', TEST_CONFIG);
        await engine.connect();
        const key = k('cas-success');
        await engine.set(key, 'v1', 60);
        const fetched = await engine.gets(key);
        asserts.assertExists(fetched);
        asserts.assertEquals(
          await engine.cas(key, 'v2', fetched.cas, 60),
          true,
        );
        asserts.assertEquals(await engine.get(key), 'v2');
        await engine.delete(key);
        await engine.disconnect();
      });

      it('cas should return false when token is stale (concurrent write)', async () => {
        const engine = new MemcachedEngine('cas-4', TEST_CONFIG);
        await engine.connect();
        const key = k('cas-conflict');
        await engine.set(key, 'v1', 60);
        const stale = await engine.gets(key);
        asserts.assertExists(stale);
        // Simulate another writer changing the value (and bumping the token).
        await engine.set(key, 'v2', 60);
        asserts.assertEquals(
          await engine.cas(key, 'v3', stale.cas, 60),
          false,
        );
        // Original value remains because cas was rejected.
        asserts.assertEquals(await engine.get(key), 'v2');
        await engine.delete(key);
        await engine.disconnect();
      });

      it('cas should return false when key has been deleted', async () => {
        const engine = new MemcachedEngine('cas-5', TEST_CONFIG);
        await engine.connect();
        const key = k('cas-gone');
        await engine.set(key, 'v1', 60);
        const fetched = await engine.gets(key);
        asserts.assertExists(fetched);
        await engine.delete(key);
        asserts.assertEquals(
          await engine.cas(key, 'v2', fetched.cas, 60),
          false,
        );
        await engine.disconnect();
      });

      it('cas tokens should change on each successful write', async () => {
        const engine = new MemcachedEngine('cas-6', TEST_CONFIG);
        await engine.connect();
        const key = k('cas-tokens');
        await engine.set(key, 'v1', 60);
        const t1 = (await engine.gets(key))?.cas;
        await engine.set(key, 'v2', 60);
        const t2 = (await engine.gets(key))?.cas;
        asserts.assertExists(t1);
        asserts.assertExists(t2);
        asserts.assert(t1 !== t2, 'cas token should change after a write');
        await engine.delete(key);
        await engine.disconnect();
      });
    });

    describe('touch', () => {
      it('should extend TTL of an existing key', async () => {
        const engine = new MemcachedEngine('touch-1', TEST_CONFIG);
        await engine.connect();
        const key = k('touch-extend');
        // Set with 3s TTL, immediately touch to 60s. Wait 4s — past the
        // original TTL but well within the touched one. (We use 3s/4s
        // rather than 1s/1.5s to keep the test robust under concurrent
        // load where set + touch can easily eat ~500ms.)
        await engine.set(key, 'persist', 3);
        asserts.assertEquals(await engine.touch(key, 60), true);
        await new Promise((r) => setTimeout(r, 4000));
        asserts.assertEquals(await engine.get(key), 'persist');
        await engine.delete(key);
        await engine.disconnect();
      });

      it('should return false for a missing key', async () => {
        const engine = new MemcachedEngine('touch-2', TEST_CONFIG);
        await engine.connect();
        asserts.assertEquals(await engine.touch(k('touch-missing'), 60), false);
        await engine.disconnect();
      });

      it('should leave the value unchanged', async () => {
        const engine = new MemcachedEngine('touch-3', TEST_CONFIG);
        await engine.connect();
        const key = k('touch-value');
        await engine.set(key, 'unchanged', 60);
        await engine.touch(key, 30);
        asserts.assertEquals(await engine.get(key), 'unchanged');
        await engine.delete(key);
        await engine.disconnect();
      });
    });

    describe('add / replace', () => {
      it('add should succeed for new keys', async () => {
        const engine = new MemcachedEngine('addrep-1', TEST_CONFIG);
        await engine.connect();
        const key = k('add-new');
        asserts.assertEquals(await engine.add(key, 'fresh', 60), true);
        asserts.assertEquals(await engine.get(key), 'fresh');
        await engine.delete(key);
        await engine.disconnect();
      });

      it('add should return false if the key already exists', async () => {
        const engine = new MemcachedEngine('addrep-2', TEST_CONFIG);
        await engine.connect();
        const key = k('add-existing');
        await engine.set(key, 'first', 60);
        asserts.assertEquals(await engine.add(key, 'second', 60), false);
        asserts.assertEquals(await engine.get(key), 'first');
        await engine.delete(key);
        await engine.disconnect();
      });

      it('replace should succeed for existing keys', async () => {
        const engine = new MemcachedEngine('addrep-3', TEST_CONFIG);
        await engine.connect();
        const key = k('replace-existing');
        await engine.set(key, 'first', 60);
        asserts.assertEquals(await engine.replace(key, 'second', 60), true);
        asserts.assertEquals(await engine.get(key), 'second');
        await engine.delete(key);
        await engine.disconnect();
      });

      it('replace should return false for missing keys', async () => {
        const engine = new MemcachedEngine('addrep-4', TEST_CONFIG);
        await engine.connect();
        asserts.assertEquals(
          await engine.replace(k('replace-missing'), 'value', 60),
          false,
        );
        await engine.disconnect();
      });
    });

    describe('append / prepend', () => {
      it('append should concatenate to the end', async () => {
        const engine = new MemcachedEngine('appprep-1', TEST_CONFIG);
        await engine.connect();
        const key = k('append');
        await engine.set(key, 'foo', 60);
        await engine.append(key, '-bar');
        asserts.assertEquals(await engine.get(key), 'foo-bar');
        await engine.delete(key);
        await engine.disconnect();
      });

      it('prepend should concatenate to the start', async () => {
        const engine = new MemcachedEngine('appprep-2', TEST_CONFIG);
        await engine.connect();
        const key = k('prepend');
        await engine.set(key, 'bar', 60);
        await engine.prepend(key, 'foo-');
        asserts.assertEquals(await engine.get(key), 'foo-bar');
        await engine.delete(key);
        await engine.disconnect();
      });

      it('append/prepend should fail when the key does not exist', async () => {
        const engine = new MemcachedEngine('appprep-3', TEST_CONFIG);
        await engine.connect();
        await asserts.assertRejects(
          () => engine.append(k('append-missing'), 'x'),
          EngineError,
          'append',
        );
        await asserts.assertRejects(
          () => engine.prepend(k('prepend-missing'), 'x'),
          EngineError,
          'prepend',
        );
        await engine.disconnect();
      });
    });

    describe('delete', () => {
      it('should delete an existing key', async () => {
        const engine = new MemcachedEngine('del-1', TEST_CONFIG);
        await engine.connect();
        const key = k('delete-existing');
        await engine.set(key, 'gone-soon', 60);
        asserts.assertEquals(await engine.delete(key), true);
        asserts.assertEquals(await engine.get(key), null);
        await engine.disconnect();
      });

      it('should return false when deleting a missing key', async () => {
        const engine = new MemcachedEngine('del-2', TEST_CONFIG);
        await engine.connect();
        asserts.assertEquals(
          await engine.delete(k('delete-missing')),
          false,
        );
        await engine.disconnect();
      });
    });

    describe('counters', () => {
      it('incr should increment a numeric value', async () => {
        const engine = new MemcachedEngine('cnt-1', TEST_CONFIG);
        await engine.connect();
        const key = k('counter-incr');
        await engine.set(key, '10', 60);
        asserts.assertEquals(await engine.incr(key, 1), 11);
        asserts.assertEquals(await engine.incr(key, 5), 16);
        await engine.delete(key);
        await engine.disconnect();
      });

      it('decr should decrement a numeric value', async () => {
        const engine = new MemcachedEngine('cnt-2', TEST_CONFIG);
        await engine.connect();
        const key = k('counter-decr');
        await engine.set(key, '10', 60);
        asserts.assertEquals(await engine.decr(key, 3), 7);
        asserts.assertEquals(await engine.decr(key, 2), 5);
        await engine.delete(key);
        await engine.disconnect();
      });

      it('decr should not go below zero (memcached clamps)', async () => {
        const engine = new MemcachedEngine('cnt-3', TEST_CONFIG);
        await engine.connect();
        const key = k('counter-floor');
        await engine.set(key, '2', 60);
        const result = await engine.decr(key, 100);
        asserts.assertEquals(result, 0);
        await engine.delete(key);
        await engine.disconnect();
      });

      it('incr should fail for missing keys', async () => {
        const engine = new MemcachedEngine('cnt-4', TEST_CONFIG);
        await engine.connect();
        await asserts.assertRejects(
          () => engine.incr(k('counter-missing')),
          EngineError,
          'incr',
        );
        await engine.disconnect();
      });

      it('incr should fail when value is non-numeric', async () => {
        const engine = new MemcachedEngine('cnt-5', TEST_CONFIG);
        await engine.connect();
        const key = k('counter-non-numeric');
        await engine.set(key, 'not-a-number', 60);
        await asserts.assertRejects(
          () => engine.incr(key),
          EngineError,
        );
        await engine.delete(key);
        await engine.disconnect();
      });
    });

    describe('admin', () => {
      it('version should return a non-empty string', async () => {
        const engine = new MemcachedEngine('admin-1', TEST_CONFIG);
        await engine.connect();
        const v = await engine.version();
        asserts.assert(v.length > 0, `expected version, got "${v}"`);
        await engine.disconnect();
      });

      it('stats should return a list of metric lines', async () => {
        const engine = new MemcachedEngine('admin-2', TEST_CONFIG);
        await engine.connect();
        const lines = await engine.stats();
        asserts.assert(lines.length > 0);
        // Every line should begin with `STAT` per protocol.
        asserts.assert(lines.every((l) => l.startsWith('STAT ')));
        await engine.disconnect();
      });

      it('flush should remove a previously stored key', async () => {
        const engine = new MemcachedEngine('admin-3', TEST_CONFIG);
        await engine.connect();
        const key = k('flush-target');
        await engine.set(key, 'will-vanish', 60);
        asserts.assertEquals(await engine.get(key), 'will-vanish');
        asserts.assertEquals(await engine.flush(), true);
        asserts.assertEquals(await engine.get(key), null);
        await engine.disconnect();
      });

      it('flush with delay should defer expiration', async () => {
        const engine = new MemcachedEngine('admin-4', TEST_CONFIG);
        await engine.connect();
        const key = k('flush-delayed');
        await engine.set(key, 'still-here', 60);
        // Schedule flush 2 seconds in the future.
        asserts.assertEquals(await engine.flush(2), true);
        // Immediately after: key is still readable.
        asserts.assertEquals(await engine.get(key), 'still-here');
        // After the delay window, the key should be gone.
        await new Promise((r) => setTimeout(r, 2500));
        asserts.assertEquals(await engine.get(key), null);
        await engine.disconnect();
      });
    });

    describe('pool behavior', () => {
      it('should reuse pooled connections across operations', async () => {
        const engine = new MemcachedEngine('pool-1', {
          ...TEST_CONFIG,
          pool: { min: 1, max: 2 },
        });
        await engine.connect();
        for (let i = 0; i < 20; i++) {
          await engine.set(k(`reuse-${i}`), `v${i}`, 30);
        }
        const stats = engine.poolStats;
        asserts.assert(
          stats.total <= 2,
          `pool should not exceed max (got ${stats.total})`,
        );
        await engine.disconnect();
      });

      it('should serialize concurrent operations under pool pressure', async () => {
        const engine = new MemcachedEngine('pool-2', {
          ...TEST_CONFIG,
          pool: { max: 2 },
        });
        await engine.connect();
        const ops = Array.from(
          { length: 25 },
          (_, i) => engine.set(k(`concurrent-${i}`), `value-${i}`, 30),
        );
        await Promise.all(ops);
        // Verify a sample written from concurrent ops.
        const sampleKey = k('concurrent-final');
        await engine.set(sampleKey, 'sentinel', 30);
        asserts.assertEquals(await engine.get(sampleKey), 'sentinel');
        await engine.delete(sampleKey);
        await engine.disconnect();
      });

      it('should reflect pool stats accurately', async () => {
        const engine = new MemcachedEngine('pool-3', {
          ...TEST_CONFIG,
          pool: { min: 2, max: 4 },
        });
        await engine.connect();
        const stats = engine.poolStats;
        asserts.assertEquals(stats.idle, 2);
        asserts.assertEquals(stats.active, 0);
        await engine.disconnect();
      });
    });

    describe('error handling', () => {
      it('should auto-connect on first operation', async () => {
        // Each public method calls `await this.connect()` first, so callers
        // are not required to invoke connect() explicitly.
        const engine = new MemcachedEngine('err-1', TEST_CONFIG);
        asserts.assertEquals(engine.status, 'CLOSED');
        const result = await engine.get(k('auto-connect'));
        asserts.assertEquals(result, null);
        asserts.assertEquals(engine.status, 'READY');
        await engine.disconnect();
      });

      it('should propagate buffer overflow as OPERATION_FAILED', async () => {
        // Write a small (well within server limit) value with a normal client,
        // then read it back through a client whose buffer is too tight to
        // accommodate the protocol envelope + payload.
        const writer = new MemcachedEngine('err-2-w', TEST_CONFIG);
        const tightReader = new MemcachedEngine('err-2-r', {
          ...TEST_CONFIG,
          // ~1 KB buffer is too small for the 4 KB payload we're about to read.
          maxBufferSize: 0.001,
        });
        await writer.connect();
        await tightReader.connect();
        const key = k('overflow');
        const payload = 'a'.repeat(4 * 1024);
        await writer.set(key, payload, 30);
        await asserts.assertRejects(
          () => tightReader.get(key),
          EngineError,
          'maximum buffer size',
        );
        await writer.delete(key);
        await writer.disconnect();
        await tightReader.disconnect();
      });
    });
  },
});

// Key validation runs before any network I/O (it sits at the top of every
// public command method, ahead of `connect()`), so these assertions hold even
// when no Memcached server is reachable — hence this suite is NOT gated on
// `memcachedAvailable`.
describe('drivers.MemcachedEngine - key validation', () => {
  const engine = new MemcachedEngine('keyval', TEST_CONFIG);

  // Every public command method that interpolates a user-supplied key into a
  // text-protocol command line. A key that escapes its argument could smuggle
  // extra commands onto the wire, so each entry point must reject bad keys.
  const operations: Array<[string, (key: string) => Promise<unknown>]> = [
    ['get', (key) => engine.get(key)],
    ['gets', (key) => engine.gets(key)],
    ['set', (key) => engine.set(key, 'v', 30)],
    ['add', (key) => engine.add(key, 'v', 30)],
    ['replace', (key) => engine.replace(key, 'v', 30)],
    ['cas', (key) => engine.cas(key, 'v', '1', 30)],
    ['append', (key) => engine.append(key, 'v')],
    ['prepend', (key) => engine.prepend(key, 'v')],
    ['touch', (key) => engine.touch(key, 30)],
    ['delete', (key) => engine.delete(key)],
    ['incr', (key) => engine.incr(key, 1)],
    ['decr', (key) => engine.decr(key, 1)],
  ];

  // The headline attack: a key crafted to terminate the current command and
  // inject a second `set` — exactly what `__validateKey` exists to stop.
  const INJECTION_KEY = 'foo 0 0 5\r\nset evil 0 0 5\r\npwned';

  for (const [opName, run] of operations) {
    it(`should reject a CRLF command-injection key on ${opName}()`, async () => {
      await asserts.assertRejects(
        () => run(INJECTION_KEY),
        EngineError,
        'is invalid',
      );
    });
  }

  // Exhaustive bad-key coverage on a representative method (`get`). The guard
  // is shared, so proving it here plus the per-method sweep above covers all.
  const badKeys: Array<[string, string]> = [
    ['CRLF', 'foo\r\nbar'],
    ['bare newline', 'foo\nbar'],
    ['carriage return', 'foo\rbar'],
    ['embedded space', 'foo bar'],
    ['tab', 'foo\tbar'],
    ['null byte', 'foo\x00bar'],
    ['DEL (0x7f)', 'foo\x7fbar'],
    ['empty string', ''],
    ['over 250 bytes (ascii)', 'a'.repeat(251)],
    // 84 × 3-byte chars = 252 bytes, but only 84 in `.length` — proves the
    // limit is measured in bytes, not characters.
    ['over 250 bytes (multi-byte)', '世'.repeat(84)],
  ];

  for (const [desc, key] of badKeys) {
    it(`should reject ${desc} on get()`, async () => {
      await asserts.assertRejects(
        () => engine.get(key),
        EngineError,
        'is invalid',
      );
    });
  }

  it('should accept a normal key and 250-byte boundary', () => {
    // Direct guard calls so the positive cases don't require a live server
    // (the public methods would proceed to connect() after validation).
    // @ts-expect-error - exercising the private guard directly in a unit test
    engine.__validateKey('user:42:profile');
    // @ts-expect-error - exercising the private guard directly in a unit test
    engine.__validateKey('a'.repeat(250));
    // 250 multi-byte bytes (no trailing partial char): exactly at the limit.
    // @ts-expect-error - exercising the private guard directly in a unit test
    engine.__validateKey('x'.repeat(247) + '世'); // 247 + 3 = 250 bytes
  });

  it('should reject a 251-byte key with a byte-limit message', () => {
    asserts.assertThrows(
      // @ts-expect-error - exercising the private guard directly in a unit test
      () => engine.__validateKey('a'.repeat(251)),
      EngineError,
      'must not exceed 250 bytes',
    );
  });
});

// The CAS token is the *other* caller-supplied value interpolated into a
// command line, and it sits at the tail of `cas` where a key sits elsewhere —
// same injection hazard, so it gets the same guard. Validation runs ahead of
// `connect()`, so (like the key suite above) this is NOT gated on
// `memcachedAvailable`.
describe('drivers.MemcachedEngine - CAS token validation', () => {
  const engine = new MemcachedEngine('casval', TEST_CONFIG);

  // The headline attack: a token that terminates the `cas` line and appends
  // a `delete` for an unrelated key.
  const INJECTION_TOKEN = '12345\r\ndelete victim';

  it('should reject a CRLF command-injection casToken', async () => {
    await asserts.assertRejects(
      () => engine.cas('safe-key', 'v', INJECTION_TOKEN, 30),
      EngineError,
      'is invalid',
    );
  });

  // A CAS token is a server-minted 64-bit counter, so anything that isn't a
  // bare run of digits is either an attack or a caller bug.
  const badTokens: Array<[string, string]> = [
    ['bare newline', '123\n'],
    ['trailing CRLF', '123\r\n'],
    ['carriage return', '123\r'],
    ['embedded space', '123 456'],
    ['tab', '123\t456'],
    ['null byte', '123\x00'],
    ['empty string', ''],
    ['non-numeric', 'abc'],
    ['negative', '-1'],
    ['decimal', '1.5'],
    ['leading space', ' 123'],
    ['smuggled set command', '1 0 0 5\r\nset evil 0 0 5\r\npwned'],
  ];

  for (const [desc, token] of badTokens) {
    it(`should reject ${desc} as a casToken`, async () => {
      await asserts.assertRejects(
        () => engine.cas('safe-key', 'v', token, 30),
        EngineError,
        'is invalid',
      );
    });
  }

  it('should accept a legitimate server-issued numeric token', () => {
    // Direct guard calls so the positive cases don't require a live server
    // (the public method proceeds to connect() once validation passes).
    // @ts-expect-error - exercising the private guard directly in a unit test
    engine.__validateCasToken('12345');
    // @ts-expect-error - exercising the private guard directly in a unit test
    engine.__validateCasToken('0');
    // u64 max — the largest token a server can hand out via gets().
    // @ts-expect-error - exercising the private guard directly in a unit test
    engine.__validateCasToken('18446744073709551615');
  });
});

// A recording connection that speaks just enough of the text protocol for the
// exptime tests: it captures every command written and replies with the
// appropriate terminal line so `__request` completes without a live server.
class RecordingConn implements Connection {
  public readonly writes: string[] = [];
  private readonly __replies: Uint8Array[] = [];
  read(): Promise<Uint8Array | null> {
    return Promise.resolve(this.__replies.shift() ?? null);
  }
  write(data: Uint8Array | string): Promise<number> {
    const text = typeof data === 'string'
      ? data
      : new TextDecoder().decode(data);
    this.writes.push(text);
    const verb = text.split(' ', 1)[0];
    const reply = verb === 'touch' ? 'TOUCHED\r\n' : 'STORED\r\n';
    this.__replies.push(new TextEncoder().encode(reply));
    return Promise.resolve(text.length);
  }
  close(): void {}
}

/** MemcachedEngine wired to record wire commands instead of opening sockets. */
class RecordingMemcachedEngine extends MemcachedEngine {
  public readonly conns: RecordingConn[] = [];
  protected override _createResource(): Promise<Connection> {
    const conn = new RecordingConn();
    this.conns.push(conn);
    return Promise.resolve(conn);
  }
}

// Runs without a live server — the exptime field is computed client-side, so
// the mapping from a caller TTL to the on-wire `exptime` can be asserted
// deterministically. Memcached exptime semantics: 0 = never expire,
// 1..2592000 = relative seconds, > 2592000 = absolute Unix timestamp.
describe('drivers.MemcachedEngine - exptime mapping (offline)', () => {
  /** Extract the exptime token from the last command written on the wire.
   * Strips any trailing CRLF so a token that ends the first protocol line
   * (e.g. `touch key 0\r\n`) compares cleanly. */
  const lastExptime = (engine: RecordingMemcachedEngine, index: number) => {
    const all = engine.conns.flatMap((c) => c.writes);
    return all[all.length - 1]!.split(' ')[index]!.split('\r')[0];
  };

  it('set: ttl 0 maps to exptime 0 (never expire), not clamped to 1', async () => {
    const engine = new RecordingMemcachedEngine('exp-set-zero', {
      host: 'localhost',
    });
    await engine.set('k', 'v', 0);
    // Regression: the previous `Math.max(1, ttl)` turned 0 into 1, silently
    // giving a "permanent" entry a 1-second life.
    asserts.assertStrictEquals(lastExptime(engine, 3), '0');
    await engine.disconnect();
  });

  it('set: a small positive ttl passes through unchanged', async () => {
    const engine = new RecordingMemcachedEngine('exp-set-pos', {
      host: 'localhost',
    });
    await engine.set('k', 'v', 5);
    asserts.assertStrictEquals(lastExptime(engine, 3), '5');
    await engine.disconnect();
  });

  it('set: a negative ttl clamps to 1 second', async () => {
    const engine = new RecordingMemcachedEngine('exp-set-neg', {
      host: 'localhost',
    });
    await engine.set('k', 'v', -3);
    asserts.assertStrictEquals(lastExptime(engine, 3), '1');
    await engine.disconnect();
  });

  it('set: a value past the 30-day boundary is left as an absolute timestamp', async () => {
    const engine = new RecordingMemcachedEngine('exp-set-abs', {
      host: 'localhost',
    });
    // 2592000 is the 30-day boundary; anything larger is an absolute Unix
    // timestamp and must NOT be clamped or otherwise rewritten.
    await engine.set('k', 'v', 2592001);
    asserts.assertStrictEquals(lastExptime(engine, 3), '2592001');
    await engine.disconnect();
  });

  it('touch: ttl 0 maps to exptime 0 (never expire)', async () => {
    const engine = new RecordingMemcachedEngine('exp-touch-zero', {
      host: 'localhost',
    });
    await engine.touch('k', 0);
    // `touch <key> <exptime>` — exptime is the 3rd token.
    asserts.assertStrictEquals(lastExptime(engine, 2), '0');
    await engine.disconnect();
  });

  it('cas: ttl 0 maps to exptime 0 (never expire)', async () => {
    const engine = new RecordingMemcachedEngine('exp-cas-zero', {
      host: 'localhost',
    });
    await engine.cas('k', 'v', '1', 0);
    // `cas <key> <flags> <exptime> <bytes> <casToken>` — exptime is 4th token.
    asserts.assertStrictEquals(lastExptime(engine, 3), '0');
    await engine.disconnect();
  });
});

/** Scripted reply, or a transport-level failure sentinel. */
type ScriptReply = Uint8Array | 'EOF' | 'RST' | 'RST_WRITE';

// A fake compat `Connection` that answers each write with a scripted reply.
// - `'EOF'`       — `read()` resolves `null` (server closed cleanly mid-reply).
// - `'RST'`       — the write lands, then `read()` *rejects* with ECONNRESET.
// - `'RST_WRITE'` — `write()` itself rejects.
//
// The last two model `compat`'s `wrapNodeSocket`, which stores the socket
// error and rejects every subsequent read *and* write forever (net.ts), and
// Deno's bare `conn.read()` propagating `ConnectionReset`. That "sticky
// error" behaviour is what makes a recycled corpse a permanent outage.
class ScriptConn implements Connection {
  public closed = false;
  private readonly __out: (Uint8Array | 'EOF')[] = [];
  private __pending: ((v: Uint8Array | null) => void) | null = null;
  private __error: Error | null = null;
  constructor(
    private readonly __responder: (cmd: string) => ScriptReply,
  ) {}
  read(): Promise<Uint8Array | null> {
    if (this.__error) return Promise.reject(this.__error);
    const c = this.__out.shift();
    if (c === 'EOF') return Promise.resolve(null);
    if (c !== undefined) return Promise.resolve(c);
    return new Promise((res) => {
      this.__pending = res;
    });
  }
  write(data: Uint8Array | string): Promise<number> {
    if (this.__error) return Promise.reject(this.__error);
    const cmd = typeof data === 'string'
      ? data
      : new TextDecoder().decode(data);
    const reply = this.__responder(cmd);
    if (reply === 'RST_WRITE') {
      this.__error = new Error('write ECONNRESET');
      return Promise.reject(this.__error);
    }
    if (reply === 'RST') {
      // The command went out; the peer then reset the connection, so the
      // pending read (and everything after it) rejects.
      this.__error = new Error('read ECONNRESET');
      return Promise.resolve(cmd.length);
    }
    this.__push(reply);
    return Promise.resolve(cmd.length);
  }
  close(): void {
    this.closed = true;
    if (this.__pending) {
      const p = this.__pending;
      this.__pending = null;
      p(null);
    }
  }
  private __push(chunk: Uint8Array | 'EOF'): void {
    if (this.__pending) {
      const p = this.__pending;
      this.__pending = null;
      p(chunk === 'EOF' ? null : chunk);
    } else {
      this.__out.push(chunk);
    }
  }
}

/** MemcachedEngine whose connections are scripted, one responder per created conn. */
class StubMemcachedEngine extends MemcachedEngine {
  public readonly conns: ScriptConn[] = [];
  constructor(
    name: string,
    // deno-lint-ignore no-explicit-any
    options: any,
    private readonly __responders: Array<(cmd: string) => ScriptReply>,
  ) {
    super(name, options);
  }
  protected override _createResource(): Promise<Connection> {
    const responder = this.__responders[this.conns.length] ??
      this.__responders[this.__responders.length - 1]!;
    const conn = new ScriptConn(responder);
    this.conns.push(conn);
    return Promise.resolve(conn);
  }
}

// Round-3 finding #2: Memcached never destroyed a connection left dead or
// mid-reply and had no `_validateResource` — poisoned connections were pooled
// and re-served (silently wrong cross-key data, or a dead socket forever).
describe('drivers.MemcachedEngine - connection poisoning (offline)', () => {
  const enc = new TextEncoder();

  it('destroys a connection after a mid-stream buffer overflow, then heals', async () => {
    const bigVal = 'X'.repeat(4000); // exceeds the tiny cap below
    const overflow = (_cmd: string): Uint8Array =>
      enc.encode(`VALUE user:1 0 ${bigVal.length}\r\n${bigVal}\r\nEND\r\n`);
    const genuine = (_cmd: string): Uint8Array =>
      enc.encode('VALUE user:2 0 8\r\nGENUINE!\r\nEND\r\n');
    const engine = new StubMemcachedEngine(
      'mc-overflow',
      { host: 'x', maxBufferSize: 0.001, pool: { max: 1 } },
      [overflow, genuine],
    );
    await engine.connect();

    await asserts.assertRejects(() => engine.get('user:1'), EngineError);
    // Poisoned connection destroyed (closed), not returned to the idle pool.
    asserts.assertStrictEquals(engine.poolStats.idle, 0);
    asserts.assertStrictEquals(engine.conns[0]!.closed, true);

    // Next get runs on a fresh connection — no leftover bytes from user:1.
    const value = await engine.get('user:2');
    asserts.assertStrictEquals(value, 'GENUINE!');
    asserts.assert(engine.conns.length >= 2);

    await engine.disconnect();
  });

  it('destroys a connection whose socket died mid-reply, then heals', async () => {
    const dead = (_cmd: string): 'EOF' => 'EOF';
    const genuine = (_cmd: string): Uint8Array =>
      enc.encode('VALUE k 0 8\r\nGENUINE!\r\nEND\r\n');
    const engine = new StubMemcachedEngine(
      'mc-dead',
      { host: 'x', pool: { max: 1 } },
      [dead, genuine],
    );
    await engine.connect();

    await asserts.assertRejects(() => engine.get('k'), EngineError);
    asserts.assertStrictEquals(engine.poolStats.idle, 0);
    asserts.assertStrictEquals(engine.conns[0]!.closed, true);

    const value = await engine.get('k');
    asserts.assertStrictEquals(value, 'GENUINE!');

    await engine.disconnect();
  });

  it('keeps the connection on a complete server-error reply (socket clean)', async () => {
    // A CLIENT_ERROR line is a complete, terminal reply — the socket is fine
    // and the connection must stay reusable (not over-eagerly destroyed).
    const clientError = (_cmd: string): Uint8Array =>
      enc.encode('CLIENT_ERROR cannot increment non-numeric value\r\n');
    const engine = new StubMemcachedEngine(
      'mc-clean-err',
      { host: 'x', pool: { max: 1 } },
      [clientError],
    );
    await engine.connect();

    await asserts.assertRejects(() => engine.incr('k'), EngineError);
    asserts.assertStrictEquals(engine.poolStats.idle, 1);
    asserts.assertStrictEquals(engine.conns[0]!.closed, false);

    await engine.disconnect();
  });
});

// Round-4 finding #1: the round-3 poison tracking only covered a *clean* EOF
// (`read()` resolving `null`) and the malformed-frame branches. A `read()` or
// `write()` that REJECTS — what compat's `wrapNodeSocket` does forever after a
// TCP RST, and what Deno's native read does on ConnectionReset — escaped
// `__request` / `__readValue` with the connection un-flagged, so `__release`
// pushed the corpse back to idle and `_validateResource` (`!__broken.has`)
// waved it through on every later acquire. With the default single-connection
// pool that is a permanent outage from one transient reset.
//
// These drive the real engine + real pool over a fake transport; only
// `_createResource` is stubbed.
describe('drivers.MemcachedEngine - transport-reject poisoning (offline)', () => {
  const enc = new TextEncoder();
  const genuine = (_cmd: string): Uint8Array =>
    enc.encode('VALUE k 0 8\r\nGENUINE!\r\nEND\r\n');

  it('destroys a connection whose read rejected (ECONNRESET), then heals', async () => {
    const rst = (_cmd: string): ScriptReply => 'RST';
    const engine = new StubMemcachedEngine(
      'mc-rst-read',
      { host: 'x', pool: { max: 1 } },
      [rst, genuine],
    );
    await engine.connect();

    await asserts.assertRejects(() => engine.get('k'));

    // The corpse must NOT be sitting in the idle list.
    asserts.assertStrictEquals(engine.poolStats.idle, 0);
    asserts.assertStrictEquals(engine.poolStats.total, 0);
    asserts.assertStrictEquals(engine.conns[0]!.closed, true);

    // …and the very next call gets a fresh connection that works.
    asserts.assertStrictEquals(await engine.get('k'), 'GENUINE!');
    asserts.assertStrictEquals(engine.conns.length, 2);

    await engine.disconnect();
  });

  it('destroys a connection whose write rejected (ECONNRESET), then heals', async () => {
    const rst = (_cmd: string): ScriptReply => 'RST_WRITE';
    const engine = new StubMemcachedEngine(
      'mc-rst-write',
      { host: 'x', pool: { max: 1 } },
      [rst, genuine],
    );
    await engine.connect();

    await asserts.assertRejects(() => engine.get('k'));
    asserts.assertStrictEquals(engine.poolStats.idle, 0);
    asserts.assertStrictEquals(engine.conns[0]!.closed, true);

    asserts.assertStrictEquals(await engine.get('k'), 'GENUINE!');
    await engine.disconnect();
  });

  it('destroys a reset connection on the line-based (__request) path too', async () => {
    // `get`/`gets` go through `__readValue`; every other command goes through
    // `__request`. Both read the socket, so both need the guard.
    const rst = (_cmd: string): ScriptReply => 'RST';
    const stored = (_cmd: string): Uint8Array => enc.encode('STORED\r\n');
    const engine = new StubMemcachedEngine(
      'mc-rst-request',
      { host: 'x', pool: { max: 1 } },
      [rst, stored],
    );
    await engine.connect();

    await asserts.assertRejects(() => engine.set('k', 'v', 30));
    asserts.assertStrictEquals(engine.poolStats.idle, 0);
    asserts.assertStrictEquals(engine.conns[0]!.closed, true);

    asserts.assertStrictEquals(await engine.set('k', 'v', 30), true);
    await engine.disconnect();
  });

  it('does not recycle a reset connection under the default single-connection pool', async () => {
    // No `pool` option = SINGLE_CONNECTION_POOL (min 1 / max 1 / never
    // evict): the dead socket is the only slot, so recycling it means the
    // engine never recovers. This is the reported reproduction scenario.
    const rst = (_cmd: string): ScriptReply => 'RST';
    const engine = new StubMemcachedEngine(
      'mc-rst-default-pool',
      { host: 'x' },
      [rst, genuine],
    );
    await engine.connect();

    await asserts.assertRejects(() => engine.get('k'));
    asserts.assertStrictEquals(engine.conns[0]!.closed, true);

    // Recovers on the retry instead of failing forever on the same corpse.
    asserts.assertStrictEquals(await engine.get('k'), 'GENUINE!');
    asserts.assertStrictEquals(engine.conns.length, 2);

    await engine.disconnect();
  });

  it('does not recycle a connection reset during ping()', async () => {
    // `BaseEngine.ping()` releases through `_release` (not the engine's
    // destroy-on-poison `__release`), so idle-list validation is the only
    // thing standing between a reset socket and the next command.
    const rst = (_cmd: string): ScriptReply => 'RST';
    const engine = new StubMemcachedEngine(
      'mc-rst-ping',
      { host: 'x', pool: { max: 1 } },
      [rst, genuine],
    );
    await engine.connect();

    asserts.assertStrictEquals(await engine.ping(), false);
    // Whether it was destroyed on release or rejected at validation, the next
    // acquire must not hand the corpse back out.
    asserts.assertStrictEquals(await engine.get('k'), 'GENUINE!');
    asserts.assertStrictEquals(engine.conns[0]!.closed, true);

    await engine.disconnect();
  });
});
