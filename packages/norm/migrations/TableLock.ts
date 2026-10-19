/**
 * @module
 *
 * A migration lock stored IN the database: one row of
 * `_norm_migration_lock`, claimed by INSERTing its primary key. For a
 * Migrator with no migrations folder (a {@link memorySource}) on SQLite,
 * where there is no server-side advisory lock and no place for
 * `migrator.lock`. Same token + stale-reclaim contract as
 * {@link FileLock}.
 *
 * @since 1.12.0
 */

import type { Query } from '@tundralibs/oql/types';
import { runtimeOf } from '../Norm.ts';
import type { Executor } from '../executor.ts';
import { NormMigrationError, NormUnsupportedError } from '../errors/mod.ts';
import { DEFAULT_STALE_MS } from './FileLock.ts';

/** Reserved physical table name. */
export const LOCK_TABLE_NAME = '_norm_migration_lock';

/** The single row every migrator contends for. */
const LOCK_NAME = 'migrator';
/** Poll interval while waiting on a live holder. */
const POLL_MS = 100;
/** Failed claims in a row with the lock row readably ABSENT before the
 * INSERT error is surfaced as itself (not contention). */
const MAX_UNEXPLAINED = 3;

type LockRow = { token: string; owner: string; stampedAt: number };

/** Idempotent CREATE for the lock table. */
function lockCreateQuery(): Query<'CREATE_TABLE'> {
  return {
    type: 'CREATE_TABLE',
    table: LOCK_TABLE_NAME,
    columns: {
      name: { type: 'VARCHAR', length: 32, nullable: false },
      token: { type: 'VARCHAR', length: 64, nullable: false },
      owner: { type: 'VARCHAR', length: 255, nullable: false },
      stampedAt: { type: 'BIGINT', nullable: false },
    },
    primaryKey: ['name'],
    ifNotExists: true,
  };
}

/** Best-effort "who am I" for the timeout message. */
function ownerLabel(): string {
  // deno-lint-ignore no-explicit-any
  const g = globalThis as any;
  const pid = g.Deno?.pid ?? g.process?.pid;
  return `pid ${pid ?? '?'}`;
}

/**
 * A database-row migration lock. Pass it as `lock` to a Migrator built
 * from a `source`; on SQLite that Migrator uses one by default.
 *
 * @example
 * ```ts ignore
 * const mig = new Migrator(db, {
 *   source: memorySource({ snapshots }),
 *   lock: new TableLock(db, 60_000),
 * });
 * ```
 */
export class TableLock {
  private readonly __executor: Executor;
  private readonly __token: string;
  private readonly __owner: string;
  private readonly __staleMs: number;
  private __ensured = false;
  private __held = false;

  /**
   * Bind a lock to a `norm.use(...)` handle's database.
   *
   * @param db - The handle returned by `norm.use(...)`.
   * @param staleMs - Age at which an untouched lock row is abandoned and
   *   may be reclaimed (default {@linkcode DEFAULT_STALE_MS}). `Infinity`
   *   disables stale reclaim.
   * @throws {NormUnsupportedError} On MongoDB, where the claim is not an
   *   atomic primary-key insert.
   */
  constructor(db: object, staleMs: number = DEFAULT_STALE_MS) {
    this.__executor = runtimeOf(db).executor;
    const dialect = this.__executor.capabilities.dialect;
    if (dialect === 'mongo') {
      throw new NormUnsupportedError({ feature: 'TableLock', dialect });
    }
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    this.__token = `${Date.now().toString(36)}-${
      Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
    }`;
    this.__owner = ownerLabel();
    this.__staleMs = staleMs;
  }

  /** Whether THIS instance currently holds the lock. */
  get held(): boolean {
    return this.__held;
  }

