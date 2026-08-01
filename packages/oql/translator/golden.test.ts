/**
 * Golden-file cross-dialect verification for the OQL translators.
 *
 * Each entry in `CASES` declares an OQL `Query` and the expected SQL
 * (and, where it matters, params) for each dialect. The test runs every
 * case through every translator and asserts the output matches the
 * fixture. Updating expected output is intentionally a manual edit — the
 * file is the contract.
 *
 * Dialect-specific oddities (e.g. MariaDB rejecting partial-index WHERE,
 * SQLite refusing CREATE_SCHEMA) are encoded as `throws: 'maria'` etc.
 *
 * @module translator/golden.test
 */

import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import type { Query } from '../types/mod.ts';
import { SQLiteTranslator } from './SQLiteTranslator.ts';
import { PostgresTranslator } from './PostgresTranslator.ts';
import { MariaTranslator } from './MariaTranslator.ts';
import type { TranslatedQuery } from './types/mod.ts';

type Dialect = 'sqlite' | 'postgres' | 'maria';

type Expected = {
  sql: string;
  params?: Record<string, unknown>;
};

type Case = {
  name: string;
  // The translator method to call (matches the public API).
  method: keyof InstanceType<typeof SQLiteTranslator>;
  query: unknown;
  /** Expected single-statement output per dialect. */
  expected?: Partial<Record<Dialect, Expected | Expected[]>>;
  /** Dialects that should throw. */
  throws?: Dialect[];
};

const sqlite = new SQLiteTranslator();
const postgres = new PostgresTranslator();
const maria = new MariaTranslator();

const translators: Record<
  Dialect,
  SQLiteTranslator | PostgresTranslator | MariaTranslator
> = {
  sqlite,
  postgres,
  maria,
};

// =============================================================================
// Test cases
// =============================================================================

