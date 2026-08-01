/**
 * Golden-file verification for {@link MongoTranslator}.
 *
 * Mongo's translator emits object-structured `params` (filter, pipeline,
 * options, …) rather than a SQL string with parameter placeholders, so
 * we compare via `assertEquals` on the whole `TranslatedQuery` rather
 * than substring matches.
 *
 * @module translator/golden-mongo.test
 */

import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import type { Query } from '../types/mod.ts';
import { MongoTranslator } from './MongoTranslator.ts';
import { DialectUnsupportedError } from '../errors/mod.ts';
import type { TranslatedQuery } from './types/mod.ts';

type Case = {
  name: string;
  method: keyof InstanceType<typeof MongoTranslator>;
  query: unknown;
  expected?: TranslatedQuery | TranslatedQuery[];
  throws?: boolean;
};

const t = new MongoTranslator();

const CASES: Case[] = [
  // ---------------------------------------------------------------------------
  // SELECT → find
  // ---------------------------------------------------------------------------
  {
    name: 'SELECT minimal → find',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'name'],
      projection: { '@id': true, '@name': true },
    },
    expected: {
      sql: 'find',
      params: {
        collection: 'users',
        filter: {},
        options: { projection: { id: 1, name: 1 } },
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
      sql: 'find',
      params: {
        collection: 'users',
        filter: { status: 'active' },
        options: { projection: { id: 1 } },
      },
    },
  },
  {
    // `@role` is a column, so this is a column-to-column comparison — emitted
    // as `$expr` (Mongo find-filters can only compare fields via $expr).
    // Mirrors SQL's `WHERE status = role`, closing the cross-dialect gap.
    name: 'WHERE @col value resolves to a $expr column comparison',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'status', 'role'],
      projection: { '@id': true },
      where: { '@status': '@role' },
    },
    expected: {
      sql: 'find',
      params: {
        collection: 'users',
        filter: { $expr: { $eq: ['$status', '$role'] } },
        options: { projection: { id: 1 } },
      },
    },
  },
  {
    // `@ghost` is not a column → falls back to a literal (same rule as SQL).
    name: 'WHERE @x value falls back to a literal when not a column',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'status'],
      projection: { '@id': true },
      where: { '@status': '@ghost' },
    },
    expected: {
      sql: 'find',
      params: {
        collection: 'users',
        filter: { status: '@ghost' },
        options: { projection: { id: 1 } },
      },
    },
  },
  {
    // Operator-form column comparison also routes through $expr.
    name: 'WHERE operator value @col resolves to a $expr comparison',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'orders',
      columns: ['id', 'price', 'cost'],
      projection: { '@id': true },
      where: { '@price': { $gt: '@cost' } },
    },
    expected: {
      sql: 'find',
      params: {
        collection: 'orders',
        filter: { $expr: { $gt: ['$price', '$cost'] } },
        options: { projection: { id: 1 } },
      },
    },
  },
  {
    // $in with a column reference can't be expressed in a Mongo $match — throw
    // rather than silently treat the @ref as a literal.
    name: 'WHERE $in with a @col value throws (unsupported in Mongo)',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'status', 'role'],
      projection: { '@id': true },
      where: { '@status': { $in: ['@role'] } },
    },
    throws: true,
  },
  {
    // LIKE-family field-to-field has no faithful Mongo equivalent — throw.
    name: 'WHERE $startsWith with a @col value throws (unsupported in Mongo)',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'name', 'prefix'],
      projection: { '@id': true },
      where: { '@name': { $startsWith: '@prefix' } },
    },
    throws: true,
  },
  {
    name: 'SELECT with operators',
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
      sql: 'find',
      params: {
        collection: 'users',
        filter: {
          age: { $gte: 18, $lt: 65 },
          role: { $in: ['admin', 'editor'] },
        },
        options: { projection: { id: 1 } },
      },
    },
  },
  {
    name: 'SELECT with $or',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'role'],
      projection: { '@id': true },
      where: { $or: [{ '@role': 'admin' }, { '@role': 'editor' }] },
    },
    expected: {
      sql: 'find',
      params: {
        collection: 'users',
        filter: { $or: [{ role: 'admin' }, { role: 'editor' }] },
        options: { projection: { id: 1 } },
      },
    },
  },
  {
    name: 'SELECT projection alias → aggregate ($project rename)',
    method: 'select',
    // Mongo's `find().project()` only takes 0/1 includes; renaming via
    // `aliasName: $source` requires the aggregation pipeline. So a
    // projection that contains any string-valued (alias) entries is
    // emitted as an aggregate by `_buildSelect`.
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'name'],
      projection: { '@id': 'userId', '@name': 'displayName' },
    },
    expected: {
      sql: 'aggregate',
      params: {
        collection: 'users',
        pipeline: [
          { $project: { userId: '$id', displayName: '$name', _id: 0 } },
        ],
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
      sql: 'find',
      params: {
        collection: 'users',
        filter: {},
        options: {
          projection: { id: 1, createdAt: 1 },
          sort: { createdAt: -1 },
          limit: 10,
          skip: 20,
        },
      },
    },
  },
  {
    name: 'SELECT $like → $regex',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'name'],
      projection: { '@id': true },
      where: { '@name': { $like: 'John%' } },
    },
    expected: {
      sql: 'find',
      params: {
        collection: 'users',
        filter: { name: { $regex: '^John.*$' } },
        options: { projection: { id: 1 } },
      },
    },
  },
  {
    // A literal `*` in a LIKE pattern is NOT a wildcard; it must be escaped
    // so it can't act as a regex quantifier (regex-injection guard). `%`
    // still translates to `.*`.
    name: 'SELECT $like escapes a literal star',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'name'],
      projection: { '@id': true },
      where: { '@name': { $like: '5*x%' } },
    },
    expected: {
      sql: 'find',
      params: {
        collection: 'users',
        filter: { name: { $regex: '^5\\*x.*$' } },
        options: { projection: { id: 1 } },
      },
    },
  },
  {
    name: 'SELECT $startsWith escapes regex specials',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'logs',
      columns: ['id', 'msg'],
      projection: { '@id': true },
      where: { '@msg': { $startsWith: 'a.b+c' } },
    },
    expected: {
      sql: 'find',
      params: {
        collection: 'logs',
        filter: { msg: { $regex: '^a\\.b\\+c' } },
        options: { projection: { id: 1 } },
      },
    },
  },

  // ---------------------------------------------------------------------------
  // SELECT → aggregate (joins / aggregates / expressions)
  // ---------------------------------------------------------------------------
  {
    // Decision: OQL `SUBSTR` `start` is 1-based on every dialect. Mongo's
    // `$substrCP` is 0-based, so the translator shifts `start` down by one
    // (`{ $subtract: [<start>, 1] }`) — `start: 1` becomes offset 0, i.e.
    // the first character, matching the SQL golden for the same input.
    name: 'SELECT SUBSTR start is 1-based (shifted for 0-based $substrCP)',
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
      sql: 'aggregate',
      params: {
        collection: 'users',
        pipeline: [
          {
            $addFields: {
              prefix: { $substrCP: ['$name', { $subtract: [1, 1] }, 3] },
            },
          },
          { $project: { id: 1, prefix: '$prefix', _id: 0 } },
        ],
      },
    },
  },
  {
    name: 'SELECT with aggregates → aggregate pipeline',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'orders',
      columns: ['userId', 'amount'],
      aggregates: { total: { $$_aggregate: 'SUM', column: '@amount' } },
      projection: { '@userId': true, '@total': 'total' },
    },
    expected: {
      sql: 'aggregate',
      params: {
        collection: 'orders',
        pipeline: [
          {
            $group: {
              _id: { userId: '$userId' },
              total: { $sum: '$amount' },
            },
          },
          // Flatten the grouped key back to top level so the subsequent
          // $project sees a plain `userId` field.
          { $addFields: { userId: '$_id.userId' } },
          { $project: { userId: 1, total: '$total', _id: 0 } },
        ],
      },
    },
  },
  {
    name: 'SELECT with JOIN → aggregate with $lookup',
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
      projection: { '@id': true, '@Profile.@bio': 'bio' },
    },
    expected: {
      sql: 'aggregate',
      params: {
        collection: 'users',
        pipeline: [
          {
            $lookup: {
              from: 'profiles',
              localField: 'id',
              foreignField: 'userId',
              as: 'Profile',
            },
          },
          { $project: { id: 1, bio: '$Profile.bio', _id: 0 } },
        ],
      },
    },
  },
  {
    // A composite join key. Every `on` entry is a condition (SQL ANDs
    // them all), so a single-field localField/foreignField `$lookup`
    // would silently drop the tenant correlation and over-match. The
    // general `let` + sub-pipeline form correlates on every pair.
    name: 'SELECT with a composite JOIN key → multi-field $lookup',
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
      sql: 'aggregate',
      params: {
        collection: 'orders',
        pipeline: [
          {
            $lookup: {
              from: 'users',
              let: { v0: '$userId', v1: '$tenantId' },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $eq: ['$id', '$$v0'] },
                        { $eq: ['$tenantId', '$$v1'] },
                      ],
                    },
                  },
                },
              ],
              as: 'U',
            },
          },
          { $project: { id: 1, userName: '$U.name', _id: 0 } },
        ],
      },
    },
  },
  {
    // A constant `on` value is a condition on the JOINED collection, not
    // a correlation. The concise form has no way to express it (it would
    // have silently correlated against `_id`), so this takes the
    // sub-pipeline form too — with no `let`, since nothing local is
    // referenced.
    name: 'SELECT with a constant JOIN condition → sub-pipeline $lookup',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'orders',
      columns: ['id', 'userId'],
      joins: {
        U: {
          table: 'users',
          columns: ['id', 'status', 'name'],
          type: 'LEFT',
          on: { '@U.@status': 'active' },
        },
      },
      projection: { '@id': true, '@U.@name': 'userName' },
    },
    expected: {
      sql: 'aggregate',
      params: {
        collection: 'orders',
        pipeline: [
          {
            $lookup: {
              from: 'users',
              pipeline: [
                { $match: { $expr: { $eq: ['$status', 'active'] } } },
              ],
              as: 'U',
            },
          },
          { $project: { id: 1, userName: '$U.name', _id: 0 } },
        ],
      },
    },
  },

  {
    // An Expression `on` value computes over the LOCAL row, so it binds
    // as a `let` variable — inside the sub-pipeline a bare `$field`
    // addresses the joined collection, which would silently be the wrong
    // document.
    name: 'SELECT with an Expression JOIN condition binds it as a let var',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'orders',
      columns: ['id', 'amount'],
      joins: {
        U: {
          table: 'users',
          columns: ['id', 'name'],
          type: 'LEFT',
          on: { '@U.@id': { $$_expression: 'ADD', args: ['@amount', 1] } },
        },
      },
      projection: { '@id': true, '@U.@name': 'userName' },
    },
    expected: {
      sql: 'aggregate',
      params: {
        collection: 'orders',
        pipeline: [
          {
            $lookup: {
              from: 'users',
              let: { v0: { $add: ['$amount', 1] } },
              pipeline: [
                { $match: { $expr: { $eq: ['$id', '$$v0'] } } },
              ],
              as: 'U',
            },
          },
          { $project: { id: 1, userName: '$U.name', _id: 0 } },
        ],
      },
    },
  },

  // ---------------------------------------------------------------------------
  // Date arithmetic — OQL TimeUnit → Mongo unit
  // ---------------------------------------------------------------------------
  {
    // `$dateAdd` / `$dateDiff` only accept lowercase singular units and
    // fail at execution with `unknown time unit value: DAYS` on the raw
    // OQL unit, so the translator maps them.
    name: 'DATE_ADD / DATE_DIFF map OQL time units to Mongo units',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'orders',
      columns: ['id', 'createdAt', 'shippedAt'],
      expressions: {
        due: {
          $$_expression: 'DATE_ADD',
          args: { date: '@createdAt', amount: 7, unit: 'DAYS' },
        },
        ageHours: {
          $$_expression: 'DATE_DIFF',
          args: { from: '@createdAt', to: '@shippedAt', unit: 'HOURS' },
        },
        ageMonths: {
          $$_expression: 'DATE_DIFF',
          args: { from: '@createdAt', to: '@shippedAt', unit: 'MONTHS' },
        },
      },
      projection: {
        '@id': true,
        '@due': 'due',
        '@ageHours': 'ageHours',
        '@ageMonths': 'ageMonths',
      },
    },
    expected: {
      sql: 'aggregate',
      params: {
        collection: 'orders',
        pipeline: [
          {
            $addFields: {
              due: {
                $dateAdd: {
                  startDate: '$createdAt',
                  unit: 'day',
                  amount: 7,
                },
              },
              ageHours: {
                $dateDiff: {
                  startDate: '$createdAt',
                  endDate: '$shippedAt',
                  unit: 'hour',
                },
              },
              ageMonths: {
                $dateDiff: {
                  startDate: '$createdAt',
                  endDate: '$shippedAt',
                  unit: 'month',
                },
              },
            },
          },
          {
            $project: {
              id: 1,
              due: '$due',
              ageHours: '$ageHours',
              ageMonths: '$ageMonths',
              _id: 0,
            },
          },
        ],
      },
    },
  },
  {
    // The remaining units — every member of OQL's TimeUnit is mapped.
    name: 'DATE_ADD maps MINUTES / SECONDS / YEARS',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'orders',
      columns: ['id', 'createdAt'],
      expressions: {
        mins: {
          $$_expression: 'DATE_ADD',
          args: { date: '@createdAt', amount: 30, unit: 'MINUTES' },
        },
        secs: {
          $$_expression: 'DATE_ADD',
          args: { date: '@createdAt', amount: 90, unit: 'SECONDS' },
        },
        yrs: {
          $$_expression: 'DATE_ADD',
          args: { date: '@createdAt', amount: 1, unit: 'YEARS' },
        },
      },
      projection: {
        '@id': true,
        '@mins': 'mins',
        '@secs': 'secs',
        '@yrs': 'yrs',
      },
    },
    expected: {
      sql: 'aggregate',
      params: {
        collection: 'orders',
        pipeline: [
          {
            $addFields: {
              mins: {
                $dateAdd: {
                  startDate: '$createdAt',
                  unit: 'minute',
                  amount: 30,
                },
              },
              secs: {
                $dateAdd: {
                  startDate: '$createdAt',
                  unit: 'second',
                  amount: 90,
                },
              },
              yrs: {
                $dateAdd: {
                  startDate: '$createdAt',
                  unit: 'year',
                  amount: 1,
                },
              },
            },
          },
          {
            $project: {
              id: 1,
              mins: '$mins',
              secs: '$secs',
              yrs: '$yrs',
              _id: 0,
            },
          },
        ],
      },
    },
  },

  // ---------------------------------------------------------------------------
  // LIKE family with an Expression operand
  // ---------------------------------------------------------------------------
  {
    // `$startsWith` carries LITERAL substring semantics (SQL escapes the
    // bound value's wildcards), so a computed operand maps onto Mongo's
    // literal string search rather than a regex — nothing to escape.
    name: 'WHERE $startsWith with an Expression value → $expr $indexOfCP',
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
      sql: 'find',
      params: {
        collection: 'users',
        filter: {
          $expr: { $eq: [{ $indexOfCP: ['$name', { $toLower: '$nick' }] }, 0] },
        },
        options: { projection: { id: 1 } },
      },
    },
  },
  {
    name: 'WHERE $contains with an Expression value → $expr $indexOfCP',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'name', 'nick'],
      projection: { '@id': true },
      where: {
        '@name': { $contains: { $$_expression: 'LOWER', args: '@nick' } },
      },
    },
    expected: {
      sql: 'find',
      params: {
        collection: 'users',
        filter: {
          $expr: {
            $gte: [{ $indexOfCP: ['$name', { $toLower: '$nick' }] }, 0],
          },
        },
        options: { projection: { id: 1 } },
      },
    },
  },
  {
    // Mongo has no "last index of", so `$endsWith` compares the trailing
    // slice. `$let` binds both operands once; `$ifNull` keeps a missing
    // field from raising a `$strLenCP` type error (it just doesn't match).
    name: 'WHERE $endsWith with an Expression value → $expr slice compare',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'name', 'nick'],
      projection: { '@id': true },
      where: {
        '@name': { $endsWith: { $$_expression: 'LOWER', args: '@nick' } },
      },
    },
    expected: {
      sql: 'find',
      params: {
        collection: 'users',
        filter: {
          $expr: {
            $let: {
              vars: {
                subject: { $ifNull: ['$name', ''] },
                suffix: { $toLower: '$nick' },
              },
              in: {
                $and: [
                  {
                    $gte: [
                      { $strLenCP: '$$subject' },
                      { $strLenCP: '$$suffix' },
                    ],
                  },
                  {
                    $eq: [
                      {
                        $substrCP: [
                          '$$subject',
                          {
                            $subtract: [
                              { $strLenCP: '$$subject' },
                              { $strLenCP: '$$suffix' },
                            ],
                          },
                          { $strLenCP: '$$suffix' },
                        ],
                      },
                      '$$suffix',
                    ],
                  },
                ],
              },
            },
          },
        },
        options: { projection: { id: 1 } },
      },
    },
  },
  {
    // `$like`'s value IS a wildcard pattern; translating that grammar to
    // a regex needs the pattern at translation time. Computed operand →
    // refuse loudly rather than crash or fake it.
    name: 'WHERE $like with an Expression value throws (pattern unknowable)',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'name', 'nick'],
      projection: { '@id': true },
      where: {
        '@name': { $like: { $$_expression: 'LOWER', args: '@nick' } },
      },
    },
    throws: true,
  },
  {
    name: 'WHERE $ilike with an Expression value throws (pattern unknowable)',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'name', 'nick'],
      projection: { '@id': true },
      where: {
        '@name': { $ilike: { $$_expression: 'LOWER', args: '@nick' } },
      },
    },
    throws: true,
  },

  // ---------------------------------------------------------------------------
  // INSERT
  // ---------------------------------------------------------------------------
  {
    name: 'INSERT single row',
    method: 'insert',
    query: {
      type: 'INSERT',
      table: 'users',
      columns: ['id', 'name', 'email'],
      data: { id: 1, name: 'John', email: 'j@x.com' },
    },
    expected: {
      sql: 'insert',
      params: {
        collection: 'users',
        data: { id: 1, name: 'John', email: 'j@x.com' },
      },
    },
  },
  {
    name: 'INSERT multi-row',
    method: 'insert',
    query: {
      type: 'INSERT',
      table: 'users',
      columns: ['id', 'name'],
      data: [{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }],
    },
    expected: {
      sql: 'insert',
      params: {
        collection: 'users',
        data: [{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }],
      },
    },
  },
  {
    name: 'INSERT with NOW expression',
    method: 'insert',
    query: {
      type: 'INSERT',
      table: 'logs',
      columns: ['id', 'createdAt'],
      data: { id: 1, createdAt: { $$_expression: 'NOW' } },
    },
    expected: {
      sql: 'insert',
      params: {
        collection: 'logs',
        data: { id: 1, createdAt: '$$NOW' },
      },
    },
  },

  // ---------------------------------------------------------------------------
  // UPDATE / DELETE
  // ---------------------------------------------------------------------------
  {
    name: 'UPDATE with WHERE',
    method: 'update',
    query: {
      type: 'UPDATE',
      table: 'users',
      columns: ['id', 'name'],
      data: { name: 'Jane' },
      where: { '@id': 1 },
    },
    expected: {
      sql: 'update',
      params: {
        collection: 'users',
        filter: { id: 1 },
        data: { $set: { name: 'Jane' } },
        options: { multiple: true },
      },
    },
  },
  {
    name: 'DELETE with WHERE',
    method: 'delete',
    query: {
      type: 'DELETE',
      table: 'users',
      columns: ['id', 'status'],
      where: { '@status': 'inactive' },
    },
    expected: {
      sql: 'delete',
      params: {
        collection: 'users',
        filter: { status: 'inactive' },
        options: { multiple: true },
      },
    },
  },

  // ---------------------------------------------------------------------------
  // UPSERT — Mongo-flavoured
  // ---------------------------------------------------------------------------
  {
    name: 'UPSERT splits conflict keys into filter and rest into $set',
    method: 'upsert',
    query: {
      type: 'UPSERT',
      table: 'users',
      columns: ['id', 'name', 'email'],
      data: { id: 1, name: 'John', email: 'j@x.com' },
      conflictKeys: ['@id'],
    },
    expected: {
      sql: 'update',
      params: {
        collection: 'users',
        filter: { id: 1 },
        data: {
          $set: { name: 'John', email: 'j@x.com' },
          $setOnInsert: { id: 1 },
        },
        options: { upsert: true },
      },
    },
  },

  // Bulk UPSERT: array data emits a `bulkWrite` action, one updateOne
  // op per row. Each op carries the same filter / $set / $setOnInsert
  // shape the single-row case does.
  {
    name: 'UPSERT bulk (array data) → bulkWrite with one op per row',
    method: 'upsert',
    query: {
      type: 'UPSERT',
      table: 'users',
      columns: ['id', 'name', 'email'],
      data: [
        { id: 1, name: 'John', email: 'j@x.com' },
        { id: 2, name: 'Jane', email: 'jane@x.com' },
      ],
      conflictKeys: ['@id'],
    },
    expected: {
      sql: 'bulkWrite',
      params: {
        collection: 'users',
        ops: [
          {
            filter: { id: 1 },
            update: {
              $set: { name: 'John', email: 'j@x.com' },
              $setOnInsert: { id: 1 },
            },
          },
          {
            filter: { id: 2 },
            update: {
              $set: { name: 'Jane', email: 'jane@x.com' },
              $setOnInsert: { id: 2 },
            },
          },
        ],
      },
    },
  },

  // Bulk UPSERT with updateOnConflict: columns outside the list go to
  // $setOnInsert only — same rule as the single-row path, applied per op.
  {
    name: 'UPSERT bulk respects updateOnConflict (per-op disableUpdate)',
    method: 'upsert',
    query: {
      type: 'UPSERT',
      table: 'users',
      columns: ['id', 'name', 'email', 'createdAt'],
      data: [
        { id: 1, name: 'A', email: 'a@x.com', createdAt: '2026-01-01' },
        { id: 2, name: 'B', email: 'b@x.com', createdAt: '2026-01-02' },
      ],
      conflictKeys: ['@id'],
      updateOnConflict: ['@name', '@email'],
    },
    expected: {
      sql: 'bulkWrite',
      params: {
        collection: 'users',
        ops: [
          {
            filter: { id: 1 },
            update: {
              $set: { name: 'A', email: 'a@x.com' },
              $setOnInsert: { id: 1, createdAt: '2026-01-01' },
            },
          },
          {
            filter: { id: 2 },
            update: {
              $set: { name: 'B', email: 'b@x.com' },
              $setOnInsert: { id: 2, createdAt: '2026-01-02' },
            },
          },
        ],
      },
    },
  },

  // ---------------------------------------------------------------------------
  // COUNT
  // ---------------------------------------------------------------------------
  {
    // SQL `COUNT(col)` counts every NON-NULL value, including falsy ones
    // (0, '', false); only null/missing are skipped. The $group emission
    // must therefore test the field for non-null EXISTENCE, not truthiness
    // — a plain truthiness `$cond` would silently drop 0/''/false rows and
    // diverge from the SQL dialects.
    name:
      'SELECT COUNT(column) → $group counts non-null incl. falsy (0/""/false)',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'scores',
      columns: ['userId', 'score'],
      aggregates: { c: { $$_aggregate: 'COUNT', column: '@score' } },
      projection: { '@userId': true, '@c': 'c' },
    },
    expected: {
      sql: 'aggregate',
      params: {
        collection: 'scores',
        pipeline: [
          {
            $group: {
              _id: { userId: '$userId' },
              c: {
                $sum: {
                  $cond: [
                    { $ne: [{ $ifNull: ['$score', null] }, null] },
                    1,
                    0,
                  ],
                },
              },
            },
          },
          { $addFields: { userId: '$_id.userId' } },
          { $project: { userId: 1, c: '$c', _id: 0 } },
        ],
      },
    },
  },
  {
    name: 'COUNT → count',
    method: 'count',
    query: {
      type: 'COUNT',
      table: 'users',
      columns: ['id', 'status'],
      where: { '@status': 'active' },
    },
    expected: {
      sql: 'count',
      params: {
        collection: 'users',
        filter: { status: 'active' },
      },
    },
  },

  // ---------------------------------------------------------------------------
  // DDL
  // ---------------------------------------------------------------------------
  {
    name: 'CREATE_TABLE → createCollection (+ PK index)',
    method: 'createTable',
    query: {
      type: 'CREATE_TABLE',
      table: 'users',
      columns: {
        id: { type: 'INTEGER', nullable: false },
        email: { type: 'VARCHAR', length: 255 },
      },
      primaryKey: ['id'],
    },
    expected: [
      { sql: 'createCollection', params: { collection: 'users' } },
      {
        sql: 'createIndex',
        params: {
          collection: 'users',
          keys: { id: 1 },
          options: { unique: true, name: '_pk' },
        },
      },
    ],
  },
  {
    name: 'ALTER_TABLE add+drop columns is a no-op (returns empty array)',
    method: 'alterTable',
    query: {
      type: 'ALTER_TABLE',
      table: 'users',
      addColumns: { phone: { type: 'VARCHAR', length: 20 } },
      dropColumns: ['legacy'],
    },
    expected: [],
  },
  {
    name: 'ALTER_TABLE renameTo → renameCollection',
    method: 'alterTable',
    query: {
      type: 'ALTER_TABLE',
      table: 'users',
      renameTo: 'app_users',
    },
    expected: [{
      sql: 'renameCollection',
      params: { collection: 'users', target: 'app_users' },
    }],
  },
  {
    name: 'DROP_TABLE → drop',
    method: 'dropTable',
    query: { type: 'DROP_TABLE', table: 'users', ifExists: true },
    expected: {
      sql: 'drop',
      params: { collection: 'users', options: { ifExists: true } },
    },
  },
  {
    name: 'TRUNCATE → delete with empty filter',
    method: 'truncate',
    query: { type: 'TRUNCATE', table: 'users' },
    expected: {
      sql: 'delete',
      params: {
        collection: 'users',
        filter: {},
        options: { multiple: true },
      },
    },
  },
  {
    name: 'CREATE_INDEX → createIndex',
    method: 'createIndex',
    query: {
      type: 'CREATE_INDEX',
      index: 'idx_email',
      table: 'users',
      columns: ['@email'],
      unique: true,
    },
    expected: {
      sql: 'createIndex',
      params: {
        collection: 'users',
        keys: { email: 1 },
        options: { unique: true, name: 'idx_email' },
      },
    },
  },
  {
    name: 'DROP_INDEX → dropIndex',
    method: 'dropIndex',
    query: { type: 'DROP_INDEX', index: 'idx_email', table: 'users' },
    expected: {
      sql: 'dropIndex',
      params: { collection: 'users', name: 'idx_email' },
    },
  },
  // Missing-table rejection is enforced by the validator
  // (see asserts/Query/DDL/Index.test.ts), not the translator.

  // ---------------------------------------------------------------------------
  // Refusal cases
  // ---------------------------------------------------------------------------
  {
    name: 'CREATE_SCHEMA throws (Mongo creates dbs implicitly)',
    method: 'createSchema',
    query: { type: 'CREATE_SCHEMA', schema: 'analytics' },
    throws: true,
  },
  {
    name: 'SELECT with distinct throws (no find-level DISTINCT)',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'role'],
      distinct: true,
      projection: { '@role': true },
    },
    throws: true,
  },
  {
    name: 'COUNT with distinct throws (needs an explicit $group pipeline)',
    method: 'count',
    query: {
      type: 'COUNT',
      table: 'orders',
      columns: ['id', 'userId'],
      distinct: ['userId'],
    },
    throws: true,
  },
  {
    name: 'STRING_AGG aggregate throws (no clean Mongo equivalent)',
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
    throws: true,
  },
  {
    name: '$exists filter throws (no correlated-subquery equivalent)',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id'],
      projection: { '@id': true },
      where: { $exists: { table: 'orders', on: { '@userId': '@id' } } },
    },
    throws: true,
  },
  {
    name: '$nexists filter throws (no correlated-subquery equivalent)',
    method: 'delete',
    query: {
      type: 'DELETE',
      table: 'users',
      columns: ['id'],
      where: { $nexists: { table: 'orders', on: { '@userId': '@id' } } },
    },
    throws: true,
  },
  {
    name:
      'REFRESH_MATERIALIZED_VIEW returns a noop (Mongo has no materialized views)',
    method: 'refreshMaterializedView',
    query: { type: 'REFRESH_MATERIALIZED_VIEW', view: 'mv' },
    expected: { sql: 'noop', params: {} },
  },

  // ---------------------------------------------------------------------------
  // Round-3 review regressions
  // ---------------------------------------------------------------------------
  {
    // Finding 2: INSERT-from-query must (1) preserve the source SELECT's
    // WHERE / projection / limit and (2) APPEND via `$merge`, never REPLACE
    // the target with `$out`. The old code emitted a bare `[{ $out }]` —
    // copying every doc/field AND wiping the target collection.
    name:
      'INSERT_FROM_QUERY preserves source filter/projection/limit and $merge-appends',
    method: 'insertQuery',
    query: {
      type: 'INSERT_FROM_QUERY',
      table: 'archive',
      columns: ['id', 'name'],
      query: {
        type: 'SELECT',
        table: 'users',
        columns: ['id', 'name', 'active'],
        projection: { '@id': true, '@name': true },
        where: { '@active': false },
        limit: 10,
      },
    },
    expected: {
      sql: 'aggregate',
      params: {
        collection: 'users',
        pipeline: [
          { $match: { active: false } },
          { $project: { id: 1, name: 1 } },
          { $limit: 10 },
          {
            $merge: {
              into: 'archive',
              whenMatched: 'fail',
              whenNotMatched: 'insert',
            },
          },
        ],
      },
    },
  },
  {
    // Finding 2: an aggregate-path source keeps its full pipeline, then
    // $merge is appended (not $out).
    name: 'INSERT_FROM_QUERY over an aggregate source appends $merge',
    method: 'insertQuery',
    query: {
      type: 'INSERT_FROM_QUERY',
      table: 'summary',
      columns: ['userId', 'total'],
      query: {
        type: 'SELECT',
        table: 'orders',
        columns: ['userId', 'amount'],
        aggregates: { total: { $$_aggregate: 'SUM', column: '@amount' } },
        projection: { '@userId': true, '@total': 'total' },
      },
    },
    expected: {
      sql: 'aggregate',
      params: {
        collection: 'orders',
        pipeline: [
          {
            $group: { _id: { userId: '$userId' }, total: { $sum: '$amount' } },
          },
          { $addFields: { userId: '$_id.userId' } },
          { $project: { userId: 1, total: '$total', _id: 0 } },
          {
            $merge: {
              into: 'summary',
              whenMatched: 'fail',
              whenNotMatched: 'insert',
            },
          },
        ],
      },
    },
  },
  {
    // Finding 3(a): a WHERE on a declared expression alias must be $match'd
    // AFTER the $addFields that materialises the field — not before it,
    // where it would match a missing field and drop every row.
    name:
      'WHERE on an expression alias is matched AFTER $addFields materialises it',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'orders',
      columns: ['a', 'b'],
      expressions: { total: { $$_expression: 'ADD', args: ['@a', '@b'] } },
      projection: { '@a': true, '@total': true },
      where: { '@total': { $gt: 100 } },
    },
    expected: {
      sql: 'aggregate',
      params: {
        collection: 'orders',
        pipeline: [
          { $addFields: { total: { $add: ['$a', '$b'] } } },
          { $match: { total: { $gt: 100 } } },
          { $project: { a: 1, total: 1 } },
        ],
      },
    },
  },
  {
    // Finding 3(b): a value-position joined reference must route the $match
    // AFTER the $lookup that creates the joined field — the key-only scan
    // used to emit it first, where the missing path matched every document.
    name: 'WHERE with a value-position joined ref is matched AFTER $lookup',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'posts',
      columns: ['id', 'createdAt', 'authorId'],
      joins: {
        Author: {
          table: 'users',
          columns: ['id', 'joinedAt'],
          type: 'LEFT',
          on: { '@Author.@id': '@authorId' },
        },
      },
      projection: { '@id': true },
      where: { '@createdAt': { $gt: '@Author.@joinedAt' } },
    },
    expected: {
      sql: 'aggregate',
      params: {
        collection: 'posts',
        pipeline: [
          {
            $lookup: {
              from: 'users',
              localField: 'authorId',
              foreignField: 'id',
              as: 'Author',
            },
          },
          { $match: { $expr: { $gt: ['$createdAt', '$Author.joinedAt'] } } },
          { $project: { id: 1 } },
        ],
      },
    },
  },
  {
    // Finding 7: an UPSERT row that omits a conflict key would build an
    // empty/partial match filter and overwrite an arbitrary document — refuse
    // it loudly instead of silently corrupting an unrelated record.
    name:
      'UPSERT with a row missing the conflict key throws (no arbitrary overwrite)',
    method: 'upsert',
    query: {
      type: 'UPSERT',
      table: 'users',
      columns: ['id', 'name', 'email'],
      data: { name: 'Bob', email: 'b@x.com' },
      conflictKeys: ['@id'],
    },
    throws: true,
  },
  {
    // Round-4 finding 1: the conflict-key guard must test the VALUE, not
    // just key presence. A row that carries the key with an `undefined`
    // value serialises on the wire as `{ id: null }` (the Node driver
    // defaults `ignoreUndefined` to false), a filter matching any document
    // whose `id` is null or absent — the exact hazard finding 7 guards
    // against. Refuse it loudly, same as an absent key.
    name:
      'UPSERT with an undefined conflict-key value throws (no match-anything filter)',
    method: 'upsert',
    query: {
      type: 'UPSERT',
      table: 'users',
      columns: ['id', 'name'],
      data: { id: undefined, name: 'Bob' },
      conflictKeys: ['@id'],
    },
    throws: true,
  },
  {
    // Round-4 finding 1: `null` is the same hazard — the filter matches any
    // document whose `id` is null or absent.
    name: 'UPSERT with a null conflict-key value throws',
    method: 'upsert',
    query: {
      type: 'UPSERT',
      table: 'users',
      columns: ['id', 'name'],
      data: { id: null, name: 'Bob' },
      conflictKeys: ['@id'],
    },
    throws: true,
  },
  {
    // Round-4 finding 1: a heterogeneous bulk batch must not silently mix a
    // good op with a poisoned one — the whole `upsert` call throws if any
    // row's conflict-key value is null/undefined.
    name: 'UPSERT bulk with one undefined conflict-key value throws',
    method: 'upsert',
    query: {
      type: 'UPSERT',
      table: 'users',
      columns: ['id', 'name'],
      data: [
        { id: 1, name: 'A' },
        { id: undefined, name: 'B' },
      ],
      conflictKeys: ['@id'],
    },
    throws: true,
  },
  {
    // Round-4 finding 2: a plain-`find` source SELECT feeding CREATE_VIEW must
    // keep its projection / sort / limit / skip — not collapse to a bare
    // `[{ $match }]`. Mirrors the SQL dialects' `CREATE VIEW … SELECT <cols> …
    // ORDER BY … LIMIT … OFFSET …`. Mongo view pipelines legally accept
    // $project/$sort/$skip/$limit (only $out/$merge are prohibited in views).
    name: 'CREATE_VIEW preserves the source SELECT projection/sort/limit/skip',
    method: 'createView',
    query: {
      type: 'CREATE_VIEW',
      view: 'active_names',
      query: {
        type: 'SELECT',
        table: 'users',
        columns: ['id', 'name', 'ssn', 'active'],
        projection: { '@id': true, '@name': true },
        where: { '@active': true },
        orderBy: { '@name': 'ASC' },
        limit: 100,
        offset: 5,
      },
    },
    expected: {
      sql: 'createView',
      params: {
        view: 'active_names',
        viewOn: 'users',
        pipeline: [
          { $match: { active: true } },
          { $project: { id: 1, name: 1 } },
          { $sort: { name: 1 } },
          { $skip: 5 },
          { $limit: 100 },
        ],
      },
    },
  },
  {
    // Round-4 finding 2: the createView sibling — ALTER_VIEW redefinition
    // (drop + create) must preserve the same stages, not drop them.
    name:
      'ALTER_VIEW (redefine) preserves the source SELECT projection/sort/limit/skip',
    method: 'alterView',
    query: {
      type: 'ALTER_VIEW',
      view: 'active_names',
      query: {
        type: 'SELECT',
        table: 'users',
        columns: ['id', 'name', 'ssn', 'active'],
        projection: { '@id': true, '@name': true },
        where: { '@active': true },
        orderBy: { '@name': 'ASC' },
        limit: 100,
        offset: 5,
      },
    },
    expected: [
      {
        sql: 'drop',
        params: { collection: 'active_names', options: { ifExists: true } },
      },
      {
        sql: 'createView',
        params: {
          view: 'active_names',
          viewOn: 'users',
          pipeline: [
            { $match: { active: true } },
            { $project: { id: 1, name: 1 } },
            { $sort: { name: 1 } },
            { $skip: 5 },
            { $limit: 100 },
          ],
        },
      },
    ],
  },
];

