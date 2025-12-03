import * as asserts from '$asserts';
import { assertAggregate } from './assertAggregate.ts';
import { assertCount } from './assertCount.ts';
import { assertNumericAggregate } from './assertNumericAggregate.ts';
import { assertStringAgg } from './assertStringAgg.ts';
import { assertArrayAgg } from './assertArrayAgg.ts';
import { assertJsonRow } from './assertJsonRow.ts';

Deno.test('oql.asserts.Aggregate.assertCount', async (t) => {
  await t.step('valid COUNT(*)', () => {
    assertCount({ type: 'COUNT' });
  });

  await t.step('valid COUNT with column', () => {
    assertCount({ type: 'COUNT', column: '@id' });
    assertCount({ type: 'COUNT', column: '@email' });
    assertCount({ type: 'COUNT', column: '@users.@id' });
  });

  await t.step('valid COUNT with distinct', () => {
    assertCount({ type: 'COUNT', column: '@email', distinct: true });
    assertCount({ type: 'COUNT', column: '@userId', distinct: false });
  });

  await t.step('valid COUNT with expression', () => {
    assertCount({
      type: 'COUNT',
      column: { type: 'CONCAT', args: ['@firstName', '@lastName'] },
    });
    assertCount({
      type: 'COUNT',
      column: { type: 'ADD', args: [1, 2, 3] },
    });
  });

  await t.step('invalid: COUNT(*) with distinct', () => {
    asserts.assertThrows(
      () => assertCount({ type: 'COUNT', distinct: true }),
      TypeError,
      "COUNT(*) cannot have 'distinct' property",
    );
  });

  await t.step('invalid: column not ColumnIdentifier', () => {
    asserts.assertThrows(
      () => assertCount({ type: 'COUNT', column: 'id' }),
      TypeError,
      "Must start with '@'",
    );

    asserts.assertThrows(
      () => assertCount({ type: 'COUNT', column: '@table.id' }),
      TypeError,
      'Segment "id" must start with \'@\'',
    );
  });

  await t.step('invalid: unknown properties', () => {
    asserts.assertThrows(
      () => assertCount({ type: 'COUNT', separator: ',' }),
      TypeError,
      'Unknown properties',
    );

    asserts.assertThrows(
      () => assertCount({ type: 'COUNT', column: '@id', extra: 'value' }),
      TypeError,
      'Unknown properties',
    );
  });

  await t.step('invalid: column null or undefined', () => {
    asserts.assertThrows(
      () => assertCount({ type: 'COUNT', column: null }),
      TypeError,
      'column cannot be null or undefined',
    );

    asserts.assertThrows(
      () => assertCount({ type: 'COUNT', column: undefined }),
      TypeError,
      'column cannot be null or undefined',
    );
  });

  await t.step('invalid: distinct not boolean', () => {
    asserts.assertThrows(
      () => assertCount({ type: 'COUNT', column: '@id', distinct: 'true' }),
      TypeError,
      'distinct must be a boolean',
    );

    asserts.assertThrows(
      () => assertCount({ type: 'COUNT', column: '@id', distinct: 1 }),
      TypeError,
      'distinct must be a boolean',
    );
  });

  await t.step('invalid: not an object', () => {
    asserts.assertThrows(
      () => assertCount('invalid'),
      TypeError,
      'Expected an object',
    );

    asserts.assertThrows(
      () => assertCount(null),
      TypeError,
      'Expected an object',
    );

    asserts.assertThrows(
      () => assertCount(123),
      TypeError,
      'Expected an object',
    );
  });

  await t.step('invalid: wrong type', () => {
    asserts.assertThrows(
      () => assertCount({ type: 'SUM', column: '@id' }),
      TypeError,
      "type must be 'COUNT'",
    );
  });

  await t.step('invalid: column not object when not string', () => {
    asserts.assertThrows(
      () => assertCount({ type: 'COUNT', column: 123 }),
      TypeError,
      'column must be a string (ColumnIdentifier) or Expression object',
    );

    asserts.assertThrows(
      () => assertCount({ type: 'COUNT', column: true }),
      TypeError,
      'column must be a string (ColumnIdentifier) or Expression object',
    );
  });

  await t.step('invalid: invalid expression in column', () => {
    asserts.assertThrows(
      () => assertCount({ type: 'COUNT', column: { type: 'INVALID' } }),
      TypeError,
      'Unknown type',
    );
  });

  await t.step('custom error messages', () => {
    asserts.assertThrows(
      () => assertCount({ type: 'COUNT', column: 'invalid' }, 'Custom error'),
      TypeError,
      'Custom error',
    );
  });
});

