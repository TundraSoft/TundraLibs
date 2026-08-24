# Subscription billing — the NORM example

A small SaaS billing backend: customers, plan subscriptions, and
invoices, over an in-memory SQLite database. Every file is meant to be
copied wholesale into a real project. Run it on any runtime:

```bash
deno run --allow-all packages/norm/examples/subscription-billing/main.ts
bun run packages/norm/examples/subscription-billing/main.ts
node --import tsx packages/norm/examples/subscription-billing/main.ts
```

| File        | Shows                                                                                                                                                                       |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema.ts` | `Customers` (`.encrypt().hash()`, `.mask()`, a tenant-scoping column), `Subscriptions` (`temporal`), `Invoices` (`audit`, v1 + v2), a VIEW, and a QUERY on top of it        |
| `seed.ts`   | two tenant organizations and their customers, fixed UUIDs so `main.ts` doesn't have to thread insert results everywhere                                                     |
| `main.ts`   | nine numbered scenarios, run top to bottom — Migrator create, CRUD, `@AsOf`, the audit trail, the VIEW/QUERY, `db.scope()`, two `transaction()` calls, and Migrator v1 → v2 |

Norm constructs and owns the SQLite engine itself from the `database`
config — `import '@tundralibs/norm/engines/sqlite'` registers the
dialect (the one engine held out of the root barrel; see the README's
"Choosing an entry point"), and no `@tundralibs/drivers` import is
needed. The one extra install is `@tundralibs/compat`, for a
cross-runtime temp directory the Migrator writes its snapshot files
into — the database itself is `:memory:`, so that's the only disk
write the example makes, and it's removed when the run finishes.

Expected shape of the output (ids and counts of ordered items vary run to
run; ordering doesn't):

```text
▶ 1. Migrator v1: schema created
{ "snapshot": { "version": 1, "written": true }, "applied": [1] }

▶ 2. Customers inserted; filter by plaintext email
{ "inserted": [...], "foundByEmail": "Acme Rockets" }

▶ 3. Subscriptions: supersede + @AsOf
{ "versions": ["starter","growth"], "asOfBeforeUpgrade": "starter", "current": "growth", ... }

▶ 4. Invoices: insert + update, read the audit trail
{ "invoiceId": "...", "liveRowStatus": "paid", "auditVersions": [{"Status":"open","current":false},{"Status":"paid","current":true}] }

▶ 5. ActiveSubscriptions VIEW + RevenueByPlan QUERY
{ "activeSubscriptions": [...], "revenueByPlan": [{"Plan":"growth","ActiveSubscriptions":1,"TotalMonthlyRevenue":9500}] }

▶ 6. db.scope(): Customers isolated, Subscriptions gracefully skipped
{ "acmeCustomerCount": 2, "globexCustomerCount": 1, "subscriptionsSeenThroughAcmeScope": 2 }

▶ 7. transaction(): downgrade + final invoice committed together
{ "currentPlan": "starter", "invoiceCount": 2 }

▶ 8. transaction(): a bad write rolls back the WHOLE batch
{ "rolledBack": true, "invoiceCountBefore": 0, "invoiceCountAfter": 0 }

▶ 9. Migrator v1 → v2: invoices.Currency added
{ "snapshot": { "version": 2, "written": true }, "applied": [2], "preExistingInvoiceCurrency": null, "newInvoiceCurrency": "USD", ... }
```

## What to steal for your own project

| Feature demonstrated                                       | Read next                                                       |
| ---------------------------------------------------------- | --------------------------------------------------------------- |
| `Subscriptions` — `temporal`, `@AsOf`                      | [../../docs/NORM-Temporal.md](../../docs/NORM-Temporal.md)      |
| `Invoices` — `audit`, the generated replica                | [../../docs/NORM-Audit.md](../../docs/NORM-Audit.md)            |
| `Migrator` — `snapshot()`/`plan()`/`apply()`               | [../../docs/NORM-Migrations.md](../../docs/NORM-Migrations.md)  |
| `db.scope()` — multi-tenant `OrganizationId`               | [../../docs/NORM-Scoping.md](../../docs/NORM-Scoping.md)        |
| `.encrypt().hash()`, `.mask()`, columns/entities generally | [../../docs/NORM-Schema.md](../../docs/NORM-Schema.md)          |
| `db.transaction()`                                         | [../../README.md](../../README.md#transactions--escape-hatches) |

## A doc/code gap this example ran into

`docs/NORM-Temporal.md` documents `repo.update(...)` on a temporal table
as routing to `insert()` ("same thing — a new version"). The actual code
(`Repo.ts`) throws `NormUnsupportedError` from `update()` on a temporal
table unconditionally — `insert()` is the only write verb. `main.ts`
scenario 3 uses `insert()` for the upgrade, per the real behavior; see
its comment for the specific line. `tests/temporal-live.test.ts` already
asserts the throw, so this is the code's settled behavior, not a bug —
the prose in NORM-Temporal.md's "Writing: insert = supersede" section is
what's stale.