describe('oql.translator.MongoTranslator', () => {
  for (const c of CASES) {
    it(c.name, () => {
      // deno-lint-ignore no-explicit-any
      const fn = (t as any)[c.method].bind(t);
      if (c.throws) {
        asserts.assertThrows(() => fn(c.query), DialectUnsupportedError);
        return;
      }
      const result = fn(c.query);
      asserts.assertEquals(result, c.expected);
    });
  }
});

describe('oql.translator.MongoTranslator — round-4 regressions', () => {
  it('UPSERT {id: undefined} throws instead of building a match-anything filter', () => {
    // Finding 1: the guard tests the VALUE, not `ck in row`. A conflict key
    // present with an `undefined` (or `null`) value would otherwise flow into
    // the match filter and serialise as `{ id: null }` on the wire — matching
    // an arbitrary null/absent-`id` document under `upsert: true`. Prove no
    // such filter is ever produced: the call throws instead.
    let produced: unknown;
    asserts.assertThrows(
      () => {
        produced = t.upsert({
          type: 'UPSERT',
          table: 'users',
          columns: ['id', 'name'],
          data: { id: undefined, name: 'Bob' },
          conflictKeys: ['@id'],
          // deno-lint-ignore no-explicit-any
        } as any);
      },
      DialectUnsupportedError,
    );
    // Nothing was returned — definitively no `{ filter: { id: <null> } }` op.
    asserts.assertEquals(produced, undefined);
  });

  it('CREATE_VIEW preserves projection/sort/limit from the source SELECT', () => {
    // Finding 2: the view path used `#pipelineFromSelect`, which collapsed a
    // find-source SELECT to a bare `[{ $match }]`, silently dropping the
    // projection (exposing deliberately-projected-away columns like `ssn`),
    // the sort and the limit. It must now expand to full pipeline stages,
    // matching the SQL dialects' bounded, ordered, two-column view.
    const out = t.createView({
      type: 'CREATE_VIEW',
      view: 'active_names',
      query: {
        type: 'SELECT',
        table: 'users',
        columns: ['id', 'name', 'ssn', 'active'],
        projection: { '@id': true, '@name': true },
        where: { '@active': true },
        orderBy: { '@name': 'ASC' },
        limit: 100,
      },
      // deno-lint-ignore no-explicit-any
    } as any);
    const pipeline = out.params.pipeline as Record<string, unknown>[];
    const stages = pipeline.map((s) => Object.keys(s)[0]);
    asserts.assertEquals(stages, ['$match', '$project', '$sort', '$limit']);
    // The projection is preserved — `ssn` (deliberately projected away) is
    // NOT exposed by the view.
    asserts.assertEquals(pipeline[1], { $project: { id: 1, name: 1 } });
    asserts.assertEquals(pipeline[3], { $limit: 100 });
  });

  it('ALTER_VIEW (redefine) preserves projection/sort/limit from the source SELECT', () => {
    // Finding 2 sibling: alterView shares the same helper and was equally
    // broken.
    const out = t.alterView({
      type: 'ALTER_VIEW',
      view: 'active_names',
      query: {
        type: 'SELECT',
        table: 'users',
        columns: ['id', 'name', 'ssn', 'active'],
        projection: { '@id': true, '@name': true },
        where: { '@active': true },
        orderBy: { '@name': 'ASC' },
        limit: 100,
      },
      // deno-lint-ignore no-explicit-any
    } as any);
    const create = out.find((a) => a.sql === 'createView')!;
    const pipeline = create.params.pipeline as Record<string, unknown>[];
    const stages = pipeline.map((s) => Object.keys(s)[0]);
    asserts.assertEquals(stages, ['$match', '$project', '$sort', '$limit']);
    asserts.assertEquals(pipeline[1], { $project: { id: 1, name: 1 } });
  });
});

describe('oql.translator.MongoTranslator — round-3 regressions', () => {
  it('COUNT with having is rejected by the validator (not silently dropped)', () => {
    // Finding 4: the old no-joins COUNT path dropped `having` silently,
    // returning an unfiltered count. The validator now rejects it — the same
    // clear error the SQL dialects raise.
    const q = {
      type: 'COUNT',
      table: 'users',
      columns: ['id', 'age'],
      where: { '@age': { $gt: 18 } },
      having: { '@age': { $gt: 1 } },
    };
    asserts.assertThrows(
      // deno-lint-ignore no-explicit-any
      () => t.count(q as any),
      TypeError,
      "'having' is not supported",
    );
  });
});
