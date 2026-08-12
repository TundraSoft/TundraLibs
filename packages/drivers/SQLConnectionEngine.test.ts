/**
 * @fileoverview Tests for the pool-free `SQLConnectionEngine` base.
 *
 * `SQLEngine.test.ts` is the frozen oracle for the *pooled* SQL engine
 * (`FakeSQLEngine extends SQLEngine`, real multi-connection pool). This
 * additive suite locks the complementary contract: an engine that extends
 * the pool-free `SQLConnectionEngine` directly — the shape a future
 * edge/serverless HTTP SQL driver (e.g. Neon over `fetch`) will take —
 * establishes a single `_resource` via `_open` / `_close`, runs the full
 * query surface over it, and never grows a socket pool (`poolStats` stays
 * the empty `{ total: 0, active: 0, idle: 0, waiting: 0 }` snapshot
 * throughout).
 *
 * @module
 */

import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat';
import { AbstractTranslator } from '@tundralibs/oql/translator';
import type {
  AggregateMap,
  DialectSupport,
  ExpressionMap,
  FilterOperatorMap,
  IdentifierQuote,
  ParameterStyle,
} from '@tundralibs/oql/translator';
import { SQLConnectionEngine } from './SQLEngine.ts';
import type {
  EngineQuery,
  EngineQueryResult,
  SQLEngineCapabilities,
  SQLEngineEvents,
  SQLEngineOptions,
} from './types/mod.ts';

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
 * Stand-in translator: these tests never touch the OQL surface, so every
 * emit hook throws to fail loudly if a future test accidentally strays into
 * one. Mirrors the `NoopTranslator` in `SQLEngine.test.ts`.
 */
class NoopTranslator extends AbstractTranslator {
  public readonly Dialect = 'noop';
  protected readonly _identifierQuote: IdentifierQuote = {
    open: '"',
    close: '"',
    escape: '""',
  };
  protected readonly _parameterStyle: ParameterStyle = {
    format: 'named',
    prefix: ':',
    suffix: ':',
  };
  protected readonly _support: DialectSupport = {
    schema: false,
    materializedView: false,
    truncate: false,
    rightJoin: false,
    fullJoin: false,
    returning: { insert: false, upsert: false },
  };
  protected readonly _expressionMap: ExpressionMap = new Map();
  protected readonly _aggregateMap: AggregateMap = new Map();
  protected readonly _filterOperatorMap: FilterOperatorMap = new Map();

  protected _buildUpsert(): string {
    throw new Error('NoopTranslator: not exercised in these unit tests');
  }
  protected _buildCreateSchema(): string {
    throw new Error('NoopTranslator: not exercised in these unit tests');
  }
  protected _buildDropSchema(): string {
    throw new Error('NoopTranslator: not exercised in these unit tests');
  }
  protected _renderColumnDefinition(): string {
    throw new Error('NoopTranslator: not exercised in these unit tests');
  }
  protected _buildAlterTable(): string[] {
    throw new Error('NoopTranslator: not exercised in these unit tests');
  }
  protected _buildDropTable(): string {
    throw new Error('NoopTranslator: not exercised in these unit tests');
  }
  protected _buildTruncate(): string {
    throw new Error('NoopTranslator: not exercised in these unit tests');
  }
  protected _buildCreateIndex(): string {
    throw new Error('NoopTranslator: not exercised in these unit tests');
  }
  protected _buildDropIndex(): string {
    throw new Error('NoopTranslator: not exercised in these unit tests');
  }
  protected _buildCreateView(): string {
    throw new Error('NoopTranslator: not exercised in these unit tests');
  }
  protected _buildDropView(): string {
    throw new Error('NoopTranslator: not exercised in these unit tests');
  }
  protected _buildAlterView(): string[] {
    throw new Error('NoopTranslator: not exercised in these unit tests');
  }
  protected _buildRefreshMaterializedView(): string {
    throw new Error('NoopTranslator: not exercised in these unit tests');
  }
}

// =============================================================================
// Test Data
// =============================================================================

/** A stateless, non-pooled "connection" — models an HTTP client handle. */
type FakeConn = { id: number; closed: boolean };

type FakeOptions = SQLEngineOptions & {
  executeDelay?: number;
};

/**
 * Minimal engine that extends the **pool-free** `SQLConnectionEngine`
 * directly (the shape a future edge/HTTP SQL driver takes). It establishes a
 * single `_resource` in `_open` and reuses the whole SQLEngine query /
 * transaction surface over it — with no `ConnectionPool`.
 */
class FakePoolFreeSQLEngine extends SQLConnectionEngine<FakeConn, FakeOptions> {
  public readonly Engine = 'FAKE_POOLFREE_SQL';
  public override readonly Capabilities: SQLEngineCapabilities = {
    pooledConnections: false,
    transactions: true,
    preparedStatements: false,
    advisoryLock: false,
    inPlaceAlter: true,
    referentialActions: true,
    parameterReplacement: { prefix: ':', suffix: '' },
  };

