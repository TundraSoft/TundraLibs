/**
 * Regression tests for the round-5 adversarial review finding.
 *
 * Round 5 reviewed the round-4 REMEDIATION of finding 2 (parseAsync
 * silently adopting thenable-shaped VALUES). Round 4 added
 * `isAdoptableThenable` guards to parseAsync, but they only fired on
 * SYNC chains: on an ASYNC chain the composed transform returns a
 * native Promise whose resolution ADOPTS (destroys) the thenable
 * BEFORE the guard could run, so `parseAsync`/`safeParseAsync` still
 * silently replaced the validated value with the thenable's
 * resolution.
 *
 * These tests therefore drive the ASYNC-CHAIN path specifically (every
 * schema below contains at least one async step). Each is RED on the
 * round-4 source and GREEN after the round-5 fix, which gates every
 * async step boundary through `gateAsyncStepResult` so the refusal is
 * uniform across sync AND async chains.
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat';
import { Guardian, GuardianError } from '../mod.ts';

describe('guardian.round-5 review regressions', () => {
  // C1 — MEDIUM: parseAsync's thenable refusal only fired on sync
  // chains; async chains still silently adopted (destroyed)
  // thenable-shaped values.
  describe(
    'finding C1: parseAsync refuses thenable-shaped values on ASYNC chains too',
    () => {
      it('async refine chain does not adopt a thenable-shaped value', async () => {
        const thenable = { id: 7, then: (r: (v: unknown) => void) => r(42) };
        const schema = Guardian.unknown().refine(async () => true, 'ok');
        // The chain IS async — proves we exercise the slow path.
        asserts.assertEquals(schema.metaData?.isAsync, true);
        const err = await asserts.assertRejects(
          () => schema.parseAsync(thenable),
          GuardianError,
        );
        asserts.assertStringIncludes(err.message, 'thenable');
        // The SYNC entry point (on an equivalent sync chain) returns the
        // same thenable untouched — proving parseAsync refuses rather
        // than the value being intrinsically invalid.
        asserts.assertStrictEquals(
          Guardian.unknown().parse(thenable),
          thenable,
        );
      });

      it('async passthrough object carrying `then` is not replaced by its resolution', async () => {
        const val = {
          id: 1,
          then: (r: (v: unknown) => void) => r({ id: 999 }),
        };
        const schema = Guardian.object({ id: Guardian.number() })
          .passthrough()
          .refine(async () => true, 'ok');
        asserts.assertEquals(schema.metaData?.isAsync, true);
        const [err, data] = await schema.safeParseAsync(val);
        asserts.assertExists(err);
        asserts.assertEquals(data, undefined);
        asserts.assertStringIncludes(err.message, 'thenable');
        // The equivalent SYNC chain validates without adopting: id:1
        // survives (it is NOT replaced by the thenable's id:999).
        const syncSchema = Guardian.object({ id: Guardian.number() })
          .passthrough();
        asserts.assertEquals((syncSchema.parse(val) as { id: number }).id, 1);
      });

      it('an async chain whose .process() RETURNS a thenable-shaped value is refused', async () => {
        // The mandated case: the thenable is PRODUCED by a sync
        // `.process()` step on an otherwise-async chain (so it can never
        // have been the input). Pre-fix this resolved to 'destroyed'.
        const produced = {
          v: 1,
          then: (r: (v: unknown) => void) => r('destroyed'),
        };
        const schema = Guardian.string()
          .refine(async () => true, 'ok')
          .process(() => produced);
        asserts.assertEquals(schema.metaData?.isAsync, true);
        const err = await asserts.assertRejects(
          () => schema.parseAsync('x'),
          GuardianError,
        );
        asserts.assertStringIncludes(err.message, 'thenable');
      });

      it('safeParseAsync surfaces the refusal as a tuple, not silent data', async () => {
        const produced = {
          v: 1,
          then: (r: (v: unknown) => void) => r('destroyed'),
        };
        const schema = Guardian.string()
          .refine(async () => true, 'ok')
          .process(() => produced);
        const [err, data] = await schema.safeParseAsync('x');
        asserts.assertExists(err);
        asserts.assertEquals(data, undefined);
        asserts.assertStringIncludes(err.message, 'thenable');
      });

      it('async .test() sibling path also refuses a thenable-shaped value', async () => {
        const thenable = { id: 5, then: (r: (v: unknown) => void) => r(99) };
        const schema = Guardian.unknown().test(async () => true, 'ok');
        asserts.assertEquals(schema.metaData?.isAsync, true);
        const err = await asserts.assertRejects(
          () => schema.parseAsync(thenable),
          GuardianError,
        );
        asserts.assertStringIncludes(err.message, 'thenable');
      });

      it('a thenable produced BEFORE an async refine step is still refused', async () => {
        // Ordering variant: the thenable is produced by a sync step
        // that runs BEFORE the async refine passes it through. Covers
        // the refine() choke point rather than the composition wrapper.
        const produced = {
          v: 2,
          then: (r: (v: unknown) => void) => r('gone'),
        };
        const schema = Guardian.unknown()
          .process(() => produced)
          .refine(async () => true, 'ok');
        asserts.assertEquals(schema.metaData?.isAsync, true);
        const err = await asserts.assertRejects(
          () => schema.parseAsync('anything'),
          GuardianError,
        );
        asserts.assertStringIncludes(err.message, 'thenable');
      });

      it('a non-settling thenable on an async chain rejects instead of hanging', async () => {
        const nonSettling = { then: () => 'x' };
        const schema = Guardian.unknown().refine(async () => true, 'ok');
        const raced = await Promise.race([
          schema.safeParseAsync(nonSettling).then(([e]) =>
            e ? 'refused' : 'resolved'
          ),
          new Promise<string>((r) => setTimeout(() => r('HUNG'), 500)),
        ]);
        asserts.assertEquals(raced, 'refused');
      });

      it('genuine async chains with NON-thenable values are unaffected', async () => {
        // Guard against over-refusal: normal async validation must pass.
        const g = Guardian.string().refine(
          async (v) => v.length > 1,
          'too short',
        );
        asserts.assertEquals(await g.parseAsync('ok'), 'ok');
        const obj = Guardian.object({ id: Guardian.number() })
          .refine(async () => true, 'ok');
        asserts.assertEquals(await obj.parseAsync({ id: 3 }), { id: 3 });
        // A validation failure still surfaces as an error, not a thenable one.
        const [err] = await g.safeParseAsync('x');
        asserts.assertExists(err);
        asserts.assertEquals(err.message.includes('thenable'), false);
      });
    },
  );
});
