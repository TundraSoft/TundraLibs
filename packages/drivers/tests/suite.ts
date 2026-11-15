/**
 * The engine-agnostic live suite for the queries oql builds from date,
 * conditional and NULL-aware nodes. One fixed table and one case table;
 * every engine must return the SAME rows for every case, read back from a
 * real database. A golden string in oql proves what the translator emits,
 * not what the database does with it.
 *
 * Each engine gets a thin `live-<engine>.test.ts` that hands
 * {@linkcode runLiveSuite} an engine. A new case goes in {@linkcode CASES}
 * once and runs everywhere.
 *
 * A case an engine is known to get wrong carries that engine in `pending`
 * with the branch that fixes it. It still runs, and passes only while it
 * FAILS, so the fix cannot land without removing the mark.
 *
 * @module
 */

import { afterAll, beforeAll, describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import type { Query } from '@tundralibs/oql/types';
import type { EngineQueryResult } from '../types/mod.ts';

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
  dropTable(q: Query<'DROP_TABLE'>): Promise<unknown>;
};

type Row = Record<string, unknown>;

type Case = {
  name: string;
  /** Every alias here is projected next to `id`. */
  expressions?: Record<string, unknown>;
  where?: Row;
  /** Rows in `id` order. A timestamp is its ISO 8601 UTC text. */
  expected: Row[];
  /** Compare a 64-bit integer as it arrives, not as a number. */
  exactNumbers?: true;
  /** Engines that fail this case today, and the branch that fixes each. */
  pending?: Partial<Record<LiveEngineName, string>>;
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
];

async function reachable(engine: LiveEngine): Promise<boolean> {
  try {
    await engine.connect();
    return await engine.ping();
  } catch {
    return false;
  } finally {
    await engine.disconnect().catch(() => {});
  }
}

/**
 * Register the suite for one engine. Skipped when the engine `create`
 * returns cannot be reached. `cleanup` runs after the engine disconnects.
 */
export async function runLiveSuite(
  name: LiveEngineName,
  create: () => LiveEngine,
  cleanup?: () => Promise<void>,
): Promise<void> {
  const available = await reachable(create());

  async function rows(engine: LiveEngine, c: Case): Promise<Row[]> {
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
        ['id', ...aliases].map((alias) => {
          const value = row[alias];
          if (value instanceof Date) return [alias, value.toISOString()];
          if (typeof value === 'bigint' && !c.exactNumbers) {
            return [alias, Number(value)];
          }
          return [alias, value];
        }),
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
        it({ name: `SKIPPED — ${name} unreachable`, ignore: true, fn() {} });
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
      });

      afterAll(async () => {
        try {
          await engine.dropTable({
            type: 'DROP_TABLE',
            table: TABLE,
            ifExists: true,
          });
        } catch { /* ignore */ }
        await engine.disconnect();
        await cleanup?.();
      });

      for (const c of CASES) {
        const branch = c.pending?.[name];
        if (branch === undefined) {
          it(c.name, async () => {
            asserts.assertEquals(await rows(engine, c), c.expected);
          });
          continue;
        }
        it(`${c.name} — KNOWN FAILURE on ${name}, fixed by ${branch}`, async () => {
          await asserts.assertRejects(
            async () => asserts.assertEquals(await rows(engine, c), c.expected),
            Error,
            undefined,
            `${name} now passes this case: remove it from the case's pending list`,
          );
        });
      }
    },
  });
}