  // Never actually called (no OQL methods exercised) but required to satisfy
  // the abstract field — throws loudly if a test strays into translation.
  protected readonly _translator = new NoopTranslator();

  public opened = 0;
  public closedCount = 0;
  public executeCount = 0;
  public beginCount = 0;
  public commitCount = 0;
  public rollbackCount = 0;

  private _nextId = 0;

  /** Pool-free lifecycle: establish the single resource. */
  protected override _open(): void {
    this._resource = { id: ++this._nextId, closed: false };
    this.opened++;
  }

  /** Pool-free lifecycle: tear the single resource down. */
  protected override _close(): void {
    if (this._resource) this._resource.closed = true;
    this._resource = undefined;
    this.closedCount++;
  }

  protected async _execute<R extends Record<string, unknown>>(
    _query: EngineQuery,
    _client: FakeConn,
  ): Promise<{ data: R[]; count: number }> {
    this.executeCount++;
    const delay = this._getOption('executeDelay') ?? 0;
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    const data = [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
    ] as unknown as R[];
    return { data, count: data.length };
  }

  protected _beginTransaction(_client: FakeConn, _id: string): void {
    this.beginCount++;
  }

  protected _commitTransaction(_client: FakeConn, _id: string): void {
    this.commitCount++;
  }

  protected _rollbackTransaction(_client: FakeConn, _id: string): void {
    this.rollbackCount++;
  }

  protected override _ping(_resource: FakeConn): boolean {
    return true;
  }

  /** Expose the current single resource for white-box assertions. */
  public get resource(): FakeConn | undefined {
    return this._resource;
  }
}

const EMPTY_POOL_STATS = { total: 0, active: 0, idle: 0, waiting: 0 };

// =============================================================================
// Test Suites
// =============================================================================

