/**
 * Regression tests for the round-7 adversarial review finding.
 *
 * ROOT CAUSE (recurred four times): guards adopted thenable-shaped
 * VALUES via the idiom `isPromiseLike(x) ? await x : x`. `isPromiseLike`
 * returns `true` for ANY object with a callable `then`, so `await x`
 * (or `.then(x)`) ran the ECMAScript promise-adoption procedure on a
 * plain VALUE that merely LOOKED thenable — silently replacing it with
 * its resolution. Prior rounds gated the FINAL aggregated result of each
 * composite (round 6) and the step boundaries in `process()`/`refine()`
 * /`test()`/`optional()` (round 5), but the PER-CHILD value-adoption
 * sites inside every composite's native-async transform still used the
 * raw idiom — so a SYNC child whose value is thenable-shaped was adopted
 * BEFORE the round-6 result gate could run.
 *
 * The confirmed HIGH:
 *   Guardian.object({
 *     data: Guardian.unknown(),
 *     id: Guardian.number().refine(async () => true, 'ok'),
 *   }).safeParseAsync({ data: { then: (r) => r('DESTROYED'), keep: 1 }, id: 1 })
 * returned `[null, { data: 'DESTROYED', id: 1 }]` — the sync `data`
 * field's thenable-shaped value was adopted at the per-field adoption
 * point before any gate ran.
 *
 * The fix replaces the idiom at EVERY value-adoption site with
 *   `RESULT = x instanceof Promise ? await x : gateAsyncStepResult(x)`
 * (real Promise → await; non-Promise thenable-shaped VALUE → refused
 * loudly; plain value → passed). These tests drive each site with a
 * thenable-shaped VALUE delivered to a SYNC child (field / element /
 * key / value / position) while a sibling ASYNC step forces the
 * composite onto its native-async path. Each is RED on the pre-fix
 * source (adopts, returns the resolution) and GREEN after (refuses).
 *
 * Homogeneous containers (array / set) have a single element guardian,
 * so their async flag can only come from that same guardian — which
 * would gate the thenable itself. To reproduce the container-async +
 * SYNC-child state (the homogeneous analog of object's sync-field-under-
 * async-sibling), they are constructed with explicit `{ isAsync: true }`
 * metadata, the documented "inherited flag (clone / explicit metadata)"
 * path (`BaseGuardian._initAsyncProbe`). This isolates the per-element
 * adoption idiom itself rather than an upstream gate.
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import {
  ArrayGuardian,
  BaseGuardian,
  BigIntGuardian,
  DateGuardian,
  Guardian,
  GuardianError,
  NumberGuardian,
  SetGuardian,
  StringGuardian,
} from '../mod.ts';

/**
 * The exact repro value: a plain object that merely LOOKS thenable (it
 * carries a callable `then`) plus a sibling own property (`keep`) that
 * promise adoption would silently discard. `then` resolves synchronously
 * so adoption is observable in a single tick.
 */
const makeThenable = (resolveWith: unknown = 'DESTROYED') => ({
  then: (r: (v: unknown) => void) => r(resolveWith),
  keep: 1,
});

/**
 * Same thenable-shaped VALUE, typed as `T` so it satisfies the
 * type-crossing `.process(fn, ScalarGuardian)` signature. The runtime
 * object is deliberately NOT a real Promise — the whole point is that it
 * merely looks thenable.
 */
const thenableTyped = <T>(resolveWith: unknown): T =>
  makeThenable(resolveWith) as unknown as T;

/**
 * The refusal message is surfaced DIRECTLY for containers that rethrow
 * (array / set / tuple / map / scalars) and NESTED in the per-field
 * cause map for the object / record aggregate envelopes. `toJSON()`
 * serializes the whole cause tree, so it captures both shapes.
 */
const mentionsThenable = (err: GuardianError): boolean =>
  JSON.stringify(err.toJSON()).includes('thenable');

/** Assert that a schema REFUSES (does not adopt) a thenable-shaped value. */
async function assertRefuses(
  schema: BaseGuardian<unknown>,
  input: unknown,
): Promise<void> {
  // parseAsync rejects with a GuardianError naming the thenable refusal.
  const err = await asserts.assertRejects(
    () => schema.parseAsync(input),
    GuardianError,
  );
  asserts.assert(
    mentionsThenable(err),
    `expected a thenable-refusal error, got: ${err.message}`,
  );

  // safeParseAsync surfaces the refusal as an error tuple, NOT
  // unvalidated/adopted data behind a null error.
  const [sErr, data] = await schema.safeParseAsync(input);
  asserts.assertInstanceOf(sErr, GuardianError);
  asserts.assertEquals(data, undefined);
  asserts.assert(mentionsThenable(sErr));
}

