# SQLite ledger

A runnable demo of `@tundralibs/drivers`'s connection lifecycle,
transactions, and typed error-code handling — working uniformly on a real
engine, with no external database to start. SQLite is a genuine, full
engine in this package (see
[Drivers-Compatibility.md](../../docs/Drivers-Compatibility.md)), so
everything below runs against real SQLite, not a mock.

The scenario: a two-account ledger (`accounts` + `ledger_entries`) with a
`transferFunds` helper. It's small on purpose — the point is the driver
surface, not the domain.

## Files

| File              | Shows                                                                                                                                                                                    |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `connection.ts`   | Wiring a `SQLiteEngine` with realistic options (`slowQueryThreshold`, `transactionTimeout`, `_on<Event>` handlers) and the DDL/seed helpers `main.ts` calls.                             |
| `transactions.ts` | The public `engine.transaction(async (tx) => …)` callback form, plus a nested `tx.transaction()` savepoint that recovers from one failed insert without losing the rest of the transfer. |
| `errors.ts`       | `switch (err.code)` typed error-code handling (`EngineErrorCode`), grouped by the reaction each code deserves; also proves the auto-connect behavior directly.                           |
| `main.ts`         | Ties the above together into one end-to-end run: connect → transfer → nested-savepoint recovery → whole-transaction rollback → six typed error codes → stats → disconnect.               |

## Running

Imports use the package's public specifier (`@tundralibs/drivers/...`), so
these files are also draggable into a real project unmodified. Inside this
workspace, run directly:

```bash
# Deno
deno run --allow-all packages/drivers/examples/sqlite-ledger/main.ts

# Bun
bun run packages/drivers/examples/sqlite-ledger/main.ts

# Node (22+; requires tsx for inline TS)
node --import tsx packages/drivers/examples/sqlite-ledger/main.ts
```

All three runtimes produce the same sequence of events and the same
account balances — only the console's own object-inspection formatting
differs cosmetically (Deno double-quotes strings and prints objects on one
line; Node single-quotes them; Bun adds trailing commas and expands short
objects across multiple lines).

## What to read alongside this

- [Drivers-BaseEngine.md](../../docs/Drivers-BaseEngine.md) — the
  `CLOSED → CONNECTING → READY → CLOSED` state machine, pool semantics, and
  the `_on<Event>` construction-key pattern used in `connection.ts`.
- [Drivers-SQLEngine.md](../../docs/Drivers-SQLEngine.md) — the
  `transaction(fn)` callback contract and nested-savepoint semantics behind
  `transactions.ts`.
- [Drivers-Errors.md](../../docs/Drivers-Errors.md) — the full
  `EngineErrorCode` reference and the "Branching on a Code" pattern
  `errors.ts` mirrors, plus the `NO_CONNECTION` clarification `errors.ts`
  demonstrates directly rather than just asserting.
- [`engines/sqlite/Drivers-SQLite.md`](../../engines/sqlite/Drivers-SQLite.md) —
  SQLite-specific capabilities (forced single-connection pool, `:memory:`
  vs. directory mode, value encoding).

## A pool caveat found while building this example

`Drivers-SQLite.md` says `SQLiteEngine` "forces `pool: { min: 1, max: 1 }`."
That's true only when the caller leaves `pool` unset — it's a _default_,
not a clamp `SQLiteEngine` enforces against an explicit value. Passing
`pool: { min: 2, max: 5 }` really opens a second connection, and in
`:memory:` mode a second connection is a **separate, empty database** (per
that same doc's "In-memory caveat"): a table created through the first
handle is invisible to the second, so an unlucky `execute()` fails with
`TABLE_NOT_FOUND` for a table that demonstrably exists. Reproduced while
building `connection.ts` — that file's `createLedgerDb` deliberately never
sets `pool` and explains why in a comment.
