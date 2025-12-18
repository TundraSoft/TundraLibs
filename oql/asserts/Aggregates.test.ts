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
  //#region COUNT Aggregate Tests

  await t.step('assertCountAggregate - valid: COUNT(*)', () => {
    assertCountAggregate({ type: 'COUNT' });
  });

  await t.step('assertCountAggregate - valid: COUNT with column', () => {
    assertCountAggregate({ type: 'COUNT', column: '@userId' }, ['userId']);
  });

  await t.step('assertCountAggregate - valid: COUNT DISTINCT', () => {
    assertCountAggregate({
      type: 'COUNT',
      column: '@email',
      distinct: true,
    }, ['email']);
  });

  await t.step('assertCountAggregate - valid: COUNT with expression', () => {
    assertCountAggregate({
      type: 'COUNT',
      column: { type: 'ADD', args: [1, 2] },
    });
  });

  await t.step('assertCountAggregate - invalid: not an object', () => {
    asserts.assertThrows(
      () => assertCountAggregate('COUNT' as any),
      TypeError,
      'Expected object',
    );
  });

  await t.step('assertCountAggregate - invalid: null', () => {
    asserts.assertThrows(
      () => assertCountAggregate(null as any),
      TypeError,
      'Expected object',
    );
  });

  await t.step('assertCountAggregate - invalid: missing type', () => {
    asserts.assertThrows(
      () => assertCountAggregate({} as any),
      TypeError,
      "Missing 'type' property",
    );
  });

  await t.step('assertCountAggregate - invalid: type not string', () => {
    asserts.assertThrows(
      () => assertCountAggregate({ type: 123 } as any),
      TypeError,
      "'type' must be a string",
    );
  });

  await t.step('assertCountAggregate - invalid: unknown aggregate type', () => {
    asserts.assertThrows(
      () => assertCountAggregate({ type: 'INVALID' } as any),
      TypeError,
      'Expected one of COUNT, SUM, AVG, MIN, MAX, STRING_AGG, ARRAY_AGG, JSON_ROW',
    );
  });

  await t.step('assertCountAggregate - invalid: wrong type', () => {
    asserts.assertThrows(
      () => assertCountAggregate({ type: 'SUM' } as any),
      TypeError,
      "Expected type 'COUNT'",
    );
  });

  await t.step(
    'assertCountAggregate - invalid: distinct without column',
    () => {
      asserts.assertThrows(
        () => assertCountAggregate({ type: 'COUNT', distinct: true } as any),
        TypeError,
        "'distinct' cannot be used without a column",
      );
    },
  );

  await t.step('assertCountAggregate - invalid: distinct not boolean', () => {
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

  await t.step(
    'assertCountAggregate - invalid: column is string literal',
    () => {
      asserts.assertThrows(
        () => assertCountAggregate({ type: 'COUNT', column: 'literal' } as any),
        TypeError,
        "Column must be a column identifier (starting with '@') or an expression",
      );
    },
  );

  await t.step('assertCountAggregate - invalid: column is number', () => {
    asserts.assertThrows(
      () => assertCountAggregate({ type: 'COUNT', column: 123 } as any),
      TypeError,
      'Column must be a column identifier or expression',
    );
  });

  await t.step(
    'assertCountAggregate - invalid: invalid column identifier',
    () => {
      asserts.assertThrows(
        () =>
          assertCountAggregate({ type: 'COUNT', column: '@invalid' }, [
            'valid',
          ]),
        TypeError,
        'Invalid column identifier @invalid',
      );
    },
  );

  await t.step('assertCountAggregate - invalid: invalid expression', () => {
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

  await t.step('isCountAggregate - valid and invalid', () => {
    asserts.assertEquals(isCountAggregate({ type: 'COUNT' }), true);
    asserts.assertEquals(
      isCountAggregate({ type: 'COUNT', column: '@id' }, ['id']),
      true,
    );
    asserts.assertEquals(isCountAggregate({ type: 'SUM' }), false);
    asserts.assertEquals(isCountAggregate('invalid'), false);
  });

  //#endregion COUNT Aggregate Tests

  //#region SUM Aggregate Tests

  await t.step('assertSumAggregate - valid: SUM with column', () => {
    assertSumAggregate({ type: 'SUM', column: '@amount' }, ['amount']);
  });

  await t.step('assertSumAggregate - valid: SUM DISTINCT', () => {
    assertSumAggregate({
      type: 'SUM',
      column: '@price',
      distinct: true,
    }, ['price']);
  });

  await t.step(
    'assertSumAggregate - valid: SUM with numeric expression',
    () => {
      assertSumAggregate({
        type: 'SUM',
        column: { type: 'MULTIPLY', args: ['@qty', '@price'] },
      }, ['qty', 'price']);
    },
  );

  await t.step('assertSumAggregate - invalid: wrong type', () => {
    asserts.assertThrows(
      () => assertSumAggregate({ type: 'AVG' } as any),
      TypeError,
      "Expected type 'SUM'",
    );
  });

  await t.step('assertSumAggregate - invalid: missing column', () => {
    asserts.assertThrows(
      () => assertSumAggregate({ type: 'SUM' } as any),
      TypeError,
      "Missing 'column' property",
    );
  });

  await t.step('assertSumAggregate - invalid: column is string literal', () => {
    asserts.assertThrows(
      () => assertSumAggregate({ type: 'SUM', column: 'literal' } as any),
      TypeError,
      "Column must be a column identifier (starting with '@') or an expression",
    );
  });

  await t.step('assertSumAggregate - invalid: non-numeric expression', () => {
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

  await t.step('assertSumAggregate - invalid: distinct not boolean', () => {
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

  await t.step('isSumAggregate - valid and invalid', () => {
    asserts.assertEquals(
      isSumAggregate({ type: 'SUM', column: '@val' }, ['val']),
      true,
    );
    asserts.assertEquals(isSumAggregate({ type: 'SUM' }), false);
    asserts.assertEquals(isSumAggregate({ type: 'COUNT' }), false);
  });

  //#endregion SUM Aggregate Tests

  //#region AVG Aggregate Tests

  await t.step('assertAvgAggregate - valid: AVG with column', () => {
    assertAvgAggregate({ type: 'AVG', column: '@score' }, ['score']);
  });

  await t.step('assertAvgAggregate - valid: AVG DISTINCT', () => {
    assertAvgAggregate({
      type: 'AVG',
      column: '@rating',
      distinct: true,
    }, ['rating']);
  });

  await t.step(
    'assertAvgAggregate - valid: AVG with numeric expression',
    () => {
      assertAvgAggregate({
        type: 'AVG',
        column: { type: 'ABS', args: ['@value'] },
      }, ['value']);
    },
  );

  await t.step('assertAvgAggregate - invalid: wrong type', () => {
    asserts.assertThrows(
      () => assertAvgAggregate({ type: 'MIN' } as any),
      TypeError,
      "Expected type 'AVG'",
    );
  });

  await t.step('assertAvgAggregate - invalid: missing column', () => {
    asserts.assertThrows(
      () => assertAvgAggregate({ type: 'AVG' } as any),
      TypeError,
      "Missing 'column' property",
    );
  });

  await t.step(
    'assertAvgAggregate - invalid: invalid column identifier',
    () => {
      asserts.assertThrows(
        () =>
          assertAvgAggregate({ type: 'AVG', column: '@invalid' }, ['valid']),
        TypeError,
        'Invalid column identifier @invalid',
      );
    },
  );

  await t.step('isAvgAggregate - valid and invalid', () => {
    asserts.assertEquals(
      isAvgAggregate({ type: 'AVG', column: '@num' }, ['num']),
      true,
    );
    asserts.assertEquals(isAvgAggregate({ type: 'AVG' }), false);
  });

  //#endregion AVG Aggregate Tests

  //#region MIN Aggregate Tests

  await t.step('assertMinAggregate - valid: MIN with column', () => {
    assertMinAggregate({ type: 'MIN', column: '@price' }, ['price']);
  });

  await t.step('assertMinAggregate - valid: MIN DISTINCT', () => {
    assertMinAggregate({
      type: 'MIN',
      column: '@age',
      distinct: true,
    }, ['age']);
  });

  await t.step(
    'assertMinAggregate - valid: MIN with numeric expression',
    () => {
      assertMinAggregate({
        type: 'MIN',
        column: { type: 'FLOOR', args: ['@value'] },
      }, ['value']);
    },
  );

  await t.step('assertMinAggregate - invalid: wrong type', () => {
    asserts.assertThrows(
      () => assertMinAggregate({ type: 'MAX' } as any),
      TypeError,
      "Expected type 'MIN'",
    );
  });

  await t.step('assertMinAggregate - invalid: missing column', () => {
    asserts.assertThrows(
      () => assertMinAggregate({ type: 'MIN' } as any),
      TypeError,
      "Missing 'column' property",
    );
  });

  await t.step('assertMinAggregate - invalid: column is number', () => {
    asserts.assertThrows(
      () => assertMinAggregate({ type: 'MIN', column: 42 } as any),
      TypeError,
      'Column must be a column identifier or expression',
    );
  });

  await t.step('isMinAggregate - valid and invalid', () => {
    asserts.assertEquals(
      isMinAggregate({ type: 'MIN', column: '@val' }, ['val']),
      true,
    );
    asserts.assertEquals(isMinAggregate({ type: 'MIN' }), false);
  });

  //#endregion MIN Aggregate Tests

  //#region MAX Aggregate Tests

  await t.step('assertMaxAggregate - valid: MAX with column', () => {
    assertMaxAggregate({ type: 'MAX', column: '@quantity' }, ['quantity']);
  });

  await t.step('assertMaxAggregate - valid: MAX DISTINCT', () => {
    assertMaxAggregate({
      type: 'MAX',
      column: '@amount',
      distinct: true,
    }, ['amount']);
  });

  await t.step(
    'assertMaxAggregate - valid: MAX with numeric expression',
    () => {
      assertMaxAggregate({
        type: 'MAX',
        column: { type: 'CEIL', args: ['@value'] },
      }, ['value']);
    },
  );

  await t.step('assertMaxAggregate - invalid: wrong type', () => {
    asserts.assertThrows(
      () => assertMaxAggregate({ type: 'MIN' } as any),
      TypeError,
      "Expected type 'MAX'",
    );
  });

  await t.step('assertMaxAggregate - invalid: missing column', () => {
    asserts.assertThrows(
      () => assertMaxAggregate({ type: 'MAX' } as any),
      TypeError,
      "Missing 'column' property",
    );
  });

  await t.step('assertMaxAggregate - invalid: column is string literal', () => {
    asserts.assertThrows(
      () => assertMaxAggregate({ type: 'MAX', column: 'literal' } as any),
      TypeError,
      "Column must be a column identifier (starting with '@') or an expression",
    );
  });

  await t.step('isMaxAggregate - valid and invalid', () => {
    asserts.assertEquals(
      isMaxAggregate({ type: 'MAX', column: '@val' }, ['val']),
      true,
    );
    asserts.assertEquals(isMaxAggregate({ type: 'MAX' }), false);
  });

  //#endregion MAX Aggregate Tests

  //#region STRING_AGG Aggregate Tests

  await t.step('assertStringAggAggregate - valid: with separator', () => {
    assertStringAggAggregate({
      type: 'STRING_AGG',
      column: '@name',
      separator: ', ',
    }, ['name']);
  });

  await t.step('assertStringAggAggregate - valid: without separator', () => {
    assertStringAggAggregate({
      type: 'STRING_AGG',
      column: '@tag',
    }, ['tag']);
  });

  await t.step('assertStringAggAggregate - valid: with DISTINCT', () => {
    assertStringAggAggregate({
      type: 'STRING_AGG',
      column: '@category',
      separator: ';',
      distinct: true,
    }, ['category']);
  });

  await t.step('assertStringAggAggregate - valid: with expression', () => {
    assertStringAggAggregate({
      type: 'STRING_AGG',
      column: { type: 'UPPER', args: '@name' },
      separator: ' | ',
    }, ['name']);
  });

  await t.step('assertStringAggAggregate - invalid: wrong type', () => {
    asserts.assertThrows(
      () => assertStringAggAggregate({ type: 'ARRAY_AGG' } as any),
      TypeError,
      "Expected type 'STRING_AGG'",
    );
  });

  await t.step('assertStringAggAggregate - invalid: missing column', () => {
    asserts.assertThrows(
      () => assertStringAggAggregate({ type: 'STRING_AGG' } as any),
      TypeError,
      "Missing 'column' property",
    );
  });

  await t.step(
    'assertStringAggAggregate - invalid: separator not string',
    () => {
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
    },
  );

  await t.step('assertStringAggAggregate - invalid: invalid column', () => {
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

  await t.step('isStringAggAggregate - valid and invalid', () => {
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

  //#endregion STRING_AGG Aggregate Tests

  //#region ARRAY_AGG Aggregate Tests

  await t.step('assertArrayAggAggregate - valid: with column', () => {
    assertArrayAggAggregate({
      type: 'ARRAY_AGG',
      column: '@id',
    }, ['id']);
  });

  await t.step('assertArrayAggAggregate - valid: with DISTINCT', () => {
    assertArrayAggAggregate({
      type: 'ARRAY_AGG',
      column: '@category',
      distinct: true,
    }, ['category']);
  });

  await t.step('assertArrayAggAggregate - valid: with expression', () => {
    assertArrayAggAggregate({
      type: 'ARRAY_AGG',
      column: { type: 'LENGTH', args: '@name' },
    }, ['name']);
  });

  await t.step('assertArrayAggAggregate - invalid: wrong type', () => {
    asserts.assertThrows(
      () => assertArrayAggAggregate({ type: 'STRING_AGG' } as any),
      TypeError,
      "Expected type 'ARRAY_AGG'",
    );
  });

  await t.step('assertArrayAggAggregate - invalid: missing column', () => {
    asserts.assertThrows(
      () => assertArrayAggAggregate({ type: 'ARRAY_AGG' } as any),
      TypeError,
      "Missing 'column' property",
    );
  });

  await t.step(
    'assertArrayAggAggregate - invalid: column is string literal',
    () => {
      asserts.assertThrows(
        () =>
          assertArrayAggAggregate({
            type: 'ARRAY_AGG',
            column: 'literal',
          } as any),
        TypeError,
        "Column must be a column identifier (starting with '@') or an expression",
      );
    },
  );

  await t.step('assertArrayAggAggregate - invalid: invalid expression', () => {
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

  await t.step('isArrayAggAggregate - valid and invalid', () => {
    asserts.assertEquals(
      isArrayAggAggregate({ type: 'ARRAY_AGG', column: '@val' }, ['val']),
      true,
    );
    asserts.assertEquals(isArrayAggAggregate({ type: 'ARRAY_AGG' }), false);
  });

  //#endregion ARRAY_AGG Aggregate Tests

  //#region JSON_ROW Aggregate Tests

  await t.step('assertJsonRowAggregate - valid: with columns', () => {
    assertJsonRowAggregate({
      type: 'JSON_ROW',
      columns: {
        userId: '@id',
        userName: '@name',
        userEmail: '@email',
      },
    }, ['id', 'name', 'email']);
  });

  await t.step('assertJsonRowAggregate - valid: with expressions', () => {
    assertJsonRowAggregate({
      type: 'JSON_ROW',
      columns: {
        fullName: { type: 'CONCAT', args: ['@first', ' ', '@last'] },
        age: '@age',
      },
    }, ['first', 'last', 'age']);
  });

  await t.step('assertJsonRowAggregate - invalid: wrong type', () => {
    asserts.assertThrows(
      () => assertJsonRowAggregate({ type: 'ARRAY_AGG' } as any),
      TypeError,
      "Expected type 'JSON_ROW'",
    );
  });

  await t.step('assertJsonRowAggregate - invalid: missing columns', () => {
    asserts.assertThrows(
      () => assertJsonRowAggregate({ type: 'JSON_ROW' } as any),
      TypeError,
      "Missing 'columns' property",
    );
  });

  await t.step('assertJsonRowAggregate - invalid: columns not object', () => {
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

  await t.step('assertJsonRowAggregate - invalid: columns is null', () => {
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

  await t.step('assertJsonRowAggregate - invalid: columns is array', () => {
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

  await t.step('assertJsonRowAggregate - invalid: empty column key', () => {
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

  await t.step(
    'assertJsonRowAggregate - invalid: column value is string literal',
    () => {
      asserts.assertThrows(
        () =>
          assertJsonRowAggregate({
            type: 'JSON_ROW',
            columns: { name: 'literal' },
          } as any),
        TypeError,
        "Column must be a column identifier (starting with '@') or an expression",
      );
    },
  );

  await t.step(
    'assertJsonRowAggregate - invalid: column value is number',
    () => {
      asserts.assertThrows(
        () =>
          assertJsonRowAggregate({
            type: 'JSON_ROW',
            columns: { id: 123 },
          } as any),
        TypeError,
        'Column must be a column identifier or expression',
      );
    },
  );

  await t.step(
    'assertJsonRowAggregate - invalid: invalid column identifier',
    () => {
      asserts.assertThrows(
        () =>
          assertJsonRowAggregate({
            type: 'JSON_ROW',
            columns: { userId: '@invalid' },
          }, ['valid']),
        TypeError,
        'Invalid column identifier @invalid',
      );
    },
  );

  await t.step('assertJsonRowAggregate - invalid: invalid expression', () => {
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

  await t.step('assertJsonRowAggregate - invalid: distinct not allowed', () => {
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

  await t.step('isJsonRowAggregate - valid and invalid', () => {
    asserts.assertEquals(
      isJsonRowAggregate({
        type: 'JSON_ROW',
        columns: { id: '@id' },
      }, ['id']),
      true,
    );
    asserts.assertEquals(isJsonRowAggregate({ type: 'JSON_ROW' }), false);
  });

  //#endregion JSON_ROW Aggregate Tests

  //#region General Aggregate Tests

  await t.step('assertAggregate - delegates to COUNT', () => {
    assertAggregate({ type: 'COUNT' });
  });

  await t.step('assertAggregate - delegates to SUM', () => {
    assertAggregate({ type: 'SUM', column: '@val' }, ['val']);
  });

  await t.step('assertAggregate - delegates to AVG', () => {
    assertAggregate({ type: 'AVG', column: '@val' }, ['val']);
  });

  await t.step('assertAggregate - delegates to MIN', () => {
    assertAggregate({ type: 'MIN', column: '@val' }, ['val']);
  });

  await t.step('assertAggregate - delegates to MAX', () => {
    assertAggregate({ type: 'MAX', column: '@val' }, ['val']);
  });

  await t.step('assertAggregate - delegates to STRING_AGG', () => {
    assertAggregate({
      type: 'STRING_AGG',
      column: '@val',
      separator: ',',
    }, ['val']);
  });

  await t.step('assertAggregate - delegates to ARRAY_AGG', () => {
    assertAggregate({ type: 'ARRAY_AGG', column: '@val' }, ['val']);
  });

  await t.step('assertAggregate - delegates to JSON_ROW', () => {
    assertAggregate({
      type: 'JSON_ROW',
      columns: { id: '@id' },
    }, ['id']);
  });

  await t.step('assertAggregate - invalid: not an object', () => {
    asserts.assertThrows(
      () => assertAggregate('invalid' as any),
      TypeError,
      'Expected object',
    );
  });

  await t.step('assertAggregate - invalid: missing type', () => {
    asserts.assertThrows(
      () => assertAggregate({} as any),
      TypeError,
      "Missing 'type' property",
    );
  });

  await t.step('isAggregate - valid aggregates', () => {
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

  await t.step('isAggregate - invalid aggregates', () => {
    asserts.assertEquals(isAggregate('invalid'), false);
    asserts.assertEquals(isAggregate({}), false);
    asserts.assertEquals(isAggregate({ type: 'INVALID' }), false);
    asserts.assertEquals(isAggregate({ type: 'SUM' }), false);
  });

  await t.step('Integration: filter valid aggregates', () => {
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

  await t.step('Integration: type narrowing with type guards', () => {
    const value: unknown = { type: 'COUNT', column: '@id' };

    if (isCountAggregate(value, ['id'])) {
      // Type is narrowed to Extract<Aggregates, { type: 'COUNT' }>
      asserts.assertEquals(value.type, 'COUNT');
    } else {
      asserts.fail('Should be valid COUNT aggregate');
    }
  });

  await t.step('Integration: validate complex aggregates', () => {
    const complexAgg = {
      type: 'JSON_ROW',
      columns: {
        totalAmount: { type: 'SUM', column: '@amount' },
        avgPrice: { type: 'AVG', column: '@price' },
        itemCount: { type: 'COUNT', column: '@id' },
      },
    };

    // This would fail because aggregate expressions contain other aggregates
    // which is not allowed - aggregates should only contain expressions
    asserts.assertThrows(
      () =>
        assertJsonRowAggregate(complexAgg as any, ['amount', 'price', 'id']),
      TypeError,
      'Invalid expression',
    );
  });

  //#endregion General Aggregate Tests
});
