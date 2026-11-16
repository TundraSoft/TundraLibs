/**
 * The engine-agnostic live suite for the queries oql builds: date,
 * conditional, NULL-aware, numeric and pattern nodes, aggregates, joins and
 * `$exists`. Two fixed tables and one case table;
 * every engine must return the SAME rows for every case, read back from a
 * real database. A golden string in oql proves what the translator emits,
 * not what the database does with it.
 *
 * Each engine gets a thin `live-<engine>.test.ts` that hands
 * {@linkcode runLiveSuite} an engine. A new case goes in {@linkcode CASES}
 * once and runs everywhere.
 *
 * @module
 */

import { afterAll, beforeAll, describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import type { Query } from '@tundralibs/oql/types';
import type { EngineQueryResult } from '../types/mod.ts';
import { liveAvailable, unreachableReason } from './liveAvailable.ts';

/** The engines the suite runs on. */
export type LiveEngineName = 'postgres' | 'maria' | 'mongo' | 'sqlite';

/** The slice of an engine the suite drives. */
export type LiveEngine = {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  ping(): Promise<boolean>;
  createTable(q: Query<'CREATE_TABLE'>): Promise<unknown>;
  insert(q: Query<'INSERT'>): Promise<unknown>;
  select(q: Query<'SELECT'>): Promise<EngineQueryResult>;
  update(q: Query<'UPDATE'>): Promise<unknown>;
  delete(q: Query<'DELETE'>): Promise<unknown>;
  dropTable(q: Query<'DROP_TABLE'>): Promise<unknown>;
};

type Row = Record<string, unknown>;

type Case = {
  name: string;
  /** Every alias here is projected next to `id`. */
  expressions?: Record<string, unknown>;
  where?: Row;
  /**
   * A whole SELECT body in place of `expressions` and `where`, run on
   * {@linkcode TABLE} unless it names its own table. Every key of each
   * returned row is compared.
   */
  query?: Row;
  /** Rows in `id` order. A timestamp is its ISO 8601 UTC text. */
  expected: Row[];
  /** Compare a 64-bit integer as it arrives, not as a number. */
  exactNumbers?: true;
};

const TABLE = `oql_expressions_live_${Date.now()}`;
const COLUMNS = [
  'id',
  'name',
  'nick',
  'status',
  'qty',
  'day',
  'due',
  'at',
  'done',
];
const utc = (iso: string) => new Date(`${iso}Z`);

// The second table, joined to TABLE on `owner`. Codes and parts hold the
// LIKE wildcards and a trailing backslash. Row 4 has no owner and leaves
// `part` out of its insert, so MongoDB stores no field for it.
const ITEMS = `${TABLE}_items`;
const ITEM_COLUMNS = ['id', 'owner', 'amount', 'code', 'part'];
const ITEM_ROWS: Record<string, string | number | null>[] = [
  { id: 1, owner: 1, amount: 2.5, code: '10%', part: '0%' },
  { id: 2, owner: 1, amount: 2.5, code: '100', part: '0%' },
  { id: 3, owner: 2, amount: 4, code: 'C:\\', part: ':\\' },
  { id: 4, owner: null, amount: 7, code: 'a_b' },
];
const JOIN_ITEMS = {
  I: {
    table: ITEMS,
    columns: ITEM_COLUMNS,
    on: { '@I.@owner': '@id' },
  },
};

// Row 2 starts on 29 February and row 4 on 31 December, so adding a month
// or a year has a day to clamp. Row 3 is NULL in every column.
const ROWS = [
  {
    id: 1,
    name: 'Ada',
    nick: 'ace',
    status: 'ACTIVE',
    qty: 5,
    day: utc('2024-01-31T00:00:00'),
    due: utc('2024-03-01T00:00:00'),
    at: utc('2024-01-31T10:15:30'),
    done: utc('2024-03-02T12:45:50'),
  },
  {
    id: 2,
    name: 'bob',
    nick: null,
    status: 'CLOSED',
    qty: 0,
    day: utc('2024-02-29T00:00:00'),
    due: utc('2025-03-01T00:00:00'),
    at: utc('2024-02-29T23:30:00'),
    done: utc('2025-02-28T23:29:59'),
  },
  {
    id: 3,
    name: null,
    nick: null,
    status: null,
    qty: null,
    day: null,
    due: null,
    at: null,
    done: null,
  },
  {
    id: 4,
    name: 'Cy',
    nick: '',
    status: 'ACTIVE',
    qty: null,
    day: utc('2023-12-31T00:00:00'),
    due: utc('2023-12-31T00:00:00'),
    at: utc('2023-12-31T00:00:00'),
    done: utc('2023-12-30T23:00:00'),
  },
];

const UNITS = ['SECONDS', 'MINUTES', 'HOURS', 'DAYS', 'MONTHS', 'YEARS'];

/** DATE_DIFF from one column to another, once per unit, aliased by unit. */
const diffPerUnit = (from: string, to: string) =>
  Object.fromEntries(
    UNITS.map((unit) => [unit, {
      $$_expression: 'DATE_DIFF',
      args: { from, to, unit },
    }]),
  );

const dateAdd = (amount: number, unit: string) => ({
  $$_expression: 'DATE_ADD',
  args: { date: '@at', amount, unit },
});

const dateTrunc = (unit: string) => ({
  $$_expression: 'DATE_TRUNC',
  args: { date: '@at', unit },
});

const NULL_UNITS = {
  SECONDS: null,
  MINUTES: null,
  HOURS: null,
  DAYS: null,
  MONTHS: null,
  YEARS: null,
};

const CASES: Case[] = [
  {
    name: 'DATE_DIFF counts complete units between two timestamps',
    expressions: diffPerUnit('@at', '@done'),
    expected: [
      {
        id: 1,
        SECONDS: 2687420,
        MINUTES: 44790,
        HOURS: 746,
        DAYS: 31,
        MONTHS: 1,
        YEARS: 0,
      },
      // One second short of a year.
      {
        id: 2,
        SECONDS: 31535999,
        MINUTES: 525599,
        HOURS: 8759,
        DAYS: 364,
        MONTHS: 11,
        YEARS: 0,
      },
      { id: 3, ...NULL_UNITS },
      // `to` is an hour before `from`.
      {
        id: 4,
        SECONDS: -3600,
        MINUTES: -60,
        HOURS: -1,
        DAYS: 0,
        MONTHS: 0,
        YEARS: 0,
      },
    ],
  },
  {
    name: 'DATE_DIFF between two DATE columns',
    expressions: diffPerUnit('@day', '@due'),
    expected: [
      {
        id: 1,
        SECONDS: 2592000,
        MINUTES: 43200,
        HOURS: 720,
        DAYS: 30,
        MONTHS: 1,
        YEARS: 0,
      },
      {
        id: 2,
        SECONDS: 31622400,
        MINUTES: 527040,
        HOURS: 8784,
        DAYS: 366,
        MONTHS: 12,
        YEARS: 1,
      },
      { id: 3, ...NULL_UNITS },
      { id: 4, SECONDS: 0, MINUTES: 0, HOURS: 0, DAYS: 0, MONTHS: 0, YEARS: 0 },
    ],
  },
  {
    name: 'DATE_DIFF is a JavaScript number',
    expressions: {
      days: {
        $$_expression: 'DATE_DIFF',
        args: { from: '@at', to: '@done', unit: 'DAYS' },
      },
    },
    exactNumbers: true,
    expected: [
      { id: 1, days: 31 },
      { id: 2, days: 364 },
      { id: 3, days: null },
      { id: 4, days: 0 },
    ],
  },
  {
    name: 'MODULO and ROUND with a precision over DATE_DIFF',
    expressions: {
      weekday: {
        $$_expression: 'MODULO',
        args: [{
          $$_expression: 'ADD',
          args: [{
            $$_expression: 'DATE_DIFF',
            args: { from: '@at', to: '@done', unit: 'DAYS' },
          }, 1],
        }, 7],
      },
      took: {
        $$_expression: 'ROUND',
        args: [{
          $$_expression: 'DATE_DIFF',
          args: { from: '@at', to: '@done', unit: 'DAYS' },
        }, 1],
      },
    },
    exactNumbers: true,
    expected: [
      { id: 1, weekday: 4, took: 31 },
      { id: 2, weekday: 1, took: 364 },
      { id: 3, weekday: null, took: null },
      { id: 4, weekday: 1, took: 0 },
    ],
  },
  {
    name: 'DIVIDE and MODULO keep the fraction and fold left to right',
    expressions: {
      third: { $$_expression: 'DIVIDE', args: ['@qty', 3] },
      tenth: { $$_expression: 'DIVIDE', args: ['@qty', 2, 5] },
      rest: {
        $$_expression: 'MODULO',
        args: [{ $$_expression: 'DIVIDE', args: ['@qty', 2] }, 2],
      },
      restTwice: { $$_expression: 'MODULO', args: ['@qty', 4, 3] },
      rounded: {
        $$_expression: 'ROUND',
        args: [{ $$_expression: 'DIVIDE', args: ['@qty', 3] }, 2],
      },
    },
    expected: [
      {
        id: 1,
        third: 1.6666666666666667,
        tenth: 0.5,
        rest: 0.5,
        restTwice: 1,
        rounded: 1.67,
      },
      { id: 2, third: 0, tenth: 0, rest: 0, restTwice: 0, rounded: 0 },
      {
        id: 3,
        third: null,
        tenth: null,
        rest: null,
        restTwice: null,
        rounded: null,
      },
      {
        id: 4,
        third: null,
        tenth: null,
        rest: null,
        restTwice: null,
        rounded: null,
      },
    ],
  },
  {
    name: 'arithmetic over COALESCE',
    expressions: {
      next: {
        $$_expression: 'ADD',
        args: [{ $$_expression: 'COALESCE', args: ['@qty', 0] }, 1],
      },
    },
    expected: [
      { id: 1, next: 6 },
      { id: 2, next: 1 },
      { id: 3, next: 1 },
      { id: 4, next: 1 },
    ],
  },
  {
    name: 'DATE_ADD in each unit, clamping to the end of a shorter month',
    expressions: {
      month: dateAdd(1, 'MONTHS'),
      monthBack: dateAdd(-1, 'MONTHS'),
      year: dateAdd(1, 'YEARS'),
      day: dateAdd(1, 'DAYS'),
      hourBack: dateAdd(-1, 'HOURS'),
      minutes: dateAdd(45, 'MINUTES'),
      seconds: dateAdd(30, 'SECONDS'),
    },
    expected: [
      {
        id: 1,
        month: '2024-02-29T10:15:30.000Z',
        monthBack: '2023-12-31T10:15:30.000Z',
        year: '2025-01-31T10:15:30.000Z',
        day: '2024-02-01T10:15:30.000Z',
        hourBack: '2024-01-31T09:15:30.000Z',
        minutes: '2024-01-31T11:00:30.000Z',
        seconds: '2024-01-31T10:16:00.000Z',
      },
      {
        id: 2,
        month: '2024-03-29T23:30:00.000Z',
        monthBack: '2024-01-29T23:30:00.000Z',
        year: '2025-02-28T23:30:00.000Z',
        day: '2024-03-01T23:30:00.000Z',
        hourBack: '2024-02-29T22:30:00.000Z',
        minutes: '2024-03-01T00:15:00.000Z',
        seconds: '2024-02-29T23:30:30.000Z',
      },
      {
        id: 3,
        month: null,
        monthBack: null,
        year: null,
        day: null,
        hourBack: null,
        minutes: null,
        seconds: null,
      },
      {
        id: 4,
        month: '2024-01-31T00:00:00.000Z',
        monthBack: '2023-11-30T00:00:00.000Z',
        year: '2024-12-31T00:00:00.000Z',
        day: '2024-01-01T00:00:00.000Z',
        hourBack: '2023-12-30T23:00:00.000Z',
        minutes: '2023-12-31T00:45:00.000Z',
        seconds: '2023-12-31T00:00:30.000Z',
      },
    ],
  },
  {
    name: 'DATE_ADD on a Date value is a Date',
    expressions: {
      next: {
        $$_expression: 'DATE_ADD',
        args: { date: utc('2024-01-31T10:15:30'), amount: 1, unit: 'MONTHS' },
      },
    },
    where: { '@id': 1 },
    expected: [{ id: 1, next: '2024-02-29T10:15:30.000Z' }],
  },
  {
    name: 'DATE_TRUNC to the start of the day, month and year',
    expressions: {
      day: dateTrunc('DAYS'),
      month: dateTrunc('MONTHS'),
      year: dateTrunc('YEARS'),
    },
    expected: [
      {
        id: 1,
        day: '2024-01-31T00:00:00.000Z',
        month: '2024-01-01T00:00:00.000Z',
        year: '2024-01-01T00:00:00.000Z',
      },
      {
        id: 2,
        day: '2024-02-29T00:00:00.000Z',
        month: '2024-02-01T00:00:00.000Z',
        year: '2024-01-01T00:00:00.000Z',
      },
      { id: 3, day: null, month: null, year: null },
      {
        id: 4,
        day: '2023-12-31T00:00:00.000Z',
        month: '2023-12-01T00:00:00.000Z',
        year: '2023-01-01T00:00:00.000Z',
      },
    ],
  },
  {
    name: 'COALESCE, NULLIF and CASE',
    expressions: {
      label: { $$_expression: 'COALESCE', args: ['@nick', '@name', 'anon'] },
      nick: { $$_expression: 'NULLIF', args: ['@nick', ''] },
      stock: {
        $$_expression: 'CASE',
        args: {
          cases: [
            { when: { '@qty': { $gte: 1 } }, then: 'some' },
            { when: { '@qty': { $null: true } }, then: null },
          ],
          else: 'none',
        },
      },
    },
    expected: [
      { id: 1, label: 'ace', nick: 'ace', stock: 'some' },
      { id: 2, label: 'bob', nick: null, stock: 'none' },
      { id: 3, label: 'anon', nick: null, stock: null },
      // An empty string is a value: COALESCE keeps it, NULLIF removes it.
      { id: 4, label: '', nick: null, stock: null },
    ],
  },
  {
    name: 'CASE does not take a comparison branch on a NULL input',
    expressions: {
      stock: {
        $$_expression: 'CASE',
        args: {
          cases: [{ when: { '@qty': { $lt: 1 } }, then: 'none' }],
          else: 'some',
        },
      },
    },
    expected: [
      { id: 1, stock: 'some' },
      { id: 2, stock: 'none' },
      { id: 3, stock: 'some' },
      { id: 4, stock: 'some' },
    ],
  },
  {
    name: 'CASE reads a list as IN and takes the pattern operators',
    expressions: {
      closed: {
        $$_expression: 'CASE',
        args: {
          cases: [{ when: { '@status': ['CLOSED', 'GONE'] }, then: 'yes' }],
          else: 'no',
        },
      },
      initial: {
        $$_expression: 'CASE',
        args: {
          cases: [
            { when: { '@name': { $like: 'A%' } }, then: 'A' },
            { when: { '@name': { $nlike: 'A%' } }, then: 'other' },
          ],
          else: 'none',
        },
      },
    },
    expected: [
      { id: 1, closed: 'no', initial: 'A' },
      { id: 2, closed: 'yes', initial: 'other' },
      { id: 3, closed: 'no', initial: 'none' },
      { id: 4, closed: 'no', initial: 'other' },
    ],
  },
  {
    name: 'UPPER and LOWER of NULL are NULL',
    expressions: {
      upper: { $$_expression: 'UPPER', args: '@name' },
      lower: { $$_expression: 'LOWER', args: '@name' },
    },
    expected: [
      { id: 1, upper: 'ADA', lower: 'ada' },
      { id: 2, upper: 'BOB', lower: 'bob' },
      { id: 3, upper: null, lower: null },
      { id: 4, upper: 'CY', lower: 'cy' },
    ],
  },
  {
    name: 'SUBSTR without a length runs to the end of the string',
    expressions: {
      rest: { $$_expression: 'SUBSTR', args: { string: '@name', start: 2 } },
    },
    expected: [
      { id: 1, rest: 'da' },
      { id: 2, rest: 'ob' },
      { id: 3, rest: null },
      { id: 4, rest: 'y' },
    ],
  },
  {
    name: '$ne leaves out the NULL row',
    where: { '@status': { $ne: 'ACTIVE' } },
    expected: [{ id: 2 }],
  },
  {
    name: '$nin leaves out the NULL row',
    where: { '@status': { $nin: ['ACTIVE'] } },
    expected: [{ id: 2 }],
  },
  {
    name: '$ne on an expression leaves out the NULL row',
    expressions: { upper: { $$_expression: 'UPPER', args: '@name' } },
    where: { '@upper': { $ne: 'ADA' } },
    expected: [{ id: 2, upper: 'BOB' }, { id: 4, upper: 'CY' }],
  },
  {
    name: '$nilike leaves out the NULL row',
    where: { '@name': { $nilike: 'a%' } },
    expected: [{ id: 2 }, { id: 4 }],
  },
  {
    name: '$nlike and $nilike on one column both apply',
    where: { '@name': { $nlike: '%o%', $nilike: 'c%' } },
    expected: [{ id: 1 }],
  },
  {
    name: '$gte and $between on one column both apply',
    where: { '@id': { $gte: 2, $between: [1, 3] } },
    expected: [{ id: 2 }, { id: 3 }],
  },
  {
    name: '$startsWith and $endsWith on one column both apply',
    where: { '@status': { $startsWith: 'A', $endsWith: 'D' } },
    expected: [],
  },
  {
    name: 'a computed $endsWith operand that is empty does not match NULL',
    where: {
      '@name': {
        $endsWith: { $$_expression: 'COALESCE', args: ['@nick', ''] },
      },
    },
    expected: [{ id: 2 }, { id: 4 }],
  },
  {
    name: 'a string literal starting with $ stays text',
    expressions: {
      label: { $$_expression: 'COALESCE', args: ['@nick', '$name'] },
      root: {
        $$_expression: 'CASE',
        args: {
          cases: [{ when: { '@id': 1 }, then: '$$ROOT' }],
          else: '$status',
        },
      },
    },
    expected: [
      { id: 1, label: 'ace', root: '$$ROOT' },
      { id: 2, label: '$name', root: '$status' },
      { id: 3, label: '$name', root: '$status' },
      { id: 4, label: '', root: '$status' },
    ],
  },
  {
    name: 'an @ string that names no column stays text',
    expressions: {
      label: { $$_expression: 'COALESCE', args: ['@nick', '@nope'] },
      path: { $$_expression: 'COALESCE', args: ['@nick', '@name.@first'] },
    },
    expected: [
      { id: 1, label: 'ace', path: 'ace' },
      { id: 2, label: '@nope', path: '@name.@first' },
      { id: 3, label: '@nope', path: '@name.@first' },
      { id: 4, label: '', path: '' },
    ],
  },
  {
    name: 'a computed $contains operand is matched literally',
    query: {
      table: ITEMS,
      columns: ITEM_COLUMNS,
      projection: { '@id': 'id' },
      where: {
        '@code': { $contains: { $$_expression: 'UPPER', args: '@part' } },
      },
      orderBy: { '@id': 'ASC' },
    },
    expected: [{ id: 1 }, { id: 3 }],
  },
  {
    name: 'a projected expression over a missing field is null',
    query: {
      table: ITEMS,
      columns: ITEM_COLUMNS,
      expressions: {
        part: { $$_expression: 'NULLIF', args: ['@part', '0%'] },
      },
      projection: { '@id': 'id', '@part': 'part' },
      orderBy: { '@id': 'ASC' },
    },
    expected: [
      { id: 1, part: null },
      { id: 2, part: null },
      { id: 3, part: ':\\' },
      { id: 4, part: null },
    ],
  },
  {
    name:
      'COUNT is a number and distinct counts, sums and averages each value once',
    query: {
      table: ITEMS,
      columns: ITEM_COLUMNS,
      aggregates: {
        n: { $$_aggregate: 'COUNT' },
        amounts: { $$_aggregate: 'COUNT', column: '@amount', distinct: true },
        total: { $$_aggregate: 'SUM', column: '@amount' },
        distinctTotal: {
          $$_aggregate: 'SUM',
          column: '@amount',
          distinct: true,
        },
        distinctAvg: {
          $$_aggregate: 'AVG',
          column: '@amount',
          distinct: true,
        },
      },
      projection: {
        '@n': 'n',
        '@amounts': 'amounts',
        '@total': 'total',
        '@distinctTotal': 'distinctTotal',
        '@distinctAvg': 'distinctAvg',
      },
    },
    exactNumbers: true,
    expected: [{
      n: 4,
      amounts: 3,
      total: 16,
      distinctTotal: 13.5,
      distinctAvg: 4.5,
    }],
  },
  {
    name: 'aggregates over no rows give one row, COUNT 0 and the rest NULL',
    query: {
      table: ITEMS,
      columns: ITEM_COLUMNS,
      aggregates: {
        n: { $$_aggregate: 'COUNT' },
        total: { $$_aggregate: 'SUM', column: '@amount' },
        top: { $$_aggregate: 'MAX', column: '@amount' },
      },
      projection: { '@n': 'n', '@total': 'total', '@top': 'top' },
      where: { '@id': 99 },
    },
    expected: [{ n: 0, total: null, top: null }],
  },
  {
    name: 'SUM over a group with only NULL values is NULL',
    query: {
      aggregates: {
        total: { $$_aggregate: 'SUM', column: '@qty' },
        distinctTotal: { $$_aggregate: 'SUM', column: '@qty', distinct: true },
      },
      projection: {
        '@id': 'id',
        '@total': 'total',
        '@distinctTotal': 'distinctTotal',
      },
      where: { '@id': { $in: [2, 3] } },
      orderBy: { '@id': 'ASC' },
    },
    expected: [
      { id: 2, total: 0, distinctTotal: 0 },
      { id: 3, total: null, distinctTotal: null },
    ],
  },
  {
    name:
      'a join gives one row per joined row, ordered by unprojected joined columns',
    query: {
      joins: JOIN_ITEMS,
      projection: { '@id': 'id', '@I.@code': 'code' },
      orderBy: { '@I.@amount': 'DESC', '@I.@id': 'DESC' },
    },
    expected: [
      { id: 2, code: 'C:\\' },
      { id: 1, code: '100' },
      { id: 1, code: '10%' },
    ],
  },
  {
    name: 'a LEFT join keeps a row without a match, its joined columns NULL',
    query: {
      joins: { I: { ...JOIN_ITEMS.I, type: 'LEFT' } },
      projection: { '@id': 'id', '@I.@code': 'code' },
      orderBy: { '@id': 'ASC', '@I.@id': 'ASC' },
    },
    expected: [
      { id: 1, code: '10%' },
      { id: 1, code: '100' },
      { id: 2, code: 'C:\\' },
      { id: 3, code: null },
      { id: 4, code: null },
    ],
  },
  {
    name: 'a filter on a joined column tests each joined row',
    query: {
      joins: JOIN_ITEMS,
      projection: { '@id': 'id', '@I.@code': 'code' },
      where: { '@I.@code': '100' },
    },
    expected: [{ id: 1, code: '100' }],
  },
  {
    name: 'GROUP BY a projected joined column',
    query: {
      joins: JOIN_ITEMS,
      aggregates: { n: { $$_aggregate: 'COUNT' } },
      projection: { '@I.@amount': 'amount', '@n': 'n' },
      orderBy: { '@I.@amount': 'ASC' },
    },
    expected: [{ amount: 2.5, n: 2 }, { amount: 4, n: 1 }],
  },
  {
    name: 'a grouped query orders by the largest joined value for DESC',
    query: {
      joins: JOIN_ITEMS,
      aggregates: { n: { $$_aggregate: 'COUNT' } },
      projection: { '@status': 'status', '@n': 'n' },
      orderBy: { '@I.@amount': 'DESC' },
    },
    expected: [{ status: 'CLOSED', n: 1 }, { status: 'ACTIVE', n: 2 }],
  },
  {
    name: '$exists tests the rows of another table',
    where: {
      $exists: {
        table: ITEMS,
        on: { '@owner': '@id' },
        where: { '@amount': { $gt: 3 } },
      },
    },
    expected: [{ id: 2 }],
  },
  {
    name: '$nexists keeps the rows another table has no match for',
    where: { $nexists: { table: ITEMS, on: { '@owner': '@id' } } },
    expected: [{ id: 3 }, { id: 4 }],
  },
  {
    name: '$exists does not match a NULL key',
    where: { $exists: { table: ITEMS, on: { '@owner': '@qty' } } },
    expected: [],
  },
  {
    name: '$exists matches a NULL key when it is nullSafe',
    where: {
      $exists: {
        table: ITEMS,
        on: { '@owner': '@qty' },
        nullSafe: ['@owner'],
      },
    },
    expected: [{ id: 3 }, { id: 4 }],
  },
];

/** A Date as its ISO text, and a bigint as a number unless `exactNumbers`. */
function plain(value: unknown, c: Case): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint' && !c.exactNumbers) return Number(value);
  return value;
}

