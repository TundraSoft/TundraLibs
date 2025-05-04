import * as asserts from '$asserts';
import { assertDDLQuery, assertDMLQuery } from './Query.ts';
import type { DDLQuery, DMLQuery } from '../types/Query.ts';

Deno.test('OQL.asserts.Query', async (t) => {
  await t.step('DDL Query Assertions', async (t) => {
    await t.step('should validate basic DDL query structure', () => {
      // Valid DDL queries
      assertDDLQuery({
        type: 'CREATE_SCHEMA',
        schema: 'test_schema',
      });

      assertDDLQuery({
        type: 'DROP_SCHEMA',
        schema: 'test_schema',
      });

      // Should fail for non-object
      asserts.assertThrows(
        () => assertDDLQuery('not-an-object'),
        TypeError,
        'must be an object',
      );

      // Should fail without type
      asserts.assertThrows(
        () => assertDDLQuery({}),
        TypeError,
        'must have a string "type" property',
      );

      // Should fail with invalid type
      asserts.assertThrows(
        () => assertDDLQuery({ type: 'INVALID_TYPE' }),
        TypeError,
        'must be one of',
      );
    });

    await t.step('should validate schema name', () => {
      // Valid schema name
      assertDDLQuery({
        type: 'CREATE_SCHEMA',
        schema: 'test_schema',
      });

      // Invalid schema name (reserved word)
      asserts.assertThrows(
        () =>
          assertDDLQuery({
            type: 'CREATE_SCHEMA',
            schema: 'SELECT',
          }),
        TypeError,
        'Invalid schema name',
      );

      // Missing schema when required
      asserts.assertThrows(
        () =>
          assertDDLQuery({
            type: 'CREATE_SCHEMA',
          }),
        TypeError,
        'requires a schema property',
      );
    });

    await t.step('should validate CREATE_TABLE queries', () => {
      // Valid CREATE_TABLE
      const validCreateTable: DDLQuery<'CREATE_TABLE'> = {
        type: 'CREATE_TABLE',
        schema: 'public',
        name: 'users',
        columns: [
          { name: 'id', type: 'UUID' },
          { name: 'username', type: 'VARCHAR', length: 255, nullable: false },
          { name: 'created_at', type: 'TIMESTAMP' },
        ],
        primaryKeys: ['id'],
        uniqueKeys: {
          username_unique: ['username'],
        },
      };
      assertDDLQuery(validCreateTable, 'CREATE_TABLE');

      // Missing name
      asserts.assertThrows(
        () =>
          assertDDLQuery({
            type: 'CREATE_TABLE',
            columns: [],
          }),
        TypeError,
        'requires a string name property',
      );

      // Invalid name
      asserts.assertThrows(
        () =>
          assertDDLQuery({
            type: 'CREATE_TABLE',
            name: 'SELECT',
            columns: [],
          }),
        TypeError,
        'Entity name cannot be a reserved word',
      );

      // Missing columns
      asserts.assertThrows(
        () =>
          assertDDLQuery({
            type: 'CREATE_TABLE',
            name: 'users',
          }),
        TypeError,
        'requires columns to be an array',
      );
    });

    await t.step('should validate DROP_TABLE queries', () => {
      // Valid DROP_TABLE
      assertDDLQuery({
        type: 'DROP_TABLE',
        name: 'users',
      });

      // Missing name
      asserts.assertThrows(
        () =>
          assertDDLQuery({
            type: 'DROP_TABLE',
          }),
        TypeError,
        'requires a string name property',
      );
    });

    await t.step('should validate ALTER_TABLE queries', () => {
      // Valid ALTER_TABLE with multiple operations
      assertDDLQuery({
        type: 'ALTER_TABLE',
        name: 'users',
        addColumns: [
          { name: 'email', type: 'VARCHAR', length: 255 },
        ],
        dropColumns: ['temporary_field'],
        addUniqueKeys: {
          email_unique: ['email'],
        },
      });

      // Missing name
      asserts.assertThrows(
        () =>
          assertDDLQuery({
            type: 'ALTER_TABLE',
            addColumns: [],
          }),
        TypeError,
        'requires a string name property',
      );

      // No operations specified
      asserts.assertThrows(
        () =>
          assertDDLQuery({
            type: 'ALTER_TABLE',
            name: 'users',
          }),
        TypeError,
        'requires at least one operation',
      );

      // Invalid column definition
      asserts.assertThrows(
        () =>
          assertDDLQuery({
            type: 'ALTER_TABLE',
            name: 'users',
            addColumns: [
              { invalid: 'column' } as any,
            ],
          }),
        TypeError,
        "Missing required property 'type'",
      );
    });

    await t.step('should validate CREATE_VIEW queries', () => {
      // Valid CREATE_VIEW with string query
      assertDDLQuery({
        type: 'CREATE_VIEW',
        name: 'active_users',
        query: 'SELECT * FROM users WHERE active = true',
      });

      // Valid CREATE_VIEW with DML query
      assertDDLQuery({
        type: 'CREATE_VIEW',
        name: 'active_users',
        query: {
          type: 'SELECT',
          table: 'users',
          columns: ['id', 'username'],
          project: ['id', 'username'],
          filters: {
            active: true,
          },
        },
      });

      // Missing name
      asserts.assertThrows(
        () =>
          assertDDLQuery({
            type: 'CREATE_VIEW',
            query: 'SELECT * FROM users',
          }),
        TypeError,
        'requires a string name property',
      );

      // Missing query
      asserts.assertThrows(
        () =>
          assertDDLQuery({
            type: 'CREATE_VIEW',
            name: 'active_users',
          }),
        TypeError,
        'requires a query property',
      );

      // Invalid query object
      asserts.assertThrows(
        () =>
          assertDDLQuery({
            type: 'CREATE_VIEW',
            name: 'active_users',
            query: { invalid: 'query' },
          }),
        TypeError,
        'must be a string or valid SELECT query',
      );
    });

    await t.step('should validate CREATE_INDEX queries', () => {
      // Valid CREATE_INDEX
      assertDDLQuery({
        type: 'CREATE_INDEX',
        name: 'idx_users_email',
        table: 'users',
        columns: ['email'],
        unique: true,
      });

      // Missing name
      asserts.assertThrows(
        () =>
          assertDDLQuery({
            type: 'CREATE_INDEX',
            table: 'users',
            columns: ['email'],
          }),
        TypeError,
        'requires a string name property',
      );

      // Missing table
      asserts.assertThrows(
        () =>
          assertDDLQuery({
            type: 'CREATE_INDEX',
            name: 'idx_users_email',
            columns: ['email'],
          }),
        TypeError,
        'requires a string table property',
      );

      // Missing columns
      asserts.assertThrows(
        () =>
          assertDDLQuery({
            type: 'CREATE_INDEX',
            name: 'idx_users_email',
            table: 'users',
          }),
        TypeError,
        'requires columns to be an array',
      );
    });

    await t.step('should validate with specific type parameter', () => {
      // Should pass with matching type
      assertDDLQuery({
        type: 'CREATE_TABLE',
        name: 'users',
        columns: [{ name: 'id', type: 'UUID' }],
      }, 'CREATE_TABLE');

      // Should fail with non-matching type
      asserts.assertThrows(
        () =>
          assertDDLQuery({
            type: 'DROP_TABLE',
            name: 'users',
          }, 'CREATE_TABLE'),
        TypeError,
        'Expected DDL query type CREATE_TABLE',
      );
    });
  });

  await t.step('DML Query Assertions', async (t) => {
    await t.step('should validate basic DML query structure', () => {
      // Valid DML query
      assertDMLQuery({
        type: 'SELECT',
        table: 'users',
        columns: ['id', 'username'],
        project: ['id', 'username'],
      });

      // Should fail for non-object
      asserts.assertThrows(
        () => assertDMLQuery('not-an-object'),
        TypeError,
        'must be an object',
      );

      // Should fail without type
      asserts.assertThrows(
        () => assertDMLQuery({}),
        TypeError,
        'must have a string "type" property',
      );

      // Should fail with invalid type
      asserts.assertThrows(
        () => assertDMLQuery({ type: 'INVALID_TYPE' }),
        TypeError,
        'must be one of',
      );

      // Should fail without table
      asserts.assertThrows(
        () => assertDMLQuery({ type: 'SELECT' }),
        TypeError,
        'must have a string "table" property',
      );

      // Should fail with invalid table name
      asserts.assertThrows(
        () =>
          assertDMLQuery({
            type: 'SELECT',
            table: 'SELECT', // reserved word
          }),
        TypeError,
        'Invalid table name',
      );
    });

    await t.step('should validate TRUNCATE queries', () => {
      // Valid TRUNCATE
      assertDMLQuery({
        type: 'TRUNCATE',
        table: 'logs',
      });
    });

    await t.step('should validate INSERT queries', () => {
      // Valid INSERT
      assertDMLQuery({
        type: 'INSERT',
        table: 'users',
        columns: ['username', 'email'],
        data: [
          { username: 'user1', email: 'user1@example.com' },
          { username: 'user2', email: 'user2@example.com' },
        ],
      });

      // Missing data
      asserts.assertThrows(
        () =>
          assertDMLQuery({
            type: 'INSERT',
            table: 'users',
            columns: ['username', 'email'],
          }),
        TypeError,
        'requires data to be an array',
      );

      // Invalid data (not array of objects)
      asserts.assertThrows(
        () =>
          assertDMLQuery({
            type: 'INSERT',
            table: 'users',
            columns: ['username', 'email'],
            data: ['invalid'],
          }),
        TypeError,
        'data must contain objects',
      );
    });

    await t.step('should validate UPSERT queries', () => {
      // Valid UPSERT
      assertDMLQuery({
        type: 'UPSERT',
        table: 'users',
        columns: ['id', 'username', 'email'],
        data: [
          { id: 1, username: 'user1', email: 'user1@example.com' },
        ],
        conflictColumns: ['id'],
      });

      // Missing conflictColumns
      asserts.assertThrows(
        () =>
          assertDMLQuery({
            type: 'UPSERT',
            table: 'users',
            columns: ['id', 'username', 'email'],
            data: [
              { id: 1, username: 'user1', email: 'user1@example.com' },
            ],
          }),
        TypeError,
        'requires conflictColumns to be an array',
      );
    });

    await t.step('should validate UPDATE queries', () => {
      // Valid UPDATE
      assertDMLQuery({
        type: 'UPDATE',
        table: 'users',
        columns: ['username', 'email'],
        data: { username: 'updated_user', email: 'updated@example.com' },
        filters: { id: 1 },
      });

      // Missing data
      asserts.assertThrows(
        () =>
          assertDMLQuery({
            type: 'UPDATE',
            table: 'users',
            columns: ['username', 'email'],
          }),
        TypeError,
        'requires data to be an object',
      );

      // Invalid filters
      asserts.assertThrows(
        () =>
          assertDMLQuery({
            type: 'UPDATE',
            table: 'users',
            columns: ['username'],
            data: { username: 'updated' },
            filters: 'invalid',
          }),
        TypeError,
        'Invalid UPDATE filters',
      );
    });

    await t.step('should validate DELETE queries', () => {
      // Valid DELETE
      assertDMLQuery({
        type: 'DELETE',
        table: 'users',
        columns: [],
        filters: { id: 1 },
      });

      // Valid DELETE all
      assertDMLQuery({
        type: 'DELETE',
        table: 'temporary_logs',
        columns: [],
      });

      // Invalid filters
      asserts.assertThrows(
        () =>
          assertDMLQuery({
            type: 'DELETE',
            table: 'users',
            columns: [],
            filters: 'invalid',
          }),
        TypeError,
        'Invalid DELETE filters',
      );
    });

    await t.step('should validate complex SELECT queries', () => {
      // Valid SELECT with expressions, filters, and joins
      const complexSelect: DMLQuery<'SELECT'> = {
        type: 'SELECT',
        table: 'users',
        columns: ['id', 'username', 'first_name', 'last_name', 'created_at'], // Added first_name and last_name
        project: [
          'id',
          'username',
          'full_name',
          'joined_days',
          '$profile',
        ],
        expressions: {
          full_name: {
            $expr: 'CONCAT',
            $args: ['$first_name', ' ', '$last_name'],
          },
          joined_days: {
            $expr: 'DATE_DIFF',
            $args: ['DAYS', { $expr: 'NOW' }, '$created_at'],
          },
        },
        filters: {
          active: true,
          $or: [
            { username: { $like: '%admin%' } },
            { role: 'admin' },
          ],
        },
        joins: {
          profile: {
            table: 'user_profiles',
            columns: ['avatar', 'bio'],
            on: {
              user_id: 'id',
            },
          },
        },
        limit: 10,
        offset: 0,
        orderBy: {
          username: 'ASC',
        },
      };

      assertDMLQuery(complexSelect);

      // Missing project
      asserts.assertThrows(
        () =>
          assertDMLQuery({
            type: 'SELECT',
            table: 'users',
            columns: ['id', 'username'],
          }),
        TypeError,
        'requires project to be an array',
      );

      // Invalid expressions
      asserts.assertThrows(
        () =>
          assertDMLQuery({
            type: 'SELECT',
            table: 'users',
            columns: ['id'],
            project: ['id', 'bad_expr'],
            expressions: {
              bad_expr: { bad: 'expression' },
            },
          }),
        TypeError,
        'must be a valid expression or aggregate',
      );

      // Invalid filters
      asserts.assertThrows(
        () =>
          assertDMLQuery({
            type: 'SELECT',
            table: 'users',
            columns: ['id'],
            project: ['id'],
            filters: 'invalid',
          }),
        TypeError,
        'Invalid SELECT filters',
      );

      // Invalid having
      asserts.assertThrows(
        () =>
          assertDMLQuery({
            type: 'SELECT',
            table: 'users',
            columns: ['id'],
            project: ['id'],
            having: 'invalid',
          }),
        TypeError,
        'Invalid SELECT having',
      );

      // Invalid joins
      asserts.assertThrows(
        () =>
          assertDMLQuery({
            type: 'SELECT',
            table: 'users',
            columns: ['id'],
            project: ['id'],
            joins: 'invalid',
          }),
        TypeError,
        'Joins must be an object',
      );

      // Invalid join definition
      asserts.assertThrows(
        () =>
          assertDMLQuery({
            type: 'SELECT',
            table: 'users',
            columns: ['id'],
            project: ['id'],
            joins: {
              profile: 'invalid',
            },
          }),
        TypeError,
        "Join definition for 'profile' must be an object",
      );

      // Missing join table
      asserts.assertThrows(
        () =>
          assertDMLQuery({
            type: 'SELECT',
            table: 'users',
            columns: ['id'],
            project: ['id'],
            joins: {
              profile: {},
            },
          }),
        TypeError,
        "Join 'profile' must have a string table property",
      );

      // Missing join columns
      asserts.assertThrows(
        () =>
          assertDMLQuery({
            type: 'SELECT',
            table: 'users',
            columns: ['id'],
            project: ['id'],
            joins: {
              profile: {
                table: 'user_profiles',
              },
            },
          }),
        TypeError,
        "Join 'profile' must have columns as an array",
      );

      // Missing join on condition
      asserts.assertThrows(
        () =>
          assertDMLQuery({
            type: 'SELECT',
            table: 'users',
            columns: ['id'],
            project: ['id'],
            joins: {
              profile: {
                table: 'user_profiles',
                columns: ['avatar'],
              },
            },
          }),
        TypeError,
        "Join 'profile' must have an 'on' object",
      );

      // Invalid limit
      asserts.assertThrows(
        () =>
          assertDMLQuery({
            type: 'SELECT',
            table: 'users',
            columns: ['id'],
            project: ['id'],
            limit: 'invalid',
          } as any),
        TypeError,
        'Limit must be a number',
      );

      // Invalid offset
      asserts.assertThrows(
        () =>
          assertDMLQuery({
            type: 'SELECT',
            table: 'users',
            columns: ['id'],
            project: ['id'],
            offset: 'invalid',
          } as any),
        TypeError,
        'Offset must be a number',
      );

      // Invalid orderBy
      asserts.assertThrows(
        () =>
          assertDMLQuery({
            type: 'SELECT',
            table: 'users',
            columns: ['id'],
            project: ['id'],
            orderBy: 'invalid',
          } as any),
        TypeError,
        'orderBy must be an object',
      );

      // Invalid orderBy direction
      asserts.assertThrows(
        () =>
          assertDMLQuery({
            type: 'SELECT',
            table: 'users',
            columns: ['id'],
            project: ['id'],
            orderBy: { id: 'INVALID' },
          } as any),
        TypeError,
        "orderBy values must be either 'ASC' or 'DESC'",
      );
    });

    await t.step('should validate with specific type parameter', () => {
      // Should pass with matching type
      assertDMLQuery({
        type: 'SELECT',
        table: 'users',
        columns: ['id'],
        project: ['id'],
      }, 'SELECT');

      // Should fail with non-matching type
      asserts.assertThrows(
        () =>
          assertDMLQuery({
            type: 'INSERT',
            table: 'users',
            columns: ['id'],
            data: [{ id: 1 }],
          }, 'SELECT'),
        TypeError,
        'Expected DML query type SELECT',
      );
    });
  });
});