describe('guardian.round-7 review regressions (thenable adoption)', () => {
  describe('composite guards refuse a thenable-shaped SYNC-child value', () => {
    it('ObjectGuardian field (the confirmed HIGH) refuses, not adopt', async () => {
      // The exact repro. `data` is a SYNC child (`unknown`); `id` carries
      // the async step forcing `__validateObjectAsync`.
      const schema = Guardian.object({
        data: Guardian.unknown(),
        id: Guardian.number().refine(async () => true, 'ok'),
      });
      asserts.assertEquals(schema.metaData?.isAsync, true);

      const input = { data: makeThenable(), id: 1 };

      // Pre-fix this returned [null, { data: 'DESTROYED', id: 1 }].
      const [err, data] = await schema.safeParseAsync(input);
      asserts.assertInstanceOf(err, GuardianError);
      asserts.assertEquals(data, undefined);
      asserts.assert(mentionsThenable(err));

      await assertRefuses(schema, input);
    });

    it('ObjectGuardian catchall value refuses, not adopt', async () => {
      // The async `id` field forces the native async path; `extra` flows
      // through the SYNC catchall guardian (`unknown`) to the per-property
      // adoption point. The result object itself is NOT thenable-shaped,
      // so only the per-value gate can catch this.
      const schema = Guardian.object({
        id: Guardian.number().refine(async () => true, 'ok'),
      }).catchall(Guardian.unknown());
      asserts.assertEquals(schema.metaData?.isAsync, true);

      await assertRefuses(schema, { id: 1, extra: makeThenable() });
    });

    it('RecordGuardian value refuses, not adopt', async () => {
      // Async KEY validator forces `__validateRecordAsync`; the SYNC value
      // validator (`unknown`) delivers the thenable to the per-value site.
      const schema = Guardian.record(
        Guardian.string().refine(async () => true, 'ok'),
        Guardian.unknown(),
      );
      asserts.assertEquals(schema.metaData?.isAsync, true);

      await assertRefuses(schema, { a: makeThenable() });
    });

    it('ArrayGuardian element refuses, not adopt', async () => {
      // SYNC element guardian under an explicitly async-flagged array
      // (the homogeneous analog of a sync field under an async sibling).
      const schema = new ArrayGuardian<unknown>(Guardian.unknown(), {
        isAsync: true,
      });
      asserts.assertEquals(schema.metaData?.isAsync, true);

      await assertRefuses(schema, [makeThenable()]);
    });

    it('TupleGuardian position refuses, not adopt', async () => {
      // Position 0 is a SYNC child; position 1 forces the async path.
      const schema = Guardian.tuple([
        Guardian.unknown(),
        Guardian.number().refine(async () => true, 'ok'),
      ]);
      asserts.assertEquals(schema.metaData?.isAsync, true);

      await assertRefuses(schema, [makeThenable(), 1]);
    });

    it('TupleGuardian rest element refuses, not adopt', async () => {
      // The leading positional carries the async step; the SYNC rest
      // guardian (`unknown`) delivers the thenable to the rest site.
      const schema = Guardian.tuple([
        Guardian.number().refine(async () => true, 'ok'),
      ]).rest(Guardian.unknown());
      asserts.assertEquals(schema.metaData?.isAsync, true);

      await assertRefuses(schema, [1, makeThenable()]);
    });

    it('MapGuardian value refuses, not adopt', async () => {
      // Async KEY guardian forces `__validateEntriesAsync`; the SYNC value
      // guardian (`unknown`) delivers the thenable to the per-value site.
      const schema = Guardian.map(
        Guardian.string().refine(async () => true, 'ok'),
        Guardian.unknown(),
      );
      asserts.assertEquals(schema.metaData?.isAsync, true);

      await assertRefuses(schema, new Map([['a', makeThenable()]]));
    });

    it('MapGuardian key refuses, not adopt', async () => {
      // Map keys may be objects, so a thenable-shaped KEY is realistic.
      // The async VALUE guardian forces the async path; the SYNC key
      // guardian (`unknown`) delivers the thenable to the per-key site.
      const schema = Guardian.map(
        Guardian.unknown(),
        Guardian.number().refine(async () => true, 'ok'),
      );
      asserts.assertEquals(schema.metaData?.isAsync, true);

      await assertRefuses(schema, new Map([[makeThenable(), 1]]));
    });

    it('SetGuardian element refuses, not adopt', async () => {
      const schema = new SetGuardian<unknown>(Guardian.unknown(), {
        isAsync: true,
      });
      asserts.assertEquals(schema.metaData?.isAsync, true);

      await assertRefuses(schema, new Set([makeThenable()]));
    });
  });

  describe('scalar guards refuse a thenable-shaped transform result', () => {
    // A scalar's per-transform adoption site lives in its constructor's
    // `finalTransform`, reachable only when the scalar is built WITH an
    // upstream transform (type-crossing `.process(fn, ScalarGuardian)`).
    // `fn` returns a thenable-shaped VALUE; the trailing async `refine`
    // forces the async path. The thenable resolves to a TYPE-COERCIBLE
    // value so the pre-fix behavior is observable as ADOPTION (a resolved
    // value) rather than a downstream coercion error — the shape matches
    // the exact repro (thenable + sibling `keep` property).

    it('StringGuardian refuses, not adopt', async () => {
      const schema = Guardian.unknown()
        .process(() => thenableTyped<string>('DESTROYED'), StringGuardian)
        .refine(async () => true, 'ok');
      asserts.assertEquals(schema.metaData?.isAsync, true);

      await assertRefuses(schema, 'seed');
    });

    it('NumberGuardian refuses, not adopt', async () => {
      const schema = Guardian.unknown()
        .process(() => thenableTyped<number>(42), NumberGuardian)
        .refine(async () => true, 'ok');
      asserts.assertEquals(schema.metaData?.isAsync, true);

      await assertRefuses(schema, 'seed');
    });

    it('BigIntGuardian refuses, not adopt', async () => {
      const schema = Guardian.unknown()
        .process(() => thenableTyped<bigint>(42), BigIntGuardian)
        .refine(async () => true, 'ok');
      asserts.assertEquals(schema.metaData?.isAsync, true);

      await assertRefuses(schema, 'seed');
    });

    it('DateGuardian refuses, not adopt', async () => {
      const schema = Guardian.unknown()
        .process(() => thenableTyped<Date>(0), DateGuardian)
        .refine(async () => true, 'ok');
      asserts.assertEquals(schema.metaData?.isAsync, true);

      await assertRefuses(schema, 'seed');
    });
  });

  describe('the fix does not over-refuse legitimate async validation', () => {
    it('object with a genuine async field and NO thenable validates', async () => {
      const schema = Guardian.object({
        data: Guardian.unknown(),
        id: Guardian.number().refine(async () => true, 'ok'),
      });
      const out = await schema.parseAsync({ data: { keep: 1 }, id: 1 }) as {
        data: { keep: number };
        id: number;
      };
      asserts.assertEquals(out, { data: { keep: 1 }, id: 1 });
    });

    it('async record / array / map / set without thenables validate', async () => {
      const rec = Guardian.record(
        Guardian.string().refine(async () => true, 'ok'),
        Guardian.unknown(),
      );
      asserts.assertEquals(await rec.parseAsync({ a: 1, b: 2 }), {
        a: 1,
        b: 2,
      });

      const arr = new ArrayGuardian<unknown>(Guardian.unknown(), {
        isAsync: true,
      });
      asserts.assertEquals(await arr.parseAsync([1, 2, 3]), [1, 2, 3]);

      const map = Guardian.map(
        Guardian.string().refine(async () => true, 'ok'),
        Guardian.unknown(),
      );
      const m = await map.parseAsync(new Map([['a', 1]]));
      asserts.assertEquals(m instanceof Map, true);
      asserts.assertEquals(m.get('a'), 1);

      const set = new SetGuardian<unknown>(Guardian.unknown(), {
        isAsync: true,
      });
      const s = await set.parseAsync(new Set([1, 2]));
      asserts.assertEquals(s instanceof Set, true);
      asserts.assertEquals(s.has(2), true);
    });

    it('an object `then` holding a NON-callable value is not refused', async () => {
      // Only a CALLABLE `then` is adoptable; `then` holding data is a
      // legitimate value that must pass on the async path.
      const schema = Guardian.object({
        id: Guardian.number().refine(async () => true, 'ok'),
      }).catchall(Guardian.unknown());
      const out = await schema.parseAsync({
        id: 1,
        then: 'not-callable',
      }) as Record<string, unknown>;
      asserts.assertEquals(out, { id: 1, then: 'not-callable' });
    });

    it('the equivalent SYNC parse returns the thenable-shaped value untouched', () => {
      // Proves refusal is a parseAsync-specific contract (promise adoption
      // would destroy the value), not intrinsic invalidity: the fully-sync
      // path preserves the same value.
      const schema = Guardian.object({
        data: Guardian.unknown(),
        id: Guardian.number(),
      });
      const out = schema.parse({ data: makeThenable(), id: 1 }) as {
        data: { keep: number; then: unknown };
        id: number;
      };
      asserts.assertEquals(out.id, 1);
      asserts.assertEquals(out.data.keep, 1);
      asserts.assertEquals(typeof out.data.then, 'function');
    });

    it('a WRAPPER refine/process over record|array of unknown() preserves a nested thenable', async () => {
      // The round-7 fix refuses a thenable-shaped value only where a nested
      // value is actually awaited — a container made async by an async
      // key/value guardian. A *wrapper* refine/process flips only the CHAIN's
      // async flag, never the container's internal per-value path, so
      // record|array(unknown()) still takes its synchronous internal path and
      // copies nested values BY REFERENCE. A nested thenable therefore keeps
      // its callable `then` and siblings — byte-for-byte identical to the
      // sync parse() — rather than being adopted or having `then` stripped.
      // Locks the wrapper direction of the round-7 fix against regression.
      const recInput = { x: makeThenable() };
      const recAsync = await Guardian.record(Guardian.unknown())
        .refine(async () => true, 'ok')
        .parseAsync(recInput);
      const recSync = Guardian.record(Guardian.unknown()).parse(recInput);
      asserts.assertEquals(recAsync, recSync);
      const recX =
        (recAsync as unknown as { x: { keep: number; then: unknown } })
          .x;
      asserts.assertEquals(recX.keep, 1);
      asserts.assertEquals(typeof recX.then, 'function');

      const arrInput = [makeThenable()];
      const arrAsync = await Guardian.array(Guardian.unknown())
        .process(async (a) => a)
        .parseAsync(arrInput);
      const arrSync = Guardian.array(Guardian.unknown()).parse(arrInput);
      asserts.assertEquals(arrAsync, arrSync);
      asserts.assertEquals(
        typeof (arrAsync as unknown as Array<{ then: unknown }>)[0]!.then,
        'function',
      );
    });

    it('optional() function default routes on callability, not `then` presence', () => {
      // Round-7 codemod SIBLING-MISS: the `optional()` function-default
      // handler decided promise-ness by the mere PRESENCE of a `then` key
      // (`'then' in result`) instead of callability. A default FUNCTION
      // returning a plain object whose `then` is NON-callable is DATA, not
      // a promise; the presence-check mis-routed it into a native `.then()`
      // call, which threw (`then` is a string, not a function). It must now
      // validate + pass through exactly like the identical-shape
      // DIRECT-value default. THROWS on pre-fix source.
      const schema = Guardian.object({
        then: Guardian.string(),
        keep: Guardian.number(),
      });
      const fromFn = schema
        .optional(() => ({ then: 'later', keep: 1 }))
        .parse(undefined) as { then: string; keep: number };
      const fromValue = schema
        .optional({ then: 'later', keep: 1 })
        .parse(undefined) as { then: string; keep: number };
      asserts.assertEquals(fromFn, { then: 'later', keep: 1 });
      // Function default and direct-value default must agree.
      asserts.assertEquals(fromFn, fromValue);
    });

    it('optional() with a real-Promise default is awaited async, refused sync', async () => {
      // The other side of the callability decision: a GENUINE async default
      // (`instanceof Promise`) is still routed through `.then` and validated
      // on resolution in parseAsync — and still surfaces the standard
      // sync-on-async usage error in parse() (you cannot await synchronously).
      const schema = Guardian.object({
        then: Guardian.string(),
        keep: Guardian.number(),
      }).optional(async () => ({ then: 'later', keep: 1 }));

      const asyncOut = await schema.parseAsync(undefined) as {
        then: string;
        keep: number;
      };
      asserts.assertEquals(asyncOut, { then: 'later', keep: 1 });

      asserts.assertThrows(() => schema.parse(undefined), GuardianError);
    });
  });
});