Deno.test('oql.asserts.Aggregate.assertNumericAggregate', async (t) => {
  await t.step('valid SUM', () => {
    assertNumericAggregate({ type: 'SUM', column: '@amount' });
    assertNumericAggregate({ type: 'SUM', column: '@price' });
  });

  await t.step('valid MIN', () => {
    assertNumericAggregate({ type: 'MIN', column: '@createdAt' });
    assertNumericAggregate({ type: 'MIN', column: '@score' });
  });

  await t.step('valid MAX', () => {
    assertNumericAggregate({ type: 'MAX', column: '@total' });
  });

  await t.step('valid AVG', () => {
    assertNumericAggregate({ type: 'AVG', column: '@rating' });
  });

  await t.step('valid with distinct', () => {
    assertNumericAggregate({ type: 'SUM', column: '@amount', distinct: true });
    assertNumericAggregate({ type: 'AVG', column: '@price', distinct: false });
  });

  await t.step('valid with expression', () => {
    assertNumericAggregate({
      type: 'SUM',
      column: { type: 'MULTIPLY', args: ['@price', '@quantity'] },
    });
    assertNumericAggregate({
      type: 'AVG',
      column: { type: 'ADD', args: [10, 20] },
    });
  });

  await t.step('invalid: missing column', () => {
    asserts.assertThrows(
      () => assertNumericAggregate({ type: 'SUM' }),
      TypeError,
      "Missing required property 'column'",
    );

    asserts.assertThrows(
      () => assertNumericAggregate({ type: 'AVG' }),
      TypeError,
      "Missing required property 'column'",
    );
  });

  await t.step('invalid: wrong type', () => {
    asserts.assertThrows(
      () => assertNumericAggregate({ type: 'COUNT', column: '@id' }),
      TypeError,
      'type must be one of SUM, MIN, MAX, AVG',
    );

    asserts.assertThrows(
      () => assertNumericAggregate({ type: 'STRING_AGG', column: '@name' }),
      TypeError,
      'type must be one of SUM, MIN, MAX, AVG',
    );
  });

  await t.step('invalid: column not ColumnIdentifier', () => {
    asserts.assertThrows(
      () => assertNumericAggregate({ type: 'SUM', column: 'amount' }),
      TypeError,
      "Must start with '@'",
    );
  });

  await t.step('invalid: column null or undefined', () => {
    asserts.assertThrows(
      () => assertNumericAggregate({ type: 'SUM', column: null }),
      TypeError,
      'column cannot be null or undefined',
    );
  });

  await t.step('invalid: unknown properties', () => {
    asserts.assertThrows(
      () =>
        assertNumericAggregate({
          type: 'SUM',
          column: '@amount',
          separator: ',',
        }),
      TypeError,
      'Unknown properties',
    );
  });

  await t.step('invalid: not an object', () => {
    asserts.assertThrows(
      () => assertNumericAggregate('invalid'),
      TypeError,
      'Expected an object',
    );

    asserts.assertThrows(
      () => assertNumericAggregate(null),
      TypeError,
      'Expected an object',
    );
  });

  await t.step('invalid: column not object when not string', () => {
    asserts.assertThrows(
      () => assertNumericAggregate({ type: 'SUM', column: 123 }),
      TypeError,
      'column must be a string (ColumnIdentifier) or Expression object',
    );

    asserts.assertThrows(
      () => assertNumericAggregate({ type: 'AVG', column: true }),
      TypeError,
      'column must be a string (ColumnIdentifier) or Expression object',
    );
  });

  await t.step('invalid: distinct not boolean', () => {
    asserts.assertThrows(
      () =>
        assertNumericAggregate({
          type: 'SUM',
          column: '@amount',
          distinct: 'yes',
        }),
      TypeError,
      'distinct must be a boolean',
    );
  });

  await t.step('invalid: invalid expression in column', () => {
    asserts.assertThrows(
      () =>
        assertNumericAggregate({ type: 'SUM', column: { type: 'INVALID' } }),
      TypeError,
      'Unknown type',
    );
  });

  await t.step('custom error messages', () => {
    asserts.assertThrows(
      () => assertNumericAggregate({ type: 'SUM' }, 'Custom error'),
      TypeError,
      'Custom error',
    );
  });
});

