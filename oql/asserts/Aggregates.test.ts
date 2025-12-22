/**
 * Test suite for Aggregates validators
 *
 * Comprehensive tests for all aggregate function validators with 100% coverage.
 */
import * as asserts from '$asserts';
import {
  assertAggregate,
  assertArrayAggAggregate,
  assertAvgAggregate,
  assertCountAggregate,
  assertJsonRowAggregate,
  assertMaxAggregate,
  assertMinAggregate,
  assertStringAggAggregate,
  assertSumAggregate,
  isAggregate,
  isArrayAggAggregate,
  isAvgAggregate,
  isCountAggregate,
  isJsonRowAggregate,
  isMaxAggregate,
  isMinAggregate,
  isStringAggAggregate,
  isSumAggregate,
} from './Aggregates.ts';

Deno.test('oql.asserts.Aggregates', async (t) => {
  await t.step('COUNT aggregate', async (u) => {
    await u.step('valid: COUNT(*)', () => {
      assertCountAggregate({ type: 'COUNT' });
    });

    await u.step('valid: COUNT with column', () => {
      assertCountAggregate({ type: 'COUNT', column: '@userId' }, ['userId']);
    });

    await u.step('valid: COUNT DISTINCT', () => {
      assertCountAggregate({
        type: 'COUNT',
        column: '@email',
        distinct: true,
      }, ['email']);
    });

    await u.step('valid: COUNT with expression', () => {
      assertCountAggregate({
        type: 'COUNT',
        column: { type: 'ADD', args: [1, 2] },
      });
    });

    await u.step('invalid: not an object', () => {
      asserts.assertThrows(
        () => assertCountAggregate('COUNT' as any),
        TypeError,
        'Expected object',
      );
    });

    await u.step('invalid: null', () => {
      asserts.assertThrows(
        () => assertCountAggregate(null as any),
        TypeError,
        'Expected object',
      );
    });

    await u.step('invalid: missing type', () => {
      asserts.assertThrows(
        () => assertCountAggregate({} as any),
        TypeError,
        "Missing 'type' property",
      );
    });

    await u.step('invalid: type not string', () => {
      asserts.assertThrows(
        () => assertCountAggregate({ type: 123 } as any),
        TypeError,
        "'type' must be a string",
      );
    });

    await u.step('invalid: unknown aggregate type', () => {
      asserts.assertThrows(
        () => assertCountAggregate({ type: 'INVALID' } as any),
        TypeError,
        'Expected one of COUNT, SUM, AVG, MIN, MAX, STRING_AGG, ARRAY_AGG, JSON_ROW',
      );
    });

    await u.step('invalid: wrong type', () => {
      asserts.assertThrows(
        () => assertCountAggregate({ type: 'SUM' } as any),
        TypeError,
        "Expected type 'COUNT'",
      );
    });

    await u.step('invalid: distinct without column', () => {
      asserts.assertThrows(
        () => assertCountAggregate({ type: 'COUNT', distinct: true } as any),
        TypeError,
        "'distinct' cannot be used without a column",
      );
    });

    await u.step('invalid: distinct not boolean', () => {
      asserts.assertThrows(
        () =>
          assertCountAggregate({
            type: 'COUNT',
            column: '@id',
            distinct: 'yes',
          } as any, ['id']),
        TypeError,
        "'distinct' must be a boolean",
      );
    });

    await u.step('invalid: column is string literal', () => {
      asserts.assertThrows(
        () => assertCountAggregate({ type: 'COUNT', column: 'literal' } as any),
        TypeError,
        "Column must be a column identifier (starting with '@') or an expression",
      );
    });

    await u.step('invalid: column is number', () => {
      asserts.assertThrows(
        () => assertCountAggregate({ type: 'COUNT', column: 123 } as any),
        TypeError,
        'Column must be a column identifier or expression',
      );
    });

    await u.step('invalid: invalid column identifier', () => {
      asserts.assertThrows(
        () =>
          assertCountAggregate({ type: 'COUNT', column: '@invalid' }, [
            'valid',
          ]),
        TypeError,
        'Invalid column identifier @invalid',
      );
    });

    await u.step('invalid: invalid expression', () => {
      asserts.assertThrows(
        () =>
          assertCountAggregate({
            type: 'COUNT',
            column: { type: 'INVALID_EXPR' },
          } as any),
        TypeError,
        'Invalid expression',
      );
    });

    await u.step('type guard: valid and invalid', () => {
      asserts.assertEquals(isCountAggregate({ type: 'COUNT' }), true);
      asserts.assertEquals(
        isCountAggregate({ type: 'COUNT', column: '@id' }, ['id']),
        true,
      );
      asserts.assertEquals(isCountAggregate({ type: 'SUM' }), false);
      asserts.assertEquals(isCountAggregate('invalid'), false);
    });
  });

  await t.step('SUM aggregate', async (u) => {
    await u.step('valid: SUM with column', () => {
      assertSumAggregate({ type: 'SUM', column: '@amount' }, ['amount']);
    });

    await u.step('valid: SUM DISTINCT', () => {
      assertSumAggregate({
        type: 'SUM',
        column: '@price',
        distinct: true,
      }, ['price']);
    });

    await u.step('valid: SUM with numeric expression', () => {
      assertSumAggregate({
        type: 'SUM',
        column: { type: 'MULTIPLY', args: ['@qty', '@price'] },
      }, ['qty', 'price']);
    });

    await u.step('invalid: wrong type', () => {
      asserts.assertThrows(
        () => assertSumAggregate({ type: 'AVG' } as any),
        TypeError,
        "Expected type 'SUM'",
      );
    });

    await u.step('invalid: missing column', () => {
      asserts.assertThrows(
        () => assertSumAggregate({ type: 'SUM' } as any),
        TypeError,
        "Missing 'column' property",
      );
    });

    await u.step('invalid: column is string literal', () => {
      asserts.assertThrows(
        () => assertSumAggregate({ type: 'SUM', column: 'literal' } as any),
        TypeError,
        "Column must be a column identifier (starting with '@') or an expression",
      );
    });

    await u.step('invalid: non-numeric expression', () => {
      asserts.assertThrows(
        () =>
          assertSumAggregate({
            type: 'SUM',
            column: { type: 'CONCAT', args: ['a', 'b'] },
          } as any),
        TypeError,
        'Invalid expression',
      );
    });

    await u.step('invalid: distinct not boolean', () => {
      asserts.assertThrows(
        () =>
          assertSumAggregate({
            type: 'SUM',
            column: '@amount',
            distinct: 1,
          } as any, ['amount']),
        TypeError,
        "'distinct' must be a boolean",
      );
    });

    await u.step('type guard: valid and invalid', () => {
      asserts.assertEquals(
        isSumAggregate({ type: 'SUM', column: '@val' }, ['val']),
        true,
      );
      asserts.assertEquals(isSumAggregate({ type: 'SUM' }), false);
      asserts.assertEquals(isSumAggregate({ type: 'COUNT' }), false);
    });
  });

  await t.step('AVG aggregate', async (u) => {
    await u.step('valid: AVG with column', () => {
      assertAvgAggregate({ type: 'AVG', column: '@score' }, ['score']);
    });

    await u.step('valid: AVG DISTINCT', () => {
      assertAvgAggregate({
        type: 'AVG',
        column: '@rating',
        distinct: true,
      }, ['rating']);
    });

    await u.step('valid: AVG with numeric expression', () => {
      assertAvgAggregate({
        type: 'AVG',
        column: { type: 'ABS', args: ['@value'] },
      }, ['value']);
    });

    await u.step('invalid: wrong type', () => {
      asserts.assertThrows(
        () => assertAvgAggregate({ type: 'MIN' } as any),
        TypeError,
        "Expected type 'AVG'",
      );
    });

    await u.step('invalid: missing column', () => {
      asserts.assertThrows(
        () => assertAvgAggregate({ type: 'AVG' } as any),
        TypeError,
        "Missing 'column' property",
      );
    });

    await u.step('invalid: invalid column identifier', () => {
      asserts.assertThrows(
        () =>
          assertAvgAggregate({ type: 'AVG', column: '@invalid' }, ['valid']),
        TypeError,
        'Invalid column identifier @invalid',
      );
    });

    await u.step('type guard: valid and invalid', () => {
      asserts.assertEquals(
        isAvgAggregate({ type: 'AVG', column: '@num' }, ['num']),
        true,
      );
      asserts.assertEquals(isAvgAggregate({ type: 'AVG' }), false);
    });
  });

  await t.step('MIN aggregate', async (u) => {
    await u.step('valid: MIN with column', () => {
      assertMinAggregate({ type: 'MIN', column: '@price' }, ['price']);
    });

    await u.step('valid: MIN DISTINCT', () => {
      assertMinAggregate({
        type: 'MIN',
        column: '@age',
        distinct: true,
      }, ['age']);
    });

    await u.step('valid: MIN with numeric expression', () => {
      assertMinAggregate({
        type: 'MIN',
        column: { type: 'FLOOR', args: ['@value'] },
      }, ['value']);
    });

    await u.step('invalid: wrong type', () => {
      asserts.assertThrows(
        () => assertMinAggregate({ type: 'MAX' } as any),
        TypeError,
        "Expected type 'MIN'",
      );
    });

    await u.step('invalid: missing column', () => {
      asserts.assertThrows(
        () => assertMinAggregate({ type: 'MIN' } as any),
        TypeError,
        "Missing 'column' property",
      );
    });

    await u.step('invalid: column is number', () => {
      asserts.assertThrows(
        () => assertMinAggregate({ type: 'MIN', column: 42 } as any),
        TypeError,
        'Column must be a column identifier or expression',
      );
    });

    await u.step('type guard: valid and invalid', () => {
      asserts.assertEquals(
        isMinAggregate({ type: 'MIN', column: '@val' }, ['val']),
        true,
      );
      asserts.assertEquals(isMinAggregate({ type: 'MIN' }), false);
    });
  });

  await t.step('MAX aggregate', async (u) => {
    await u.step('valid: MAX with column', () => {
      assertMaxAggregate({ type: 'MAX', column: '@quantity' }, ['quantity']);
    });

    await u.step('valid: MAX DISTINCT', () => {
      assertMaxAggregate({
        type: 'MAX',
        column: '@amount',
        distinct: true,
      }, ['amount']);
    });

    await u.step('valid: MAX with numeric expression', () => {
      assertMaxAggregate({
        type: 'MAX',
        column: { type: 'CEIL', args: ['@value'] },
      }, ['value']);
    });

    await u.step('invalid: wrong type', () => {
      asserts.assertThrows(
        () => assertMaxAggregate({ type: 'MIN' } as any),
        TypeError,
        "Expected type 'MAX'",
      );
    });

    await u.step('invalid: missing column', () => {
      asserts.assertThrows(
        () => assertMaxAggregate({ type: 'MAX' } as any),
        TypeError,
        "Missing 'column' property",
      );
    });

    await u.step('invalid: column is string literal', () => {
      asserts.assertThrows(
        () => assertMaxAggregate({ type: 'MAX', column: 'literal' } as any),
        TypeError,
        "Column must be a column identifier (starting with '@') or an expression",
      );
    });

    await u.step('type guard: valid and invalid', () => {
      asserts.assertEquals(
        isMaxAggregate({ type: 'MAX', column: '@val' }, ['val']),
        true,
      );
      asserts.assertEquals(isMaxAggregate({ type: 'MAX' }), false);
    });
  });

  await t.step('STRING_AGG aggregate', async (u) => {
    await u.step('valid: with separator', () => {
      assertStringAggAggregate({
        type: 'STRING_AGG',
        column: '@name',
        separator: ', ',
      }, ['name']);
    });

    await u.step('valid: without separator', () => {
      assertStringAggAggregate({
        type: 'STRING_AGG',
        column: '@tag',
      }, ['tag']);
    });

    await u.step('valid: with DISTINCT', () => {
      assertStringAggAggregate({
        type: 'STRING_AGG',
        column: '@category',
        separator: ';',
        distinct: true,
      }, ['category']);
    });

    await u.step('valid: with expression', () => {
      assertStringAggAggregate({
        type: 'STRING_AGG',
        column: { type: 'UPPER', args: '@name' },
        separator: ' | ',
      }, ['name']);
    });

    await u.step('invalid: wrong type', () => {
      asserts.assertThrows(
        () => assertStringAggAggregate({ type: 'ARRAY_AGG' } as any),
        TypeError,
        "Expected type 'STRING_AGG'",
      );
    });

    await u.step('invalid: missing column', () => {
      asserts.assertThrows(
        () => assertStringAggAggregate({ type: 'STRING_AGG' } as any),
        TypeError,
        "Missing 'column' property",
      );
    });

    await u.step('invalid: separator not string', () => {
      asserts.assertThrows(
        () =>
          assertStringAggAggregate({
            type: 'STRING_AGG',
            column: '@name',
            separator: 123,
          } as any, ['name']),
        TypeError,
        "'separator' must be a string",
      );
    });

    await u.step('invalid: invalid column', () => {
      asserts.assertThrows(
        () =>
          assertStringAggAggregate({
            type: 'STRING_AGG',
            column: '@invalid',
          }, ['valid']),
        TypeError,
        'Invalid column identifier @invalid',
      );
    });

    await u.step('type guard: valid and invalid', () => {
      asserts.assertEquals(
        isStringAggAggregate({
          type: 'STRING_AGG',
          column: '@val',
          separator: ',',
        }, ['val']),
        true,
      );
      asserts.assertEquals(isStringAggAggregate({ type: 'STRING_AGG' }), false);
    });
  });

  await t.step('ARRAY_AGG aggregate', async (u) => {
    await u.step('valid: with column', () => {
      assertArrayAggAggregate({
        type: 'ARRAY_AGG',
        column: '@id',
      }, ['id']);
    });

    await u.step('valid: with DISTINCT', () => {
      assertArrayAggAggregate({
        type: 'ARRAY_AGG',
        column: '@category',
        distinct: true,
      }, ['category']);
    });

    await u.step('valid: with expression', () => {
      assertArrayAggAggregate({
        type: 'ARRAY_AGG',
        column: { type: 'LENGTH', args: '@name' },
      }, ['name']);
    });

    await u.step('invalid: wrong type', () => {
      asserts.assertThrows(
        () => assertArrayAggAggregate({ type: 'STRING_AGG' } as any),
        TypeError,
        "Expected type 'ARRAY_AGG'",
      );
    });

    await u.step('invalid: missing column', () => {
      asserts.assertThrows(
        () => assertArrayAggAggregate({ type: 'ARRAY_AGG' } as any),
        TypeError,
        "Missing 'column' property",
      );
    });

    await u.step('invalid: column is string literal', () => {
      asserts.assertThrows(
        () =>
          assertArrayAggAggregate({
            type: 'ARRAY_AGG',
            column: 'literal',
          } as any),
        TypeError,
        "Column must be a column identifier (starting with '@') or an expression",
      );
    });

    await u.step('invalid: invalid expression', () => {
      asserts.assertThrows(
        () =>
          assertArrayAggAggregate({
            type: 'ARRAY_AGG',
            column: { type: 'BAD_EXPR' },
          } as any),
        TypeError,
        'Invalid expression',
      );
    });

    await u.step('type guard: valid and invalid', () => {
      asserts.assertEquals(
        isArrayAggAggregate({ type: 'ARRAY_AGG', column: '@val' }, ['val']),
        true,
      );
      asserts.assertEquals(isArrayAggAggregate({ type: 'ARRAY_AGG' }), false);
    });
  });

  await t.step('JSON_ROW aggregate', async (u) => {
    await u.step('valid: with columns', () => {
      assertJsonRowAggregate({
        type: 'JSON_ROW',
        columns: {
          userId: '@id',
          userName: '@name',
          userEmail: '@email',
        },
      }, ['id', 'name', 'email']);
    });

    await u.step('valid: with expressions', () => {
      assertJsonRowAggregate({
        type: 'JSON_ROW',
        columns: {
          fullName: { type: 'CONCAT', args: ['@first', ' ', '@last'] },
          age: '@age',
        },
      }, ['first', 'last', 'age']);
    });

    await u.step('invalid: wrong type', () => {
      asserts.assertThrows(
        () => assertJsonRowAggregate({ type: 'ARRAY_AGG' } as any),
        TypeError,
        "Expected type 'JSON_ROW'",
      );
    });

    await u.step('invalid: missing columns', () => {
      asserts.assertThrows(
        () => assertJsonRowAggregate({ type: 'JSON_ROW' } as any),
        TypeError,
        "Missing 'columns' property",
      );
    });

    await u.step('invalid: columns not object', () => {
      asserts.assertThrows(
        () =>
          assertJsonRowAggregate({
            type: 'JSON_ROW',
            columns: 'invalid',
          } as any),
        TypeError,
        "'columns' must be an object (key-value mapping)",
      );
    });

    await u.step('invalid: columns is null', () => {
      asserts.assertThrows(
        () =>
          assertJsonRowAggregate({
            type: 'JSON_ROW',
            columns: null,
          } as any),
        TypeError,
        "'columns' must be an object (key-value mapping)",
      );
    });

    await u.step('invalid: columns is array', () => {
      asserts.assertThrows(
        () =>
          assertJsonRowAggregate({
            type: 'JSON_ROW',
            columns: [],
          } as any),
        TypeError,
        "'columns' must be an object (key-value mapping)",
      );
    });

    await u.step('invalid: empty column key', () => {
      asserts.assertThrows(
        () =>
          assertJsonRowAggregate({
            type: 'JSON_ROW',
            columns: { '': '@id' },
          } as any, ['id']),
        TypeError,
        'Column keys must be non-empty strings',
      );
    });

    await u.step('invalid: column value is string literal', () => {
      asserts.assertThrows(
        () =>
          assertJsonRowAggregate({
            type: 'JSON_ROW',
            columns: { name: 'literal' },
          } as any),
        TypeError,
        "Column must be a column identifier (starting with '@') or an expression",
      );
    });

    await u.step('invalid: column value is number', () => {
      asserts.assertThrows(
        () =>
          assertJsonRowAggregate({
            type: 'JSON_ROW',
            columns: { id: 123 },
          } as any),
        TypeError,
        'Column must be a column identifier or expression',
      );
    });

    await u.step('invalid: invalid column identifier', () => {
      asserts.assertThrows(
        () =>
          assertJsonRowAggregate({
            type: 'JSON_ROW',
            columns: { userId: '@invalid' },
          }, ['valid']),
        TypeError,
        'Invalid column identifier @invalid',
      );
    });

    await u.step('invalid: invalid expression', () => {
      asserts.assertThrows(
        () =>
          assertJsonRowAggregate({
            type: 'JSON_ROW',
            columns: { name: { type: 'BAD' } },
          } as any),
        TypeError,
        'Invalid expression',
      );
    });

    await u.step('invalid: distinct not allowed', () => {
      asserts.assertThrows(
        () =>
          assertJsonRowAggregate({
            type: 'JSON_ROW',
            columns: { id: '@id' },
            distinct: true,
          } as any, ['id']),
        TypeError,
        "'distinct' is not supported for JSON_ROW",
      );
    });

    await u.step('type guard: valid and invalid', () => {
      asserts.assertEquals(
        isJsonRowAggregate({
          type: 'JSON_ROW',
          columns: { id: '@id' },
        }, ['id']),
        true,
      );
      asserts.assertEquals(isJsonRowAggregate({ type: 'JSON_ROW' }), false);
    });
  });

  await t.step('general aggregate functions', async (u) => {
    await u.step('valid: delegates to COUNT', () => {
      assertAggregate({ type: 'COUNT' });
    });

    await u.step('valid: delegates to SUM', () => {
      assertAggregate({ type: 'SUM', column: '@val' }, ['val']);
    });

    await u.step('valid: delegates to AVG', () => {
      assertAggregate({ type: 'AVG', column: '@val' }, ['val']);
    });

    await u.step('valid: delegates to MIN', () => {
      assertAggregate({ type: 'MIN', column: '@val' }, ['val']);
    });

    await u.step('valid: delegates to MAX', () => {
      assertAggregate({ type: 'MAX', column: '@val' }, ['val']);
    });

    await u.step('valid: delegates to STRING_AGG', () => {
      assertAggregate({
        type: 'STRING_AGG',
        column: '@val',
        separator: ',',
      }, ['val']);
    });

    await u.step('valid: delegates to ARRAY_AGG', () => {
      assertAggregate({ type: 'ARRAY_AGG', column: '@val' }, ['val']);
    });

    await u.step('valid: delegates to JSON_ROW', () => {
      assertAggregate({
        type: 'JSON_ROW',
        columns: { id: '@id' },
      }, ['id']);
    });

    await u.step('invalid: not an object', () => {
      asserts.assertThrows(
        () => assertAggregate('invalid' as any),
        TypeError,
        'Expected object',
      );
    });

    await u.step('invalid: missing type', () => {
      asserts.assertThrows(
        () => assertAggregate({} as any),
        TypeError,
        "Missing 'type' property",
      );
    });

    await u.step('type guard: valid aggregates', () => {
      asserts.assertEquals(isAggregate({ type: 'COUNT' }), true);
      asserts.assertEquals(
        isAggregate({ type: 'SUM', column: '@val' }, ['val']),
        true,
      );
      asserts.assertEquals(
        isAggregate({ type: 'JSON_ROW', columns: { id: '@id' } }, ['id']),
        true,
      );
    });

    await u.step('type guard: invalid aggregates', () => {
      asserts.assertEquals(isAggregate('invalid'), false);
      asserts.assertEquals(isAggregate({}), false);
      asserts.assertEquals(isAggregate({ type: 'INVALID' }), false);
      asserts.assertEquals(isAggregate({ type: 'SUM' }), false);
    });
  });

  await t.step('integration tests', async (u) => {
    await u.step('filter valid aggregates', () => {
      const mixed: unknown[] = [
        { type: 'COUNT' },
        { type: 'SUM', column: '@val' },
        'invalid',
        { type: 'INVALID' },
        { type: 'AVG', column: '@score' },
      ];

      const validAggs = mixed.filter((x) => isAggregate(x, ['val', 'score']));
      asserts.assertEquals(validAggs.length, 3);
    });

    await u.step('type narrowing with type guards', () => {
      const value: unknown = { type: 'COUNT', column: '@id' };

      if (isCountAggregate(value, ['id'])) {
        asserts.assertEquals(value.type, 'COUNT');
      } else {
        asserts.fail('Should be valid COUNT aggregate');
      }
    });

    await u.step('validate complex aggregates with nested expressions', () => {
      const complexAgg = {
        type: 'JSON_ROW',
        columns: {
          totalAmount: { type: 'SUM', column: '@amount' },
          avgPrice: { type: 'AVG', column: '@price' },
          itemCount: { type: 'COUNT', column: '@id' },
        },
      };

      asserts.assertThrows(
        () =>
          assertJsonRowAggregate(complexAgg as any, ['amount', 'price', 'id']),
        TypeError,
        'Invalid expression',
      );
    });
  });
});
