/**
 * Regression tests for the round-4 adversarial review findings.
 *
 * Round 4 reviewed the round-3 REMEDIATION, so every test here is
 * deliberately arranged to exercise the code path the round-3 fix
 * missed — most importantly `lazy()` with a genuinely FORWARD-declared
 * thunk target (the arrangement `lazy()` exists for), not the
 * already-defined arrangement the round-3 tests used.
 *
 * Each test is RED on the pre-fix source and GREEN after the fix.
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { type BaseGuardian, Guardian, GuardianError } from '../mod.ts';

describe('guardian.round-4 review regressions', () => {
  // 1 — HIGH: lazy()'s async propagation only worked when the thunk
  // target was ALREADY DEFINED. A forward / mutual / self reference —
  // the whole reason lazy() exists — left the container latched on
  // `__async = false`, so the async step was silently bypassed and a
  // pending Promise was stored in the field slot.
  describe('finding 1: lazy() propagates async-ness for FORWARD references', () => {
    it('object: forward-referenced lazy(async) child refuses sync parse', () => {
      // NOTE the declaration order: the container is built BEFORE the
      // thunk target exists. This is the arrangement the round-3 fix
      // did not repair.
      const Wrap = Guardian.object({ x: Guardian.lazy(() => Inner) });
      const Inner = Guardian.string().refine(
        async (v) => v.length > 100,
        'too short',
      );

      asserts.assertEquals(Wrap.metaData?.isAsync, true);
      asserts.assertThrows(
        () => Wrap.parse({ x: 'short' }),
        GuardianError,
        'parseAsync',
      );
      const [err, data] = Wrap.safeParse({ x: 'short' });
      asserts.assertExists(err);
      asserts.assertEquals(data, undefined);
    });

    it('object: forward-referenced lazy(async) child is ENFORCED by parseAsync', async () => {
      const Wrap = Guardian.object({ x: Guardian.lazy(() => Inner) });
      const Inner = Guardian.string().refine(
        async (v) => v.length > 3,
        'too short',
      );

      const ok = await Wrap.parseAsync({ x: 'long-enough' });
      asserts.assertEquals(ok, { x: 'long-enough' });
      // Pre-fix this RESOLVED with `{ x: <rejected Promise> }` and then
      // killed the process with an unhandled rejection.
      const [err, data] = await Wrap.safeParseAsync({ x: 'no' });
      asserts.assertExists(err);
      asserts.assertEquals(data, undefined);
      asserts.assertStringIncludes(
        JSON.stringify(err.listCauses()),
        'too short',
      );
    });

    it('array / record / tuple / set / map / union: forward refs all propagate', () => {
      const arr = Guardian.array(Guardian.lazy(() => Leaf));
      const rec = Guardian.record(
        Guardian.string(),
        Guardian.lazy(() => Leaf),
      );
      const tup = Guardian.tuple([Guardian.lazy(() => Leaf)]);
      const set = Guardian.set(Guardian.lazy(() => Leaf));
      const map = Guardian.map(
        Guardian.string(),
        Guardian.lazy(() => Leaf),
      );
      const Leaf = Guardian.string().refine(async () => true, 'unused');

      asserts.assertEquals(arr.metaData?.isAsync, true);
      asserts.assertEquals(rec.metaData?.isAsync, true);
      asserts.assertEquals(tup.metaData?.isAsync, true);
      asserts.assertEquals(set.metaData?.isAsync, true);
      asserts.assertEquals(map.metaData?.isAsync, true);

      asserts.assertThrows(() => arr.parse(['s']), GuardianError, 'parseAsync');
      asserts.assertThrows(
        () => rec.parse({ k: 's' }),
        GuardianError,
        'parseAsync',
      );
      asserts.assertThrows(() => tup.parse(['s']), GuardianError, 'parseAsync');
      asserts.assertThrows(() => set.parse(['s']), GuardianError, 'parseAsync');
      asserts.assertThrows(
        () => map.parse([['k', 's']]),
        GuardianError,
        'parseAsync',
      );
    });

    it('discriminated union: a forward-referenced lazy branch propagates', () => {
      const du = Guardian.discriminatedUnion('kind', [
        Guardian.object({
          kind: Guardian.literal('a'),
          v: Guardian.lazy(() => Leaf),
        }),
      ]);
      const Leaf = Guardian.string().refine(async () => true, 'unused');

      asserts.assertEquals(du.metaData?.isAsync, true);
      asserts.assertThrows(
        () => du.parse({ kind: 'a', v: 's' }),
        GuardianError,
        'parseAsync',
      );
    });

    it('nested container: the async verdict reaches a grandchild container', async () => {
      const Outer = Guardian.object({
        inner: Guardian.object({ x: Guardian.lazy(() => Leaf) }),
      });
      const Leaf = Guardian.string().refine((v) => v !== 'bad', 'bad leaf');
      const AsyncLeaf = Guardian.string().refine(
        async (v) => v !== 'bad',
        'bad leaf',
      );
      // keep the sync leaf referenced so both shapes stay meaningful
      asserts.assertEquals(Leaf.parse('ok'), 'ok');

      const OuterAsync = Guardian.object({
        inner: Guardian.object({ x: Guardian.lazy(() => AsyncLeaf) }),
      });
      asserts.assertEquals(OuterAsync.metaData?.isAsync, true);
      const [err] = await OuterAsync.safeParseAsync({ inner: { x: 'bad' } });
      asserts.assertExists(err);
      asserts.assertStringIncludes(
        JSON.stringify(err.listCauses()),
        'bad leaf',
      );
      asserts.assertEquals(
        await Outer.parseAsync({ inner: { x: 'ok' } }),
        { inner: { x: 'ok' } },
      );
    });

    it('mutual recursion: A -> lazy(B), B declared after and async', () => {
      const A = Guardian.object({
        tag: Guardian.string(),
        child: Guardian.lazy(() => B),
      });
      const B = Guardian.object({
        v: Guardian.string().refine(async () => true, 'unused'),
      });

      asserts.assertEquals(A.metaData?.isAsync, true);
      asserts.assertThrows(
        () => A.parse({ tag: 't', child: { v: 'x' } }),
        GuardianError,
        'parseAsync',
      );
    });

    it('self-recursive tree: a nested async refinement is enforced', async () => {
      type TreeNode = { name: string; children: TreeNode[] };
      const Node: BaseGuardian<TreeNode> = Guardian.object({
        name: Guardian.string(),
        children: Guardian.array(Guardian.lazy(() => Node)),
      }).refine(
        async (d) => (d as TreeNode).name !== 'bad',
        'bad node name',
      ) as unknown as BaseGuardian<TreeNode>;

      // The nested child violates the refinement; pre-fix the inner
      // ArrayGuardian had latched `__async = false`, so `children[0]`
      // resolved to a pending Promise and the rule was never enforced.
      const [err] = await Node.safeParseAsync({
        name: 'ok',
        children: [{ name: 'bad', children: [] }],
      });
      asserts.assertExists(err);
      const flat = JSON.stringify(err.listCauses()) + err.message;
      asserts.assertStringIncludes(flat, 'bad node name');

      const good = await Node.parseAsync({
        name: 'ok',
        children: [{ name: 'fine', children: [] }],
      });
      asserts.assertEquals(good, {
        name: 'ok',
        children: [{ name: 'fine', children: [] }],
      });
    });

    it('top-level lazy(async): parse() refuses WITHOUT abandoning a rejected promise', () => {
      let asyncStepRuns = 0;
      const Wrap = Guardian.lazy(() => Inner);
      const Inner = Guardian.string().refine(async (v) => {
        asyncStepRuns++;
        return v.length > 100;
      }, 'too short');

      asserts.assertThrows(() => Wrap.parse('no'), GuardianError, 'parseAsync');
      // Pre-fix the transform ran first, produced a rejecting Promise,
      // and the usage error was thrown while that Promise was
      // abandoned — an unhandled rejection that terminates the process.
      asserts.assertEquals(asyncStepRuns, 0);
    });

    it('a purely sync forward-referenced lazy schema still parses synchronously', () => {
      const Wrap = Guardian.object({ x: Guardian.lazy(() => Inner) });
      const Inner = Guardian.string().minLength(2);

      asserts.assertEquals(Wrap.metaData?.isAsync, undefined);
      asserts.assertEquals(Wrap.parse({ x: 'ok' }), { x: 'ok' });
      asserts.assertThrows(() => Wrap.parse({ x: 'a' }), GuardianError);
    });
  });

  // 2 — MEDIUM: parseAsync() silently replaced a thenable-shaped VALUE
  // with its resolution (JS promise adoption), and hung forever on a
  // non-settling thenable. It cannot RETURN such a value (a
  // `Promise<T>` always adopts), so it must refuse loudly instead.
  describe('finding 2: parseAsync refuses thenable-shaped values instead of unwrapping them', () => {
    it('does not silently substitute the resolution of a thenable value', async () => {
      const thenable = { id: 1, then: (r: (v: unknown) => void) => r(42) };
      const [err, data] = await Guardian.unknown().safeParseAsync(thenable);
      asserts.assertExists(err);
      asserts.assertEquals(data, undefined);
      asserts.assertStringIncludes(err.message, 'thenable');
      // parse() still returns it unchanged — the round-3 fix stands.
      asserts.assertStrictEquals(Guardian.unknown().parse(thenable), thenable);
    });

    it('a passthrough object carrying a then key is not replaced by its resolution', async () => {
      const val = { id: 1, then: (r: (v: unknown) => void) => r({ id: 999 }) };
      const schema = Guardian.object({ id: Guardian.number() }).passthrough();
      const [err, data] = await schema.safeParseAsync(val);
      asserts.assertExists(err);
      asserts.assertEquals(data, undefined);
      asserts.assertEquals((schema.parse(val) as { id: number }).id, 1);
    });

    it('a non-settling thenable rejects instead of hanging forever', async () => {
      const nonSettling = { then: () => 'x' };
      const raced = await Promise.race([
        Guardian.unknown().safeParseAsync(nonSettling).then(([e]) =>
          e ? 'refused' : 'resolved'
        ),
        new Promise<string>((r) => setTimeout(() => r('HUNG'), 500)),
      ]);
      asserts.assertEquals(raced, 'refused');
    });

    it('genuine async chains are unaffected', async () => {
      const g = Guardian.string().refine(
        async (v) => v.length > 1,
        'too short',
      );
      asserts.assertEquals(await g.parseAsync('ok'), 'ok');
      const [err] = await g.safeParseAsync('x');
      asserts.assertExists(err);
    });
  });

  // 3 — MEDIUM: toJSON() redaction did a blind substring replacement of
  // `context.got`, garbling messages and inflating stacks ~3x whenever
  // the failing value was short or a common substring.
  describe('finding 3: toJSON() redaction does not garble messages or stacks', () => {
    it('a 1-char value does not shred an unrelated message', () => {
      const [err] = Guardian.string().pattern(/^\d+$/).safeParse('a');
      asserts.assertExists(err);
      const json = err.toJSON();
      asserts.assertEquals(
        json.message,
        'String does not match pattern /^\\d+$/',
      );
      asserts.assertEquals(json.message.includes('[redacted'), false);
    });

    it('the serialized stack is not inflated and stays readable', () => {
      const [err] = Guardian.string().pattern(/^\d+$/).safeParse('a');
      asserts.assertExists(err);
      const raw = err.stack ?? '';
      const json = err.toJSON();
      const redacted = json.stack ?? '';
      asserts.assertEquals(redacted.includes('GuardianError'), true);
      // Pre-fix this ratio was 2.4-3.4x.
      asserts.assertEquals(redacted.length <= raw.length * 1.1, true);
    });

    it('a developer-authored allow-list survives redaction', () => {
      const [err] = Guardian.string().isIn(['foo', 'bar']).safeParse('r');
      asserts.assertExists(err);
      const json = err.toJSON();
      asserts.assertStringIncludes(json.message, '(foo, bar)');
      // The trailing `got r` occurrence IS a whole token and is redacted.
      asserts.assertStringIncludes(json.message, '[redacted string, length 1]');
    });

    it('a coercion message keeps its surrounding English', () => {
      const [err] = Guardian.number().safeParse('t');
      asserts.assertExists(err);
      const json = err.toJSON();
      asserts.assertStringIncludes(json.message, 'Cannot coerce');
      asserts.assertStringIncludes(json.message, 'to number');
      asserts.assertEquals(json.message.includes('Canno['), false);
    });

    it('still strips a real secret from message, stack and causes', () => {
      const [err] = Guardian.string()
        .equals('SECRET-TOKEN-XYZ')
        .safeParse('hunter2-raw-password');
      asserts.assertExists(err);
      asserts.assertEquals(
        JSON.stringify(err.toJSON()).includes('hunter2-raw-password'),
        false,
      );

      const schema = Guardian.object({
        token: Guardian.string().equals('SUPER-SECRET'),
      });
      const [nested] = schema.safeParse({ token: 'attacker-guess-value' });
      asserts.assertExists(nested);
      asserts.assertEquals(
        JSON.stringify(nested.toJSON()).includes('attacker-guess-value'),
        false,
      );
    });
  });

  // 4 — MEDIUM: the async type-crossing fix landed on only 2 of the 4
  // coercing target constructors; string()/number() -> Date/bigint
  // still threw "Cannot coerce object to …" on any async chain.
  describe('finding 4: every coercing target constructor awaits an async chain', () => {
    it('string -> Date after an async refine', async () => {
      const g = Guardian.string().refine(async () => true, 'ok').toDate();
      const out = await g.parseAsync('2024-01-01');
      asserts.assertEquals(
        out.getTime(),
        new Date('2024-01-01').getTime(),
      );
    });

    it('string -> bigint after an async refine', async () => {
      const g = Guardian.string().refine(async () => true, 'ok').toBigInt();
      asserts.assertEquals(await g.parseAsync('12345'), 12345n);
    });

    it('number -> Date after an async refine', async () => {
      const g = Guardian.number().refine(async () => true, 'ok').toDate();
      const out = await g.parseAsync(1700000000000);
      asserts.assertEquals(out.getTime(), 1700000000000);
    });

    it('number -> bigint after an async refine', async () => {
      const g = Guardian.number().refine(async () => true, 'ok').toBigInt();
      asserts.assertEquals(await g.parseAsync(5), 5n);
    });

    it('the already-fixed legs and the sync legs still work', async () => {
      asserts.assertEquals(
        await Guardian.date().refine(async () => true, 'ok').toTimestamp()
          .parseAsync(new Date('2023-06-15T00:00:00Z')),
        new Date('2023-06-15T00:00:00Z').getTime(),
      );
      asserts.assertEquals(
        typeof await Guardian.number().refine(async () => true, 'ok')
          .formatCurrency().parseAsync(1234.5),
        'string',
      );
      asserts.assertEquals(
        Guardian.string().toDate().parse('2024-01-01').getTime(),
        new Date('2024-01-01').getTime(),
      );
      asserts.assertEquals(Guardian.number().toBigInt().parse(5), 5n);
    });

    it('a rejecting async step still surfaces through the coercing target', async () => {
      const g = Guardian.string().refine(async () => false, 'nope').toDate();
      const [err] = await g.safeParseAsync('2024-01-01');
      asserts.assertExists(err);
      asserts.assertStringIncludes(err.message, 'nope');
    });
  });

  // 5 — MEDIUM: only the four mode setters refused to drop chained
  // steps; every schema-manipulation sibling rebuilt from the schema
  // and dropped them silently.
  describe('finding 5: schema-manipulation methods refuse to drop chained steps', () => {
    const refined = () =>
      Guardian.object({ a: Guardian.string(), b: Guardian.string() })
        .refine((d) => d.a !== 'bad', 'a must not be bad');

    it('extend/pick/omit/partial/required/property/merge/deepPartial/renameField all throw', () => {
      const other = Guardian.object({ c: Guardian.string() });
      const cases: Array<[string, () => unknown]> = [
        ['extend', () => refined().extend({ c: Guardian.string() })],
        ['pick', () => refined().pick('a')],
        ['omit', () => refined().omit('b')],
        ['partial', () => refined().partial()],
        ['required', () => refined().required()],
        ['property', () => refined().property('c', Guardian.string())],
        ['merge', () => refined().merge(other)],
        ['deepPartial', () => refined().deepPartial()],
        ['renameField', () => refined().renameField('a', 'z')],
        [
          'exclude',
          () => refined().exclude(Guardian.object({ b: Guardian.string() })),
        ],
      ];
      for (const [name, run] of cases) {
        asserts.assertThrows(
          run,
          GuardianError,
          'refinements or transforms',
          `${name}() should refuse to drop the chained refinement`,
        );
      }
    });

    it('the documented PATCH idiom no longer ships a weakened validator', () => {
      const User = Guardian.object({
        password: Guardian.string(),
        confirmPassword: Guardian.string(),
      }).refine(
        (d) => d.password === d.confirmPassword,
        'passwords must match',
      );
      asserts.assertThrows(() => User.partial(), GuardianError);

      // Derive FIRST, then refine — the idiomatic order still works.
      const Patch = Guardian.object({
        password: Guardian.string(),
        confirmPassword: Guardian.string(),
      }).partial().refine(
        (d) => d.password === d.confirmPassword,
        'passwords must match',
      );
      asserts.assertThrows(
        () => Patch.parse({ password: 'p1', confirmPassword: 'p2' }),
        GuardianError,
        'passwords must match',
      );
    });

    it('derivation without a chained step is unaffected', () => {
      const base = Guardian.object({
        a: Guardian.string(),
        b: Guardian.string(),
      });
      asserts.assertEquals(base.pick('a').parse({ a: 'x' }), { a: 'x' });
      asserts.assertEquals(
        base.extend({ c: Guardian.string() }).parse({ a: 'x', b: 'y', c: 'z' }),
        { a: 'x', b: 'y', c: 'z' },
      );
      asserts.assertEquals(base.partial().parse({}), {});
      // describe() is not a chained step.
      asserts.assertEquals(
        base.describe({ title: 'T' }).pick('a').parse({ a: 'x' }),
        { a: 'x' },
      );
    });

    it('tuple rest()/labels() refuse to drop chained steps too', () => {
      const t = Guardian.tuple([Guardian.string()]).refine(
        (v) => v[0] !== 'bad',
        'no bad',
      );
      asserts.assertThrows(
        () => t.rest(Guardian.string()),
        GuardianError,
        'refinements or transforms',
      );
      asserts.assertThrows(
        () => t.labels(['first']),
        GuardianError,
        'refinements or transforms',
      );
      // ... and the mode-first order still works.
      const ok = Guardian.tuple([Guardian.string()])
        .labels(['first'])
        .refine((v) => v[0] !== 'bad', 'no bad');
      asserts.assertThrows(() => ok.parse(['bad']), GuardianError, 'no bad');
    });
  });
});
