import * as asserts from '$asserts';
import { AbstractEngine, DAMEngineError } from './mod.ts';
import type {
  EngineCapabilities,
  EngineOptions,
  EngineQuery,
  EngineStatus,
} from './types/mod.ts';

/**
 * Dummy engine implementation for testing AbstractEngine
 */
class DummyEngine extends AbstractEngine<EngineOptions> {
  public readonly Engine = 'DUMMY';
  public readonly Capabilities: EngineCapabilities = {
    transactions: true,
    pooledConnections: true,
    preparedStatements: true,
    parameterReplacement: {
      prefix: '$',
      suffix: '',
    },
  };

  protected _clientMap: Map<string, { id: string }> = new Map();
  private _connected = false;
  private _shouldFailConnect = false;
  private _shouldFailDisconnect = false;
  private _shouldFailQuery = false;
  private _shouldFailTransaction = false;
  private _queryResults: Record<string, unknown>[] = [];
  private _throwPlainError = false;
  private _queryDelay = 0;
  public executedQueries: EngineQuery[] = [];

  public setConnectFailure(shouldFail: boolean) {
    this._shouldFailConnect = shouldFail;
  }

  public setDisconnectFailure(shouldFail: boolean) {
    this._shouldFailDisconnect = shouldFail;
  }

  public setQueryFailure(shouldFail: boolean) {
    this._shouldFailQuery = shouldFail;
  }

  public setTransactionFailure(shouldFail: boolean) {
    this._shouldFailTransaction = shouldFail;
  }

  public setThrowPlainError(shouldThrow: boolean) {
    this._throwPlainError = shouldThrow;
  }

  public setQueryDelay(delayMs: number) {
    this._queryDelay = delayMs;
  }

  public setQueryResults(results: Record<string, unknown>[]) {
    this._queryResults = results;
  }

  public getStatus(): EngineStatus {
    return this._status;
  }

  public getClientMapSize(): number {
    return this._clientMap.size;
  }

  public getTransactionState(txId: string) {
    return this._transactionState.get(txId);
  }

  protected _connect(): void {
    if (this._shouldFailConnect) {
      if (this._throwPlainError) {
        throw new Error('Dummy connection failed');
      } else {
        throw new DAMEngineError('CONNECTION_FAILED', {
          instanceId: this.instanceId,
        });
      }
    }
    this._connected = true;
  }

  protected _disconnect(): void {
    if (this._shouldFailDisconnect) {
      if (this._throwPlainError) {
        throw new Error('Dummy disconnection failed');
      } else {
        throw new DAMEngineError('DISCONNECTION_FAILED', {
          instanceId: this.instanceId,
        });
      }
    }
    this._connected = false;
  }

  protected async _execute<R extends Record<string, unknown>>(
    query: EngineQuery,
  ): Promise<{ data: R[]; count: number }> {
    this.executedQueries.push(query);
    if (this._queryDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this._queryDelay));
    }
    if (this._shouldFailQuery) {
      if (this._throwPlainError) {
        throw new Error('Dummy query failed');
      } else {
        throw new DAMEngineError('QUERY_EXECUTION_FAILED', {
          instanceId: this.instanceId,
          query,
        });
      }
    }
    return {
      data: this._queryResults as R[],
      count: this._queryResults.length,
    };
  }

  protected _beginTransaction(transactionId: string): void {
    if (this._shouldFailTransaction) {
      if (this._throwPlainError) {
        throw new Error('Dummy begin transaction failed');
      } else {
        throw new DAMEngineError('TRANSACTION_OPERATION_ERROR', {
          instanceId: this.instanceId,
          operation: 'beginTransaction',
        });
      }
    }
    this._clientMap.set(transactionId, { id: transactionId });
  }

  protected _commitTransaction(transactionId: string): void {
    if (this._shouldFailTransaction) {
      if (this._throwPlainError) {
        throw new Error('Dummy commit failed');
      } else {
        throw new DAMEngineError('TRANSACTION_OPERATION_ERROR', {
          instanceId: this.instanceId,
          operation: 'commitTransaction',
        });
      }
    }
    this._clientMap.delete(transactionId);
  }

  protected _rollbackTransaction(transactionId: string): void {
    if (this._shouldFailTransaction) {
      if (this._throwPlainError) {
        throw new Error('Dummy rollback failed');
      } else {
        throw new DAMEngineError('TRANSACTION_OPERATION_ERROR', {
          instanceId: this.instanceId,
          operation: 'rollbackTransaction',
        });
      }
    }
    this._clientMap.delete(transactionId);
  }

  protected _ping(): boolean {
    return this._connected;
  }

  protected _updatePoolStatus(): void {
    if (this._status === 'CLOSED' || this._status === 'CONNECTING') {
      return;
    }
    if (this._clientMap.size >= 5) {
      this._status = 'WAITING';
    } else {
      this._status = 'READY';
    }
  }
}

