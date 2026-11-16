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
import {
  type MongoAggregateAction,
  MongoTranslator,
} from './MongoTranslator.ts';
import { DialectUnsupportedError, OqlError } from '../errors/mod.ts';
import type { TranslatedQuery } from './types/mod.ts';

type Case = {
  name: string;
  method: keyof InstanceType<typeof MongoTranslator>;
  query: unknown;
  expected?: TranslatedQuery | TranslatedQuery[];
  throws?: boolean;
};

const t = new MongoTranslator();

/**
 * Where a date sits on the scale DATE_DIFF uses for MONTHS / YEARS: its
 * month number in 32-day slots, plus the milliseconds into that month.
 */
const calendarPosition = (date: string) => ({
  $add: [
    {
      $multiply: [
        { $add: [{ $multiply: [{ $year: date }, 12] }, { $month: date }] },
        2_764_800_000,
      ],
    },
    { $subtract: [date, { $dateTrunc: { date, unit: 'month' } }] },
  ],
});

// LOWER('@nick'): null for a null or missing nick, as in SQL.
const LOWER_NICK = {
  $cond: [{ $gt: ['$nick', null] }, { $toLower: '$nick' }, null],
};

// A computed LIKE pattern turned into a regex source at run time: each
// regex special escaped, the backslash first, then `%` and `_`.
const likeRegex = (pattern: unknown) => ({
  $concat: [
    '^',
    [
      ['\\', '\\\\'],
      ['.', '\\.'],
      ['*', '\\*'],
      ['+', '\\+'],
      ['?', '\\?'],
      ['^', '\\^'],
      [{ $literal: '$' }, '\\$'],
      ['{', '\\{'],
      ['}', '\\}'],
      ['(', '\\('],
      [')', '\\)'],
      ['|', '\\|'],
      ['[', '\\['],
      [']', '\\]'],
      ['%', '.*'],
      ['_', '.'],
    ].reduce<unknown>(
      (input, [find, replacement]) => ({
        $replaceAll: { input, find, replacement },
      }),
      pattern,
    ),
    { $literal: '$' },
  ],
});

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
        options: { projection: { id: 1, name: 1, _id: 0 } },
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
        options: { projection: { id: 1, _id: 0 } },
      },
    },
  },
  {
    // `@role` is a column, so this is a column-to-column comparison — emitted
    // as `$expr` (Mongo find-filters can only compare fields via $expr).
    // Mirrors SQL's `WHERE status = role`: the `$gt: null` guards keep two
    // null or missing fields from counting as equal.
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
        filter: {
          $expr: {
            $and: [
              { $eq: ['$status', '$role'] },
              { $gt: ['$status', null] },
              { $gt: ['$role', null] },
            ],
          },
        },
        options: { projection: { id: 1, _id: 0 } },
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
        options: { projection: { id: 1, _id: 0 } },
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
        filter: {
          $expr: {
            $and: [
              { $gt: ['$price', '$cost'] },
              { $gt: ['$price', null] },
              { $gt: ['$cost', null] },
            ],
          },
        },
        options: { projection: { id: 1, _id: 0 } },
      },
    },
  },
  {
    // Only the bound that is a column needs a guard; a literal is never null.
    name: 'WHERE $between with a @col bound resolves to a guarded $expr',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'orders',
      columns: ['id', 'price', 'cost'],
      projection: { '@id': true },
      where: { '@price': { $between: ['@cost', 100] } },
    },
    expected: {
      sql: 'find',
      params: {
        collection: 'orders',
        filter: {
          $expr: {
            $and: [
              {
                $and: [{ $gte: ['$price', '$cost'] }, {
                  $lte: ['$price', 100],
                }],
              },
              { $gt: ['$price', null] },
              { $gt: ['$cost', null] },
            ],
          },
        },
        options: { projection: { id: 1, _id: 0 } },
      },
    },
  },
  {
    // Mongo's own `$ne` matches a null or missing field; SQL's `<>` never
    // does, so null joins the excluded values.
    name: 'WHERE $ne excludes null and missing fields',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'status'],
      projection: { '@id': true },
      where: { '@status': { $ne: 'BANNED' } },
    },
    expected: {
      sql: 'find',
      params: {
        collection: 'users',
        filter: { status: { $nin: ['BANNED', null] } },
        options: { projection: { id: 1, _id: 0 } },
      },
    },
  },
  {
    // Both operators on one field share a single `$nin`.
    name: 'WHERE $ne and $nin on one field merge into one $nin',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'status'],
      projection: { '@id': true },
      where: { '@status': { $nin: ['BANNED', 'DELETED'], $ne: 'DRAFT' } },
    },
    expected: {
      sql: 'find',
      params: {
        collection: 'users',
        filter: { status: { $nin: ['BANNED', 'DELETED', 'DRAFT', null] } },
        options: { projection: { id: 1, _id: 0 } },
      },
    },
  },
  {
    // `status <> 'BANNED' AND status IS NULL` matches nothing. The bare
    // `{ status: null }` spec would be replaced by the `$nin` document.
    name: 'WHERE $null: true beside $ne keeps both conditions',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'status'],
      projection: { '@id': true },
      where: { '@status': { $ne: 'BANNED', $null: true } },
    },
    expected: {
      sql: 'find',
      params: {
        collection: 'users',
        filter: {
          status: { $nin: ['BANNED', null] },
          $expr: { $in: [{ $type: '$status' }, ['null', 'missing']] },
        },
        options: { projection: { id: 1, _id: 0 } },
      },
    },
  },
  {
    // A computed operand compares inside $expr; the two `$gt: null` guards
    // keep a null or missing side from matching, as it never does in SQL.
    name: 'WHERE operator value Expression resolves to a guarded $expr',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'links',
      columns: ['id', 'status', 'expiresAt'],
      projection: { '@id': true },
      where: {
        '@status': 'OPEN',
        '@expiresAt': { $lt: { $$_expression: 'NOW' } },
      },
    },
    expected: {
      sql: 'find',
      params: {
        collection: 'links',
        filter: {
          status: 'OPEN',
          $expr: {
            $and: [
              { $lt: ['$expiresAt', '$$NOW'] },
              { $gt: ['$expiresAt', null] },
              { $gt: ['$$NOW', null] },
            ],
          },
        },
        options: { projection: { id: 1, _id: 0 } },
      },
    },
  },
  {
    // Only the computed operator moves; the literal one stays on the field.
    name: 'WHERE Expression and literal operators on one field split',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'orders',
      columns: ['id', 'price', 'cost'],
      projection: { '@id': true },
      where: {
        '@price': {
          $gte: { $$_expression: 'ADD', args: ['@cost', 1] },
          $lt: 100,
        },
      },
    },
    expected: {
      sql: 'find',
      params: {
        collection: 'orders',
        filter: {
          price: { $lt: 100 },
          $expr: {
            $and: [
              { $gte: ['$price', { $add: ['$cost', 1] }] },
              { $gt: ['$price', null] },
              { $gt: [{ $add: ['$cost', 1] }, null] },
            ],
          },
        },
        options: { projection: { id: 1, _id: 0 } },
      },
    },
  },
  {
    // `$between` emits `$gte` / `$lte` too. Merged into one document the
    // later bound replaced the earlier, so the second operator stands as
    // its own condition under `$and`.
    name: 'WHERE $gte / $lte beside $between keep both ranges',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'orders',
      columns: ['id', 'qty'],
      projection: { '@id': true },
      where: { '@qty': { $gte: 2, $lte: 8, $between: [1, 9] } },
    },
    expected: {
      sql: 'find',
      params: {
        collection: 'orders',
        filter: {
          qty: { $gte: 2, $lte: 8 },
          $and: [{ qty: { $gte: 1, $lte: 9 } }],
        },
        options: { projection: { id: 1, _id: 0 } },
      },
    },
  },
  {
    // Every pattern operator emits `$regex`. Each later one keeps its own
    // document, so `$ilike`'s `i` option stays off the other patterns.
    name: 'WHERE several pattern operators on one field all apply',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'name'],
      projection: { '@id': true },
      where: {
        '@name': {
          $ilike: 'a%',
          $like: '%z',
          $startsWith: 'A',
          $endsWith: 'z',
          $contains: 'd',
        },
      },
    },
    expected: {
      sql: 'find',
      params: {
        collection: 'users',
        filter: {
          name: { $regex: '^a.*$', $options: 'i' },
          $and: [
            { name: { $regex: '^.*z$' } },
            { name: { $regex: '^A' } },
            { name: { $regex: 'z$' } },
            { name: { $regex: 'd' } },
          ],
        },
        options: { projection: { id: 1, _id: 0 } },
      },
    },
  },
  {
    name: 'WHERE $nlike beside $nilike keeps both patterns',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'name'],
      projection: { '@id': true },
      where: { '@name': { $nlike: 'A%', $nilike: 'b%' } },
    },
    expected: {
      sql: 'find',
      params: {
        collection: 'users',
        filter: {
          name: { $not: { $regex: '^A.*$' }, $ne: null },
          $and: [{
            name: { $not: { $regex: '^b.*$', $options: 'i' }, $ne: null },
          }],
        },
        options: { projection: { id: 1, _id: 0 } },
      },
    },
  },
  {
    // The clashing condition joins the filter's own `$and`.
    name: 'WHERE a clashing operator joins an explicit $and',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'orders',
      columns: ['id', 'qty'],
      projection: { '@id': true },
      where: {
        '@qty': { $between: [1, 9], $gte: 2 },
        $and: [{ '@id': 1 }],
      },
    },
    expected: {
      sql: 'find',
      params: {
        collection: 'orders',
        filter: {
          qty: { $gte: 1, $lte: 9 },
          $and: [{ qty: { $gte: 2 } }, { $and: [{ id: 1 }] }],
        },
        options: { projection: { id: 1, _id: 0 } },
      },
    },
  },
  {
    // A column inside the list compares per row in `$expr`. One equal
    // element makes IN true whatever the others hold, so only the field is
    // guarded; NOT IN is unknown on SQL once any element is NULL.
    name: 'WHERE $in, a list and $nin holding a @col → $expr per row',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'status', 'role'],
      projection: { '@id': true },
      where: {
        '@status': { $in: ['@role', 'admin'] },
        '@role': ['@status'],
        '@id': { $nin: ['@role', 1] },
      },
    },
    expected: {
      sql: 'find',
      params: {
        collection: 'users',
        filter: {
          $expr: {
            $and: [
              {
                $and: [
                  { $in: ['$status', ['$role', 'admin']] },
                  { $gt: ['$status', null] },
                ],
              },
              {
                $and: [
                  { $in: ['$role', ['$status']] },
                  { $gt: ['$role', null] },
                ],
              },
              {
                $and: [
                  { $not: [{ $in: ['$id', ['$role', 1]] }] },
                  { $gt: ['$id', null] },
                  { $gt: ['$role', null] },
                ],
              },
            ],
          },
        },
        options: { projection: { id: 1, _id: 0 } },
      },
    },
  },
  {
    // A column as the value searches for its text, as a computed
    // operand does.
    name: 'WHERE $startsWith with a @col value → $expr $indexOfCP',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'name', 'prefix'],
      projection: { '@id': true },
      where: { '@name': { $startsWith: '@prefix' } },
    },
    expected: {
      sql: 'find',
      params: {
        collection: 'users',
        filter: {
          $expr: {
            $cond: [
              { $gt: ['$prefix', null] },
              { $eq: [{ $indexOfCP: ['$name', '$prefix'] }, 0] },
              false,
            ],
          },
        },
        options: { projection: { id: 1, _id: 0 } },
      },
    },
  },
  // ---------------------------------------------------------------------------
  // JSON path filtering — `@col.@key` emits Mongo's native dotted path
  // ---------------------------------------------------------------------------
  {
    name: 'WHERE JSON path single-level $eq → dotted field path',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'profile'],
      projection: { '@id': true },
      where: { '@profile.@name': { $eq: 'bob' } },
    },
    expected: {
      sql: 'find',
      params: {
        collection: 'users',
        filter: { 'profile.name': { $eq: 'bob' } },
        options: { projection: { id: 1, _id: 0 } },
      },
    },
  },
  {
    // Deep paths keep EVERY segment (`split('.@').join('.')`, not a
    // single `replace`) — `@profile.@address.@city` → `profile.address.city`.
    name: 'WHERE JSON path deep → dotted path keeps every segment',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'profile'],
      projection: { '@id': true },
      where: { '@profile.@address.@city': 'Berlin' },
    },
    expected: {
      sql: 'find',
      params: {
        collection: 'users',
        filter: { 'profile.address.city': 'Berlin' },
        options: { projection: { id: 1, _id: 0 } },
      },
    },
  },
  {
    name: 'WHERE JSON path $like → anchored regex on the dotted path',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'profile'],
      projection: { '@id': true },
      where: { '@profile.@name': { $like: '%bo%' } },
    },
    expected: {
      sql: 'find',
      params: {
        collection: 'users',
        filter: { 'profile.name': { $regex: '^.*bo.*$' } },
        options: { projection: { id: 1, _id: 0 } },
      },
    },
  },
  {
    name: 'WHERE JSON path $null → null match on the dotted path',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'profile'],
      projection: { '@id': true },
      where: { '@profile.@deletedAt': { $null: true } },
    },
    expected: {
      sql: 'find',
      params: {
        collection: 'users',
        filter: { 'profile.deletedAt': null },
        options: { projection: { id: 1, _id: 0 } },
      },
    },
  },
  {
    // Disambiguation precedence: a join alias with the same name as a
    // declared base column resolves as the JOIN ($lookup'd field, full
    // operator set), not as a JSON path into the base column.
    name: 'WHERE join alias wins over same-named JSON column',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'profile'],
      joins: {
        profile: {
          table: 'profiles',
          columns: ['userId', 'name'],
          on: { '@profile.@userId': '@id' },
        },
      },
      projection: { '@id': true },
      where: { '@profile.@name': 'bob' },
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
              pipeline: [{ $match: { userId: { $ne: null } } }],
              as: 'profile',
            },
          },
          { $unwind: '$profile' },
          { $match: { 'profile.name': 'bob' } },
          { $project: { id: 1, _id: 0 } },
        ],
      },
    },
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
        options: { projection: { id: 1, _id: 0 } },
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
        options: { projection: { id: 1, _id: 0 } },
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
    // $sort runs before $project: after it, the aliased `name` is
    // `displayName` and the unprojected `id` is gone.
    name: 'SELECT ORDER BY an aliased and an unprojected column → aggregate',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'name'],
      projection: { '@name': 'displayName' },
      orderBy: { '@name': 'ASC', '@id': 'DESC' },
    },
    expected: {
      sql: 'aggregate',
      params: {
        collection: 'users',
        pipeline: [
          { $sort: { name: 1, id: -1 } },
          { $project: { displayName: '$name', _id: 0 } },
        ],
      },
    },
  },
  {
    // One row per joined row, as on SQL, so the sort reads the column.
    name:
      'SELECT ORDER BY an unprojected joined column → sorts the joined rows',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'name'],
      joins: {
        o: {
          table: 'orders',
          columns: ['userId', 'amount'],
          type: 'LEFT',
          on: { '@o.@userId': '@id' },
        },
      },
      projection: { '@id': true },
      orderBy: { '@o.@amount': 'DESC', '@name': 'ASC' },
    },
    expected: {
      sql: 'aggregate',
      params: {
        collection: 'users',
        pipeline: [
          {
            $lookup: {
              from: 'orders',
              localField: 'id',
              foreignField: 'userId',
              pipeline: [{ $match: { userId: { $ne: null } } }],
              as: 'o',
            },
          },
          {
            $unwind: { path: '$o', preserveNullAndEmptyArrays: true },
          },
          { $sort: { 'o.amount': -1, name: 1 } },
          { $project: { id: 1, _id: 0 } },
        ],
      },
    },
  },
  {
    // An unprojected joined column is no group key, so its MIN rides
    // through the $group as an accumulator, as SQL orders by MIN.
    name:
      'SELECT ORDER BY an unprojected joined column with aggregates → accumulated in $group',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'team'],
      joins: {
        o: {
          table: 'orders',
          columns: ['userId', 'amount'],
          type: 'LEFT',
          on: { '@o.@userId': '@id' },
        },
      },
      aggregates: { n: { $$_aggregate: 'COUNT' } },
      projection: { '@team': true, '@n': true },
      orderBy: { '@team': 'DESC', '@o.@amount': 'ASC' },
    },
    expected: {
      sql: 'aggregate',
      params: {
        collection: 'users',
        pipeline: [
          {
            $lookup: {
              from: 'orders',
              localField: 'id',
              foreignField: 'userId',
              pipeline: [{ $match: { userId: { $ne: null } } }],
              as: 'o',
            },
          },
          {
            $unwind: { path: '$o', preserveNullAndEmptyArrays: true },
          },
          {
            $group: {
              _id: { team: '$team' },
              n: { $sum: 1 },
              __sort_1: { $min: '$o.amount' },
            },
          },
          { $addFields: { team: '$_id.team' } },
          { $sort: { team: -1, __sort_1: 1 } },
          { $project: { team: 1, n: 1, _id: 0 } },
        ],
      },
    },
  },
  {
    // The accumulated sort field takes another name when an aggregate
    // has its own, where the two would share one `$group` field.
    name: 'SELECT ORDER BY a joined column beside an aggregate named __sort_0',
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
      aggregates: { __sort_0: { $$_aggregate: 'COUNT' } },
      projection: { '@id': true, '@__sort_0': true },
      orderBy: { '@o.@amount': 'DESC' },
    },
    expected: {
      sql: 'aggregate',
      params: {
        collection: 'users',
        pipeline: [
          {
            $lookup: {
              from: 'orders',
              localField: 'id',
              foreignField: 'userId',
              pipeline: [{ $match: { userId: { $ne: null } } }],
              as: 'o',
            },
          },
          { $unwind: { path: '$o', preserveNullAndEmptyArrays: true } },
          {
            $group: {
              _id: { id: '$id' },
              __sort_0: { $sum: 1 },
              ___sort_0: { $max: '$o.amount' },
            },
          },
          { $addFields: { id: '$_id.id' } },
          { $sort: { ___sort_0: -1 } },
          { $project: { id: 1, __sort_0: 1, _id: 0 } },
        ],
      },
    },
  },
  {
    // ...and when a column of the query has it.
    name: 'SELECT ORDER BY a joined column in a query with a column __sort_0',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id', '__sort_0'],
      joins: {
        o: {
          table: 'orders',
          columns: ['userId', 'amount'],
          on: { '@o.@userId': '@id' },
        },
      },
      aggregates: { n: { $$_aggregate: 'COUNT' } },
      projection: { '@id': true, '@n': true },
      orderBy: { '@o.@amount': 'DESC' },
    },
    expected: {
      sql: 'aggregate',
      params: {
        collection: 'users',
        pipeline: [
          {
            $lookup: {
              from: 'orders',
              localField: 'id',
              foreignField: 'userId',
              pipeline: [{ $match: { userId: { $ne: null } } }],
              as: 'o',
            },
          },
          { $unwind: '$o' },
          {
            $group: {
              _id: { id: '$id' },
              n: { $sum: 1 },
              ___sort_0: { $max: '$o.amount' },
            },
          },
          { $addFields: { id: '$_id.id' } },
          { $sort: { ___sort_0: -1 } },
          { $project: { id: 1, n: 1, _id: 0 } },
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
          projection: { id: 1, createdAt: 1, _id: 0 },
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
        options: { projection: { id: 1, _id: 0 } },
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
        options: { projection: { id: 1, _id: 0 } },
      },
    },
  },
  {
    // SQL's NOT LIKE skips a NULL; `$not` alone would keep a null or
    // missing field, so each negated pattern also asks for `$ne: null`.
    name: 'SELECT $nlike / $nilike skip a null or missing field',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'name', 'nick'],
      projection: { '@id': true },
      where: { '@name': { $nlike: 'John%' }, '@nick': { $nilike: 'j_' } },
    },
    expected: {
      sql: 'find',
      params: {
        collection: 'users',
        filter: {
          name: { $not: { $regex: '^John.*$' }, $ne: null },
          nick: { $not: { $regex: '^j.$', $options: 'i' }, $ne: null },
        },
        options: { projection: { id: 1, _id: 0 } },
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
        options: { projection: { id: 1, _id: 0 } },
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
              prefix: {
                $cond: [
                  { $gt: ['$name', null] },
                  { $substrCP: ['$name', { $subtract: [1, 1] }, 3] },
                  null,
                ],
              },
            },
          },
          { $project: { id: 1, prefix: '$prefix', _id: 0 } },
        ],
      },
    },
  },
  {
    // `$substrCP` has no "to the end" length and rejects -1; the string's
    // own length takes the rest, as SQL's two-argument SUBSTR does.
    name: 'SELECT SUBSTR without a length takes the rest of the string',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'name'],
      expressions: {
        rest: {
          $$_expression: 'SUBSTR',
          args: { string: '@name', start: 2 },
        },
      },
      projection: { '@id': true, '@rest': 'rest' },
    },
    expected: {
      sql: 'aggregate',
      params: {
        collection: 'users',
        pipeline: [
          {
            $addFields: {
              rest: {
                $cond: [
                  { $gt: ['$name', null] },
                  {
                    $substrCP: [
                      '$name',
                      { $subtract: [2, 1] },
                      { $strLenCP: '$name' },
                    ],
                  },
                  null,
                ],
              },
            },
          },
          { $project: { id: 1, rest: '$rest', _id: 0 } },
        ],
      },
    },
  },
  {
    // `$toUpper` / `$toLower` turn a null or missing field into '' and
    // `$strLenCP` throws on one. SQL returns NULL for all three, so the
    // `<>` below must not match a row whose status is NULL.
    name: 'SELECT UPPER / LOWER / LENGTH return null for a null input',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'status'],
      expressions: {
        u: { $$_expression: 'UPPER', args: '@status' },
        l: { $$_expression: 'LOWER', args: '@status' },
        n: { $$_expression: 'LENGTH', args: '@status' },
      },
      projection: { '@id': true, '@u': 'u', '@l': 'l', '@n': 'n' },
      where: { '@u': { $ne: 'BANNED' } },
    },
    expected: {
      sql: 'aggregate',
      params: {
        collection: 'users',
        pipeline: [
          {
            $addFields: {
              u: {
                $cond: [
                  { $gt: ['$status', null] },
                  { $toUpper: '$status' },
                  null,
                ],
              },
              l: {
                $cond: [
                  { $gt: ['$status', null] },
                  { $toLower: '$status' },
                  null,
                ],
              },
              n: {
                $cond: [
                  { $gt: ['$status', null] },
                  { $strLenCP: '$status' },
                  null,
                ],
              },
            },
          },
          { $match: { u: { $nin: ['BANNED', null] } } },
          { $project: { id: 1, u: '$u', l: '$l', n: '$n', _id: 0 } },
        ],
      },
    },
  },
  {
    name: 'SELECT TO_STRING → $toString',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id'],
      expressions: { idText: { $$_expression: 'TO_STRING', args: '@id' } },
      projection: { '@idText': 'idText' },
    },
    expected: {
      sql: 'aggregate',
      params: {
        collection: 'users',
        pipeline: [
          { $addFields: { idText: { $toString: '$id' } } },
          { $project: { idText: '$idText', _id: 0 } },
        ],
      },
    },
  },
  {
    name: 'SELECT COALESCE, NULLIF and CASE → $ifNull, $cond, $switch',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'name', 'nickname', 'age', 'role'],
      expressions: {
        nick: {
          $$_expression: 'COALESCE',
          args: ['@nickname', '@name', 'anon'],
        },
        blank: { $$_expression: 'NULLIF', args: ['@name', ''] },
        tier: {
          $$_expression: 'CASE',
          args: {
            cases: [
              {
                when: { '@age': { $gte: 18 }, '@role': { $in: ['a', 'b'] } },
                then: 'adult',
              },
              {
                when: { $or: [{ '@age': { $null: true } }, { '@age': 0 }] },
                then: null,
              },
            ],
            else: 'minor',
          },
        },
      },
      projection: { '@nick': 'nick', '@blank': 'blank', '@tier': 'tier' },
    },
    expected: {
      sql: 'aggregate',
      params: {
        collection: 'users',
        pipeline: [
          {
            $addFields: {
              nick: { $ifNull: ['$nickname', '$name', 'anon'] },
              // NULLIF returns the field itself, missing when it is: the
              // `$ifNull` keeps the key in the row with null, as on SQL.
              blank: {
                $ifNull: [
                  { $cond: [{ $eq: ['$name', ''] }, null, '$name'] },
                  null,
                ],
              },
              tier: {
                $switch: {
                  branches: [
                    {
                      case: {
                        $and: [
                          {
                            $and: [
                              { $gte: ['$age', 18] },
                              { $gt: ['$age', null] },
                            ],
                          },
                          {
                            $and: [
                              { $in: ['$role', ['a', 'b']] },
                              { $gt: ['$role', null] },
                            ],
                          },
                        ],
                      },
                      then: 'adult',
                    },
                    {
                      case: {
                        $or: [
                          { $in: [{ $type: '$age' }, ['null', 'missing']] },
                          {
                            $and: [
                              { $eq: ['$age', 0] },
                              { $gt: ['$age', null] },
                            ],
                          },
                        ],
                      },
                      then: null,
                    },
                  ],
                  default: 'minor',
                },
              },
            },
          },
          {
            $project: {
              nick: '$nick',
              blank: '$blank',
              tier: '$tier',
              _id: 0,
            },
          },
        ],
      },
    },
  },
  {
    name: 'SELECT COALESCE, NULLIF and CASE as numeric operands',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'age', 'score'],
      expressions: {
        total: {
          $$_expression: 'ADD',
          args: ['@score', { $$_expression: 'COALESCE', args: ['@age', 0] }],
        },
        gap: {
          $$_expression: 'SUBTRACT',
          args: ['@score', { $$_expression: 'NULLIF', args: ['@age', 0] }],
        },
        scaled: {
          $$_expression: 'MULTIPLY',
          args: ['@score', {
            $$_expression: 'CASE',
            args: {
              cases: [{ when: { '@age': { $gte: 18 } }, then: 2 }],
              else: 1,
            },
          }],
        },
        ratio: {
          $$_expression: 'DIVIDE',
          args: ['@score', { $$_expression: 'NULLIF', args: ['@age', 0] }],
        },
        size: {
          $$_expression: 'ABS',
          args: [{ $$_expression: 'COALESCE', args: ['@score', '@age'] }],
        },
      },
      projection: {
        '@total': 'total',
        '@gap': 'gap',
        '@scaled': 'scaled',
        '@ratio': 'ratio',
        '@size': 'size',
      },
    },
    expected: {
      sql: 'aggregate',
      params: {
        collection: 'users',
        pipeline: [
          {
            $addFields: {
              total: { $add: ['$score', { $ifNull: ['$age', 0] }] },
              gap: {
                $subtract: [
                  '$score',
                  { $cond: [{ $eq: ['$age', 0] }, null, '$age'] },
                ],
              },
              scaled: {
                $multiply: ['$score', {
                  $switch: {
                    branches: [{
                      case: {
                        $and: [{ $gte: ['$age', 18] }, { $gt: ['$age', null] }],
                      },
                      then: 2,
                    }],
                    default: 1,
                  },
                }],
              },
              ratio: {
                $divide: [
                  '$score',
                  { $cond: [{ $eq: ['$age', 0] }, null, '$age'] },
                ],
              },
              size: { $abs: { $ifNull: ['$score', '$age'] } },
            },
          },
          {
            $project: {
              total: '$total',
              gap: '$gap',
              scaled: '$scaled',
              ratio: '$ratio',
              size: '$size',
              _id: 0,
            },
          },
        ],
      },
    },
  },
  {
    name: 'SELECT DIVIDE and MODULO over three operands fold left to right',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'age', 'score'],
      expressions: {
        ratio: { $$_expression: 'DIVIDE', args: ['@score', '@age', 2] },
        rest: { $$_expression: 'MODULO', args: ['@score', '@age', 2] },
      },
      projection: { '@ratio': 'ratio', '@rest': 'rest' },
    },
    expected: {
      sql: 'aggregate',
      params: {
        collection: 'users',
        pipeline: [
          {
            $addFields: {
              ratio: { $divide: [{ $divide: ['$score', '$age'] }, 2] },
              rest: { $mod: [{ $mod: ['$score', '$age'] }, 2] },
            },
          },
          { $project: { ratio: '$ratio', rest: '$rest', _id: 0 } },
        ],
      },
    },
  },
  {
    name: 'SELECT SUBTRACT over three operands folds left to right',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'age', 'score'],
      expressions: {
        gap: { $$_expression: 'SUBTRACT', args: ['@score', '@age', 2] },
      },
      projection: { '@gap': 'gap' },
    },
    expected: {
      sql: 'aggregate',
      params: {
        collection: 'users',
        pipeline: [
          {
            $addFields: {
              gap: { $subtract: [{ $subtract: ['$score', '$age'] }, 2] },
            },
          },
          { $project: { gap: '$gap', _id: 0 } },
        ],
      },
    },
  },
  {
    // Unwrapped, `'$secret'` reads the row's `secret` field and `'$$ROOT'`
    // the whole document; the SQL dialects bind both as text.
    name: 'SELECT expression argument starting with $ stays a literal',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'label'],
      expressions: {
        shown: { $$_expression: 'COALESCE', args: ['@label', '$secret'] },
        tier: {
          $$_expression: 'CASE',
          args: {
            cases: [{
              when: { '@label': { $in: ['$0.00', 'free'] } },
              then: '$$ROOT',
            }],
            else: '$label',
          },
        },
      },
      projection: { '@shown': 'shown', '@tier': 'tier' },
    },
    expected: {
      sql: 'aggregate',
      params: {
        collection: 'users',
        pipeline: [
          {
            $addFields: {
              shown: { $ifNull: ['$label', { $literal: '$secret' }] },
              tier: {
                $switch: {
                  branches: [{
                    case: {
                      $and: [
                        { $in: ['$label', [{ $literal: '$0.00' }, 'free']] },
                        { $gt: ['$label', null] },
                      ],
                    },
                    then: { $literal: '$$ROOT' },
                  }],
                  default: { $literal: '$label' },
                },
              },
            },
          },
          { $project: { shown: '$shown', tier: '$tier', _id: 0 } },
        ],
      },
    },
  },
  {
    // As on the SQL dialects, which bind an `@` string that names no
    // column in scope as text. An expression alias is not in scope.
    name: 'SELECT expression argument naming no column is text',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'label', 'meta'],
      joins: {
        P: {
          table: 'posts',
          columns: ['userId', 'title'],
          on: { '@P.@userId': '@id' },
        },
      },
      expressions: {
        shown: { $$_expression: 'COALESCE', args: ['@label', '@nope'] },
        deep: {
          $$_expression: 'COALESCE',
          args: ['@meta.@tag', '@meta.@a.@b', '@nope.@tag'],
        },
        joined: { $$_expression: 'COALESCE', args: ['@P.@title', '@P.@nope'] },
        again: { $$_expression: 'COALESCE', args: ['@shown', '-'] },
      },
      where: {
        '@label': {
          $ne: { $$_expression: 'COALESCE', args: ['@id', '@nope'] },
        },
      },
      projection: {
        '@shown': 'shown',
        '@deep': 'deep',
        '@joined': 'joined',
        '@again': 'again',
      },
    },
    expected: {
      sql: 'aggregate',
      params: {
        collection: 'users',
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $ne: ['$label', { $ifNull: ['$id', '@nope'] }] },
                  { $gt: ['$label', null] },
                  { $gt: [{ $ifNull: ['$id', '@nope'] }, null] },
                ],
              },
            },
          },
          {
            $lookup: {
              from: 'posts',
              localField: 'id',
              foreignField: 'userId',
              pipeline: [{ $match: { userId: { $ne: null } } }],
              as: 'P',
            },
          },
          { $unwind: '$P' },
          {
            $addFields: {
              shown: { $ifNull: ['$label', '@nope'] },
              deep: { $ifNull: ['@meta.@tag', '@meta.@a.@b', '@nope.@tag'] },
              joined: { $ifNull: ['$P.title', '@P.@nope'] },
              again: { $ifNull: ['@shown', '-'] },
            },
          },
          {
            $project: {
              shown: '$shown',
              deep: '$deep',
              joined: '$joined',
              again: '$again',
              _id: 0,
            },
          },
        ],
      },
    },
  },
  {
    // The validator refuses an object argument, so only a string reaches
    // here: bare, MongoDB would evaluate its `'$'` as a field path.
    name: 'WHERE Expression operand keeps a $ argument literal',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'label', 'meta'],
      projection: { '@id': true },
      where: {
        '@label': {
          $eq: { $$_expression: 'CONCAT', args: ['$0', '.00'] },
        },
      },
    },
    expected: {
      sql: 'find',
      params: {
        collection: 'users',
        filter: {
          $expr: {
            $and: [
              { $eq: ['$label', { $concat: [{ $literal: '$0' }, '.00'] }] },
              { $gt: ['$label', null] },
              { $gt: [{ $concat: [{ $literal: '$0' }, '.00'] }, null] },
            ],
          },
        },
        options: { projection: { id: 1, _id: 0 } },
      },
    },
  },
  {
    name: 'WHERE $between beside a @col bound keeps a $ bound literal',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'label', 'cap'],
      projection: { '@id': true },
      where: { '@label': { $between: ['$', '@cap'] } },
    },
    expected: {
      sql: 'find',
      params: {
        collection: 'users',
        filter: {
          $expr: {
            $and: [
              {
                $and: [{ $gte: ['$label', { $literal: '$' }] }, {
                  $lte: ['$label', '$cap'],
                }],
              },
              { $gt: ['$label', null] },
              { $gt: ['$cap', null] },
            ],
          },
        },
        options: { projection: { id: 1, _id: 0 } },
      },
    },
  },
  {
    // Inside the sub-pipeline a bare `'$vip'` is the joined document's
    // `vip` field, not the text.
    name: 'SELECT with a constant JOIN condition starting with $',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'orders',
      columns: ['id', 'userId'],
      joins: {
        U: {
          table: 'users',
          columns: ['id', 'tag', 'name'],
          type: 'LEFT',
          on: { '@U.@tag': '$vip' },
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
                { $match: { $expr: { $eq: ['$tag', { $literal: '$vip' }] } } },
              ],
              as: 'U',
            },
          },
          {
            $unwind: { path: '$U', preserveNullAndEmptyArrays: true },
          },
          {
            $project: {
              id: 1,
              userName: { $ifNull: ['$U.name', null] },
              _id: 0,
            },
          },
        ],
      },
    },
  },
  {
    name: 'UPDATE expression argument starting with $ stays a literal',
    method: 'update',
    query: {
      type: 'UPDATE',
      table: 'users',
      columns: ['id', 'label'],
      data: {
        label: { $$_expression: 'COALESCE', args: ['@label', '$none'] },
      },
      where: { '@id': 1 },
    },
    expected: {
      sql: 'update',
      params: {
        collection: 'users',
        filter: { id: 1 },
        data: [{
          $set: { label: { $ifNull: ['$label', { $literal: '$none' }] } },
        }],
        options: { multiple: true },
      },
    },
  },
  {
    name: 'UPDATE expression argument naming no column is text',
    method: 'update',
    query: {
      type: 'UPDATE',
      table: 'users',
      columns: ['id', 'label'],
      data: {
        label: { $$_expression: 'COALESCE', args: ['@label', '@none'] },
      },
      where: { '@id': 1 },
    },
    expected: {
      sql: 'update',
      params: {
        collection: 'users',
        filter: { id: 1 },
        data: [{ $set: { label: { $ifNull: ['$label', '@none'] } } }],
        options: { multiple: true },
      },
    },
  },
  {
    // A find filter's `$regex` has no place in `$switch`; `$regexMatch`
    // takes the same pattern.
    name: 'CASE with a $like condition → $regexMatch',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'name'],
      expressions: {
        tier: {
          $$_expression: 'CASE',
          args: { cases: [{ when: { '@name': { $like: 'a%' } }, then: 1 }] },
        },
      },
      projection: { '@tier': 'tier' },
    },
    expected: {
      sql: 'aggregate',
      params: {
        collection: 'users',
        pipeline: [
          {
            $addFields: {
              tier: {
                $switch: {
                  branches: [{
                    case: { $regexMatch: { input: '$name', regex: '^a.*$' } },
                    then: 1,
                  }],
                  default: null,
                },
              },
            },
          },
          { $project: { tier: '$tier', _id: 0 } },
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
              // `$sum` of no values is 0; SQL's SUM is NULL, and so is
              // `$max` exactly then.
              __sum_total: { $max: '$amount' },
            },
          },
          // Flatten the grouped key back to top level so the subsequent
          // $project sees a plain `userId` field.
          {
            $addFields: {
              total: {
                $cond: [{ $gt: ['$__sum_total', null] }, '$total', null],
              },
              userId: '$_id.userId',
            },
          },
          { $project: { userId: 1, total: '$total', _id: 0 } },
        ],
      },
    },
  },
  {
    // SQL returns one row for an ungrouped aggregate over no rows, COUNT 0
    // and SUM NULL; `$group` alone would return none.
    name: 'SELECT ungrouped aggregates → $facet, one row over no rows',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'orders',
      columns: ['userId', 'amount'],
      where: { '@userId': 7 },
      aggregates: {
        n: { $$_aggregate: 'COUNT' },
        total: { $$_aggregate: 'SUM', column: '@amount' },
      },
      projection: { '@n': true, '@total': true },
    },
    expected: {
      sql: 'aggregate',
      params: {
        collection: 'orders',
        pipeline: [
          { $match: { userId: 7 } },
          {
            $facet: {
              rows: [{
                $group: {
                  _id: {},
                  n: { $sum: 1 },
                  total: { $sum: '$amount' },
                  __sum_total: { $max: '$amount' },
                },
              }],
            },
          },
          {
            $replaceRoot: {
              newRoot: {
                $ifNull: [{ $arrayElemAt: ['$rows', 0] }, {
                  $literal: { _id: {}, n: 0, total: null },
                }],
              },
            },
          },
          {
            $addFields: {
              total: {
                $cond: [{ $gt: ['$__sum_total', null] }, '$total', null],
              },
            },
          },
          { $project: { n: 1, total: 1, _id: 0 } },
        ],
      },
    },
  },
  {
    // The SUM's helper field takes another name when an aggregate has its.
    name: 'SELECT SUM beside an aggregate named like its helper field',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'orders',
      columns: ['userId', 'amount'],
      aggregates: {
        s: { $$_aggregate: 'SUM', column: '@amount' },
        __sum_s: { $$_aggregate: 'MAX', column: '@amount' },
      },
      projection: { '@userId': true, '@s': true, '@__sum_s': true },
    },
    expected: {
      sql: 'aggregate',
      params: {
        collection: 'orders',
        pipeline: [
          {
            $group: {
              _id: { userId: '$userId' },
              s: { $sum: '$amount' },
              ___sum_s: { $max: '$amount' },
              __sum_s: { $max: '$amount' },
            },
          },
          {
            $addFields: {
              s: { $cond: [{ $gt: ['$___sum_s', null] }, '$s', null] },
              userId: '$_id.userId',
            },
          },
          { $project: { userId: 1, s: 1, __sum_s: 1, _id: 0 } },
        ],
      },
    },
  },
  {
    // ...and when a column of the query has it.
    name: 'SELECT SUM grouped by a column named like its helper field',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'orders',
      columns: ['__sum_x', 'amount'],
      aggregates: { x: { $$_aggregate: 'SUM', column: '@amount' } },
      projection: { '@__sum_x': true, '@x': true },
    },
    expected: {
      sql: 'aggregate',
      params: {
        collection: 'orders',
        pipeline: [
          {
            $group: {
              _id: { __sum_x: '$__sum_x' },
              x: { $sum: '$amount' },
              ___sum_x: { $max: '$amount' },
            },
          },
          {
            $addFields: {
              x: { $cond: [{ $gt: ['$___sum_x', null] }, '$x', null] },
              __sum_x: '$_id.__sum_x',
            },
          },
          { $project: { __sum_x: 1, x: 1, _id: 0 } },
        ],
      },
    },
  },
  {
    // A CASE result that is a column is missing where the column is; the
    // `$ifNull` keeps the key in the row with null, as on SQL.
    name: 'SELECT an expression that can be missing → $ifNull to null',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'nick', 'role'],
      expressions: {
        shown: {
          $$_expression: 'CASE',
          args: { cases: [{ when: { '@role': 'a' }, then: '@nick' }] },
        },
      },
      projection: { '@id': true, '@shown': true },
    },
    expected: {
      sql: 'aggregate',
      params: {
        collection: 'users',
        pipeline: [
          {
            $addFields: {
              shown: {
                $ifNull: [{
                  $switch: {
                    branches: [{
                      case: {
                        $and: [{ $eq: ['$role', 'a'] }, {
                          $gt: ['$role', null],
                        }],
                      },
                      then: '$nick',
                    }],
                    default: null,
                  },
                }, null],
              },
            },
          },
          { $project: { id: 1, shown: 1, _id: 0 } },
        ],
      },
    },
  },
  {
    // A null `on` value matches a null or missing field, as SQL IS NULL
    // does; aggregation `$eq` with null would skip a missing one.
    name: 'SELECT with a null JOIN on value → $type null or missing',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'grants',
      columns: ['pid', 'perm'],
      joins: {
        P: {
          table: 'principals',
          columns: ['id', 'org', 'name'],
          type: 'INNER',
          on: { '@P.@id': '@pid', '@P.@org': null },
        },
      },
      projection: { '@perm': true },
    },
    expected: {
      sql: 'aggregate',
      params: {
        collection: 'grants',
        pipeline: [
          {
            $lookup: {
              from: 'principals',
              let: { v0: '$pid' },
              pipeline: [{
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$id', '$$v0'] },
                      { $gt: ['$id', null] },
                      { $in: [{ $type: '$org' }, ['null', 'missing']] },
                    ],
                  },
                },
              }],
              as: 'P',
            },
          },
          { $unwind: '$P' },
          { $project: { perm: 1, _id: 0 } },
        ],
      },
    },
  },
  {
    // SQL takes the joined column on either side of an `on` entry.
    name: 'SELECT with a JOIN on naming the base column first → same $lookup',
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
          on: { '@id': '@Profile.@userId' },
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
              pipeline: [{ $match: { userId: { $ne: null } } }],
              as: 'Profile',
            },
          },
          {
            $unwind: { path: '$Profile', preserveNullAndEmptyArrays: true },
          },
          {
            $project: {
              id: 1,
              bio: { $ifNull: ['$Profile.bio', null] },
              _id: 0,
            },
          },
        ],
      },
    },
  },
  {
    // The joined rows no user matches come in through `$unionWith`, with
    // the user columns NULL; the base filter runs after, as SQL's WHERE.
    name: 'SELECT with a RIGHT JOIN → $unionWith of the unmatched rows',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'name'],
      joins: {
        Profile: {
          table: 'profiles',
          columns: ['userId', 'bio'],
          type: 'RIGHT',
          on: { '@Profile.@userId': '@id' },
        },
      },
      projection: { '@id': true, '@Profile.@bio': 'bio' },
      where: { '@name': 'a' },
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
              pipeline: [{ $match: { userId: { $ne: null } } }],
              as: 'Profile',
            },
          },
          { $unwind: '$Profile' },
          {
            $unionWith: {
              coll: 'profiles',
              pipeline: [
                { $replaceRoot: { newRoot: { Profile: '$$ROOT' } } },
                {
                  $lookup: {
                    from: 'users',
                    let: { joined: '$Profile' },
                    pipeline: [{
                      $match: {
                        $expr: {
                          $and: [
                            { $eq: ['$$joined.userId', '$id'] },
                            { $gt: ['$$joined.userId', null] },
                          ],
                        },
                      },
                    }, { $limit: 1 }],
                    as: '__matches',
                  },
                },
                { $match: { __matches: { $size: 0 } } },
                {
                  $replaceRoot: {
                    newRoot: { id: null, name: null, Profile: '$Profile' },
                  },
                },
              ],
            },
          },
          { $match: { name: 'a' } },
          {
            $project: {
              id: 1,
              bio: { $ifNull: ['$Profile.bio', null] },
              _id: 0,
            },
          },
        ],
      },
    },
  },
  {
    // FULL keeps the users without a profile too; the unmatched profiles
    // are found by the rows of the joins before it.
    name: 'SELECT with a FULL JOIN after a LEFT JOIN → $unionWith over both',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'org'],
      joins: {
        O: {
          table: 'orgs',
          columns: ['id', 'name'],
          type: 'LEFT',
          on: { '@O.@id': '@org' },
        },
        P: {
          table: 'profiles',
          columns: ['userId', 'org', 'bio'],
          type: 'FULL',
          on: { '@P.@userId': '@id', '@P.@org': '@O.@name', '@P.@bio': 'x' },
        },
      },
      projection: { '@id': true, '@P.@bio': true },
    },
    expected: {
      sql: 'aggregate',
      params: {
        collection: 'users',
        pipeline: [
          {
            $lookup: {
              from: 'orgs',
              localField: 'org',
              foreignField: 'id',
              pipeline: [{ $match: { id: { $ne: null } } }],
              as: 'O',
            },
          },
          { $unwind: { path: '$O', preserveNullAndEmptyArrays: true } },
          {
            $lookup: {
              from: 'profiles',
              let: { v0: '$id', v1: '$O.name' },
              pipeline: [{
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$userId', '$$v0'] },
                      { $gt: ['$userId', null] },
                      { $eq: ['$org', '$$v1'] },
                      { $gt: ['$org', null] },
                      { $eq: ['$bio', 'x'] },
                    ],
                  },
                },
              }],
              as: 'P',
            },
          },
          { $unwind: { path: '$P', preserveNullAndEmptyArrays: true } },
          {
            $unionWith: {
              coll: 'profiles',
              pipeline: [
                { $replaceRoot: { newRoot: { P: '$$ROOT' } } },
                {
                  $lookup: {
                    from: 'users',
                    let: { joined: '$P' },
                    pipeline: [
                      {
                        $lookup: {
                          from: 'orgs',
                          localField: 'org',
                          foreignField: 'id',
                          pipeline: [{ $match: { id: { $ne: null } } }],
                          as: 'O',
                        },
                      },
                      {
                        $unwind: {
                          path: '$O',
                          preserveNullAndEmptyArrays: true,
                        },
                      },
                      {
                        $match: {
                          $expr: {
                            $and: [
                              { $eq: ['$$joined.userId', '$id'] },
                              { $gt: ['$$joined.userId', null] },
                              { $eq: ['$$joined.org', '$O.name'] },
                              { $gt: ['$$joined.org', null] },
                              { $eq: ['$$joined.bio', 'x'] },
                            ],
                          },
                        },
                      },
                      { $limit: 1 },
                    ],
                    as: '__matches',
                  },
                },
                { $match: { __matches: { $size: 0 } } },
                {
                  $replaceRoot: {
                    newRoot: { id: null, org: null, P: '$P' },
                  },
                },
              ],
            },
          },
          {
            $project: {
              id: 1,
              bio: { $ifNull: ['$P.bio', null] },
              _id: 0,
            },
          },
        ],
      },
    },
  },
  {
    // An entry naming only outer columns is a condition on the outer row.
    name: 'SELECT with JOIN on entries naming outer columns → let vars',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'grants',
      columns: ['pid', 'perm'],
      joins: {
        P: {
          table: 'principals',
          columns: ['id', 'org', 'name'],
          type: 'INNER',
          on: { '@pid': '@P.@id', '@perm': 'r', '@P.@org': '@P.@name' },
        },
      },
      projection: { '@perm': true },
    },
    expected: {
      sql: 'aggregate',
      params: {
        collection: 'grants',
        pipeline: [
          {
            $lookup: {
              from: 'principals',
              let: { v0: '$pid', v1: '$perm' },
              pipeline: [{
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$id', '$$v0'] },
                      { $gt: ['$id', null] },
                      { $eq: ['$$v1', 'r'] },
                      { $eq: ['$org', '$name'] },
                      { $gt: ['$org', null] },
                    ],
                  },
                },
              }],
              as: 'P',
            },
          },
          { $unwind: '$P' },
          { $project: { perm: 1, _id: 0 } },
        ],
      },
    },
  },
  {
    // As on SQL, an `@` value is a column only when the query knows it.
    name: 'SELECT with a JOIN on value naming no known column → text',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'grants',
      columns: ['pid', 'perm'],
      joins: {
        P: {
          table: 'principals',
          columns: ['id', 'role'],
          type: 'INNER',
          on: { '@P.@role': '@admin' },
        },
      },
      projection: { '@perm': true },
    },
    expected: {
      sql: 'aggregate',
      params: {
        collection: 'grants',
        pipeline: [
          {
            $lookup: {
              from: 'principals',
              pipeline: [{ $match: { $expr: { $eq: ['$role', '@admin'] } } }],
              as: 'P',
            },
          },
          { $unwind: '$P' },
          { $project: { perm: 1, _id: 0 } },
        ],
      },
    },
  },
  {
    name:
      'SELECT with JOIN on values naming undeclared columns beside a column pair → text',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'grants',
      columns: ['pid', 'perm'],
      joins: {
        P: {
          table: 'principals',
          columns: ['id', 'role'],
          type: 'INNER',
          on: { '@P.@id': '@pid', '@P.@role': '@owner', '@perm': '@P.@org' },
        },
      },
      projection: { '@perm': true },
    },
    expected: {
      sql: 'aggregate',
      params: {
        collection: 'grants',
        pipeline: [
          {
            $lookup: {
              from: 'principals',
              let: { v0: '$pid', v1: '$perm' },
              pipeline: [{
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$id', '$$v0'] },
                      { $gt: ['$id', null] },
                      { $eq: ['$role', '@owner'] },
                      { $eq: ['$$v1', '@P.@org'] },
                    ],
                  },
                },
              }],
              as: 'P',
            },
          },
          { $unwind: '$P' },
          { $project: { perm: 1, _id: 0 } },
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
              pipeline: [{ $match: { userId: { $ne: null } } }],
              as: 'Profile',
            },
          },
          {
            $unwind: { path: '$Profile', preserveNullAndEmptyArrays: true },
          },
          {
            $project: {
              id: 1,
              bio: { $ifNull: ['$Profile.bio', null] },
              _id: 0,
            },
          },
        ],
      },
    },
  },
  {
    // A to-many join gives one row per joined row, as SQL does: the
    // filter tests each joined row on its own, and a joined column is a
    // key of the row named as SQL names it.
    name: 'SELECT a to-many join → $unwind, then the filter per joined row',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id'],
      joins: {
        o: {
          table: 'orders',
          columns: ['userId', 'sku', 'amount'],
          type: 'LEFT',
          on: { '@o.@userId': '@id' },
        },
      },
      projection: { '@id': true, '@o.@sku': true },
      where: { '@o.@sku': 'A', '@o.@amount': { $gt: 5 } },
    },
    expected: {
      sql: 'aggregate',
      params: {
        collection: 'users',
        pipeline: [
          {
            $lookup: {
              from: 'orders',
              localField: 'id',
              foreignField: 'userId',
              pipeline: [{ $match: { userId: { $ne: null } } }],
              as: 'o',
            },
          },
          { $unwind: { path: '$o', preserveNullAndEmptyArrays: true } },
          { $match: { 'o.sku': 'A', 'o.amount': { $gt: 5 } } },
          { $project: { id: 1, sku: { $ifNull: ['$o.sku', null] }, _id: 0 } },
        ],
      },
    },
  },
  {
    // JSON_ROW and ARRAY_AGG collect the joined rows of each group, NULL
    // for a row without a match, as on SQL. A projected join alias is the
    // JSON_ROW of the join's columns.
    name: 'SELECT JSON_ROW, ARRAY_AGG and a join alias → $group of joined rows',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id'],
      joins: {
        P: {
          table: 'posts',
          columns: ['userId', 'title'],
          type: 'LEFT',
          on: { '@P.@userId': '@id' },
        },
      },
      aggregates: {
        Posts: { $$_aggregate: 'JSON_ROW', columns: { name: '@P.@title' } },
        titles: { $$_aggregate: 'ARRAY_AGG', column: '@P.@title' },
      },
      projection: { '@id': true, '@Posts': true, '@titles': true, '@P': true },
    },
    expected: {
      sql: 'aggregate',
      params: {
        collection: 'users',
        pipeline: [
          {
            $lookup: {
              from: 'posts',
              localField: 'id',
              foreignField: 'userId',
              pipeline: [{ $match: { userId: { $ne: null } } }],
              as: 'P',
            },
          },
          { $unwind: { path: '$P', preserveNullAndEmptyArrays: true } },
          {
            $group: {
              _id: { id: '$id' },
              Posts: { $push: { name: { $ifNull: ['$P.title', null] } } },
              titles: { $push: { $ifNull: ['$P.title', null] } },
              P: {
                $push: {
                  userId: { $ifNull: ['$P.userId', null] },
                  title: { $ifNull: ['$P.title', null] },
                },
              },
            },
          },
          { $addFields: { id: '$_id.id' } },
          { $project: { id: 1, Posts: 1, titles: 1, P: 1, _id: 0 } },
        ],
      },
    },
  },
  {
    // Aggregates run over the joined rows, so COUNT counts them, and a
    // joined group key nests under its alias: `_id` takes no dotted name.
    name: 'SELECT aggregates grouped by a joined column → nested group key',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'team'],
      joins: {
        o: {
          table: 'orders',
          columns: ['userId', 'sku', 'amount'],
          type: 'LEFT',
          on: { '@o.@userId': '@id' },
        },
      },
      aggregates: {
        n: { $$_aggregate: 'COUNT' },
        hi: { $$_aggregate: 'MAX', column: '@o.@amount' },
      },
      projection: { '@team': true, '@o.@sku': 'item', '@n': true, '@hi': true },
    },
    expected: {
      sql: 'aggregate',
      params: {
        collection: 'users',
        pipeline: [
          {
            $lookup: {
              from: 'orders',
              localField: 'id',
              foreignField: 'userId',
              pipeline: [{ $match: { userId: { $ne: null } } }],
              as: 'o',
            },
          },
          { $unwind: { path: '$o', preserveNullAndEmptyArrays: true } },
          {
            $group: {
              _id: { team: '$team', o: { sku: { $ifNull: ['$o.sku', null] } } },
              n: { $sum: 1 },
              hi: { $max: '$o.amount' },
            },
          },
          { $addFields: { team: '$_id.team', 'o.sku': '$_id.o.sku' } },
          {
            $project: {
              team: 1,
              item: { $ifNull: ['$o.sku', null] },
              n: 1,
              hi: 1,
              _id: 0,
            },
          },
        ],
      },
    },
  },
  {
    // A filter on a projected to-many join keeps the joined rows it
    // matches, as on SQL: here the base rows with none, whose JSON_ROW
    // holds one row of NULLs.
    name:
      'SELECT JSON_ROW of a join filtered on its rows → $match before $group',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'orders',
      columns: ['id'],
      joins: {
        I: {
          table: 'items',
          columns: ['id', 'orderId', 'sku'],
          type: 'LEFT',
          on: { '@I.@orderId': '@id' },
        },
      },
      aggregates: {
        Items: { $$_aggregate: 'JSON_ROW', columns: { sku: '@I.@sku' } },
      },
      projection: { '@id': true, '@Items': true },
      where: { '@I.@id': null },
    },
    expected: {
      sql: 'aggregate',
      params: {
        collection: 'orders',
        pipeline: [
          {
            $lookup: {
              from: 'items',
              localField: 'id',
              foreignField: 'orderId',
              pipeline: [{ $match: { orderId: { $ne: null } } }],
              as: 'I',
            },
          },
          { $unwind: { path: '$I', preserveNullAndEmptyArrays: true } },
          { $match: { 'I.id': null } },
          {
            $group: {
              _id: { id: '$id' },
              Items: { $push: { sku: { $ifNull: ['$I.sku', null] } } },
            },
          },
          { $addFields: { id: '$_id.id' } },
          { $project: { id: 1, Items: 1, _id: 0 } },
        ],
      },
    },
  },
  {
    // An expression argument naming a joined column reads that row's
    // value, not the joined array.
    name: 'SELECT expression over a joined column → computed per joined row',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id'],
      joins: {
        P: {
          table: 'posts',
          columns: ['userId', 'title'],
          type: 'INNER',
          on: { '@P.@userId': '@id' },
        },
      },
      expressions: { t: { $$_expression: 'UPPER', args: '@P.@title' } },
      projection: { '@id': true, '@t': true },
    },
    expected: {
      sql: 'aggregate',
      params: {
        collection: 'users',
        pipeline: [
          {
            $lookup: {
              from: 'posts',
              localField: 'id',
              foreignField: 'userId',
              pipeline: [{ $match: { userId: { $ne: null } } }],
              as: 'P',
            },
          },
          { $unwind: '$P' },
          {
            $addFields: {
              t: {
                $cond: [{ $gt: ['$P.title', null] }, {
                  $toUpper: '$P.title',
                }, null],
              },
            },
          },
          { $project: { id: 1, t: 1, _id: 0 } },
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
                        { $gt: ['$id', null] },
                        { $eq: ['$tenantId', '$$v1'] },
                        { $gt: ['$tenantId', null] },
                      ],
                    },
                  },
                },
              ],
              as: 'U',
            },
          },
          {
            $unwind: { path: '$U', preserveNullAndEmptyArrays: true },
          },
          {
            $project: {
              id: 1,
              userName: { $ifNull: ['$U.name', null] },
              _id: 0,
            },
          },
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
          {
            $unwind: { path: '$U', preserveNullAndEmptyArrays: true },
          },
          {
            $project: {
              id: 1,
              userName: { $ifNull: ['$U.name', null] },
              _id: 0,
            },
          },
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
                {
                  $match: {
                    $expr: {
                      $and: [{ $eq: ['$id', '$$v0'] }, { $gt: ['$id', null] }],
                    },
                  },
                },
              ],
              as: 'U',
            },
          },
          {
            $unwind: { path: '$U', preserveNullAndEmptyArrays: true },
          },
          {
            $project: {
              id: 1,
              userName: { $ifNull: ['$U.name', null] },
              _id: 0,
            },
          },
        ],
      },
    },
  },

  {
    // Only the listed key is NULL-safe: `org` folds null and missing
    // together on both sides, `id` keeps plain equality and its guard.
    name: 'SELECT with a nullSafe JOIN key → $ifNull on both sides',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'grants',
      columns: ['pid', 'org', 'perm'],
      joins: {
        P: {
          table: 'principals',
          columns: ['id', 'org', 'name'],
          type: 'INNER',
          on: { '@P.@id': '@pid', '@P.@org': '@org' },
          nullSafe: ['@P.@org'],
        },
      },
      projection: { '@perm': true },
    },
    expected: {
      sql: 'aggregate',
      params: {
        collection: 'grants',
        pipeline: [
          {
            $lookup: {
              from: 'principals',
              let: { v0: '$pid', v1: '$org' },
              pipeline: [{
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$id', '$$v0'] },
                      { $gt: ['$id', null] },
                      {
                        $eq: [
                          { $ifNull: ['$org', null] },
                          { $ifNull: ['$$v1', null] },
                        ],
                      },
                    ],
                  },
                },
              }],
              as: 'P',
            },
          },
          { $unwind: '$P' },
          { $project: { perm: 1, _id: 0 } },
        ],
      },
    },
  },
  {
    // The concise form already matches null and missing to each other,
    // so a NULL-safe single key is that form with no guard.
    name: 'SELECT with a single nullSafe JOIN key → unguarded concise $lookup',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'grants',
      columns: ['org', 'perm'],
      joins: {
        P: {
          table: 'principals',
          columns: ['org', 'name'],
          type: 'LEFT',
          on: { '@P.@org': '@org' },
          nullSafe: ['@P.@org'],
        },
      },
      projection: { '@perm': true },
    },
    expected: {
      sql: 'aggregate',
      params: {
        collection: 'grants',
        pipeline: [
          {
            $lookup: {
              from: 'principals',
              localField: 'org',
              foreignField: 'org',
              as: 'P',
            },
          },
          {
            $unwind: { path: '$P', preserveNullAndEmptyArrays: true },
          },
          { $project: { perm: 1, _id: 0 } },
        ],
      },
    },
  },

  // ---------------------------------------------------------------------------
  // Date arithmetic — OQL TimeUnit → Mongo unit
  // ---------------------------------------------------------------------------
  {
    // `$dateAdd` only accepts lowercase singular units and fails at
    // execution with `unknown time unit value: DAYS` on the raw OQL unit,
    // so the translator maps it. DATE_DIFF never reaches `$dateDiff`: it
    // divides, so a partial unit is dropped as it is on the SQL engines.
    name: 'DATE_ADD maps the OQL time unit; DATE_DIFF divides',
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
        ageYears: {
          $$_expression: 'DATE_DIFF',
          args: { from: '@createdAt', to: '@shippedAt', unit: 'YEARS' },
        },
      },
      projection: {
        '@id': true,
        '@due': 'due',
        '@ageHours': 'ageHours',
        '@ageMonths': 'ageMonths',
        '@ageYears': 'ageYears',
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
              // Fixed-length units divide the elapsed milliseconds.
              ageHours: {
                $toLong: {
                  $trunc: {
                    $divide: [
                      { $subtract: ['$shippedAt', '$createdAt'] },
                      3_600_000,
                    ],
                  },
                },
              },
              // A month has no fixed length, so MONTHS / YEARS divide
              // the gap between two calendar positions by the 32-day
              // slot each month gets on that scale.
              ageMonths: {
                $toLong: {
                  $trunc: {
                    $divide: [
                      {
                        $subtract: [
                          calendarPosition('$shippedAt'),
                          calendarPosition('$createdAt'),
                        ],
                      },
                      2_764_800_000,
                    ],
                  },
                },
              },
              ageYears: {
                $toLong: {
                  $trunc: {
                    $divide: [
                      {
                        $subtract: [
                          calendarPosition('$shippedAt'),
                          calendarPosition('$createdAt'),
                        ],
                      },
                      33_177_600_000,
                    ],
                  },
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
              ageYears: '$ageYears',
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

  {
    name: 'DATE_TRUNC → $dateTrunc, grouped by month',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'orders',
      columns: ['id', 'createdAt'],
      expressions: {
        month: {
          $$_expression: 'DATE_TRUNC',
          args: { date: '@createdAt', unit: 'MONTHS' },
        },
      },
      aggregates: { total: { $$_aggregate: 'COUNT' } },
      projection: { '@month': 'month', '@total': 'total' },
      orderBy: { '@month': 'ASC' },
    } satisfies Query<'SELECT'>,
    expected: {
      sql: 'aggregate',
      params: {
        collection: 'orders',
        pipeline: [
          {
            $addFields: {
              month: { $dateTrunc: { date: '$createdAt', unit: 'month' } },
            },
          },
          { $group: { _id: { month: '$month' }, total: { $sum: 1 } } },
          { $addFields: { month: '$_id.month' } },
          { $sort: { month: 1 } },
          { $project: { month: '$month', total: '$total', _id: 0 } },
        ],
      },
    },
  },
  {
    name: 'DATE_TRUNC over a nested DATE_ADD and NOW',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'orders',
      columns: ['id', 'createdAt'],
      expressions: {
        day: {
          $$_expression: 'DATE_TRUNC',
          args: {
            date: {
              $$_expression: 'DATE_ADD',
              args: { date: '@createdAt', amount: 330, unit: 'MINUTES' },
            },
            unit: 'DAYS',
          },
        },
        year: {
          $$_expression: 'DATE_TRUNC',
          args: { date: { $$_expression: 'NOW' }, unit: 'YEARS' },
        },
      },
      projection: { '@day': 'day', '@year': 'year' },
    } satisfies Query<'SELECT'>,
    expected: {
      sql: 'aggregate',
      params: {
        collection: 'orders',
        pipeline: [
          {
            $addFields: {
              day: {
                $dateTrunc: {
                  date: {
                    $dateAdd: {
                      startDate: '$createdAt',
                      unit: 'minute',
                      amount: 330,
                    },
                  },
                  unit: 'day',
                },
              },
              year: { $dateTrunc: { date: '$$NOW', unit: 'year' } },
            },
          },
          { $project: { day: '$day', year: '$year', _id: 0 } },
        ],
      },
    },
  },
  {
    // Mongo has no time-only type. The UTC clock time is the 'HH:MM:SS'
    // string the SQL dialects return, where `$$NOW` alone is a full Date.
    name: 'CURRENT_TIME is the UTC clock time as a string',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'shifts',
      columns: ['id'],
      expressions: { clock: { $$_expression: 'CURRENT_TIME' } },
      projection: { '@id': true, '@clock': 'clock' },
    } satisfies Query<'SELECT'>,
    expected: {
      sql: 'aggregate',
      params: {
        collection: 'shifts',
        pipeline: [
          {
            $addFields: {
              clock: { $dateToString: { date: '$$NOW', format: '%H:%M:%S' } },
            },
          },
          { $project: { id: 1, clock: '$clock', _id: 0 } },
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
    // literal string search rather than a regex — nothing to escape. The
    // `$cond` keeps a NULL operand from matching, or from raising a type
    // error in `$indexOfCP`: SQL matches nothing against one.
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
          $expr: {
            $cond: [
              { $gt: [LOWER_NICK, null] },
              { $eq: [{ $indexOfCP: ['$name', LOWER_NICK] }, 0] },
              false,
            ],
          },
        },
        options: { projection: { id: 1, _id: 0 } },
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
            $cond: [
              { $gt: [LOWER_NICK, null] },
              { $gte: [{ $indexOfCP: ['$name', LOWER_NICK] }, 0] },
              false,
            ],
          },
        },
        options: { projection: { id: 1, _id: 0 } },
      },
    },
  },
  {
    // Mongo has no "last index of", so `$endsWith` compares the trailing
    // slice. `$let` binds both operands once; `$ifNull` keeps a missing
    // field from raising a `$strLenCP` type error, and the `$gt` guard
    // keeps a null or missing field from ending with an empty suffix.
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
            $cond: [{ $gt: [LOWER_NICK, null] }, {
              $let: {
                vars: {
                  subject: { $ifNull: ['$name', ''] },
                  suffix: LOWER_NICK,
                },
                in: {
                  $and: [
                    { $gt: ['$name', null] },
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
            }, false],
          },
        },
        options: { projection: { id: 1, _id: 0 } },
      },
    },
  },
  {
    // `$like`'s value is a wildcard pattern, as on SQL: computed, it
    // becomes a regex at run time and `$regexMatch` applies it.
    name: 'WHERE $like with an Expression value → $expr $regexMatch',
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
    expected: {
      sql: 'find',
      params: {
        collection: 'users',
        filter: {
          $expr: {
            $cond: [
              { $gt: [LOWER_NICK, null] },
              {
                $regexMatch: { input: '$name', regex: likeRegex(LOWER_NICK) },
              },
              false,
            ],
          },
        },
        options: { projection: { id: 1, _id: 0 } },
      },
    },
  },
  {
    name: 'WHERE $ilike with an Expression value → $regexMatch with i',
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
    expected: {
      sql: 'find',
      params: {
        collection: 'users',
        filter: {
          $expr: {
            $cond: [
              { $gt: [LOWER_NICK, null] },
              {
                $regexMatch: {
                  input: '$name',
                  regex: likeRegex(LOWER_NICK),
                  options: 'i',
                },
              },
              false,
            ],
          },
        },
        options: { projection: { id: 1, _id: 0 } },
      },
    },
  },
  {
    // NOT LIKE is unknown on SQL for a NULL subject or pattern.
    name: 'WHERE $nlike with a @col pattern → negated $regexMatch, guarded',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'name', 'nick'],
      projection: { '@id': true },
      where: { '@name': { $nlike: '@nick' } },
    },
    expected: {
      sql: 'find',
      params: {
        collection: 'users',
        filter: {
          $expr: {
            $cond: [
              { $gt: ['$nick', null] },
              {
                $and: [
                  {
                    $not: [{
                      $regexMatch: {
                        input: '$name',
                        regex: likeRegex('$nick'),
                      },
                    }],
                  },
                  { $gt: ['$name', null] },
                ],
              },
              false,
            ],
          },
        },
        options: { projection: { id: 1, _id: 0 } },
      },
    },
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
  {
    // A query filter sees no computed field, so the alias compares as its
    // expression inside `$expr`, guarded against NULL like a column.
    name: 'UPDATE where on an expression alias → $expr over the expression',
    method: 'update',
    query: {
      type: 'UPDATE',
      table: 'users',
      columns: ['id', 'qty'],
      expressions: { d: { $$_expression: 'ADD', args: ['@qty', 1] } },
      data: { qty: 0 },
      where: { '@id': { $gt: 0 }, '@d': { $lte: '@id' } },
    },
    expected: {
      sql: 'update',
      params: {
        collection: 'users',
        filter: {
          id: { $gt: 0 },
          $expr: {
            $and: [
              { $lte: [{ $add: ['$qty', 1] }, '$id'] },
              { $gt: [{ $add: ['$qty', 1] }, null] },
              { $gt: ['$id', null] },
            ],
          },
        },
        data: { $set: { qty: 0 } },
        options: { multiple: true },
      },
    },
  },
  {
    // As in SQL, the alias wins over the column it shadows.
    name: 'DELETE where on an expression alias inside $or',
    method: 'delete',
    query: {
      type: 'DELETE',
      table: 'users',
      columns: ['id', 'name'],
      expressions: { name: { $$_expression: 'UPPER', args: '@name' } },
      where: { $or: [{ '@name': null }, { '@id': 2 }] },
    },
    expected: {
      sql: 'delete',
      params: {
        collection: 'users',
        filter: {
          $or: [
            {
              $expr: {
                $in: [{
                  $type: {
                    $cond: [
                      { $gt: ['$name', null] },
                      { $toUpper: '$name' },
                      null,
                    ],
                  },
                }, ['null', 'missing']],
              },
            },
            { id: 2 },
          ],
        },
        options: { multiple: true },
      },
    },
  },

  {
    // The value compares the expression itself, so the `$match` may run
    // anywhere; it waits for `$addFields` as a key naming an alias does.
    // After `$group` an aggregate is a field, which a HAVING value reads.
    name: 'SELECT WHERE and HAVING values naming an alias → $expr',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'orders',
      columns: ['userId', 'amount'],
      expressions: {
        doubled: { $$_expression: 'MULTIPLY', args: ['@userId', 2] },
      },
      aggregates: {
        total: { $$_aggregate: 'SUM', column: '@amount' },
        most: { $$_aggregate: 'MAX', column: '@amount' },
      },
      projection: { '@userId': true, '@total': 'total' },
      where: { '@amount': { $lt: '@doubled' } },
      having: { '@total': { $gt: '@most' } },
    },
    expected: {
      sql: 'aggregate',
      params: {
        collection: 'orders',
        pipeline: [
          { $addFields: { doubled: { $multiply: ['$userId', 2] } } },
          {
            $match: {
              $expr: {
                $and: [
                  { $lt: ['$amount', { $multiply: ['$userId', 2] }] },
                  { $gt: ['$amount', null] },
                  { $gt: [{ $multiply: ['$userId', 2] }, null] },
                ],
              },
            },
          },
          {
            $group: {
              _id: { userId: '$userId' },
              total: { $sum: '$amount' },
              __sum_total: { $max: '$amount' },
              most: { $max: '$amount' },
            },
          },
          {
            $addFields: {
              total: {
                $cond: [{ $gt: ['$__sum_total', null] }, '$total', null],
              },
              userId: '$_id.userId',
            },
          },
          {
            $match: {
              $expr: {
                $and: [
                  { $gt: ['$total', '$most'] },
                  { $gt: ['$total', null] },
                  { $gt: ['$most', null] },
                ],
              },
            },
          },
          { $project: { userId: 1, total: '$total', _id: 0 } },
        ],
      },
    },
  },
  {
    name: 'UPDATE where value naming an expression alias → $expr $in',
    method: 'update',
    query: {
      type: 'UPDATE',
      table: 'users',
      columns: ['id', 'qty'],
      expressions: { d: { $$_expression: 'ADD', args: ['@qty', 1] } },
      data: { qty: 0 },
      where: { '@id': { $in: ['@d', 5] } },
    },
    expected: {
      sql: 'update',
      params: {
        collection: 'users',
        filter: {
          $expr: {
            $and: [
              { $in: ['$id', [{ $add: ['$qty', 1] }, 5]] },
              { $gt: ['$id', null] },
            ],
          },
        },
        data: { $set: { qty: 0 } },
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

  {
    // updateSet makes the update a pipeline: the insert branch (no _id
    // yet) keeps the row's value, the conflict branch takes updateSet's.
    name: 'UPSERT updateSet is a pipeline branching on a new document',
    method: 'upsert',
    query: {
      type: 'UPSERT',
      table: 'users',
      columns: ['id', 'name', 'status', 'seenAt'],
      data: { id: 1, name: 'John', status: 'NEW' },
      conflictKeys: ['@id'],
      updateOnConflict: [],
      updateSet: { status: 'SEEN', seenAt: { $$_expression: 'NOW' } },
    },
    expected: {
      sql: 'update',
      params: {
        collection: 'users',
        filter: { id: 1 },
        data: [{
          $set: {
            id: {
              $cond: [
                { $eq: [{ $type: '$_id' }, 'missing'] },
                { $literal: 1 },
                '$id',
              ],
            },
            name: {
              $cond: [
                { $eq: [{ $type: '$_id' }, 'missing'] },
                { $literal: 'John' },
                '$name',
              ],
            },
            status: {
              $cond: [
                { $eq: [{ $type: '$_id' }, 'missing'] },
                { $literal: 'NEW' },
                { $literal: 'SEEN' },
              ],
            },
            seenAt: {
              $cond: [
                { $eq: [{ $type: '$_id' }, 'missing'] },
                '$$REMOVE',
                '$$NOW',
              ],
            },
          },
        }],
        options: { upsert: true },
      },
    },
  },
  {
    // The row being inserted has no column to read, so `'@name'` in its
    // value is text; updateSet runs against the stored row and reads it.
    name: 'UPSERT reads a column in updateSet, not in the inserted row',
    method: 'upsert',
    query: {
      type: 'UPSERT',
      table: 'users',
      columns: ['id', 'name', 'nick'],
      data: {
        id: 1,
        nick: { $$_expression: 'CONCAT', args: ['@name', '!'] },
      },
      conflictKeys: ['@id'],
      updateSet: {
        nick: { $$_expression: 'CONCAT', args: ['@name', '@nope'] },
      },
    },
    expected: {
      sql: 'update',
      params: {
        collection: 'users',
        filter: { id: 1 },
        data: [{
          $set: {
            id: {
              $cond: [
                { $eq: [{ $type: '$_id' }, 'missing'] },
                { $literal: 1 },
                '$id',
              ],
            },
            nick: {
              $cond: [
                { $eq: [{ $type: '$_id' }, 'missing'] },
                { $concat: ['@name', '!'] },
                { $concat: ['$name', '@nope'] },
              ],
            },
          },
        }],
        options: { upsert: true },
      },
    },
  },
  {
    name: 'UPDATE with an expression is a pipeline; literals are $literal',
    method: 'update',
    query: {
      type: 'UPDATE',
      table: 'stats',
      columns: ['id', 'clicks', 'label'],
      data: {
        clicks: { $$_expression: 'ADD', args: ['@clicks', 1] },
        label: '$not-a-field',
      },
      where: { '@id': 1 },
    },
    expected: {
      sql: 'update',
      params: {
        collection: 'stats',
        filter: { id: 1 },
        data: [{
          $set: {
            clicks: { $add: ['$clicks', 1] },
            label: { $literal: '$not-a-field' },
          },
        }],
        options: { multiple: true },
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
    // `COUNT(DISTINCT col)`: the group collects its distinct values, and
    // the count is the size of that set without the null SQL never counts.
    name: 'SELECT COUNT(column) with distinct → $addToSet, sized after $group',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'scores',
      columns: ['userId', 'score'],
      aggregates: {
        c: { $$_aggregate: 'COUNT', column: '@score', distinct: true },
      },
      projection: { '@userId': true, '@c': 'c' },
      having: { '@c': { $gte: 2 } },
    },
    expected: {
      sql: 'aggregate',
      params: {
        collection: 'scores',
        pipeline: [
          {
            $group: { _id: { userId: '$userId' }, c: { $addToSet: '$score' } },
          },
          {
            $addFields: {
              c: { $size: { $setDifference: ['$c', [null]] } },
              userId: '$_id.userId',
            },
          },
          { $match: { c: { $gte: 2 } } },
          { $project: { userId: 1, c: '$c', _id: 0 } },
        ],
      },
    },
  },
  {
    // SQL collects NULL once among the distinct values, a missing field
    // as NULL too.
    name: 'SELECT ARRAY_AGG with distinct → $addToSet of the value or null',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'scores',
      columns: ['userId', 'score'],
      aggregates: {
        all: { $$_aggregate: 'ARRAY_AGG', column: '@score', distinct: true },
      },
      projection: { '@userId': true, '@all': 'all' },
    },
    expected: {
      sql: 'aggregate',
      params: {
        collection: 'scores',
        pipeline: [
          {
            $group: {
              _id: { userId: '$userId' },
              all: { $addToSet: { $ifNull: ['$score', null] } },
            },
          },
          { $addFields: { userId: '$_id.userId' } },
          { $project: { userId: 1, all: '$all', _id: 0 } },
        ],
      },
    },
  },
  {
    // MIN and MAX of a set are those of its rows: `distinct` changes nothing.
    name: 'SELECT SUM / AVG with distinct reduce the set, MIN keeps $min',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'scores',
      columns: ['userId', 'score'],
      aggregates: {
        s: { $$_aggregate: 'SUM', column: '@score', distinct: true },
        a: { $$_aggregate: 'AVG', column: '@score', distinct: true },
        lo: { $$_aggregate: 'MIN', column: '@score', distinct: true },
      },
      projection: { '@s': 's', '@a': 'a', '@lo': 'lo' },
    },
    expected: {
      sql: 'aggregate',
      params: {
        collection: 'scores',
        pipeline: [
          // Ungrouped: `$facet` emits one row even when nothing matched,
          // the empty sets of SQL's row over no rows.
          {
            $facet: {
              rows: [{
                $group: {
                  _id: {},
                  s: { $addToSet: '$score' },
                  a: { $addToSet: '$score' },
                  lo: { $min: '$score' },
                },
              }],
            },
          },
          {
            $replaceRoot: {
              newRoot: {
                $ifNull: [{ $arrayElemAt: ['$rows', 0] }, {
                  $literal: { _id: {}, s: [], a: [], lo: null },
                }],
              },
            },
          },
          {
            $addFields: {
              s: {
                $cond: [{ $gt: [{ $max: '$s' }, null] }, { $sum: '$s' }, null],
              },
              a: { $avg: '$a' },
            },
          },
          { $project: { s: '$s', a: '$a', lo: '$lo', _id: 0 } },
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
  {
    name: 'COUNT where value naming an expression alias → pipeline count',
    method: 'count',
    query: {
      type: 'COUNT',
      table: 'users',
      columns: ['id', 'status'],
      expressions: { s: { $$_expression: 'UPPER', args: '@status' } },
      where: { '@status': '@s' },
    },
    expected: {
      sql: 'aggregate',
      params: {
        collection: 'users',
        pipeline: [
          {
            $addFields: {
              s: {
                $cond: [
                  { $gt: ['$status', null] },
                  { $toUpper: '$status' },
                  null,
                ],
              },
            },
          },
          {
            $match: {
              $expr: {
                $and: [
                  {
                    $eq: ['$status', {
                      $cond: [
                        { $gt: ['$status', null] },
                        { $toUpper: '$status' },
                        null,
                      ],
                    }],
                  },
                  { $gt: ['$status', null] },
                  {
                    $gt: [{
                      $cond: [
                        { $gt: ['$status', null] },
                        { $toUpper: '$status' },
                        null,
                      ],
                    }, null],
                  },
                ],
              },
            },
          },
          {
            $facet: {
              rows: [{ $group: { _id: {}, __count__: { $sum: 1 } } }],
            },
          },
          {
            $replaceRoot: {
              newRoot: {
                $ifNull: [{ $arrayElemAt: ['$rows', 0] }, {
                  $literal: { _id: {}, __count__: 0 },
                }],
              },
            },
          },
          { $project: { __count__: 1, _id: 0 } },
        ],
      },
    },
  },
  {
    // A native count's filter sees no computed field, so a filter on a
    // declared expression counts in a pipeline after `$addFields`.
    name: 'COUNT filtered on an expression alias → pipeline count',
    method: 'count',
    query: {
      type: 'COUNT',
      table: 'users',
      columns: ['id', 'name'],
      expressions: { u: { $$_expression: 'UPPER', args: '@name' } },
      where: { '@u': 'ADA' },
    },
    expected: {
      sql: 'aggregate',
      params: {
        collection: 'users',
        pipeline: [
          {
            $addFields: {
              u: {
                $cond: [{ $gt: ['$name', null] }, { $toUpper: '$name' }, null],
              },
            },
          },
          { $match: { u: 'ADA' } },
          {
            $facet: {
              rows: [{ $group: { _id: {}, __count__: { $sum: 1 } } }],
            },
          },
          {
            $replaceRoot: {
              newRoot: {
                $ifNull: [{ $arrayElemAt: ['$rows', 0] }, {
                  $literal: { _id: {}, __count__: 0 },
                }],
              },
            },
          },
          { $project: { __count__: 1, _id: 0 } },
        ],
      },
    },
  },
  {
    name: 'COUNT with a join filtered on an expression alias keeps it',
    method: 'count',
    query: {
      type: 'COUNT',
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
      expressions: { u: { $$_expression: 'UPPER', args: '@name' } },
      where: { '@u': 'ADA' },
    },
    expected: {
      sql: 'aggregate',
      params: {
        collection: 'users',
        pipeline: [
          {
            $lookup: {
              from: 'orders',
              localField: 'id',
              foreignField: 'userId',
              pipeline: [{ $match: { userId: { $ne: null } } }],
              as: 'o',
            },
          },
          { $unwind: { path: '$o', preserveNullAndEmptyArrays: true } },
          {
            $addFields: {
              u: {
                $cond: [{ $gt: ['$name', null] }, { $toUpper: '$name' }, null],
              },
            },
          },
          { $match: { u: 'ADA' } },
          {
            $facet: {
              rows: [{ $group: { _id: {}, __count__: { $sum: 1 } } }],
            },
          },
          {
            $replaceRoot: {
              newRoot: {
                $ifNull: [{ $arrayElemAt: ['$rows', 0] }, {
                  $literal: { _id: {}, __count__: 0 },
                }],
              },
            },
          },
          { $project: { __count__: 1, _id: 0 } },
        ],
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
    // As on SQL, the count is a SELECT of COUNT DISTINCT.
    name: 'COUNT with distinct → pipeline count of the distinct set',
    method: 'count',
    query: {
      type: 'COUNT',
      table: 'orders',
      columns: ['id', 'userId'],
      distinct: ['userId'],
    },
    expected: {
      sql: 'aggregate',
      params: {
        collection: 'orders',
        pipeline: [
          {
            $facet: {
              rows: [{
                $group: { _id: {}, __count__: { $addToSet: '$userId' } },
              }],
            },
          },
          {
            $replaceRoot: {
              newRoot: {
                $ifNull: [{ $arrayElemAt: ['$rows', 0] }, {
                  $literal: { _id: {}, __count__: [] },
                }],
              },
            },
          },
          {
            $addFields: {
              __count__: { $size: { $setDifference: ['$__count__', [null]] } },
            },
          },
          { $project: { __count__: 1, _id: 0 } },
        ],
      },
    },
  },
  {
    // The values are collected, `$addToSet` for `distinct`, and joined
    // after the group: NULL skipped, NULL when none is left.
    name: 'STRING_AGG → collected, then joined with its separator',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'orders',
      columns: ['userId', 'tag'],
      aggregates: {
        tags: { $$_aggregate: 'STRING_AGG', column: '@tag', separator: '$, ' },
        uniq: { $$_aggregate: 'STRING_AGG', column: '@tag', distinct: true },
      },
      projection: { '@userId': true, '@tags': 'tags', '@uniq': 'uniq' },
    },
    expected: {
      sql: 'aggregate',
      params: {
        collection: 'orders',
        pipeline: [
          {
            $group: {
              _id: { userId: '$userId' },
              tags: { $push: '$tag' },
              uniq: { $addToSet: '$tag' },
            },
          },
          {
            $addFields: {
              tags: {
                $reduce: {
                  input: {
                    $filter: {
                      input: '$tags',
                      cond: { $ne: ['$$this', null] },
                    },
                  },
                  initialValue: null,
                  in: {
                    $cond: [
                      { $eq: ['$$value', null] },
                      '$$this',
                      {
                        $concat: ['$$value', { $literal: '$, ' }, '$$this'],
                      },
                    ],
                  },
                },
              },
              uniq: {
                $reduce: {
                  input: {
                    $filter: {
                      input: '$uniq',
                      cond: { $ne: ['$$this', null] },
                    },
                  },
                  initialValue: null,
                  in: {
                    $cond: [
                      { $eq: ['$$value', null] },
                      '$$this',
                      { $concat: ['$$value', ',', '$$this'] },
                    ],
                  },
                },
              },
              userId: '$_id.userId',
            },
          },
          {
            $project: { userId: 1, tags: '$tags', uniq: '$uniq', _id: 0 },
          },
        ],
      },
    },
  },
  {
    // The `$gt: null` guard is SQL's `=`: a NULL key on either side
    // matches nothing, where aggregation `$eq` alone pairs null with null.
    name: '$exists filter runs as a $lookup, matched non-empty and unset',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id'],
      projection: { '@id': true },
      where: { $exists: { table: 'orders', on: { '@userId': '@id' } } },
    },
    expected: {
      sql: 'aggregate',
      params: {
        collection: 'users',
        pipeline: [
          {
            $lookup: {
              from: 'orders',
              let: { v0: '$id' },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $eq: ['$userId', '$$v0'] },
                        { $gt: ['$userId', null] },
                      ],
                    },
                  },
                },
                { $limit: 1 },
              ],
              as: '__exists_0',
            },
          },
          { $match: { __exists_0: { $ne: [] } } },
          { $unset: ['__exists_0'] },
          { $project: { id: 1, _id: 0 } },
        ],
      },
    },
  },
  {
    name: 'COUNT with a $nexists filter and a sub-where is a pipeline count',
    method: 'count',
    query: {
      type: 'COUNT',
      table: 'users',
      columns: ['id'],
      where: {
        $nexists: {
          table: 'orders',
          on: { '@userId': '@id' },
          where: { '@status': 'paid' },
        },
      },
    },
    expected: {
      sql: 'aggregate',
      params: {
        collection: 'users',
        pipeline: [
          {
            $lookup: {
              from: 'orders',
              let: { v0: '$id' },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $eq: ['$userId', '$$v0'] },
                        { $gt: ['$userId', null] },
                      ],
                    },
                  },
                },
                { $match: { status: 'paid' } },
                { $limit: 1 },
              ],
              as: '__exists_0',
            },
          },
          { $match: { __exists_0: { $size: 0 } } },
          { $unset: ['__exists_0'] },
          {
            $facet: {
              rows: [{ $group: { _id: {}, __count__: { $sum: 1 } } }],
            },
          },
          {
            $replaceRoot: {
              newRoot: {
                $ifNull: [{ $arrayElemAt: ['$rows', 0] }, {
                  $literal: { _id: {}, __count__: 0 },
                }],
              },
            },
          },
          { $project: { __count__: 1, _id: 0 } },
        ],
      },
    },
  },
  {
    name: '$exists / $nexists inside $or each test their own lookup field',
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
          { $nexists: { table: 'bans', on: { '@userId': '@id' } } },
        ],
      },
    },
    expected: {
      sql: 'aggregate',
      params: {
        collection: 'users',
        pipeline: [
          {
            $lookup: {
              from: 'orders',
              let: { v0: '$id' },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $eq: ['$userId', '$$v0'] },
                        { $gt: ['$userId', null] },
                      ],
                    },
                  },
                },
                { $limit: 1 },
              ],
              as: '__exists_0',
            },
          },
          {
            $lookup: {
              from: 'bans',
              let: { v0: '$id' },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $eq: ['$userId', '$$v0'] },
                        { $gt: ['$userId', null] },
                      ],
                    },
                  },
                },
                { $limit: 1 },
              ],
              as: '__exists_1',
            },
          },
          {
            $match: {
              $or: [
                { role: 'admin' },
                { __exists_0: { $ne: [] } },
                { __exists_1: { $size: 0 } },
              ],
            },
          },
          { $unset: ['__exists_0', '__exists_1'] },
          { $project: { id: 1, _id: 0 } },
        ],
      },
    },
  },
  {
    // The nested node runs inside the outer lookup's own pipeline, after
    // the key match and before the `$limit`.
    name: 'nested $exists is a lookup inside the lookup',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id'],
      projection: { '@id': true },
      where: {
        $exists: {
          table: 'orders',
          on: { '@userId': '@id' },
          where: {
            $exists: {
              table: 'items',
              on: { '@orderId': 1 },
              where: { '@sku': 'A' },
            },
          },
        },
      },
    },
    expected: {
      sql: 'aggregate',
      params: {
        collection: 'users',
        pipeline: [
          {
            $lookup: {
              from: 'orders',
              let: { v0: '$id' },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $eq: ['$userId', '$$v0'] },
                        { $gt: ['$userId', null] },
                      ],
                    },
                  },
                },
                {
                  $lookup: {
                    from: 'items',
                    pipeline: [
                      { $match: { $expr: { $eq: ['$orderId', 1] } } },
                      { $match: { sku: 'A' } },
                      { $limit: 1 },
                    ],
                    as: '__exists_0',
                  },
                },
                { $match: { __exists_0: { $ne: [] } } },
                { $unset: ['__exists_0'] },
                { $limit: 1 },
              ],
              as: '__exists_0',
            },
          },
          { $match: { __exists_0: { $ne: [] } } },
          { $unset: ['__exists_0'] },
          { $project: { id: 1, _id: 0 } },
        ],
      },
    },
  },
  {
    // A joined column holds the unwound row's value, bound like a base
    // column; the match runs after the join.
    name: '$exists keyed on a joined column binds its value',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id'],
      joins: {
        P: {
          table: 'profiles',
          columns: ['id', 'userId'],
          on: { '@P.@userId': '@id' },
        },
      },
      projection: { '@id': true },
      where: {
        $exists: { table: 'orders', on: { '@profileId': '@P.@id' } },
      },
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
              pipeline: [{ $match: { userId: { $ne: null } } }],
              as: 'P',
            },
          },
          { $unwind: '$P' },
          {
            $lookup: {
              from: 'orders',
              let: { v0: '$P.id' },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $eq: ['$profileId', '$$v0'] },
                        { $gt: ['$profileId', null] },
                      ],
                    },
                  },
                },
                { $limit: 1 },
              ],
              as: '__exists_0',
            },
          },
          { $match: { __exists_0: { $ne: [] } } },
          { $unset: ['__exists_0'] },
          { $project: { id: 1, _id: 0 } },
        ],
      },
    },
  },
  {
    // The CASE condition's lookup runs before the expressions stage, which
    // tests its size; the field avoids the column named like it.
    name: '$nexists inside a CASE condition of a SELECT expression',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id', '__exists_0'],
      expressions: {
        buyer: {
          $$_expression: 'CASE',
          args: {
            cases: [{
              when: { $nexists: { table: 'orders', on: { '@userId': '@id' } } },
              then: 'no',
            }],
            else: 'yes',
          },
        },
      },
      projection: { '@id': true, '@buyer': true },
    },
    expected: {
      sql: 'aggregate',
      params: {
        collection: 'users',
        pipeline: [
          {
            $lookup: {
              from: 'orders',
              let: { v0: '$id' },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $eq: ['$userId', '$$v0'] },
                        { $gt: ['$userId', null] },
                      ],
                    },
                  },
                },
                { $limit: 1 },
              ],
              as: '___exists_0',
            },
          },
          {
            $addFields: {
              buyer: {
                $switch: {
                  branches: [{
                    case: { $eq: [{ $size: '$___exists_0' }, 0] },
                    then: 'no',
                  }],
                  default: 'yes',
                },
              },
            },
          },
          { $unset: ['___exists_0'] },
          { $project: { id: 1, buyer: 1, _id: 0 } },
        ],
      },
    },
  },
  {
    // A column of the query, or of the subquery table its sub-where names,
    // keeps its value: the lookup field takes another name.
    name: '$exists beside a column named like its lookup field',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id', '__exists_0'],
      projection: { '@id': true, '@__exists_0': true },
      where: {
        $exists: {
          table: 'orders',
          on: { '@userId': '@id' },
          where: {
            '@__exists_0': 1,
            $exists: { table: 'items', on: { '@orderId': 1 } },
          },
        },
      },
    },
    expected: {
      sql: 'aggregate',
      params: {
        collection: 'users',
        pipeline: [
          {
            $lookup: {
              from: 'orders',
              let: { v0: '$id' },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $eq: ['$userId', '$$v0'] },
                        { $gt: ['$userId', null] },
                      ],
                    },
                  },
                },
                {
                  $lookup: {
                    from: 'items',
                    pipeline: [
                      { $match: { $expr: { $eq: ['$orderId', 1] } } },
                      { $limit: 1 },
                    ],
                    as: '___exists_0',
                  },
                },
                {
                  $match: { __exists_0: 1, ___exists_0: { $ne: [] } },
                },
                { $unset: ['___exists_0'] },
                { $limit: 1 },
              ],
              as: '___exists_0',
            },
          },
          { $match: { ___exists_0: { $ne: [] } } },
          { $unset: ['___exists_0'] },
          { $project: { id: 1, __exists_0: 1, _id: 0 } },
        ],
      },
    },
  },
  {
    // One of each `on` value: a column, a NULL-safe column, null, and an
    // `@` string that names no outer column and so is data.
    name: '$exists keys: column, nullSafe column, null and literal',
    method: 'select',
    query: {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'code'],
      projection: { '@id': true },
      where: {
        $exists: {
          table: 'orders',
          on: {
            '@userId': '@id',
            '@code': '@code',
            '@note': null,
            '@status': '@open',
          },
          nullSafe: ['@code'],
        },
      },
    },
    expected: {
      sql: 'aggregate',
      params: {
        collection: 'users',
        pipeline: [
          {
            $lookup: {
              from: 'orders',
              let: { v0: '$id', v1: '$code' },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $eq: ['$userId', '$$v0'] },
                        { $gt: ['$userId', null] },
                        {
                          $eq: [
                            { $ifNull: ['$code', null] },
                            { $ifNull: ['$$v1', null] },
                          ],
                        },
                        { $in: [{ $type: '$note' }, ['null', 'missing']] },
                        { $eq: ['$status', '@open'] },
                      ],
                    },
                  },
                },
                { $limit: 1 },
              ],
              as: '__exists_0',
            },
          },
          { $match: { __exists_0: { $ne: [] } } },
          { $unset: ['__exists_0'] },
          { $project: { id: 1, _id: 0 } },
        ],
      },
    },
  },
  {
    name: '$nexists filter on DELETE throws (deleteMany takes no pipeline)',
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
          { $project: { id: 1, name: 1, _id: 0 } },
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
            $group: {
              _id: { userId: '$userId' },
              total: { $sum: '$amount' },
              __sum_total: { $max: '$amount' },
            },
          },
          {
            $addFields: {
              total: {
                $cond: [{ $gt: ['$__sum_total', null] }, '$total', null],
              },
              userId: '$_id.userId',
            },
          },
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
          { $project: { a: 1, total: 1, _id: 0 } },
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
              pipeline: [{ $match: { id: { $ne: null } } }],
              as: 'Author',
            },
          },
          {
            $unwind: { path: '$Author', preserveNullAndEmptyArrays: true },
          },
          {
            $match: {
              $expr: {
                $and: [
                  { $gt: ['$createdAt', '$Author.joinedAt'] },
                  { $gt: ['$createdAt', null] },
                  { $gt: ['$Author.joinedAt', null] },
                ],
              },
            },
          },
          { $project: { id: 1, _id: 0 } },
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
    // A view over a join reads a joined column as one value per row,
    // under the key SQL gives it.
    name: 'CREATE_VIEW over a join projects each joined column as a value',
    method: 'createView',
    query: {
      type: 'CREATE_VIEW',
      view: 'tags_of_posts',
      query: {
        type: 'SELECT',
        table: 'post_tags',
        columns: ['postId', 'tagId'],
        joins: {
          T: {
            table: 'tags',
            columns: ['id', 'name'],
            type: 'INNER',
            on: { '@T.@id': '@tagId' },
          },
        },
        projection: { '@postId': true, '@T.@name': 'name' },
      },
    },
    expected: {
      sql: 'createView',
      params: {
        view: 'tags_of_posts',
        viewOn: 'post_tags',
        pipeline: [
          {
            $lookup: {
              from: 'tags',
              localField: 'tagId',
              foreignField: 'id',
              pipeline: [{ $match: { id: { $ne: null } } }],
              as: 'T',
            },
          },
          { $unwind: '$T' },
          {
            $project: {
              postId: 1,
              name: { $ifNull: ['$T.name', null] },
              _id: 0,
            },
          },
        ],
      },
    },
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
          { $sort: { name: 1 } },
          { $project: { id: 1, name: 1, _id: 0 } },
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
            { $sort: { name: 1 } },
            { $project: { id: 1, name: 1, _id: 0 } },
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

