import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat';
import type { AbstractTranslator } from '@tundralibs/oql/translator';
import { SQLEngine } from './SQLEngine.ts';
import { EngineError } from './errors/mod.ts';
import type { EngineQuery, SQLEngineCapabilities } from './types/mod.ts';

/**
 * Regression coverage for {@link SQLEngine}'s connect / disconnect lifecycle
 * (adversarial review round-2, c1 + c2). `SQLEngine` carries a byte-parallel
 * DUPLICATE of `PooledConnectionEngine`'s pool + connect/disconnect that
 * Postgres/Maria/SQLite (and their aliases) extend, so the round-1 C6 drain and
 * the disconnect-during-connect guard had to be mirrored into it. The frozen
 * `SQLEngine.test.ts` oracle exercises the happy path; this file drives the two
 * failure/race windows those fixes close. It stays out of the oracle so the
 * oracle can remain frozen.
 */

type Res = { id: number; closed: boolean };

/**
 * Minimal concrete `SQLEngine` for lifecycle tests. Only the pool seams
 * (`_createResource` / `_destroyResource` / `_ping`) matter here; the OQL /
 * transaction surface is never exercised, so `_translator` is a never-touched
 * stand-in and the tx hooks are no-ops. Subclasses below override
 * `_createResource` to drive the partial-warm-up and the connect/disconnect
 * race.
 */
abstract class BaseFakeSQLEngine extends SQLEngine<Res> {
  public readonly Engine = 'FAKE_SQL';
  public override readonly Capabilities: SQLEngineCapabilities = {
    pooledConnections: true,
    transactions: true,
    preparedStatements: false,
    advisoryLock: false,
    inPlaceAlter: false,
    referentialActions: false,
  };

  // These lifecycle tests never route through OQL, so the translator is never
  // dereferenced. Cast a stand-in rather than couple the suite to a real
  // dialect translator (mirrors the oracle's NoopTranslator rationale).
  protected readonly _translator = undefined as unknown as AbstractTranslator;

  public created = 0;
  public destroyed = 0;

  protected _destroyResource(r: Res): void {
    r.closed = true;
    this.destroyed++;
  }

  protected override _validateResource(r: Res): boolean {
    return !r.closed;
  }

  protected _ping(r: Res): boolean {
    return !r.closed;
  }

  protected _execute<R extends Record<string, unknown>>(
    _query: EngineQuery,
    _client: Res,
  ): Promise<{ data: R[]; count: number }> {
    return Promise.resolve({ data: [] as R[], count: 0 });
  }

  protected _beginTransaction(): void {}
  protected _commitTransaction(): void {}
  protected _rollbackTransaction(): void {}

  /** Acquire + release once, to prove the pool isn't wedged in POOL_DRAINING. */
  public async probeAcquire(): Promise<void> {
    const r = await this._acquire();
    this._release(r);
  }
}

/**
 * The 3rd `_createResource` rejects on a deferred macrotask, after the first
 * two have already resolved into the pool's idle list — reproducing the
 * partial warm-up failure where `ensureMin`'s `Promise.all` rejects on the
 * failing sibling while its predecessors are already live and idle.
 */
class WarmFailSQLEngine extends BaseFakeSQLEngine {
  /** 1-based creation index that should reject; 0 disables the failure. */
  public failOn = 0;

  protected _createResource(): Promise<Res> {
    this.created++;
    const n = this.created;
    if (n === this.failOn) {
      return new Promise<Res>((_, reject) =>
        setTimeout(() => reject(new Error(`create #${n} failed`)), 5)
      );
    }
    return Promise.resolve({ id: n, closed: false });
  }
}

/**
 * `_createResource` resolves after a fixed delay so a `disconnect()` can be
 * interleaved deterministically while `connect()` is still awaiting
 * `ensureMin`'s warm creations.
 */
class SlowWarmSQLEngine extends BaseFakeSQLEngine {
  public createDelayMs = 20;

  protected _createResource(): Promise<Res> {
    this.created++;
    const n = this.created;
    return new Promise<Res>((resolve) =>
      setTimeout(() => resolve({ id: n, closed: false }), this.createDelayMs)
    );
  }
}

describe('drivers.SQLEngine - warm-up failure draining (review c1)', () => {
  it('drains stranded warm-up connections when connect() partially fails', async () => {
    const e = new WarmFailSQLEngine('sql-warm-fail', {
      pool: { min: 3, max: 5 },
    });
    e.failOn = 3; // the 3rd of the three min-warm creations rejects

    await asserts.assertRejects(() => e.connect(), EngineError);

    // The two siblings that already succeeded were reclaimed by the C6 drain
    // now mirrored into SQLEngine.connect()'s catch — not stranded (and leaked)
    // in the pool's idle list until process exit.
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

describe('drivers.SQLEngine - disconnect during connect (review c2)', () => {
  it('does not wedge the pool when disconnect() lands mid warm-up', async () => {
    const e = new SlowWarmSQLEngine('sql-connect-race', {
      pool: { min: 2, max: 4 },
    });

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
