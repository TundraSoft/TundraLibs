/**
 * @fileoverview `engine.transaction(fn)` — the public transaction API.
 *
 * `SQLEngine.beginTransaction` / `commitTransaction` / `rollbackTransaction`
 * are `@internal` (see
 * [Drivers-SQLEngine.md § Internal primitives](../../docs/Drivers-SQLEngine.md#internal-primitives)
 * and [Drivers-Errors.md's `TRANSACTION_OPERATION_ERROR` note](../../docs/Drivers-Errors.md#transaction_operation_error)) —
 * application code uses the callback form below, which reserves the
 * connection on entry and always releases it (COMMIT on resolve, ROLLBACK
 * on throw), so it can never leak from the pool.
 *
 * @module
 */
import type { SQLiteEngine } from '@tundralibs/drivers/sqlite';
import { EngineError } from '@tundralibs/drivers/errors';

export type TransferResult = {
  transactionId: string;
  audited: boolean;
};

/**
 * Moves `amountCents` from `fromId` to `toId` and records a ledger entry,
 * all inside one
 * [`transaction(fn)`](../../docs/Drivers-SQLEngine.md#transactions) callback.
 *
 * The ledger insert runs inside a NESTED `tx.transaction()` — a
 * `SAVEPOINT` (see
 * [Drivers-SQLEngine.md § Nested transactions = savepoints](../../docs/Drivers-SQLEngine.md#nested-transactions--savepoints)).
 * If the caller reuses an `auditId` that's already in `ledger_entries`
 * — a real, unique-constraint `DUPLICATE_KEY`, not simulated — only the
 * savepoint unwinds: the two balance `UPDATE`s above it are unaffected and
 * the outer transaction still commits. `audited: false` tells the caller
 * the audit trail has a gap; the money still moved.
 *
 * Without a savepoint open, the same failure class (or the
 * `CHECK (balance_cents >= 0)` constraint firing on an over-draft) instead
 * takes down the WHOLE transaction — see `main.ts`'s "insufficient funds"
 * call for that path, and the same doc section's note that
 * `autoRollbackOnFailure` scopes to the innermost savepoint only when one
 * is open.
 */
export async function transferFunds(
  db: SQLiteEngine,
  fromId: number,
  toId: number,
  amountCents: number,
  auditId: string,
): Promise<TransferResult> {
  return await db.transaction(async (tx) => {
    await tx.execute({
      sql:
        'UPDATE accounts SET balance_cents = balance_cents - :amount: WHERE id = :id:',
      params: { amount: amountCents, id: fromId },
    });
    await tx.execute({
      sql:
        'UPDATE accounts SET balance_cents = balance_cents + :amount: WHERE id = :id:',
      params: { amount: amountCents, id: toId },
    });

    let audited = true;
    try {
      await tx.transaction(async (sp) => {
        await sp.execute({
          sql: `INSERT INTO ledger_entries
                (id, from_account, to_account, amount_cents, created_at)
                VALUES (:id:, :from:, :to:, :amount:, :now:)`,
          params: {
            id: auditId,
            from: fromId,
            to: toId,
            amount: amountCents,
            now: new Date().toISOString(),
          },
        });
      });
    } catch (err) {
      if (err instanceof EngineError && err.code === 'DUPLICATE_KEY') {
        // Only the savepoint rolled back — the balance updates above are
        // still live in this transaction and will still commit below.
        audited = false;
      } else {
        throw err;
      }
    }

    return { transactionId: tx.id, audited };
  });
}