describe('oql.translator.MongoTranslator — $exists refusals', () => {
  const orders = { table: 'orders', on: { '@userId': '@id' } };

  it('names where the node runs when an UPDATE filter carries it', () => {
    const err = asserts.assertThrows(
      () =>
        t.update({
          type: 'UPDATE',
          table: 'users',
          columns: ['id', 'role'],
          data: { role: 'member' },
          where: { $exists: orders },
        } as unknown as Query<'UPDATE'>),
      DialectUnsupportedError,
    );
    asserts.assertStringIncludes(err.feature, 'outside a SELECT or COUNT');
  });
});

describe('oql.translator.MongoTranslator — expression alias where a column belongs', () => {
  // SQL resolves these to a column the table lacks and the database
  // fails; MongoDB would store or compare the text.
  const expressions = { u: { $$_expression: 'UPPER', args: '@name' } };
  const refuses = (run: () => unknown) => {
    const err = asserts.assertThrows(run, OqlError, "'@u'");
    asserts.assertEquals(err.code, 'INVALID_COLUMN_REF');
  };
  const update = (q: Record<string, unknown>) => () =>
    t.update({
      type: 'UPDATE',
      table: 'users',
      columns: ['id', 'name', 'nick'],
      expressions,
      data: { nick: 'x' },
      ...q,
    } as unknown as Query<'UPDATE'>);

  it('in UPDATE data', () => {
    refuses(update({
      data: { nick: { $$_expression: 'CONCAT', args: ['@u', '!'] } },
    }));
  });

  it('not as an UPDATE filter value, which compares the expression', () => {
    const upper = {
      $cond: [{ $gt: ['$name', null] }, { $toUpper: '$name' }, null],
    };
    asserts.assertEquals(
      update({ where: { '@name': { $ne: '@u' } } })().params.filter,
      {
        $expr: {
          $and: [
            { $ne: ['$name', upper] },
            { $gt: ['$name', null] },
            { $gt: [upper, null] },
          ],
        },
      },
    );
  });

  it('in an expression a filter key names', () => {
    refuses(update({
      expressions: {
        ...expressions,
        v: { $$_expression: 'LOWER', args: '@u' },
      },
      where: { '@v': 'ada' },
    }));
  });

  it('in a DELETE filter operand', () => {
    refuses(() =>
      t.delete({
        type: 'DELETE',
        table: 'users',
        columns: ['id', 'name', 'nick'],
        expressions,
        where: {
          '@name': {
            $ne: { $$_expression: 'COALESCE', args: ['@nick', '@u'] },
          },
        },
      } as unknown as Query<'DELETE'>)
    );
  });
});