Deno.test('oql.asserts.Aggregate.assertStringAgg', async (t) => {
  await t.step('valid without separator', () => {
    assertStringAgg({ type: 'STRING_AGG', column: '@name' });
    assertStringAgg({ type: 'STRING_AGG', column: '@email' });
  });

  await t.step('valid with separator', () => {
    assertStringAgg({ type: 'STRING_AGG', column: '@name', separator: ', ' });
    assertStringAgg({ type: 'STRING_AGG', column: '@email', separator: '; ' });
    assertStringAgg({ type: 'STRING_AGG', column: '@tag', separator: ' | ' });
  });

  await t.step('valid with distinct', () => {
    assertStringAgg({
      type: 'STRING_AGG',
      column: '@tag',
      distinct: true,
    });
    assertStringAgg({
      type: 'STRING_AGG',
      column: '@category',
      separator: ', ',
      distinct: true,
    });
  });

  await t.step('valid with expression', () => {
    assertStringAgg({
      type: 'STRING_AGG',
      column: { type: 'UPPER', args: ['@name'] },
      separator: ', ',
    });
    assertStringAgg({
      type: 'STRING_AGG',
      column: { type: 'CONCAT', args: ['@firstName', ' ', '@lastName'] },
    });
  });

  await t.step('invalid: missing column', () => {
    asserts.assertThrows(
      () => assertStringAgg({ type: 'STRING_AGG' }),
      TypeError,
      "Missing required property 'column'",
    );
  });

  await t.step('invalid: separator not string', () => {
    asserts.assertThrows(
      () =>
        assertStringAgg({
          type: 'STRING_AGG',
          column: '@name',
          separator: 123,
        }),
      TypeError,
      'separator must be a string',
    );

    asserts.assertThrows(
      () =>
        assertStringAgg({
          type: 'STRING_AGG',
          column: '@name',
          separator: true,
        }),
      TypeError,
      'separator must be a string',
    );
  });

  await t.step('invalid: column not ColumnIdentifier', () => {
    asserts.assertThrows(
      () => assertStringAgg({ type: 'STRING_AGG', column: 'name' }),
      TypeError,
      "Must start with '@'",
    );
  });

  await t.step('invalid: unknown properties', () => {
    asserts.assertThrows(
      () =>
        assertStringAgg({
          type: 'STRING_AGG',
          column: '@name',
          extra: 'value',
        }),
      TypeError,
      'Unknown properties',
    );
  });

  await t.step('invalid: not an object', () => {
    asserts.assertThrows(
      () => assertStringAgg('invalid'),
      TypeError,
      'Expected an object',
    );

    asserts.assertThrows(
      () => assertStringAgg(null),
      TypeError,
      'Expected an object',
    );
  });

  await t.step('invalid: wrong type', () => {
    asserts.assertThrows(
      () => assertStringAgg({ type: 'SUM', column: '@name' }),
      TypeError,
      "type must be 'STRING_AGG'",
    );
  });

  await t.step('invalid: column null or undefined', () => {
    asserts.assertThrows(
      () => assertStringAgg({ type: 'STRING_AGG', column: null }),
      TypeError,
      'column cannot be null or undefined',
    );

    asserts.assertThrows(
      () => assertStringAgg({ type: 'STRING_AGG', column: undefined }),
      TypeError,
      'column cannot be null or undefined',
    );
  });

  await t.step('invalid: column not object when not string', () => {
    asserts.assertThrows(
      () => assertStringAgg({ type: 'STRING_AGG', column: 123 }),
      TypeError,
      'column must be a string (ColumnIdentifier) or Expression object',
    );

    asserts.assertThrows(
      () => assertStringAgg({ type: 'STRING_AGG', column: true }),
      TypeError,
      'column must be a string (ColumnIdentifier) or Expression object',
    );
  });

  await t.step('invalid: distinct not boolean', () => {
    asserts.assertThrows(
      () =>
        assertStringAgg({
          type: 'STRING_AGG',
          column: '@name',
          distinct: 'yes',
        }),
      TypeError,
      'distinct must be a boolean',
    );
  });

  await t.step('invalid: separator null', () => {
    asserts.assertThrows(
      () =>
        assertStringAgg({
          type: 'STRING_AGG',
          column: '@name',
          separator: null,
        }),
      TypeError,
      'separator must be a string',
    );
  });

  await t.step('invalid: invalid expression in column', () => {
    asserts.assertThrows(
      () =>
        assertStringAgg({ type: 'STRING_AGG', column: { type: 'INVALID' } }),
      TypeError,
      'Unknown type',
    );
  });

  await t.step('custom error messages', () => {
    asserts.assertThrows(
      () => assertStringAgg({ type: 'STRING_AGG' }, 'Custom error'),
      TypeError,
      'Custom error',
    );
  });
});

