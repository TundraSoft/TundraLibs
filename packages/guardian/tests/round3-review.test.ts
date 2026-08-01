/**
 * Regression tests for the round-3 adversarial review findings.
 *
 * Each test is RED on the pre-fix source and GREEN after the fix. Kept
 * together (rather than scattered across the per-guard suites) so the
 * whole review can be re-verified in one run.
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat';
import { Guardian, GuardianError } from '../mod.ts';

describe('guardian.round-3 review regressions', () => {
  // 1 — HIGH: default messages embed the raw input value, which
  // toJSON() serialized verbatim (redaction-contract defeat).
  describe('finding 1: toJSON() redaction of the raw received value', () => {
    it('does not leak the raw input through the equals-path message', () => {
      const [err] = Guardian.string()
        .equals('SECRET-TOKEN-XYZ')
        .safeParse('user-supplied-secret');
      asserts.assertExists(err);
      const serialized = JSON.stringify(err.toJSON());
      asserts.assertEquals(serialized.includes('user-supplied-secret'), false);
      // The unredacted value stays reachable in-memory.
      asserts.assertStringIncludes(err.message, 'user-supplied-secret');
    });

    it('does not leak the full raw input through a coercion message', () => {
      const [err] = Guardian.number().safeParse('hunter2-raw-password');
      asserts.assertExists(err);
      const serialized = JSON.stringify(err.toJSON());
      asserts.assertEquals(serialized.includes('hunter2-raw-password'), false);
    });

    it('does not leak a nested field value through the causes map', () => {
      const schema = Guardian.object({
        token: Guardian.string().equals('SUPER-SECRET'),
      });
      const [err] = schema.safeParse({ token: 'attacker-guess-value' });
      asserts.assertExists(err);
      const serialized = JSON.stringify(err.toJSON());
      asserts.assertEquals(serialized.includes('attacker-guess-value'), false);
    });
  });

  // 2 — HIGH: LazyGuardian never propagated isAsync, so async schemas
  // behind lazy() silently bypassed validation on a sync parse().
  describe('finding 2: lazy() propagates async-ness to its container', () => {
    it('sync parse() of an object with a lazy(async) child refuses', () => {
      // Predicate returns true so the pre-fix code does not emit an
      // unhandled rejection — it silently returns { x: <pending
      // Promise> }; the point is that the sync call must REFUSE.
      const AsyncStr = Guardian.string().refine(async () => true, 'unused');
      const Wrap = Guardian.object({ x: Guardian.lazy(() => AsyncStr) });

      asserts.assertThrows(() => Wrap.parse({ x: 'short' }), GuardianError);

      const [err, data] = Wrap.safeParse({ x: 'short' });
      asserts.assertExists(err);
      asserts.assertEquals(data, undefined);
    });

    it('parseAsync() of an object with a lazy(async) child enforces it', async () => {
      const AsyncStr = Guardian.string().refine(
        async (v) => v.length > 3,
        'too short',
      );
      const Wrap = Guardian.object({ x: Guardian.lazy(() => AsyncStr) });

      asserts.assertEquals(
        await Wrap.parseAsync({ x: 'long-enough' }),
        { x: 'long-enough' },
      );
      // The refinement is now actually enforced — its failure surfaces
      // in the aggregate error's cause tree (the object wraps child
      // errors), rather than being silently bypassed.
      const [rejErr, data] = await Wrap.safeParseAsync({ x: 'no' });
      asserts.assertExists(rejErr);
      asserts.assertEquals(data, undefined);
      asserts.assertStringIncludes(
        JSON.stringify(rejErr.listCauses()),
        'too short',
      );
    });
  });

  // 3 — MEDIUM (wave-era): the sync-contract guard rejected legitimate
  // thenable-shaped VALUES (not just leaked pending Promises).
  describe('finding 3: sync guard passes thenable-shaped values', () => {
    it('parse() returns a plain object carrying a callable then', () => {
      const thenable = { then: () => 'not a promise' };
      asserts.assertStrictEquals(Guardian.unknown().parse(thenable), thenable);
    });

    it('parse() returns an async-function value', () => {
      const fn = async () => {};
      asserts.assertStrictEquals(Guardian.unknown().parse(fn), fn);
    });

    it('passthrough object carrying a then key parses', () => {
      const val = { id: 1, then: () => {} };
      const out = Guardian.object({ id: Guardian.number() })
        .passthrough()
        .parse(val);
      asserts.assertEquals((out as { id: number }).id, 1);
    });
  });

  // 4 — MEDIUM: intersection/instanceof/never/preprocess lost their
  // schema-emit overrides after any chain op (describe/optional/clone).
  describe('finding 4: schema-emit overrides survive chain ops', () => {
    const A = Guardian.object({ id: Guardian.string() });
    const B = Guardian.object({ name: Guardian.string() });

    it('intersection allOf survives describe() and layers the title', () => {
      const js = Guardian.intersection(A, B)
        .describe({ title: 'Person' })
        .toJSONSchema() as { allOf?: unknown[]; title?: string };
      asserts.assertExists(js.allOf);
      asserts.assertEquals(js.allOf?.length, 2);
      asserts.assertEquals(js.title, 'Person');
    });

    it('intersection allOf survives optional() and clone()', () => {
      asserts.assertExists(
        (Guardian.intersection(A, B).optional().toJSONSchema() as {
          allOf?: unknown[];
        }).allOf,
      );
      asserts.assertExists(
        (Guardian.intersection(A, B).clone().toOpenAPI() as {
          allOf?: unknown[];
        }).allOf,
      );
    });

    it('instanceof className / never not survive describe()', () => {
      asserts.assertEquals(
        (Guardian.instanceof(Date).describe({ title: 'When' }).toOpenAPI() as {
          className?: string;
        }).className,
        'Date',
      );
      asserts.assertExists(
        (Guardian.never().describe({ title: 'Nope' }).toJSONSchema() as {
          not?: unknown;
        }).not,
      );
    });
  });

  // 5 — MEDIUM: oneOf rejected null/undefined before trying any member.
  describe('finding 5: oneOf consults members for null/undefined', () => {
    it('a nullable member matches null', () => {
      const g = Guardian.oneOf(
        [Guardian.string().nullable()],
        'must be string-or-null',
      );
      asserts.assertEquals(g.parse(null), null);
    });

    it('surfaces the mandated message (not the generic one) for null', () => {
      const g = Guardian.oneOf(
        [Guardian.string(), Guardian.number()],
        'string or number required',
      );
      asserts.assertThrows(
        () => g.parse(null),
        GuardianError,
        'string or number required',
      );
    });
  });

  // 6 — MEDIUM: toUTC()/toTimezone() shifted the instant by the HOST's
  // local offset (machine-dependent timestamp corruption).
  describe('finding 6: date timezone transforms are host-independent', () => {
    it('toTimezone shifts by the target offset only', () => {
      const instant = new Date('2024-01-01T10:00:00Z');
      const out = Guardian.date().toTimezone(-300).parse(instant); // UTC-5
      asserts.assertEquals(
        out.getTime(),
        instant.getTime() - 300 * 60 * 1000,
      );
    });

    it('toUTC preserves the absolute instant', () => {
      const instant = new Date('2024-01-01T10:00:00Z');
      const out = Guardian.date().toUTC().parse(instant);
      asserts.assertEquals(out.getTime(), instant.getTime());
    });
  });

  // 7 — MEDIUM (wave-era): type-crossing transforms crashed on any
  // async chain ('Cannot coerce object to number/string').
  describe('finding 7: type-crossing transforms work on async chains', () => {
    it('Date -> number (toTimestamp) resolves after an async refine', async () => {
      const g = Guardian.date().refine(async () => true, 'ok').toTimestamp();
      const ts = await g.parseAsync(new Date('2023-06-15T00:00:00Z'));
      asserts.assertEquals(ts, new Date('2023-06-15T00:00:00Z').getTime());
    });

    it('number -> string (formatCurrency) resolves after an async refine', async () => {
      const g = Guardian.number().refine(async () => true, 'ok')
        .formatCurrency();
      const s = await g.parseAsync(1234.5);
      asserts.assertEquals(typeof s, 'string');
    });
  });

  // 8 — MEDIUM: power(base) used exact Number.isInteger on a log ratio,
  // rejecting genuine perfect powers of non-binary bases.
  describe('finding 8: power(base) accepts real perfect powers', () => {
    it('accepts perfect powers of 10, 5 and 3', () => {
      asserts.assertEquals(Guardian.number().power(10).parse(1000), 1000);
      asserts.assertEquals(Guardian.number().power(10).parse(100), 100);
      asserts.assertEquals(Guardian.number().power(5).parse(125), 125);
      asserts.assertEquals(Guardian.number().power(3).parse(81), 81);
    });

    it('still rejects non-powers', () => {
      asserts.assertThrows(
        () => Guardian.number().power(10).parse(1001),
        GuardianError,
      );
    });
  });

  // 9 — MEDIUM: mode setters silently dropped previously chained
  // refinements/transforms (silent validation weakening).
  describe('finding 9: mode setters refuse to drop chained steps', () => {
    it('strict() after a refinement throws instead of dropping it', () => {
      const schema = Guardian.object({ a: Guardian.string() })
        .refine((d) => d.a !== 'bad', 'a must not be bad');
      asserts.assertThrows(
        () => schema.strict(),
        GuardianError,
        'refinements or transforms',
      );
    });

    it('the idiomatic mode-first order still works', () => {
      const ok = Guardian.object({ a: Guardian.string() })
        .strict()
        .refine((d) => d.a !== 'bad', 'nope');
      asserts.assertThrows(() => ok.parse({ a: 'bad' }), GuardianError);
      asserts.assertEquals(ok.parse({ a: 'good' }), { a: 'good' });
    });

    it('describe() before a mode change is not treated as a chained step', () => {
      const described = Guardian.object({ a: Guardian.string() })
        .describe({ title: 'T' })
        .strict();
      asserts.assertEquals(described.parse({ a: 'x' }), { a: 'x' });
    });
  });

  // 10 — MEDIUM: pattern()/postalCode() with a /g or /y regex gave
  // alternating pass/fail on identical inputs (stateful lastIndex).
  describe('finding 10: stateful regex flags are neutralised', () => {
    it('a /g pattern is deterministic across repeated parses', () => {
      const g = Guardian.string().pattern(/^[a-z]+$/g);
      asserts.assertEquals(g.parse('abc'), 'abc');
      asserts.assertEquals(g.parse('abc'), 'abc');
      asserts.assertEquals(g.parse('abc'), 'abc');
      asserts.assertEquals(g.parse('abc'), 'abc');
    });

    it('a /y postalCode pattern is deterministic across repeated parses', () => {
      const g = Guardian.string().postalCode(/^\d{5}$/y);
      asserts.assertEquals(g.parse('12345'), '12345');
      asserts.assertEquals(g.parse('12345'), '12345');
      asserts.assertEquals(g.parse('12345'), '12345');
    });
  });
});
