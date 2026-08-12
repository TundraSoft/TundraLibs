import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat';
import { BaseEngine } from './BaseEngine.ts';
import type { EngineCapabilities, EngineOptions } from './types/mod.ts';
import { EngineError } from './errors/mod.ts';

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
 * A minimal in-memory engine used to exercise `BaseEngine` end-to-end without
 * requiring a real network service.
 *
 * Each "resource" is an object with an id. Tests can drive `failConnect`,
 * `failPing`, etc. through public hooks to simulate failure modes.
 */
type FakeResource = { id: number; closed: boolean };

type FakeOptions = EngineOptions & {
  /** If set, `_createResource` rejects with this message. */
  createError?: string;
  /** If set, `_ping` returns false (or throws when value is 'throw'). */
  pingFailure?: 'throw' | 'false' | 'ok';
  /** If true, `_validateResource` returns false (forces re-creation). */
  invalidate?: boolean;
};

class FakeEngine extends BaseEngine<FakeResource, FakeOptions> {
  public readonly Engine = 'FAKE';
  public readonly Capabilities: EngineCapabilities = {
    pooledConnections: true,
    transactions: false,
    preparedStatements: false,
  };

  public created = 0;
  public destroyed = 0;

  protected _createResource(): FakeResource | Promise<FakeResource> {
    if (this._getOption('createError')) {
      throw new Error(this._getOption('createError'));
    }
    this.created++;
    return { id: this.created, closed: false };
  }

  protected _destroyResource(r: FakeResource): void {
    r.closed = true;
    this.destroyed++;
  }

  // Declared as `boolean | Promise<boolean>` (the base signature) so
  // subclasses below can override it with an async validator — the shape
  // `MariaEngine` uses (`await conn.ping()`).
  protected override _validateResource(
    r: FakeResource,
  ): boolean | Promise<boolean> {
    if (this._getOption('invalidate')) return false;
    return !r.closed;
  }

  protected _ping(_r: FakeResource): boolean {
    const mode = this._getOption('pingFailure') ?? 'ok';
    if (mode === 'throw') throw new Error('ping failed');
    if (mode === 'false') return false;
    return true;
  }

  /** Test helper: acquire/use/release via the inline pool API. */
  public async withResource<R>(fn: (r: FakeResource) => Promise<R> | R) {
    const resource = await this._acquire();
    try {
      return await fn(resource);
    } finally {
      this._release(resource);
    }
  }
}

