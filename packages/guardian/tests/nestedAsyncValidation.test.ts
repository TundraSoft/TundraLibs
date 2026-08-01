import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat';
import { Guardian } from '../Guardian.ts';
import { GuardianError } from '../mod.ts';

/**
 * Re-review regression suite: async validators declared on nested
 * fields / array elements / record & map values / set elements / tuple
 * positions / discriminated-union branches / intersection members must
 * be **enforced**, not silently bypassed.
 *
 * Before the fix, container guardians called each child's
 * `_composedTransform` directly and stored the returned pending Promise
 * in the slot without awaiting it — the container never flagged itself
 * async, so `parse()` didn't reject and `parseAsync()` didn't await.
 * The result: invalid data passed and the validator's rejection escaped
 * as an unhandled promise rejection.
 *
 * Every case asserts the same contract the top level already enforces:
 *   1. the sync `parse()` path throws "use parseAsync()" (no silent pass),
 *   2. `parseAsync()` REJECTS a value the async validator fails, and
 *   3. `parseAsync()` RESOLVES a value the async validator accepts.
 */
describe('guardian nested async enforcement', () => {
  const positive = () =>
    Guardian.number().refine(async (n) => n > 0, 'must be positive');

  describe('ObjectGuardian (nested field)', () => {
    const schema = Guardian.object({ n: positive() });

    it('sync parse throws instead of silently passing', () => {
      asserts.assertThrows(
        () => schema.parse({ n: 1 }),
        GuardianError,
        'Cannot use parse() with async validation steps',
      );
    });

    it('parseAsync rejects a failing value', async () => {
      const [err] = await schema.safeParseAsync({ n: -1 });
      asserts.assertInstanceOf(err, GuardianError);
    });

    it('parseAsync resolves a passing value without pending promises', async () => {
      const out = await schema.parseAsync({ n: 5 });
      asserts.assertEquals(out, { n: 5 });
      asserts.assertEquals((out.n as unknown) instanceof Promise, false);
    });
  });

  describe('deeply nested ObjectGuardian', () => {
    const schema = Guardian.object({
      inner: Guardian.object({ n: positive() }),
    });

    it('propagates async-ness through the nesting (sync parse throws)', () => {
      asserts.assertThrows(
        () => schema.parse({ inner: { n: 1 } }),
        GuardianError,
        'Cannot use parse() with async validation steps',
      );
    });

    it('parseAsync rejects a failing deep value', async () => {
      const [err] = await schema.safeParseAsync({ inner: { n: -1 } });
      asserts.assertInstanceOf(err, GuardianError);
    });

    it('parseAsync resolves a passing deep value', async () => {
      asserts.assertEquals(await schema.parseAsync({ inner: { n: 2 } }), {
        inner: { n: 2 },
      });
    });
  });

  describe('ArrayGuardian (element)', () => {
    const schema = Guardian.array(positive());

    it('sync parse throws', () => {
      asserts.assertThrows(
        () => schema.parse([1]),
        GuardianError,
        'Cannot use parse() with async validation steps',
      );
    });

    it('parseAsync rejects when an element fails', async () => {
      const [err] = await schema.safeParseAsync([1, -2, 3]);
      asserts.assertInstanceOf(err, GuardianError);
    });

    it('parseAsync resolves all-passing elements (no pending promises)', async () => {
      const out = await schema.parseAsync([1, 2, 3]);
      asserts.assertEquals(out, [1, 2, 3]);
      asserts.assertEquals((out[0] as unknown) instanceof Promise, false);
    });
  });

  describe('RecordGuardian (value)', () => {
    const schema = Guardian.record(positive());

    it('sync parse throws', () => {
      asserts.assertThrows(
        () => schema.parse({ a: 1 }),
        GuardianError,
        'Cannot use parse() with async validation steps',
      );
    });

    it('parseAsync rejects when a value fails', async () => {
      const [err] = await schema.safeParseAsync({ a: 1, b: -1 });
      asserts.assertInstanceOf(err, GuardianError);
    });

    it('parseAsync resolves passing values', async () => {
      asserts.assertEquals(await schema.parseAsync({ a: 1, b: 2 }), {
        a: 1,
        b: 2,
      });
    });
  });

  describe('MapGuardian (value)', () => {
    const schema = Guardian.map(Guardian.string(), positive());

    it('sync parse throws', () => {
      asserts.assertThrows(
        () => schema.parse([['a', 1]]),
        GuardianError,
        'Cannot use parse() with async validation steps',
      );
    });

    it('parseAsync rejects when a value fails', async () => {
      const [err] = await schema.safeParseAsync([['a', -1]]);
      asserts.assertInstanceOf(err, GuardianError);
    });

    it('parseAsync resolves passing entries', async () => {
      const out = await schema.parseAsync([['a', 1], ['b', 2]]);
      asserts.assertEquals(out.get('a'), 1);
      asserts.assertEquals(out.get('b'), 2);
    });
  });

  describe('SetGuardian (element)', () => {
    const schema = Guardian.set(positive());

    it('sync parse throws', () => {
      asserts.assertThrows(
        () => schema.parse([1]),
        GuardianError,
        'Cannot use parse() with async validation steps',
      );
    });

    it('parseAsync rejects when an element fails', async () => {
      const [err] = await schema.safeParseAsync([1, -1]);
      asserts.assertInstanceOf(err, GuardianError);
    });

    it('parseAsync resolves passing elements', async () => {
      const out = await schema.parseAsync([1, 2, 2]);
      asserts.assertEquals([...out], [1, 2]);
    });
  });

  describe('TupleGuardian (position + rest)', () => {
    const schema = Guardian.tuple([Guardian.string(), positive()]);

    it('sync parse throws', () => {
      asserts.assertThrows(
        () => schema.parse(['x', 1]),
        GuardianError,
        'Cannot use parse() with async validation steps',
      );
    });

    it('parseAsync rejects when a position fails', async () => {
      const [err] = await schema.safeParseAsync(['x', -1]);
      asserts.assertInstanceOf(err, GuardianError);
    });

    it('parseAsync resolves passing positions', async () => {
      asserts.assertEquals(await schema.parseAsync(['x', 3]), ['x', 3]);
    });

    it('enforces async in the variadic rest guardian', async () => {
      const withRest = Guardian.tuple([Guardian.string()]).rest(positive());
      asserts.assertThrows(
        () => withRest.parse(['x', 1]),
        GuardianError,
        'Cannot use parse() with async validation steps',
      );
      const [err] = await withRest.safeParseAsync(['x', 1, -1]);
      asserts.assertInstanceOf(err, GuardianError);
      asserts.assertEquals(await withRest.parseAsync(['x', 1, 2]), [
        'x',
        1,
        2,
      ]);
    });
  });

  describe('DiscriminatedUnionGuardian (branch)', () => {
    const schema = Guardian.discriminatedUnion('kind', [
      Guardian.object({ kind: Guardian.literal('a'), n: positive() }),
      Guardian.object({ kind: Guardian.literal('b'), s: Guardian.string() }),
    ]);

    it('sync parse throws when the matched branch is async', () => {
      asserts.assertThrows(
        () => schema.parse({ kind: 'a', n: 1 }),
        GuardianError,
        'Cannot use parse() with async validation steps',
      );
    });

    it('parseAsync rejects a failing branch value', async () => {
      const [err] = await schema.safeParseAsync({ kind: 'a', n: -1 });
      asserts.assertInstanceOf(err, GuardianError);
    });

    it('parseAsync resolves a passing branch value', async () => {
      asserts.assertEquals(await schema.parseAsync({ kind: 'a', n: 7 }), {
        kind: 'a',
        n: 7,
      });
    });
  });

  describe('Guardian.intersection (member)', () => {
    const schema = Guardian.intersection(
      Guardian.object({ a: Guardian.number() }),
      Guardian.object({
        b: Guardian.string().refine(async (s) => s.length > 2, 'too short'),
      }),
    );

    it('sync parse throws when a member is async', () => {
      asserts.assertThrows(
        () => schema.parse({ a: 1, b: 'xyz' }),
        GuardianError,
        'Cannot use parse() with async validation steps',
      );
    });

    it('parseAsync rejects when a member fails', async () => {
      const [err] = await schema.safeParseAsync({ a: 1, b: 'x' });
      asserts.assertInstanceOf(err, GuardianError);
    });

    it('parseAsync merges both members on success (no pending promises)', async () => {
      const out = await schema.parseAsync({ a: 1, b: 'xyz' });
      asserts.assertEquals(out, { a: 1, b: 'xyz' });
      asserts.assertEquals((out.b as unknown) instanceof Promise, false);
    });
  });
});
