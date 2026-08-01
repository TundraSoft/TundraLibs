/**
 * Test suite for Join validators (JoinFilter, JoinDetails, Joins)
 *
 * Comprehensive tests for all Join-related validators with 100% coverage.
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import {
  assertJoinDetails,
  assertJoinFilter,
  assertJoins,
  isJoinDetails,
  isJoinFilter,
  isJoins,
} from './joins.ts';

describe('oql.asserts.Filters.Joins', () => {
  describe('assertJoinFilter', () => {
    it('valid: column to column', () => {
      assertJoinFilter({
        '@user.@id': '@profile.@userId',
      });
    });

    it('valid: multiple column mappings', () => {
      assertJoinFilter({
        '@user.@id': '@profile.@userId',
        '@user.@orgId': '@profile.@organizationId',
      });
    });

    it('valid: with column list', () => {
      assertJoinFilter({
        '@left.@id': '@right.@userId',
      }, ['left.id', 'right.userId']);
    });

    it('valid: with string constant', () => {
      assertJoinFilter({
        '@left.@type': 'user',
      });
    });

    it('valid: with number constant', () => {
      assertJoinFilter({
        '@left.@id': 42,
      });
    });

    it('valid: with boolean constant', () => {
      assertJoinFilter({
        '@left.@active': true,
      });
    });

    it('valid: with bigint constant', () => {
      assertJoinFilter({
        '@left.@count': 100n,
      });
    });

    it('valid: with Date constant', () => {
      assertJoinFilter({
        '@left.@created': new Date('2024-01-01'),
      });
    });

    it('valid: with null constant', () => {
      assertJoinFilter({
        '@left.@deleted': null,
      });
    });

    it('valid: with numeric expression', () => {
      assertJoinFilter({
        '@left.@total': { $$_expression: 'ADD', args: ['@right.@price', 10] },
      });
    });

    it('valid: with string expression', () => {
      assertJoinFilter({
        '@left.@fullName': {
          $$_expression: 'CONCAT',
          args: ['@right.@first', ' ', '@right.@last'],
        },
      });
    });

    it('valid: with date expression', () => {
      assertJoinFilter({
        '@left.@created': { $$_expression: 'NOW' },
      });
    });

    it('invalid: not an object', () => {
      asserts.assertThrows(
        () => assertJoinFilter('invalid' as any),
        TypeError,
        'Expected an object',
      );
    });

    it('invalid: empty object', () => {
      asserts.assertThrows(
        () => assertJoinFilter({} as any),
        TypeError,
        'cannot be empty',
      );
    });

    it('invalid: key not column identifier', () => {
      asserts.assertThrows(
        () =>
          assertJoinFilter({
            'invalid': '@right.@id',
          } as any),
        TypeError,
        "must start with '@'",
      );
    });

    it('invalid: key not in column list', () => {
      asserts.assertThrows(
        () =>
          assertJoinFilter({
            '@left.@other': '@right.@id',
          }, ['id']),
        TypeError,
        'not a valid column identifier',
      );
    });

    it('invalid: malformed key', () => {
      asserts.assertThrows(
        () =>
          assertJoinFilter({
            '@@invalid': '@right.@id',
          } as any),
        TypeError,
        'not a valid column identifier',
      );
    });

    it('valid: value @-string treated as literal', () => {
      // Under the new semantics a string value that doesn't match a known
      // column reference is accepted as a literal — even malformed @-strings.
      assertJoinFilter({
        '@left.@id': '@@invalid',
      } as any);
    });

    it('invalid: expression validation error', () => {
      asserts.assertThrows(
        () =>
          assertJoinFilter({
            '@left.@value': { $$_expression: 'ADD' } as any,
          }),
        TypeError,
        'not a valid expression',
      );
    });

    it('invalid: constant is object', () => {
      asserts.assertThrows(
        () =>
          assertJoinFilter({
            '@left.@data': { key: 'value' },
          } as any),
        TypeError,
        "Missing '$$_expression' property",
      );
    });

    it('invalid: constant is array', () => {
      asserts.assertThrows(
        () =>
          assertJoinFilter({
            '@left.@tags': ['tag1', 'tag2'],
          } as any),
        TypeError,
        'must be',
      );
    });

    it('invalid: invalid expression', () => {
      asserts.assertThrows(
        () =>
          assertJoinFilter({
            '@left.@value': { $$_expression: 'BAD_EXPR' } as any,
          }),
        TypeError,
        'Unknown expression type',
      );
    });
  });

  describe('isJoinFilter', () => {
    it('valid values', () => {
      asserts.assertEquals(
        isJoinFilter({
          '@left.@id': '@right.@userId',
        }),
        true,
      );
      asserts.assertEquals(
        isJoinFilter({
          '@left.@type': 'user',
          '@left.@id': '@right.@id',
        }),
        true,
      );
    });

    it('invalid values', () => {
      asserts.assertEquals(isJoinFilter('invalid'), false);
      asserts.assertEquals(isJoinFilter({}), false);
      asserts.assertEquals(
        isJoinFilter({ 'invalid': '@right.@id' }),
        false,
      );
    });
  });

  describe('assertJoinDetails', () => {
    it('valid: minimal join', () => {
      assertJoinDetails({
        table: 'users',
        columns: ['id', 'name'],
        on: {
          '@left.@id': '@right.@userId',
        },
      });
    });

    it('valid: with schema', () => {
      assertJoinDetails({
        table: 'profiles',
        schema: 'public',
        columns: ['userId', 'bio'],
        on: {
          '@left.@id': '@right.@userId',
        },
      });
    });

    it('valid: with type INNER', () => {
      assertJoinDetails({
        table: 'profiles',
        type: 'INNER',
        columns: ['userId', 'bio'],
        on: { '@left.@id': '@right.@userId' },
      });
    });

    it('valid: with type LEFT', () => {
      assertJoinDetails({
        table: 'orders',
        type: 'LEFT',
        columns: ['customerId', 'total'],
        on: { '@left.@id': '@right.@customerId' },
      });
    });

    it('valid: with type RIGHT', () => {
      assertJoinDetails({
        table: 'products',
        type: 'RIGHT',
        columns: ['id', 'name', 'price'],
        on: { '@left.@productId': '@right.@id' },
      });
    });

    it('valid: with type FULL', () => {
      assertJoinDetails({
        table: 'logs',
        type: 'FULL',
        columns: ['id', 'userId', 'action'],
        on: { '@left.@logId': '@right.@id' },
      });
    });

    it('valid: schema empty string', () => {
      assertJoinDetails({
        table: 'users',
        schema: '',
        columns: ['id'],
        on: { '@left.@id': '@right.@id' },
      });
    });

    it('valid: with columns array', () => {
      assertJoinDetails({
        table: 'profiles',
        columns: ['userId', 'bio', 'email'],
        on: { '@left.@id': '@right.@userId' },
      });
    });

    it('valid: with single column', () => {
      assertJoinDetails({
        table: 'users',
        columns: ['id'],
        on: { '@left.@profileId': '@right.@id' },
      });
    });

    it('valid: with multiple columns', () => {
      assertJoinDetails({
        table: 'orders',
        columns: ['id', 'userId', 'total', 'status', 'createdAt'],
        on: { '@left.@userId': '@right.@userId' },
      });
    });

    it('valid: columns with symbol', () => {
      const userIdSymbol = Symbol('userId');
      assertJoinDetails({
        table: 'users',
        columns: [userIdSymbol, 'name'],
        on: { '@left.@id': '@right.@userId' },
      });
    });

    it('invalid: not an object', () => {
      asserts.assertThrows(
        () => assertJoinDetails('invalid' as any),
        TypeError,
        'Expected an object',
      );
    });

    it('invalid: missing columns', () => {
      asserts.assertThrows(
        () =>
          assertJoinDetails({
            table: 'users',
            on: { '@left.@id': '@right.@userId' },
          } as any),
        TypeError,
        "Missing required 'columns' property",
      );
    });

    it('invalid: missing table', () => {
      asserts.assertThrows(
        () =>
          assertJoinDetails({
            columns: ['userId'],
            on: { '@left.@id': '@right.@id' },
          } as any),
        TypeError,
        "Missing required 'table' property",
      );
    });

    it('invalid: table not string', () => {
      asserts.assertThrows(
        () =>
          assertJoinDetails({
            table: 123,
            columns: ['userId'],
            on: { '@left.@id': '@right.@id' },
          } as any),
        TypeError,
        "'table' must be a string",
      );
    });

    it('invalid: missing on', () => {
      asserts.assertThrows(
        () =>
          assertJoinDetails({
            table: 'users',
            columns: ['id', 'name'],
          } as any),
        TypeError,
        "Missing required 'on' property",
      );
    });

    it('invalid: on is invalid', () => {
      asserts.assertThrows(
        () =>
          assertJoinDetails({
            table: 'users',
            columns: ['id'],
            on: {} as any,
          }),
        TypeError,
        'cannot be empty',
      );
    });

    it('invalid: on with invalid expression', () => {
      asserts.assertThrows(
        () =>
          assertJoinDetails({
            table: 'users',
            columns: ['id'],
            on: {
              '@left.@id': { $$_expression: 'INVALID' } as any,
            },
          }),
        TypeError,
        "'on' property is invalid",
      );
    });

    it('invalid: type not string', () => {
      asserts.assertThrows(
        () =>
          assertJoinDetails({
            table: 'users',
            type: 123 as any,
            columns: ['id'],
            on: { '@left.@id': '@right.@id' },
          }),
        TypeError,
        "'type' must be a string",
      );
    });

    it('invalid: type invalid value', () => {
      asserts.assertThrows(
        () =>
          assertJoinDetails({
            table: 'users',
            type: 'INVALID' as any,
            columns: ['id'],
            on: { '@left.@id': '@right.@id' },
          }),
        TypeError,
        "'type' must be one of INNER, LEFT, RIGHT, FULL",
      );
    });

    it('invalid: schema not string', () => {
      asserts.assertThrows(
        () =>
          assertJoinDetails({
            table: 'users',
            schema: 123 as any,
            columns: ['id'],
            on: { '@left.@id': '@right.@id' },
          }),
        TypeError,
        "'schema' must be a string",
      );
    });

    it('invalid: columns not array', () => {
      asserts.assertThrows(
        () =>
          assertJoinDetails({
            table: 'users',
            columns: 'userId',
            on: { '@left.@id': '@right.@userId' },
          } as any),
        TypeError,
        "'columns' must be an array",
      );
    });

    it('invalid: columns empty array', () => {
      asserts.assertThrows(
        () =>
          assertJoinDetails({
            table: 'users',
            columns: [],
            on: { '@left.@id': '@right.@userId' },
          }),
        TypeError,
        "'columns' array cannot be empty",
      );
    });

    it('invalid: columns with non-string element', () => {
      asserts.assertThrows(
        () =>
          assertJoinDetails({
            table: 'users',
            columns: ['userId', 123, 'email'],
            on: { '@left.@id': '@right.@userId' },
          } as any),
        TypeError,
        "'columns[1]' must be a string or symbol",
      );
    });

    it('invalid: columns with @ prefix', () => {
      asserts.assertThrows(
        () =>
          assertJoinDetails({
            table: 'users',
            columns: ['@userId', 'bio'],
            on: { '@left.@id': '@right.@userId' },
          } as any),
        TypeError,
        "'columns[0]' should not have '@' prefix",
      );
    });
  });

  describe('isJoinDetails', () => {
    it('valid values', () => {
      asserts.assertEquals(
        isJoinDetails({
          table: 'users',
          columns: ['id', 'name'],
          on: { '@left.@id': '@right.@userId' },
        }),
        true,
      );
      asserts.assertEquals(
        isJoinDetails({
          table: 'profiles',
          schema: 'public',
          type: 'LEFT',
          columns: ['userId', 'bio'],
          on: { '@left.@id': '@right.@userId' },
        }),
        true,
      );
    });

    it('invalid values', () => {
      asserts.assertEquals(isJoinDetails('invalid'), false);
      asserts.assertEquals(isJoinDetails({ table: 'users' }), false);
      asserts.assertEquals(
        isJoinDetails({
          table: 'users',
          on: {},
        }),
        false,
      );
    });
  });

  describe('assertJoins', () => {
    it('valid: single join', () => {
      assertJoins({
        profiles: {
          table: 'profiles',
          columns: ['userId', 'bio'],
          on: { '@left.@id': '@right.@userId' },
        },
      });
    });

    it('valid: multiple joins', () => {
      assertJoins({
        profiles: {
          table: 'profiles',
          columns: ['userId', 'bio'],
          on: { '@left.@id': '@right.@userId' },
        },
        orders: {
          table: 'orders',
          type: 'LEFT',
          columns: ['customerId', 'total'],
          on: { '@left.@id': '@right.@customerId' },
        },
        products: {
          table: 'products',
          schema: 'inventory',
          columns: ['id', 'name'],
          on: { '@left.@productId': '@right.@id' },
        },
      });
    });

    it('valid: with column list', () => {
      assertJoins({
        profiles: {
          table: 'profiles',
          columns: ['userId', 'bio'],
          on: { '@left.@id': '@right.@userId' },
        },
      }, ['left.id', 'right.userId']);
    });

    it('invalid: not an object', () => {
      asserts.assertThrows(
        () => assertJoins('invalid' as any),
        TypeError,
        'Expected an object',
      );
    });

    it('invalid: empty object', () => {
      asserts.assertThrows(
        () => assertJoins({} as any),
        TypeError,
        'cannot be empty',
      );
    });

    it('invalid: element with invalid JoinFilter', () => {
      asserts.assertThrows(
        () =>
          assertJoins({
            profiles: {
              table: 'profiles',
              columns: ['userId', 'bio'],
              on: {} as any,
            },
          }),
        TypeError,
        'cannot be empty',
      );
    });

    it('invalid: join with malformed definition', () => {
      asserts.assertThrows(
        () =>
          assertJoins({
            profiles: {
              table: 'profiles',
              columns: ['userId', 'bio'],
              on: {
                '@@invalid': '@right.@id',
              },
            } as any,
          }),
        TypeError,
        "Join 'profiles' is invalid",
      );
    });
  });

  describe('isJoins', () => {
    it('valid values', () => {
      asserts.assertEquals(
        isJoins({
          users: {
            table: 'users',
            columns: ['id', 'name'],
            on: { '@left.@id': '@right.@userId' },
          },
        }),
        true,
      );
      asserts.assertEquals(
        isJoins({
          profiles: {
            table: 'profiles',
            type: 'LEFT',
            columns: ['userId', 'bio'],
            on: { '@left.@id': '@right.@userId' },
          },
          orders: {
            table: 'orders',
            schema: 'sales',
            columns: ['customerId', 'total'],
            on: { '@left.@id': '@right.@customerId' },
          },
        }),
        true,
      );
    });

    it('invalid values', () => {
      asserts.assertEquals(isJoins('invalid'), false);
      asserts.assertEquals(isJoins([]), false);
      asserts.assertEquals(
        isJoins([{ table: 'users', on: { '@left.@id': '@right.@id' } }]),
        false,
      );
      asserts.assertEquals(isJoins({}), false);
      asserts.assertEquals(
        isJoins({ users: { table: 'users' } }),
        false,
      );
    });
  });

  describe('Integration tests', () => {
    it('complex join with all features', () => {
      assertJoins({
        user_profiles: {
          table: 'user_profiles',
          schema: 'public',
          type: 'LEFT',
          columns: ['userId', 'organizationId', 'bio'],
          on: {
            '@users.@id': '@user_profiles.@userId',
            '@users.@orgId': '@user_profiles.@organizationId',
          },
        },
        orders: {
          table: 'orders',
          schema: 'sales',
          type: 'INNER',
          columns: ['customerId', 'status', 'productId'],
          on: {
            '@users.@id': '@orders.@customerId',
            '@orders.@status': 'active',
          },
        },
        products: {
          table: 'products',
          type: 'LEFT',
          columns: ['id', 'available', 'name'],
          on: {
            '@orders.@productId': '@products.@id',
            '@products.@available': true,
          },
        },
      }, [
        'users.id',
        'users.orgId',
        'user_profiles.userId',
        'user_profiles.organizationId',
        'orders.customerId',
        'orders.status',
        'orders.productId',
        'products.id',
        'products.available',
      ]);
    });
  });
});