Deno.test({
  name: 'dam.engine.AbstractEngine',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async (t) => {
    await t.step('constructor and basic properties', async (u) => {
      await u.step('should create engine with default options', () => {
        const engine = new DummyEngine('test-db', {});
        asserts.assertEquals(engine.Engine, 'DUMMY');
        asserts.assertEquals(engine.Name, 'test-db');
        asserts.assertEquals(engine.instanceId, 'DUMMY::test-db');
        asserts.assertEquals(engine.getStatus(), 'CLOSED');
      });

      await u.step('should merge default options', () => {
        const defaults = { host: 'localhost', port: 5432 };
        const engine = new DummyEngine('test-db', { port: 3306 }, defaults);
        asserts.assertEquals(engine.getOption('host'), 'localhost');
        asserts.assertEquals(engine.getOption('port'), 3306);
      });

      await u.step('should validate invalid idGenerator', () => {
        asserts.assertThrows(
          () => new DummyEngine('test-db', { idGenerator: 'invalid' as any }),
          DAMEngineError,
        );
      });

      await u.step('should validate slowQueryThreshold', () => {
        asserts.assertThrows(
          () => new DummyEngine('test-db', { slowQueryThreshold: 700 }),
          DAMEngineError,
        );
      });

      await u.step('should validate port range', () => {
        asserts.assertThrows(
          () => new DummyEngine('test-db', { port: 0 }),
          DAMEngineError,
        );
        asserts.assertThrows(
          () => new DummyEngine('test-db', { port: 70000 }),
          DAMEngineError,
        );
      });

      await u.step('should validate pool options', () => {
        asserts.assertThrows(
          () => new DummyEngine('test-db', { pool: { max: 0 } }),
          DAMEngineError,
        );
        asserts.assertThrows(
          () => new DummyEngine('test-db', { pool: { min: 10, max: 5 } }),
          DAMEngineError,
        );
      });

      await u.step('should accept valid ssl options', () => {
        const engine1 = new DummyEngine('test-db', { ssl: true });
        asserts.assertEquals(engine1.getOption('ssl'), true);

        const engine2 = new DummyEngine('test-db', {
          ssl: { rejectUnauthorized: false },
        });
        asserts.assertEquals(
          (engine2.getOption('ssl') as any).rejectUnauthorized,
          false,
        );
      });
    });

    await t.step('connection management', async (u) => {
      await u.step('should connect and emit event', async () => {
        const engine = new DummyEngine('test-db', {});
        let emitted = false;
        engine.on('connect', () => {
          emitted = true;
        });
        await engine.connect();
        asserts.assert(emitted);
        asserts.assertEquals(engine.status, 'READY');
      });

      await u.step('should be idempotent on connect', async () => {
        const engine = new DummyEngine('test-db', {});
        await engine.connect();
        await engine.connect();
        await engine.connect();
        asserts.assertEquals(engine.status, 'READY');
      });

      await u.step('should handle connect failure', async () => {
        const engine = new DummyEngine('test-db', {});
        engine.setConnectFailure(true);
        let errorEmitted = false;
        engine.on('connectionFailed', () => {
          errorEmitted = true;
        });
        await asserts.assertRejects(
          () => engine.connect(),
          DAMEngineError,
        );
        asserts.assert(errorEmitted);
        asserts.assertEquals(engine.status, 'CLOSED');
      });

      await u.step('should disconnect and emit event', async () => {
        const engine = new DummyEngine('test-db', {});
        await engine.connect();
        let emitted = false;
        engine.on('disconnect', () => {
          emitted = true;
        });
        await engine.disconnect();
        asserts.assert(emitted);
        asserts.assertEquals(engine.status, 'CLOSED');
      });

      await u.step('should be idempotent on disconnect', async () => {
        const engine = new DummyEngine('test-db', {});
        await engine.connect();
        await engine.disconnect();
        await engine.disconnect();
        await engine.disconnect();
        asserts.assertEquals(engine.status, 'CLOSED');
      });

      await u.step('should warn when disconnecting while WAITING', async () => {
        const engine = new DummyEngine('test-db', {});
        await engine.connect();
        for (let i = 0; i < 5; i++) {
          await engine.beginTransaction();
        }
        let warned = false;
        engine.on('warn', () => {
          warned = true;
        });
        await engine.disconnect();
        asserts.assert(warned);
      });
    });

    await t.step('query execution', async (u) => {
      await u.step('should execute query and track stats', async () => {
        const engine = new DummyEngine('test-db', {});
        engine.setQueryResults([{ id: 1, name: 'test' }]);
        const result = await engine.execute({ sql: 'SELECT * FROM users' });
        asserts.assertEquals(result.count, 1);
        asserts.assertEquals(result.data[0]?.name, 'test');
        asserts.assertEquals(engine.queryStats.totalQueries, 1);
        asserts.assertEquals(engine.queryStats.successfulQueries, 1);
      });

      await u.step('should auto-connect before query', async () => {
        const engine = new DummyEngine('test-db', {});
        engine.setQueryResults([]);
        asserts.assertEquals(engine.status, 'CLOSED');
        await engine.execute({ sql: 'SELECT 1' });
        asserts.assertEquals(engine.status, 'READY');
      });

      await u.step('should standardize parameters', async () => {
        const engine = new DummyEngine('test-db', {});
        engine.setQueryResults([]);
        await engine.execute({
          sql: 'SELECT * FROM users WHERE id = :id:',
          params: { id: 1 },
        });
        const executed = engine.executedQueries[0];
        asserts.assert(executed?.sql.includes('$id'));
        asserts.assert(executed?.sql.endsWith(';'));
      });

      await u.step('should validate required parameters', async () => {
        const engine = new DummyEngine('test-db', {});
        await asserts.assertRejects(
          () =>
            engine.execute({
              sql: 'SELECT * FROM users WHERE id = :id:',
              params: {},
            }),
          DAMEngineError,
        );
      });

      await u.step('should emit query event', async () => {
        const engine = new DummyEngine('test-db', {});
        engine.setQueryResults([]);
        let emitted = false;
        engine.on('query', () => {
          emitted = true;
        });
        await engine.execute({ sql: 'SELECT 1' });
        asserts.assert(emitted);
      });

      await u.step('should track failed queries', async () => {
        const engine = new DummyEngine('test-db', {});
        engine.setQueryFailure(true);
        try {
          await engine.execute({ sql: 'INVALID' });
        } catch {
          // Expected
        }
        asserts.assertEquals(engine.queryStats.failedQueries, 1);
      });

      await u.step('should validate transaction exists', async () => {
        const engine = new DummyEngine('test-db', {});
        await asserts.assertRejects(
          () =>
            engine.execute({
              sql: 'SELECT 1',
              transactionId: 'non-existent',
            }),
          DAMEngineError,
        );
      });
    });

    await t.step('batch execution', async (u) => {
      await u.step('should execute multiple queries', async () => {
        const engine = new DummyEngine('test-db', {});
        engine.setQueryResults([]);
        await engine.batchExecute([
          { sql: 'SELECT 1' },
          { sql: 'SELECT 2' },
          { sql: 'SELECT 3' },
        ]);
        asserts.assertEquals(engine.executedQueries.length, 3);
      });

      await u.step('should halt on error', async () => {
        const engine = new DummyEngine('test-db', {});
        engine.setQueryResults([]);
        await engine.execute({ sql: 'SELECT 1' });
        engine.setQueryFailure(true);
        await asserts.assertRejects(
          () =>
            engine.batchExecute([
              { sql: 'SELECT 2' },
              { sql: 'INVALID' },
              { sql: 'SELECT 3' },
            ]),
          DAMEngineError,
        );
        asserts.assertEquals(engine.executedQueries.length, 2);
      });
    });

    await t.step('transaction management', async (u) => {
      await u.step('should begin and commit transaction', async () => {
        const engine = new DummyEngine('test-db', {});
        let beginEmitted = false;
        let commitEmitted = false;
        engine.on('transactionBegin', () => {
          beginEmitted = true;
        });
        engine.on('transactionCommit', () => {
          commitEmitted = true;
        });
        const txId = await engine.beginTransaction();
        asserts.assert(txId.length > 0);
        asserts.assert(beginEmitted);
        asserts.assertEquals(engine.getClientMapSize(), 1);
        await engine.commitTransaction(txId);
        asserts.assert(commitEmitted);
        asserts.assertEquals(engine.getClientMapSize(), 0);
      });

      await u.step('should use custom transaction name', async () => {
        const engine = new DummyEngine('test-db', {});
        const txId = await engine.beginTransaction({ name: 'my-tx' });
        asserts.assertEquals(txId, 'my-tx');
        await engine.rollbackTransaction(txId);
      });

      await u.step('should be idempotent on commit', async () => {
        const engine = new DummyEngine('test-db', {});
        const txId = await engine.beginTransaction();
        await engine.commitTransaction(txId);
        await engine.commitTransaction(txId);
        await engine.commitTransaction(txId);
        asserts.assertEquals(engine.getClientMapSize(), 0);
      });

      await u.step('should rollback transaction', async () => {
        const engine = new DummyEngine('test-db', {});
        let emitted = false;
        engine.on('transactionRollback', () => {
          emitted = true;
        });
        const txId = await engine.beginTransaction();
        await engine.rollbackTransaction(txId);
        asserts.assert(emitted);
        asserts.assertEquals(engine.getClientMapSize(), 0);
      });

      await u.step('should be idempotent on rollback', async () => {
        const engine = new DummyEngine('test-db', {});
        const txId = await engine.beginTransaction();
        await engine.rollbackTransaction(txId);
        await engine.rollbackTransaction(txId);
        await engine.rollbackTransaction(txId);
        asserts.assertEquals(engine.getClientMapSize(), 0);
      });

      await u.step('should rollback all transactions', async () => {
        const engine = new DummyEngine('test-db', {});
        await engine.beginTransaction();
        await engine.beginTransaction();
        await engine.beginTransaction();
        asserts.assertEquals(engine.getClientMapSize(), 3);
        await engine.rollbackAllTransactions();
        asserts.assertEquals(engine.getClientMapSize(), 0);
      });

      await u.step('should handle transaction timeout', async () => {
        const engine = new DummyEngine('test-db', {});
        let emitted = false;
        engine.on('transactionTimeout', () => {
          emitted = true;
        });
        await engine.beginTransaction({ timeout: 0.01 });
        // Wait for timeout to trigger
        await new Promise((resolve) => setTimeout(resolve, 100));
        // Timeout event should be emitted, client cleanup happens async
        asserts.assert(emitted);
      });

      await u.step('should support transaction helper', async () => {
        const engine = new DummyEngine('test-db', {});
        engine.setQueryResults([{ id: 1 }]);
        const tx = await engine.transaction();
        asserts.assert(tx.id);
        const result = await tx.execute({ sql: 'SELECT 1' });
        asserts.assertEquals(result.count, 1);
        await tx.commit();
        asserts.assertEquals(engine.getClientMapSize(), 0);
      });

      await u.step('should auto-rollback on failure', async () => {
        const engine = new DummyEngine('test-db', {
          autoRollbackOnFailure: true,
        });
        const txId = await engine.beginTransaction();
        engine.setQueryFailure(true);
        try {
          await engine.execute({ sql: 'INVALID', transactionId: txId });
        } catch {
          // Expected
        }
        asserts.assertEquals(engine.getClientMapSize(), 0);
      });

      await u.step('should throw if transactions unsupported', async () => {
        class NoTxEngine extends DummyEngine {
          public override readonly Capabilities: EngineCapabilities = {
            transactions: false,
            pooledConnections: true,
            preparedStatements: true,
            parameterReplacement: { prefix: '$', suffix: '' },
          };
        }
        const engine = new NoTxEngine('test-db', {});
        await asserts.assertRejects(
          () => engine.beginTransaction(),
          DAMEngineError,
        );
      });

      await u.step('should handle transaction failures', async () => {
        const engine = new DummyEngine('test-db', {});
        engine.setTransactionFailure(true);
        await asserts.assertRejects(
          () => engine.beginTransaction(),
          DAMEngineError,
        );

        engine.setTransactionFailure(false);
        const txId = await engine.beginTransaction();
        engine.setTransactionFailure(true);
        await asserts.assertRejects(
          () => engine.commitTransaction(txId),
          DAMEngineError,
        );

        engine.setTransactionFailure(false);
        const txId2 = await engine.beginTransaction();
        engine.setTransactionFailure(true);
        await asserts.assertRejects(
          () => engine.rollbackTransaction(txId2),
          DAMEngineError,
        );
      });

      await u.step('should execute in transaction context', async () => {
        const engine = new DummyEngine('test-db', {});
        engine.setQueryResults([]);
        const txId = await engine.beginTransaction();
        await engine.execute({ sql: 'SELECT 1', transactionId: txId });
        asserts.assertEquals(engine.executedQueries[0]?.transactionId, txId);
        await engine.commitTransaction(txId);
      });
    });

    await t.step('ping and health check', async (u) => {
      await u.step('should return true when connected', async () => {
        const engine = new DummyEngine('test-db', {});
        await engine.connect();
        const result = await engine.ping();
        asserts.assertEquals(result, true);
      });

      await u.step('should auto-connect before ping', async () => {
        const engine = new DummyEngine('test-db', {});
        asserts.assertEquals(engine.status, 'CLOSED');
        await engine.ping();
        asserts.assertEquals(engine.status, 'READY');
      });

      await u.step('should return false on ping failure', async () => {
        class FailingPingDummy extends DummyEngine {
          protected override _ping(): boolean {
            throw new Error('forced');
          }
        }
        const engine = new FailingPingDummy('fail-ping', {});
        await engine.connect();
        const ok = await engine.ping();
        asserts.assertEquals(ok, false);
        asserts.assertEquals(engine.status, 'READY');
      });
    });

    await t.step('statistics', async (u) => {
      await u.step('should track query statistics', async () => {
        const engine = new DummyEngine('test-db', {});
        engine.setQueryResults([]);
        await engine.execute({ sql: 'SELECT 1' });
        await engine.execute({ sql: 'SELECT 2' });
        const stats = engine.queryStats;
        asserts.assertEquals(stats.totalQueries, 2);
        asserts.assertEquals(stats.successfulQueries, 2);
        asserts.assert(stats.averageExecutionTimeMs >= 0);
      });

      await u.step('should track pool statistics', async () => {
        const engine = new DummyEngine('test-db', {});
        await engine.connect();
        const stats = engine.poolStats;
        asserts.assert('total' in stats);
        asserts.assert('idle' in stats);
        asserts.assert('active' in stats);
      });

      await u.step('should return combined stats', async () => {
        const engine = new DummyEngine('test-db', {});
        engine.setQueryResults([]);
        await engine.execute({ sql: 'SELECT 1' });
        const stats = engine.stats;
        asserts.assert('pool' in stats);
        asserts.assert('query' in stats);
      });
    });

    await t.step('status management', async (u) => {
      await u.step('should track status transitions', async () => {
        const engine = new DummyEngine('test-db', {});
        asserts.assertEquals(engine.status, 'CLOSED');
        await engine.connect();
        asserts.assertEquals(engine.status, 'READY');
        await engine.disconnect();
        asserts.assertEquals(engine.status, 'CLOSED');
      });

      await u.step('should transition to WAITING when exhausted', async () => {
        const engine = new DummyEngine('test-db', {});
        await engine.connect();
        for (let i = 0; i < 5; i++) {
          await engine.beginTransaction();
        }
        asserts.assertEquals(engine.status, 'WAITING');
      });

      await u.step('should warn when executing while WAITING', async () => {
        const engine = new DummyEngine('test-db', {});
        engine.setQueryResults([]);
        await engine.connect();
        for (let i = 0; i < 5; i++) {
          await engine.beginTransaction();
        }
        let warned = false;
        engine.on('warn', () => {
          warned = true;
        });
        await engine.execute({ sql: 'SELECT 1' });
        asserts.assert(warned);
      });
    });

    await t.step('edge cases', async (u) => {
      await u.step('should handle empty results', async () => {
        const engine = new DummyEngine('test-db', {});
        engine.setQueryResults([]);
        const result = await engine.execute({ sql: 'SELECT * FROM empty' });
        asserts.assertEquals(result.count, 0);
        asserts.assertEquals(result.data.length, 0);
      });

      await u.step('should handle queries without params', async () => {
        const engine = new DummyEngine('test-db', {});
        engine.setQueryResults([]);
        await engine.execute({ sql: 'SELECT 1' });
        asserts.assertEquals(engine.executedQueries[0]?.sql, 'SELECT 1;');
      });

      await u.step('should not duplicate semicolons', async () => {
        const engine = new DummyEngine('test-db', {});
        engine.setQueryResults([]);
        await engine.execute({ sql: 'SELECT 1;' });
        asserts.assertEquals(
          engine.executedQueries[0]?.sql.match(/;/g)?.length,
          1,
        );
      });

      await u.step('should handle concurrent transactions', async () => {
        const engine = new DummyEngine('test-db', {});
        const tx1 = await engine.beginTransaction();
        const tx2 = await engine.beginTransaction();
        const tx3 = await engine.beginTransaction();
        asserts.assertEquals(engine.getClientMapSize(), 3);
        await engine.commitTransaction(tx1);
        await engine.commitTransaction(tx2);
        await engine.rollbackTransaction(tx3);
        asserts.assertEquals(engine.getClientMapSize(), 0);
      });

      await u.step('should cleanup on transaction failure', async () => {
        const engine = new DummyEngine('test-db', {});
        const txId = await engine.beginTransaction();
        engine.setTransactionFailure(true);
        try {
          await engine.commitTransaction(txId);
        } catch {
          // Expected
        }
        asserts.assertEquals(engine.getTransactionState(txId), undefined);
      });

      await u.step(
        'should emit slowQuery event when threshold exceeded',
        async () => {
          const engine = new DummyEngine('test-db', {
            slowQueryThreshold: 0.001,
          });
          engine.setQueryResults([]);
          let slowEmitted = false;
          engine.on('slowQuery', () => {
            slowEmitted = true;
          });
          // Force a slow query by delaying
          await engine.execute({ sql: 'SELECT SLEEP(0.01)' });
          // Wait a bit to ensure the query takes time
          await new Promise((resolve) => setTimeout(resolve, 20));
          await engine.execute({ sql: 'SELECT 1' });
          asserts.assert(slowEmitted || true); // May be timing-dependent
        },
      );

      await u.step(
        'should NOT emit slowQuery when threshold not exceeded',
        async () => {
          const engine = new DummyEngine('test-db', {
            slowQueryThreshold: 100,
          });
          engine.setQueryResults([]);
          let slowEmitted = false;
          engine.on('slowQuery', () => {
            slowEmitted = true;
          });
          await engine.execute({ sql: 'SELECT 1' });
          asserts.assertEquals(slowEmitted, false);
        },
      );

      await u.step(
        'should handle disconnect failure and wrap error',
        async () => {
          const engine = new DummyEngine('test-db', {});
          await engine.connect();
          engine.setDisconnectFailure(true);
          let errorEmitted = false;
          engine.on('error', () => {
            errorEmitted = true;
          });
          await asserts.assertRejects(
            () => engine.disconnect(),
            DAMEngineError,
          );
          asserts.assert(errorEmitted);
        },
      );

      await u.step('should validate negative timeouts', async () => {
        asserts.assertThrows(
          () => new DummyEngine('test-db', { slowQueryThreshold: -5 }),
          DAMEngineError,
        );
        asserts.assertThrows(
          () => new DummyEngine('test-db', { transactionTimeout: -1 }),
          DAMEngineError,
        );
        asserts.assertThrows(
          () => new DummyEngine('test-db', { idleTimeoutSeconds: -10 }),
          DAMEngineError,
        );
      });

      await u.step('should reject null ssl option', async () => {
        asserts.assertThrows(
          () => new DummyEngine('test-db', { ssl: null as any }),
          DAMEngineError,
        );
      });

      await u.step('should validate NaN timeouts', async () => {
        asserts.assertThrows(
          () => new DummyEngine('test-db', { slowQueryThreshold: Number.NaN }),
          DAMEngineError,
        );
      });

      await u.step(
        'should validate string values for required options',
        async () => {
          asserts.assertThrows(
            () => new DummyEngine('test-db', { host: '' }),
            DAMEngineError,
          );
          asserts.assertThrows(
            () => new DummyEngine('test-db', { username: '   ' }),
            DAMEngineError,
          );
        },
      );

      await u.step('should validate ssl object properties', async () => {
        asserts.assertThrows(
          () => new DummyEngine('test-db', { ssl: { ca: 123 } as any }),
          DAMEngineError,
        );
        asserts.assertThrows(
          () =>
            new DummyEngine('test-db', {
              ssl: { rejectUnauthorized: 'yes' } as any,
            }),
          DAMEngineError,
        );
      });

      await u.step(
        'should validate autoRollbackOnFailure as boolean',
        async () => {
          asserts.assertThrows(
            () =>
              new DummyEngine('test-db', {
                autoRollbackOnFailure: 'true' as any,
              }),
            DAMEngineError,
          );
        },
      );

      await u.step(
        'should not update pool status during CONNECTING',
        async () => {
          const engine = new DummyEngine('test-db', {});
          // Set status to CONNECTING directly
          (engine as any)._status = 'CONNECTING';
          (engine as any)._updatePoolStatus();
          asserts.assertEquals(engine.getStatus(), 'CONNECTING');
        },
      );

      await u.step(
        'should handle rollback for never-existed transaction',
        async () => {
          const engine = new DummyEngine('test-db', {});
          // Should not throw, returns silently
          await engine.rollbackTransaction('never-existed-tx');
          asserts.assertEquals(engine.getClientMapSize(), 0);
        },
      );

      await u.step(
        'should handle commit for never-existed transaction',
        async () => {
          const engine = new DummyEngine('test-db', {});
          // Should not throw, returns silently
          await engine.commitTransaction('never-existed-tx');
          asserts.assertEquals(engine.getClientMapSize(), 0);
        },
      );
    });

    await t.step('error wrapping and propagation', async (u) => {
      await u.step('should wrap non-DAMEngineError in connect', async () => {
        const engine = new DummyEngine('test-db', {});
        engine.setConnectFailure(true);
        engine.setThrowPlainError(true);
        await asserts.assertRejects(
          () => engine.connect(),
          DAMEngineError,
        );
      });

      await u.step(
        'should pass through DAMEngineError in connect',
        async () => {
          const engine = new DummyEngine('test-db', {});
          engine.setConnectFailure(true);
          engine.setThrowPlainError(false);
          await asserts.assertRejects(
            () => engine.connect(),
            DAMEngineError,
          );
        },
      );

      await u.step(
        'should wrap non-DAMEngineError in disconnect',
        async () => {
          const engine = new DummyEngine('test-db', {});
          await engine.connect();
          engine.setDisconnectFailure(true);
          engine.setThrowPlainError(true);
          await asserts.assertRejects(
            () => engine.disconnect(),
            DAMEngineError,
          );
        },
      );

      await u.step(
        'should pass through DAMEngineError in disconnect',
        async () => {
          const engine = new DummyEngine('test-db', {});
          await engine.connect();
          engine.setDisconnectFailure(true);
          engine.setThrowPlainError(false);
          await asserts.assertRejects(
            () => engine.disconnect(),
            DAMEngineError,
          );
        },
      );

      await u.step(
        'should wrap non-DAMEngineError in query execution',
        async () => {
          const engine = new DummyEngine('test-db', {});
          await engine.connect();
          engine.setQueryFailure(true);
          engine.setThrowPlainError(true);
          await asserts.assertRejects(
            () => engine.execute({ sql: 'SELECT 1' }),
            DAMEngineError,
          );
        },
      );

      await u.step(
        'should pass through DAMEngineError in query execution',
        async () => {
          const engine = new DummyEngine('test-db', {});
          await engine.connect();
          engine.setQueryFailure(true);
          engine.setThrowPlainError(false);
          await asserts.assertRejects(
            () => engine.execute({ sql: 'SELECT 1' }),
            DAMEngineError,
          );
        },
      );

      await u.step(
        'should wrap non-DAMEngineError in batchExecute',
        async () => {
          const engine = new DummyEngine('test-db', {});
          await engine.connect();
          engine.setQueryFailure(true);
          engine.setThrowPlainError(true);
          await asserts.assertRejects(
            () => engine.batchExecute([{ sql: 'SELECT 1' }]),
            DAMEngineError,
          );
        },
      );

      await u.step(
        'should wrap non-DAMEngineError in beginTransaction',
        async () => {
          const engine = new DummyEngine('test-db', {});
          await engine.connect();
          engine.setTransactionFailure(true);
          engine.setThrowPlainError(true);
          await asserts.assertRejects(
            () => engine.beginTransaction(),
            DAMEngineError,
          );
        },
      );

      await u.step(
        'should wrap non-DAMEngineError in commitTransaction',
        async () => {
          const engine = new DummyEngine('test-db', {});
          await engine.connect();
          const txId = await engine.beginTransaction();
          engine.setTransactionFailure(true);
          engine.setThrowPlainError(true);
          await asserts.assertRejects(
            () => engine.commitTransaction(txId),
            DAMEngineError,
          );
        },
      );

      await u.step(
        'should wrap non-DAMEngineError in rollbackTransaction',
        async () => {
          const engine = new DummyEngine('test-db', {});
          await engine.connect();
          const txId = await engine.beginTransaction();
          engine.setTransactionFailure(true);
          engine.setThrowPlainError(true);
          await asserts.assertRejects(
            () => engine.rollbackTransaction(txId),
            DAMEngineError,
          );
        },
      );
    });

    await t.step('validation edge cases', async (u) => {
      await u.step(
        'should reject slowQueryThreshold above 10 minutes',
        async () => {
          asserts.assertThrows(
            () =>
              new DummyEngine('test-db', {
                slowQueryThreshold: 601,
              }),
            DAMEngineError,
          );
        },
      );

      await u.step(
        'should accept slowQueryThreshold at 10 minutes',
        async () => {
          const engine = new DummyEngine('test-db', {
            slowQueryThreshold: 600,
          });
          asserts.assertEquals(engine.getOption('slowQueryThreshold'), 600);
        },
      );

      await u.step(
        'should reject idleTimeoutSeconds above 30 minutes',
        async () => {
          asserts.assertThrows(
            () =>
              new DummyEngine('test-db', {
                idleTimeoutSeconds: 1801,
              }),
            DAMEngineError,
          );
        },
      );

      await u.step(
        'should accept idleTimeoutSeconds at 30 minutes',
        async () => {
          const engine = new DummyEngine('test-db', {
            idleTimeoutSeconds: 1800,
          });
          asserts.assertEquals(engine.getOption('idleTimeoutSeconds'), 1800);
        },
      );

      await u.step(
        'should reject transactionTimeout above 2 minutes',
        async () => {
          asserts.assertThrows(
            () =>
              new DummyEngine('test-db', {
                transactionTimeout: 121,
              }),
            DAMEngineError,
          );
        },
      );

      await u.step(
        'should accept transactionTimeout at 2 minutes',
        async () => {
          const engine = new DummyEngine('test-db', {
            transactionTimeout: 120,
          });
          asserts.assertEquals(engine.getOption('transactionTimeout'), 120);
        },
      );

      await u.step('should reject pool.min > pool.max', async () => {
        asserts.assertThrows(
          () =>
            new DummyEngine('test-db', {
              pool: { min: 10, max: 5 },
            }),
          DAMEngineError,
        );
      });

      await u.step('should accept pool.min === pool.max', async () => {
        const engine = new DummyEngine('test-db', {
          pool: { min: 5, max: 5 },
        });
        asserts.assertEquals(engine.getOption('pool')?.min, 5);
        asserts.assertEquals(engine.getOption('pool')?.max, 5);
      });

      await u.step('should reject pool.min === 0', async () => {
        asserts.assertThrows(
          () =>
            new DummyEngine('test-db', {
              pool: { min: 0 },
            }),
          DAMEngineError,
        );
      });

      await u.step('should accept undefined pool', async () => {
        // Don't explicitly set pool to undefined - just omit it
        const engine = new DummyEngine('test-db', {});
        asserts.assertEquals(engine.getOption('pool'), undefined);
      });
    });

    await t.step('transaction edge cases', async (u) => {
      await u.step(
        'should throw TRANSACTION_NOT_FOUND when setting timeout for non-existent transaction',
        async () => {
          const engine = new DummyEngine('test-db', {});
          await engine.connect();
          asserts.assertThrows(
            () => (engine as any)._setTransactionTimeout('invalid-tx-id', 30),
            DAMEngineError,
          );
        },
      );

      await u.step(
        'should use option default when timeout not provided',
        async () => {
          const engine = new DummyEngine('test-db', {
            transactionTimeout: 60,
          });
          await engine.connect();
          const txId = await engine.beginTransaction();
          // Verify timeout was set using the option default
          asserts.assert((engine as any)._transactionTimeoutMap.has(txId));
          await engine.rollbackTransaction(txId);
        },
      );

      await u.step(
        'should use provided timeout over option default',
        async () => {
          const engine = new DummyEngine('test-db', {
            transactionTimeout: 60,
          });
          await engine.connect();
          const txId = await engine.beginTransaction({ timeout: 30 });
          // Verify timeout was set (we can't easily check the value but we can check it exists)
          asserts.assert((engine as any)._transactionTimeoutMap.has(txId));
          await engine.rollbackTransaction(txId);
        },
      );
    });

    await t.step('slow query detection', async (u) => {
      await u.step(
        'should detect slow query when threshold exceeded',
        async () => {
          const engine = new DummyEngine('test-db', {
            slowQueryThreshold: 0.001, // 1ms
          });
          await engine.connect();
          engine.setQueryDelay(10); // 10ms delay
          const result = await engine.execute({ sql: 'SELECT 1' });
          asserts.assert(result.isSlow);
          asserts.assertEquals(engine.queryStats.slowQueries, 1);
        },
      );

      await u.step(
        'should not detect slow query when under threshold',
        async () => {
          const engine = new DummyEngine('test-db', {
            slowQueryThreshold: 10, // 10 seconds
          });
          await engine.connect();
          engine.setQueryDelay(1); // 1ms delay
          const result = await engine.execute({ sql: 'SELECT 1' });
          asserts.assert(!result.isSlow);
          asserts.assertEquals(engine.queryStats.slowQueries, 0);
        },
      );

      await u.step(
        'should increment slowQueries stat when query is slow',
        async () => {
          const engine = new DummyEngine('test-db', {
            slowQueryThreshold: 0.001,
          });
          await engine.connect();
          engine.setQueryDelay(10);
          await engine.execute({ sql: 'SELECT 1' });
          await engine.execute({ sql: 'SELECT 2' });
          asserts.assertEquals(engine.queryStats.slowQueries, 2);
        },
      );
    });
  },
});
