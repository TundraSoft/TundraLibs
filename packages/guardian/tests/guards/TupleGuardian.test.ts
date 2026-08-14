import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { Guardian, GuardianError, TupleGuardian } from '../../mod.ts';

describe('guardian.TupleGuardian', () => {
  describe('basic functionality', () => {
    it('validates a 2-element [number, number] tuple', () => {
      const schema = Guardian.tuple([
        Guardian.number().integer().min(0),
        Guardian.number().integer().min(0),
      ]);
      const out = schema.parse([10, 20]);
      asserts.assertEquals(out, [10, 20]);
    });

    it('validates a heterogeneous [string, number, boolean] tuple', () => {
      const schema = Guardian.tuple([
        Guardian.string().minLength(1),
        Guardian.number(),
        Guardian.boolean(),
      ]);
      const out = schema.parse(['hello', 42, true]);
      asserts.assertEquals(out, ['hello', 42, true]);
    });

    it('preserves positional type inference (compile-time check)', () => {
      const schema = Guardian.tuple([
        Guardian.string(),
        Guardian.number(),
      ]);
      // Compile-time: `out` should be `[string, number]`, not `(string|number)[]`.
      const out = schema.parse(['x', 1]);
      const [s, n]: [string, number] = out;
      asserts.assertEquals(s, 'x');
      asserts.assertEquals(n, 1);
    });
  });

  describe('rejection cases', () => {
    it('rejects non-arrays', () => {
      const schema = Guardian.tuple([Guardian.string()]);
      asserts.assertThrows(
        () => schema.parse('not-an-array'),
        GuardianError,
        'Expected array',
      );
    });

    it('rejects wrong length (too short)', () => {
      const schema = Guardian.tuple([
        Guardian.number(),
        Guardian.number(),
      ]);
      asserts.assertThrows(
        () => schema.parse([10]),
        GuardianError,
        'exactly 2 elements',
      );
    });

    it('rejects wrong length (too long)', () => {
      const schema = Guardian.tuple([
        Guardian.number(),
        Guardian.number(),
      ]);
      asserts.assertThrows(
        () => schema.parse([10, 20, 30]),
        GuardianError,
        'exactly 2 elements',
      );
    });

    it('reports the failing index with a position-prefixed message', () => {
      const schema = Guardian.tuple([
        Guardian.string(),
        Guardian.number(),
      ]);
      try {
        // Second element is not coercible to number under default rules.
        schema.parse(['ok', {}]);
        asserts.fail('expected throw');
      } catch (err) {
        asserts.assertInstanceOf(err, GuardianError);
        asserts.assertStringIncludes(err.message, 'Tuple element at index 1');
      }
    });
  });

  describe('coercion (inherits from element guardians)', () => {
    it('coerces per-position via element guardian defaults', () => {
      const schema = Guardian.tuple([
        Guardian.number(),
        Guardian.string(),
      ]);
      // Coerce-by-default flows through each position independently.
      const out = schema.parse(['42', 7]);
      asserts.assertEquals(out, [42, '7']);
    });
  });

  describe('class export', () => {
    it('TupleGuardian is constructable directly', () => {
      const schema = new TupleGuardian([
        Guardian.number(),
        Guardian.number(),
      ]);
      asserts.assertEquals(schema.parse([1, 2]), [1, 2]);
    });
  });

  describe('rest — variadic tail', () => {
    it('accepts additional elements typed by `_rest`', () => {
      const cmd = Guardian.tuple([
        Guardian.literal('move'),
        Guardian.number().integer(),
        Guardian.number().integer(),
      ]).rest(Guardian.string());

      asserts.assertEquals(
        cmd.parse(['move', 1, 2]),
        ['move', 1, 2],
      );
      asserts.assertEquals(
        cmd.parse(['move', 1, 2, 'fast', 'silent']),
        ['move', 1, 2, 'fast', 'silent'],
      );
    });

    it('rejects when a rest element fails its guardian', () => {
      const t = Guardian.tuple([Guardian.string()]).rest(Guardian.number());
      asserts.assertEquals(t.parse(['a', 1, 2, 3]), ['a', 1, 2, 3]);
      asserts.assertThrows(() => t.parse(['a', 1, 'bad']), GuardianError);
    });

    it('rejects when the array is shorter than the fixed prefix', () => {
      const t = Guardian.tuple([Guardian.string(), Guardian.number()])
        .rest(Guardian.boolean());
      asserts.assertThrows(() => t.parse(['only-one']), GuardianError);
    });

    it('emits items as the rest guardian schema in JSON Schema', () => {
      const t = Guardian.tuple([Guardian.string()]).rest(Guardian.number());
      const json = t.toJSONSchema();
      asserts.assertEquals(
        (json.items as Record<string, unknown>).type,
        'number',
      );
      asserts.assertEquals(json.minItems, 1);
      // No maxItems when rest is present.
      asserts.assertEquals(json.maxItems, undefined);
    });
  });

  describe('labels — positional names in errors', () => {
    it('uses the label in the error message at the failing position', () => {
      const xy = Guardian.tuple([
        Guardian.number(),
        Guardian.number().positive(),
      ]).labels(['x', 'y']);

      const [err] = xy.safeParse([0, -1]);
      asserts.assertInstanceOf(err, GuardianError);
      asserts.assertStringIncludes(err.message, "'y' (index 1)");
    });

    it('labels survive describe() chaining', () => {
      const xy = Guardian.tuple([Guardian.number(), Guardian.number()])
        .labels(['x', 'y'])
        .describe({ title: 'Coords' });

      const [err] = xy.safeParse([0, 'oops']);
      asserts.assertInstanceOf(err, GuardianError);
      asserts.assertStringIncludes(err.message, "'y'");
    });

    it('rejects mismatched label count', () => {
      asserts.assertThrows(() =>
        Guardian.tuple([Guardian.string(), Guardian.number()])
          .labels(['only-one'])
      );
    });
  });
});
