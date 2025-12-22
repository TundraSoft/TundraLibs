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
  //#region JoinFilter - Column Mappings

  await t.step('assertJoinFilter - valid: column to column', () => {
    assertJoinFilter({
      '@user.@id': '@profile.@userId',
    });
  });

  await t.step('assertJoinFilter - valid: multiple column mappings', () => {
    assertJoinFilter({
      '@user.@id': '@profile.@userId',
      '@user.@orgId': '@profile.@organizationId',
    });
  });

  await t.step('assertJoinFilter - valid: with column list', () => {
    assertJoinFilter({
      '@left.@id': '@right.@userId',
    }, ['left.id', 'right.userId']);
  });

  await t.step('assertJoinFilter - invalid: not an object', () => {
    asserts.assertThrows(
      () => assertJoinFilter('invalid' as any),
      TypeError,
      'Expected an object',
    );
  });

  await t.step('assertJoinFilter - invalid: empty object', () => {
    asserts.assertThrows(
      () => assertJoinFilter({} as any),
      TypeError,
      'cannot be empty',
    );
  });

  await t.step('assertJoinFilter - invalid: key not column identifier', () => {
    asserts.assertThrows(
      () =>
        assertJoinFilter({
          'invalid': '@right.@id',
        } as any),
      TypeError,
      "must start with '@'",
    );
  });

  await t.step('assertJoinFilter - invalid: key not in column list', () => {
    asserts.assertThrows(
      () =>
        assertJoinFilter({
          '@left.@other': '@right.@id',
        }, ['id']),
      TypeError,
      'not a valid column identifier',
    );
  });

  await t.step('assertJoinFilter - invalid: malformed key', () => {
    asserts.assertThrows(
      () =>
        assertJoinFilter({
          '@@invalid': '@right.@id',
        } as any),
      TypeError,
      'not a valid column identifier',
    );
  });

  await t.step('assertJoinFilter - invalid: value not valid column', () => {
    asserts.assertThrows(
      () =>
        assertJoinFilter({
          '@left.@id': '@@invalid',
        } as any),
      TypeError,
      'not a valid column identifier',
    );
  });

  await t.step(
    'assertJoinFilter - invalid: expression validation error',
    () => {
      asserts.assertThrows(
        () =>
          assertJoinFilter({
            '@left.@value': { type: 'ADD' } as any,
          }),
        TypeError,
        'not a valid expression',
      );
    },
  );

  //#endregion JoinFilter - Column Mappings

  //#region JoinFilter - Constants

  await t.step('assertJoinFilter - valid: with string constant', () => {
    assertJoinFilter({
      '@left.@type': 'user',
    });
  });

  await t.step('assertJoinFilter - valid: with number constant', () => {
    assertJoinFilter({
      '@left.@id': 42,
    });
  });

  await t.step('assertJoinFilter - valid: with boolean constant', () => {
    assertJoinFilter({
      '@left.@active': true,
    });
  });

  await t.step('assertJoinFilter - valid: with bigint constant', () => {
    assertJoinFilter({
      '@left.@count': 100n,
    });
  });

  await t.step('assertJoinFilter - valid: with Date constant', () => {
    assertJoinFilter({
      '@left.@created': new Date('2024-01-01'),
    });
  });

  await t.step('assertJoinFilter - valid: with null constant', () => {
    assertJoinFilter({
      '@left.@deleted': null,
    });
  });

  await t.step('assertJoinFilter - invalid: constant is object', () => {
    asserts.assertThrows(
      () =>
        assertJoinFilter({
          '@left.@data': { key: 'value' },
        } as any),
      TypeError,
      "Missing 'type' property",
    );
  });

  await t.step('assertJoinFilter - invalid: constant is array', () => {
    asserts.assertThrows(
      () =>
        assertJoinFilter({
          '@left.@tags': ['tag1', 'tag2'],
        } as any),
      TypeError,
      'must be',
    );
  });

  //#endregion JoinFilter - Constants

  //#region JoinFilter - Expressions

  await t.step('assertJoinFilter - valid: with numeric expression', () => {
    assertJoinFilter({
      '@left.@total': { type: 'ADD', args: ['@right.@price', 10] },
    });
  });

  await t.step('assertJoinFilter - valid: with string expression', () => {
    assertJoinFilter({
      '@left.@fullName': {
        type: 'CONCAT',
        args: ['@right.@first', ' ', '@right.@last'],
      },
    });
  });

  await t.step('assertJoinFilter - valid: with date expression', () => {
    assertJoinFilter({
      '@left.@created': { type: 'NOW' },
    });
  });

  await t.step('assertJoinFilter - invalid: invalid expression', () => {
    asserts.assertThrows(
      () =>
        assertJoinFilter({
          '@left.@value': { type: 'BAD_EXPR' } as any,
        }),
      TypeError,
      'Unknown expression type',
    );
  });

  //#endregion JoinFilter - Expressions

  //#region JoinFilter Type Guard

  await t.step('isJoinFilter - valid values', () => {
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

  await t.step('isJoinFilter - invalid values', () => {
    asserts.assertEquals(isJoinFilter('invalid'), false);
    asserts.assertEquals(isJoinFilter({}), false);
    asserts.assertEquals(
      isJoinFilter({ 'invalid': '@right.@id' }),
      false,
    );
  });

  //#endregion JoinFilter Type Guard

  //#region JoinDetails - Required Properties

  await t.step('assertJoinDetails - valid: minimal join', () => {
    assertJoinDetails({
      table: 'users',
      columns: ['id', 'name'],
      on: {
        '@left.@id': '@right.@userId',
      },
    });
  });

  await t.step('assertJoinDetails - valid: with schema', () => {
    assertJoinDetails({
      table: 'profiles',
      schema: 'public',
      columns: ['userId', 'bio'],
      on: {
        '@left.@id': '@right.@userId',
      },
    });
  });

  await t.step('assertJoinDetails - invalid: not an object', () => {
    asserts.assertThrows(
      () => assertJoinDetails('invalid' as any),
      TypeError,
      'Expected an object',
    );
  });

  await t.step('assertJoinDetails - invalid: missing columns', () => {
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

  await t.step('assertJoinDetails - invalid: missing table', () => {
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

  await t.step('assertJoinDetails - invalid: table not string', () => {
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

  await t.step('assertJoinDetails - invalid: missing on', () => {
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

  await t.step('assertJoinDetails - invalid: on is invalid', () => {
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

  await t.step(
    'assertJoinDetails - invalid: on with invalid expression',
    () => {
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
    },
  );

  //#endregion JoinDetails - Required Properties

  //#region JoinDetails - Optional Properties

  await t.step('assertJoinDetails - valid: with type INNER', () => {
    assertJoinDetails({
      table: 'profiles',
      type: 'INNER',
      columns: ['userId', 'bio'],
      on: { '@left.@id': '@right.@userId' },
    });
  });

  await t.step('assertJoinDetails - valid: with type LEFT', () => {
    assertJoinDetails({
      table: 'orders',
      type: 'LEFT',
      columns: ['customerId', 'total'],
      on: { '@left.@id': '@right.@customerId' },
    });
  });

  await t.step('assertJoinDetails - valid: with type RIGHT', () => {
    assertJoinDetails({
      table: 'products',
      type: 'RIGHT',
      columns: ['id', 'name', 'price'],
      on: { '@left.@productId': '@right.@id' },
    });
  });

  await t.step('assertJoinDetails - valid: with type FULL', () => {
    assertJoinDetails({
      table: 'logs',
      type: 'FULL',
      columns: ['id', 'userId', 'action'],
      on: { '@left.@logId': '@right.@id' },
    });
  });

  await t.step('assertJoinDetails - invalid: type not string', () => {
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

  await t.step('assertJoinDetails - invalid: type invalid value', () => {
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

  await t.step('assertJoinDetails - invalid: schema not string', () => {
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

  await t.step('assertJoinDetails - valid: schema empty string', () => {
    // Note: Empty string validation is not strictly enforced at runtime
    assertJoinDetails({
      table: 'users',
      schema: '',
      columns: ['id'],
      on: { '@left.@id': '@right.@id' },
    });
  });

  //#endregion JoinDetails - Optional Properties

  //#region JoinDetails - columns Property

  await t.step('assertJoinDetails - valid: with columns array', () => {
    assertJoinDetails({
      table: 'profiles',
      columns: ['userId', 'bio', 'email'],
      on: { '@left.@id': '@right.@userId' },
    });
  });

  await t.step('assertJoinDetails - valid: with single column', () => {
    assertJoinDetails({
      table: 'users',
      columns: ['id'],
      on: { '@left.@profileId': '@right.@id' },
    });
  });

  await t.step('assertJoinDetails - valid: with multiple columns', () => {
    assertJoinDetails({
      table: 'orders',
      columns: ['id', 'userId', 'total', 'status', 'createdAt'],
      on: { '@left.@userId': '@right.@userId' },
    });
  });

  await t.step('assertJoinDetails - invalid: missing columns', () => {
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

  await t.step('assertJoinDetails - invalid: columns not array', () => {
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

  await t.step('assertJoinDetails - invalid: columns empty array', () => {
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

  await t.step('assertJoinDetails - invalid: columns with non-string element', () => {
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

  await t.step('assertJoinDetails - invalid: columns with @ prefix', () => {
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

  await t.step('assertJoinDetails - valid: columns with symbol', () => {
    const userIdSymbol = Symbol('userId');
    assertJoinDetails({
      table: 'users',
      columns: [userIdSymbol, 'name'],
      on: { '@left.@id': '@right.@userId' },
    });
  });

  //#endregion JoinDetails - columns Property

  //#region JoinDetails Type Guard

  await t.step('isJoinDetails - valid values', () => {
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

  await t.step('isJoinDetails - invalid values', () => {
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

  //#endregion JoinDetails Type Guard

  //#region Joins - Collection

  await t.step('assertJoins - valid: single join', () => {
    assertJoins({
      profiles: {
        table: 'profiles',
        columns: ['userId', 'bio'],
        on: { '@left.@id': '@right.@userId' },
      },
    });
  });

  await t.step('assertJoins - valid: multiple joins', () => {
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

  await t.step('assertJoins - valid: with column list', () => {
    assertJoins({
      profiles: {
        table: 'profiles',
        columns: ['userId', 'bio'],
        on: { '@left.@id': '@right.@userId' },
      },
    }, ['left.id', 'right.userId']);
  });

  await t.step('assertJoins - invalid: not an object', () => {
    asserts.assertThrows(
      () => assertJoins('invalid' as any),
      TypeError,
      'Expected an object',
    );
  });

  await t.step('assertJoins - invalid: empty object', () => {
    asserts.assertThrows(
      () => assertJoins({} as any),
      TypeError,
      'cannot be empty',
    );
  });

  await t.step('assertJoins - invalid: element with invalid JoinFilter', () => {
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

  await t.step('assertJoins - invalid: join with malformed definition', () => {
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

  //#endregion Joins - Collection

  //#region Joins Type Guard

  await t.step('isJoins - valid values', () => {
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

  await t.step('isJoins - invalid values', () => {
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

  //#endregion Joins Type Guard

  //#region Integration Tests

  await t.step('Integration: complex join with all features', () => {
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

  //#endregion Integration Tests
});
