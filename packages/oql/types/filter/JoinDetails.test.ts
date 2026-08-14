/**
 * Type-level and round-trip coverage for {@link JoinDetails}.
 *
 * The point under test is that `table` names the physical table
 * while the key in `joins` is the alias, so the two are free to
 * differ. Each `satisfies` proves the type admits that; the
 * translator output proves the emitter treats them as distinct.
 *
 * @module types/filter/JoinDetails.test
 */

import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import type { Query } from '../mod.ts';
import { assertQuery } from '../../asserts/mod.ts';
import { PostgresTranslator } from '../../translator/mod.ts';

type User = { id: number; email: string };
type Profile = { userId: number; bio: string };

const pg = new PostgresTranslator();

/** Bridges the declared-schema query to the translator's defaulted one. */
const translate = (q: unknown) => pg.select(q as Query<'SELECT'>);

describe('oql.types.JoinDetails', () => {
  it('lets the join alias differ from the physical table name', () => {
    const query = {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'email'],
      joins: {
        Profile: {
          table: 'profiles',
          columns: ['userId', 'bio'],
          on: { '@Profile.@userId': '@id' },
          type: 'LEFT',
        },
      },
      projection: { '@id': true, '@Profile.@bio': 'bio' },
    } satisfies Query<'SELECT', User, { Profile: Profile }>;

    assertQuery(query);

    const { sql } = translate(query);
    // Physical table joined, aliased to the record key, and the ON
    // clause addresses the alias rather than the table.
    asserts.assertStringIncludes(
      sql,
      'LEFT JOIN "profiles" AS "Profile" ON "Profile"."userId" = __base__."id"',
    );
    asserts.assertStringIncludes(sql, '"Profile"."bio" AS "bio"');
  });

  it('still accepts an alias that matches the table name', () => {
    const query = {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'email'],
      joins: {
        profiles: {
          table: 'profiles',
          columns: ['userId', 'bio'],
          on: { '@profiles.@userId': '@id' },
        },
      },
      projection: { '@id': true, '@profiles.@bio': 'bio' },
    } satisfies Query<'SELECT', User, { profiles: Profile }>;

    assertQuery(query);

    const { sql } = translate(query);
    asserts.assertStringIncludes(sql, 'INNER JOIN "profiles" AS "profiles"');
  });

  it('carries the schema qualifier alongside a differing alias', () => {
    const query = {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'email'],
      joins: {
        Profile: {
          table: 'profiles',
          schema: 'public',
          columns: ['userId', 'bio'],
          on: { '@Profile.@userId': '@id' },
        },
      },
      projection: { '@id': true, '@Profile.@bio': 'bio' },
    } satisfies Query<'SELECT', User, { Profile: Profile }>;

    assertQuery(query);

    const { sql } = translate(query);
    asserts.assertStringIncludes(
      sql,
      'INNER JOIN "public"."profiles" AS "Profile"',
    );
  });
});