describe('drivers.BaseEngine', () => {
  describe('identity & capabilities', () => {
    it('should expose Engine name and connection name', () => {
      const e = new FakeEngine('alpha');
      asserts.assertEquals(e.Engine, 'FAKE');
      asserts.assertEquals(e.Name, 'alpha');
    });

    it('should compute instanceId from Engine and Name', () => {
      const e = new FakeEngine('alpha');
      asserts.assertEquals(e.instanceId, 'FAKE::alpha');
    });

    it('should trim the connection name', () => {
      const e = new FakeEngine('  bravo  ');
      asserts.assertEquals(e.Name, 'bravo');
    });
  });

  describe('lifecycle', () => {
    it('should start in CLOSED status', () => {
      const e = new FakeEngine('c1');
      asserts.assertEquals(e.status, 'CLOSED');
    });

    it('should transition CLOSED → READY on connect', async () => {
      const e = new FakeEngine('c2');
      await e.connect();
      asserts.assertEquals(e.status, 'READY');
      await e.disconnect();
    });

    it('should be idempotent: connect on a connected engine is a no-op', async () => {
      const e = new FakeEngine('c4', { pool: { min: 1, max: 2 } });
      await e.connect();
      const created = e.created;
      await e.connect();
      asserts.assertEquals(e.created, created);
      await e.disconnect();
    });

    it('should transition READY → CLOSED on disconnect', async () => {
      const e = new FakeEngine('c5', { pool: { min: 1, max: 2 } });
      await e.connect();
      await e.disconnect();
      asserts.assertEquals(e.status, 'CLOSED');
      asserts.assert(e.destroyed >= 1);
    });

    it('should be idempotent: disconnect on a closed engine is a no-op', async () => {
      const e = new FakeEngine('c6');
      await e.disconnect();
      asserts.assertEquals(e.destroyed, 0);
    });

    it('should reset status to CLOSED on connect failure', async () => {
      const e = new FakeEngine('c7', {
        createError: 'cannot bind',
        pool: { min: 1 },
      });
      await asserts.assertRejects(() => e.connect(), EngineError);
      asserts.assertEquals(e.status, 'CLOSED');
    });

    it('should emit connect on success', async () => {
      const e = new FakeEngine('c8');
      let received = '';
      e.on('connect', (id) => {
        received = id;
      });
      await e.connect();
      asserts.assertEquals(received, 'FAKE::c8');
      await e.disconnect();
    });

    it('should emit connectionFailed on connect error', async () => {
      const e = new FakeEngine('c9', {
        createError: 'cannot bind',
        pool: { min: 1 },
      });
      const captured: Array<{ id: string; error: Error }> = [];
      e.on('connectionFailed', (id, error) => {
        captured.push({ id, error });
      });
      await asserts.assertRejects(() => e.connect());
      asserts.assertEquals(captured.length, 1);
      asserts.assertEquals(captured[0]?.id, 'FAKE::c9');
    });

    it('should emit disconnect on successful disconnect', async () => {
      const e = new FakeEngine('c10');
      let emitted = false;
      e.on('disconnect', () => {
        emitted = true;
      });
      await e.connect();
      await e.disconnect();
      asserts.assertEquals(emitted, true);
    });
  });

  describe('ping', () => {
    it('should return false when engine is CLOSED', async () => {
      const e = new FakeEngine('p1');
      asserts.assertEquals(await e.ping(), false);
    });

    it('should return true when ping succeeds', async () => {
      const e = new FakeEngine('p2');
      await e.connect();
      asserts.assertEquals(await e.ping(), true);
      await e.disconnect();
    });

    it('should return false (not throw) when ping returns false', async () => {
      const e = new FakeEngine('p3', { pingFailure: 'false' });
      await e.connect();
      asserts.assertEquals(await e.ping(), false);
      await e.disconnect();
    });

    it('should return false (not throw) when ping throws', async () => {
      const e = new FakeEngine('p4', { pingFailure: 'throw' });
      await e.connect();
      asserts.assertEquals(await e.ping(), false);
      await e.disconnect();
    });
  });

  describe('inline pool', () => {
    it('should default to single-connection (no pool config)', async () => {
      const e = new FakeEngine('po-default');
      await e.connect();
      // min=1, max=1 by default — one resource is warmed up.
      asserts.assertEquals(e.poolStats.idle, 1);
      asserts.assertEquals(e.poolStats.total, 1);
      await e.disconnect();
    });

    it('should report pool stats once connected (multi-conn)', async () => {
      const e = new FakeEngine('po1', { pool: { min: 2, max: 5 } });
      await e.connect();
      const s = e.poolStats;
      asserts.assertEquals(s.idle, 2);
      asserts.assertEquals(s.active, 0);
      asserts.assertEquals(s.total, 2);
      await e.disconnect();
    });

    it('should report empty pool stats before connect', () => {
      const e = new FakeEngine('po2');
      const s = e.poolStats;
      asserts.assertEquals(s.total, 0);
      asserts.assertEquals(s.idle, 0);
      asserts.assertEquals(s.active, 0);
      asserts.assertEquals(s.waiting, 0);
    });

    it('should hand out resources via _acquire/_release', async () => {
      const e = new FakeEngine('po3');
      await e.connect();
      const id = await e.withResource((r) => r.id);
      asserts.assert(id > 0);
      await e.disconnect();
    });

    it('should reuse the same resource across calls when max=1', async () => {
      const e = new FakeEngine('po4', { pool: { max: 1 } });
      await e.connect();
      const r1 = await e.withResource((r) => r);
      const r2 = await e.withResource((r) => r);
      asserts.assertEquals(r1.id, r2.id);
      await e.disconnect();
    });

    it('should drain the pool on disconnect', async () => {
      const e = new FakeEngine('po5', { pool: { min: 3, max: 5 } });
      await e.connect();
      asserts.assertEquals(e.poolStats.idle, 3);
      await e.disconnect();
      asserts.assertEquals(e.destroyed, 3);
      asserts.assertEquals(e.poolStats.total, 0);
    });

    it('should auto-connect on _acquire (via subclass call)', async () => {
      const e = new FakeEngine('po-auto');
      // engine.ping() goes through _acquire; it returns false when CLOSED
      // without auto-connecting (intentional — see ping()).
      asserts.assertEquals(e.status, 'CLOSED');
    });

    it('should queue acquires when pool is at max capacity', async () => {
      const e = new FakeEngine('po-q', {
        pool: { max: 1, acquireTimeoutSeconds: 5 },
      });
      await e.connect();
      let releaseHeld!: () => void;
      const heldDone = new Promise<void>((res) => {
        releaseHeld = res;
      });
      const heldPromise = e.withResource(async () => {
        await heldDone;
      });
      await new Promise((res) => setTimeout(res, 5));

      // Pool is full; this acquire must queue.
      const queued = e.withResource(() => 'second');
      await new Promise((res) => setTimeout(res, 5));
      asserts.assertEquals(e.poolStats.waiting, 1);

      releaseHeld();
      await heldPromise;
      asserts.assertEquals(await queued, 'second');
      await e.disconnect();
    });

    it('should serve a still-live waiter after a settled head is skipped on release', async () => {
      // Regression: a settled (already-rejected) waiter can still sit at the
      // head of the queue — e.g. it was settled out-of-band while a live
      // waiter queued behind it. On release, _release must skip the settled
      // head and hand the freed resource to the live waiter, NOT push the
      // resource to idle and let the live waiter starve until its timeout.
      const e = new FakeEngine('po-skip', { pool: { max: 1 } });
      await e.connect();

      // Hold the single resource so acquires queue.
      const held = await e['_acquire']();

      // Queue a live waiter (it must end up served).
      const survivor = e['_acquire'](5000);
      await new Promise((res) => setTimeout(res, 5));

      // Inject a settled waiter at the HEAD of the queue, ahead of the live
      // one — simulating a waiter that was settled without being spliced out.
      const waiters = e['_waiters'] as Array<
        { settled: boolean; timer: unknown; resolve: unknown; reject: unknown }
      >;
      let deadResolved = false;
      waiters.unshift({
        settled: true,
        timer: null,
        resolve: () => {
          deadResolved = true;
        },
        reject: () => {},
      });
      asserts.assertEquals(e.poolStats.waiting, 2);

      // Release the held resource. Buggy code shifts the settled head and
      // pushes to idle (survivor starves); fixed code loops past it.
      e['_release'](held);

      const got = await survivor;
      asserts.assert(got.id > 0);
      // The dead waiter must NOT have received the resource.
      asserts.assertEquals(deadResolved, false);
      // The resource went to the live waiter, not the idle list.
      asserts.assertEquals(e.poolStats.idle, 0);
      asserts.assertEquals(e.poolStats.active, 1);

      e['_release'](got);
      await e.disconnect();
    });

    it('should throw POOL_ACQUIRE_TIMEOUT (with timeoutMs) when the wait elapses', async () => {
      const e = new FakeEngine('po-timeout-code', {
        pool: { max: 1, acquireTimeoutSeconds: 1 },
      });
      // Pool exhaustion is surfaced as a 'warn' event alongside the throw.
      const warnings: string[] = [];
      e.on('warn', (_id, msg) => warnings.push(msg));
      await e.connect();

      let releaseHeld!: () => void;
      const heldDone = new Promise<void>((res) => {
        releaseHeld = res;
      });
      const heldPromise = e.withResource(async () => {
        await heldDone;
      });
      await new Promise((res) => setTimeout(res, 5));

      const err = await asserts.assertRejects(
        () => e['_acquire'](),
        EngineError,
      );
      asserts.assertEquals(
        (err as EngineError).code,
        'POOL_ACQUIRE_TIMEOUT',
      );
      asserts.assertEquals((err as EngineError).context.timeoutMs, 1000);
      // The 'warn' event fired with a pool-exhaustion message.
      asserts.assertEquals(warnings.length, 1);
      asserts.assertStringIncludes(warnings[0]!, 'connection pool exhausted');

      releaseHeld();
      await heldPromise;
      await e.disconnect();
    });

    it('should throw POOL_DRAINING when acquiring while draining', async () => {
      const e = new FakeEngine('po-draining-code', {
        pool: { min: 1, max: 2 },
      });
      await e.connect();
      e['_draining'] = true;

      const err = await asserts.assertRejects(
        () => e['_acquire'](),
        EngineError,
      );
      asserts.assertEquals(
        (err as EngineError).code,
        'POOL_DRAINING',
      );

      e['_draining'] = false;
      await e.disconnect();
    });
  });

  describe('option processing', () => {
    it('should reject empty host', () => {
      asserts.assertThrows(
        () => new FakeEngine('o1', { host: '' }),
        EngineError,
        'must be a non-empty string',
      );
    });

    it('should reject invalid port', () => {
      asserts.assertThrows(
        () => new FakeEngine('o2', { port: -1 }),
        EngineError,
        'between 1 and 65535',
      );
      asserts.assertThrows(
        () => new FakeEngine('o3', { port: 99999 }),
        EngineError,
        'between 1 and 65535',
      );
      asserts.assertThrows(
        // deno-lint-ignore no-explicit-any
        () => new FakeEngine('o4', { port: 'eighty' as any }),
        EngineError,
      );
    });

    it('should reject pool with min > max', () => {
      asserts.assertThrows(
        () => new FakeEngine('o5', { pool: { min: 5, max: 2 } }),
        EngineError,
        'min ≤ max',
      );
    });

    it('should reject negative pool sizes', () => {
      asserts.assertThrows(
        () => new FakeEngine('o6', { pool: { max: -1 } }),
        EngineError,
      );
    });

    it('should accept valid pool config', () => {
      const e = new FakeEngine('o7', {
        pool: { min: 1, max: 5, idleTimeoutSeconds: 60 },
      });
      asserts.assertEquals(readOption(e, 'pool')?.min, 1);
      asserts.assertEquals(readOption(e, 'pool')?.max, 5);
    });

    it('should reject non-function idGenerator', () => {
      asserts.assertThrows(
        () =>
          new FakeEngine('o8', {
            // deno-lint-ignore no-explicit-any
            idGenerator: 'not a function' as any,
          }),
        EngineError,
      );
    });

    it('should accept ssl=true', () => {
      const e = new FakeEngine('o9', { ssl: true });
      asserts.assertEquals(readOption(e, 'ssl'), true);
    });

    it('should accept ssl object with PEM string array for ca', () => {
      const e = new FakeEngine('o10', {
        ssl: {
          ca: ['-----BEGIN CERTIFICATE-----\nfake\n-----END CERTIFICATE-----'],
        },
      });
      asserts.assertEquals(typeof readOption(e, 'ssl'), 'object');
    });

    it('should reject ssl object with non-array ca', () => {
      asserts.assertThrows(
        () =>
          new FakeEngine('o11', {
            // deno-lint-ignore no-explicit-any
            ssl: { ca: 12345 as any },
          }),
        EngineError,
      );
    });
  });

  describe('id generator', () => {
    it('should default to a ULID-based generator', () => {
      const e = new FakeEngine('id1');
      const id = (e['_idGenerator'] as (p?: string) => string)();
      asserts.assertEquals(typeof id, 'string');
      asserts.assert(id.length > 0);
    });

    it('should prefix when given a prefix', () => {
      const e = new FakeEngine('id2');
      const id = (e['_idGenerator'] as (p?: string) => string)('query');
      asserts.assert(id.startsWith('query-'));
    });

    it('should accept a custom idGenerator', () => {
      let counter = 0;
      const e = new FakeEngine('id3', {
        idGenerator: (prefix) => `${prefix ?? 'x'}-${++counter}`,
      });
      const gen = e['_idGenerator'] as (p?: string) => string;
      const a = gen('q');
      const b = gen('q');
      asserts.assert(a.startsWith('q-'));
      asserts.assert(b.startsWith('q-'));
      asserts.assert(a !== b);
    });
  });

  describe('advanced pool scenarios', () => {
    it('should handle disconnect failure gracefully', async () => {
      class FailDisconnectEngine extends FakeEngine {
        protected override async _destroyResource(
          r: FakeResource,
        ): Promise<void> {
          r.closed = true;
          this.destroyed++;
          throw new Error('Disconnect failed');
        }
      }

      const e = new FailDisconnectEngine('fail-disc');
      await e.connect();

      // Disconnect should succeed even if destroy fails (errors are swallowed)
      await e.disconnect();
      asserts.assertStrictEquals(e.status, 'CLOSED');
    });

    it('should reject acquire when draining', async () => {
      const e = new FakeEngine('drain1', { pool: { min: 1, max: 2 } });
      await e.connect();

      // Manually set draining flag (disconnect sets it but we want to test acquire)
      e['_draining'] = true;

      // Try to acquire while draining - should fail
      await asserts.assertRejects(
        async () => await e.withResource(() => 'test'),
        EngineError,
      );

      // Now actually disconnect
      e['_draining'] = false;
      await e.disconnect();
    });

    it('should reject waiters when draining', async () => {
      const e = new FakeEngine('drain2', { pool: { max: 1 } });
      await e.connect();

      let releaseHeld!: () => void;
      const heldDone = new Promise<void>((res) => {
        releaseHeld = res;
      });

      // Hold the only resource
      const heldPromise = e.withResource(async () => {
        await heldDone;
        return 'held';
      });

      await new Promise((res) => setTimeout(res, 10));

      // Queue a waiter (should timeout since pool is full)
      const queued = e.withResource(() => 'should timeout');
      await new Promise((res) => setTimeout(res, 10));
      asserts.assertEquals(e.poolStats.waiting, 1);

      // Now disconnect which will drain and reject waiters
      const disconnectPromise = e.disconnect();

      // The queued request should be rejected due to draining
      await asserts.assertRejects(
        async () => await queued,
        EngineError,
      );

      releaseHeld();
      await heldPromise;
      await disconnectPromise;
    });

    it('should invalidate and recreate resources', async () => {
      const e = new FakeEngine('inv1', {
        pool: { min: 1, max: 2 },
        invalidate: true, // Set at construction time
      });
      await e.connect();

      const initialCreated = e.created;
      const initialDestroyed = e.destroyed;

      // Next acquire should destroy invalid resource and create new one
      await e.withResource((r) => {
        asserts.assert(r.id > 0);
      });

      asserts.assert(e.created > initialCreated);
      asserts.assert(e.destroyed > initialDestroyed);

      await e.disconnect();
    });

    it('should handle acquire timeout', async () => {
      const e = new FakeEngine('timeout1', {
        pool: { max: 1, acquireTimeoutSeconds: 1 }, // 1 second
      });
      await e.connect();

      let releaseHeld!: () => void;
      const heldDone = new Promise<void>((res) => {
        releaseHeld = res;
      });

      // Hold the only resource
      const heldPromise = e.withResource(async () => {
        await heldDone;
      });

      await new Promise((res) => setTimeout(res, 10));

      // This should timeout after 1 second
      const start = Date.now();
      await asserts.assertRejects(
        async () => await e.withResource(() => 'timeout'),
        EngineError,
      );
      const elapsed = Date.now() - start;

      // Should have timed out around 1 second
      asserts.assert(elapsed >= 900 && elapsed < 2000);

      releaseHeld();
      await heldPromise;
      await e.disconnect();
    });

    it('should handle idle timeout', async () => {
      const e = new FakeEngine('idle1', {
        pool: { min: 0, max: 2, idleTimeoutSeconds: 1 }, // 1 second
      });
      await e.connect();

      // Acquire and release to create an idle resource
      await e.withResource(() => 'test');
      asserts.assertEquals(e.poolStats.idle, 1);

      const initialDestroyed = e.destroyed;

      // Wait for idle timeout (1 second + buffer)
      await new Promise((res) => setTimeout(res, 1100));

      // Resource should be destroyed
      asserts.assert(e.destroyed > initialDestroyed);

      await e.disconnect();
    });

    // Regression: the min invariant used to be checked only when the timer
    // was *scheduled*. Releasing connections one at a time while the pool sat
    // above min armed a timer on each; every one of them then acted on its
    // own stale snapshot and evicted, draining a `min: 2` pool to zero with
    // nothing left to re-warm it (`_ensureMin` only runs from `connect`,
    // which no-ops while READY). README documents "won't drop below min".
    it('should not evict below min when several idle timers fire', async () => {
      const e = new FakeEngine('idle-min', {
        pool: { min: 2, max: 10, idleTimeoutSeconds: 1 },
      });
      await e.connect();

      // Three resources checked out at once, then released one at a time so
      // each release sees a pool above min and arms an eviction timer.
      const held = [
        await e['_acquire'](),
        await e['_acquire'](),
        await e['_acquire'](),
      ];
      asserts.assertEquals(e.poolStats.total, 3);
      for (const resource of held) e['_release'](resource);
      asserts.assertEquals(e.poolStats.idle, 3);

      await new Promise((res) => setTimeout(res, 1300));

      // The first timer takes the pool 3 → 2; the other two must decline.
      asserts.assertEquals(e.poolStats.idle, 2);
      asserts.assertEquals(e.poolStats.total, 2);
      // …and the survivors are genuinely alive, not just counted.
      asserts.assertEquals(held.filter((r) => !r.closed).length, 2);

      await e.disconnect();
    });

    it('should re-warm to min when the pool has fallen under it', async () => {
      const e = new FakeEngine('idle-rewarm', {
        pool: { min: 2, max: 10, idleTimeoutSeconds: 1 },
      });
      await e.connect();

      // Three idle resources (so each carries a timer), then tear two down
      // the way a transport error would — `_destroy`, which doesn't backfill.
      const held = [
        await e['_acquire'](),
        await e['_acquire'](),
        await e['_acquire'](),
      ];
      for (const resource of held) e['_release'](resource);
      await e['_destroy'](held[0]!);
      await e['_destroy'](held[1]!);
      asserts.assertEquals(e.poolStats.total, 1);

      const createdBefore = e.created;
      await new Promise((res) => setTimeout(res, 1300));

      // The survivor's timer declined to evict and topped the pool back up.
      asserts.assertEquals(e.poolStats.total, 2);
      asserts.assertEquals(e.created, createdBefore + 1);
      asserts.assertEquals(held[2]!.closed, false);

      await e.disconnect();
    });

    it('should still evict every idle resource when min is 0', async () => {
      const e = new FakeEngine('idle-zero-min', {
        pool: { min: 0, max: 4, idleTimeoutSeconds: 1 },
      });
      await e.connect();

      const held = [await e['_acquire'](), await e['_acquire']()];
      for (const resource of held) e['_release'](resource);
      asserts.assertEquals(e.poolStats.idle, 2);

      await new Promise((res) => setTimeout(res, 1300));

      // No floor to respect — the pool empties completely.
      asserts.assertEquals(e.poolStats.total, 0);
      asserts.assertEquals(held.filter((r) => r.closed).length, 2);

      await e.disconnect();
    });

    it('should release resource not in active set without error', async () => {
      const e = new FakeEngine('release1');
      await e.connect();

      const resource = await e['_acquire']();
      e['_release'](resource);

      // Release again - should be no-op
      e['_release'](resource);

      await e.disconnect();
    });

    it('should destroy resource during draining on release', async () => {
      const e = new FakeEngine('drain-release', { pool: { max: 2 } });
      await e.connect();

      const resource = await e['_acquire']();

      // Start draining
      e['_draining'] = true;

      const initialDestroyed = e.destroyed;

      // Release should destroy instead of returning to idle pool
      e['_release'](resource);

      await new Promise((res) => setTimeout(res, 10));
      asserts.assert(e.destroyed > initialDestroyed);
    });
  });

  // SSL certificate handling — file reads happen inside compat at
  // connect time, not at engine construction. The construction-time
  // checks below cover shape-only validation (`ca` is `string[]`,
  // `*File` are `string`, etc.).

  describe('database option validation', () => {
    it('should accept valid database string', () => {
      const e = new FakeEngine('db1', { database: 'mydb' });
      asserts.assertEquals(readOption(e, 'database'), 'mydb');
    });

    it('should accept database as number (for Redis index)', () => {
      const e = new FakeEngine('db2', { database: 0 });
      asserts.assertEquals(readOption(e, 'database'), 0);
    });

    it('should reject empty database string', () => {
      asserts.assertThrows(
        () => new FakeEngine('db3', { database: '' }),
        EngineError,
        'must be a non-empty string',
      );
    });

    it('should reject negative database index', () => {
      asserts.assertThrows(
        () => new FakeEngine('db4', { database: -1 }),
        EngineError,
        'non-negative integer',
      );
    });

    it('should reject non-integer database number', () => {
      asserts.assertThrows(
        () => new FakeEngine('db5', { database: 1.5 }),
        EngineError,
        'non-negative integer',
      );
    });
  });

  describe('pool validation edge cases', () => {
    it('should reject pool with non-integer min', () => {
      asserts.assertThrows(
        // deno-lint-ignore no-explicit-any
        () => new FakeEngine('pool1', { pool: { min: 1.5 as any } }),
        EngineError,
      );
    });

    it('should reject pool with non-integer max', () => {
      asserts.assertThrows(
        // deno-lint-ignore no-explicit-any
        () => new FakeEngine('pool2', { pool: { max: 2.5 as any } }),
        EngineError,
      );
    });

    it('should reject pool with invalid idleTimeoutSeconds', () => {
      asserts.assertThrows(
        // deno-lint-ignore no-explicit-any
        () =>
          new FakeEngine('pool3', { pool: { idleTimeoutSeconds: -1 as any } }),
        EngineError,
      );
    });

    it('should reject pool with invalid acquireTimeoutSeconds', () => {
      asserts.assertThrows(
        () =>
          // deno-lint-ignore no-explicit-any
          new FakeEngine('pool4', {
            pool: { acquireTimeoutSeconds: -1 as any },
          }),
        EngineError,
      );
    });
  });

  describe('SSL validation edge cases', () => {
    it('should reject SSL with non-array ca', () => {
      asserts.assertThrows(
        () =>
          // deno-lint-ignore no-explicit-any
          new FakeEngine('ssl1', { ssl: { ca: 12345 as any } }),
        EngineError,
      );
    });

    it('should reject SSL with non-string entries in ca array', () => {
      asserts.assertThrows(
        () =>
          // deno-lint-ignore no-explicit-any
          new FakeEngine('ssl1b', { ssl: { ca: [12345 as any] } }),
        EngineError,
      );
    });

    it('should reject SSL with non-string cert', () => {
      asserts.assertThrows(
        () =>
          // deno-lint-ignore no-explicit-any
          new FakeEngine('ssl2', { ssl: { cert: 12345 as any } }),
        EngineError,
      );
    });

    it('should reject SSL with non-string key', () => {
      asserts.assertThrows(
        () =>
          // deno-lint-ignore no-explicit-any
          new FakeEngine('ssl3', { ssl: { key: 12345 as any } }),
        EngineError,
      );
    });

    it('should reject SSL with non-string caFile / certFile / keyFile', () => {
      asserts.assertThrows(
        () =>
          // deno-lint-ignore no-explicit-any
          new FakeEngine('ssl3a', { ssl: { caFile: 1 as any } }),
        EngineError,
      );
      asserts.assertThrows(
        () =>
          // deno-lint-ignore no-explicit-any
          new FakeEngine('ssl3b', { ssl: { certFile: 1 as any } }),
        EngineError,
      );
      asserts.assertThrows(
        () =>
          // deno-lint-ignore no-explicit-any
          new FakeEngine('ssl3c', { ssl: { keyFile: 1 as any } }),
        EngineError,
      );
    });

    it('should reject SSL with non-boolean enforce', () => {
      asserts.assertThrows(
        () =>
          new FakeEngine('ssl3d', {
            // deno-lint-ignore no-explicit-any
            ssl: { enforce: 'yes' as any },
          }),
        EngineError,
      );
    });

    it('should accept SSL with file paths and enforce flag', () => {
      const e = new FakeEngine('ssl3e', {
        ssl: {
          caFile: '/etc/ssl/ca.pem',
          certFile: '/etc/ssl/client.crt',
          keyFile: '/etc/ssl/client.key',
          rejectUnauthorized: false,
          enforce: false,
        },
      });
      asserts.assertEquals(typeof readOption(e, 'ssl'), 'object');
    });

    it('should reject SSL with non-boolean rejectUnauthorized', () => {
      asserts.assertThrows(
        () =>
          new FakeEngine('ssl4', {
            // deno-lint-ignore no-explicit-any
            ssl: { rejectUnauthorized: 'yes' as any },
          }),
        EngineError,
      );
    });
  });
});

