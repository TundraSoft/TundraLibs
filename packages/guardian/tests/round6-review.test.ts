/**
 * Regression tests for the round-6 adversarial review finding.
 *
 * Round 6 reviewed the round-5 REMEDIATION of the thenable-adoption
 * finding. Round 5 gated the composition wrapper, `refine()`, `test()`
 * and `optional()`'s async step boundaries through `gateAsyncStepResult`
 * — but a COMPOSITE guardian's native `async` validation/transform
 * method (`ObjectGuardian.__validateObjectAsync`,
 * `RecordGuardian.__validateRecordAsync`, and the async `superRefine()`
 * accumulator) returns a user-shaped result WITHOUT gating. When that
 * result carries a user-supplied `then` key (passthrough / catchall
 * mode), returning it out of a native `async` method makes the
 * ECMAScript promise resolution procedure ADOPT (and silently destroy)
 * it BEFORE parseAsync's top-level guard runs — reintroducing the exact
 * substitution behavior round 5 was meant to close.
 *
 * The round-5 tests only ever put the async step on the object WRAPPER
 * (`.passthrough().refine(async …)`), which keeps the object's internal
 * `__async = false` and routes through the already-gated composition
 * wrapper — so the FIELD-async / catchall-async native-transform
 * configuration stayed green. These tests drive that native path
 * specifically: the async step lives on a FIELD (or the catchall, or an
 * async `superRefine`), forcing `__validateObjectAsync` /
 * `__validateRecordAsync`. Each is RED on the round-5 source and GREEN
 * after the round-6 fix, which routes every composite native-async
 * transform's return through the shared `gateAsyncStepResult` choke
 * point.
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat';
import { Guardian, GuardianError } from '../mod.ts';

// A thenable-shaped value: an object with a callable `then`. Promise
// resolution ADOPTS it and replaces it with `r(...)`'s argument.
const makeThen = () => (r: (v: unknown) => void) => r('DESTROYED');

describe('guardian.round-6 review regressions', () => {
  describe(
    'composite native-async transforms refuse thenable-shaped results',
    () => {
      it('FIELD-async object in passthrough mode refuses a `then` key (not adopt)', async () => {
        // The async step is on the FIELD `id`, so the object's own
        // `__async` is true and `__validateObjectAsync` (the native async
        // transform) runs — NOT the composition wrapper the round-5 test
        // exercised.
        const schema = Guardian.object({
          id: Guardian.number().refine(async () => true, 'ok'),
        }).passthrough();
        asserts.assertEquals(schema.metaData?.isAsync, true);

        const input = { id: 1, then: makeThen() };
        const err = await asserts.assertRejects(
          () => schema.parseAsync(input),
          GuardianError,
        );
        asserts.assertStringIncludes(err.message, 'thenable');

        // safeParseAsync surfaces the refusal as an error tuple, NOT
        // unvalidated data with a null error.
        const [sErr, data] = await schema.safeParseAsync(input);
        asserts.assertExists(sErr);
        asserts.assertEquals(data, undefined);
        asserts.assertStringIncludes(sErr.message, 'thenable');
      });

      it('FIELD-async object in catchall mode refuses a `then` key (not adopt)', async () => {
        const schema = Guardian.object({
          id: Guardian.number().refine(async () => true, 'ok'),
        }).catchall(Guardian.unknown());
        asserts.assertEquals(schema.metaData?.isAsync, true);

        const err = await asserts.assertRejects(
          () => schema.parseAsync({ id: 1, then: makeThen() }),
          GuardianError,
        );
        asserts.assertStringIncludes(err.message, 'thenable');
      });

      it('async superRefine() on a passthrough object refuses a `then` key', async () => {
        // The object fields are sync, but an async `superRefine` makes
        // the chain async and its accumulator returns `data` (the
        // passthrough object carrying `then`) out of a native `.then`.
        const schema = Guardian.object({ id: Guardian.number() })
          .passthrough()
          .superRefine([{ validator: async () => true, message: 'ok' }]);
        asserts.assertEquals(schema.metaData?.isAsync, true);

        const err = await asserts.assertRejects(
          () => schema.parseAsync({ id: 1, then: makeThen() }),
          GuardianError,
        );
        asserts.assertStringIncludes(err.message, 'thenable');
      });

      it('VALUE-async record refuses a validated `then` key (not adopt)', async () => {
        // The record's value guardian is async, so `__validateRecordAsync`
        // runs; the input key `then` validates through and lands in the
        // result object, making it thenable-shaped.
        const schema = Guardian.record(
          Guardian.string(),
          Guardian.unknown().refine(async () => true, 'ok'),
        );
        asserts.assertEquals(schema.metaData?.isAsync, true);

        const err = await asserts.assertRejects(
          () => schema.parseAsync({ then: makeThen() }),
          GuardianError,
        );
        asserts.assertStringIncludes(err.message, 'thenable');

        const [sErr, data] = await schema.safeParseAsync({ then: makeThen() });
        asserts.assertExists(sErr);
        asserts.assertEquals(data, undefined);
        asserts.assertStringIncludes(sErr.message, 'thenable');
      });

      it('the equivalent SYNC path returns the thenable-shaped result untouched', () => {
        // Proves the refusal is a parseAsync-specific contract (promise
        // adoption would destroy the value), not intrinsic invalidity: on
        // a fully-sync chain the same passthrough object survives.
        const syncSchema = Guardian.object({ id: Guardian.number() })
          .passthrough();
        const input = { id: 1, then: makeThen() };
        const out = syncSchema.parse(input) as { id: number; then: unknown };
        asserts.assertEquals(out.id, 1);
        asserts.assertEquals(typeof out.then, 'function');
      });
    },
  );

  describe(
    'container native-async transforms (array/tuple/map/set) are gated',
    () => {
      // Array/tuple/map/set results are Array/Map/Set instances that
      // never carry a callable `then`, so their native-async transform's
      // gated return passes through unchanged. These assert the gate is
      // (a) harmless to legitimate async validation and (b) that a
      // thenable ELEMENT/value is still refused at the element boundary.

      it('async array validation is unaffected by the container gate', async () => {
        const schema = Guardian.array(
          Guardian.number().refine(async () => true, 'ok'),
        );
        asserts.assertEquals(schema.metaData?.isAsync, true);
        asserts.assertEquals(await schema.parseAsync([1, 2, 3]), [1, 2, 3]);
      });

      it('async array with a thenable ELEMENT is refused (element boundary)', async () => {
        const schema = Guardian.array(
          Guardian.unknown().refine(async () => true, 'ok'),
        );
        const err = await asserts.assertRejects(
          () => schema.parseAsync([{ then: makeThen() }]),
          GuardianError,
        );
        asserts.assertStringIncludes(err.message, 'thenable');
      });

      it('async tuple validation is unaffected by the container gate', async () => {
        const schema = Guardian.tuple([
          Guardian.number().refine(async () => true, 'ok'),
          Guardian.string(),
        ]);
        asserts.assertEquals(schema.metaData?.isAsync, true);
        asserts.assertEquals(await schema.parseAsync([1, 'a']), [1, 'a']);
      });

      it('async map validation is unaffected by the container gate', async () => {
        const schema = Guardian.map(
          Guardian.string(),
          Guardian.number().refine(async () => true, 'ok'),
        );
        asserts.assertEquals(schema.metaData?.isAsync, true);
        const out = await schema.parseAsync(new Map([['a', 1]]));
        asserts.assertEquals(out instanceof Map, true);
        asserts.assertEquals(out.get('a'), 1);
      });

      it('async set validation is unaffected by the container gate', async () => {
        const schema = Guardian.set(
          Guardian.number().refine(async () => true, 'ok'),
        );
        asserts.assertEquals(schema.metaData?.isAsync, true);
        const out = await schema.parseAsync(new Set([1, 2]));
        asserts.assertEquals(out instanceof Set, true);
        asserts.assertEquals(out.has(1), true);
      });
    },
  );

  describe('the fix does not over-refuse legitimate async composites', () => {
    it('FIELD-async object WITHOUT a `then` key validates normally', async () => {
      const schema = Guardian.object({
        id: Guardian.number().refine(async () => true, 'ok'),
      }).passthrough();
      const out = await schema.parseAsync({ id: 1, extra: 'x' }) as Record<
        string,
        unknown
      >;
      asserts.assertEquals(out, { id: 1, extra: 'x' });
    });

    it('an object field literally named `then` holding a NON-function passes', async () => {
      // Only a CALLABLE `then` is adoptable; a `then` holding data is a
      // legitimate value and must not be refused.
      const schema = Guardian.object({
        id: Guardian.number().refine(async () => true, 'ok'),
      }).passthrough();
      const out = await schema.parseAsync({
        id: 1,
        then: 'not-callable',
      }) as Record<string, unknown>;
      asserts.assertEquals(out, { id: 1, then: 'not-callable' });
    });

    it('VALUE-async record without a `then` key validates normally', async () => {
      const schema = Guardian.record(
        Guardian.string(),
        Guardian.number().refine(async () => true, 'ok'),
      );
      asserts.assertEquals(await schema.parseAsync({ a: 1, b: 2 }), {
        a: 1,
        b: 2,
      });
    });
  });
});