Deno.test('oql.asserts.Aggregate.assertArrayAgg', async (t) => {
  await t.step('valid', () => {
    assertArrayAgg({ type: 'ARRAY_AGG', column: '@id' });
    assertArrayAgg({ type: 'ARRAY_AGG', column: '@productId' });
    assertArrayAgg({ type: 'ARRAY_AGG', column: '@users.@id' });
  });

  await t.step('valid with distinct', () => {
    assertArrayAgg({ type: 'ARRAY_AGG', column: '@tag', distinct: true });
    assertArrayAgg({ type: 'ARRAY_AGG', column: '@userId', distinct: false });
  });

  await t.step('valid with expression', () => {
    assertArrayAgg({
      type: 'ARRAY_AGG',
      column: { type: 'LOWER', args: ['@email'] },
    });
    assertArrayAgg({
      type: 'ARRAY_AGG',
      column: { type: 'CONCAT', args: ['@first', '@last'] },
    });
  });

  await t.step('invalid: missing column', () => {
    asserts.assertThrows(
      () => assertArrayAgg({ type: 'ARRAY_AGG' }),
      TypeError,
      "Missing required property 'column'",
    );
  });

  await t.step('invalid: column not ColumnIdentifier', () => {
    asserts.assertThrows(
      () => assertArrayAgg({ type: 'ARRAY_AGG', column: 'id' }),
      TypeError,
      "Must start with '@'",
    );
  });

  await t.step('invalid: unknown properties', () => {
    asserts.assertThrows(
      () =>
        assertArrayAgg({ type: 'ARRAY_AGG', column: '@id', separator: ',' }),
      TypeError,
      'Unknown properties',
    );
  });

  await t.step('invalid: not an object', () => {
    asserts.assertThrows(
      () => assertArrayAgg('invalid'),
      TypeError,
      'Expected an object',
    );

    asserts.assertThrows(
      () => assertArrayAgg(null),
      TypeError,
      'Expected an object',
    );
  });

  await t.step('invalid: wrong type', () => {
    asserts.assertThrows(
      () => assertArrayAgg({ type: 'SUM', column: '@id' }),
      TypeError,
      "type must be 'ARRAY_AGG'",
    );
  });

  await t.step('invalid: column null or undefined', () => {
    asserts.assertThrows(
      () => assertArrayAgg({ type: 'ARRAY_AGG', column: null }),
      TypeError,
      'column cannot be null or undefined',
    );

    asserts.assertThrows(
      () => assertArrayAgg({ type: 'ARRAY_AGG', column: undefined }),
      TypeError,
      'column cannot be null or undefined',
    );
  });

  await t.step('invalid: column not object when not string', () => {
    asserts.assertThrows(
      () => assertArrayAgg({ type: 'ARRAY_AGG', column: 123 }),
      TypeError,
      'column must be a string (ColumnIdentifier) or Expression object',
    );

    asserts.assertThrows(
      () => assertArrayAgg({ type: 'ARRAY_AGG', column: true }),
      TypeError,
      'column must be a string (ColumnIdentifier) or Expression object',
    );
  });

  await t.step('invalid: distinct not boolean', () => {
    asserts.assertThrows(
      () =>
        assertArrayAgg({ type: 'ARRAY_AGG', column: '@id', distinct: 'yes' }),
      TypeError,
      'distinct must be a boolean',
    );
  });

  await t.step('invalid: invalid expression in column', () => {
    asserts.assertThrows(
      () => assertArrayAgg({ type: 'ARRAY_AGG', column: { type: 'INVALID' } }),
      TypeError,
      'Unknown type',
    );
  });

  await t.step('custom error messages', () => {
    asserts.assertThrows(
      () => assertArrayAgg({ type: 'ARRAY_AGG' }, 'Custom error'),
      TypeError,
      'Custom error',
    );
  });
});

