/**
 * @fileoverview Wires a `SQLiteEngine` connection with realistic options,
 * plus the DDL/seed helpers `main.ts` calls to stand up the demo schema.
 *
 * SQLite is embedded — no host/port/username/password, and no external
 * service to start before running this example. `path: ':memory:'` gives
 * every run a fresh, private database (see the "In-memory caveat" in
 * `Drivers-SQLite.md`: two `SQLiteEngine` instances with `path: ':memory:'`
 * never share data, even in the same process — each handle is its own
 * database).
 *
 * @module
 */
import { SQLiteEngine } from '@tundralibs/drivers/sqlite';

/**
 * Builds the demo engine. Options mirror what a real app would set:
 *
 * - `slowQueryThreshold` / `transactionTimeout` — `SQLEngine` options (see
 *   [Drivers-SQLEngine.md § Configuration](../../docs/Drivers-SQLEngine.md#configuration));
 *   spelled out here instead of left at their defaults (`0.5`s / `120`s)
 *   so the values that drive the `slowQuery` event and the auto-rollback
 *   timeout are visible.
 * - Event handlers via the `_on<Event>` construction keys (see
 *   [Drivers-BaseEngine.md § Events](../../docs/Drivers-BaseEngine.md#events))
 *   back the `[lifecycle]` / `[tx]` log lines this example prints.
 *
 * Deliberately **not** set here: `pool`. `SQLiteEngine` *defaults* it to
 * `{ min: 1, max: 1 }` (see
 * [Drivers-SQLite.md § Capabilities](./Drivers-SQLite.md#capabilities))
 * because SQLite tolerates parallel writers poorly — but a default only
 * fills a gap the caller leaves; it is not a clamp the engine enforces
 * against an explicit value. Passing `pool: { min: 2, max: 5 }` here would
 * really open a second connection, and in `:memory:` mode a second
 * connection is a SEPARATE, empty database (the caveat above) — a
 * `CREATE TABLE` run through one handle leaves the other reporting
 * `TABLE_NOT_FOUND` for it. Confirmed by trying it while building this
 * example; see this example's README for the full note. Leave `pool`
 * unset unless you're on a directory-mode (file-backed) database and have
 * a specific reason to widen it.
 */
export function createLedgerDb(name = 'ledger'): SQLiteEngine {
  return new SQLiteEngine(name, {
    path: ':memory:',
    slowQueryThreshold: 0.05,
    transactionTimeout: 30,
    autoRollbackOnFailure: true,
    _onconnect: (id) => console.log(`  [lifecycle] connect ${id}`),
    _ondisconnect: (id) => console.log(`  [lifecycle] disconnect ${id}`),
    _ontransactionBegin: (id, txId) =>
      console.log(`  [tx] begin    ${txId} on ${id}`),
    _ontransactionCommit: (id, txId) =>
      console.log(`  [tx] commit   ${txId} on ${id}`),
    _ontransactionRollback: (id, txId) =>
      console.log(`  [tx] rollback ${txId} on ${id}`),
  });
}

/**
 * DDL for the demo schema: two accounts, one ledger of transfers between
 * them. `balance_cents CHECK (balance_cents >= 0)` is what turns an
 * over-draft transfer into a real `CHECK_VIOLATION` later (see
 * `transactions.ts` and `main.ts`) rather than a simulated one.
 */
const SCHEMA_SQL = [
  `CREATE TABLE accounts (
    id INTEGER PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    balance_cents INTEGER NOT NULL CHECK (balance_cents >= 0)
  )`,
  `CREATE TABLE ledger_entries (
    id TEXT PRIMARY KEY,
    from_account INTEGER NOT NULL,
    to_account INTEGER NOT NULL,
    amount_cents INTEGER NOT NULL,
    created_at TEXT NOT NULL
  )`,
];

/**
 * Creates the schema and seeds two accounts. Called on an already-connected
 * `db` in `main.ts`; `errors.ts`'s own demo shows the same `execute()` call
 * working on a **never**-connected engine too (auto-connect).
 */
export async function initLedger(db: SQLiteEngine): Promise<void> {
  for (const sql of SCHEMA_SQL) {
    await db.execute({ sql });
  }
  await db.execute({
    sql:
      'INSERT INTO accounts (id, email, balance_cents) VALUES (:id:, :email:, :balance:)',
    params: { id: 1, email: 'alice@example.com', balance: 10_000 },
  });
  await db.execute({
    sql:
      'INSERT INTO accounts (id, email, balance_cents) VALUES (:id:, :email:, :balance:)',
    params: { id: 2, email: 'bob@example.com', balance: 5_000 },
  });
}

/** Reads back one account's balance, for the before/after prints in `main.ts`. */
export async function getBalanceCents(
  db: SQLiteEngine,
  id: number,
): Promise<number> {
  const result = await db.execute<{ balance_cents: number }>({
    sql: 'SELECT balance_cents FROM accounts WHERE id = :id:',
    params: { id },
  });
  if (result.data.length === 0) {
    throw new Error(`no account with id ${id}`);
  }
  return result.data[0]!.balance_cents;
}
