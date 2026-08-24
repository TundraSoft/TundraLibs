/**
 * @fileoverview Typed error-code handling — `switch` on `err.code`
 * (an `EngineErrorCode`, from `EngineErrorCodes`).
 *
 * Groups codes the way
 * [Drivers-Errors.md § Branching on a Code](../../docs/Drivers-Errors.md#branching-on-a-code)
 * does (retry / fatal / conflict / not-found / internal / other), scoped to
 * what this SQLite-backed demo can actually produce, plus the codes worth
 * naming even though it can't reach them.
 *
 * @module
 */
import { EngineError } from '@tundralibs/drivers/errors';
import { SQLiteEngine } from '@tundralibs/drivers/sqlite';

export type Verdict =
  | 'retry'
  | 'fatal'
  | 'conflict'
  | 'not-found'
  | 'internal'
  | 'other'
  | 'not-ours';

/**
 * Groups an error by the reaction it deserves. `err.code` is the stable
 * discriminator — never parse `err.message`.
 */
export function classifyError(err: unknown): Verdict {
  if (!(err instanceof EngineError)) return 'not-ours';

  switch (err.code) {
    // Constraint violations: this is data the caller sent, not an
    // infrastructure problem. `err.context.constraint` / `.column` names
    // what failed — SQLite's mapper fills both from the driver's own
    // message text (see `errorCodes.ts` in the engine source).
    case 'DUPLICATE_KEY':
    case 'FOREIGN_KEY_VIOLATION':
    case 'NOT_NULL_VIOLATION':
    case 'CHECK_VIOLATION':
      return 'conflict';

    case 'TABLE_NOT_FOUND':
    case 'COLUMN_NOT_FOUND':
    case 'DATABASE_NOT_FOUND':
      return 'not-found';

    // The same call, unchanged, fails again — a caller/config bug, not a
    // transient condition.
    case 'MISSING_PARAMETERS':
    case 'SYNTAX_ERROR':
    case 'INVALID_CONFIG_VALUE':
    case 'MISSING_CONFIG_VALUE':
    case 'UNSUPPORTED_OPERATION':
      return 'fatal';

    // Transient — worth a retry with backoff. SQLite's own mapper never
    // actually produces DEADLOCK / LOCK_TIMEOUT / SERIALIZATION_FAILURE /
    // QUERY_TIMEOUT (see Drivers-Errors.md's "Which codes you can
    // actually see" note under Code Reference) — this demo can't trigger
    // them — but `classifyError` is written once and shared across
    // whichever engine `db` ends up being.
    case 'DEADLOCK':
    case 'SERIALIZATION_FAILURE':
    case 'LOCK_TIMEOUT':
    case 'QUERY_TIMEOUT':
    case 'POOL_ACQUIRE_TIMEOUT':
    case 'CONNECTION_LOST':
      return 'retry';

    // NOT the "forgot to call connect()" error. `execute()` and every
    // query method auto-connect a fresh engine on first use
    // (Drivers-Errors.md § NO_CONNECTION). This code is an internal
    // safety net — a pooled connection written to after teardown already
    // marked it closed — that ordinary application code cannot trigger.
    // `demonstrateAutoConnect` below is the positive case: a never-
    // connected engine, one `execute()` call, no error at all.
    case 'NO_CONNECTION':
      return 'internal';

    default:
      return 'other';
  }
}

/**
 * Proves the auto-connect behavior directly: a brand-new engine, no
 * `connect()` call, one `execute()` — it just works. Uses its own
 * throwaway engine so it doesn't disturb the caller's `db`.
 */
export async function demonstrateAutoConnect(): Promise<void> {
  const fresh = new SQLiteEngine('auto-connect-demo', { path: ':memory:' });
  console.log(`  status before execute(): ${fresh.status}`);
  const result = await fresh.execute<{ n: number }>({ sql: 'SELECT 1 AS n' });
  console.log(
    `  status after execute():  ${fresh.status} (n=${result.data[0]?.n})`,
  );
  await fresh.disconnect();
}
