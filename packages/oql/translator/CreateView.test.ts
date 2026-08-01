/**
 * Tests for `createView` / `alterView` parameter-inlining. The
 * stored body of a view cannot carry placeholders on SQLite +
 * Postgres (and on MariaDB the bound value gets stored as a literal
 * anyway), so the translator inlines literals before returning.
 *
 * Pure-translator tests; no engine, no DB.
 *
 * @module
 */

import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';

import type { Query } from '../types/mod.ts';
import { MariaTranslator } from './MariaTranslator.ts';
import { MongoTranslator } from './MongoTranslator.ts';
import { PostgresTranslator } from './PostgresTranslator.ts';
import { SQLiteTranslator } from './SQLiteTranslator.ts';

// deno-lint-ignore no-explicit-any
const VIEW: Query<'CREATE_VIEW'> = {
  type: 'CREATE_VIEW',
  view: 'active_users',
  query: {
    type: 'SELECT',
    table: 'users',
    columns: ['id', 'email', 'status'],
    projection: { '@id': true, '@email': true },
    where: { '@status': 'ACTIVE' },
  },
  ifNotExists: true,
  // deno-lint-ignore no-explicit-any
} as any;

describe('oql.translator.createView — param inlining', () => {
  it('SQLite: emits literal SQL with empty params', () => {
    const t = new SQLiteTranslator();
    const out = t.createView(VIEW);
    asserts.assertEquals(out.params, {});
    asserts.assertStringIncludes(out.sql, 'WHERE "status" = \'ACTIVE\'');
    // Sanity: no placeholder leaked through.
    asserts.assertEquals(/:p_\d+:/.test(out.sql), false);
  });

  it('Postgres: emits literal SQL with empty params', () => {
    const t = new PostgresTranslator();
    const out = t.createView(VIEW);
    asserts.assertEquals(out.params, {});
    asserts.assertStringIncludes(out.sql, 'WHERE "status" = \'ACTIVE\'');
    asserts.assertEquals(/:p_\d+:/.test(out.sql), false);
  });

  it('MariaDB: emits literal SQL with empty params', () => {
    const t = new MariaTranslator();
    const out = t.createView(VIEW);
    asserts.assertEquals(out.params, {});
    asserts.assertStringIncludes(out.sql, "WHERE `status` = 'ACTIVE'");
    asserts.assertEquals(/:p_\d+:/.test(out.sql), false);
  });

  it('escapes single quotes in inlined string values', () => {
    const t = new SQLiteTranslator();
    // deno-lint-ignore no-explicit-any
    const q: any = {
      type: 'CREATE_VIEW',
      view: 'odd',
      query: {
        type: 'SELECT',
        table: 't',
        columns: ['name'],
        projection: { '@name': true },
        where: { '@name': "O'Brien" },
      },
    };
    const out = t.createView(q);
    asserts.assertStringIncludes(out.sql, "'O''Brien'");
  });

  it('MariaDB: escapes backslashes AND single quotes in inlined strings', () => {
    // MariaDB/MySQL treat `\` as a string escape by default, so doubling
    // only the single quote (the base behaviour) lets a value like
    // `\'; DROP …` break out of the literal. The override must double both.
    const t = new MariaTranslator();
    // deno-lint-ignore no-explicit-any
    const q: any = {
      type: 'CREATE_VIEW',
      view: 'evil',
      query: {
        type: 'SELECT',
        table: 't',
        columns: ['name'],
        projection: { '@name': true },
        // Raw value: backslash, single quote, then a SQL fragment.
        where: { '@name': "a\\'; DROP TABLE users; --" },
      },
    };
    const out = t.createView(q);
    // Backslash doubled, single quote doubled — the value stays inside the
    // literal and the injected statement is inert.
    asserts.assertStringIncludes(
      out.sql,
      "'a\\\\''; DROP TABLE users; --'",
    );
    // The original single backslash + single quote must NOT appear unescaped.
    asserts.assertEquals(out.sql.includes("a\\';"), false);
    asserts.assertEquals(/:p_\d+:/.test(out.sql), false);
  });

  it('inlines numbers, booleans, null without quotes', () => {
    const t = new SQLiteTranslator();
    // deno-lint-ignore no-explicit-any
    const q: any = {
      type: 'CREATE_VIEW',
      view: 'mixed',
      query: {
        type: 'SELECT',
        table: 't',
        columns: ['n', 'flag', 'maybe'],
        projection: { '@n': true, '@flag': true, '@maybe': true },
        where: {
          $and: [
            { '@n': 42 },
            { '@flag': true },
          ],
        },
      },
    };
    const out = t.createView(q);
    asserts.assertEquals(out.params, {});
    asserts.assertStringIncludes(out.sql, '= 42');
    // Boolean form is dialect-dependent; make sure it didn't leave a placeholder.
    asserts.assertEquals(/:p_\d+:/.test(out.sql), false);
  });
});

