/**
 * @fileoverview Tests for SQLEngine abstract class.
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
import { SQLEngine } from './SQLEngine.ts';
import { EngineError } from './errors/mod.ts';
import type {
  EngineQuery,
  EngineQueryResult,
  EngineTransactionOptions,
  SQLEngineCapabilities,
  SQLEngineOptions,
  TransactionScope,
} from './types/mod.ts';

/**
 * Stand-in translator for SQLEngine unit tests. SQLEngine declares an
 * abstract `_translator` field but these tests never exercise the OQL
 * surface — a real dialect translator (e.g. `SQLiteTranslator`) would
 * silently couple the suite to that dialect's behaviour. This noop
 * throws on every emit so a future test that strays into OQL methods
 * fails loudly rather than running undeclared SQLite translation.
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

  // Every _build hook throws — these tests never call OQL methods.
  protected _buildUpsert(): string {
    throw new Error('NoopTranslator: not exercised in SQLEngine unit tests');
  }
  protected _buildCreateSchema(): string {
    throw new Error('NoopTranslator: not exercised in SQLEngine unit tests');
  }
  protected _buildDropSchema(): string {
    throw new Error('NoopTranslator: not exercised in SQLEngine unit tests');
  }
  protected _renderColumnDefinition(): string {
    throw new Error('NoopTranslator: not exercised in SQLEngine unit tests');
  }
  protected _buildAlterTable(): string[] {
    throw new Error('NoopTranslator: not exercised in SQLEngine unit tests');
  }
  protected _buildDropTable(): string {
    throw new Error('NoopTranslator: not exercised in SQLEngine unit tests');
  }
  protected _buildTruncate(): string {
    throw new Error('NoopTranslator: not exercised in SQLEngine unit tests');
  }
  protected _buildCreateIndex(): string {
    throw new Error('NoopTranslator: not exercised in SQLEngine unit tests');
  }
  protected _buildDropIndex(): string {
    throw new Error('NoopTranslator: not exercised in SQLEngine unit tests');
  }
  protected _buildCreateView(): string {
    throw new Error('NoopTranslator: not exercised in SQLEngine unit tests');
  }
  protected _buildDropView(): string {
    throw new Error('NoopTranslator: not exercised in SQLEngine unit tests');
  }
  protected _buildAlterView(): string[] {
    throw new Error('NoopTranslator: not exercised in SQLEngine unit tests');
  }
  protected _buildRefreshMaterializedView(): string {
    throw new Error('NoopTranslator: not exercised in SQLEngine unit tests');
  }
}

// =============================================================================
// Test Data
// =============================================================================

type FakeClient = {
  id: number;
  closed: boolean;
  inTransaction: boolean;
};

type FakeOptions = SQLEngineOptions & {
  failExecute?: boolean;
  failBegin?: boolean;
  failCommit?: boolean;
  failRollback?: boolean;
  executeDelay?: number;
};

/**
 * Concrete implementation of SQLEngine for testing.
 * Simulates a simple SQL database with in-memory data.
 */
class FakeSQLEngine extends SQLEngine<FakeClient, FakeOptions> {
  public readonly Engine = 'FAKE_SQL';
  public override readonly Capabilities: SQLEngineCapabilities = {
    pooledConnections: true,
    transactions: true,
    preparedStatements: true,
    advisoryLock: true,
    inPlaceAlter: true,
    referentialActions: true,
    parameterReplacement: { prefix: ':', suffix: '' },
  };

  // SQLEngine's abstract `_translator` field has to be assigned; these
  // tests never call OQL methods, so the noop fails loudly if a future
  // test accidentally does.
  protected readonly _translator = new NoopTranslator();

  public created = 0;
  public destroyed = 0;
  public executeCount = 0;
  public beginCount = 0;
  public commitCount = 0;
  public rollbackCount = 0;

  // Mock data store
  private _data: Record<string, unknown>[] = [
    { id: 1, name: 'Alice', active: true },
    { id: 2, name: 'Bob', active: false },
    { id: 3, name: 'Charlie', active: true },
  ];

  protected _createResource(): FakeClient {
    this.created++;
    return { id: this.created, closed: false, inTransaction: false };
  }

  protected _destroyResource(client: FakeClient): void {
    client.closed = true;
    this.destroyed++;
  }

  protected override _validateResource(client: FakeClient): boolean {
    return !client.closed;
  }

  protected async _execute<R extends Record<string, unknown>>(
    query: EngineQuery,
    client: FakeClient,
  ): Promise<{ data: R[]; count: number }> {
    if (this.getOption('failExecute')) {
      throw new Error('Simulated execute failure');
    }

    this.executeCount++;

    const delay = this.getOption('executeDelay') ?? 0;
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    // Simple mock implementation
    const data = this._data as R[];
    return { data, count: data.length };
  }

  protected _beginTransaction(
    client: FakeClient,
    _transactionId: string,
  ): void {
    if (this.getOption('failBegin')) {
      throw new Error('Simulated begin failure');
    }
    client.inTransaction = true;
    this.beginCount++;
  }

  protected _commitTransaction(
    client: FakeClient,
    _transactionId: string,
  ): void {
    if (this.getOption('failCommit')) {
      throw new Error('Simulated commit failure');
    }
    client.inTransaction = false;
    this.commitCount++;
  }

  protected _rollbackTransaction(
    client: FakeClient,
    _transactionId: string,
  ): void {
    if (this.getOption('failRollback')) {
      throw new Error('Simulated rollback failure');
    }
    client.inTransaction = false;
    this.rollbackCount++;
  }

  protected _ping(_resource: FakeClient): boolean {
    return true;
  }

  // Expose protected methods for testing
  public testStandardizeQuery(query: EngineQuery): EngineQuery {
    return this._standardizeQuery(query);
  }

  public testEncodeValue(value: unknown): unknown {
    return this._encodeValue(value);
  }

  public testWrapDriverError(error: unknown, query: EngineQuery): EngineError {
    return this._wrapDriverError(error, query);
  }

  /** Feed a known timing/outcome into the stats accumulator so the averaging
   * math can be asserted exactly, without depending on wall-clock timings. */
  public testRecordQueryStats(
    timeMs: number,
    isSlow: boolean,
    success: boolean,
  ): void {
    this._recordQueryStats(timeMs, isSlow, success);
  }
}

/** FakeSQLEngine whose `_execute` rejects for any SQL matching `failOn`
 * — used to drive the savepoint-failure recovery paths. */
class FailingSQLEngine extends FakeSQLEngine {
  public failOn?: RegExp;
  protected override _execute<R extends Record<string, unknown>>(
    query: EngineQuery,
    client: FakeClient,
  ): Promise<{ data: R[]; count: number }> {
    if (this.failOn?.test(query.sql)) {
      return Promise.reject(new Error(`fail: ${query.sql}`));
    }
    return super._execute<R>(query, client);
  }
}

