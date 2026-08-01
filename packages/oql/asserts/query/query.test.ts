import { assertEquals, assertThrows } from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
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