describe('oql.translator.MongoTranslator — DATE_TRUNC unit', () => {
  it('refuses a unit outside DAYS / MONTHS / YEARS in a filter operand', () => {
    // A filter operand skips the asserts layer, so this is the translator's
    // own check.
    const err = asserts.assertThrows(
      () =>
        t.select({
          type: 'SELECT',
          table: 'orders',
          columns: ['id', 'at'],
          projection: { '@id': true },
          where: {
            '@id': {
              $like: {
                $$_expression: 'DATE_TRUNC',
                args: { date: '@at', unit: 'HOURS' },
              },
            },
          },
        } as unknown as Query<'SELECT'>),
      OqlError,
    );
    asserts.assertEquals((err as OqlError).code, 'INVALID_TIME_UNIT');
  });
});

describe('oql.translator.MongoTranslator — CASE condition on a NULL input', () => {
  // BSON orders null and missing below every value and holds them equal,
  // so each comparison carries a `$gt: [x, null]` guard per nullable input.
  const present = (operand: unknown) => ({ $gt: [operand, null] });
  const sign = {
    $$_expression: 'CASE',
    args: { cases: [{ when: { '@a': { $lt: 0 } }, then: -1 }], else: 0 },
  };
  const signSwitch = {
    $switch: {
      branches: [{
        case: { $and: [{ $lt: ['$a', 0] }, present('$a')] },
        then: -1,
      }],
      default: 0,
    },
  };
  const pipelineOf = (query: unknown) =>
    (t.select(query as Query<'SELECT'>) as MongoAggregateAction).params
      .pipeline;
  /** The stage a one-branch CASE on `when` is translated to. */
  const stageOf = (when: unknown): unknown =>
    pipelineOf({
      type: 'SELECT',
      table: 'rows',
      columns: ['a', 'b'],
      expressions: {
        c: { $$_expression: 'CASE', args: { cases: [{ when, then: 1 }] } },
      },
      projection: { '@c': 'c' },
    })[0];
  const LOWER_B = {
    $cond: [{ $gt: ['$b', null] }, { $toLower: '$b' }, null],
  };
  const switchOn = (condition: unknown) => ({
    $addFields: {
      c: {
        $switch: { branches: [{ case: condition, then: 1 }], default: null },
      },
    },
  });

  for (const op of ['$eq', '$ne', '$gt', '$gte', '$lt', '$lte']) {
    it(`guards the field of ${op} against a literal`, () => {
      asserts.assertEquals(
        stageOf({ '@a': { [op]: 6 } }),
        switchOn({ $and: [{ [op]: ['$a', 6] }, present('$a')] }),
      );
    });
  }

  const CONDITIONS: Array<{ name: string; when: unknown; expected: unknown }> =
    [
      {
        name: 'guards a direct value as $eq',
        when: { '@a': 6 },
        expected: { $and: [{ $eq: ['$a', 6] }, present('$a')] },
      },
      {
        name: 'guards both sides of a column comparison',
        when: { '@a': { $ne: '@b' } },
        expected: {
          $and: [{ $ne: ['$a', '$b'] }, present('$a'), present('$b')],
        },
      },
      {
        name: 'reads an operand naming no column as text, unguarded',
        when: { '@a': { $ne: '@nope' } },
        expected: { $and: [{ $ne: ['$a', '@nope'] }, present('$a')] },
      },
      {
        name: 'guards an expression operand',
        when: { '@a': { $lt: { $$_expression: 'ADD', args: ['@b', 1] } } },
        expected: {
          $and: [
            { $lt: ['$a', { $add: ['$b', 1] }] },
            present('$a'),
            present({ $add: ['$b', 1] }),
          ],
        },
      },
      {
        name: 'guards the field of $in',
        when: { '@a': { $in: [1, 2] } },
        expected: { $and: [{ $in: ['$a', [1, 2]] }, present('$a')] },
      },
      {
        name: 'reads a direct list as $in',
        when: { '@a': [1, 2] },
        expected: { $and: [{ $in: ['$a', [1, 2]] }, present('$a')] },
      },
      {
        name: 'reads a list entry naming no column as text',
        when: { '@a': ['@b', '@nope'] },
        expected: { $and: [{ $in: ['$a', ['$b', '@nope']] }, present('$a')] },
      },
      {
        name: 'guards the field of $nin',
        when: { '@a': { $nin: [1, 2] } },
        expected: {
          $and: [{ $not: [{ $in: ['$a', [1, 2]] }] }, present('$a')],
        },
      },
      {
        name: 'guards the field and a column bound of $between',
        when: { '@a': { $between: ['@b', 9] } },
        expected: {
          $and: [
            { $and: [{ $gte: ['$a', '$b'] }, { $lte: ['$a', 9] }] },
            present('$a'),
            present('$b'),
          ],
        },
      },
      {
        name: 'matches $ilike with the i option',
        when: { '@a': { $ilike: 'x_' } },
        expected: {
          $regexMatch: { input: '$a', regex: '^x.$', options: 'i' },
        },
      },
      {
        name: 'guards the field of $nlike',
        when: { '@a': { $nlike: 'x%' } },
        expected: {
          $and: [
            { $not: [{ $regexMatch: { input: '$a', regex: '^x.*$' } }] },
            present('$a'),
          ],
        },
      },
      {
        name: 'guards the field of $nilike',
        when: { '@a': { $nilike: 'x%' } },
        expected: {
          $and: [
            {
              $not: [{
                $regexMatch: { input: '$a', regex: '^x.*$', options: 'i' },
              }],
            },
            present('$a'),
          ],
        },
      },
      {
        name: 'escapes the literal of $startsWith, $endsWith and $contains',
        when: {
          $and: [
            { '@a': { $startsWith: 'a.b' } },
            { '@a': { $endsWith: 'a.b' } },
            { '@a': { $contains: 'a.b' } },
          ],
        },
        expected: {
          $and: [
            { $regexMatch: { input: '$a', regex: '^a\\.b' } },
            { $regexMatch: { input: '$a', regex: 'a\\.b$' } },
            { $regexMatch: { input: '$a', regex: 'a\\.b' } },
          ],
        },
      },
      {
        name: 'searches for a computed $contains operand as a literal',
        when: { '@a': { $contains: { $$_expression: 'LOWER', args: '@b' } } },
        expected: {
          $cond: [
            { $gt: [LOWER_B, null] },
            { $gte: [{ $indexOfCP: ['$a', LOWER_B] }, 0] },
            false,
          ],
        },
      },
      {
        name: 'reads a direct null as IS NULL, true for a missing field too',
        when: { '@a': null },
        expected: { $in: [{ $type: '$a' }, ['null', 'missing']] },
      },
      {
        name: 'guards each comparison nested under $or and $and',
        when: {
          $or: [{ '@a': { $lt: 0 } }, {
            $and: [{ '@a': 1 }, { '@b': { $ne: 2 } }],
          }],
        },
        expected: {
          $or: [
            { $and: [{ $lt: ['$a', 0] }, present('$a')] },
            {
              $and: [
                { $and: [{ $eq: ['$a', 1] }, present('$a')] },
                { $and: [{ $ne: ['$b', 2] }, present('$b')] },
              ],
            },
          ],
        },
      },
    ];
  for (const c of CONDITIONS) {
    it(c.name, () => {
      asserts.assertEquals(stageOf(c.when), switchOn(c.expected));
    });
  }

  // A column as the pattern matches as in the filter path.
  it('matches a column as the pattern of $like', () => {
    asserts.assertEquals(
      stageOf({ '@a': { $like: '@b' } }),
      switchOn({
        $cond: [
          present('$b'),
          { $regexMatch: { input: '$a', regex: likeRegex('$b') } },
          false,
        ],
      }),
    );
  });

  it('guards a CASE stored by UPDATE', () => {
    const out = t.update({
      type: 'UPDATE',
      table: 'rows',
      columns: ['a', 'b'],
      data: { b: sign },
    } as unknown as Query<'UPDATE'>);
    asserts.assertEquals(out.params.data, [{ $set: { b: signSwitch } }]);
  });

  it('guards a CASE whose result is filtered', () => {
    const pipeline = pipelineOf({
      type: 'SELECT',
      table: 'rows',
      columns: ['a', 'b'],
      expressions: { c: sign },
      projection: { '@a': true },
      where: { '@c': -1 },
    });
    asserts.assertEquals(pipeline.slice(0, 2), [
      { $addFields: { c: signSwitch } },
      { $match: { c: -1 } },
    ]);
  });
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
    asserts.assertEquals(stages, ['$match', '$sort', '$project', '$limit']);
    // The projection is preserved — `ssn` (deliberately projected away) is
    // NOT exposed by the view.
    asserts.assertEquals(pipeline[2], { $project: { id: 1, name: 1, _id: 0 } });
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
    asserts.assertEquals(stages, ['$match', '$sort', '$project', '$limit']);
    asserts.assertEquals(pipeline[2], { $project: { id: 1, name: 1, _id: 0 } });
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

describe('oql.translator.MongoTranslator — JSON path filters', () => {
  it('rejects $gt on a JSON path at the asserts layer', () => {
    // Extraction-type divergence is a SQL problem, but the restricted
    // operator set applies uniformly so the same OQL query is accepted
    // or rejected on every dialect. `select()` asserts first, so the
    // TypeError surfaces before Mongo's own translate-time guard.
    const q = {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'profile'],
      projection: { '@id': true },
      where: { '@profile.@age': { $gt: 5 } },
    };
    asserts.assertThrows(
      // deno-lint-ignore no-explicit-any
      () => t.select(q as any),
      TypeError,
      "Operator '$gt' is not supported on JSON path '@profile.@age'",
    );
  });
});

describe('oql.translator.MongoTranslator — insert expressions', () => {
  const t = new MongoTranslator();
  const insert = (data: Record<string, unknown> | Record<string, unknown>[]) =>
    t.insert({
      type: 'INSERT',
      table: 'logs',
      columns: ['id', 'at', 'secs', 'ms', 'day', 'ref'],
      data,
    } as Query<'INSERT'>).params.data;

  it('computes clock expressions at one instant per statement', () => {
    const before = Date.now();
    const rows = insert([
      { id: 1, at: { $$_expression: 'NOW' } },
      {
        id: 2,
        at: { $$_expression: 'CURRENT_TIMESTAMP' },
        secs: { $$_expression: 'UNIX_TIMESTAMP' },
        ms: { $$_expression: 'UNIX_TIMESTAMP', unit: 'milliseconds' },
        day: { $$_expression: 'CURRENT_DATE' },
      },
    ]) as Record<string, unknown>[];
    const at = rows[0]!.at as Date;
    asserts.assertInstanceOf(at, Date);
    asserts.assert(at.getTime() >= before && at.getTime() <= Date.now());
    asserts.assertEquals(rows[1]!.at, at, 'the same instant');
    asserts.assertEquals(rows[1]!.ms, at.getTime());
    asserts.assertEquals(rows[1]!.secs, Math.floor(at.getTime() / 1000));
    asserts.assertEquals(
      (rows[1]!.day as Date).toISOString(),
      at.toISOString().slice(0, 10) + 'T00:00:00.000Z',
    );
  });

  it('computes CURRENT_TIME as the UTC clock string, not a Date', () => {
    const row = insert({
      id: 1,
      at: { $$_expression: 'NOW' },
      ref: { $$_expression: 'CURRENT_TIME' },
    }) as Record<string, unknown>;
    asserts.assertEquals(
      row.ref,
      (row.at as Date).toISOString().slice(11, 19),
    );
  });

  it('refuses an expression an insert document cannot evaluate', () => {
    asserts.assertThrows(
      () => insert({ id: 1, ref: { $$_expression: 'UPPER', args: 'x' } }),
      DialectUnsupportedError,
      "'UPPER'",
    );
  });
});