Deno.test('oql.asserts.Aggregate.assertJsonRow', async (t) => {
  await t.step('valid with simple columns', () => {
    assertJsonRow({
      type: 'JSON_ROW',
      columns: { userId: '@id', userName: '@name' },
    });
  });

  await t.step('valid with qualified columns', () => {
    assertJsonRow({
      type: 'JSON_ROW',
      columns: {
        id: '@user.@id',
        email: '@user.@profile.@email',
      },
    });
  });

  await t.step('valid with multiple columns', () => {
    assertJsonRow({
      type: 'JSON_ROW',
      columns: {
        userId: '@id',
        userName: '@name',
        userEmail: '@email',
        userCreated: '@createdAt',
      },
    });
  });

  await t.step('valid with expression', () => {
    assertJsonRow({
      type: 'JSON_ROW',
      columns: {
        fullName: { type: 'CONCAT', args: ['@firstName', ' ', '@lastName'] },
        email: '@email',
      },
    });
    assertJsonRow({
      type: 'JSON_ROW',
      columns: {
        total: { type: 'ADD', args: ['@price', '@tax'] },
      },
    });
  });

  await t.step('invalid: missing columns', () => {
    asserts.assertThrows(
      () => assertJsonRow({ type: 'JSON_ROW' }),
      TypeError,
      "Missing required property 'columns'",
    );
  });

  await t.step('invalid: empty columns', () => {
    asserts.assertThrows(
      () => assertJsonRow({ type: 'JSON_ROW', columns: {} }),
      TypeError,
      'columns cannot be empty',
    );
  });

  await t.step('invalid: columns not object', () => {
    asserts.assertThrows(
      () => assertJsonRow({ type: 'JSON_ROW', columns: [] }),
      TypeError,
      'columns must be a plain object',
    );

    asserts.assertThrows(
      () => assertJsonRow({ type: 'JSON_ROW', columns: 'invalid' }),
      TypeError,
      'columns must be a plain object',
    );
  });

  await t.step('invalid: column value not ColumnIdentifier', () => {
    asserts.assertThrows(
      () => assertJsonRow({ type: 'JSON_ROW', columns: { id: 'invalid' } }),
      TypeError,
      "Must start with '@'",
    );

    asserts.assertThrows(
      () =>
        assertJsonRow({
          type: 'JSON_ROW',
          columns: { id: '@id', name: 'name' },
        }),
      TypeError,
      "Must start with '@'",
    );
  });

  await t.step('invalid: column value null or undefined', () => {
    asserts.assertThrows(
      () => assertJsonRow({ type: 'JSON_ROW', columns: { id: null } }),
      TypeError,
      'cannot be null or undefined',
    );

    asserts.assertThrows(
      () => assertJsonRow({ type: 'JSON_ROW', columns: { id: undefined } }),
      TypeError,
      'cannot be null or undefined',
    );
  });

  await t.step('invalid: unknown properties', () => {
    asserts.assertThrows(
      () =>
        assertJsonRow({
          type: 'JSON_ROW',
          columns: { id: '@id' },
          distinct: true,
        }),
      TypeError,
      'Unknown properties',
    );
  });

  await t.step('invalid: not an object', () => {
    asserts.assertThrows(
      () => assertJsonRow('invalid'),
      TypeError,
      'Expected an object',
    );

    asserts.assertThrows(
      () => assertJsonRow(null),
      TypeError,
      'Expected an object',
    );
  });

  await t.step('invalid: wrong type', () => {
    asserts.assertThrows(
      () => assertJsonRow({ type: 'SUM', columns: { id: '@id' } }),
      TypeError,
      "type must be 'JSON_ROW'",
    );
  });

  await t.step('invalid: columns null or undefined', () => {
    asserts.assertThrows(
      () => assertJsonRow({ type: 'JSON_ROW', columns: null }),
      TypeError,
      'columns cannot be null or undefined',
    );

    asserts.assertThrows(
      () => assertJsonRow({ type: 'JSON_ROW', columns: undefined }),
      TypeError,
      'columns cannot be null or undefined',
    );
  });

  await t.step('invalid: column value not object when not string', () => {
    asserts.assertThrows(
      () => assertJsonRow({ type: 'JSON_ROW', columns: { id: 123 } }),
      TypeError,
      'must be a string (ColumnIdentifier) or Expression object',
    );

    asserts.assertThrows(
      () => assertJsonRow({ type: 'JSON_ROW', columns: { id: true } }),
      TypeError,
      'must be a string (ColumnIdentifier) or Expression object',
    );
  });

  await t.step('invalid: invalid expression in column value', () => {
    asserts.assertThrows(
      () =>
        assertJsonRow({
          type: 'JSON_ROW',
          columns: { id: { type: 'INVALID' } },
        }),
      TypeError,
      'Unknown type',
    );
  });

  await t.step('custom error messages', () => {
    asserts.assertThrows(
      () => assertJsonRow({ type: 'JSON_ROW' }, 'Custom error'),
      TypeError,
      'Custom error',
    );
  });
});

