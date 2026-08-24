import { assertQuery } from '@tundralibs/oql/asserts';
import { MariaTranslator } from '@tundralibs/oql/translator';
import { MongoTranslator } from '@tundralibs/oql/translator';
import { PostgresTranslator } from '@tundralibs/oql/translator';
import { SQLiteTranslator } from '@tundralibs/oql/translator';
import {
  archiveCompletedOrders,
  createOrdersTable,
  insertOrder,
  revenueByUser,
  upsertOrder,
} from './queries.ts';

const say = (title: string, value: unknown) =>
  console.log(`\n▶ ${title}\n${JSON.stringify(value, null, 2)}`);

// Every query below is a plain OQL Query object — the same one, driving
// four different translators. assertQuery() is the runtime safety net
// for the cross-property rules TypeScript can't express (e.g. `having`
// only alongside `aggregates`, every @column referenced appears in
// `columns`) — cheap, and worth calling before any translator sees it.
for (
  const q of [
    revenueByUser,
    insertOrder,
    archiveCompletedOrders,
    upsertOrder,
    createOrdersTable,
  ]
) {
  assertQuery(q);
}

const pg = new PostgresTranslator();
const maria = new MariaTranslator();
const sqlite = new SQLiteTranslator();
const mongo = new MongoTranslator();

// ─── 1. SELECT with a JOIN, a filter on the joined column, and a SUM
//        aggregate + HAVING — the shape every dialect diverges on most.
say('1a. revenueByUser — Postgres', pg.select(revenueByUser));
say('1b. revenueByUser — MariaDB', maria.select(revenueByUser));
say('1c. revenueByUser — SQLite', sqlite.select(revenueByUser));
say('1d. revenueByUser — MongoDB', mongo.select(revenueByUser));

// ─── 2. INSERT using an Expression default (NOW()) — every dialect
//        emits its own native "current time" call, not a JS Date.
say('2a. insertOrder — Postgres', pg.insert(insertOrder));
say('2b. insertOrder — MariaDB', maria.insert(insertOrder));
say('2c. insertOrder — SQLite', sqlite.insert(insertOrder));
say('2d. insertOrder — MongoDB', mongo.insert(insertOrder));

// ─── 3. INSERT ... SELECT — columns/projection match POSITIONALLY, by
//        count, not by name (see OQL-Types.md's INSERT_FROM_QUERY branch).
//        MongoDB compiles this to an aggregation ending in $merge, not
//        $out — $out would REPLACE the whole target collection.
say(
  '3a. archiveCompletedOrders — Postgres',
  pg.insertQuery(archiveCompletedOrders),
);
say(
  '3b. archiveCompletedOrders — MariaDB',
  maria.insertQuery(archiveCompletedOrders),
);
say(
  '3c. archiveCompletedOrders — SQLite',
  sqlite.insertQuery(archiveCompletedOrders),
);
say(
  '3d. archiveCompletedOrders — MongoDB',
  mongo.insertQuery(archiveCompletedOrders),
);

// ─── 4. UPSERT — conflict resolution syntax is the single biggest
//        cross-dialect divergence in the whole translator.
say('4a. upsertOrder — Postgres (ON CONFLICT)', pg.upsert(upsertOrder));
say(
  '4b. upsertOrder — MariaDB (ON DUPLICATE KEY UPDATE)',
  maria.upsert(upsertOrder),
);
say('4c. upsertOrder — SQLite (ON CONFLICT)', sqlite.upsert(upsertOrder));
say(
  '4d. upsertOrder — MongoDB ($set + upsert:true)',
  mongo.upsert(upsertOrder),
);

// ─── 5. DDL — CREATE_TABLE diverges just as much as DML. createTable()
//        returns an ARRAY: some dialects split constraints into their
//        own statement.
say('5a. createOrdersTable — Postgres', pg.createTable(createOrdersTable));
say('5b. createOrdersTable — MariaDB', maria.createTable(createOrdersTable));
say('5c. createOrdersTable — SQLite', sqlite.createTable(createOrdersTable));
// MongoDB is schemaless — CREATE_TABLE is a no-op there (no collection
// definition step); showing that explicitly rather than skipping it.
say('5d. createOrdersTable — MongoDB', mongo.createTable(createOrdersTable));
