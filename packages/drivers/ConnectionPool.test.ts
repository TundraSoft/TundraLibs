import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat';
import {
  ConnectionPool,
  type ConnectionPoolOptions,
  validatePoolOptions,
} from './ConnectionPool.ts';
import { EngineError } from './errors/mod.ts';

/**
 * Direct unit tests for the standalone {@link ConnectionPool}. The pool's
 * race-critical behaviour is also exercised end-to-end through
 * `BaseEngine.test.ts` (the engine delegates to a pool); these cover the
 * extracted class's own public API — `acquire` / `release` / `destroy` /
 * `drain` / `ensureMin` / `size` / `stats` / `ping` plus the static
 * `resolveOptions` and the `validatePoolOptions` guard.
 */

type Res = { id: number; closed: boolean };

/** Build a pool with in-memory hooks and a handle on the call counters. */
function makePool(
  overrides: Partial<ConnectionPoolOptions<Res>> = {},
) {
  const state = {
    created: 0,
    destroyed: 0,
    invalid: false,
    warnings: [] as string[],
  };
  const pool = new ConnectionPool<Res>({
    min: 0,
    max: 2,
    idleTimeoutMs: 0,
    acquireTimeoutMs: 1000,
    instanceId: () => 'FAKE::pool',
    create: () => {
      state.created++;
      return { id: state.created, closed: false };
    },
    destroy: (r) => {
      r.closed = true;
      state.destroyed++;
    },
    validate: (r) => !state.invalid && !r.closed,
    ping: (r) => !r.closed,
    onWarn: (msg) => state.warnings.push(msg),
    ...overrides,
  });
  return { pool, state };
}