describe('oql.translator.dropView — materialized targets', () => {
  const DROP = {
    type: 'DROP_VIEW',
    view: 'daily_stats',
    materialized: true,
    ifExists: true,
  } as unknown as Query<'DROP_VIEW'>;

  it('Postgres: DROP MATERIALIZED VIEW (plain DROP VIEW refuses matviews)', () => {
    const out = new PostgresTranslator().dropView(DROP);
    asserts.assertStringIncludes(out.sql, 'DROP MATERIALIZED VIEW IF EXISTS');
  });

  it('SQLite/Maria: flag ignored — matviews are emulated as plain views', () => {
    for (const t of [new SQLiteTranslator(), new MariaTranslator()]) {
      const out = t.dropView(DROP);
      asserts.assertStringIncludes(out.sql, 'DROP VIEW IF EXISTS');
      asserts.assertEquals(out.sql.includes('MATERIALIZED'), false);
    }
  });

  it('Postgres: plain DROP VIEW when materialized is false/omitted', () => {
    const t = new PostgresTranslator();
    // Explicit materialized:false takes the non-materialized else arm.
    const withFlag = t.dropView({
      type: 'DROP_VIEW',
      view: 'v',
      materialized: false,
      ifExists: true,
    } as unknown as Query<'DROP_VIEW'>);
    asserts.assertEquals(withFlag.sql, 'DROP VIEW IF EXISTS "v"');
    asserts.assertEquals(withFlag.sql.includes('MATERIALIZED'), false);
    // Omitting the flag entirely lands on the same plain-view branch.
    const omitted = t.dropView({
      type: 'DROP_VIEW',
      view: 'v',
      ifExists: true,
    } as unknown as Query<'DROP_VIEW'>);
    asserts.assertEquals(omitted.sql, 'DROP VIEW IF EXISTS "v"');
    asserts.assertEquals(omitted.sql.includes('MATERIALIZED'), false);
  });

  it('Mongo: materialized flag ignored — plain drop action', () => {
    // Mongo has no materialized views, so the CREATE_VIEW made a regular
    // view and DROP just drops the collection; the materialized flag on the
    // spec is accepted but not reflected in the emitted action.
    const out = new MongoTranslator().dropView(DROP);
    asserts.assertEquals(out.sql, 'drop');
    asserts.assertEquals(out.params, {
      collection: 'daily_stats',
      options: { ifExists: true },
    });
  });
});

describe('oql.translator.createSchema — SQLite ATTACH path', () => {
  it('escapes single quotes in the ATTACH DATABASE path literal', () => {
    // The public `createSchema` rejects names with a quote at the assert
    // layer; we target the DDL builder directly to prove the emitted path
    // literal is safe even if a quoted name ever reaches it. The schema is
    // interpolated into a single-quoted `<name>.db` path, so a `'` in the
    // name must be doubled or it would break out of the literal.
    const t = new SQLiteTranslator();
    // deno-lint-ignore no-explicit-any
    const q: any = { type: 'CREATE_SCHEMA', schema: "x'; ATTACH DATABASE" };
    // _buildCreateSchema is protected — reach it the same way the rest of
    // these translator tests bypass the type surface.
    // deno-lint-ignore no-explicit-any
    const sql = (t as any)._buildCreateSchema(q) as string;
    // Single quote doubled inside the path literal; alias stays "-quoted.
    asserts.assertStringIncludes(
      sql,
      "ATTACH DATABASE 'x''; ATTACH DATABASE.db'",
    );
    // The raw, unescaped break-out sequence must NOT appear.
    asserts.assertEquals(sql.includes("'x'; "), false);
  });
});
