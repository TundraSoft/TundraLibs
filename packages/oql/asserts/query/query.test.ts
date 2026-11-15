import { assertEquals, assertThrows } from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { OqlError } from '../../errors/mod.ts';
import { assertQuery, isQuery } from './query.ts';

describe('oql.asserts.Query', () => {
  describe('assertQuery', () => {
    describe('DML queries', () => {
      it('valid SELECT query', () => {
        const query = {
          type: 'SELECT',
          table: 'users',
          columns: ['id', 'name'],
          projection: { '@id': true, '@name': true },
        };
        assertQuery(query); // Should not throw
      });

      it('valid INSERT query', () => {
        const query = {
          type: 'INSERT',
          table: 'users',
          columns: ['id', 'name'],
          data: { id: 1, name: 'John' },
        };
        assertQuery(query); // Should not throw
      });

      it('valid UPDATE query', () => {
        const query = {
          type: 'UPDATE',
          table: 'users',
          columns: ['id', 'name'],
          data: { name: 'Jane' },
          where: { '@id': 1 },
        };
        assertQuery(query); // Should not throw
      });

      it('valid DELETE query', () => {
        const query = {
          type: 'DELETE',
          table: 'users',
          columns: ['id', 'name'],
          where: { '@id': 1 },
        };
        assertQuery(query); // Should not throw
      });

      it('valid UPSERT query', () => {
        const query = {
          type: 'UPSERT',
          table: 'users',
          columns: ['id', 'name'],
          data: { id: 1, name: 'John' },
          conflictKeys: ['@id'],
        };
        assertQuery(query); // Should not throw
      });

      it('valid COUNT query', () => {
        const query = {
          type: 'COUNT',
          table: 'users',
          columns: ['id', 'name'],
        };
        assertQuery(query); // Should not throw
      });
    });

    describe('DDL queries', () => {
      it('valid CREATE_TABLE query', () => {
        const query = {
          type: 'CREATE_TABLE',
          table: 'users',
          columns: {
            id: { type: 'INTEGER', primaryKey: true },
            name: { type: 'TEXT', nullable: false },
          },
        };
        assertQuery(query); // Should not throw
      });

      it('valid ALTER_TABLE query', () => {
        const query = {
          type: 'ALTER_TABLE',
          table: 'users',
          renameTo: 'customers',
        };
        assertQuery(query); // Should not throw
      });

      it('valid DROP_TABLE query', () => {
        const query = {
          type: 'DROP_TABLE',
          table: 'users',
        };
        assertQuery(query); // Should not throw
      });

      it('valid CREATE_SCHEMA query', () => {
        const query = {
          type: 'CREATE_SCHEMA',
          schema: 'public',
        };
        assertQuery(query); // Should not throw
      });

      it('valid DROP_SCHEMA query', () => {
        const query = {
          type: 'DROP_SCHEMA',
          schema: 'public',
        };
        assertQuery(query); // Should not throw
      });

      it('valid CREATE_INDEX query', () => {
        const query = {
          type: 'CREATE_INDEX',
          index: 'idx_users_email',
          table: 'users',
          columns: ['@email'],
        };
        assertQuery(query); // Should not throw
      });

      it('valid DROP_INDEX query', () => {
        const query = {
          type: 'DROP_INDEX',
          index: 'idx_users_email',
          table: 'users',
        };
        assertQuery(query); // Should not throw
      });

      it('valid CREATE_VIEW query', () => {
        const query = {
          type: 'CREATE_VIEW',
          view: 'active_users',
          query: {
            type: 'SELECT',
            table: 'users',
            columns: ['id', 'name', 'status'],
            projection: { '@id': true, '@name': true },
          },
        };
        assertQuery(query); // Should not throw
      });

      it('valid ALTER_VIEW query', () => {
        const query = {
          type: 'ALTER_VIEW',
          view: 'active_users',
          renameTo: 'current_users',
        };
        assertQuery(query); // Should not throw
      });

      it('valid DROP_VIEW query', () => {
        const query = {
          type: 'DROP_VIEW',
          view: 'active_users',
        };
        assertQuery(query); // Should not throw
      });

      it('valid REFRESH_MATERIALIZED_VIEW query', () => {
        const query = {
          type: 'REFRESH_MATERIALIZED_VIEW',
          view: 'user_stats',
        };
        assertQuery(query); // Should not throw
      });
    });

    describe('invalid queries', () => {
      it('not an object', () => {
        assertThrows(
          () => assertQuery('invalid'),
          TypeError,
          'Invalid Query: Expected object',
        );
      });

      it('missing type property', () => {
        assertThrows(
          () => assertQuery({ table: 'users' }),
          TypeError,
          "Invalid Query: Expected 'type' property to be a string",
        );
      });

      it('unknown query type', () => {
        assertThrows(
          () => assertQuery({ type: 'UNKNOWN' }),
          TypeError,
          "Invalid Query: Unknown query type 'UNKNOWN'",
        );
      });

      it('invalid SELECT query', () => {
        assertThrows(
          () => assertQuery({ type: 'SELECT' }),
          TypeError,
          'Invalid SELECT query',
        );
      });

      describe('time unit', () => {
        const diff = (unit: unknown) => ({
          $$_expression: 'DATE_DIFF',
          args: { from: '@at', to: '@at', unit },
        });
        const add = (unit: unknown, date: unknown = '@at') => ({
          $$_expression: 'DATE_ADD',
          args: { date, amount: 1, unit },
        });
        const select = (extra: Record<string, unknown>) => ({
          type: 'SELECT',
          table: 'orders',
          columns: ['id', 'at', 'n'],
          projection: { '@id': true },
          ...extra,
        });
        // One query per place the validator checks an expression, each
        // built from the unit so the same shape serves as its own control.
        const positions: Record<string, (unit: unknown) => unknown> = {
          'DATE_DIFF': (u) => select({ expressions: { e: diff(u) } }),
          'DATE_ADD': (u) => select({ expressions: { e: add(u) } }),
          'DATE_TRUNC': (u) =>
            select({
              expressions: {
                e: {
                  $$_expression: 'DATE_TRUNC',
                  args: { date: '@at', unit: u },
                },
              },
            }),
          'DATE_TRUNC of a DATE_ADD': (u) =>
            select({
              expressions: {
                e: {
                  $$_expression: 'DATE_TRUNC',
                  args: { date: add(u), unit: 'DAYS' },
                },
              },
            }),
          'nested in ADD': (u) =>
            select({
              expressions: { e: { $$_expression: 'ADD', args: [1, diff(u)] } },
            }),
          'nested in COALESCE': (u) =>
            select({
              expressions: {
                e: { $$_expression: 'COALESCE', args: [diff(u), 0] },
              },
            }),
          'aggregate': (u) =>
            select({
              projection: { '@s': true },
              aggregates: { s: { $$_aggregate: 'SUM', column: diff(u) } },
            }),
          'join on': (u) =>
            select({
              joins: {
                Item: {
                  table: 'items',
                  type: 'LEFT',
                  columns: ['orderId', 'at'],
                  on: { '@Item.@orderId': '@id', '@Item.@at': add(u) },
                },
              },
            }),
          'COUNT expressions': (u) => ({
            type: 'COUNT',
            table: 'orders',
            columns: ['id', 'at'],
            expressions: { e: diff(u) },
          }),
          'COUNT join on': (u) => ({
            type: 'COUNT',
            table: 'orders',
            columns: ['id', 'at'],
            joins: {
              Item: {
                table: 'items',
                type: 'LEFT',
                columns: ['orderId', 'at'],
                on: { '@Item.@orderId': '@id', '@Item.@at': add(u) },
              },
            },
          }),
          'INSERT data': (u) => ({
            type: 'INSERT',
            table: 'orders',
            columns: ['id', 'at'],
            data: { id: 1, at: add(u, new Date(0)) },
          }),
          'UPDATE data': (u) => ({
            type: 'UPDATE',
            table: 'orders',
            columns: ['id', 'at'],
            data: { at: add(u) },
            where: { '@id': 1 },
          }),
          'UPSERT data': (u) => ({
            type: 'UPSERT',
            table: 'orders',
            columns: ['id', 'at'],
            data: { id: 1, at: add(u) },
            conflictKeys: ['@id'],
          }),
          'INSERT_FROM_QUERY source': (u) => ({
            type: 'INSERT_FROM_QUERY',
            table: 'archive',
            columns: ['id', 'e'],
            query: select({
              expressions: { e: diff(u) },
              projection: { '@id': true, '@e': true },
            }),
          }),
          'CREATE_VIEW source': (u) => ({
            type: 'CREATE_VIEW',
            view: 'v',
            query: select({ expressions: { e: diff(u) } }),
          }),
          'ALTER_VIEW source': (u) => ({
            type: 'ALTER_VIEW',
            view: 'v',
            query: select({ expressions: { e: diff(u) } }),
          }),
        };

        for (const [position, build] of Object.entries(positions)) {
          it(`a bad unit throws INVALID_TIME_UNIT: ${position}`, () => {
            assertQuery(build('DAYS'));
            const err = assertThrows(
              () => assertQuery(build('fortnight')),
              OqlError,
            );
            // No dialect: the validator runs before one is chosen.
            assertEquals(err.context, {
              code: 'INVALID_TIME_UNIT',
              unit: 'fortnight',
            });
            assertEquals(isQuery(build('fortnight')), false);
          });
        }

        it('a bad UNIX_TIMESTAMP unit throws INVALID_TIME_UNIT', () => {
          const build = (unit: string) =>
            select({
              expressions: { e: { $$_expression: 'UNIX_TIMESTAMP', unit } },
            });
          assertQuery(build('milliseconds'));
          const err = assertThrows(
            () => assertQuery(build('minutes')),
            OqlError,
          );
          assertEquals(err.context, {
            code: 'INVALID_TIME_UNIT',
            unit: 'minutes',
          });
        });

        it('a missing unit is still a TypeError', () => {
          assertThrows(
            () =>
              assertQuery(select({
                expressions: {
                  e: {
                    $$_expression: 'DATE_DIFF',
                    args: { from: '@at', to: '@at' },
                  },
                },
              })),
            TypeError,
            "Missing 'unit' property",
          );
        });
      });
    });
  });

  describe('isQuery', () => {
    it('valid queries', () => {
      const validQueries = [
        {
          type: 'SELECT',
          table: 'users',
          columns: ['id'],
          projection: { '@id': true },
        },
        { type: 'INSERT', table: 'users', columns: ['id'], data: { id: 1 } },
        { type: 'UPDATE', table: 'users', columns: ['id'], data: { id: 2 } },
        { type: 'DELETE', table: 'users', columns: ['id'] },
        {
          type: 'CREATE_TABLE',
          table: 'users',
          columns: { id: { type: 'INTEGER' } },
        },
        { type: 'DROP_TABLE', table: 'users' },
      ];

      for (const query of validQueries) {
        assertEquals(
          isQuery(query),
          true,
          `Expected ${query.type} to be valid`,
        );
      }
    });

    it('invalid queries', () => {
      const invalidQueries = [
        'not an object',
        { table: 'users' }, // missing type
        { type: 'UNKNOWN' }, // unknown type
        { type: 'SELECT' }, // missing required fields
      ];

      for (const query of invalidQueries) {
        assertEquals(isQuery(query), false);
      }
    });

    it('type guard narrowing', () => {
      const unknown: unknown = {
        type: 'SELECT',
        table: 'users',
        columns: ['id'],
        projection: { '@id': true },
      };

      if (isQuery(unknown)) {
        // Should narrow type
        assertEquals(unknown.type, 'SELECT');
      }
    });
  });
});