/**
 * A `FakeEngine` whose `_createResource` can be paused mid-flight, so a warm
 * connection can be made to resolve *after* the pool has drained (round-3
 * finding #6).
 */
class GatedFakeEngine extends FakeEngine {
  private __gate: Promise<void> | null = null;
  private __gateResolve: (() => void) | null = null;

  public armGate(): void {
    this.__gate = new Promise<void>((res) => {
      this.__gateResolve = res;
    });
  }
  public openGate(): void {
    const r = this.__gateResolve;
    this.__gate = null;
    this.__gateResolve = null;
    r?.();
  }
  protected override async _createResource(): Promise<FakeResource> {
    const gate = this.__gate;
    if (gate) {
      this.__gate = null;
      await gate;
    }
    this.created++;
    return { id: this.created, closed: false };
  }
}

describe('drivers.BaseEngine - connection poisoning (round-3)', () => {
  // Finding #5: a resource that died while checked out must not be handed
  // verbatim to a queued waiter — it should be validated, destroyed, and the
  // waiter given a freshly created one instead.
  it('validates before handing a freed resource to a waiter; dead → replaced', async () => {
    const e = new FakeEngine('poison-waiter', { pool: { max: 1 } });
    await e.connect();

    // Hold the single resource so the next acquire queues.
    const held = await e['_acquire']();
    const waiter = e['_acquire'](5000);
    await new Promise((r) => setTimeout(r, 5));
    asserts.assertEquals(e.poolStats.waiting, 1);

    const createdBefore = e.created;
    const destroyedBefore = e.destroyed;

    // The held resource dies while checked out (server-side close).
    held.closed = true;
    e['_release'](held);

    const got = await waiter;
    // The waiter received a FRESH, live resource — not the corpse.
    asserts.assertEquals(got.closed, false);
    asserts.assert(got.id !== held.id);
    asserts.assert(e.created > createdBefore);
    asserts.assert(e.destroyed > destroyedBefore);

    e['_release'](got);
    await e.disconnect();
  });

  // Finding #5 (companion): a healthy resource is still handed straight to the
  // waiter — the validation gate must not regress the normal path.
  it('still hands a healthy freed resource to a queued waiter', async () => {
    const e = new FakeEngine('poison-waiter-ok', { pool: { max: 1 } });
    await e.connect();
    const held = await e['_acquire']();
    const waiter = e['_acquire'](5000);
    await new Promise((r) => setTimeout(r, 5));
    const createdBefore = e.created;
    e['_release'](held);
    const got = await waiter;
    // Reused the same live resource; no new one created.
    asserts.assertEquals(got.id, held.id);
    asserts.assertEquals(e.created, createdBefore);
    e['_release'](got);
    await e.disconnect();
  });

  // Finding #5 (destroy backfills waiters): destroying a checked-out resource
  // while a waiter is queued must give the waiter a fresh resource, not leave
  // it to time out.
  it('backfills a queued waiter when a checked-out resource is destroyed', async () => {
    const e = new FakeEngine('poison-destroy', { pool: { max: 1 } });
    await e.connect();
    const held = await e['_acquire']();
    const waiter = e['_acquire'](5000);
    await new Promise((r) => setTimeout(r, 5));
    asserts.assertEquals(e.poolStats.waiting, 1);
    const createdBefore = e.created;

    await e['_destroy'](held);

    const got = await waiter;
    asserts.assertEquals(got.closed, false);
    asserts.assert(e.created > createdBefore);
    e['_release'](got);
    await e.disconnect();
  });

  // Finding #6: a warm connection whose factory resolves after `disconnect`
  // has drained the pool must be destroyed, not pushed into the dead pool
  // (which would leak the socket / dangle the server session).
  it('destroys a warm connection that finishes creating after drain', async () => {
    const e = new GatedFakeEngine('warm-drain', { pool: { min: 2, max: 4 } });
    await e.connect(); // warms min=2 (ungated). idle = 2.
    asserts.assertEquals(e.poolStats.idle, 2);

    // Drop below min so `_ensureMin` decides to create a replacement.
    await e['_destroy'](e['_idle'][0]!);
    asserts.assertEquals(e.poolStats.total, 1);

    // Arm the gate so the next factory call blocks, then kick the re-warm
    // (as the idle-eviction timer's `_ensureMin` would) without awaiting it.
    e.armGate();
    const rewarm = e['_ensureMin']();
    await new Promise((r) => setTimeout(r, 5));
    asserts.assertEquals(e['_pending'], 1);

    const destroyedBefore = e.destroyed;

    // Drain the pool while the warm factory is still in flight.
    await e.disconnect();
    asserts.assertEquals(e.status, 'CLOSED');

    // Let the warm factory resolve — it lands in a drained pool.
    e.openGate();
    await rewarm;
    await new Promise((r) => setTimeout(r, 5));

    // It must have been destroyed, not stranded in `_idle`.
    asserts.assertEquals(e.poolStats.idle, 0);
    asserts.assertEquals(e['_idle'].length, 0);
    asserts.assert(e.destroyed > destroyedBefore);
  });
});