describe('SQLConnectionEngine (pool-free)', () => {
  describe('Construction', () => {
    it('constructs with no `pool` option and applies SQL defaults', () => {
      const engine = new FakePoolFreeSQLEngine('edge');

      asserts.assertStrictEquals(engine.Name, 'edge');
      asserts.assertStrictEquals(engine.Engine, 'FAKE_POOLFREE_SQL');
      asserts.assertStrictEquals(engine.status, 'CLOSED');
      // SQL defaults still apply through the pool-free base.
      asserts.assertStrictEquals(readOption(engine, 'slowQueryThreshold'), 0.5);
      asserts.assertStrictEquals(readOption(engine, 'transactionTimeout'), 120);
      // Never configured a pool.
      asserts.assertStrictEquals(readOption(engine, 'pool'), undefined);
      asserts.assertEquals(engine.poolStats, EMPTY_POOL_STATS);
    });
  });

  describe('Lifecycle', () => {
    it('connect() drives _open and reaches READY', async () => {
      const engine = new FakePoolFreeSQLEngine('edge');
      asserts.assertStrictEquals(engine.status, 'CLOSED');
      asserts.assertStrictEquals(engine.resource, undefined);

      await engine.connect();

      asserts.assertStrictEquals(engine.status, 'READY');
      asserts.assertStrictEquals(engine.opened, 1);
      asserts.assertEquals(engine.resource, { id: 1, closed: false });
      // No pool ever materialized.
      asserts.assertEquals(engine.poolStats, EMPTY_POOL_STATS);

      await engine.disconnect();
    });

    it('connect() is idempotent (only one _open)', async () => {
      const engine = new FakePoolFreeSQLEngine('edge');
      await engine.connect();
      await engine.connect();

      asserts.assertStrictEquals(engine.opened, 1);

      await engine.disconnect();
    });

    it('disconnect() drives _close and reaches CLOSED', async () => {
      const engine = new FakePoolFreeSQLEngine('edge');
      await engine.connect();
      const conn = engine.resource;

      await engine.disconnect();

      asserts.assertStrictEquals(engine.status, 'CLOSED');
      asserts.assertStrictEquals(engine.closedCount, 1);
      asserts.assertStrictEquals(conn?.closed, true);
      asserts.assertStrictEquals(engine.resource, undefined);
      asserts.assertEquals(engine.poolStats, EMPTY_POOL_STATS);
    });

    it('ping() returns true while READY, false once CLOSED', async () => {
      const engine = new FakePoolFreeSQLEngine('edge');
      // Closed engines report false without throwing.
      asserts.assertStrictEquals(await engine.ping(), false);

      await engine.connect();
      asserts.assertStrictEquals(await engine.ping(), true);
      // Ping must not have leaked into a pool.
      asserts.assertEquals(engine.poolStats, EMPTY_POOL_STATS);

      await engine.disconnect();
      asserts.assertStrictEquals(await engine.ping(), false);
    });
  });

  describe('Query execution over the single resource', () => {
    it('execute() runs over the single resource and returns rows', async () => {
      const engine = new FakePoolFreeSQLEngine('edge');
      await engine.connect();
      const conn = engine.resource;

      const result = await engine.execute({ sql: 'SELECT * FROM users;' });

      asserts.assertStrictEquals(engine.executeCount, 1);
      // _finishQuery populated id / time / count.
      asserts.assert(result.id !== undefined);
      asserts.assert(typeof result.time === 'number');
      asserts.assertStrictEquals(result.count, 2);
      asserts.assert(Array.isArray(result.data));
      asserts.assertStrictEquals(result.data.length, 2);
      asserts.assertStrictEquals(result.isSlow, false);

      // The same single resource was reused (no pool acquire/create), and the
      // pool-free `_release` never recycled it away.
      asserts.assertStrictEquals(engine.resource, conn);
      asserts.assertEquals(engine.poolStats, EMPTY_POOL_STATS);

      // Stats accumulated through the shared helper.
      asserts.assertStrictEquals(engine.queryStats.totalQueries, 1);
      asserts.assertStrictEquals(engine.queryStats.successfulQueries, 1);
      asserts.assertEquals(engine.stats.pool, EMPTY_POOL_STATS);

      await engine.disconnect();
    });

    it('execute() auto-connects a CLOSED engine', async () => {
      const engine = new FakePoolFreeSQLEngine('edge');
      asserts.assertStrictEquals(engine.status, 'CLOSED');

      await engine.execute({ sql: 'SELECT 1;' });

      asserts.assertStrictEquals(engine.status, 'READY');
      asserts.assertStrictEquals(engine.opened, 1);

      await engine.disconnect();
    });

    it('fires the `query` event on every execution', async () => {
      const engine = new FakePoolFreeSQLEngine('edge');
      const seen: EngineQueryResult[] = [];
      engine.on('query', (_id: string, result: EngineQueryResult) => {
        seen.push(result);
      });
      await engine.connect();

      await engine.execute({ sql: 'SELECT 1;' });

      asserts.assertStrictEquals(seen.length, 1);
      asserts.assertStrictEquals(seen[0]!.count, 2);
      asserts.assertStrictEquals(seen[0]!.isSlow, false);

      await engine.disconnect();
    });

    it('fires the `slowQuery` event past the threshold', async () => {
      const engine = new FakePoolFreeSQLEngine('edge', {
        slowQueryThreshold: 0.01, // 10ms
        executeDelay: 50, // 50ms delay
      });
      const slow: EngineQueryResult[] = [];
      engine.on('slowQuery', (_id: string, result: EngineQueryResult) => {
        slow.push(result);
      });
      await engine.connect();

      const result = await engine.execute({ sql: 'SELECT * FROM users;' });

      asserts.assertStrictEquals(result.isSlow, true);
      asserts.assert(result.time >= 45);
      asserts.assertStrictEquals(slow.length, 1);
      asserts.assertStrictEquals(engine.queryStats.slowQueries, 1);
      // Still no pool, even on the slow path.
      asserts.assertEquals(engine.poolStats, EMPTY_POOL_STATS);

      await engine.disconnect();
    });
  });

  describe('Transactions run pool-free', () => {
    it('runs a callback transaction over the single resource', async () => {
      const engine = new FakePoolFreeSQLEngine('edge');
      await engine.connect();
      const conn = engine.resource;

      const rows = await engine.transaction(async (tx) => {
        await tx.execute({ sql: 'INSERT INTO users VALUES (1);' });
        return await tx.execute({ sql: 'SELECT * FROM users;' });
      });

      asserts.assertStrictEquals(engine.beginCount, 1);
      asserts.assertStrictEquals(engine.commitCount, 1);
      asserts.assertStrictEquals(engine.rollbackCount, 0);
      asserts.assertStrictEquals(rows.count, 2);
      // The transaction reserved and released the one single resource, which
      // is still the live one afterward — never routed through a pool.
      asserts.assertStrictEquals(engine.resource, conn);
      asserts.assertEquals(engine.poolStats, EMPTY_POOL_STATS);

      await engine.disconnect();
    });

    it('rolls back active transactions on disconnect (pool-free)', async () => {
      const engine = new FakePoolFreeSQLEngine('edge');
      await engine.connect();

      await engine.beginTransaction();
      await engine.beginTransaction();

      await engine.disconnect();

      asserts.assertStrictEquals(engine.rollbackCount, 2);
      asserts.assertStrictEquals(engine.status, 'CLOSED');
      asserts.assertStrictEquals(engine.closedCount, 1);
      asserts.assertEquals(engine.poolStats, EMPTY_POOL_STATS);
    });
  });
});