/**
 * Register the suite for one engine. Skipped when the engine `create`
 * returns cannot be reached; with `LIVE_DB_REQUIRED=true` that also fails
 * the run. `cleanup` runs after the engine disconnects.
 */
export async function runLiveSuite(
  name: LiveEngineName,
  create: () => LiveEngine,
  cleanup?: () => Promise<void>,
): Promise<void> {
  const down = await unreachableReason(create());
  // SQLite runs in-process: there is no service to require.
  const available = name === 'sqlite'
    ? down === ''
    : liveAvailable(name, down === '', down);

  async function rows(engine: LiveEngine, c: Case): Promise<Row[]> {
    if (c.query) {
      const result = await engine.select({
        type: 'SELECT',
        table: TABLE,
        columns: COLUMNS,
        ...c.query,
      } as unknown as Query<'SELECT'>);
      return result.data.map((row) =>
        Object.fromEntries(
          Object.entries(row).map(([key, value]) => [key, plain(value, c)]),
        )
      );
    }
    const aliases = Object.keys(c.expressions ?? {});
    const result = await engine.select({
      type: 'SELECT',
      table: TABLE,
      columns: COLUMNS,
      expressions: c.expressions,
      projection: Object.fromEntries(
        ['id', ...aliases].map((alias) => [`@${alias}`, alias]),
      ),
      where: c.where,
      orderBy: { '@id': 'ASC' },
    } as unknown as Query<'SELECT'>);
    return result.data.map((row) =>
      Object.fromEntries(
        ['id', ...aliases].map((alias) => [alias, plain(row[alias], c)]),
      )
    );
  }

  describe({
    name: `drivers.live-${name}`,
    // The MongoDB client and the native SQLite binding hold resources Deno's
    // leak detector flags even though the engine releases them.
    sanitizeResources: false,
    sanitizeOps: false,
    fn: () => {
      if (!available) {
        it({
          name: `SKIPPED — ${name} unreachable: ${down}`,
          ignore: true,
          fn() {},
        });
        return;
      }

      let engine: LiveEngine;

      beforeAll(async () => {
        engine = create();
        await engine.connect();
        await engine.createTable({
          type: 'CREATE_TABLE',
          table: TABLE,
          columns: {
            id: { type: 'INTEGER', nullable: false },
            name: { type: 'VARCHAR', length: 50 },
            nick: { type: 'VARCHAR', length: 50 },
            status: { type: 'VARCHAR', length: 20 },
            qty: { type: 'INTEGER' },
            day: { type: 'DATE' },
            due: { type: 'DATE' },
            at: { type: 'TIMESTAMP' },
            done: { type: 'TIMESTAMP' },
          },
          primaryKey: ['id'],
        });
        await engine.insert({
          type: 'INSERT',
          table: TABLE,
          columns: COLUMNS,
          data: ROWS,
        });
        await engine.createTable({
          type: 'CREATE_TABLE',
          table: ITEMS,
          columns: {
            id: { type: 'INTEGER', nullable: false },
            owner: { type: 'INTEGER' },
            amount: { type: 'DOUBLE' },
            code: { type: 'VARCHAR', length: 20 },
            part: { type: 'VARCHAR', length: 20 },
          },
          primaryKey: ['id'],
        });
        await engine.insert({
          type: 'INSERT',
          table: ITEMS,
          columns: ITEM_COLUMNS,
          data: ITEM_ROWS,
        });
      });

      afterAll(async () => {
        for (const table of [ITEMS, TABLE]) {
          try {
            await engine.dropTable({
              type: 'DROP_TABLE',
              table,
              ifExists: true,
            });
          } catch { /* ignore */ }
        }
        await engine.disconnect();
        await cleanup?.();
      });

      for (const c of CASES) {
        it(c.name, async () => {
          asserts.assertEquals(await rows(engine, c), c.expected);
        });
      }

      it('CURRENT_TIME is the UTC clock time as HH:MM:SS text', async () => {
        const result = await engine.select({
          type: 'SELECT',
          table: TABLE,
          columns: COLUMNS,
          expressions: { now: { $$_expression: 'CURRENT_TIME' } },
          projection: { '@now': 'now' },
          where: { '@id': 1 },
        } as unknown as Query<'SELECT'>);
        const now = result.data[0]?.now;
        asserts.assertEquals(typeof now, 'string');
        asserts.assertMatch(now as string, /^\d{2}:\d{2}:\d{2}$/);
        const [h, m, sec] = (now as string).split(':').map(Number);
        const clock = new Date();
        const off = Math.abs(
          h! * 3600 + m! * 60 + sec! -
            (clock.getUTCHours() * 3600 + clock.getUTCMinutes() * 60 +
              clock.getUTCSeconds()),
        );
        asserts.assert(
          Math.min(off, 86400 - off) <= 60,
          `${now} is not the UTC time of ${clock.toISOString()}`,
        );
      });

      it('UPDATE and DELETE filter on a declared expression', async () => {
        const table = `${TABLE}_edit`;
        const columns = ['id', 'name', 'nick'];
        const upper = { up: { $$_expression: 'UPPER', args: '@name' } };
        await engine.createTable({
          type: 'CREATE_TABLE',
          table,
          columns: {
            id: { type: 'INTEGER', nullable: false },
            name: { type: 'VARCHAR', length: 50 },
            nick: { type: 'VARCHAR', length: 50 },
          },
          primaryKey: ['id'],
        });
        try {
          await engine.insert({
            type: 'INSERT',
            table,
            columns,
            data: ROWS.map(({ id, name, nick }) => ({ id, name, nick })),
          });
          await engine.update({
            type: 'UPDATE',
            table,
            columns,
            expressions: upper,
            data: { nick: 'z' },
            where: { '@up': 'ADA' },
          } as unknown as Query<'UPDATE'>);
          await engine.delete({
            type: 'DELETE',
            table,
            columns,
            expressions: upper,
            where: { '@up': { $null: true } },
          } as unknown as Query<'DELETE'>);
          const left = await engine.select({
            type: 'SELECT',
            table,
            columns,
            projection: { '@id': 'id', '@nick': 'nick' },
            orderBy: { '@id': 'ASC' },
          } as unknown as Query<'SELECT'>);
          asserts.assertEquals(left.data, [
            { id: 1, nick: 'z' },
            { id: 2, nick: null },
            { id: 4, nick: '' },
          ]);
        } finally {
          await engine.dropTable({ type: 'DROP_TABLE', table, ifExists: true });
        }
      });
    },
  });
}
