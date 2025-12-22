/**
 * Test suite for Join validators (JoinFilter, JoinDetails, Joins)
 *
 * Comprehensive tests for all Join-related validators with 100% coverage.
 */
import * as asserts from '$asserts';
import {
  assertJoinDetails,
  assertJoinFilter,
  assertJoins,
  isJoinDetails,
  isJoinFilter,
  isJoins,
} from './Joins.ts';

Deno.test('oql.asserts.Filters.Joins', async (t) => {
  await t.step('assertJoinFilter', async (u) => {
    await u.step('valid: column to column', () => {
      assertJoinFilter({
        '@user.@id': '@profile.@userId',
      });
    });

    await u.step('valid: multiple column mappings', () => {
      assertJoinFilter({
        '@user.@id': '@profile.@userId',
        '@user.@orgId': '@profile.@organizationId',
      });
    });

    await u.step('valid: with column list', () => {
      assertJoinFilter({
        '@left.@id': '@right.@userId',
      }, ['left.id', 'right.userId']);
    });

    await u.step('valid: with string constant', () => {
      assertJoinFilter({
        '@left.@type': 'user',
      });
    });

    await u.step('valid: with number constant', () => {
      assertJoinFilter({
        '@left.@id': 42,
      });
    });

    await u.step('valid: with boolean constant', () => {
      assertJoinFilter({
        '@left.@active': true,
      });
    });

    await u.step('valid: with bigint constant', () => {
      assertJoinFilter({
        '@left.@count': 100n,
      });
    });

    await u.step('valid: with Date constant', () => {
      assertJoinFilter({
        '@left.@created': new Date('2024-01-01'),
      });
    });

    await u.step('valid: with null constant', () => {
      assertJoinFilter({
        '@left.@deleted': null,
      });
    });

    await u.step('valid: with numeric expression', () => {
      assertJoinFilter({
        '@left.@total': { type: 'ADD', args: ['@right.@price', 10] },
      });
    });

    await u.step('valid: with string expression', () => {
      assertJoinFilter({
        '@left.@fullName': {
          type: 'CONCAT',
          args: ['@right.@first', ' ', '@right.@last'],
        },
      });
    });

    await u.step('valid: with date expression', () => {
      assertJoinFilter({
        '@left.@created': { type: 'NOW' },
      });
    });

    await u.step('invalid: not an object', () => {
      asserts.assertThrows(
        () => assertJoinFilter('invalid' as any),
        TypeError,
        'Expected an object',
      );
    });

    await u.step('invalid: empty object', () => {
      asserts.assertThrows(
        () => assertJoinFilter({} as any),
        TypeError,
        'cannot be empty',
      );
    });

    await u.step('invalid: key not column identifier', () => {
      asserts.assertThrows(
        () =>
          assertJoinFilter({
            'invalid': '@right.@id',
          } as any),
        TypeError,
        "must start with '@'",
      );
    });

    await u.step('invalid: key not in column list', () => {
      asserts.assertThrows(
        () =>
          assertJoinFilter({
            '@left.@other': '@right.@id',
          }, ['id']),
        TypeError,
        'not a valid column identifier',
      );
    });

    await u.step('invalid: malformed key', () => {
      asserts.assertThrows(
        () =>
          assertJoinFilter({
            '@@invalid': '@right.@id',
          } as any),
        TypeError,
        'not a valid column identifier',
      );
    });

    await u.step('invalid: value not valid column', () => {
      asserts.assertThrows(
        () =>
          assertJoinFilter({
            '@left.@id': '@@invalid',
          } as any),
        TypeError,
        'not a valid column identifier',
      );
    });

    await u.step('invalid: expression validation error', () => {
      asserts.assertThrows(
        () =>
          assertJoinFilter({
            '@left.@value': { type: 'ADD' } as any,
          }),
        TypeError,
        'not a valid expression',
      );
    });

    await u.step('invalid: constant is object', () => {
      asserts.assertThrows(
        () =>
          assertJoinFilter({
            '@left.@data': { key: 'value' },
          } as any),
        TypeError,
        "Missing 'type' property",
      );
    });

    await u.step('invalid: constant is array', () => {
      asserts.assertThrows(
        () =>
          assertJoinFilter({
            '@left.@tags': ['tag1', 'tag2'],
          } as any),
        TypeError,
        'must be',
      );
    });

    await u.step('invalid: invalid expression', () => {
      asserts.assertThrows(
        () =>
          assertJoinFilter({
            '@left.@value': { type: 'BAD_EXPR' } as any,
          }),
        TypeError,
        'Unknown expression type',
      );
    });
  });

  await t.step('isJoinFilter', async (u) => {
    await u.step('valid values', () => {
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

    await u.step('invalid values', () => {
      asserts.assertEquals(isJoinFilter('invalid'), false);
      asserts.assertEquals(isJoinFilter({}), false);
      asserts.assertEquals(
        isJoinFilter({ 'invalid': '@right.@id' }),
        false,
      );
    });
  });

  await t.step('assertJoinDetails', async (u) => {
    await u.step('valid: minimal join', () => {
      assertJoinDetails({
        table: 'users',
        columns: ['id', 'name'],
        on: {
          '@left.@id': '@right.@userId',
        },
      });
    });

    await u.step('valid: with schema', () => {
      assertJoinDetails({
        table: 'profiles',
        schema: 'public',
        columns: ['userId', 'bio'],
        on: {
          '@left.@id': '@right.@userId',
        },
      });
    });

    await u.step('valid: with type INNER', () => {
      assertJoinDetails({
        table: 'profiles',
        type: 'INNER',
        columns: ['userId', 'bio'],
        on: { '@left.@id': '@right.@userId' },
      });
    });

    await u.step('valid: with type LEFT', () => {
      assertJoinDetails({
        table: 'orders',
        type: 'LEFT',
        columns: ['customerId', 'total'],
        on: { '@left.@id': '@right.@customerId' },
      });
    });

    await u.step('valid: with type RIGHT', () => {
      assertJoinDetails({
        table: 'products',
        type: 'RIGHT',
        columns: ['id', 'name', 'price'],
        on: { '@left.@productId': '@right.@id' },
      });
    });

    await u.step('valid: with type FULL', () => {
      assertJoinDetails({
        table: 'logs',
        type: 'FULL',
        columns: ['id', 'userId', 'action'],
        on: { '@left.@logId': '@right.@id' },
      });
    });

    await u.step('valid: schema empty string', () => {
      assertJoinDetails({
        table: 'users',
        schema: '',
        columns: ['id'],
        on: { '@left.@id': '@right.@id' },
      });
    });

    await u.step('valid: with columns array', () => {
      assertJoinDetails({
        table: 'profiles',
        columns: ['userId', 'bio', 'email'],
        on: { '@left.@id': '@right.@userId' },
      });
    });

    await u.step('valid: with single column', () => {
      assertJoinDetails({
        table: 'users',
        columns: ['id'],
        on: { '@left.@profileId': '@right.@id' },
      });
    });

    await u.step('valid: with multiple columns', () => {
      assertJoinDetails({
        table: 'orders',
        columns: ['id', 'userId', 'total', 'status', 'createdAt'],
        on: { '@left.@userId': '@right.@userId' },
      });
    });

    await u.step('valid: columns with symbol', () => {
      const userIdSymbol = Symbol('userId');
      assertJoinDetails({
        table: 'users',
        columns: [userIdSymbol, 'name'],
        on: { '@left.@id': '@right.@userId' },
      });
    });

    await u.step('invalid: not an object', () => {
      asserts.assertThrows(
        () => assertJoinDetails('invalid' as any),
        TypeError,
        'Expected an object',
      );
    });

    await u.step('invalid: missing columns', () => {
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

    await u.step('invalid: missing table', () => {
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

    await u.step('invalid: table not string', () => {
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

    await u.step('invalid: missing on', () => {
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

    await u.step('invalid: on is invalid', () => {
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

    await u.step('invalid: on with invalid expression', () => {
      asserts.assertThrows(
        () =>
          assertJoinDetails({
            table: 'users',
            columns: ['id'],
            on: {
              '@left.@id': { type: 'INVALID' } as any,
            },
          }),
        TypeError,
        "'on' property is invalid",
      );
    });

    await u.step('invalid: type not string', () => {
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

    await u.step('invalid: type invalid value', () => {
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

    await u.step('invalid: schema not string', () => {
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

    await u.step('invalid: columns not array', () => {
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

    await u.step('invalid: columns empty array', () => {
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

    await u.step('invalid: columns with non-string element', () => {
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

    await u.step('invalid: columns with @ prefix', () => {
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

  await t.step('isJoinDetails', async (u) => {
    await u.step('valid values', () => {
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

    await u.step('invalid values', () => {
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

  await t.step('assertJoins', async (u) => {
    await u.step('valid: single join', () => {
      assertJoins({
        profiles: {
          table: 'profiles',
          columns: ['userId', 'bio'],
          on: { '@left.@id': '@right.@userId' },
        },
      });
    });

    await u.step('valid: multiple joins', () => {
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

    await u.step('valid: with column list', () => {
      assertJoins({
        profiles: {
          table: 'profiles',
          columns: ['userId', 'bio'],
          on: { '@left.@id': '@right.@userId' },
        },
      }, ['left.id', 'right.userId']);
    });

    await u.step('invalid: not an object', () => {
      asserts.assertThrows(
        () => assertJoins('invalid' as any),
        TypeError,
        'Expected an object',
      );
    });

    await u.step('invalid: empty object', () => {
      asserts.assertThrows(
        () => assertJoins({} as any),
        TypeError,
        'cannot be empty',
      );
    });

    await u.step('invalid: element with invalid JoinFilter', () => {
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

    await u.step('invalid: join with malformed definition', () => {
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

  await t.step('isJoins', async (u) => {
    await u.step('valid values', () => {
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

    await u.step('invalid values', () => {
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

  await t.step('Integration tests', async (u) => {
    await u.step('complex join with all features', () => {
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
