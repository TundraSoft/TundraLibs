# Cross-dialect translation — the OQL example

The same five `Query` objects, translated by all four dialect translators
side by side. Run it to see exactly how far a single OQL query diverges per
database — the thing inline doc snippets can show one dialect at a time, but
not side by side.

```bash
deno run --allow-all packages/oql/examples/cross-dialect/main.ts
```

| File         | Shows                                                                                                                                                                              |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `queries.ts` | Five representative `Query` objects: a SELECT with a JOIN + SUM aggregate + HAVING, an INSERT using an Expression default, an `INSERT_FROM_QUERY`, an UPSERT, and a `CREATE_TABLE` |
| `main.ts`    | `assertQuery()` validates each one, then every query runs through `PostgresTranslator`, `MariaTranslator`, `SQLiteTranslator`, and `MongoTranslator` in turn, printing the result  |

Expected shape of the output (values are illustrative — every dialect's own
SQL syntax and parameter style, or Mongo's pipeline/action shape):

```text
▶ 1a. revenueByUser — Postgres
{ "sql": "SELECT __base__.\"id\" AS \"id\", ... GROUP BY ... HAVING SUM(...) >= :p_1:", "params": { "p_0": "completed", "p_1": 100 } }

▶ 1d. revenueByUser — MongoDB
{ "sql": "aggregate", "params": { "collection": "users", "pipeline": [ { "$lookup": {...} }, { "$match": {...} }, { "$group": {...} }, ... ] } }

▶ 4b. upsertOrder — MariaDB (ON DUPLICATE KEY UPDATE)
{ "sql": "INSERT INTO `orders` (...) VALUES (...) ON DUPLICATE KEY UPDATE `total` = VALUES(`total`), ... RETURNING ..." }
```

## What to steal for your own project

| Feature exercised here                                                                                                                                                            | Read more                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Filter operators, `$exists`/`$nexists`, JOIN, JSON path filtering                                                                                                                 | [README → Comprehensive Filter System](../../README.md#comprehensive-filter-system)      |
| Every DML/DDL query type's full field list and runtime constraints                                                                                                                | [OQL-Types.md](../../types/OQL-Types.md), [OQL-Asserts.md](../../asserts/OQL-Asserts.md) |
| Per-dialect SQL/pipeline emission, `INSERT_FROM_QUERY`'s `$merge` vs `$out` choice on Mongo                                                                                       | [OQL-Translator.md](../../translator/OQL-Translator.md)                                  |
| Where behavior genuinely diverges per dialect (this example shows several: UPSERT syntax, `DECIMAL`/`NUMERIC`/`TEXT` type mapping, `NOW()`/`CURRENT_TIMESTAMP`/`datetime('now')`) | [Compatibility Matrix](../../docs/Compatibility.md)                                      |

No database connection, no test file — OQL only builds and translates query
objects, it never executes them, so there's nothing to connect to. Per the
[Example Projects convention](../../../../.github/instructions/documentation.instructions.md),
this directory carries no `*.test.ts`; verification is running it by hand, as
above.