const CASES: Case[] = [
  // ---------------------------------------------------------------------------
  // SELECT
  // ---------------------------------------------------------------------------
  {
    name: 'SELECT minimal projection',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'name'],
      projection: { '@id': true, '@name': true },
    },
    expected: {
      sqlite: {
        sql: 'SELECT "id" AS "id", "name" AS "name" FROM "users"',
        params: {},
      },
      postgres: {
        sql: 'SELECT "id" AS "id", "name" AS "name" FROM "users"',
        params: {},
      },
      maria: {
        sql: 'SELECT `id` AS `id`, `name` AS `name` FROM `users`',
        params: {},
      },
    },
  },
  {
    name: 'SELECT with WHERE',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'status'],
      projection: { '@id': true },
      where: { '@status': 'active' },
    },
    expected: {
      sqlite: {
        sql: 'SELECT "id" AS "id" FROM "users" WHERE "status" = :p_0:',
        params: { p_0: 'active' },
      },
      postgres: {
        sql: 'SELECT "id" AS "id" FROM "users" WHERE "status" = :p_0:',
        params: { p_0: 'active' },
      },
      maria: {
        sql: 'SELECT `id` AS `id` FROM `users` WHERE `status` = :p_0:',
        params: { p_0: 'active' },
      },
    },
  },
  {
    name: 'WHERE value @col resolves to a column ref (shorthand)',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'status', 'role'],
      projection: { '@id': true },
      where: { '@status': '@role' },
    },
    expected: {
      sqlite: {
        sql: 'SELECT "id" AS "id" FROM "users" WHERE "status" = "role"',
      },
      postgres: {
        sql: 'SELECT "id" AS "id" FROM "users" WHERE "status" = "role"',
      },
      maria: {
        sql: 'SELECT `id` AS `id` FROM `users` WHERE `status` = `role`',
      },
    },
  },
  {
    name: 'WHERE value @col via $eq matches the shorthand (consistent)',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'status', 'role'],
      projection: { '@id': true },
      where: { '@status': { $eq: '@role' } },
    },
    expected: {
      sqlite: {
        sql: 'SELECT "id" AS "id" FROM "users" WHERE "status" = "role"',
      },
      postgres: {
        sql: 'SELECT "id" AS "id" FROM "users" WHERE "status" = "role"',
      },
      maria: {
        sql: 'SELECT `id` AS `id` FROM `users` WHERE `status` = `role`',
      },
    },
  },
  {
    name: 'WHERE value @x falls back to a literal when not a column',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'status'],
      projection: { '@id': true },
      where: { '@status': '@ghost' },
    },
    expected: {
      sqlite: {
        sql: 'SELECT "id" AS "id" FROM "users" WHERE "status" = :p_0:',
        params: { p_0: '@ghost' },
      },
      postgres: {
        sql: 'SELECT "id" AS "id" FROM "users" WHERE "status" = :p_0:',
        params: { p_0: '@ghost' },
      },
      maria: {
        sql: 'SELECT `id` AS `id` FROM `users` WHERE `status` = :p_0:',
        params: { p_0: '@ghost' },
      },
    },
  },
  {
    name: 'SELECT with $gte/$lt and $in',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'age', 'role'],
      projection: { '@id': true },
      where: {
        '@age': { $gte: 18, $lt: 65 },
        '@role': { $in: ['admin', 'editor'] },
      },
    },
    expected: {
      sqlite: {
        sql:
          'SELECT "id" AS "id" FROM "users" WHERE "age" >= :p_0: AND "age" < :p_1: AND "role" IN (:p_2:, :p_3:)',
      },
      postgres: {
        sql:
          'SELECT "id" AS "id" FROM "users" WHERE "age" >= :p_0: AND "age" < :p_1: AND "role" IN (:p_2:, :p_3:)',
      },
      maria: {
        sql:
          'SELECT `id` AS `id` FROM `users` WHERE `age` >= :p_0: AND `age` < :p_1: AND `role` IN (:p_2:, :p_3:)',
      },
    },
  },
  {
    name: 'SELECT with JOIN auto-expand to JSON',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'name'],
      joins: {
        Profile: {
          table: 'profiles',
          columns: ['userId', 'bio'],
          type: 'LEFT',
          on: { '@Profile.@userId': '@id' },
        },
      },
      projection: { '@id': true, '@Profile': 'profile' },
    },
    expected: {
      sqlite: {
        sql:
          'SELECT __base__."id" AS "id", json_group_array(json_object(:p_0:, "Profile"."userId", :p_1:, "Profile"."bio")) AS "profile" ' +
          'FROM "users" AS __base__ LEFT JOIN "profiles" AS "Profile" ON "Profile"."userId" = __base__."id" ' +
          'GROUP BY __base__."id"',
        params: { p_0: 'userId', p_1: 'bio' },
      },
      postgres: {
        sql:
          'SELECT __base__."id" AS "id", jsonb_agg(jsonb_build_object(:p_0:::text, "Profile"."userId", :p_1:::text, "Profile"."bio")) AS "profile" ' +
          'FROM "users" AS __base__ LEFT JOIN "profiles" AS "Profile" ON "Profile"."userId" = __base__."id" ' +
          'GROUP BY __base__."id"',
        params: { p_0: 'userId', p_1: 'bio' },
      },
      maria: {
        sql:
          'SELECT __base__.`id` AS `id`, JSON_ARRAYAGG(JSON_OBJECT(:p_0:, `Profile`.`userId`, :p_1:, `Profile`.`bio`)) AS `profile` ' +
          'FROM `users` AS __base__ LEFT JOIN `profiles` AS `Profile` ON `Profile`.`userId` = __base__.`id` ' +
          'GROUP BY __base__.`id`',
        params: { p_0: 'userId', p_1: 'bio' },
      },
    },
  },
  {
    // A composite join key: EVERY `on` entry is a condition and they AND
    // together. Cross-dialect counterpart of the Mongo multi-field
    // `$lookup` case — the tenant correlation must not be dropped.
    name: 'SELECT with a composite JOIN key ANDs every on entry',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'orders',
      columns: ['id', 'userId', 'tenantId'],
      joins: {
        U: {
          table: 'users',
          columns: ['id', 'tenantId', 'name'],
          type: 'LEFT',
          on: { '@U.@id': '@userId', '@U.@tenantId': '@tenantId' },
        },
      },
      projection: { '@id': true, '@U.@name': 'userName' },
    },
    expected: {
      sqlite: {
        sql:
          'SELECT __base__."id" AS "id", "U"."name" AS "userName" FROM "orders" AS __base__ ' +
          'LEFT JOIN "users" AS "U" ON "U"."id" = __base__."userId" AND "U"."tenantId" = __base__."tenantId"',
        params: {},
      },
      postgres: {
        sql:
          'SELECT __base__."id" AS "id", "U"."name" AS "userName" FROM "orders" AS __base__ ' +
          'LEFT JOIN "users" AS "U" ON "U"."id" = __base__."userId" AND "U"."tenantId" = __base__."tenantId"',
        params: {},
      },
      maria: {
        sql:
          'SELECT __base__.`id` AS `id`, `U`.`name` AS `userName` FROM `orders` AS __base__ ' +
          'LEFT JOIN `users` AS `U` ON `U`.`id` = __base__.`userId` AND `U`.`tenantId` = __base__.`tenantId`',
        params: {},
      },
    },
  },
  {
    name: 'SELECT with aggregates and auto GROUP BY',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'orders',
      columns: ['userId', 'amount'],
      aggregates: { total: { $$_aggregate: 'SUM', column: '@amount' } },
      projection: { '@userId': true, '@total': 'total' },
    },
    expected: {
      sqlite: {
        sql:
          'SELECT "userId" AS "userId", SUM("amount") AS "total" FROM "orders" GROUP BY "userId"',
      },
      postgres: {
        sql:
          'SELECT "userId" AS "userId", SUM("amount") AS "total" FROM "orders" GROUP BY "userId"',
      },
      maria: {
        sql:
          'SELECT `userId` AS `userId`, SUM(`amount`) AS `total` FROM `orders` GROUP BY `userId`',
      },
    },
  },
  {
    // STRING_AGG's separator flows through _textParameterize — the same hook
    // that types JSON_ROW object keys (see the JOIN auto-expand case). Only
    // Postgres casts it (`:p_0:::text`): its driver binds strings with an
    // unspecified type and the server cannot infer the string_agg(text, text)
    // overload otherwise. sqlite/maria bind the separator as a plain param.
    name: 'SELECT STRING_AGG separator is text-cast on Postgres',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'orders',
      columns: ['userId', 'tag'],
      aggregates: {
        tags: { $$_aggregate: 'STRING_AGG', column: '@tag', separator: ', ' },
      },
      projection: { '@userId': true, '@tags': 'tags' },
    },
    expected: {
      sqlite: {
        sql:
          'SELECT "userId" AS "userId", group_concat("tag", :p_0:) AS "tags" FROM "orders" GROUP BY "userId"',
        params: { p_0: ', ' },
      },
      postgres: {
        sql:
          'SELECT "userId" AS "userId", STRING_AGG("tag", :p_0:::text) AS "tags" FROM "orders" GROUP BY "userId"',
        params: { p_0: ', ' },
      },
      maria: {
        sql:
          'SELECT `userId` AS `userId`, GROUP_CONCAT(`tag` SEPARATOR :p_0:) AS `tags` FROM `orders` GROUP BY `userId`',
        params: { p_0: ', ' },
      },
    },
  },
  {
    // Aggregates can reference joined columns. The validator pre-collects
    // joined-column names so the aggregate column-scope check sees
    // `o.amount` here.
    name: 'SELECT aggregate over a joined column',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'name'],
      joins: {
        o: {
          table: 'orders',
          columns: ['amount', 'userId'],
          type: 'LEFT',
          on: { '@o.@userId': '@id' },
        },
      },
      aggregates: { total: { $$_aggregate: 'SUM', column: '@o.@amount' } },
      projection: { '@id': 'uid', '@total': 'total' },
    },
    expected: {
      sqlite: {
        sql:
          'SELECT __base__."id" AS "uid", SUM("o"."amount") AS "total" FROM "users" AS __base__ LEFT JOIN "orders" AS "o" ON "o"."userId" = __base__."id" GROUP BY __base__."id"',
      },
      postgres: {
        sql:
          'SELECT __base__."id" AS "uid", SUM("o"."amount") AS "total" FROM "users" AS __base__ LEFT JOIN "orders" AS "o" ON "o"."userId" = __base__."id" GROUP BY __base__."id"',
      },
      maria: {
        sql:
          'SELECT __base__.`id` AS `uid`, SUM(`o`.`amount`) AS `total` FROM `users` AS __base__ LEFT JOIN `orders` AS `o` ON `o`.`userId` = __base__.`id` GROUP BY __base__.`id`',
      },
    },
  },
  {
    // A declared expression projected alongside an aggregate must be grouped
    // on by its full SQL body — a bare quoted alias (`GROUP BY "label"`)
    // references a column that does not exist (e.g. on Postgres).
    name: 'SELECT GROUP BY emits expression body, not its alias',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'name'],
      expressions: { label: { $$_expression: 'UPPER', args: '@name' } },
      aggregates: { total: { $$_aggregate: 'COUNT' } },
      projection: { '@label': true, '@total': 'total' },
    },
    expected: {
      sqlite: {
        sql:
          'SELECT UPPER("name") AS "label", COUNT(1) AS "total" FROM "users" GROUP BY UPPER("name")',
      },
      postgres: {
        sql:
          'SELECT UPPER("name") AS "label", COUNT(1) AS "total" FROM "users" GROUP BY UPPER("name")',
      },
      maria: {
        sql:
          'SELECT UPPER(`name`) AS `label`, COUNT(1) AS `total` FROM `users` GROUP BY UPPER(`name`)',
      },
    },
  },
  {
    // Decision: OQL `SUBSTR` `start` is 1-based on every dialect. The SQL
    // dialects are natively 1-based, so `start: 1` passes straight through
    // and selects from the first character. (The Mongo golden pins the
    // matching 0-based `$substrCP` shift for the same input.)
    name: 'SUBSTR start is 1-based across SQL dialects',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'name'],
      expressions: {
        prefix: {
          $$_expression: 'SUBSTR',
          args: { string: '@name', start: 1, length: 3 },
        },
      },
      projection: { '@id': true, '@prefix': 'prefix' },
    },
    expected: {
      sqlite: {
        sql:
          'SELECT "id" AS "id", SUBSTR("name", :p_0:, :p_1:) AS "prefix" FROM "users"',
        params: { p_0: 1, p_1: 3 },
      },
      postgres: {
        sql:
          'SELECT "id" AS "id", SUBSTRING("name" FROM :p_0: FOR :p_1:) AS "prefix" FROM "users"',
        params: { p_0: 1, p_1: 3 },
      },
      maria: {
        sql:
          'SELECT `id` AS `id`, SUBSTRING(`name`, :p_0:, :p_1:) AS `prefix` FROM `users`',
        params: { p_0: 1, p_1: 3 },
      },
    },
  },
  {
    // $startsWith / $endsWith / $contains splice the bound value into a LIKE
    // pattern. A `%` / `_` / escape-char in that value must be escaped so it
    // matches literally, with an ESCAPE clause naming the escape char.
    name: 'SELECT $startsWith escapes LIKE wildcards',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'files',
      columns: ['id', 'path'],
      projection: { '@id': true },
      where: { '@path': { $startsWith: '50%_a\\b' } },
    },
    expected: {
      sqlite: {
        sql:
          'SELECT "id" AS "id" FROM "files" WHERE "path" LIKE (:p_0: || \'%\') ESCAPE \'\\\'',
        params: { p_0: '50\\%\\_a\\\\b' },
      },
      postgres: {
        sql:
          'SELECT "id" AS "id" FROM "files" WHERE "path" LIKE (:p_0: || \'%\') ESCAPE \'\\\'',
        params: { p_0: '50\\%\\_a\\\\b' },
      },
      maria: {
        sql:
          "SELECT `id` AS `id` FROM `files` WHERE `path` LIKE CONCAT(:p_0:, '%') ESCAPE '\\\\'",
        params: { p_0: '50\\%\\_a\\\\b' },
      },
    },
  },
  {
    name: 'SELECT $contains escapes LIKE wildcards',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'files',
      columns: ['id', 'path'],
      projection: { '@id': true },
      where: { '@path': { $contains: 'a%b' } },
    },
    expected: {
      sqlite: {
        sql:
          'SELECT "id" AS "id" FROM "files" WHERE "path" LIKE (\'%\' || :p_0: || \'%\') ESCAPE \'\\\'',
        params: { p_0: 'a\\%b' },
      },
      postgres: {
        sql:
          'SELECT "id" AS "id" FROM "files" WHERE "path" LIKE (\'%\' || :p_0: || \'%\') ESCAPE \'\\\'',
        params: { p_0: 'a\\%b' },
      },
      maria: {
        sql:
          "SELECT `id` AS `id` FROM `files` WHERE `path` LIKE CONCAT('%', :p_0:, '%') ESCAPE '\\\\'",
        params: { p_0: 'a\\%b' },
      },
    },
  },
  {
    // The LIKE family also accepts an Expression operand. There is no
    // literal to escape, so no ESCAPE clause — the computed value is
    // spliced into the pattern by the dialect's own concat form. The
    // Mongo translator has a matching case (`$expr` + `$indexOfCP`).
    name: 'SELECT $startsWith with an Expression value',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'name', 'nick'],
      projection: { '@id': true },
      where: {
        '@name': { $startsWith: { $$_expression: 'LOWER', args: '@nick' } },
      },
    },
    expected: {
      sqlite: {
        sql:
          'SELECT "id" AS "id" FROM "users" WHERE "name" LIKE (LOWER("nick") || \'%\')',
        params: {},
      },
      postgres: {
        sql:
          'SELECT "id" AS "id" FROM "users" WHERE "name" LIKE (LOWER("nick") || \'%\')',
        params: {},
      },
      maria: {
        sql:
          "SELECT `id` AS `id` FROM `users` WHERE `name` LIKE CONCAT(LOWER(`nick`), '%')",
        params: {},
      },
    },
  },
  {
    // Param dedup keys Dates by their epoch ms. A string that merely
    // LOOKS like one of those internal keys must still bind as a string
    // and get its own placeholder — never collapse onto the Date's.
    name: 'SELECT binds a Date and a key-lookalike string separately',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'events',
      columns: ['id', 'createdAt', 'note'],
      projection: { '@id': true },
      where: {
        '@createdAt': new Date(1000),
        '@note': '__date__1000',
      },
    },
    expected: {
      sqlite: {
        sql:
          'SELECT "id" AS "id" FROM "events" WHERE "createdAt" = :p_0: AND "note" = :p_1:',
        params: { p_0: new Date(1000), p_1: '__date__1000' },
      },
      postgres: {
        sql:
          'SELECT "id" AS "id" FROM "events" WHERE "createdAt" = :p_0: AND "note" = :p_1:',
        params: { p_0: new Date(1000), p_1: '__date__1000' },
      },
      maria: {
        sql:
          'SELECT `id` AS `id` FROM `events` WHERE `createdAt` = :p_0: AND `note` = :p_1:',
        params: { p_0: new Date(1000), p_1: '__date__1000' },
      },
    },
  },
  {
    // HAVING runs before the SELECT list materialises its aliases, so
    // `HAVING "total" >= …` would fail on Postgres (column does not
    // exist). The translator substitutes alias refs in HAVING with the
    // aggregate's full SQL — `HAVING SUM("amount") >= …`.
    name: 'SELECT HAVING substitutes aggregate alias body',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'orders',
      columns: ['userId', 'amount'],
      aggregates: { total: { $$_aggregate: 'SUM', column: '@amount' } },
      projection: { '@userId': true, '@total': 'total' },
      having: { '@total': { $gte: 100 } },
    },
    expected: {
      sqlite: {
        sql:
          'SELECT "userId" AS "userId", SUM("amount") AS "total" FROM "orders" GROUP BY "userId" HAVING SUM("amount") >= :p_0:',
        params: { p_0: 100 },
      },
      postgres: {
        sql:
          'SELECT "userId" AS "userId", SUM("amount") AS "total" FROM "orders" GROUP BY "userId" HAVING SUM("amount") >= :p_0:',
        params: { p_0: 100 },
      },
      maria: {
        sql:
          'SELECT `userId` AS `userId`, SUM(`amount`) AS `total` FROM `orders` GROUP BY `userId` HAVING SUM(`amount`) >= :p_0:',
        params: { p_0: 100 },
      },
    },
  },
  {
    name: 'SELECT ORDER BY + LIMIT + OFFSET',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'createdAt'],
      projection: { '@id': true, '@createdAt': true },
      orderBy: { '@createdAt': 'DESC' },
      limit: 10,
      offset: 20,
    },
    expected: {
      sqlite: {
        sql:
          'SELECT "id" AS "id", "createdAt" AS "createdAt" FROM "users" ORDER BY "createdAt" DESC LIMIT 10 OFFSET 20',
      },
      postgres: {
        sql:
          'SELECT "id" AS "id", "createdAt" AS "createdAt" FROM "users" ORDER BY "createdAt" DESC LIMIT 10 OFFSET 20',
      },
      maria: {
        sql:
          'SELECT `id` AS `id`, `createdAt` AS `createdAt` FROM `users` ORDER BY `createdAt` DESC LIMIT 10 OFFSET 20',
      },
    },
  },
  {
    // `limit` alone is unaffected by the offset-only sentinel — no OFFSET
    // clause is emitted at all.
    name: 'SELECT LIMIT without OFFSET',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id'],
      projection: { '@id': true },
      limit: 10,
    },
    expected: {
      sqlite: { sql: 'SELECT "id" AS "id" FROM "users" LIMIT 10' },
      postgres: { sql: 'SELECT "id" AS "id" FROM "users" LIMIT 10' },
      maria: { sql: 'SELECT `id` AS `id` FROM `users` LIMIT 10' },
    },
  },
  {
    // `offset` without `limit` is valid OQL but NOT valid SQL everywhere:
    // SQLite's grammar only accepts OFFSET as part of a LIMIT clause and
    // MariaDB/MySQL reject a bare OFFSET outright. Each dialect supplies
    // its documented "all remaining rows" limit sentinel; Postgres takes
    // a standalone OFFSET and needs none.
    name: 'SELECT OFFSET without LIMIT emits dialect-valid SQL',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id'],
      projection: { '@id': true },
      offset: 20,
    },
    expected: {
      sqlite: {
        sql: 'SELECT "id" AS "id" FROM "users" LIMIT -1 OFFSET 20',
        params: {},
      },
      postgres: {
        sql: 'SELECT "id" AS "id" FROM "users" OFFSET 20',
        params: {},
      },
      maria: {
        sql:
          'SELECT `id` AS `id` FROM `users` LIMIT 18446744073709551615 OFFSET 20',
        params: {},
      },
    },
  },
  {
    name: 'SELECT OFFSET 0 without LIMIT still emits a valid tail',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id'],
      projection: { '@id': true },
      offset: 0,
    },
    expected: {
      sqlite: { sql: 'SELECT "id" AS "id" FROM "users" LIMIT -1 OFFSET 0' },
      postgres: { sql: 'SELECT "id" AS "id" FROM "users" OFFSET 0' },
      maria: {
        sql:
          'SELECT `id` AS `id` FROM `users` LIMIT 18446744073709551615 OFFSET 0',
      },
    },
  },
  {
    name: 'SELECT ORDER BY + OFFSET without LIMIT (paging without a page size)',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'createdAt'],
      projection: { '@id': true, '@createdAt': true },
      orderBy: { '@createdAt': 'DESC' },
      offset: 5,
    },
    expected: {
      sqlite: {
        sql:
          'SELECT "id" AS "id", "createdAt" AS "createdAt" FROM "users" ORDER BY "createdAt" DESC LIMIT -1 OFFSET 5',
      },
      postgres: {
        sql:
          'SELECT "id" AS "id", "createdAt" AS "createdAt" FROM "users" ORDER BY "createdAt" DESC OFFSET 5',
      },
      maria: {
        sql:
          'SELECT `id` AS `id`, `createdAt` AS `createdAt` FROM `users` ORDER BY `createdAt` DESC LIMIT 18446744073709551615 OFFSET 5',
      },
    },
  },

  // ---------------------------------------------------------------------------
  // SELECT DISTINCT
  // ---------------------------------------------------------------------------
  {
    name: 'SELECT DISTINCT dedups the projection',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'role'],
      distinct: true,
      projection: { '@role': true },
    },
    expected: {
      sqlite: {
        sql: 'SELECT DISTINCT "role" AS "role" FROM "users"',
        params: {},
      },
      postgres: {
        sql: 'SELECT DISTINCT "role" AS "role" FROM "users"',
        params: {},
      },
      maria: {
        sql: 'SELECT DISTINCT `role` AS `role` FROM `users`',
        params: {},
      },
    },
  },
  {
    name: 'SELECT distinct:false emits a plain SELECT',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id'],
      distinct: false,
      projection: { '@id': true },
    },
    expected: {
      sqlite: { sql: 'SELECT "id" AS "id" FROM "users"', params: {} },
      postgres: { sql: 'SELECT "id" AS "id" FROM "users"', params: {} },
      maria: { sql: 'SELECT `id` AS `id` FROM `users`', params: {} },
    },
  },
  {
    // The fan-out shape DISTINCT exists for: a to-many JOIN used only for
    // filtering multiplies the base rows; DISTINCT collapses them again.
    name: 'SELECT DISTINCT collapses JOIN fan-out',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'name'],
      distinct: true,
      joins: {
        o: {
          table: 'orders',
          columns: ['userId', 'status'],
          type: 'LEFT',
          on: { '@o.@userId': '@id' },
        },
      },
      projection: { '@id': true, '@name': true },
      where: { '@o.@status': 'paid' },
    },
    expected: {
      sqlite: {
        sql:
          'SELECT DISTINCT __base__."id" AS "id", __base__."name" AS "name" ' +
          'FROM "users" AS __base__ LEFT JOIN "orders" AS "o" ON "o"."userId" = __base__."id" ' +
          'WHERE "o"."status" = :p_0:',
        params: { p_0: 'paid' },
      },
      postgres: {
        sql:
          'SELECT DISTINCT __base__."id" AS "id", __base__."name" AS "name" ' +
          'FROM "users" AS __base__ LEFT JOIN "orders" AS "o" ON "o"."userId" = __base__."id" ' +
          'WHERE "o"."status" = :p_0:',
        params: { p_0: 'paid' },
      },
      maria: {
        sql:
          'SELECT DISTINCT __base__.`id` AS `id`, __base__.`name` AS `name` ' +
          'FROM `users` AS __base__ LEFT JOIN `orders` AS `o` ON `o`.`userId` = __base__.`id` ' +
          'WHERE `o`.`status` = :p_0:',
        params: { p_0: 'paid' },
      },
    },
  },

  // ---------------------------------------------------------------------------
  // $exists / $nexists — correlated (NOT) EXISTS subqueries
  // ---------------------------------------------------------------------------
  {
    // No outer joins: the outer correlation ref must be qualified with the
    // outer table's own name — a bare "id" inside the subquery would be
    // captured by the subquery table's scope. Literal `on` values and the
    // subquery-local `where` are parameterised in order.
    name: '$exists without outer joins qualifies via the table name',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'name'],
      projection: { '@id': true, '@name': true },
      where: {
        $exists: {
          table: 'orders',
          on: { '@userId': '@id', '@kind': 'subscription' },
          where: { '@status': { $in: ['paid', 'shipped'] } },
        },
      },
    },
    expected: {
      sqlite: {
        sql:
          'SELECT "id" AS "id", "name" AS "name" FROM "users" WHERE EXISTS ' +
          '(SELECT 1 FROM "orders" AS "__exists__" WHERE "__exists__"."userId" = "users"."id" ' +
          'AND "__exists__"."kind" = :p_0: AND "__exists__"."status" IN (:p_1:, :p_2:))',
        params: { p_0: 'subscription', p_1: 'paid', p_2: 'shipped' },
      },
      postgres: {
        sql:
          'SELECT "id" AS "id", "name" AS "name" FROM "users" WHERE EXISTS ' +
          '(SELECT 1 FROM "orders" AS "__exists__" WHERE "__exists__"."userId" = "users"."id" ' +
          'AND "__exists__"."kind" = :p_0: AND "__exists__"."status" IN (:p_1:, :p_2:))',
        params: { p_0: 'subscription', p_1: 'paid', p_2: 'shipped' },
      },
      maria: {
        sql:
          'SELECT `id` AS `id`, `name` AS `name` FROM `users` WHERE EXISTS ' +
          '(SELECT 1 FROM `orders` AS `__exists__` WHERE `__exists__`.`userId` = `users`.`id` ' +
          'AND `__exists__`.`kind` = :p_0: AND `__exists__`.`status` IN (:p_1:, :p_2:))',
        params: { p_0: 'subscription', p_1: 'paid', p_2: 'shipped' },
      },
    },
  },
  {
    // With outer joins the base table is aliased __base__ — the EXISTS
    // correlation resolves through it. Also pins schema-qualified subquery
    // tables and the $nexists (NOT EXISTS) form.
    name: '$nexists with outer joins correlates through __base__',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'name'],
      joins: {
        p: {
          table: 'profiles',
          columns: ['userId', 'plan'],
          type: 'LEFT',
          on: { '@p.@userId': '@id' },
        },
      },
      projection: { '@id': true, '@p.@plan': 'plan' },
      where: {
        $nexists: {
          table: 'bans',
          schema: 'audit',
          on: { '@userId': '@id' },
        },
      },
    },
    expected: {
      sqlite: {
        sql: 'SELECT __base__."id" AS "id", "p"."plan" AS "plan" ' +
          'FROM "users" AS __base__ LEFT JOIN "profiles" AS "p" ON "p"."userId" = __base__."id" ' +
          'WHERE NOT EXISTS (SELECT 1 FROM "audit"."bans" AS "__exists__" WHERE "__exists__"."userId" = __base__."id")',
        params: {},
      },
      postgres: {
        sql: 'SELECT __base__."id" AS "id", "p"."plan" AS "plan" ' +
          'FROM "users" AS __base__ LEFT JOIN "profiles" AS "p" ON "p"."userId" = __base__."id" ' +
          'WHERE NOT EXISTS (SELECT 1 FROM "audit"."bans" AS "__exists__" WHERE "__exists__"."userId" = __base__."id")',
        params: {},
      },
      maria: {
        sql: 'SELECT __base__.`id` AS `id`, `p`.`plan` AS `plan` ' +
          'FROM `users` AS __base__ LEFT JOIN `profiles` AS `p` ON `p`.`userId` = __base__.`id` ' +
          'WHERE NOT EXISTS (SELECT 1 FROM `audit`.`bans` AS `__exists__` WHERE `__exists__`.`userId` = __base__.`id`)',
        params: {},
      },
    },
  },
  {
    name: '$exists composes inside $or',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'role'],
      projection: { '@id': true },
      where: {
        $or: [
          { '@role': 'admin' },
          { $exists: { table: 'orders', on: { '@userId': '@id' } } },
        ],
      },
    },
    expected: {
      sqlite: {
        sql: 'SELECT "id" AS "id" FROM "users" WHERE (("role" = :p_0:) OR ' +
          '(EXISTS (SELECT 1 FROM "orders" AS "__exists__" WHERE "__exists__"."userId" = "users"."id")))',
        params: { p_0: 'admin' },
      },
      postgres: {
        sql: 'SELECT "id" AS "id" FROM "users" WHERE (("role" = :p_0:) OR ' +
          '(EXISTS (SELECT 1 FROM "orders" AS "__exists__" WHERE "__exists__"."userId" = "users"."id")))',
        params: { p_0: 'admin' },
      },
      maria: {
        sql: 'SELECT `id` AS `id` FROM `users` WHERE ((`role` = :p_0:) OR ' +
          '(EXISTS (SELECT 1 FROM `orders` AS `__exists__` WHERE `__exists__`.`userId` = `users`.`id`)))',
        params: { p_0: 'admin' },
      },
    },
  },
  {
    // A $exists whose sub-`where` itself carries a nested $exists.
    // __prefixExistsKeys passes the nested spec through untouched (it only
    // rewrites plain column keys), then __translateExists recurses and the
    // inner subquery REUSES the "__exists__" alias — it shadows the outer one
    // (innermost FROM wins), so the inner `on` LHS still qualifies as
    // "__exists__"."orderId". The inner `on` value `1` is a plain literal and
    // parameterises; the outer `@id` still correlates to the query root.
    name: '$exists nested inside a sub-where reuses the __exists__ alias',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'name'],
      projection: { '@id': true, '@name': true },
      where: {
        $exists: {
          table: 'orders',
          on: { '@userId': '@id' },
          where: { $exists: { table: 'refunds', on: { '@orderId': 1 } } },
        },
      },
    },
    expected: {
      sqlite: {
        sql:
          'SELECT "id" AS "id", "name" AS "name" FROM "users" WHERE EXISTS ' +
          '(SELECT 1 FROM "orders" AS "__exists__" WHERE "__exists__"."userId" = "users"."id" ' +
          'AND EXISTS (SELECT 1 FROM "refunds" AS "__exists__" WHERE "__exists__"."orderId" = :p_0:))',
        params: { p_0: 1 },
      },
      postgres: {
        sql:
          'SELECT "id" AS "id", "name" AS "name" FROM "users" WHERE EXISTS ' +
          '(SELECT 1 FROM "orders" AS "__exists__" WHERE "__exists__"."userId" = "users"."id" ' +
          'AND EXISTS (SELECT 1 FROM "refunds" AS "__exists__" WHERE "__exists__"."orderId" = :p_0:))',
        params: { p_0: 1 },
      },
      maria: {
        sql:
          'SELECT `id` AS `id`, `name` AS `name` FROM `users` WHERE EXISTS ' +
          '(SELECT 1 FROM `orders` AS `__exists__` WHERE `__exists__`.`userId` = `users`.`id` ' +
          'AND EXISTS (SELECT 1 FROM `refunds` AS `__exists__` WHERE `__exists__`.`orderId` = :p_0:))',
        params: { p_0: 1 },
      },
    },
  },
  {
    // Correlation-safety: values inside an EXISTS sub-`where` are translated in
    // an EMPTY outer scope, so a value-position `@`-string never resolves to a
    // column — not even when the outer query HAS that column (`role` is a base
    // column here). `@role` degrades to a parameterised literal; correlation
    // happens exclusively through `on`.
    name:
      '$exists sub-where value @col degrades to a literal (never correlates)',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'name', 'role'],
      projection: { '@id': true, '@name': true },
      where: {
        $exists: {
          table: 'orders',
          on: { '@userId': '@id' },
          where: { '@status': '@role' },
        },
      },
    },
    expected: {
      sqlite: {
        sql:
          'SELECT "id" AS "id", "name" AS "name" FROM "users" WHERE EXISTS ' +
          '(SELECT 1 FROM "orders" AS "__exists__" WHERE "__exists__"."userId" = "users"."id" ' +
          'AND "__exists__"."status" = :p_0:)',
        params: { p_0: '@role' },
      },
      postgres: {
        sql:
          'SELECT "id" AS "id", "name" AS "name" FROM "users" WHERE EXISTS ' +
          '(SELECT 1 FROM "orders" AS "__exists__" WHERE "__exists__"."userId" = "users"."id" ' +
          'AND "__exists__"."status" = :p_0:)',
        params: { p_0: '@role' },
      },
      maria: {
        sql:
          'SELECT `id` AS `id`, `name` AS `name` FROM `users` WHERE EXISTS ' +
          '(SELECT 1 FROM `orders` AS `__exists__` WHERE `__exists__`.`userId` = `users`.`id` ' +
          'AND `__exists__`.`status` = :p_0:)',
        params: { p_0: '@role' },
      },
    },
  },
  {
    // An `on` value of `null` renders the SQL keyword NULL verbatim:
    // `"__exists__"."deletedAt" = NULL`. NOTE: `= NULL` is always UNKNOWN in
    // SQL (it never matches any row), which is distinct from the package's
    // `@col: null` => `IS NULL` convention used in ordinary WHERE clauses.
    // Pinned here as the ACTUAL emission, not an endorsement of the shape.
    name: '$exists on-value null emits `= NULL` (always-unknown, pinned as-is)',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'name'],
      projection: { '@id': true, '@name': true },
      where: {
        $exists: {
          table: 'orders',
          on: { '@userId': '@id', '@deletedAt': null },
        },
      },
    },
    expected: {
      sqlite: {
        sql:
          'SELECT "id" AS "id", "name" AS "name" FROM "users" WHERE EXISTS ' +
          '(SELECT 1 FROM "orders" AS "__exists__" WHERE "__exists__"."userId" = "users"."id" ' +
          'AND "__exists__"."deletedAt" = NULL)',
        params: {},
      },
      postgres: {
        sql:
          'SELECT "id" AS "id", "name" AS "name" FROM "users" WHERE EXISTS ' +
          '(SELECT 1 FROM "orders" AS "__exists__" WHERE "__exists__"."userId" = "users"."id" ' +
          'AND "__exists__"."deletedAt" = NULL)',
        params: {},
      },
      maria: {
        sql:
          'SELECT `id` AS `id`, `name` AS `name` FROM `users` WHERE EXISTS ' +
          '(SELECT 1 FROM `orders` AS `__exists__` WHERE `__exists__`.`userId` = `users`.`id` ' +
          'AND `__exists__`.`deletedAt` = NULL)',
        params: {},
      },
    },
  },
  {
    // An `on` value `@x` that names no column in the outer scope degrades to a
    // parameterised literal (the same rule join values follow) — it is NOT
    // emitted as a column ref. Here `@notacolumn` is not a `users` column, so
    // it binds as the literal string '@notacolumn'.
    name:
      '$exists on-value @x that is not an outer column degrades to a literal',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'name'],
      projection: { '@id': true, '@name': true },
      where: {
        $exists: {
          table: 'orders',
          on: { '@userId': '@notacolumn' },
        },
      },
    },
    expected: {
      sqlite: {
        sql:
          'SELECT "id" AS "id", "name" AS "name" FROM "users" WHERE EXISTS ' +
          '(SELECT 1 FROM "orders" AS "__exists__" WHERE "__exists__"."userId" = :p_0:)',
        params: { p_0: '@notacolumn' },
      },
      postgres: {
        sql:
          'SELECT "id" AS "id", "name" AS "name" FROM "users" WHERE EXISTS ' +
          '(SELECT 1 FROM "orders" AS "__exists__" WHERE "__exists__"."userId" = :p_0:)',
        params: { p_0: '@notacolumn' },
      },
      maria: {
        sql:
          'SELECT `id` AS `id`, `name` AS `name` FROM `users` WHERE EXISTS ' +
          '(SELECT 1 FROM `orders` AS `__exists__` WHERE `__exists__`.`userId` = :p_0:)',
        params: { p_0: '@notacolumn' },
      },
    },
  },

  // ---------------------------------------------------------------------------
  // COUNT (rewritten to SELECT COUNT(1))
  // ---------------------------------------------------------------------------
  {
    name: 'COUNT becomes SELECT COUNT(1)',
    method: 'count',
    query: {
      type: 'COUNT',
      table: 'users',
      columns: ['id', 'status'],
      where: { '@status': 'active' },
    } satisfies Query<'COUNT'>,
    expected: {
      sqlite: {
        sql:
          'SELECT COUNT(1) AS "__count__" FROM "users" WHERE "status" = :p_0:',
      },
      postgres: {
        sql:
          'SELECT COUNT(1) AS "__count__" FROM "users" WHERE "status" = :p_0:',
      },
      maria: {
        sql:
          'SELECT COUNT(1) AS `__count__` FROM `users` WHERE `status` = :p_0:',
      },
    },
  },
  {
    name: 'COUNT distinct emits COUNT(DISTINCT col)',
    method: 'count',
    query: {
      type: 'COUNT',
      table: 'orders',
      columns: ['id', 'userId'],
      distinct: ['userId'],
    } satisfies Query<'COUNT'>,
    expected: {
      sqlite: {
        sql: 'SELECT COUNT(DISTINCT "userId") AS "__count__" FROM "orders"',
        params: {},
      },
      postgres: {
        sql: 'SELECT COUNT(DISTINCT "userId") AS "__count__" FROM "orders"',
        params: {},
      },
      maria: {
        sql: 'SELECT COUNT(DISTINCT `userId`) AS `__count__` FROM `orders`',
        params: {},
      },
    },
  },
  {
    // The dedup shape COUNT distinct exists for: a to-many JOIN used only
    // for filtering fans the base rows out; COUNT(DISTINCT pk) counts base
    // rows, not the join product. With joins, the column resolves through
    // the __base__ alias.
    name: 'COUNT distinct dedups JOIN fan-out',
    method: 'count',
    query: {
      type: 'COUNT',
      table: 'users',
      columns: ['id'],
      distinct: ['id'],
      joins: {
        o: {
          table: 'orders',
          columns: ['userId', 'status'],
          type: 'LEFT',
          on: { '@o.@userId': '@id' },
        },
      },
      where: { '@o.@status': 'paid' },
    } satisfies Query<'COUNT'>,
    expected: {
      sqlite: {
        sql: 'SELECT COUNT(DISTINCT __base__."id") AS "__count__" ' +
          'FROM "users" AS __base__ LEFT JOIN "orders" AS "o" ON "o"."userId" = __base__."id" ' +
          'WHERE "o"."status" = :p_0:',
        params: { p_0: 'paid' },
      },
      postgres: {
        sql: 'SELECT COUNT(DISTINCT __base__."id") AS "__count__" ' +
          'FROM "users" AS __base__ LEFT JOIN "orders" AS "o" ON "o"."userId" = __base__."id" ' +
          'WHERE "o"."status" = :p_0:',
        params: { p_0: 'paid' },
      },
      maria: {
        sql: 'SELECT COUNT(DISTINCT __base__.`id`) AS `__count__` ' +
          'FROM `users` AS __base__ LEFT JOIN `orders` AS `o` ON `o`.`userId` = __base__.`id` ' +
          'WHERE `o`.`status` = :p_0:',
        params: { p_0: 'paid' },
      },
    },
  },
  {
    name: 'COUNT with $exists filter',
    method: 'count',
    query: {
      type: 'COUNT',
      table: 'users',
      columns: ['id'],
      where: { $exists: { table: 'orders', on: { '@userId': '@id' } } },
    } satisfies Query<'COUNT'>,
    expected: {
      sqlite: {
        sql: 'SELECT COUNT(1) AS "__count__" FROM "users" WHERE EXISTS ' +
          '(SELECT 1 FROM "orders" AS "__exists__" WHERE "__exists__"."userId" = "users"."id")',
        params: {},
      },
      postgres: {
        sql: 'SELECT COUNT(1) AS "__count__" FROM "users" WHERE EXISTS ' +
          '(SELECT 1 FROM "orders" AS "__exists__" WHERE "__exists__"."userId" = "users"."id")',
        params: {},
      },
      maria: {
        sql: 'SELECT COUNT(1) AS `__count__` FROM `users` WHERE EXISTS ' +
          '(SELECT 1 FROM `orders` AS `__exists__` WHERE `__exists__`.`userId` = `users`.`id`)',
        params: {},
      },
    },
  },

  // ---------------------------------------------------------------------------
  // INSERT
  // ---------------------------------------------------------------------------
  {
    name: 'INSERT single row, all columns present, with RETURNING',
    method: 'insert',
    query: {
      type: 'INSERT',
      table: 'users',
      columns: ['id', 'name', 'email'],
      data: { id: 1, name: 'John', email: 'john@x.com' },
    } satisfies Query<'INSERT'>,
    expected: {
      sqlite: {
        sql:
          'INSERT INTO "users" ("id", "name", "email") VALUES (:p_0:, :p_1:, :p_2:) RETURNING "id", "name", "email"',
        params: { p_0: 1, p_1: 'John', p_2: 'john@x.com' },
      },
      postgres: {
        sql:
          'INSERT INTO "users" ("id", "name", "email") VALUES (:p_0:, :p_1:, :p_2:) RETURNING "id", "name", "email"',
      },
      maria: {
        sql:
          'INSERT INTO `users` (`id`, `name`, `email`) VALUES (:p_0:, :p_1:, :p_2:) RETURNING `id`, `name`, `email`',
      },
    },
  },
  {
    name: 'INSERT row with explicit null and missing column',
    method: 'insert',
    query: {
      type: 'INSERT',
      table: 'users',
      columns: ['id', 'name', 'email', 'phone'],
      // `phone` is omitted entirely; `email` is explicitly null. Column
      // collection takes from data keys (so `phone` is absent), so this
      // INSERT only writes id/name/email.
      data: { id: 1, name: 'John', email: null },
    } satisfies Query<'INSERT'>,
    expected: {
      sqlite: {
        sql:
          'INSERT INTO "users" ("id", "name", "email") VALUES (:p_0:, :p_1:, NULL) RETURNING "id", "name", "email", "phone"',
        params: { p_0: 1, p_1: 'John' },
      },
      postgres: {
        sql:
          'INSERT INTO "users" ("id", "name", "email") VALUES (:p_0:, :p_1:, NULL) RETURNING "id", "name", "email", "phone"',
      },
      maria: {
        sql:
          'INSERT INTO `users` (`id`, `name`, `email`) VALUES (:p_0:, :p_1:, NULL) RETURNING `id`, `name`, `email`, `phone`',
      },
    },
  },
  {
    name: 'INSERT multi-row with column missing in some rows',
    method: 'insert',
    query: {
      type: 'INSERT',
      table: 'users',
      columns: ['id', 'name', 'email'],
      // First row has email; second doesn't — gets DEFAULT (PG/Maria) or
      // NULL (sqlite — see SQLiteTranslator._renderInsertValue) in row 2.
      data: [
        { id: 1, name: 'John', email: 'j@x.com' },
        { id: 2, name: 'Jane' },
      ],
    } satisfies Query<'INSERT'>,
    expected: {
      sqlite: {
        sql:
          'INSERT INTO "users" ("id", "name", "email") VALUES (:p_0:, :p_1:, :p_2:), (:p_3:, :p_4:, NULL) ' +
          'RETURNING "id", "name", "email"',
        params: { p_0: 1, p_1: 'John', p_2: 'j@x.com', p_3: 2, p_4: 'Jane' },
      },
      postgres: {
        sql:
          'INSERT INTO "users" ("id", "name", "email") VALUES (:p_0:, :p_1:, :p_2:), (:p_3:, :p_4:, DEFAULT) ' +
          'RETURNING "id", "name", "email"',
      },
      maria: {
        sql:
          'INSERT INTO `users` (`id`, `name`, `email`) VALUES (:p_0:, :p_1:, :p_2:), (:p_3:, :p_4:, DEFAULT) ' +
          'RETURNING `id`, `name`, `email`',
      },
    },
  },
  {
    name: 'INSERT with expression value (NOW)',
    method: 'insert',
    query: {
      type: 'INSERT',
      table: 'logs',
      columns: ['id', 'createdAt'],
      data: { id: 1, createdAt: { $$_expression: 'NOW' } },
    } satisfies Query<'INSERT'>,
    expected: {
      sqlite: {
        sql:
          `INSERT INTO "logs" ("id", "createdAt") VALUES (:p_0:, datetime('now')) RETURNING "id", "createdAt"`,
      },
      postgres: {
        sql:
          'INSERT INTO "logs" ("id", "createdAt") VALUES (:p_0:, CURRENT_TIMESTAMP) RETURNING "id", "createdAt"',
      },
      maria: {
        sql:
          'INSERT INTO `logs` (`id`, `createdAt`) VALUES (:p_0:, NOW()) RETURNING `id`, `createdAt`',
      },
    },
  },

  // ---------------------------------------------------------------------------
  // UPDATE / DELETE
  // ---------------------------------------------------------------------------
  {
    name: 'UPDATE with WHERE (no RETURNING on any dialect)',
    method: 'update',
    query: {
      type: 'UPDATE',
      table: 'users',
      columns: ['id', 'name'],
      data: { name: 'Jane' },
      where: { '@id': 1 },
    } satisfies Query<'UPDATE'>,
    expected: {
      sqlite: {
        sql: 'UPDATE "users" SET "name" = :p_0: WHERE "id" = :p_1:',
      },
      postgres: {
        sql: 'UPDATE "users" SET "name" = :p_0: WHERE "id" = :p_1:',
      },
      maria: {
        sql: 'UPDATE `users` SET `name` = :p_0: WHERE `id` = :p_1:',
      },
    },
  },
  {
    name: 'DELETE with WHERE (no RETURNING on any dialect)',
    method: 'delete',
    query: {
      type: 'DELETE',
      table: 'users',
      columns: ['id', 'status'],
      where: { '@status': 'inactive' },
    } satisfies Query<'DELETE'>,
    expected: {
      sqlite: {
        sql: 'DELETE FROM "users" WHERE "status" = :p_0:',
      },
      postgres: {
        sql: 'DELETE FROM "users" WHERE "status" = :p_0:',
      },
      maria: {
        sql: 'DELETE FROM `users` WHERE `status` = :p_0:',
      },
    },
  },
  {
    // UPDATE/DELETE never alias their table, so EXISTS correlation always
    // takes the table-name-qualified path there.
    name: 'UPDATE with $exists filter',
    method: 'update',
    query: {
      type: 'UPDATE',
      table: 'users',
      columns: ['id', 'status'],
      data: { status: 'vip' },
      where: {
        $exists: { table: 'orders', on: { '@userId': '@id', '@total': 100 } },
      },
    } satisfies Query<'UPDATE'>,
    expected: {
      sqlite: {
        sql: 'UPDATE "users" SET "status" = :p_0: WHERE EXISTS ' +
          '(SELECT 1 FROM "orders" AS "__exists__" WHERE "__exists__"."userId" = "users"."id" AND "__exists__"."total" = :p_1:)',
        params: { p_0: 'vip', p_1: 100 },
      },
      postgres: {
        sql: 'UPDATE "users" SET "status" = :p_0: WHERE EXISTS ' +
          '(SELECT 1 FROM "orders" AS "__exists__" WHERE "__exists__"."userId" = "users"."id" AND "__exists__"."total" = :p_1:)',
        params: { p_0: 'vip', p_1: 100 },
      },
      maria: {
        sql: 'UPDATE `users` SET `status` = :p_0: WHERE EXISTS ' +
          '(SELECT 1 FROM `orders` AS `__exists__` WHERE `__exists__`.`userId` = `users`.`id` AND `__exists__`.`total` = :p_1:)',
        params: { p_0: 'vip', p_1: 100 },
      },
    },
  },
  {
    name: 'DELETE with $nexists filter',
    method: 'delete',
    query: {
      type: 'DELETE',
      table: 'users',
      columns: ['id'],
      where: { $nexists: { table: 'orders', on: { '@userId': '@id' } } },
    } satisfies Query<'DELETE'>,
    expected: {
      sqlite: {
        sql: 'DELETE FROM "users" WHERE NOT EXISTS ' +
          '(SELECT 1 FROM "orders" AS "__exists__" WHERE "__exists__"."userId" = "users"."id")',
        params: {},
      },
      postgres: {
        sql: 'DELETE FROM "users" WHERE NOT EXISTS ' +
          '(SELECT 1 FROM "orders" AS "__exists__" WHERE "__exists__"."userId" = "users"."id")',
        params: {},
      },
      maria: {
        sql: 'DELETE FROM `users` WHERE NOT EXISTS ' +
          '(SELECT 1 FROM `orders` AS `__exists__` WHERE `__exists__`.`userId` = `users`.`id`)',
        params: {},
      },
    },
  },

  // ---------------------------------------------------------------------------
  // UPSERT — divergent (ON CONFLICT vs ON DUPLICATE KEY)
  // ---------------------------------------------------------------------------
  {
    name: 'UPSERT default updates everything except conflict keys',
    method: 'upsert',
    query: {
      type: 'UPSERT',
      table: 'users',
      columns: ['id', 'name', 'email'],
      data: { id: 1, name: 'John', email: 'j@x.com' },
      conflictKeys: ['@id'],
    } satisfies Query<'UPSERT'>,
    expected: {
      sqlite: {
        sql:
          'INSERT INTO "users" ("id", "name", "email") VALUES (:p_0:, :p_1:, :p_2:) ' +
          'ON CONFLICT ("id") DO UPDATE SET "name" = excluded."name", "email" = excluded."email" ' +
          'RETURNING "id", "name", "email"',
      },
      postgres: {
        sql:
          'INSERT INTO "users" ("id", "name", "email") VALUES (:p_0:, :p_1:, :p_2:) ' +
          'ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name", "email" = EXCLUDED."email" ' +
          'RETURNING "id", "name", "email"',
      },
      maria: {
        sql:
          'INSERT INTO `users` (`id`, `name`, `email`) VALUES (:p_0:, :p_1:, :p_2:) ' +
          'ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `email` = VALUES(`email`) ' +
          'RETURNING `id`, `name`, `email`',
      },
    },
  },

  // ---------------------------------------------------------------------------
  // DDL
  // ---------------------------------------------------------------------------
  {
    name: 'CREATE_TABLE with PK + unique',
    method: 'createTable',
    query: {
      type: 'CREATE_TABLE',
      table: 'users',
      columns: {
        id: { type: 'INTEGER', nullable: false },
        email: { type: 'VARCHAR', length: 255, nullable: false },
      },
      primaryKey: ['id'],
      uniqueKeys: { email_uk: ['email'] },
      ifNotExists: true,
    } satisfies Query<'CREATE_TABLE'>,
    expected: {
      sqlite: [{
        sql:
          'CREATE TABLE IF NOT EXISTS "users" ("id" INTEGER NOT NULL, "email" TEXT(255) NOT NULL, PRIMARY KEY ("id"), CONSTRAINT "email_uk" UNIQUE ("email"))',
      }],
      postgres: [{
        sql:
          'CREATE TABLE IF NOT EXISTS "users" ("id" INTEGER NOT NULL, "email" VARCHAR(255) NOT NULL, PRIMARY KEY ("id"), CONSTRAINT "email_uk" UNIQUE ("email"))',
      }],
      maria: [{
        sql:
          'CREATE TABLE IF NOT EXISTS `users` (`id` INT NOT NULL, `email` VARCHAR(255) NOT NULL, PRIMARY KEY (`id`), CONSTRAINT `email_uk` UNIQUE (`email`))',
      }],
    },
  },
  {
    // A column `comment` containing a backslash must not break the DDL.
    // MariaDB emits an inline `COMMENT '…'` and treats backslash as a
    // string-literal escape (NO_BACKSLASH_ESCAPES off), so a trailing
    // backslash would escape the closing quote — the emitter must double
    // it (matches _formatLiteral / _likeEscapeClause). Postgres and SQLite
    // emit the comment as a discarded C-style `/* … */` marker, where the
    // backslash is inert and passes through unchanged.
    name: 'CREATE_TABLE: column comment with a backslash escapes per dialect',
    method: 'createTable',
    query: {
      type: 'CREATE_TABLE',
      table: 'docs',
      columns: {
        id: { type: 'INTEGER', nullable: false },
        note: { type: 'INTEGER', comment: 'C:\\' },
      },
      primaryKey: ['id'],
    } satisfies Query<'CREATE_TABLE'>,
    expected: {
      sqlite: [{
        sql:
          'CREATE TABLE "docs" ("id" INTEGER NOT NULL, "note" INTEGER /* C:\\ */, PRIMARY KEY ("id"))',
      }],
      postgres: [{
        sql:
          'CREATE TABLE "docs" ("id" INTEGER NOT NULL, "note" INTEGER /* C:\\ */, PRIMARY KEY ("id"))',
      }],
      maria: [{
        // Backslash doubled — `'C:\\'` in emitted SQL keeps the literal closed.
        sql:
          "CREATE TABLE `docs` (`id` INT NOT NULL, `note` INT COMMENT 'C:\\\\', PRIMARY KEY (`id`))",
      }],
    },
  },
  {
    name: 'CREATE_TABLE: TIMESTAMPTZ + JSONB render per dialect',
    method: 'createTable',
    query: {
      type: 'CREATE_TABLE',
      table: 'events',
      columns: {
        id: { type: 'INTEGER', nullable: false },
        at: { type: 'TIMESTAMPTZ', nullable: false },
        meta: { type: 'JSONB', nullable: true },
      },
      primaryKey: ['id'],
      ifNotExists: true,
    } satisfies Query<'CREATE_TABLE'>,
    expected: {
      // TIMESTAMPTZ → TEXT / TIMESTAMPTZ / TIMESTAMP(6); JSONB → TEXT / JSONB / JSON
      sqlite: [{
        sql:
          'CREATE TABLE IF NOT EXISTS "events" ("id" INTEGER NOT NULL, "at" TEXT NOT NULL, "meta" TEXT, PRIMARY KEY ("id"))',
      }],
      postgres: [{
        sql:
          'CREATE TABLE IF NOT EXISTS "events" ("id" INTEGER NOT NULL, "at" TIMESTAMPTZ NOT NULL, "meta" JSONB, PRIMARY KEY ("id"))',
      }],
      maria: [{
        sql:
          'CREATE TABLE IF NOT EXISTS `events` (`id` INT NOT NULL, `at` TIMESTAMP(6) NOT NULL, `meta` JSON, PRIMARY KEY (`id`))',
      }],
    },
  },
  {
    name: 'ALTER_TABLE: add + drop + rename emits multiple statements',
    method: 'alterTable',
    query: {
      type: 'ALTER_TABLE',
      table: 'users',
      addColumns: { phone: { type: 'VARCHAR', length: 20 } },
      dropColumns: ['legacy'],
      renameTo: 'app_users',
    } satisfies Query<'ALTER_TABLE'>,
    expected: {
      sqlite: [
        { sql: 'ALTER TABLE "users" ADD COLUMN "phone" TEXT(20)' },
        { sql: 'ALTER TABLE "users" DROP COLUMN "legacy"' },
        { sql: 'ALTER TABLE "users" RENAME TO "app_users"' },
      ],
      postgres: [
        { sql: 'ALTER TABLE "users" ADD COLUMN "phone" VARCHAR(20)' },
        { sql: 'ALTER TABLE "users" DROP COLUMN "legacy"' },
        { sql: 'ALTER TABLE "users" RENAME TO "app_users"' },
      ],
      maria: [
        { sql: 'ALTER TABLE `users` ADD COLUMN `phone` VARCHAR(20)' },
        { sql: 'ALTER TABLE `users` DROP COLUMN `legacy`' },
        { sql: 'ALTER TABLE `users` RENAME TO `app_users`' },
      ],
    },
  },
  {
    name: 'ALTER_TABLE: rename + re-add under old name orders rename first',
    method: 'alterTable',
    query: {
      type: 'ALTER_TABLE',
      table: 'users',
      renameColumns: { status: 'legacy_status' },
      addColumns: { status: { type: 'VARCHAR', length: 20 } },
    } satisfies Query<'ALTER_TABLE'>,
    expected: {
      sqlite: [
        {
          sql: 'ALTER TABLE "users" RENAME COLUMN "status" TO "legacy_status"',
        },
        { sql: 'ALTER TABLE "users" ADD COLUMN "status" TEXT(20)' },
      ],
      postgres: [
        {
          sql: 'ALTER TABLE "users" RENAME COLUMN "status" TO "legacy_status"',
        },
        { sql: 'ALTER TABLE "users" ADD COLUMN "status" VARCHAR(20)' },
      ],
      maria: [
        {
          sql: 'ALTER TABLE `users` RENAME COLUMN `status` TO `legacy_status`',
        },
        { sql: 'ALTER TABLE `users` ADD COLUMN `status` VARCHAR(20)' },
      ],
    },
  },
  {
    name:
      'ALTER_TABLE: alterColumns modifies type + nullability (SQLite refuses)',
    method: 'alterTable',
    query: {
      type: 'ALTER_TABLE',
      table: 'users',
      alterColumns: {
        age: { type: 'BIGINT', nullable: false },
        note: { type: 'VARCHAR', length: 500, nullable: true },
      },
    } satisfies Query<'ALTER_TABLE'>,
    throws: ['sqlite'],
    expected: {
      postgres: [
        {
          sql:
            'ALTER TABLE "users" ALTER COLUMN "age" TYPE BIGINT USING "age"::BIGINT',
        },
        { sql: 'ALTER TABLE "users" ALTER COLUMN "age" SET NOT NULL' },
        {
          sql:
            'ALTER TABLE "users" ALTER COLUMN "note" TYPE VARCHAR(500) USING "note"::VARCHAR(500)',
        },
        { sql: 'ALTER TABLE "users" ALTER COLUMN "note" DROP NOT NULL' },
      ],
      maria: [
        { sql: 'ALTER TABLE `users` MODIFY COLUMN `age` BIGINT NOT NULL' },
        { sql: 'ALTER TABLE `users` MODIFY COLUMN `note` VARCHAR(500)' },
      ],
    },
  },
  {
    name: 'ALTER_TABLE: add + drop foreign keys (SQLite refuses)',
    method: 'alterTable',
    query: {
      type: 'ALTER_TABLE',
      table: 'posts',
      addForeignKeys: {
        fk_author: {
          columns: ['authorId'],
          references: { table: 'users', columns: ['id'] },
          onDelete: 'CASCADE',
        },
      },
      dropForeignKeys: ['fk_legacy'],
    } satisfies Query<'ALTER_TABLE'>,
    throws: ['sqlite'],
    expected: {
      // Drops FIRST: replacing an FK under the same name must not
      // collide with the constraint it supersedes.
      postgres: [
        { sql: 'ALTER TABLE "posts" DROP CONSTRAINT "fk_legacy"' },
        {
          sql:
            'ALTER TABLE "posts" ADD CONSTRAINT "fk_author" FOREIGN KEY ("authorId") REFERENCES "users" ("id") ON DELETE CASCADE',
        },
      ],
      maria: [
        { sql: 'ALTER TABLE `posts` DROP FOREIGN KEY `fk_legacy`' },
        {
          sql:
            'ALTER TABLE `posts` ADD CONSTRAINT `fk_author` FOREIGN KEY (`authorId`) REFERENCES `users` (`id`) ON DELETE CASCADE',
        },
      ],
    },
  },
  {
    name: 'DROP_TABLE with ifExists',
    method: 'dropTable',
    query: {
      type: 'DROP_TABLE',
      table: 'users',
      ifExists: true,
    } satisfies Query<'DROP_TABLE'>,
    expected: {
      sqlite: { sql: 'DROP TABLE IF EXISTS "users"' },
      postgres: { sql: 'DROP TABLE IF EXISTS "users"' },
      maria: { sql: 'DROP TABLE IF EXISTS `users`' },
    },
  },
  {
    name: 'CREATE_INDEX unique',
    method: 'createIndex',
    query: {
      type: 'CREATE_INDEX',
      index: 'idx_email',
      table: 'users',
      columns: ['@email'],
      unique: true,
      ifNotExists: true,
    } satisfies Query<'CREATE_INDEX'>,
    expected: {
      sqlite: {
        sql:
          'CREATE UNIQUE INDEX IF NOT EXISTS "idx_email" ON "users" ("email")',
      },
      postgres: {
        sql:
          'CREATE UNIQUE INDEX IF NOT EXISTS "idx_email" ON "users" ("email")',
      },
      maria: {
        sql:
          'CREATE UNIQUE INDEX IF NOT EXISTS `idx_email` ON `users` (`email`)',
      },
    },
  },
  {
    name: 'TRUNCATE',
    method: 'truncate',
    query: {
      type: 'TRUNCATE',
      table: 'users',
    } satisfies Query<'TRUNCATE'>,
    expected: {
      postgres: { sql: 'TRUNCATE TABLE "users"' },
      maria: { sql: 'TRUNCATE TABLE `users`' },
      // SQLite has no native TRUNCATE — we emit `DELETE FROM` so the
      // OQL surface is uniform across dialects.
      sqlite: { sql: 'DELETE FROM "users"' },
    },
  },
  {
    name: 'CREATE_SCHEMA — sqlite emulates via ATTACH DATABASE',
    method: 'createSchema',
    query: {
      type: 'CREATE_SCHEMA',
      schema: 'analytics',
    } satisfies Query<'CREATE_SCHEMA'>,
    expected: {
      postgres: { sql: 'CREATE SCHEMA IF NOT EXISTS "analytics"' },
      maria: { sql: 'CREATE DATABASE IF NOT EXISTS `analytics`' },
      // SQLite emits ATTACH DATABASE; the engine resolves the relative
      // filename to an absolute path under its schema directory.
      sqlite: { sql: `ATTACH DATABASE 'analytics.db' AS "analytics"` },
    },
  },
  {
    name: 'DROP_SCHEMA — sqlite emulates via DETACH DATABASE',
    method: 'dropSchema',
    query: {
      type: 'DROP_SCHEMA',
      schema: 'analytics',
    } satisfies Query<'DROP_SCHEMA'>,
    expected: {
      postgres: { sql: 'DROP SCHEMA IF EXISTS "analytics"' },
      maria: { sql: 'DROP DATABASE IF EXISTS `analytics`' },
      // SQLite DETACH; the engine then unlinks the schema's `.db` file.
      sqlite: { sql: 'DETACH DATABASE "analytics"' },
    },
  },

  // ---------------------------------------------------------------------------
  // Round-3 review regressions
  // ---------------------------------------------------------------------------
  {
    // Finding 1: ORDER BY on an aggregate alias in a JOINED select must emit
    // the aggregate BODY, not `__base__."total"` — a column that does not
    // exist on the base table (an execution-time error on every dialect).
    // Mirrors the substitution __buildGroupBy already makes.
    name: 'SELECT ORDER BY aggregate alias with joins emits the aggregate body',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id'],
      joins: {
        o: {
          table: 'orders',
          columns: ['userId', 'amount'],
          type: 'LEFT',
          on: { '@o.@userId': '@id' },
        },
      },
      aggregates: { total: { $$_aggregate: 'SUM', column: '@o.@amount' } },
      projection: { '@id': true, '@total': true },
      orderBy: { '@total': 'DESC' },
    } satisfies Query<'SELECT'>,
    expected: {
      sqlite: {
        sql:
          'SELECT __base__."id" AS "id", SUM("o"."amount") AS "total" FROM "users" AS __base__ LEFT JOIN "orders" AS "o" ON "o"."userId" = __base__."id" GROUP BY __base__."id" ORDER BY SUM("o"."amount") DESC',
        params: {},
      },
      postgres: {
        sql:
          'SELECT __base__."id" AS "id", SUM("o"."amount") AS "total" FROM "users" AS __base__ LEFT JOIN "orders" AS "o" ON "o"."userId" = __base__."id" GROUP BY __base__."id" ORDER BY SUM("o"."amount") DESC',
        params: {},
      },
      maria: {
        sql:
          'SELECT __base__.`id` AS `id`, SUM(`o`.`amount`) AS `total` FROM `users` AS __base__ LEFT JOIN `orders` AS `o` ON `o`.`userId` = __base__.`id` GROUP BY __base__.`id` ORDER BY SUM(`o`.`amount`) DESC',
        params: {},
      },
    },
  },
  {
    // Finding 1: a declared EXPRESSION alias in ORDER BY under joins likewise
    // orders by its body, matching the GROUP BY substitution.
    name:
      'SELECT ORDER BY expression + aggregate aliases with joins emit bodies',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'name'],
      joins: {
        o: {
          table: 'orders',
          columns: ['userId'],
          type: 'LEFT',
          on: { '@o.@userId': '@id' },
        },
      },
      expressions: { upperName: { $$_expression: 'UPPER', args: '@name' } },
      aggregates: { total: { $$_aggregate: 'COUNT' } },
      projection: { '@id': true, '@upperName': true, '@total': true },
      orderBy: { '@upperName': 'ASC', '@total': 'DESC' },
    } satisfies Query<'SELECT'>,
    expected: {
      sqlite: {
        sql:
          'SELECT __base__."id" AS "id", UPPER(__base__."name") AS "upperName", COUNT(1) AS "total" FROM "users" AS __base__ LEFT JOIN "orders" AS "o" ON "o"."userId" = __base__."id" GROUP BY __base__."id", UPPER(__base__."name") ORDER BY UPPER(__base__."name") ASC, COUNT(1) DESC',
        params: {},
      },
      postgres: {
        sql:
          'SELECT __base__."id" AS "id", UPPER(__base__."name") AS "upperName", COUNT(1) AS "total" FROM "users" AS __base__ LEFT JOIN "orders" AS "o" ON "o"."userId" = __base__."id" GROUP BY __base__."id", UPPER(__base__."name") ORDER BY UPPER(__base__."name") ASC, COUNT(1) DESC',
        params: {},
      },
      maria: {
        sql:
          'SELECT __base__.`id` AS `id`, UPPER(__base__.`name`) AS `upperName`, COUNT(1) AS `total` FROM `users` AS __base__ LEFT JOIN `orders` AS `o` ON `o`.`userId` = __base__.`id` GROUP BY __base__.`id`, UPPER(__base__.`name`) ORDER BY UPPER(__base__.`name`) ASC, COUNT(1) DESC',
        params: {},
      },
    },
  },
  {
    // Finding 4: `having` on COUNT is meaningless (no GROUP BY, no
    // user-referenceable aggregate alias) and was unusable (cryptic throw on
    // SQL, silent drop on Mongo). The validator now rejects it on every
    // dialect with one clear message.
    name: 'COUNT with having is rejected on all SQL dialects',
    method: 'count',
    query: {
      type: 'COUNT',
      table: 'users',
      columns: ['id', 'age'],
      where: { '@age': { $gt: 18 } },
      having: { '@age': { $gt: 1 } },
      // deno-lint-ignore no-explicit-any
    } as any,
    throws: ['sqlite', 'postgres', 'maria'],
  },
  {
    // Finding 5: MariaDB must qualify the RENAME target with the source
    // schema — an unqualified target resolves against the session default
    // database and would relocate the object. SQLite has no rename-only
    // ALTER_VIEW (refuses); Postgres keeps the object in-schema by grammar.
    name: 'ALTER_VIEW rename with schema qualifies the MariaDB target',
    method: 'alterView',
    query: {
      type: 'ALTER_VIEW',
      view: 'v1',
      schema: 's1',
      renameTo: 'v2',
    } satisfies Query<'ALTER_VIEW'>,
    throws: ['sqlite'],
    expected: {
      postgres: [{ sql: 'ALTER VIEW "s1"."v1" RENAME TO "v2"' }],
      maria: [{ sql: 'RENAME TABLE `s1`.`v1` TO `s1`.`v2`' }],
    },
  },
  {
    // Finding 5: same for ALTER TABLE ... RENAME under a schema on MariaDB.
    name: 'ALTER_TABLE rename with schema qualifies the MariaDB target',
    method: 'alterTable',
    query: {
      type: 'ALTER_TABLE',
      table: 't1',
      schema: 's1',
      renameTo: 't2',
    } satisfies Query<'ALTER_TABLE'>,
    expected: {
      sqlite: [{ sql: 'ALTER TABLE "s1"."t1" RENAME TO "t2"' }],
      postgres: [{ sql: 'ALTER TABLE "s1"."t1" RENAME TO "t2"' }],
      maria: [{ sql: 'ALTER TABLE `s1`.`t1` RENAME TO `s1`.`t2`' }],
    },
  },
  {
    // Finding 6: MariaDB FULLTEXT is an index KIND (`CREATE FULLTEXT INDEX`),
    // never a `USING FULLTEXT` clause (a syntax error). SQLite/Postgres have
    // no FULLTEXT method and drop it.
    name: 'CREATE_INDEX FULLTEXT emits CREATE FULLTEXT INDEX on MariaDB',
    method: 'createIndex',
    query: {
      type: 'CREATE_INDEX',
      index: 'idx_body',
      table: 'docs',
      columns: ['@body'],
      method: 'FULLTEXT',
    } satisfies Query<'CREATE_INDEX'>,
    expected: {
      sqlite: { sql: 'CREATE INDEX "idx_body" ON "docs" ("body")' },
      postgres: { sql: 'CREATE INDEX "idx_body" ON "docs" ("body")' },
      maria: { sql: 'CREATE FULLTEXT INDEX `idx_body` ON `docs` (`body`)' },
    },
  },
  {
    // Finding 6 regression: BTREE/HASH still render as a `USING <method>`
    // clause on the dialects that recognise it.
    name: 'CREATE_INDEX BTREE still emits USING BTREE',
    method: 'createIndex',
    query: {
      type: 'CREATE_INDEX',
      index: 'idx_body',
      table: 'docs',
      columns: ['@body'],
      method: 'BTREE',
    } satisfies Query<'CREATE_INDEX'>,
    expected: {
      sqlite: { sql: 'CREATE INDEX "idx_body" ON "docs" ("body")' },
      postgres: {
        sql: 'CREATE INDEX "idx_body" ON "docs" USING BTREE ("body")',
      },
      maria: { sql: 'CREATE INDEX `idx_body` ON `docs` (`body`) USING BTREE' },
    },
  },
  {
    // Finding 8: SQLite's CREATE VIEW grammar has no OR REPLACE — refuse it
    // loudly instead of emitting invalid SQL. Postgres/MariaDB support it.
    name: 'CREATE_VIEW orReplace: SQLite refuses, Postgres/MariaDB emit it',
    method: 'createView',
    query: {
      type: 'CREATE_VIEW',
      view: 'v1',
      orReplace: true,
      query: {
        type: 'SELECT',
        table: 't',
        columns: ['id'],
        projection: { '@id': true },
      },
    } satisfies Query<'CREATE_VIEW'>,
    throws: ['sqlite'],
    expected: {
      postgres: {
        sql: 'CREATE OR REPLACE VIEW "v1" AS SELECT "id" AS "id" FROM "t"',
      },
      maria: {
        sql: 'CREATE OR REPLACE VIEW `v1` AS SELECT `id` AS `id` FROM `t`',
      },
    },
  },
];

