/**
 * @fileoverview SQLite ledger — connection lifecycle, transactions, and
 * typed error-code handling in one runnable app, no external database
 * required.
 *
 * ```bash
 * deno run --allow-all packages/drivers/examples/sqlite-ledger/main.ts
 * bun run packages/drivers/examples/sqlite-ledger/main.ts
 * node --import tsx packages/drivers/examples/sqlite-ledger/main.ts
 * ```
 *
 * See `README.md` for what each file demonstrates and the doc it's
 * grounded in.
 *
 * @module
 */
import { EngineError } from '@tundralibs/drivers/errors';
import { createLedgerDb, getBalanceCents, initLedger } from './connection.ts';
import { transferFunds } from './transactions.ts';
import { classifyError, demonstrateAutoConnect } from './errors.ts';

function section(title: string): void {
  console.log(`\n=== ${title} ===`);
}

// ---------------------------------------------------------------------------
// 1. Connection lifecycle (Drivers-BaseEngine.md § Lifecycle)
// ---------------------------------------------------------------------------
section('1. Connection lifecycle');
const db = createLedgerDb();
console.log(`status before connect(): ${db.status}`); // CLOSED
await db.connect(); // idempotent; fires the `[lifecycle] connect` handler
console.log(`status after connect():  ${db.status}`); // READY
console.log('poolStats:', db.poolStats); // { total: 1, active: 0, idle: 1, waiting: 0 }

await initLedger(db);
console.log('alice balance:', await getBalanceCents(db, 1)); // 10000
console.log('bob balance:  ', await getBalanceCents(db, 2)); // 5000

// ---------------------------------------------------------------------------
// 2. `execute()` auto-connects — the NO_CONNECTION code is not what you'd
//    hit by skipping connect() (Drivers-Errors.md § NO_CONNECTION)
// ---------------------------------------------------------------------------
section('2. Auto-connect on a never-connected engine');
await demonstrateAutoConnect();

// ---------------------------------------------------------------------------
// 3. transaction(fn) — the callback form (Drivers-SQLEngine.md § Transactions)
// ---------------------------------------------------------------------------
section('3. A plain transfer');
const first = await transferFunds(db, 1, 2, 1_500, 'audit-1');
console.log('transfer result:', first);
console.log('alice balance:', await getBalanceCents(db, 1)); // 8500
console.log('bob balance:  ', await getBalanceCents(db, 2)); // 6500

// ---------------------------------------------------------------------------
// 4. Nested transaction = SAVEPOINT: a failure inside it rolls back only
//    the savepoint, not the whole transfer (Drivers-SQLEngine.md §
//    Nested transactions = savepoints)
// ---------------------------------------------------------------------------
section('4. Reusing an audit id — only the savepoint unwinds');
const second = await transferFunds(db, 1, 2, 500, 'audit-1'); // same id again
console.log('transfer result:', second); // audited: false
console.log('alice balance:', await getBalanceCents(db, 1)); // 8000 — still moved
console.log('bob balance:  ', await getBalanceCents(db, 2)); // 7000

// ---------------------------------------------------------------------------
// 5. No savepoint open → the whole transaction rolls back
//    (CHECK_VIOLATION: an over-draft, not simulated)
// ---------------------------------------------------------------------------
section('5. Insufficient funds — the whole transfer rolls back');
try {
  await transferFunds(db, 1, 2, 999_999, 'audit-does-not-run');
} catch (err) {
  console.log('caught:', err instanceof EngineError ? err.code : err);
  console.log('verdict:', classifyError(err)); // conflict
}
console.log('alice balance unchanged:', await getBalanceCents(db, 1)); // still 8000

// ---------------------------------------------------------------------------
// 6. Typed error-code handling on plain execute() calls
//    (Drivers-Errors.md § Code Reference)
// ---------------------------------------------------------------------------
section('6. Typed error codes on direct execute() calls');

async function tryAndClassify(
  label: string,
  fn: () => Promise<unknown>,
): Promise<void> {
  try {
    await fn();
    console.log(`${label}: unexpectedly succeeded`);
  } catch (err) {
    const code = err instanceof EngineError ? err.code : 'not-an-EngineError';
    console.log(`${label}: ${code} → ${classifyError(err)}`);
  }
}

await tryAndClassify('duplicate email', () =>
  db.execute({
    sql:
      'INSERT INTO accounts (id, email, balance_cents) VALUES (:id:, :email:, 0)',
    params: { id: 99, email: 'alice@example.com' }, // already used by id 1
  }));

await tryAndClassify('missing NOT NULL email', () =>
  db.execute({
    sql:
      'INSERT INTO accounts (id, email, balance_cents) VALUES (:id:, NULL, 0)',
    params: { id: 100 },
  }));

await tryAndClassify('missing :param: value', () =>
  db.execute({
    sql: 'SELECT * FROM accounts WHERE id = :id:',
    params: {}, // `id` never supplied
  }));

await tryAndClassify(
  'querying a table that was never created',
  () => db.execute({ sql: 'SELECT * FROM widgets' }),
);

// ---------------------------------------------------------------------------
// 7. Stats + shutdown (Drivers-SQLEngine.md § Stats,
//    Drivers-BaseEngine.md § Lifecycle)
// ---------------------------------------------------------------------------
section('7. Stats and shutdown');
console.log('queryStats:', db.queryStats);
console.log('stats.pool:', db.stats.pool);
await db.disconnect(); // idempotent; fires the `[lifecycle] disconnect` handler
console.log(`status after disconnect(): ${db.status}`); // CLOSED