describe('drivers.ConnectionPool', () => {
  describe('resolveOptions', () => {
    it('should default to single-connection when no pool option is given', () => {
      asserts.assertEquals(ConnectionPool.resolveOptions(undefined), {
        min: 1,
        max: 1,
        idleTimeoutMs: 0,
        acquireTimeoutMs: 30_000,
      });
    });

    it('should merge multi-connection defaults for a partial pool option', () => {
      asserts.assertEquals(ConnectionPool.resolveOptions({ max: 5 }), {
        min: 0,
        max: 5,
        idleTimeoutMs: 180_000,
        acquireTimeoutMs: 30_000,
      });
    });

    it('should convert second-based knobs to milliseconds', () => {
      const r = ConnectionPool.resolveOptions({
        min: 2,
        max: 4,
        idleTimeoutSeconds: 30,
        acquireTimeoutSeconds: 10,
      });
      asserts.assertEquals(r.idleTimeoutMs, 30_000);
      asserts.assertEquals(r.acquireTimeoutMs, 10_000);
    });
  });

  describe('validatePoolOptions', () => {
    it('should accept undefined and valid shapes', () => {
      asserts.assertEquals(validatePoolOptions(undefined), true);
      asserts.assertEquals(
        validatePoolOptions({ min: 1, max: 5, idleTimeoutSeconds: 60 }),
        true,
      );
    });

    it('should reject min > max, max < 1, and non-integers', () => {
      asserts.assertEquals(validatePoolOptions({ min: 5, max: 2 }), false);
      asserts.assertEquals(validatePoolOptions({ max: 0 }), false);
      asserts.assertEquals(validatePoolOptions({ min: 1.5 }), false);
      asserts.assertEquals(
        validatePoolOptions({ acquireTimeoutSeconds: -1 }),
        false,
      );
    });

    it('should reject min above the effective (defaulted) max when max is omitted', () => {
      // `max` omitted → `resolveOptions` fills it from the multi-connection
      // default (10). `{ min: 20 }` would resolve to `{ min: 20, max: 10 }`,
      // a pool pinned at 2× its ceiling, so it must be rejected at config time.
      asserts.assertEquals(validatePoolOptions({ min: 20 }), false);
      // `min` at or under the default max is fine.
      asserts.assertEquals(validatePoolOptions({ min: 5 }), true);
      asserts.assertEquals(validatePoolOptions({ min: 10 }), true);
      // An explicit max the min fits under is still accepted.
      asserts.assertEquals(validatePoolOptions({ min: 20, max: 30 }), true);
      // The explicit-max contradiction remains rejected.
      asserts.assertEquals(validatePoolOptions({ min: 5, max: 2 }), false);
    });
  });

  describe('acquire / release', () => {
    it('should create on demand and reflect stats', async () => {
      const { pool, state } = makePool();
      const r = await pool.acquire();
      asserts.assertEquals(state.created, 1);
      asserts.assertEquals(pool.stats(), {
        total: 1,
        active: 1,
        idle: 0,
        waiting: 0,
      });
      pool.release(r);
      asserts.assertEquals(pool.stats().idle, 1);
      await pool.drain();
    });

    it('should reuse an idle resource across acquires when max=1', async () => {
      const { pool, state } = makePool({ max: 1 });
      const a = await pool.acquire();
      pool.release(a);
      const b = await pool.acquire();
      asserts.assertEquals(a.id, b.id);
      asserts.assertEquals(state.created, 1);
      pool.release(b);
      await pool.drain();
    });

    it('should be a no-op to release a resource it does not own', async () => {
      const { pool } = makePool();
      pool.release({ id: 999, closed: false });
      asserts.assertEquals(pool.size(), 0);
      await pool.drain();
    });

    it('should destroy and recreate a resource that fails validation', async () => {
      const { pool, state } = makePool({ max: 2 });
      const a = await pool.acquire();
      pool.release(a);
      state.invalid = true; // the idle resource no longer validates
      const b = await pool.acquire();
      asserts.assert(b.id !== a.id);
      asserts.assert(state.destroyed >= 1);
      pool.release(b);
      await pool.drain();
    });
  });

  describe('saturation', () => {
    it('should queue past max, then hand off on release', async () => {
      const { pool } = makePool({ max: 1 });
      const held = await pool.acquire();
      const queued = pool.acquire(5000);
      await new Promise((r) => setTimeout(r, 5));
      asserts.assertEquals(pool.stats().waiting, 1);
      pool.release(held);
      const got = await queued;
      asserts.assertEquals(got.id, held.id);
      pool.release(got);
      await pool.drain();
    });

    it('should time out with POOL_ACQUIRE_TIMEOUT and warn', async () => {
      const { pool, state } = makePool({ max: 1 });
      const held = await pool.acquire();
      const err = await asserts.assertRejects(
        () => pool.acquire(50),
        EngineError,
      );
      asserts.assertEquals((err as EngineError).code, 'POOL_ACQUIRE_TIMEOUT');
      asserts.assertEquals((err as EngineError).context.timeoutMs, 50);
      asserts.assertEquals(state.warnings.length, 1);
      asserts.assertStringIncludes(
        state.warnings[0]!,
        'connection pool exhausted',
      );
      pool.release(held);
      await pool.drain();
    });

    it('should backfill a queued waiter when a checked-out resource is destroyed', async () => {
      const { pool, state } = makePool({ max: 1 });
      const held = await pool.acquire();
      const queued = pool.acquire(5000);
      await new Promise((r) => setTimeout(r, 5));
      const createdBefore = state.created;
      await pool.destroy(held);
      const got = await queued;
      asserts.assertEquals(got.closed, false);
      asserts.assert(state.created > createdBefore);
      pool.release(got);
      await pool.drain();
    });
  });

  describe('ensureMin / drain', () => {
    it('should pre-warm min resources', async () => {
      const { pool, state } = makePool({ min: 3, max: 5 });
      await pool.ensureMin();
      asserts.assertEquals(pool.stats().idle, 3);
      asserts.assertEquals(state.created, 3);
      await pool.drain();
    });

    it('should reject queued waiters and destroy idle on drain', async () => {
      const { pool, state } = makePool({ max: 1 });
      const held = await pool.acquire();
      const queued = pool.acquire(5000);
      await new Promise((r) => setTimeout(r, 5));

      const drained = pool.drain();
      await asserts.assertRejects(() => queued, EngineError);
      pool.release(held); // released during drain → destroyed
      await drained;
      asserts.assert(state.destroyed >= 1);

      await asserts.assertRejects(() => pool.acquire(), EngineError);
    });
  });

  describe('ping', () => {
    it('should acquire, ping, and release', async () => {
      const { pool } = makePool();
      asserts.assertEquals(await pool.ping(), true);
      asserts.assertEquals(pool.stats().active, 0); // released after ping
      await pool.drain();
    });

    it('should return false (not throw) when the resource is dead', async () => {
      const { pool } = makePool({
        // create a resource that is born closed → ping sees it dead
        create: () => ({ id: 1, closed: true }),
      });
      asserts.assertEquals(await pool.ping(), false);
      await pool.drain();
    });
  });
});