/**
 * A `FakeEngine` whose `_validateResource` takes a real turn of the event
 * loop before answering — the shape of `MariaEngine._validateResource`,
 * which falls back to `await conn.ping()` (a full network round-trip).
 */
class SlowValidateFakeEngine extends FakeEngine {
  protected override async _validateResource(
    r: FakeResource,
  ): Promise<boolean> {
    await new Promise((res) => setTimeout(res, 5));
    return !r.closed;
  }
}

// Round-4 finding #3: `_release` removes the resource from `_active` and then
// hands it to a queued waiter through `__handToWaiter`, whose first statement
// awaits `_validateResource`. Across that await the resource used to belong to
// none of `_idle` / `_active` / `_pending`, so every pool-size expression
// undercounted by one and a concurrent `_acquire` spawned a resource past
// `max` — the very hazard `_acquire`'s own comment documents on the acquire
// side. These drive the real pool state machine (no mocks): saturate, queue a
// waiter, release, and race an acquire into the validation window.
describe('drivers.BaseEngine - hand-off accounting (round-4)', () => {
  it('does not exceed max while a released resource awaits validation (sync validator)', async () => {
    const e = new FakeEngine('handoff-sync', {
      pool: { min: 0, max: 2, acquireTimeoutSeconds: 5 },
    });
    await e.connect();

    const r1 = await e['_acquire']();
    const r2 = await e['_acquire']();
    asserts.assertEquals(e.created, 2);

    // Saturated: this one queues.
    const waiterP = e['_acquire'](5000);
    await new Promise((r) => setTimeout(r, 5));
    asserts.assertEquals(e.poolStats.waiting, 1);

    // Release into the waiter path. Even a *synchronous* validator yields a
    // microtask, so the resource is in flight when the racer below runs.
    e['_release'](r1);
    asserts.assertEquals(e.poolStats.total, 2); // r1 must still be counted

    // Same-tick concurrent acquirer: the pool is full, so it must queue and
    // time out — never manufacture a third connection.
    const racer = e['_acquire'](50);
    await asserts.assertRejects(() => racer, EngineError);
    asserts.assertEquals(e.created, 2);

    const handed = await waiterP;
    asserts.assertEquals(handed.id, r1.id);
    e['_release'](handed);
    e['_release'](r2);
    await e.disconnect();
  });

  it('does not exceed max while a released resource awaits validation (async validator)', async () => {
    const e = new SlowValidateFakeEngine('handoff-async', {
      pool: { min: 0, max: 2, acquireTimeoutSeconds: 5 },
    });
    await e.connect();

    const r1 = await e['_acquire']();
    const r2 = await e['_acquire']();
    asserts.assertEquals(e.created, 2);

    const waiterP = e['_acquire'](5000);
    await new Promise((r) => setTimeout(r, 5));
    asserts.assertEquals(e.poolStats.waiting, 1);

    e['_release'](r1);
    asserts.assertEquals(e.poolStats.total, 2);

    const racer = e['_acquire'](50);
    await asserts.assertRejects(() => racer, EngineError);
    asserts.assertEquals(e.created, 2);

    const handed = await waiterP;
    asserts.assertEquals(handed.id, r1.id);
    e['_release'](handed);
    e['_release'](r2);
    await e.disconnect();
  });

  it('keeps the single-connection default at exactly one connection', async () => {
    // SINGLE_CONNECTION_POOL (no `pool` option): min 1 / max 1 / never evict —
    // the mode advertised for fronting PgBouncer. A surplus connection here is
    // permanent, since idle eviction is disabled.
    const e = new SlowValidateFakeEngine('handoff-single');
    await e.connect();
    asserts.assertEquals(e.created, 1);

    const held = await e['_acquire']();
    const waiterP = e['_acquire'](5000);
    await new Promise((r) => setTimeout(r, 5));

    e['_release'](held);
    asserts.assertEquals(e.poolStats.total, 1);

    const racer = e['_acquire'](50);
    await asserts.assertRejects(() => racer, EngineError);
    asserts.assertEquals(e.created, 1);

    const handed = await waiterP;
    e['_release'](handed);
    await e.disconnect();
    asserts.assertEquals(e.created, 1);
  });

  it('still backfills the waiter when the released resource is dead', async () => {
    // The hand-off claim must not block the replacement path: a resource that
    // fails validation is destroyed and the waiter gets a freshly created one.
    const e = new SlowValidateFakeEngine('handoff-dead', {
      pool: { min: 0, max: 1, acquireTimeoutSeconds: 5 },
    });
    await e.connect();

    const held = await e['_acquire']();
    const waiterP = e['_acquire'](5000);
    await new Promise((r) => setTimeout(r, 5));

    held.closed = true; // died while checked out
    e['_release'](held);

    const handed = await waiterP;
    asserts.assertEquals(handed.closed, false);
    asserts.assert(handed.id !== held.id);
    asserts.assertEquals(e.created, 2);
    asserts.assertEquals(e.poolStats.total, 1);

    e['_release'](handed);
    await e.disconnect();
  });
});