  /**
   * Acquire, polling until `timeoutMs` (default 30s). A row that has not
   * been touched for `staleMs` is treated as abandoned and reclaimed.
   *
   * @throws {NormMigrationError} `LOCK_TIMEOUT` when a live holder keeps
   *   the lock for the whole window.
   */
  async acquire(timeoutMs = 30_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    let holder: string | undefined;
    let lastError: unknown;
    let unexplained = 0;
    while (true) {
      try {
        // Inside the retry: on SQLite a contender's write — this DDL
        // included — fails with SQLITE_BUSY while the holder is mid-
        // migration, and that is contention, not failure.
        if (!this.__ensured) {
          await this.__executor.ddl(lockCreateQuery());
          this.__ensured = true;
        }
        await this.__executor.execute({
          type: 'INSERT',
          table: LOCK_TABLE_NAME,
          columns: ['name', 'token', 'owner', 'stampedAt'],
          data: {
            name: LOCK_NAME,
            token: this.__token,
            owner: this.__owner,
            stampedAt: Date.now(),
          },
        });
        this.__held = true;
        return;
      } catch (error) {
        lastError = error;
        const row = await this.__read().catch(() => undefined);
        if (row === null && ++unexplained >= MAX_UNEXPLAINED) throw error;
        if (row) {
          unexplained = 0;
          holder = row.owner;
          if (Date.now() - row.stampedAt >= this.__staleMs) {
            await this.__reclaim(row).catch(() => {});
            continue;
          }
        }
      }
      if (Date.now() >= deadline) {
        throw new NormMigrationError(
          `Could not acquire ${LOCK_TABLE_NAME} within ${timeoutMs}ms — ` +
            `held by ${holder ?? 'another process'}. A live migration ` +
            `keeps its lock fresh; an abandoned one is reclaimed ` +
            `automatically after ${this.__staleMs}ms.`,
          { subject: LOCK_TABLE_NAME, code: 'LOCK_TIMEOUT' },
          // No holder ever seen: the claim itself kept failing — say why.
          holder === undefined && lastError instanceof Error
            ? lastError
            : undefined,
        );
      }
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
  }

  /** Refresh our stamp. No-op when not held; never throws (a failed
   * refresh only risks an early reclaim). */
  async touch(): Promise<void> {
    if (!this.__held) return;
    try {
      await this.__executor.execute({
        type: 'UPDATE',
        table: LOCK_TABLE_NAME,
        columns: ['name', 'token', 'stampedAt'],
        data: { stampedAt: Date.now() },
        where: { '@name': LOCK_NAME, '@token': this.__token },
      });
    } catch {
      // Best effort — see above.
    }
  }

  /** Release if held by US; a foreign holder's row is left alone.
   * Idempotent. */
  async release(): Promise<void> {
    if (!this.__held) return;
    this.__held = false;
    try {
      await this.__executor.execute({
        type: 'DELETE',
        table: LOCK_TABLE_NAME,
        columns: ['name', 'token'],
        where: { '@name': LOCK_NAME, '@token': this.__token },
      });
    } catch {
      // Already gone.
    }
  }

  /** The current holder's row, or `null` when the lock is free. */
  private async __read(): Promise<LockRow | null> {
    const res = await this.__executor.execute<Record<string, unknown>>({
      type: 'SELECT',
      table: LOCK_TABLE_NAME,
      columns: ['name', 'token', 'owner', 'stampedAt'],
      projection: { '@token': true, '@owner': true, '@stampedAt': true },
      where: { '@name': LOCK_NAME },
    });
    const row = res.data[0];
    return row === undefined ? null : {
      token: String(row.token),
      owner: String(row.owner),
      stampedAt: Number(row.stampedAt),
    };
  }

  /** Delete the stale row — only if it is still exactly the one we saw,
   * so a contender that reclaimed and re-claimed first is left alone. */
  private async __reclaim(row: LockRow): Promise<void> {
    await this.__executor.execute({
      type: 'DELETE',
      table: LOCK_TABLE_NAME,
      columns: ['name', 'token', 'stampedAt'],
      where: {
        '@name': LOCK_NAME,
        '@token': row.token,
        '@stampedAt': row.stampedAt,
      },
    });
  }
}
