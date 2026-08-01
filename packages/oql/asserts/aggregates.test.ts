/**
 * Test suite for Aggregates validators
 *
 * Comprehensive tests for all aggregate function validators with 100% coverage.
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
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
} from './aggregates.ts';

describe('oql.asserts.Aggregates', () => {
  describe('COUNT aggregate', () => {
    it('valid: COUNT(*)', () => {
      assertCountAggregate({ $$_aggregate: 'COUNT' });
    });

    it('valid: COUNT with column', () => {
      assertCountAggregate({ $$_aggregate: 'COUNT', column: '@userId' }, [
        'userId',
      ]);
    });

    it('valid: COUNT DISTINCT', () => {
      assertCountAggregate({
        $$_aggregate: 'COUNT',
        column: '@email',
        distinct: true,
      }, ['email']);
    });

    it('valid: COUNT with expression', () => {
      assertCountAggregate({
        $$_aggregate: 'COUNT',
        column: { $$_expression: 'ADD', args: [1, 2] },
      });
    });

    it('invalid: not an object', () => {
      asserts.assertThrows(
        () => assertCountAggregate('COUNT' as any),
        TypeError,
        'Expected object',
      );
    });

    it('invalid: null', () => {
      asserts.assertThrows(
        () => assertCountAggregate(null as any),
        TypeError,
        'Expected object',
      );
    });

    it('invalid: missing type', () => {
      asserts.assertThrows(
        () => assertCountAggregate({} as any),
        TypeError,
        "Missing '$$_aggregate' property",
      );
    });

    it('invalid: $$_aggregate not string', () => {
      asserts.assertThrows(
        () => assertCountAggregate({ $$_aggregate: 123 } as any),
        TypeError,
        "'$$_aggregate' must be a string",
      );
    });

    it('invalid: unknown aggregate type', () => {
      asserts.assertThrows(
        () => assertCountAggregate({ $$_aggregate: 'INVALID' } as any),
        TypeError,
        'Expected one of COUNT, SUM, AVG, MIN, MAX, STRING_AGG, ARRAY_AGG, JSON_ROW',
      );
    });

    it('invalid: wrong type', () => {
      asserts.assertThrows(
        () => assertCountAggregate({ $$_aggregate: 'SUM' } as any),
        TypeError,
        "Expected type 'COUNT'",
      );
    });

    it('invalid: distinct without column', () => {
      asserts.assertThrows(
        () =>
          assertCountAggregate(
            { $$_aggregate: 'COUNT', distinct: true } as any,
          ),
        TypeError,
        "'distinct' cannot be used without a column",
      );
    });

    it('invalid: distinct not boolean', () => {
      asserts.assertThrows(
        () =>
          assertCountAggregate({
            $$_aggregate: 'COUNT',
            column: '@id',
            distinct: 'yes',
          } as any, ['id']),
        TypeError,
        "'distinct' must be a boolean",
      );
    });

    it('invalid: column is string literal', () => {
      asserts.assertThrows(
        () =>
          assertCountAggregate(
            { $$_aggregate: 'COUNT', column: 'literal' } as any,
          ),
        TypeError,
        "Column must be a column identifier (starting with '@') or an expression",
      );
    });

    it('invalid: column is number', () => {
      asserts.assertThrows(
        () =>
          assertCountAggregate({ $$_aggregate: 'COUNT', column: 123 } as any),
        TypeError,
        'Column must be a column identifier or expression',
      );
    });

    it('invalid: invalid column identifier', () => {
      asserts.assertThrows(
        () =>
          assertCountAggregate({ $$_aggregate: 'COUNT', column: '@invalid' }, [
            'valid',
          ]),
        TypeError,
        'Column must be a column identifier',
      );
    });

    it('invalid: invalid expression', () => {
      asserts.assertThrows(
        () =>
          assertCountAggregate({
            $$_aggregate: 'COUNT',
            column: { $$_expression: 'INVALID_EXPR' },
          } as any),
        TypeError,
        'Invalid expression',
      );
    });

    it('type guard: valid and invalid', () => {
      asserts.assertEquals(isCountAggregate({ $$_aggregate: 'COUNT' }), true);
      asserts.assertEquals(
        isCountAggregate({ $$_aggregate: 'COUNT', column: '@id' }, ['id']),
        true,
      );
      asserts.assertEquals(isCountAggregate({ $$_aggregate: 'SUM' }), false);
      asserts.assertEquals(isCountAggregate('invalid'), false);
    });
  });

  describe('SUM aggregate', () => {
    it('valid: SUM with column', () => {
      assertSumAggregate({ $$_aggregate: 'SUM', column: '@amount' }, [
        'amount',
      ]);
    });

    it('valid: SUM DISTINCT', () => {
      assertSumAggregate({
        $$_aggregate: 'SUM',
        column: '@price',
        distinct: true,
      }, ['price']);
    });

    it('valid: SUM with numeric expression', () => {
      assertSumAggregate({
        $$_aggregate: 'SUM',
        column: { $$_expression: 'MULTIPLY', args: ['@qty', '@price'] },
      }, ['qty', 'price']);
    });

    it('invalid: wrong type', () => {
      asserts.assertThrows(
        () => assertSumAggregate({ $$_aggregate: 'AVG' } as any),
        TypeError,
        "Expected type 'SUM'",
      );
    });

    it('invalid: missing column', () => {
      asserts.assertThrows(
        () => assertSumAggregate({ $$_aggregate: 'SUM' } as any),
        TypeError,
        "Missing 'column' property",
      );
    });

    it('invalid: column is string literal', () => {
      asserts.assertThrows(
        () =>
          assertSumAggregate({ $$_aggregate: 'SUM', column: 'literal' } as any),
        TypeError,
        "Column must be a column identifier (starting with '@') or an expression",
      );
    });

    it('invalid: non-numeric expression', () => {
      asserts.assertThrows(
        () =>
          assertSumAggregate({
            $$_aggregate: 'SUM',
            column: { $$_expression: 'CONCAT', args: ['a', 'b'] },
          } as any),
        TypeError,
        'Invalid expression',
      );
    });

    it('invalid: distinct not boolean', () => {
      asserts.assertThrows(
        () =>
          assertSumAggregate({
            $$_aggregate: 'SUM',
            column: '@amount',
            distinct: 1,
          } as any, ['amount']),
        TypeError,
        "'distinct' must be a boolean",
      );
    });

    it('type guard: valid and invalid', () => {
      asserts.assertEquals(
        isSumAggregate({ $$_aggregate: 'SUM', column: '@val' }, ['val']),
        true,
      );
      asserts.assertEquals(isSumAggregate({ $$_aggregate: 'SUM' }), false);
      asserts.assertEquals(isSumAggregate({ $$_aggregate: 'COUNT' }), false);
    });
  });

  describe('AVG aggregate', () => {
    it('valid: AVG with column', () => {
      assertAvgAggregate({ $$_aggregate: 'AVG', column: '@score' }, ['score']);
    });

    it('valid: AVG DISTINCT', () => {
      assertAvgAggregate({
        $$_aggregate: 'AVG',
        column: '@rating',
        distinct: true,
      }, ['rating']);
    });

    it('valid: AVG with numeric expression', () => {
      assertAvgAggregate({
        $$_aggregate: 'AVG',
        column: { $$_expression: 'ABS', args: ['@value'] },
      }, ['value']);
    });

    it('invalid: wrong type', () => {
      asserts.assertThrows(
        () => assertAvgAggregate({ $$_aggregate: 'MIN' } as any),
        TypeError,
        "Expected type 'AVG'",
      );
    });

    it('invalid: missing column', () => {
      asserts.assertThrows(
        () => assertAvgAggregate({ $$_aggregate: 'AVG' } as any),
        TypeError,
        "Missing 'column' property",
      );
    });

    it('invalid: invalid column identifier', () => {
      asserts.assertThrows(
        () =>
          assertAvgAggregate({ $$_aggregate: 'AVG', column: '@invalid' }, [
            'valid',
          ]),
        TypeError,
        'Column must be a column identifier',
      );
    });

    it('type guard: valid and invalid', () => {
      asserts.assertEquals(
        isAvgAggregate({ $$_aggregate: 'AVG', column: '@num' }, ['num']),
        true,
      );
      asserts.assertEquals(isAvgAggregate({ $$_aggregate: 'AVG' }), false);
    });
  });

  describe('MIN aggregate', () => {
    it('valid: MIN with column', () => {
      assertMinAggregate({ $$_aggregate: 'MIN', column: '@price' }, ['price']);
    });

    it('valid: MIN DISTINCT', () => {
      assertMinAggregate({
        $$_aggregate: 'MIN',
        column: '@age',
        distinct: true,
      }, ['age']);
    });

    it('valid: MIN with numeric expression', () => {
      assertMinAggregate({
        $$_aggregate: 'MIN',
        column: { $$_expression: 'FLOOR', args: ['@value'] },
      }, ['value']);
    });

    it('invalid: wrong type', () => {
      asserts.assertThrows(
        () => assertMinAggregate({ $$_aggregate: 'MAX' } as any),
        TypeError,
        "Expected type 'MIN'",
      );
    });

    it('invalid: missing column', () => {
      asserts.assertThrows(
        () => assertMinAggregate({ $$_aggregate: 'MIN' } as any),
        TypeError,
        "Missing 'column' property",
      );
    });

    it('invalid: column is number', () => {
      asserts.assertThrows(
        () => assertMinAggregate({ $$_aggregate: 'MIN', column: 42 } as any),
        TypeError,
        'Column must be a column identifier or expression',
      );
    });

    it('type guard: valid and invalid', () => {
      asserts.assertEquals(
        isMinAggregate({ $$_aggregate: 'MIN', column: '@val' }, ['val']),
        true,
      );
      asserts.assertEquals(isMinAggregate({ $$_aggregate: 'MIN' }), false);
    });
  });

  describe('MAX aggregate', () => {
    it('valid: MAX with column', () => {
      assertMaxAggregate({ $$_aggregate: 'MAX', column: '@quantity' }, [
        'quantity',
      ]);
    });

    it('valid: MAX DISTINCT', () => {
      assertMaxAggregate({
        $$_aggregate: 'MAX',
        column: '@amount',
        distinct: true,
      }, ['amount']);
    });

    it('valid: MAX with numeric expression', () => {
      assertMaxAggregate({
        $$_aggregate: 'MAX',
        column: { $$_expression: 'CEIL', args: ['@value'] },
      }, ['value']);
    });

    it('invalid: wrong type', () => {
      asserts.assertThrows(
        () => assertMaxAggregate({ $$_aggregate: 'MIN' } as any),
        TypeError,
        "Expected type 'MAX'",
      );
    });

    it('invalid: missing column', () => {
      asserts.assertThrows(
        () => assertMaxAggregate({ $$_aggregate: 'MAX' } as any),
        TypeError,
        "Missing 'column' property",
      );
    });

    it('invalid: column is string literal', () => {
      asserts.assertThrows(
        () =>
          assertMaxAggregate({ $$_aggregate: 'MAX', column: 'literal' } as any),
        TypeError,
        "Column must be a column identifier (starting with '@') or an expression",
      );
    });

    it('type guard: valid and invalid', () => {
      asserts.assertEquals(
        isMaxAggregate({ $$_aggregate: 'MAX', column: '@val' }, ['val']),
        true,
      );
      asserts.assertEquals(isMaxAggregate({ $$_aggregate: 'MAX' }), false);
    });
  });

  describe('STRING_AGG aggregate', () => {
    it('valid: with separator', () => {
      assertStringAggAggregate({
        $$_aggregate: 'STRING_AGG',
        column: '@name',
        separator: ', ',
      }, ['name']);
    });

    it('valid: without separator', () => {
      assertStringAggAggregate({
        $$_aggregate: 'STRING_AGG',
        column: '@tag',
      }, ['tag']);
    });

    it('valid: with DISTINCT', () => {
      assertStringAggAggregate({
        $$_aggregate: 'STRING_AGG',
        column: '@category',
        separator: ';',
        distinct: true,
      }, ['category']);
    });

    it('valid: with expression', () => {
      assertStringAggAggregate({
        $$_aggregate: 'STRING_AGG',
        column: { $$_expression: 'UPPER', args: '@name' },
        separator: ' | ',
      }, ['name']);
    });

    it('invalid: wrong type', () => {
      asserts.assertThrows(
        () => assertStringAggAggregate({ $$_aggregate: 'ARRAY_AGG' } as any),
        TypeError,
        "Expected type 'STRING_AGG'",
      );
    });

    it('invalid: missing column', () => {
      asserts.assertThrows(
        () => assertStringAggAggregate({ $$_aggregate: 'STRING_AGG' } as any),
        TypeError,
        "Missing 'column' property",
      );
    });

    it('invalid: separator not string', () => {
      asserts.assertThrows(
        () =>
          assertStringAggAggregate({
            $$_aggregate: 'STRING_AGG',
            column: '@name',
            separator: 123,
          } as any, ['name']),
        TypeError,
        "'separator' must be a string",
      );
    });

    it('invalid: invalid column', () => {
      asserts.assertThrows(
        () =>
          assertStringAggAggregate({
            $$_aggregate: 'STRING_AGG',
            column: '@invalid',
          }, ['valid']),
        TypeError,
        'Column must be a column identifier',
      );
    });

    it('type guard: valid and invalid', () => {
      asserts.assertEquals(
        isStringAggAggregate({
          $$_aggregate: 'STRING_AGG',
          column: '@val',
          separator: ',',
        }, ['val']),
        true,
      );
      asserts.assertEquals(
        isStringAggAggregate({ $$_aggregate: 'STRING_AGG' }),
        false,
      );
    });
  });

  describe('ARRAY_AGG aggregate', () => {
    it('valid: with column', () => {
      assertArrayAggAggregate({
        $$_aggregate: 'ARRAY_AGG',
        column: '@id',
      }, ['id']);
    });

    it('valid: with DISTINCT', () => {
      assertArrayAggAggregate({
        $$_aggregate: 'ARRAY_AGG',
        column: '@category',
        distinct: true,
      }, ['category']);
    });

    it('valid: with expression', () => {
      assertArrayAggAggregate({
        $$_aggregate: 'ARRAY_AGG',
        column: { $$_expression: 'LENGTH', args: '@name' },
      }, ['name']);
    });

    it('invalid: wrong type', () => {
      asserts.assertThrows(
        () => assertArrayAggAggregate({ $$_aggregate: 'STRING_AGG' } as any),
        TypeError,
        "Expected type 'ARRAY_AGG'",
      );
    });

    it('invalid: missing column', () => {
      asserts.assertThrows(
        () => assertArrayAggAggregate({ $$_aggregate: 'ARRAY_AGG' } as any),
        TypeError,
        "Missing 'column' property",
      );
    });

    it('invalid: column is string literal', () => {
      asserts.assertThrows(
        () =>
          assertArrayAggAggregate({
            $$_aggregate: 'ARRAY_AGG',
            column: 'literal',
          } as any),
        TypeError,
        "Column must be a column identifier (starting with '@') or an expression",
      );
    });

    it('invalid: invalid expression', () => {
      asserts.assertThrows(
        () =>
          assertArrayAggAggregate({
            $$_aggregate: 'ARRAY_AGG',
            column: { $$_expression: 'BAD_EXPR' },
          } as any),
        TypeError,
        'Invalid expression',
      );
    });

    it('type guard: valid and invalid', () => {
      asserts.assertEquals(
        isArrayAggAggregate({ $$_aggregate: 'ARRAY_AGG', column: '@val' }, [
          'val',
        ]),
        true,
      );
      asserts.assertEquals(
        isArrayAggAggregate({ $$_aggregate: 'ARRAY_AGG' }),
        false,
      );
    });
  });

  describe('JSON_ROW aggregate', () => {
    it('valid: with columns', () => {
      assertJsonRowAggregate({
        $$_aggregate: 'JSON_ROW',
        columns: {
          userId: '@id',
          userName: '@name',
          userEmail: '@email',
        },
      }, ['id', 'name', 'email']);
    });

    it('valid: with expressions', () => {
      assertJsonRowAggregate({
        $$_aggregate: 'JSON_ROW',
        columns: {
          fullName: { $$_expression: 'CONCAT', args: ['@first', ' ', '@last'] },
          age: '@age',
        },
      }, ['first', 'last', 'age']);
    });

    it('invalid: wrong type', () => {
      asserts.assertThrows(
        () => assertJsonRowAggregate({ $$_aggregate: 'ARRAY_AGG' } as any),
        TypeError,
        "Expected type 'JSON_ROW'",
      );
    });

    it('invalid: missing columns', () => {
      asserts.assertThrows(
        () => assertJsonRowAggregate({ $$_aggregate: 'JSON_ROW' } as any),
        TypeError,
        "Missing 'columns' property",
      );
    });

    it('invalid: columns not object', () => {
      asserts.assertThrows(
        () =>
          assertJsonRowAggregate({
            $$_aggregate: 'JSON_ROW',
            columns: 'invalid',
          } as any),
        TypeError,
        "'columns' must be an object (key-value mapping)",
      );
    });

    it('invalid: columns is null', () => {
      asserts.assertThrows(
        () =>
          assertJsonRowAggregate({
            $$_aggregate: 'JSON_ROW',
            columns: null,
          } as any),
        TypeError,
        "'columns' must be an object (key-value mapping)",
      );
    });

    it('invalid: columns is array', () => {
      asserts.assertThrows(
        () =>
          assertJsonRowAggregate({
            $$_aggregate: 'JSON_ROW',
            columns: [],
          } as any),
        TypeError,
        "'columns' must be an object (key-value mapping)",
      );
    });

    it('invalid: empty column key', () => {
      asserts.assertThrows(
        () =>
          assertJsonRowAggregate({
            $$_aggregate: 'JSON_ROW',
            columns: { '': '@id' },
          } as any, ['id']),
        TypeError,
        'Column keys must be non-empty strings',
      );
    });

    it('invalid: column value is string literal', () => {
      asserts.assertThrows(
        () =>
          assertJsonRowAggregate({
            $$_aggregate: 'JSON_ROW',
            columns: { name: 'literal' },
          } as any),
        TypeError,
        "Column must be a column identifier (starting with '@') or an expression",
      );
    });

    it('invalid: column value is number', () => {
      asserts.assertThrows(
        () =>
          assertJsonRowAggregate({
            $$_aggregate: 'JSON_ROW',
            columns: { id: 123 },
          } as any),
        TypeError,
        'Column must be a column identifier or expression',
      );
    });

    it('invalid: invalid column identifier', () => {
      asserts.assertThrows(
        () =>
          assertJsonRowAggregate({
            $$_aggregate: 'JSON_ROW',
            columns: { userId: '@invalid' },
          }, ['valid']),
        TypeError,
        'Column must be a column identifier',
      );
    });

    it('invalid: invalid expression', () => {
      asserts.assertThrows(
        () =>
          assertJsonRowAggregate({
            $$_aggregate: 'JSON_ROW',
            columns: { name: { $$_expression: 'BAD' } },
          } as any),
        TypeError,
        'Invalid expression',
      );
    });

    it('invalid: distinct not allowed', () => {
      asserts.assertThrows(
        () =>
          assertJsonRowAggregate({
            $$_aggregate: 'JSON_ROW',
            columns: { id: '@id' },
            distinct: true,
          } as any, ['id']),
        TypeError,
        "'distinct' is not supported for JSON_ROW",
      );
    });

    it('type guard: valid and invalid', () => {
      asserts.assertEquals(
        isJsonRowAggregate({
          $$_aggregate: 'JSON_ROW',
          columns: { id: '@id' },
        }, ['id']),
        true,
      );
      asserts.assertEquals(
        isJsonRowAggregate({ $$_aggregate: 'JSON_ROW' }),
        false,
      );
    });
  });

  describe('general aggregate functions', () => {
    it('valid: delegates to COUNT', () => {
      assertAggregate({ $$_aggregate: 'COUNT' });
    });

    it('valid: delegates to SUM', () => {
      assertAggregate({ $$_aggregate: 'SUM', column: '@val' }, ['val']);
    });

    it('valid: delegates to AVG', () => {
      assertAggregate({ $$_aggregate: 'AVG', column: '@val' }, ['val']);
    });

    it('valid: delegates to MIN', () => {
      assertAggregate({ $$_aggregate: 'MIN', column: '@val' }, ['val']);
    });

    it('valid: delegates to MAX', () => {
      assertAggregate({ $$_aggregate: 'MAX', column: '@val' }, ['val']);
    });

    it('valid: delegates to STRING_AGG', () => {
      assertAggregate({
        $$_aggregate: 'STRING_AGG',
        column: '@val',
        separator: ',',
      }, ['val']);
    });

    it('valid: delegates to ARRAY_AGG', () => {
      assertAggregate({ $$_aggregate: 'ARRAY_AGG', column: '@val' }, ['val']);
    });

    it('valid: delegates to JSON_ROW', () => {
      assertAggregate({
        $$_aggregate: 'JSON_ROW',
        columns: { id: '@id' },
      }, ['id']);
    });

    it('invalid: not an object', () => {
      asserts.assertThrows(
        () => assertAggregate('invalid' as any),
        TypeError,
        'Expected object',
      );
    });

    it('invalid: missing type', () => {
      asserts.assertThrows(
        () => assertAggregate({} as any),
        TypeError,
        "Missing '$$_aggregate' property",
      );
    });

    it('type guard: valid aggregates', () => {
      asserts.assertEquals(isAggregate({ $$_aggregate: 'COUNT' }), true);
      asserts.assertEquals(
        isAggregate({ $$_aggregate: 'SUM', column: '@val' }, ['val']),
        true,
      );
      asserts.assertEquals(
        isAggregate({ $$_aggregate: 'JSON_ROW', columns: { id: '@id' } }, [
          'id',
        ]),
        true,
      );
    });

    it('type guard: invalid aggregates', () => {
      asserts.assertEquals(isAggregate('invalid'), false);
      asserts.assertEquals(isAggregate({}), false);
      asserts.assertEquals(isAggregate({ $$_aggregate: 'INVALID' }), false);
      asserts.assertEquals(isAggregate({ $$_aggregate: 'SUM' }), false);
    });
  });

  describe('integration tests', () => {
    it('filter valid aggregates', () => {
      const mixed: unknown[] = [
        { $$_aggregate: 'COUNT' },
        { $$_aggregate: 'SUM', column: '@val' },
        'invalid',
        { $$_aggregate: 'INVALID' },
        { $$_aggregate: 'AVG', column: '@score' },
      ];

      const validAggs = mixed.filter((x) => isAggregate(x, ['val', 'score']));
      asserts.assertEquals(validAggs.length, 3);
    });

    it('type narrowing with type guards', () => {
      const value: unknown = { $$_aggregate: 'COUNT', column: '@id' };

      if (isCountAggregate(value, ['id'])) {
        asserts.assertEquals(value.$$_aggregate, 'COUNT');
      } else {
        asserts.fail('Should be valid COUNT aggregate');
      }
    });

    it('validate complex aggregates with nested expressions', () => {
      const complexAgg = {
        $$_aggregate: 'JSON_ROW',
        columns: {
          totalAmount: { $$_aggregate: 'SUM', column: '@amount' },
          avgPrice: { $$_aggregate: 'AVG', column: '@price' },
          itemCount: { $$_aggregate: 'COUNT', column: '@id' },
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