Deno.test('oql.asserts.Aggregate.assertAggregate', async (t) => {
  await t.step('delegates to assertCount', () => {
    assertAggregate({ type: 'COUNT' });
    assertAggregate({ type: 'COUNT', column: '@id' });
  });

  await t.step('delegates to assertNumericAggregate', () => {
    assertAggregate({ type: 'SUM', column: '@amount' });
    assertAggregate({ type: 'MIN', column: '@createdAt' });
    assertAggregate({ type: 'MAX', column: '@total' });
    assertAggregate({ type: 'AVG', column: '@price' });
  });

  await t.step('delegates to assertStringAgg', () => {
    assertAggregate({ type: 'STRING_AGG', column: '@name' });
    assertAggregate({
      type: 'STRING_AGG',
      column: '@email',
      separator: '; ',
    });
  });

  await t.step('delegates to assertArrayAgg', () => {
    assertAggregate({ type: 'ARRAY_AGG', column: '@id' });
  });

  await t.step('delegates to assertJsonRow', () => {
    assertAggregate({
      type: 'JSON_ROW',
      columns: { userId: '@id', userName: '@name' },
    });
  });

  await t.step('invalid: not an object', () => {
    asserts.assertThrows(
      () => assertAggregate('invalid'),
      TypeError,
      'Expected an object',
    );

    asserts.assertThrows(
      () => assertAggregate(123),
      TypeError,
      'Expected an object',
    );

    asserts.assertThrows(
      () => assertAggregate(null),
      TypeError,
      'Expected an object',
    );
  });

  await t.step('invalid: missing type', () => {
    asserts.assertThrows(
      () => assertAggregate({ column: '@id' }),
      TypeError,
      "Missing required property 'type'",
    );

    asserts.assertThrows(
      () => assertAggregate({}),
      TypeError,
      "Missing required property 'type'",
    );
  });

  await t.step('invalid: type not string', () => {
    asserts.assertThrows(
      () => assertAggregate({ type: 123 }),
      TypeError,
      "type' must be a string",
    );
  });

  await t.step('invalid: unknown type', () => {
    asserts.assertThrows(
      () => assertAggregate({ type: 'INVALID' }),
      TypeError,
      'Unknown type',
    );

    asserts.assertThrows(
      () => assertAggregate({ type: 'GROUP_BY' }),
      TypeError,
      'Unknown type',
    );
  });

  await t.step('with Expression objects', () => {
    assertAggregate({
      type: 'SUM',
      column: { type: 'ADD', args: ['@price', '@tax'] },
    });

    assertAggregate({
      type: 'COUNT',
      column: { type: 'CONCAT', args: ['@firstName', '@lastName'] },
    });

    assertAggregate({
      type: 'JSON_ROW',
      columns: {
        total: { type: 'MULTIPLY', args: ['@quantity', '@price'] },
      },
    });
  });

  await t.step('custom error messages', () => {
    asserts.assertThrows(
      () => assertAggregate('invalid', 'Custom error'),
      TypeError,
      'Custom error',
    );
  });
});
