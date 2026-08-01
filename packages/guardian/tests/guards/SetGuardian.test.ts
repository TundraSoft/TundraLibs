import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat';
import { Guardian, GuardianError } from '../../mod.ts';

describe('guardian.SetGuardian', () => {
  describe('input coercion', () => {
    it('accepts native Set instances', () => {
      const guard = Guardian.set(Guardian.string());
      const input = new Set(['a', 'b', 'c']);
      const out = guard.parse(input);
      asserts.assert(out instanceof Set);
      asserts.assertEquals(out.size, 3);
    });

    it('coerces arrays to Set, deduplicating duplicates', () => {
      const guard = Guardian.set(Guardian.string());
      const out = guard.parse(['a', 'b', 'a', 'c']);
      asserts.assert(out instanceof Set);
      asserts.assertEquals(out.size, 3);
      asserts.assert(out.has('a'));
      asserts.assert(out.has('b'));
      asserts.assert(out.has('c'));
    });

    it('rejects non-iterable input', () => {
      const guard = Guardian.set(Guardian.string());
      asserts.assertThrows(() => guard.parse('not a set'), GuardianError);
      asserts.assertThrows(() => guard.parse({}), GuardianError);
      asserts.assertThrows(() => guard.parse(null), GuardianError);
    });
  });

  describe('element validation', () => {
    it('runs the element guardian on every value', () => {
      const guard = Guardian.set(Guardian.string().minLength(1));
      asserts.assertEquals(guard.parse(['foo', 'bar']).size, 2);
      asserts.assertThrows(() => guard.parse(['valid', '']), GuardianError);
    });

    it('reports the failing index on the error path', () => {
      const guard = Guardian.set(Guardian.string().minLength(1));
      const [err] = guard.safeParse(['ok', 'also-ok', '']);
      asserts.assertInstanceOf(err, GuardianError);
      asserts.assertEquals(err.path, [2]);
    });
  });

  describe('without an element guardian (anonymous Set)', () => {
    it('passes inputs through into a Set unchanged', () => {
      const guard = Guardian.set();
      const out = guard.parse([1, 'two', true, null]);
      asserts.assertEquals(out.size, 4);
    });
  });

  describe('schema emit', () => {
    it('emits type: array + uniqueItems: true', () => {
      const guard = Guardian.set(Guardian.string());
      const schema = guard.toOpenAPI();
      asserts.assertEquals(schema.type, 'array');
      asserts.assertEquals(schema.uniqueItems, true);
      asserts.assertEquals(
        (schema.items as Record<string, unknown>).type,
        'string',
      );
    });
  });
});
