import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat';
import { PooledConnectionEngine } from './ConnectionEngine.ts';
import type { EngineCapabilities } from './types/mod.ts';
import { EngineError } from './errors/mod.ts';

/**
 * Regression coverage for {@link PooledConnectionEngine.connect}'s failure
 * path (adversarial review C6). The frozen oracle `BaseEngine.test.ts` drives
 * the pool state machine directly; this file exercises the engine-level
 * connect / disconnect lifecycle around a *partial* warm-up failure, which the
 * oracle's whole-batch `createError` hook can't express.
 */

type Res = { id: number; closed: boolean };

/**
 * A minimal pooled engine whose `_createResource` can be told to reject on a
 * specific (1-based) creation index. The rejection is deferred to a macrotask
 * so the earlier, immediately-resolving creations land in the pool's idle list
 * first — reproducing the partial warm-up failure where `ensureMin`'s
 * `Promise.all` rejects on the failing sibling while its predecessors are
 * already live and idle.
 */
class WarmFailEngine extends PooledConnectionEngine<Res> {
  public readonly Engine = 'FAKE';
  public readonly Capabilities: EngineCapabilities = {
    pooledConnections: true,
    transactions: false,
    preparedStatements: false,
  };

  public created = 0;
  public destroyed = 0;
  /** 1-based creation index that should reject; 0 disables the failure. */
  public failOn = 0;

  protected _createResource(): Promise<Res> {
    this.created++;
    const n = this.created;
    if (n === this.failOn) {
      // Defer the rejection so the sibling creations resolve and land in the
      // pool's idle list before `Promise.all` sees this failure.
      return new Promise<Res>((_, reject) =>
        setTimeout(() => reject(new Error(`create #${n} failed`)), 5)
      );
    }
    return Promise.resolve({ id: n, closed: false });
  }

  protected _destroyResource(r: Res): void {
    r.closed = true;
    this.destroyed++;
  }

  protected _ping(r: Res): boolean {
    return !r.closed;
  }
}

/**
 * A minimal pooled engine whose `_createResource` resolves after a fixed
 * delay, so a `disconnect()` can be interleaved deterministically while
 * `connect()` is still awaiting `ensureMin`'s warm creations (review c2).
 */
class SlowWarmEngine extends PooledConnectionEngine<Res> {
  public readonly Engine = 'FAKE';
  public readonly Capabilities: EngineCapabilities = {
    pooledConnections: true,
    transactions: false,
    preparedStatements: false,
  };

  public created = 0;
  public destroyed = 0;
  public createDelayMs = 20;

  protected _createResource(): Promise<Res> {
    this.created++;
    const n = this.created;
    return new Promise<Res>((resolve) =>
      setTimeout(() => resolve({ id: n, closed: false }), this.createDelayMs)
    );
  }

  protected _destroyResource(r: Res): void {
    r.closed = true;
    this.destroyed++;
  }

  protected _ping(r: Res): boolean {
    return !r.closed;
  }

  /** Acquire + release once, to prove the pool isn't wedged in POOL_DRAINING. */
  public async probeAcquire(): Promise<void> {
    const r = await this._acquire();
    this._release(r);
  }
}

describe('drivers.ConnectionEngine - warm-up failure draining (review C6)', () => {
  it('drains stranded warm-up connections when connect() partially fails', async () => {
    const e = new WarmFailEngine('warm-fail', { pool: { min: 3, max: 5 } });
    e.failOn = 3; // the 3rd of the three min-warm creations rejects

    await asserts.assertRejects(() => e.connect(), EngineError);

    // The two siblings that already succeeded were reclaimed by the drain in
    // connect()'s catch — not stranded (and leaked) in the pool's idle list.
    asserts.assertEquals(e.status, 'CLOSED');
    asserts.assertEquals(e.poolStats.idle, 0);
    asserts.assertEquals(e.poolStats.total, 0);
    asserts.assertEquals(e.destroyed, 2);

    // A follow-up disconnect on the already-drained engine is a safe no-op.
    await e.disconnect();
    asserts.assertEquals(e.status, 'CLOSED');

    // A subsequent healthy connect still warms the pool — connect() resets the
    // draining flag before re-running ensureMin, so retries recover cleanly.
    e.failOn = 0;
    await e.connect();
    asserts.assertEquals(e.status, 'READY');
    asserts.assertEquals(e.poolStats.idle, 3);
    await e.disconnect();
  });
});

describe('drivers.ConnectionEngine - disconnect during connect (review c2)', () => {
  it('does not wedge the pool when disconnect() lands mid warm-up', async () => {
    const e = new SlowWarmEngine('connect-race', { pool: { min: 2, max: 4 } });

    // Start connecting; the warm creations resolve after ~20ms each.
    const connecting = e.connect();
    // Let connect() reach `await ensureMin()` (creations in flight), then
    // disconnect() before they resolve. disconnect()'s drain doesn't await the
    // in-flight creations — they self-destroy on resolve — so connect()'s
    // ensureMin still resolves and connect() must NOT flip to READY.
    await new Promise((r) => setTimeout(r, 5));
    await e.disconnect();
    await connecting; // resolves (does not reject)

    // The engine settled CLOSED (not READY-with-draining-pool). A READY engine
    // would early-return from a recovery connect() while every _acquire threw
    // POOL_DRAINING forever — the wedge the c2 re-check closes.
    asserts.assertEquals(e.status, 'CLOSED');

    // A subsequent healthy connect re-warms and acquisitions succeed — proof
    // the pool's draining flag was reset, not stranded true.
    await e.connect();
    asserts.assertEquals(e.status, 'READY');
    await e.probeAcquire(); // would throw POOL_DRAINING if wedged
    asserts.assertEquals(e.poolStats.idle, 2);

    await e.disconnect();
  });
});
