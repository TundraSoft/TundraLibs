import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat';
import { Guardian, GuardianError } from '../../mod.ts';

describe('guardian.MapGuardian', () => {
  describe('input coercion', () => {
    it('accepts native Map instances', () => {
      const guard = Guardian.map(Guardian.string(), Guardian.number());
      const out = guard.parse(new Map([['a', 1], ['b', 2]]));
      asserts.assert(out instanceof Map);
      asserts.assertEquals(out.size, 2);
      asserts.assertEquals(out.get('a'), 1);
      asserts.assertEquals(out.get('b'), 2);
    });

    it('accepts arrays of [K, V] pairs', () => {
      const guard = Guardian.map(Guardian.string(), Guardian.number());
      const out = guard.parse([['a', 1], ['b', 2]]);
      asserts.assert(out instanceof Map);
      asserts.assertEquals(out.size, 2);
      asserts.assertEquals(out.get('a'), 1);
    });

    it('accepts plain objects (string keys only)', () => {
      const guard = Guardian.map(Guardian.string(), Guardian.number());
      const out = guard.parse({ a: 1, b: 2 });
      asserts.assert(out instanceof Map);
      asserts.assertEquals(out.size, 2);
      asserts.assertEquals(out.get('a'), 1);
      asserts.assertEquals(out.get('b'), 2);
    });

    it('rejects scalars and null', () => {
      const guard = Guardian.map(Guardian.string(), Guardian.number());
      asserts.assertThrows(() => guard.parse(null), GuardianError);
      asserts.assertThrows(() => guard.parse(42), GuardianError);
      asserts.assertThrows(() => guard.parse('not-a-map'), GuardianError);
    });

    it('rejects entries that are not 2-element arrays', () => {
      const guard = Guardian.map(Guardian.string(), Guardian.number());
      asserts.assertThrows(
        () => guard.parse([['only-key']]),
        GuardianError,
        'must be a [key, value] pair',
      );
    });

    it('object input with __proto__ does not pollute the Map output', () => {
      // Unlike plain-object outputs, a Map stores `__proto__` as a normal
      // entry via `.set()` — it is NOT an own property, so there is no
      // prototype-pollution vector here. `JSON.parse` makes `__proto__`
      // an own enumerable key on the input object.
      const guard = Guardian.map(Guardian.string(), Guardian.number());
      const out = guard.parse(JSON.parse('{"a":1,"__proto__":2}'));
      asserts.assert(out instanceof Map);
      asserts.assertEquals(out.get('__proto__'), 2);
      asserts.assertEquals(
        Object.prototype.hasOwnProperty.call(out, '__proto__'),
        false,
      );
      asserts.assertEquals(Object.getPrototypeOf(out), Map.prototype);
    });
  });

  describe('key & value validation', () => {
    it('runs the key guardian on every key', () => {
      const guard = Guardian.map(
        Guardian.string().minLength(1),
        Guardian.number(),
      );
      asserts.assertThrows(
        () => guard.parse([['', 1]]),
        GuardianError,
      );
    });

    it('runs the value guardian on every value', () => {
      const guard = Guardian.map(
        Guardian.string(),
        Guardian.number().integer(),
      );
      asserts.assertThrows(
        () => guard.parse([['a', 1.5]]),
        GuardianError,
      );
    });

    it('tags the error with the entry index on the path', () => {
      const guard = Guardian.map(
        Guardian.string(),
        Guardian.number().integer(),
      );
      const [err] = guard.safeParse([['a', 1], ['b', 2.2]]);
      asserts.assertInstanceOf(err, GuardianError);
      asserts.assertEquals(err.path[0], 1);
    });

    it('supports non-string keys via array-of-pairs', () => {
      const guard = Guardian.map(Guardian.number(), Guardian.string());
      const out = guard.parse([[1, 'one'], [2, 'two']]);
      asserts.assertEquals(out.get(1), 'one');
      asserts.assertEquals(out.get(2), 'two');
    });
  });

  describe('schema emit', () => {
    it('emits array-of-pairs in toOpenAPI', () => {
      const guard = Guardian.map(Guardian.string(), Guardian.number());
      const schema = guard.toOpenAPI();
      asserts.assertEquals(schema.type, 'array');
      const items = schema.items as Record<string, unknown>;
      asserts.assertEquals(items.type, 'array');
      asserts.assertEquals(items.minItems, 2);
      asserts.assertEquals(items.maxItems, 2);
    });

    it('emits prefixItems in toJSONSchema', () => {
      const guard = Guardian.map(Guardian.string(), Guardian.number());
      const schema = guard.toJSONSchema();
      asserts.assertEquals(schema.type, 'array');
      const items = schema.items as Record<string, unknown>;
      const [keySchema, valueSchema] = items.prefixItems as [
        Record<string, unknown>,
        Record<string, unknown>,
      ];
      asserts.assertEquals(keySchema.type, 'string');
      asserts.assertEquals(valueSchema.type, 'number');
      asserts.assertEquals(items.minItems, 2);
      asserts.assertEquals(items.maxItems, 2);
    });
  });
});