// =============================================================================
// Runner
// =============================================================================

function normalize(
  out: TranslatedQuery | TranslatedQuery[],
): TranslatedQuery[] {
  return Array.isArray(out) ? out : [out];
}

function expectedAsArray(
  e: Expected | Expected[] | undefined,
): Expected[] | undefined {
  if (e === undefined) return undefined;
  return Array.isArray(e) ? e : [e];
}

describe('oql.translator.golden', () => {
  for (const c of CASES) {
    describe(c.name, () => {
      for (const dialect of ['sqlite', 'postgres', 'maria'] as const) {
        const shouldThrow = c.throws?.includes(dialect);
        const expected = expectedAsArray(c.expected?.[dialect]);

        it(dialect, () => {
          const t = translators[dialect];
          // deno-lint-ignore no-explicit-any
          const fn = (t as any)[c.method].bind(t);

          if (shouldThrow) {
            asserts.assertThrows(() => fn(c.query));
            return;
          }
          if (!expected) {
            // No expectation declared and not in throws — skip the dialect.
            return;
          }

          const result = normalize(fn(c.query));
          asserts.assertEquals(
            result.length,
            expected.length,
            'statement count mismatch',
          );
          for (let i = 0; i < expected.length; i++) {
            asserts.assertEquals(result[i]!.sql, expected[i]!.sql);
            if (expected[i]!.params !== undefined) {
              asserts.assertEquals(result[i]!.params, expected[i]!.params);
            }
          }
        });
      }
    });
  }
});