/**
 * FakeSQLEngine whose next `_execute` simulates a transport reset: it marks
 * the client closed (as `PgConnection` now does on a rejected read/write) and
 * rejects. Used to prove `execute()` destroys a poisoned connection instead of
 * recycling it (round-3 finding #1).
 */
class TransportFailSQLEngine extends FakeSQLEngine {
  public failNext = false;
  protected override _execute<R extends Record<string, unknown>>(
    query: EngineQuery,
    client: FakeClient,
  ): Promise<{ data: R[]; count: number }> {
    if (this.failNext) {
      this.failNext = false;
      client.closed = true; // transport error killed the socket
      return Promise.reject(new Error('ECONNRESET'));
    }
    return super._execute<R>(query, client);
  }
}

// =============================================================================
// Test Suites
// =============================================================================

describe('SQLEngine', () => {
  describe('Constructor', () => {
    it('should initialize with default options', async () => {
      const engine = new FakeSQLEngine('test');

      asserts.assertStrictEquals(engine.Name, 'test');
      asserts.assertStrictEquals(engine.Engine, 'FAKE_SQL');
      asserts.assertStrictEquals(engine.status, 'CLOSED');
    });

    it('should apply SQL-specific defaults', async () => {
      const engine = new FakeSQLEngine('test');

      asserts.assertStrictEquals(engine.getOption('slowQueryThreshold'), 0.5);
      asserts.assertStrictEquals(engine.getOption('transactionTimeout'), 120);
      asserts.assertStrictEquals(
        engine.getOption('autoRollbackOnFailure'),
        true,
      );
    });

    it('should allow overriding defaults', async () => {
      const engine = new FakeSQLEngine('test', {
        slowQueryThreshold: 1.0,
        transactionTimeout: 60,
        autoRollbackOnFailure: false,
      });

      asserts.assertStrictEquals(engine.getOption('slowQueryThreshold'), 1.0);
      asserts.assertStrictEquals(engine.getOption('transactionTimeout'), 60);
      asserts.assertStrictEquals(
        engine.getOption('autoRollbackOnFailure'),
        false,
      );
    });
  });

  describe('Query Execution', () => {
    it('should execute query successfully', async () => {
      const engine = new FakeSQLEngine('test');
      await engine.connect();

      const result = await engine.execute({
        sql: 'SELECT * FROM users;',
      });

      asserts.assertStrictEquals(engine.executeCount, 1);
      asserts.assert(result.id !== undefined);
      asserts.assert(Array.isArray(result.data));
      asserts.assertStrictEquals(result.count, 3);
      asserts.assert(typeof result.time === 'number');
      asserts.assertStrictEquals(result.isSlow, false);

      await engine.disconnect();
    });

    it('should auto-connect if not connected', async () => {
      const engine = new FakeSQLEngine('test');
      asserts.assertStrictEquals(engine.status, 'CLOSED');

      await engine.execute({ sql: 'SELECT 1;' });

      asserts.assertStrictEquals(engine.status, 'READY');
      await engine.disconnect();
    });

    it('should detect slow queries', async () => {
      const engine = new FakeSQLEngine('test', {
        slowQueryThreshold: 0.01, // 10ms
        executeDelay: 50, // 50ms delay
      });
      await engine.connect();

      const result = await engine.execute({ sql: 'SELECT * FROM users;' });

      asserts.assertStrictEquals(result.isSlow, true);
      // Tolerate timer/clock jitter: a setTimeout(50) combined with coarse
      // Date.now()/performance.now() rounding can measure a hair under 50ms.
      // 45ms still proves the recorded time reflects the ~50ms delay and is
      // well above the 10ms slow-query threshold.
      asserts.assert(result.time >= 45);

      await engine.disconnect();
    });

    it('should update query statistics on success', async () => {
      const engine = new FakeSQLEngine('test');
      await engine.connect();

      await engine.execute({ sql: 'SELECT 1;' });
      await engine.execute({ sql: 'SELECT 2;' });

      const stats = engine.queryStats;
      asserts.assertStrictEquals(stats.totalQueries, 2);
      asserts.assertStrictEquals(stats.successfulQueries, 2);
      asserts.assertStrictEquals(stats.failedQueries, 0);

      await engine.disconnect();
    });

    it('should update query statistics on failure', async () => {
      const engine = new FakeSQLEngine('test', { failExecute: true });
      await engine.connect();

      try {
        await engine.execute({ sql: 'SELECT 1;' });
        asserts.fail('Should have thrown');
      } catch {
        // Expected
      }

      const stats = engine.queryStats;
      asserts.assertStrictEquals(stats.totalQueries, 1);
      asserts.assertStrictEquals(stats.successfulQueries, 0);
      asserts.assertStrictEquals(stats.failedQueries, 1);

      await engine.disconnect();
    });

    it('should throw EngineError on execution failure', async () => {
      const engine = new FakeSQLEngine('test', { failExecute: true });
      await engine.connect();

      await asserts.assertRejects(
        async () => await engine.execute({ sql: 'SELECT 1;' }),
        EngineError,
      );

      await engine.disconnect();
    });
  });

  describe('Batch Execution', () => {
    it('should execute multiple queries sequentially', async () => {
      const engine = new FakeSQLEngine('test');
      await engine.connect();

      await engine.batchExecute([
        { sql: 'SELECT 1;' },
        { sql: 'SELECT 2;' },
        { sql: 'SELECT 3;' },
      ]);

      asserts.assertStrictEquals(engine.executeCount, 3);
      asserts.assertStrictEquals(engine.queryStats.totalQueries, 3);

      await engine.disconnect();
    });

    it('should halt on first error', async () => {
      const engine = new FakeSQLEngine('test', { failExecute: false });
      await engine.connect();

      // Set to fail after first query
      let queryCount = 0;
      const originalExecute = engine['_execute'].bind(engine);
      engine['_execute'] = async function (query: any, client: any) {
        queryCount++;
        if (queryCount > 1) {
          throw new Error('Simulated failure on second query');
        }
        return originalExecute(query, client);
      };

      await asserts.assertRejects(
        async () => {
          await engine.batchExecute([
            { sql: 'SELECT 1;' },
            { sql: 'SELECT 2;' }, // This will fail
            { sql: 'SELECT 3;' },
          ]);
        },
      );

      // Should execute first query successfully, fail on second
      asserts.assertStrictEquals(queryCount, 2);

      await engine.disconnect();
    });
  });

  describe('Transactions', () => {
    it('should begin transaction successfully', async () => {
      const engine = new FakeSQLEngine('test');
      await engine.connect();

      const txId = await engine.beginTransaction();

      asserts.assert(typeof txId === 'string');
      asserts.assertStrictEquals(engine.beginCount, 1);
      asserts.assertStrictEquals(engine.poolStats.active, 1);

      await engine.rollbackTransaction(txId);
      await engine.disconnect();
    });

    it('should commit transaction successfully', async () => {
      const engine = new FakeSQLEngine('test');
      await engine.connect();

      const txId = await engine.beginTransaction();
      await engine.commitTransaction(txId);

      asserts.assertStrictEquals(engine.commitCount, 1);
      asserts.assertStrictEquals(engine.poolStats.active, 0);

      await engine.disconnect();
    });

    it('savepoints: create / rollbackTo / release manage the LIFO stack', async () => {
      const engine = new FakeSQLEngine('test');
      await engine.connect();
      const txId = await engine.beginTransaction();
      const stack = () =>
        (engine as unknown as {
          _transactions: Map<string, { savepoints: string[] }>;
        })._transactions.get(txId)!.savepoints;

      const sp1 = await engine.createSavepoint(txId);
      const sp2 = await engine.createSavepoint(txId);
      asserts.assertEquals([sp1, sp2], ['sp_1', 'sp_2']);
      asserts.assertEquals(stack(), ['sp_1', 'sp_2']);

      // ROLLBACK TO the outer savepoint discards the nested one but
      // keeps the target defined.
      await engine.rollbackToSavepoint(txId, sp1);
      asserts.assertEquals(stack(), ['sp_1']);

      // RELEASE drops it.
      await engine.releaseSavepoint(txId, sp1);
      asserts.assertEquals(stack(), []);

      await engine.commitTransaction(txId);
      await engine.disconnect();
    });

    it('savepoints: ops on a missing transaction throw TRANSACTION_NOT_FOUND', async () => {
      const engine = new FakeSQLEngine('test');
      await engine.connect();
      const err = await asserts.assertRejects(
        () => engine.createSavepoint('does-not-exist'),
        EngineError,
      );
      asserts.assertEquals(
        (err as EngineError).code,
        'TRANSACTION_NOT_FOUND',
      );
      await engine.disconnect();
    });

    it('savepoints: a failed auto-rollback ROLLBACK TO falls back to full rollback', async () => {
      const engine = new FailingSQLEngine('sp-fallback');
      await engine.connect();
      const txId = await engine.beginTransaction();
      await engine.createSavepoint(txId);
      // A statement fails AND its savepoint is gone (its ROLLBACK TO
      // also fails, as a MariaDB deadlock would leave things) → the
      // engine must fall back to a full rollback, not leave a zombie tx.
      engine.failOn = /FAIL_STMT|ROLLBACK TO SAVEPOINT/;
      await asserts.assertRejects(() =>
        engine.execute({ sql: 'FAIL_STMT', transactionId: txId })
      );
      engine.failOn = undefined;
      // The transaction was fully torn down (not stuck ACTIVE):
      const err = await asserts.assertRejects(
        () => engine.execute({ sql: 'SELECT 1', transactionId: txId }),
        EngineError,
      );
      asserts.assertEquals((err as EngineError).code, 'TRANSACTION_NOT_FOUND');
      await engine.disconnect();
    });

    it('savepoints: a failed RELEASE still trims the in-memory stack (no drift)', async () => {
      const engine = new FailingSQLEngine('sp-trim');
      await engine.connect();
      const txId = await engine.beginTransaction();
      const stack = () =>
        (engine as unknown as {
          _transactions: Map<string, { savepoints: string[] }>;
        })._transactions.get(txId)!.savepoints;

      const sp = await engine.createSavepoint(txId);
      asserts.assertEquals(stack(), [sp]);
      engine.failOn = /RELEASE SAVEPOINT/;
      await asserts.assertRejects(() => engine.releaseSavepoint(txId, sp));
      // Even though the RELEASE threw, the stack was trimmed — it can't
      // keep claiming a savepoint the DB may have discarded.
      asserts.assertEquals(stack(), []);
      engine.failOn = undefined;
      await engine.rollbackTransaction(txId);
      await engine.disconnect();
    });

    it('transaction(fn): commits on resolve, returns the value, releases the connection', async () => {
      const engine = new FakeSQLEngine('cb-commit');
      await engine.connect();
      const out = await engine.transaction(async (tx) => {
        asserts.assert(typeof tx.id === 'string');
        await tx.execute({ sql: 'SELECT 1;' });
        return 42;
      });
      asserts.assertStrictEquals(out, 42);
      asserts.assertStrictEquals(engine.commitCount, 1);
      asserts.assertStrictEquals(engine.rollbackCount, 0);
      asserts.assertStrictEquals(engine.poolStats.active, 0); // released
      await engine.disconnect();
    });

    it('transaction(fn): rolls back + rethrows on throw, releases the connection', async () => {
      const engine = new FakeSQLEngine('cb-rollback');
      await engine.connect();
      await asserts.assertRejects(
        () =>
          engine.transaction(async (tx) => {
            await tx.execute({ sql: 'SELECT 1;' });
            throw new Error('boom');
          }),
        Error,
        'boom',
      );
      asserts.assertStrictEquals(engine.commitCount, 0);
      asserts.assertStrictEquals(engine.rollbackCount, 1);
      asserts.assertStrictEquals(engine.poolStats.active, 0); // released
      await engine.disconnect();
    });

    it('transaction(fn): nested tx opens a savepoint — inner throw survives, outer commits', async () => {
      const engine = new FakeSQLEngine('cb-nest');
      await engine.connect();
      await engine.transaction(async (tx) => {
        await tx.execute({ sql: 'SELECT 1;' });
        await asserts.assertRejects(
          () =>
            tx.transaction(async (sp) => {
              asserts.assertStrictEquals(sp.id, tx.id); // same engine tx
              await sp.execute({ sql: 'SELECT 1;' });
              throw new Error('inner');
            }),
          Error,
          'inner',
        );
        // outer tx is still usable after the nested rollback-to-savepoint
        await tx.execute({ sql: 'SELECT 1;' });
      });
      // exactly ONE real commit; savepoints add no commit/rollback
      asserts.assertStrictEquals(engine.commitCount, 1);
      asserts.assertStrictEquals(engine.rollbackCount, 0);
      await engine.disconnect();
    });

    it('transaction(fn): a benign RELEASE failure on a successful nested block still commits', async () => {
      const engine = new FailingSQLEngine('cb-release-benign');
      await engine.connect();
      // Every RELEASE SAVEPOINT rejects — a benign cleanup hiccup (the DB may
      // already have folded the savepoint). This must NOT turn a fully
      // successful nested block into a thrown error that rolls back the whole
      // outer transaction.
      engine.failOn = /RELEASE SAVEPOINT/;
      const out = await engine.transaction(async (tx) => {
        await tx.execute({ sql: 'SELECT 1;' });
        const inner = await tx.transaction(async (sp) => {
          await sp.execute({ sql: 'SELECT 1;' });
          return 'nested-ok';
        });
        asserts.assertStrictEquals(inner, 'nested-ok');
        return 'outer-ok';
      });
      engine.failOn = undefined;
      // The successful block committed — the RELEASE hiccup was swallowed,
      // not escalated to a rollback.
      asserts.assertStrictEquals(out, 'outer-ok');
      asserts.assertStrictEquals(engine.commitCount, 1);
      asserts.assertStrictEquals(engine.rollbackCount, 0);
      await engine.disconnect();
    });

    it('transaction(fn): concurrent statements on one tx scope are refused', async () => {
      const engine = new FakeSQLEngine('cb-concurrent', { executeDelay: 10 });
      await engine.connect();
      await engine.transaction(async (tx) => {
        // Two overlapping statements on the single reserved connection: the
        // second must be refused, not interleaved on the socket (which would
        // protocol-error or release the client mid-flight).
        const settled = await Promise.allSettled([
          tx.execute({ sql: 'SELECT 1;' }),
          tx.execute({ sql: 'SELECT 2;' }),
        ]);
        const rejected = settled.filter((r) => r.status === 'rejected');
        asserts.assertStrictEquals(rejected.length, 1);
        const err = (rejected[0] as PromiseRejectedResult).reason;
        asserts.assert(err instanceof EngineError);
        asserts.assertEquals(
          (err as EngineError).code,
          'TRANSACTION_OPERATION_ERROR',
        );
      });
      // The one that got through committed; the tx survived the refusal.
      asserts.assertStrictEquals(engine.commitCount, 1);
      asserts.assertStrictEquals(engine.rollbackCount, 0);
      await engine.disconnect();
    });

    it('transaction(fn): a swallowed top-level statement failure never reports a false commit', async () => {
      const engine = new FailingSQLEngine('cb-false-success');
      await engine.connect();
      engine.failOn = /FAIL_STMT/;
      // The callback catches the failure and returns normally. But a failed
      // top-level statement (no savepoint) already auto-rolled-back the whole
      // transaction, so returning "success" would be a lie — surface it.
      const err = await asserts.assertRejects(
        () =>
          engine.transaction(async (tx) => {
            try {
              await tx.execute({ sql: 'FAIL_STMT' });
            } catch {
              // swallow — pretend we recovered without a savepoint
            }
            return 'looks-ok';
          }),
        EngineError,
      );
      asserts.assertEquals(
        (err as EngineError).code,
        'TRANSACTION_OPERATION_ERROR',
      );
      engine.failOn = undefined;
      // Rolled back exactly once; never committed.
      asserts.assertStrictEquals(engine.commitCount, 0);
      asserts.assertStrictEquals(engine.rollbackCount, 1);
      await engine.disconnect();
    });

    it('transaction(fn): a leaked scope whose name is reused is refused (no cross-tx bleed)', async () => {
      const engine = new FakeSQLEngine('cb-stale-scope');
      await engine.connect();
      let leaked: TransactionScope | undefined;
      await engine.transaction(async (tx) => {
        leaked = tx; // escape the callback (misuse)
        await tx.execute({ sql: 'SELECT 1;' });
      }, { name: 'reused' });
      // The first tx committed and its record is gone. Open a *new* tx that
      // reuses the same name — the leaked scope must pin to its own (dead)
      // transaction instance and refuse, not silently run on the new one.
      const tx2 = await engine.beginTransaction({ name: 'reused' });
      const err = await asserts.assertRejects(
        () => leaked!.execute({ sql: 'SELECT 2;' }),
        EngineError,
      );
      asserts.assertEquals((err as EngineError).code, 'TRANSACTION_NOT_FOUND');
      await engine.rollbackTransaction(tx2);
      await engine.disconnect();
    });

    it('should rollback transaction successfully', async () => {
      const engine = new FakeSQLEngine('test');
      await engine.connect();

      const txId = await engine.beginTransaction();
      await engine.rollbackTransaction(txId);

      asserts.assertStrictEquals(engine.rollbackCount, 1);
      asserts.assertStrictEquals(engine.poolStats.active, 0);

      await engine.disconnect();
    });

    it('should execute queries within transaction', async () => {
      const engine = new FakeSQLEngine('test');
      await engine.connect();

      const txId = await engine.beginTransaction();

      const result = await engine.execute({
        sql: 'UPDATE users SET active = true WHERE id = :id:',
        params: { id: 1 },
        transactionId: txId,
      });

      asserts.assertStrictEquals(result.transactionId, txId);

      await engine.commitTransaction(txId);
      await engine.disconnect();
    });

    it('should throw if transaction not found', async () => {
      const engine = new FakeSQLEngine('test');
      await engine.connect();

      await asserts.assertRejects(
        async () => {
          await engine.execute({
            sql: 'SELECT 1;',
            transactionId: 'nonexistent-tx',
          });
        },
        EngineError,
      );

      await engine.disconnect();
    });

    it('should be idempotent - commit already committed transaction', async () => {
      const engine = new FakeSQLEngine('test');
      await engine.connect();

      const txId = await engine.beginTransaction();
      await engine.commitTransaction(txId);

      // Should not throw
      await engine.commitTransaction(txId);

      // Should still be 1 (idempotent)
      asserts.assertStrictEquals(engine.commitCount, 1);

      await engine.disconnect();
    });

    it('should be idempotent - rollback already rolled back transaction', async () => {
      const engine = new FakeSQLEngine('test');
      await engine.connect();

      const txId = await engine.beginTransaction();
      await engine.rollbackTransaction(txId);

      // Should not throw
      await engine.rollbackTransaction(txId);

      // Should still be 1 (idempotent)
      asserts.assertStrictEquals(engine.rollbackCount, 1);

      await engine.disconnect();
    });

    it('should timeout transaction if not committed', async () => {
      const engine = new FakeSQLEngine('test', {
        transactionTimeout: 0.1, // 100ms
      });
      await engine.connect();

      const txId = await engine.beginTransaction();

      // Wait for timeout
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Transaction should be auto-rolled back
      asserts.assertStrictEquals(engine.rollbackCount, 1);
      asserts.assertStrictEquals(engine.poolStats.active, 0);

      await engine.disconnect();
    });

    it('should destroy (not release) the reserved client when the timeout fires mid-statement', async () => {
      // A transaction is bound to one connection. If the auto-timeout fires
      // while a statement is still in flight on that connection, the timer
      // must NOT write ROLLBACK onto the same socket the query is reading
      // from (protocol corruption) and must NOT hand the client back to the
      // pool (a concurrent acquirer would receive a live, mid-statement
      // connection). It must tear the connection down instead.
      const engine = new FakeSQLEngine('tx-timeout-busy', {
        transactionTimeout: 0.05, // 50ms
        executeDelay: 250, // statement stays in flight for 250ms
      });
      await engine.connect();

      const txId = await engine.beginTransaction();
      const destroyedBefore = engine.destroyed;
      const idleBefore = engine.poolStats.idle;

      // Kick off a statement on the transaction WITHOUT awaiting — it is
      // still in flight (busy) when the 50ms timeout fires. Swallow its
      // eventual settlement; the point under test is the timeout's handling.
      const inflight = engine
        .execute({ sql: 'SELECT 1;', transactionId: txId })
        .then(() => {}, () => {});

      // Wait past the timeout (50ms) but before the statement finishes (250ms).
      await new Promise((resolve) => setTimeout(resolve, 150));

      // The busy connection was destroyed, never recycled.
      asserts.assertStrictEquals(engine.destroyed, destroyedBefore + 1);
      // No ROLLBACK was written onto the in-flight socket.
      asserts.assertStrictEquals(engine.rollbackCount, 0);
      // Nothing was returned to the idle pool for a future acquirer to grab.
      asserts.assertStrictEquals(engine.poolStats.idle, idleBefore);
      asserts.assertStrictEquals(engine.poolStats.active, 0);
      // The transaction record is gone.
      asserts.assertStrictEquals(
        (engine as unknown as { _transactions: Map<string, unknown> })
          ._transactions.size,
        0,
      );

      await inflight;
      await engine.disconnect();
    });

    it('should support custom transaction name', async () => {
      const engine = new FakeSQLEngine('test');
      await engine.connect();

      const options: EngineTransactionOptions = { name: 'my-custom-tx' };
      const txId = await engine.beginTransaction(options);

      asserts.assertStrictEquals(txId, 'my-custom-tx');

      await engine.rollbackTransaction(txId);
      await engine.disconnect();
    });

    it('should support custom transaction timeout', async () => {
      const engine = new FakeSQLEngine('test');
      await engine.connect();

      const txId = await engine.beginTransaction({ timeout: 300 });

      asserts.assert(typeof txId === 'string');

      await engine.rollbackTransaction(txId);
      await engine.disconnect();
    });

    it('should auto-rollback on query failure when enabled', async () => {
      const engine = new FakeSQLEngine('test', {
        failExecute: true,
        autoRollbackOnFailure: true,
      });
      await engine.connect();

      const txId = await engine.beginTransaction();

      try {
        await engine.execute({
          sql: 'SELECT 1;',
          transactionId: txId,
        });
        asserts.fail('Should have thrown');
      } catch {
        // Expected
      }

      // Should auto-rollback
      asserts.assertStrictEquals(engine.rollbackCount, 1);

      await engine.disconnect();
    });

    it('should throw if transactions not supported', async () => {
      class NoTxEngine extends FakeSQLEngine {
        public override readonly Capabilities: SQLEngineCapabilities = {
          pooledConnections: true,
          transactions: false,
          preparedStatements: false,
          advisoryLock: false,
          inPlaceAlter: false,
          referentialActions: false,
        };
      }

      const engine = new NoTxEngine('test');
      await engine.connect();

      await asserts.assertRejects(
        async () => await engine.beginTransaction(),
        EngineError,
      );

      await engine.disconnect();
    });

    it('should rollback all active transactions', async () => {
      const engine = new FakeSQLEngine('test', { pool: { min: 3, max: 5 } });
      await engine.connect();

      const tx1 = await engine.beginTransaction();
      const tx2 = await engine.beginTransaction();
      const tx3 = await engine.beginTransaction();

      await engine.rollbackAllTransactions();

      asserts.assertStrictEquals(engine.rollbackCount, 3);
      asserts.assertStrictEquals(engine.poolStats.active, 0);

      await engine.disconnect();
    });

    it('should provide transaction helper with commit/rollback', async () => {
      const engine = new FakeSQLEngine('test');
      await engine.connect();

      const tx = await engine.transaction();

      asserts.assert(typeof tx.id === 'string');
      asserts.assert(typeof tx.commit === 'function');
      asserts.assert(typeof tx.rollback === 'function');
      asserts.assert(typeof tx.execute === 'function');

      const result = await tx.execute({ sql: 'SELECT 1;' });
      asserts.assertStrictEquals(result.transactionId, tx.id);

      await tx.commit();

      asserts.assertStrictEquals(engine.commitCount, 1);

      await engine.disconnect();
    });
  });

  describe('Query Standardization', () => {
    it('should trim and add semicolon to SQL', () => {
      const engine = new FakeSQLEngine('test');

      const result = engine.testStandardizeQuery({
        sql: '  SELECT * FROM users  ',
      });

      asserts.assertStrictEquals(result.sql, 'SELECT * FROM users;');
    });

    it('should replace named parameters', () => {
      const engine = new FakeSQLEngine('test');

      const result = engine.testStandardizeQuery({
        sql: 'SELECT * FROM users WHERE id = :id: AND name = :name:',
        params: { id: 1, name: 'Alice' },
      });

      asserts.assertStrictEquals(
        result.sql,
        'SELECT * FROM users WHERE id = :id AND name = :name;',
      );
    });

    it('should throw MISSING_PARAMETERS if parameter missing', () => {
      const engine = new FakeSQLEngine('test');

      asserts.assertThrows(
        () => {
          engine.testStandardizeQuery({
            sql: 'SELECT * FROM users WHERE id = :id: AND name = :name:',
            params: { id: 1 }, // Missing 'name'
          });
        },
        EngineError,
      );
    });

    it('should handle queries without parameters', () => {
      const engine = new FakeSQLEngine('test');

      const result = engine.testStandardizeQuery({
        sql: 'SELECT * FROM users',
      });

      asserts.assertStrictEquals(result.sql, 'SELECT * FROM users;');
    });

    it('should not replace time literals like 00:00:00', () => {
      const engine = new FakeSQLEngine('test');

      const result = engine.testStandardizeQuery({
        sql: "SELECT * FROM events WHERE time = '12:30:00'",
      });

      asserts.assertStrictEquals(
        result.sql,
        "SELECT * FROM events WHERE time = '12:30:00';",
      );
    });

    it('should not replace Postgres-style casts like ::integer', () => {
      const engine = new FakeSQLEngine('test');

      const result = engine.testStandardizeQuery({
        sql: "SELECT '123'::integer",
      });

      asserts.assertStrictEquals(result.sql, "SELECT '123'::integer;");
    });

    it('should encode parameter values', () => {
      const engine = new FakeSQLEngine('test');

      const result = engine.testStandardizeQuery({
        sql: 'SELECT :id:',
        params: { id: 123 },
      });

      asserts.assertStrictEquals(result.params?.id, 123);
    });

    it('should handle parameters with underscores', () => {
      const engine = new FakeSQLEngine('test');

      const result = engine.testStandardizeQuery({
        sql: 'SELECT :user_id: AND :order_id:',
        params: { user_id: 1, order_id: 2 },
      });

      asserts.assert(result.sql.includes(':user_id'));
      asserts.assert(result.sql.includes(':order_id'));
    });
  });

  describe('Value Encoding', () => {
    it('should return value unchanged by default', () => {
      const engine = new FakeSQLEngine('test');

      asserts.assertStrictEquals(engine.testEncodeValue(123), 123);
      asserts.assertStrictEquals(engine.testEncodeValue('test'), 'test');
      asserts.assertStrictEquals(engine.testEncodeValue(true), true);
      asserts.assertStrictEquals(engine.testEncodeValue(null), null);
    });
  });

  describe('Error Wrapping', () => {
    it('should wrap native errors as EngineError', () => {
      const engine = new FakeSQLEngine('test');

      const nativeError = new Error('Connection timeout');
      const wrapped = engine.testWrapDriverError(nativeError, {
        sql: 'SELECT 1;',
      });

      asserts.assert(wrapped instanceof EngineError);
      asserts.assertStrictEquals(wrapped.code, 'QUERY_EXECUTION_FAILED');
      asserts.assert(
        (wrapped.context.reason as string)?.includes('Connection timeout'),
      );
    });

    it('should pass through EngineError unchanged', () => {
      const engine = new FakeSQLEngine('test');

      const engineError = new EngineError('SYNTAX_ERROR', {
        instanceId: 'FAKE_SQL::test',
        reason: 'Invalid SQL',
      });

      const wrapped = engine.testWrapDriverError(engineError, {
        sql: 'SELECT 1;',
      });

      asserts.assertStrictEquals(wrapped, engineError);
    });

    it('should handle non-Error objects', () => {
      const engine = new FakeSQLEngine('test');

      const wrapped = engine.testWrapDriverError('String error', {
        sql: 'SELECT 1;',
      });

      asserts.assert(wrapped instanceof EngineError);
      asserts.assertStrictEquals(wrapped.context.reason, 'String error');
    });
  });

  describe('Statistics', () => {
    it('should provide query statistics', async () => {
      const engine = new FakeSQLEngine('test');
      await engine.connect();

      await engine.execute({ sql: 'SELECT 1;' });
      await engine.execute({ sql: 'SELECT 2;' });

      const stats = engine.queryStats;

      asserts.assertStrictEquals(stats.totalQueries, 2);
      asserts.assertStrictEquals(stats.successfulQueries, 2);
      asserts.assertStrictEquals(stats.failedQueries, 0);
      asserts.assert(stats.averageExecutionTimeMs >= 0);

      await engine.disconnect();
    });

    it('should provide combined statistics', async () => {
      const engine = new FakeSQLEngine('test');
      await engine.connect();

      await engine.execute({ sql: 'SELECT 1;' });

      const stats = engine.stats;

      asserts.assert(stats.pool !== undefined);
      asserts.assert(stats.query !== undefined);
      asserts.assertStrictEquals(stats.query.totalQueries, 1);

      await engine.disconnect();
    });

    it('should track slow queries in statistics', async () => {
      const engine = new FakeSQLEngine('test', {
        slowQueryThreshold: 0.01,
        executeDelay: 50,
      });
      await engine.connect();

      await engine.execute({ sql: 'SELECT 1;' });

      const stats = engine.queryStats;
      asserts.assertStrictEquals(stats.slowQueries, 1);

      await engine.disconnect();
    });

    it('should calculate average execution time (sanity: three fast queries)', async () => {
      const engine = new FakeSQLEngine('test');
      await engine.connect();

      await engine.execute({ sql: 'SELECT 1;' });
      await engine.execute({ sql: 'SELECT 2;' });
      await engine.execute({ sql: 'SELECT 3;' });

      const stats = engine.queryStats;
      asserts.assert(stats.averageExecutionTimeMs >= 0);
      asserts.assert(stats.averageExecutionTimeMs < 1000); // Should be fast

      await engine.disconnect();
    });

    it('should average over successful queries only, ignoring failures', () => {
      // `averageExecutionTimeMs` accumulates only successful timings, so the
      // denominator must be the successful-query count — not the total, which
      // also counts failures. With a total-count denominator, the interleaved
      // failure below biases the mean downward (to ~17.5 instead of 20).
      const engine = new FakeSQLEngine('avg');

      engine.testRecordQueryStats(10, false, true); // avg = 10
      engine.testRecordQueryStats(999, false, false); // failure — no effect on avg
      engine.testRecordQueryStats(20, false, true); // avg = (10 + 20) / 2 = 15
      engine.testRecordQueryStats(30, false, true); // avg = (15*2 + 30) / 3 = 20

      const stats = engine.queryStats;
      asserts.assertStrictEquals(stats.totalQueries, 4);
      asserts.assertStrictEquals(stats.successfulQueries, 3);
      asserts.assertStrictEquals(stats.failedQueries, 1);
      // Exact mean of the three successful timings (10, 20, 30) = 20.
      asserts.assertAlmostEquals(stats.averageExecutionTimeMs, 20, 1e-9);
    });
  });

  describe('Lifecycle', () => {
    it('should rollback transactions on disconnect', async () => {
      const engine = new FakeSQLEngine('test', { pool: { min: 2, max: 5 } });
      await engine.connect();

      const tx1 = await engine.beginTransaction();
      const tx2 = await engine.beginTransaction();

      await engine.disconnect();

      // Should have rolled back both transactions
      asserts.assertStrictEquals(engine.rollbackCount, 2);
      asserts.assertStrictEquals(engine.poolStats.active, 0);
    });

    it('should handle disconnect when no active transactions', async () => {
      const engine = new FakeSQLEngine('test');
      await engine.connect();

      await engine.disconnect();

      asserts.assertStrictEquals(engine.status, 'CLOSED');
    });
  });

  describe('Edge Cases', () => {
    it('should handle multiple semicolons in SQL', () => {
      const engine = new FakeSQLEngine('test');

      const result = engine.testStandardizeQuery({
        sql: 'SELECT 1;;',
      });

      // Current implementation only removes trailing semicolons once
      asserts.assertStrictEquals(result.sql, 'SELECT 1;;');
    });

    it('should handle empty parameter object', () => {
      const engine = new FakeSQLEngine('test');

      const result = engine.testStandardizeQuery({
        sql: 'SELECT 1',
        params: {},
      });

      asserts.assertStrictEquals(result.sql, 'SELECT 1;');
    });

    it('should throw if transaction name already exists', async () => {
      const engine = new FakeSQLEngine('test');
      await engine.connect();

      const txId = await engine.beginTransaction({ name: 'duplicate' });

      await asserts.assertRejects(
        async () => await engine.beginTransaction({ name: 'duplicate' }),
        EngineError,
      );

      await engine.rollbackTransaction(txId);
      await engine.disconnect();
    });

    it('should handle transaction timeout of 0 (no timeout)', async () => {
      const engine = new FakeSQLEngine('test', {
        transactionTimeout: 0,
      });
      await engine.connect();

      const txId = await engine.beginTransaction();

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should not timeout
      asserts.assertStrictEquals(engine.rollbackCount, 0);

      await engine.rollbackTransaction(txId);
      await engine.disconnect();
    });
  });

  describe('Transaction Error Handling', () => {
    it('should wrap non-EngineError on beginTransaction failure', async () => {
      const engine = new FakeSQLEngine('test', { failBegin: true });
      await engine.connect();

      await asserts.assertRejects(
        async () => await engine.beginTransaction(),
        EngineError,
      );

      await engine.disconnect();
    });

    it('should wrap non-EngineError on commitTransaction failure', async () => {
      const engine = new FakeSQLEngine('test', { failCommit: true });
      await engine.connect();

      const txId = await engine.beginTransaction();

      await asserts.assertRejects(
        async () => await engine.commitTransaction(txId),
        EngineError,
      );

      await engine.disconnect();
    });

    it('should wrap non-EngineError on rollbackTransaction failure', async () => {
      const engine = new FakeSQLEngine('test', { failRollback: true });
      await engine.connect();

      const txId = await engine.beginTransaction();

      await asserts.assertRejects(
        async () => await engine.rollbackTransaction(txId),
        EngineError,
      );

      await engine.disconnect();
    });

    it('should handle error during auto-rollback on query failure', async () => {
      const engine = new FakeSQLEngine('test', {
        failExecute: true,
        failRollback: true,
        autoRollbackOnFailure: true,
      });
      await engine.connect();

      const txId = await engine.beginTransaction();

      try {
        await engine.execute({
          sql: 'SELECT 1;',
          transactionId: txId,
        });
        asserts.fail('Should have thrown');
      } catch {
        // Expected - should swallow rollback error during auto-rollback
      }

      await engine.disconnect();
    });

    it('should destroy (not release) the client when auto-rollback fails', async () => {
      const engine = new FakeSQLEngine('test', {
        failExecute: true,
        failRollback: true,
        autoRollbackOnFailure: true,
      });
      await engine.connect();

      const txId = await engine.beginTransaction();
      const destroyedBefore = engine.destroyed;
      const idleBefore = engine.poolStats.idle;

      try {
        await engine.execute({ sql: 'SELECT 1;', transactionId: txId });
        asserts.fail('Should have thrown');
      } catch {
        // Expected — execute fails, auto-rollback fires and itself fails.
      }

      // ROLLBACK threw, so the likely-dead client must be destroyed, not
      // recycled back to the idle pool where the next acquirer would get it.
      asserts.assertStrictEquals(engine.destroyed, destroyedBefore + 1);
      asserts.assertStrictEquals(engine.poolStats.idle, idleBefore);
      asserts.assertStrictEquals(engine.poolStats.active, 0);

      await engine.disconnect();
    });

    it('should release (not destroy) the client on a clean rollback', async () => {
      const engine = new FakeSQLEngine('test', {
        failExecute: true,
        failRollback: false,
        autoRollbackOnFailure: true,
      });
      await engine.connect();

      const txId = await engine.beginTransaction();
      const destroyedBefore = engine.destroyed;

      try {
        await engine.execute({ sql: 'SELECT 1;', transactionId: txId });
        asserts.fail('Should have thrown');
      } catch {
        // Expected — execute fails, auto-rollback succeeds.
      }

      // Clean rollback → client is healthy → returned to the idle pool.
      asserts.assertStrictEquals(engine.destroyed, destroyedBefore);
      asserts.assert(engine.poolStats.idle >= 1);

      await engine.disconnect();
    });

    it('should handle errors in rollbackAllTransactions', async () => {
      class FailRollbackEngine extends FakeSQLEngine {
        protected override _rollbackTransaction(
          _client: any,
          _txId: string,
        ): void {
          this.rollbackCount++;
          throw new Error('Rollback failed');
        }
      }

      const engine = new FailRollbackEngine('test', {
        pool: { min: 2, max: 5 },
      });
      await engine.connect();

      const tx1 = await engine.beginTransaction();
      const tx2 = await engine.beginTransaction();

      // Should not throw even if rollback fails
      await engine.rollbackAllTransactions();

      // Should have attempted rollback on both
      asserts.assertStrictEquals(engine.rollbackCount, 2);

      await engine.disconnect();
    });

    it('should auto-connect during beginTransaction if not connected', async () => {
      const engine = new FakeSQLEngine('test');
      asserts.assertStrictEquals(engine.status, 'CLOSED');

      const txId = await engine.beginTransaction();

      asserts.assertStrictEquals(engine.status, 'READY');
      await engine.rollbackTransaction(txId);
      await engine.disconnect();
    });

    it('should clear transaction timeout on commit', async () => {
      const engine = new FakeSQLEngine('test', {
        transactionTimeout: 10,
      });
      await engine.connect();

      const txId = await engine.beginTransaction();

      // Commit should clear the timeout
      await engine.commitTransaction(txId);

      // Wait to ensure timeout doesn't fire
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should not have auto-rolled back
      asserts.assertStrictEquals(engine.rollbackCount, 0);

      await engine.disconnect();
    });

    it('should clear transaction timeout on rollback', async () => {
      const engine = new FakeSQLEngine('test', {
        transactionTimeout: 10,
      });
      await engine.connect();

      const txId = await engine.beginTransaction();

      // Rollback should clear the timeout
      await engine.rollbackTransaction(txId);

      // Wait to ensure timeout doesn't fire
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should have exactly one rollback (manual, not timeout)
      asserts.assertStrictEquals(engine.rollbackCount, 1);

      await engine.disconnect();
    });

    it('should do nothing when committing already ended transaction', async () => {
      const engine = new FakeSQLEngine('test');
      await engine.connect();

      const txId = await engine.beginTransaction();
      await engine.rollbackTransaction(txId);

      // Try to commit after rollback - should be no-op
      await engine.commitTransaction(txId);

      asserts.assertStrictEquals(engine.commitCount, 0);
      asserts.assertStrictEquals(engine.rollbackCount, 1);

      await engine.disconnect();
    });

    it('should do nothing when rolling back already ended transaction', async () => {
      const engine = new FakeSQLEngine('test');
      await engine.connect();

      const txId = await engine.beginTransaction();
      await engine.commitTransaction(txId);

      // Try to rollback after commit - should be no-op
      await engine.rollbackTransaction(txId);

      asserts.assertStrictEquals(engine.commitCount, 1);
      asserts.assertStrictEquals(engine.rollbackCount, 0);

      await engine.disconnect();
    });

    it('should throw when commit called on engine without transaction support', async () => {
      class NoTxEngine extends FakeSQLEngine {
        public override readonly Capabilities = {
          pooledConnections: true,
          transactions: false,
          preparedStatements: false,
          advisoryLock: false,
          inPlaceAlter: false,
          referentialActions: false,
        };

        protected override _ping(_resource: any): boolean {
          return true;
        }
      }

      const engine = new NoTxEngine('test');
      await engine.connect();

      await asserts.assertRejects(
        async () => await engine.commitTransaction('fake-tx'),
        EngineError,
      );

      await engine.disconnect();
    });

    it('should throw when rollback called on engine without transaction support', async () => {
      class NoTxEngine extends FakeSQLEngine {
        public override readonly Capabilities = {
          pooledConnections: true,
          transactions: false,
          preparedStatements: false,
          advisoryLock: false,
          inPlaceAlter: false,
          referentialActions: false,
        };

        protected override _ping(_resource: any): boolean {
          return true;
        }
      }

      const engine = new NoTxEngine('test');
      await engine.connect();

      await asserts.assertRejects(
        async () => await engine.rollbackTransaction('fake-tx'),
        EngineError,
      );

      await engine.disconnect();
    });
  });

  describe('Advanced Query Scenarios', () => {
    it('should handle queries with no parameters object', async () => {
      const engine = new FakeSQLEngine('test');

      const result = engine.testStandardizeQuery({
        sql: 'SELECT * FROM users',
      });

      asserts.assertStrictEquals(result.params, undefined);
      asserts.assert(result.sql.endsWith(';'));

      await engine.disconnect();
    });

    it('should preserve transactionId in query result', async () => {
      const engine = new FakeSQLEngine('test');
      await engine.connect();

      const txId = await engine.beginTransaction();

      const result = await engine.execute({
        sql: 'SELECT 1;',
        transactionId: txId,
      });

      asserts.assertStrictEquals(result.transactionId, txId);

      await engine.rollbackTransaction(txId);
      await engine.disconnect();
    });

    it('should update average execution time across multiple queries', async () => {
      const engine = new FakeSQLEngine('test');
      await engine.connect();

      await engine.execute({ sql: 'SELECT 1;' });
      await engine.execute({ sql: 'SELECT 2;' });
      await engine.execute({ sql: 'SELECT 3;' });
      await engine.execute({ sql: 'SELECT 4;' });
      await engine.execute({ sql: 'SELECT 5;' });

      const stats = engine.queryStats;
      asserts.assertStrictEquals(stats.totalQueries, 5);
      asserts.assert(stats.averageExecutionTimeMs >= 0);

      await engine.disconnect();
    });

    it('should count slow queries correctly', async () => {
      const engine = new FakeSQLEngine('test', {
        slowQueryThreshold: 0.01, // 10ms
        executeDelay: 50, // 50ms delay
      });
      await engine.connect();

      await engine.execute({ sql: 'SELECT 1;' });
      await engine.execute({ sql: 'SELECT 2;' });

      const stats = engine.queryStats;
      asserts.assertStrictEquals(stats.slowQueries, 2);

      await engine.disconnect();
    });

    it('should handle empty parameter values', () => {
      const engine = new FakeSQLEngine('test');

      const result = engine.testStandardizeQuery({
        sql: 'SELECT :id:',
        params: { id: '' },
      });

      asserts.assertStrictEquals(result.params?.id, '');
    });

    it('should handle null parameter values', () => {
      const engine = new FakeSQLEngine('test');

      const result = engine.testStandardizeQuery({
        sql: 'SELECT :val:',
        params: { val: null },
      });

      asserts.assertStrictEquals(result.params?.val, null);
    });

    it('should pass through EngineError from _wrapDriverError', () => {
      const engine = new FakeSQLEngine('test');

      const originalError = new EngineError('SYNTAX_ERROR', {
        instanceId: engine.instanceId,
        reason: 'Invalid SQL',
      });

      const wrapped = engine.testWrapDriverError(originalError, {
        sql: 'SELECT 1;',
      });

      asserts.assertStrictEquals(wrapped, originalError);
    });
  });

  // Round-3 finding #1: a plain query that fails on a transport error left the
  // connection in the pool (execute() always released in `finally`). Since the
  // connection's socket is dead, the next acquire re-uses it and every later
  // query fails until restart. execute() must destroy a connection that no
  // longer validates after a failure.
  describe('Connection poisoning on transport error', () => {
    it('destroys a connection poisoned by a transport error, not recycles it', async () => {
      const engine = new TransportFailSQLEngine('poison-1');
      await engine.connect();
      engine.failNext = true;

      await asserts.assertRejects(
        () => engine.execute({ sql: 'SELECT 1' }),
        EngineError,
      );

      // The dead connection was destroyed, not returned to idle.
      asserts.assertStrictEquals(engine.poolStats.idle, 0);
      asserts.assert(engine.destroyed >= 1);

      // A subsequent query self-heals on a freshly created connection.
      const createdBefore = engine.created;
      const result = await engine.execute({ sql: 'SELECT 1' });
      asserts.assert(result.count >= 0);
      asserts.assert(engine.created > createdBefore);

      await engine.disconnect();
    });

    it('keeps the connection after an ordinary query error (socket still alive)', async () => {
      // `failExecute` throws without closing the client — a server-side query
      // error, not a transport failure. The connection must be reused, not
      // needlessly destroyed.
      const engine = new FakeSQLEngine('poison-2', { failExecute: true });
      await engine.connect();

      await asserts.assertRejects(
        () => engine.execute({ sql: 'SELECT 1' }),
        EngineError,
      );

      asserts.assertStrictEquals(engine.poolStats.idle, 1);
      asserts.assertStrictEquals(engine.destroyed, 0);

      await engine.disconnect();
    });
  });
});
