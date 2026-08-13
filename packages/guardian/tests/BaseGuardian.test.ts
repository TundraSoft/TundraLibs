import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat';
import { NumberGuardian, StringGuardian } from '../mod.ts';
import { GuardianError } from '../errors/Base.ts';

describe('guardian.BaseGuardian', () => {
  describe('describe method', () => {
    it('should set metadata via describe()', () => {
      const guard = new StringGuardian().describe({
        title: 'Test Field',
        description: 'A test field',
        examples: ['example1', 'example2'],
      });

      asserts.assertEquals(guard.metaData?.title, 'Test Field');
      asserts.assertEquals(guard.metaData?.description, 'A test field');
      asserts.assertEquals(guard.metaData?.examples, ['example1', 'example2']);
    });

    it('should merge metadata with existing metadata', () => {
      const guard = new StringGuardian().describe({ title: 'Original Title' });

      // describe() is immutable — returns a fresh guardian with the
      // merged metadata; the source instance is unchanged.
      const described = guard.describe({
        description: 'Added description',
        examples: ['test'],
      });

      asserts.assertEquals(described.metaData?.title, 'Original Title');
      asserts.assertEquals(
        described.metaData?.description,
        'Added description',
      );
      asserts.assertEquals(described.metaData?.examples, ['test']);
    });

    it('should preserve protected flags', () => {
      const guard = new StringGuardian().optional().nullable();

      const described = guard.describe({
        title: 'Test',
        description: 'Test field',
      });

      asserts.assertEquals(described.metaData?.isOptional, true);
      asserts.assertEquals(described.metaData?.isNullable, true);
    });

    it('returns a new instance and leaves the source untouched', () => {
      const guard = new StringGuardian();
      const described = guard.describe({
        title: 'Modified',
      });

      asserts.assertNotStrictEquals(guard, described);
      asserts.assertEquals(guard.metaData?.title, undefined);
      asserts.assertEquals(described.metaData?.title, 'Modified');
    });

    it('should allow chaining', () => {
      const guard = new StringGuardian()
        .minLength(3)
        .describe({
          title: 'Username',
          description: 'User identifier',
        })
        .maxLength(20);

      asserts.assertEquals(guard.metaData?.title, 'Username');
      asserts.assertEquals(guard.metaData?.description, 'User identifier');
    });
  });

  describe('chain immutability', () => {
    it('chain methods return a fresh instance, never `this`', () => {
      const guard = new StringGuardian();
      const processed = guard.process((val) => val.toUpperCase());
      asserts.assertNotStrictEquals(guard, processed);
    });

    it('source guardian is unaffected by chain extensions', () => {
      // Regression: the old mutate-by-default behaviour meant
      // `Email = NonEmpty.email()` silently constrained `NonEmpty`
      // too. Verifying the source isn't poisoned by derived schemas.
      const base = new StringGuardian();
      const upper = base.process((s) => s.toUpperCase());

      asserts.assertEquals(base.parse('hello'), 'hello');
      asserts.assertEquals(upper.parse('hello'), 'HELLO');
    });
  });

  describe('process method', () => {
    it('should transform values', () => {
      const guard = new StringGuardian();
      const result = guard.process((val) => val.toUpperCase()).parse('hello');
      asserts.assertEquals(result, 'HELLO');
    });

    it('should handle async transformations', async () => {
      const guard = new StringGuardian();
      const asyncGuard = guard.process(async (val) => val.toUpperCase());
      const result = await asyncGuard.parseAsync('hello');
      asserts.assertEquals(result, 'HELLO');
    });

    it('should throw error when called after nullable()', () => {
      const guard = new StringGuardian().nullable();
      // Compile-time enforcement: `FinishedGuardian<T>` strips
      // `process` from its method set, so this line shouldn't type-
      // check. `@ts-expect-error` both documents the rule AND
      // fails the build if the type ever stops catching it.
      asserts.assertThrows(
        // @ts-expect-error process() is forbidden after nullable() (compile-time check)
        () => guard.process((val) => val ? val.toUpperCase() : ''),
        GuardianError,
        'Cannot call process() after nullable()',
      );
    });

    it('should throw error when called after optional()', () => {
      const guard = new StringGuardian().optional();
      asserts.assertThrows(
        // @ts-expect-error process() is forbidden after optional() (compile-time check)
        () => guard.process((val) => val ? val.toUpperCase() : ''),
        GuardianError,
        'Cannot call process() after optional()',
      );
    });

    it('should use provided constructor', () => {
      const stringGuard = new StringGuardian();
      const numberGuard = stringGuard.process(
        (val) => Number.parseInt(val, 10),
        NumberGuardian,
      );
      asserts.assertInstanceOf(numberGuard, NumberGuardian);
    });
  });

  describe('test method', () => {
    it('should validate using test function', () => {
      const guard = new StringGuardian().test(
        (val) => val.length >= 5,
        'String must be at least 5 characters',
      );

      asserts.assertEquals(guard.parse('hello'), 'hello');
      asserts.assertThrows(() => guard.parse('hi'), GuardianError);
    });

    it('should throw error when called after nullable()', () => {
      const guard = new StringGuardian().nullable();
      asserts.assertThrows(
        // @ts-expect-error test() is forbidden after nullable() (compile-time check)
        () => guard.test((val) => val ? val.length > 0 : false),
        GuardianError,
        'Cannot call test() after nullable()',
      );
    });

    it('should throw error when called after optional()', () => {
      const guard = new StringGuardian().optional();
      asserts.assertThrows(
        // @ts-expect-error test() is forbidden after optional() (compile-time check)
        () => guard.test((val) => val ? val.length > 0 : false),
        GuardianError,
        'Cannot call test() after optional()',
      );
    });

    it('test with an async predicate marks the chain async', async () => {
      const guard = new StringGuardian().test(
        async (s) => s.length <= 100,
        'too long',
      );
      // Sync parse must reject the async chain up front (mirroring
      // refine()) rather than silently returning a pending Promise
      // that never surfaces the failing predicate.
      asserts.assertThrows(
        () => guard.parse('x'),
        GuardianError,
        'Cannot use parse() with async validation steps',
      );
      // parseAsync passes a satisfied predicate through unchanged.
      asserts.assertEquals(await guard.parseAsync('short'), 'short');
      // parseAsync rejects a failing predicate with the custom message.
      const [err] = await guard.safeParseAsync('y'.repeat(101));
      asserts.assertInstanceOf(err, GuardianError);
      asserts.assertEquals(err.message, 'too long');
    });
  });

  describe('equals method', () => {
    it('should validate equality', () => {
      const guard = new StringGuardian().equals('expected');

      asserts.assertEquals(guard.parse('expected'), 'expected');
      asserts.assertThrows(() => guard.parse('different'), GuardianError);
    });

    it('should use custom error message', () => {
      const guard = new StringGuardian().equals('expected', 'Must be expected');

      try {
        guard.parse('different');
        asserts.fail('Should have thrown');
      } catch (error) {
        asserts.assertInstanceOf(error, GuardianError);
        asserts.assertEquals(error.message, 'Must be expected');
      }
    });
  });

  describe('notEquals method', () => {
    it('should validate inequality', () => {
      const guard = new StringGuardian().notEquals('forbidden');

      asserts.assertEquals(guard.parse('allowed'), 'allowed');
      asserts.assertThrows(() => guard.parse('forbidden'), GuardianError);
    });

    it('should use custom error message', () => {
      const guard = new StringGuardian().notEquals(
        'forbidden',
        'Cannot be forbidden',
      );

      try {
        guard.parse('forbidden');
        asserts.fail('Should have thrown');
      } catch (error) {
        asserts.assertInstanceOf(error, GuardianError);
        asserts.assertEquals(error.message, 'Cannot be forbidden');
      }
    });
  });

  describe('isIn method', () => {
    it('should validate value is in allowed list', () => {
      const guard = new StringGuardian().isIn(['a', 'b', 'c']);

      asserts.assertEquals(guard.parse('a'), 'a');
      asserts.assertEquals(guard.parse('b'), 'b');
      asserts.assertThrows(() => guard.parse('d'), GuardianError);
    });

    it('should use custom error message', () => {
      const guard = new StringGuardian().isIn(['a', 'b'], 'Must be a or b');

      try {
        guard.parse('c');
        asserts.fail('Should have thrown');
      } catch (error) {
        asserts.assertInstanceOf(error, GuardianError);
        asserts.assertEquals(error.message, 'Must be a or b');
      }
    });
  });

  describe('isNotIn method', () => {
    it('should validate value is not in forbidden list', () => {
      const guard = new StringGuardian().isNotIn(['x', 'y', 'z']);

      asserts.assertEquals(guard.parse('a'), 'a');
      asserts.assertThrows(() => guard.parse('x'), GuardianError);
    });

    it('should use custom error message', () => {
      const guard = new StringGuardian().isNotIn(
        ['x', 'y'],
        'Cannot be x or y',
      );

      try {
        guard.parse('x');
        asserts.fail('Should have thrown');
      } catch (error) {
        asserts.assertInstanceOf(error, GuardianError);
        asserts.assertEquals(error.message, 'Cannot be x or y');
      }
    });
  });

  describe('nullable method', () => {
    it('should handle null values', () => {
      const guard = new StringGuardian().nullable();

      asserts.assertEquals(guard.parse('hello'), 'hello');
      asserts.assertEquals(guard.parse(null), null);
      // For StringGuardian, undefined behavior depends on implementation
      // Let's just test that null works
    });

    it('nullable() is idempotent on a mutable guard', () => {
      // Repeat calls return the same instance — friendly to generic
      // helpers that don't know whether the schema is already nullable.
      const base = new StringGuardian().nullable();
      const again = base.nullable();
      asserts.assertStrictEquals(base, again);
      // Behaviour unchanged after the redundant call.
      asserts.assertEquals(again.parse('hello'), 'hello');
      asserts.assertEquals(again.parse(null), null);
    });

    it('returns a fresh instance distinct from the source', () => {
      const guard = new StringGuardian();
      const nullable = guard.nullable();
      asserts.assertNotStrictEquals(guard, nullable);
    });
  });

  describe('optional method', () => {
    it('should handle undefined values without default', () => {
      const guard = new StringGuardian().optional();

      asserts.assertEquals(guard.parse('hello'), 'hello');
      asserts.assertEquals(guard.parse(undefined), undefined);
    });

    it('should handle undefined values with default value', () => {
      const guard = new StringGuardian().optional('default');

      asserts.assertEquals(guard.parse('hello'), 'hello');
      asserts.assertEquals(guard.parse(undefined), 'default');
    });

    it('should handle undefined values with default function', () => {
      const guard = new StringGuardian().optional(() => 'computed');

      asserts.assertEquals(guard.parse('hello'), 'hello');
      asserts.assertEquals(guard.parse(undefined), 'computed');
    });

    it('should handle async default function', async () => {
      const guard = new StringGuardian().optional(async () => 'async-default');

      const result = await guard.parseAsync(undefined);
      asserts.assertEquals(result, 'async-default');
    });

    it('sync parse rejects a promise-returning default instead of returning it', async () => {
      // Regression: a default that returns a Promise (even a plain
      // arrow, not an `async function`) must NOT make sync
      // `parse(undefined)` hand back a pending Promise typed as `T`.
      const guard = new StringGuardian().optional(
        () => Promise.resolve('def') as unknown as string,
      );
      asserts.assertThrows(
        () => guard.parse(undefined),
        GuardianError,
        'Cannot use parse() with async validation steps',
      );
      // The default still fires and resolves on the async path.
      asserts.assertEquals(await guard.parseAsync(undefined), 'def');
      // A present value never hits the default, so the sync path is
      // unaffected.
      asserts.assertEquals(guard.parse('hi'), 'hi');
    });

    it('safeParse reports a promise-returning default as a usage error', () => {
      const guard = new StringGuardian().optional(
        () => Promise.resolve('def') as unknown as string,
      );
      const [err, data] = guard.safeParse(undefined);
      asserts.assertInstanceOf(err, GuardianError);
      asserts.assertEquals(data, undefined);
    });

    it('optional() is idempotent on a mutable guard', () => {
      const base = new StringGuardian().optional();
      const again = base.optional();
      asserts.assertStrictEquals(base, again);
      asserts.assertEquals(again.parse('hello'), 'hello');
      asserts.assertEquals(again.parse(undefined), undefined);
    });

    it('returns a fresh instance distinct from the source', () => {
      const guard = new StringGuardian();
      const optional = guard.optional();
      asserts.assertNotStrictEquals(guard, optional);
    });
  });

  describe('parse method', () => {
    it('should throw error for async guardian', () => {
      const guard = new StringGuardian();
      // Manually set async flag to test error handling
      guard['_metaData'] = { isAsync: true };

      asserts.assertThrows(
        () => guard.parse('test'),
        GuardianError,
        'Cannot use parse() with async validation steps. Use parseAsync() instead.',
      );
    });

    it('should wrap non-GuardianError exceptions', () => {
      const guard = new StringGuardian().process(() => {
        throw new Error('Custom error');
      });

      try {
        guard.parse('test');
        asserts.fail('Should have thrown');
      } catch (error) {
        asserts.assertInstanceOf(error, GuardianError);
        asserts.assertEquals(error.message, 'Validation failed');
      }
    });
  });

  describe('parseAsync method', () => {
    it('should handle sync transformations', async () => {
      const guard = new StringGuardian();
      const result = await guard.parseAsync('hello');
      asserts.assertEquals(result, 'hello');
    });

    it('should handle async transformations', async () => {
      const guard = new StringGuardian().process(async (val) =>
        val.toUpperCase()
      );
      const result = await guard.parseAsync('hello');
      asserts.assertEquals(result, 'HELLO');
    });

    it('should wrap non-GuardianError exceptions', async () => {
      const guard = new StringGuardian().process(async () => {
        throw new Error('Custom error');
      });

      try {
        await guard.parseAsync('test');
        asserts.fail('Should have thrown');
      } catch (error) {
        asserts.assertInstanceOf(error, GuardianError);
        asserts.assertEquals(error.message, 'Validation failed');
      }
    });
  });

  describe('safeParse method', () => {
    it('should return success result for valid input', () => {
      const guard = new StringGuardian();
      const [error, data] = guard.safeParse('hello');

      asserts.assertEquals(error, null);
      asserts.assertEquals(data, 'hello');
    });

    it('should return error result for invalid input', () => {
      const guard = new StringGuardian();
      // Coerce-by-default: 123 → '123' is no longer an error.
      const [coerceErr, coerceData] = guard.safeParse(123);
      asserts.assertEquals(coerceErr, null);
      asserts.assertEquals(coerceData, '123');

      // Non-coercible inputs still error.
      const [error, data] = guard.safeParse({});
      asserts.assertInstanceOf(error, GuardianError);
      asserts.assertEquals(data, undefined);
    });

    it('should handle non-GuardianError exceptions', () => {
      const guard = new StringGuardian().process(() => {
        throw new Error('Custom error');
      });

      const [error, data] = guard.safeParse('test');
      asserts.assertInstanceOf(error, GuardianError);
      // The actual error message is "Validation failed" based on the implementation
      asserts.assertEquals(error.message, 'Validation failed');
      asserts.assertEquals(data, undefined);
    });
  });

  describe('safeParseAsync method', () => {
    it('should return success result for valid input', async () => {
      const guard = new StringGuardian();
      const [error, data] = await guard.safeParseAsync('hello');

      asserts.assertEquals(error, null);
      asserts.assertEquals(data, 'hello');
    });

    it('should return error result for invalid input', async () => {
      const guard = new StringGuardian();
      // Coerce-by-default: 123 → '123' is no longer an error.
      const [coerceErr, coerceData] = await guard.safeParseAsync(123);
      asserts.assertEquals(coerceErr, null);
      asserts.assertEquals(coerceData, '123');

      // Non-coercible inputs still error.
      const [error, data] = await guard.safeParseAsync({});
      asserts.assertInstanceOf(error, GuardianError);
      asserts.assertEquals(data, undefined);
    });

    it('should handle non-GuardianError exceptions', async () => {
      const guard = new StringGuardian().process(async () => {
        throw new Error('Custom error');
      });

      const [error, data] = await guard.safeParseAsync('test');
      asserts.assertInstanceOf(error, GuardianError);
      // The actual error message is "Validation failed" based on the implementation
      asserts.assertEquals(error.message, 'Validation failed');
      asserts.assertEquals(data, undefined);
    });
  });

  describe('documentation methods', () => {
    it('toOpenAPI should generate schema', () => {
      const guard = new StringGuardian().describe({
        title: 'Test String',
        description: 'A test string field',
        examples: ['example1', 'example2'],
        deprecated: true,
      });

      const schema = guard.toOpenAPI();

      asserts.assertEquals(schema.type, 'string');
      asserts.assertEquals(schema.title, 'Test String');
      asserts.assertEquals(schema.description, 'A test string field');
      asserts.assertEquals(schema.examples, ['example1', 'example2']);
      asserts.assertEquals(schema.deprecated, true);
    });

    it('toOpenAPI should include nullable flag', () => {
      const guard = new StringGuardian().nullable();
      const schema = guard.toOpenAPI();

      asserts.assertEquals(schema.nullable, true);
    });

    it('toMarkdown should generate documentation', () => {
      const guard = new StringGuardian().describe({
        title: 'Test String',
        description: 'A test string field',
        examples: ['example1', 'example2'],
      });

      const markdown = guard.toMarkdown();

      asserts.assert(markdown.includes('### Test String'));
      asserts.assert(markdown.includes('A test string field'));
      asserts.assert(markdown.includes('**Type:** string'));
      asserts.assert(markdown.includes('**Examples:**'));
      asserts.assert(markdown.includes('`"example1"`'));
    });

    it(
      'toMarkdown should include nullable and optional flags',
      () => {
        const guard = new StringGuardian()
          .nullable()
          .optional()
          .describe({ title: 'Optional Field' });

        const markdown = guard.toMarkdown();

        asserts.assert(markdown.includes('nullable'));
        asserts.assert(markdown.includes('optional'));
      },
    );

    it('toMarkdown should include deprecation warning', () => {
      const guard = new StringGuardian().describe({ deprecated: true });

      const markdown = guard.toMarkdown();

      asserts.assert(markdown.includes('⚠️ **Deprecated**'));
    });
  });

  describe('chaining nullable and optional', () => {
    it('nullable().optional() should work correctly', () => {
      const guard = new StringGuardian().nullable().optional();

      asserts.assertEquals(guard.parse('hello'), 'hello');
      asserts.assertEquals(guard.parse(null), null);
      asserts.assertEquals(guard.parse(undefined), undefined);
    });

    it('optional().nullable() should work correctly', () => {
      const guard = new StringGuardian().optional().nullable();

      asserts.assertEquals(guard.parse('hello'), 'hello');
      asserts.assertEquals(guard.parse(undefined), undefined);
      asserts.assertEquals(guard.parse(null), null);
    });

    it('optional with default should work with nullable', () => {
      const guard = new StringGuardian().optional('default').nullable();

      asserts.assertEquals(guard.parse('hello'), 'hello');
      asserts.assertEquals(guard.parse(undefined), 'default');
      asserts.assertEquals(guard.parse(null), null);
    });
  });

  describe('refine on every guardian', () => {
    it('refine is forbidden after nullable() (compile-time + runtime)', () => {
      const guard = new StringGuardian().nullable();
      // `FinishedGuardian<T>` now strips `refine` from its method set,
      // so this line shouldn't type-check. `@ts-expect-error` both
      // documents the rule AND fails the build if the type ever stops
      // catching it. The runtime throws (via process()) as a backstop.
      asserts.assertThrows(
        // @ts-expect-error refine() is forbidden after nullable() (compile-time check)
        () => guard.refine((s) => (s ? s.length > 0 : false), 'nonempty'),
        GuardianError,
        'Cannot call process() after nullable()',
      );
    });

    it('refine is forbidden after optional() (compile-time + runtime)', () => {
      const guard = new StringGuardian().optional();
      asserts.assertThrows(
        // @ts-expect-error refine() is forbidden after optional() (compile-time check)
        () => guard.refine((s) => (s ? s.length > 0 : false), 'nonempty'),
        GuardianError,
        'Cannot call process() after optional()',
      );
    });

    it('sync refine on a primitive — passes when validator returns true', () => {
      const guard = new StringGuardian().refine(
        (s) => s.startsWith('https://'),
        'URL must be HTTPS',
      );
      asserts.assertEquals(
        guard.parse('https://example.com'),
        'https://example.com',
      );
    });

    it('sync refine on a primitive — throws with message when validator returns false', () => {
      const guard = new StringGuardian().refine(
        (s) => s.startsWith('https://'),
        'URL must be HTTPS',
      );
      const [err] = guard.safeParse('http://example.com');
      asserts.assertInstanceOf(err, GuardianError);
      asserts.assertEquals(err.message, 'URL must be HTTPS');
    });

    it('refine attaches the optional path to GuardianError.path', () => {
      const guard = new StringGuardian().refine(
        (s) => s.length > 0,
        'must not be empty',
        'username',
      );
      const [err] = guard.safeParse('');
      asserts.assertInstanceOf(err, GuardianError);
      asserts.assertEquals(err.path, ['username']);
    });

    it('refine accepts numeric path segments (array-index style)', () => {
      const guard = new StringGuardian().refine(
        (s) => s.length > 0,
        'empty',
        2,
      );
      const [err] = guard.safeParse('');
      asserts.assertInstanceOf(err, GuardianError);
      asserts.assertEquals(err.path, [2]);
    });

    it('refine with an async validator marks the chain async', async () => {
      const guard = new StringGuardian().refine(
        async (s) => s === 'allowed',
        'forbidden',
      );
      // Sync parse must reject the async chain at the type / runtime
      // level before the validator is invoked.
      asserts.assertThrows(() => guard.parse('allowed'), GuardianError);
      // parseAsync handles it correctly.
      asserts.assertEquals(await guard.parseAsync('allowed'), 'allowed');
      const [err] = await guard.safeParseAsync('blocked');
      asserts.assertInstanceOf(err, GuardianError);
      asserts.assertEquals(err.message, 'forbidden');
    });

    it('refine wraps a validator throw with `Refinement validation failed:` prefix', () => {
      const guard = new StringGuardian().refine(
        () => {
          throw new Error('boom');
        },
        'unused',
      );
      const [err] = guard.safeParse('x');
      asserts.assertInstanceOf(err, GuardianError);
      asserts.assertStringIncludes(err.message, 'Refinement validation failed');
      asserts.assertStringIncludes(err.message, 'boom');
    });

    it('refine on a NumberGuardian (immutability check)', () => {
      const base = new NumberGuardian();
      const positive = base.refine((n) => n > 0, 'must be positive');
      // Source remains permissive — refine is immutable.
      asserts.assertEquals(base.parse(-5), -5);
      // Refined rejects.
      asserts.assertThrows(() => positive.parse(-5), GuardianError);
    });
  });
});
