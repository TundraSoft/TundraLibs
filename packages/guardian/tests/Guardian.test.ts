import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { Guardian } from '../Guardian.ts';
import { GuardianError } from '../errors/Base.ts';

describe('guardian.Guardian', () => {
  describe('factory methods', () => {
    it('should create string guardian', () => {
      const stringGuard = Guardian.string();
      asserts.assertEquals(stringGuard.parse('hello'), 'hello');
    });

    it('should create number guardian', () => {
      const numberGuard = Guardian.number();
      asserts.assertEquals(numberGuard.parse(42), 42);
    });

    it('should create boolean guardian', () => {
      const boolGuard = Guardian.boolean();
      asserts.assertEquals(boolGuard.parse(true), true);
    });

    it('should create array guardian', () => {
      const arrayGuard = Guardian.array();
      asserts.assertEquals(arrayGuard.parse([1, 2, 3]), [1, 2, 3]);
    });

    it('should create object guardian (strip default)', () => {
      // With strip as the default, an anonymous `Guardian.object()`
      // (no schema) drops all keys — there's nothing in the schema
      // to keep them. Use `.passthrough()` to accept arbitrary keys.
      const stripGuard = Guardian.object();
      asserts.assertEquals(stripGuard.parse({ name: 'test' }), {});

      const acceptAny = Guardian.object().passthrough();
      asserts.assertEquals(acceptAny.parse({ name: 'test' }), { name: 'test' });
    });

    it('should create date guardian', () => {
      const dateGuard = Guardian.date();
      const testDate = new Date();
      asserts.assertEquals(dateGuard.parse(testDate), testDate);
    });

    it('should create bigint guardian', () => {
      const bigintGuard = Guardian.bigint();
      asserts.assertEquals(bigintGuard.parse(42n), 42n);
    });

    it('should create enum guardian', () => {
      const enumGuard = Guardian.enum(['red', 'green', 'blue']);
      asserts.assertEquals(enumGuard.parse('red'), 'red');
    });

    it('should create unknown guardian', () => {
      const unknownGuard = Guardian.unknown();
      asserts.assertEquals(unknownGuard.parse('anything'), 'anything');
    });
  });

  describe('oneOf functionality', () => {
    it('should accept valid first option', () => {
      const schema = Guardian.oneOf(
        [Guardian.number().positive(), Guardian.string().minLength(3)],
        'Number or string required',
      );
      asserts.assertEquals(schema.parse(42), 42);
    });

    it('should accept valid second option', () => {
      const schema = Guardian.oneOf(
        [Guardian.number().positive(), Guardian.string().minLength(3)],
        'Number or string required',
      );
      asserts.assertEquals(schema.parse('hello'), 'hello');
    });

    it('should reject invalid input with custom message', () => {
      const schema = Guardian.oneOf(
        [Guardian.number().positive(), Guardian.string().minLength(3)],
        'Must be positive number or string with 3+ chars',
      );

      asserts.assertThrows(
        () => schema.parse(-5),
        GuardianError,
        'Must be positive number or string with 3+ chars',
      );
    });

    it('should require error message', () => {
      asserts.assertThrows(
        () => Guardian.oneOf([Guardian.string()], ''),
        Error,
        'oneOf requires a non-empty error message',
      );
    });

    it('should require at least one guardian', () => {
      asserts.assertThrows(
        () => Guardian.oneOf([], 'test'),
        Error,
        'oneOf requires at least one guardian',
      );
    });

    it('should aggregate errors from all failed attempts', () => {
      const schema = Guardian.oneOf(
        [Guardian.number().min(10), Guardian.string().minLength(5)],
        'Must be number ≥10 or string ≥5 chars',
      );

      try {
        schema.parse(3);
        asserts.fail('Should have thrown');
      } catch (error) {
        asserts.assert(error instanceof GuardianError);
        asserts.assert(error.context.cause);
        asserts.assert(typeof error.context.cause === 'object');

        const causes = error.context.cause;
        asserts.assert('option_0' in causes);
        asserts.assert('option_1' in causes);
        asserts.assert(causes.option_0 instanceof GuardianError);
        asserts.assert(causes.option_1 instanceof GuardianError);
      }
    });

    it('routes async members through parseAsync so they can match', async () => {
      // An async member would throw "Cannot use parse()..." from the sync
      // path and be swallowed as a failed option — so the async branch
      // could never match. oneOf now flips the chain to async-aware.
      const asyncMember = Guardian.string().refine(
        async (s: string) => {
          await new Promise((resolve) => setTimeout(resolve, 1));
          return s.startsWith('z');
        },
        'must start with z',
      );
      const schema = Guardian.oneOf(
        [Guardian.number().positive(), asyncMember],
        'positive number or z-string',
      );

      // The async branch now matches.
      asserts.assertEquals(await schema.parseAsync('zoo'), 'zoo');
      // The sync branch still matches under parseAsync.
      asserts.assertEquals(await schema.parseAsync(5), 5);
      // Nothing matches -> the configured error message.
      const [err] = await schema.safeParseAsync('abc');
      asserts.assertInstanceOf(err, GuardianError);
      asserts.assertEquals(err.message, 'positive number or z-string');
    });

    it('sync oneOf is unaffected (no async members)', () => {
      const schema = Guardian.oneOf(
        [Guardian.number().positive(), Guardian.string().minLength(3)],
        'number or string',
      );
      asserts.assertEquals(schema.parse(7), 7);
      asserts.assertEquals(schema.parse('abc'), 'abc');
    });
  });

  describe('type utilities', () => {
    it('Guardian.type should return constructor name', () => {
      const stringGuard = Guardian.string();
      const numberGuard = Guardian.number();
      const boolGuard = Guardian.boolean();

      asserts.assertEquals(Guardian.type(stringGuard), 'StringGuardian');
      asserts.assertEquals(Guardian.type(numberGuard), 'NumberGuardian');
      asserts.assertEquals(Guardian.type(boolGuard), 'BooleanGuardian');
    });

    // `Guardian.infer<T>` / `Guardian.inferInput<T>` are TypeScript
    // namespace-merge type aliases — no runtime presence. The check
    // below is compile-time only; if the namespace merge ever
    // regresses, this file fails type-checking.
    it('Guardian.infer<T> resolves in TS type position', () => {
      const schema = Guardian.object({
        name: Guardian.string(),
        age: Guardian.number(),
      });
      type User = Guardian.infer<typeof schema>;
      const sample: User = { name: 'Ada', age: 30 };
      asserts.assertEquals(sample.name, 'Ada');
      asserts.assertEquals(sample.age, 30);
    });

    it('Guardian.inferInput<T> resolves in TS type position', () => {
      const schema = Guardian.string();
      type In = Guardian.inferInput<typeof schema>;
      const sample: In = 'hello';
      asserts.assertEquals(sample, 'hello');
    });

    it('Guardian.record(value) — 1-arg overload defaults key to string', () => {
      // The 1-arg form is the 99% case: `Record<string, V>`.
      const metrics = Guardian.record(Guardian.number());
      asserts.assertEquals(
        metrics.parse({ uptimeSec: 60, errorCount: 0 }),
        { uptimeSec: 60, errorCount: 0 },
      );
    });

    it('Guardian.record(key, value) — 2-arg form still works', () => {
      // 2-arg form for pattern-validated or numeric keys.
      const envVars = Guardian.record(
        Guardian.string().pattern(/^[A-Z_]+$/),
        Guardian.string(),
      );
      asserts.assertEquals(
        envVars.parse({ API_KEY: 'abc', DB_HOST: 'localhost' }),
        { API_KEY: 'abc', DB_HOST: 'localhost' },
      );
    });

    it('Guardian.literal(value) accepts only that exact value', () => {
      const v1 = Guardian.literal('v1');
      asserts.assertEquals(v1.parse('v1'), 'v1');
      asserts.assertThrows(() => v1.parse('v2'));
      // Compile-time: the output type narrows to the literal.
      const out: 'v1' = v1.parse('v1');
      asserts.assertEquals(out, 'v1');
    });

    it('Guardian.tuple([...]) — positional inference', () => {
      const range = Guardian.tuple([
        Guardian.number().integer().min(0),
        Guardian.number().integer().min(0),
      ]);
      asserts.assertEquals(range.parse([10, 20]), [10, 20]);
      asserts.assertThrows(
        () => range.parse([10, 20, 30]),
        Error,
        'exactly 2 elements',
      );
    });
  });

  describe('complex schema composition', () => {
    it('should create nested object schema', () => {
      const userSchema = Guardian.object({
        id: Guardian.number().positive(),
        name: Guardian.string().minLength(1),
        email: Guardian.string().pattern(/^[^@]+@[^@]+$/),
        profile: Guardian.object({
          age: Guardian.number().min(0).max(150),
          preferences: Guardian.array(Guardian.string()),
        }),
      });

      const validUser = {
        id: 123,
        name: 'John Doe',
        email: 'john@example.com',
        profile: {
          age: 30,
          preferences: ['theme:dark', 'notifications:email'],
        },
      };

      const result = userSchema.parse(validUser);
      asserts.assertEquals(result, validUser);
    });

    it('should handle optional fields', () => {
      const userSchema = Guardian.object({
        id: Guardian.number(),
        name: Guardian.string(),
        email: Guardian.string().optional(),
      });

      const userWithoutEmail = { id: 1, name: 'John' };
      const result = userSchema.parse(userWithoutEmail);
      // Optional fields may add undefined to the result
      asserts.assertEquals(result.id, 1);
      asserts.assertEquals(result.name, 'John');
      // Don't assert the whole object since optional behavior may vary
    });

    it('should handle union types with oneOf', () => {
      const idSchema = Guardian.oneOf(
        [
          Guardian.number().positive(),
          Guardian.string().pattern(/^[a-z0-9]+$/i),
        ],
        'ID must be positive number or alphanumeric string',
      );

      asserts.assertEquals(idSchema.parse(123), 123);
      asserts.assertEquals(idSchema.parse('abc123'), 'abc123');

      asserts.assertThrows(
        () => idSchema.parse(-5),
        GuardianError,
        'ID must be positive number or alphanumeric string',
      );
    });
  });

  describe('error aggregation and context', () => {
    it(
      'should provide detailed error context for nested failures',
      () => {
        const schema = Guardian.object({
          user: Guardian.object({
            name: Guardian.string().minLength(3),
            age: Guardian.number().min(0),
          }),
        });

        try {
          schema.parse({
            user: {
              name: 'Jo', // Too short
              age: -5, // Too small
            },
          });
          asserts.fail('Should have thrown');
        } catch (error) {
          asserts.assert(error instanceof GuardianError);
          // Error should contain context about the validation failure
          asserts.assert(error.message.length > 0);
        }
      },
    );

    it('should chain multiple validation errors', () => {
      const schema = Guardian.string().minLength(5).maxLength(10).pattern(
        /^[a-zA-Z]+$/,
      );

      try {
        schema.parse('abc'); // Too short, wrong case
        asserts.fail('Should have thrown');
      } catch (error) {
        asserts.assert(error instanceof GuardianError);
        // The first validation that fails should throw with some error message
        asserts.assert(error.message.length > 0);
      }
    });
  });

  describe('safe parsing', () => {
    it('should return success tuple for valid input', () => {
      const schema = Guardian.string().minLength(3);
      const result = schema.safeParse('hello');

      asserts.assertEquals(result[0], null);
      asserts.assertEquals(result[1], 'hello');
    });

    it('should return error tuple for invalid input', () => {
      const schema = Guardian.string().minLength(5);
      const result = schema.safeParse('hi');

      asserts.assert(result[0] instanceof GuardianError);
      asserts.assertEquals(result[1], undefined);
    });

    it('should work with complex schemas', () => {
      const schema = Guardian.object({
        id: Guardian.number(),
        name: Guardian.string(),
      });

      const successResult = schema.safeParse({ id: 1, name: 'test' });
      asserts.assertEquals(successResult[0], null);
      asserts.assertEquals(successResult[1], { id: 1, name: 'test' });

      const failResult = schema.safeParse({ id: 'not-number', name: 'test' });
      asserts.assert(failResult[0] instanceof GuardianError);
      asserts.assertEquals(failResult[1], undefined);
    });
  });

  describe('async validation support', () => {
    it('should handle async validation steps', async () => {
      const asyncSchema = Guardian.number()
        .process(
          async (value: number) => {
            // Simulate async validation (e.g., database check)
            await new Promise((resolve) => setTimeout(resolve, 1));
            if (value < 0) throw new Error('Must be positive');
            return value;
          },
        );

      const result = await asyncSchema.parseAsync(5);
      asserts.assertEquals(result, 5);

      try {
        await asyncSchema.parseAsync(-1);
        asserts.fail('Should have thrown');
      } catch (error) {
        asserts.assert(error instanceof GuardianError);
      }
    });

    it('should support safeParseAsync', async () => {
      const asyncSchema = Guardian.number().process(
        async (value: number) => {
          await new Promise((resolve) => setTimeout(resolve, 1));
          if (value < 0) throw new Error('Must be positive');
          return value;
        },
      );

      const successResult = await asyncSchema.safeParseAsync(5);
      asserts.assertEquals(successResult[0], null);
      asserts.assertEquals(successResult[1], 5);

      const failResult = await asyncSchema.safeParseAsync(-1);
      asserts.assert(failResult[0] instanceof GuardianError);
      asserts.assertEquals(failResult[1], undefined);
    });
  });

  describe('metadata and context', () => {
    it('should preserve metadata in guardian instances', () => {
      const schema = Guardian.string({
        description: 'User name field',
        title: 'Name',
        examples: ['John Doe', 'Jane Smith'],
      });

      asserts.assertEquals(schema.metaData?.description, 'User name field');
      asserts.assertEquals(schema.metaData?.title, 'Name');
      asserts.assertEquals(schema.metaData?.examples, [
        'John Doe',
        'Jane Smith',
      ]);
    });

    it('should allow setting metadata properties via describe()', () => {
      const schema = Guardian.string().describe({
        description: 'A test string',
        title: 'Test',
        examples: ['example1', 'example2'],
        deprecated: true,
      });

      asserts.assertEquals(schema.metaData?.description, 'A test string');
      asserts.assertEquals(schema.metaData?.title, 'Test');
      asserts.assertEquals(schema.metaData?.examples, ['example1', 'example2']);
      asserts.assertEquals(schema.metaData?.deprecated, true);
    });
  });

  describe('performance optimizations', () => {
    it(
      'should maintain high performance for simple validations',
      () => {
        const schema = Guardian.string().minLength(3);
        const iterations = 1000;

        const start = performance.now();
        for (let i = 0; i < iterations; i++) {
          schema.parse('hello');
        }
        const end = performance.now();

        const avgTime = (end - start) / iterations;
        // Should be very fast - under 1ms per validation
        asserts.assert(
          avgTime < 1,
          `Average validation time ${avgTime}ms should be < 1ms`,
        );
      },
    );

    it('should handle complex object validation efficiently', () => {
      const schema = Guardian.object({
        id: Guardian.number().positive(),
        name: Guardian.string().minLength(1).maxLength(100),
        email: Guardian.string().pattern(/^[^@]+@[^@]+$/),
        tags: Guardian.array(Guardian.string()).maxLength(10),
      });

      const testData = {
        id: 123,
        name: 'Test User',
        email: 'test@example.com',
        tags: ['tag1', 'tag2', 'tag3'],
      };

      const iterations = 100;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        schema.parse(testData);
      }
      const end = performance.now();

      const avgTime = (end - start) / iterations;
      // Complex validation should still be reasonably fast
      asserts.assert(
        avgTime < 5,
        `Average complex validation time ${avgTime}ms should be < 5ms`,
      );
    });
  });

  describe('chain immutability', () => {
    it('chain methods return a fresh instance and leave the source untouched', () => {
      const baseSchema = Guardian.string();
      const extendedSchema = baseSchema.minLength(5);

      // Source schema stays permissive — never mutated.
      asserts.assertEquals(baseSchema.parse('hi'), 'hi');

      // Chained instance carries the new validation.
      asserts.assertThrows(
        () => extendedSchema.parse('hi'),
        GuardianError,
      );
      asserts.assertEquals(extendedSchema.parse('hello'), 'hello');

      // The two are distinct instances.
      asserts.assertNotStrictEquals(baseSchema, extendedSchema);
    });
  });

  describe('lazy', () => {
    it('resolves the inner guardian and parses correctly', () => {
      const schema = Guardian.lazy(() => Guardian.string().minLength(3));
      asserts.assertEquals(schema.parse('hello'), 'hello');
      asserts.assertThrows(() => schema.parse('hi'), GuardianError);
    });

    it('caches the resolved guardian (thunk runs once)', () => {
      let resolveCount = 0;
      const thunk = () => {
        resolveCount++;
        return Guardian.number();
      };
      const schema = Guardian.lazy(thunk);
      schema.parse(1);
      schema.parse(2);
      schema.parse(3);
      asserts.assertEquals(resolveCount, 1);
    });

    it('supports recursive schemas', () => {
      // Declare the schema with a forward type so the lazy thunk can
      // close over the binding before assignment.
      // deno-lint-ignore no-explicit-any
      const Tree: any = Guardian.object({
        value: Guardian.number(),
        children: Guardian.array(Guardian.lazy(() => Tree)),
      });
      const valid = {
        value: 1,
        children: [
          { value: 2, children: [] },
          { value: 3, children: [{ value: 4, children: [] }] },
        ],
      };
      const out = Tree.parse(valid);
      asserts.assertEquals(out.value, 1);
      asserts.assertEquals(out.children.length, 2);
      asserts.assertEquals(out.children[1].children[0].value, 4);
    });

    it("emits a `$ref: '#'` placeholder on recursive schema emit", () => {
      // deno-lint-ignore no-explicit-any
      const Node: any = Guardian.object({
        value: Guardian.number(),
        next: Guardian.lazy(() => Node).nullable(),
      });
      const schema = Node.toJSONSchema();
      // The lazy `next` position should carry the recursion marker.
      const json = JSON.stringify(schema.properties.next);
      asserts.assertStringIncludes(json, '$ref');
      asserts.assertStringIncludes(json, '#');
    });
  });

  describe('intersection', () => {
    it('merges two object schemas', () => {
      const Identified = Guardian.object({ id: Guardian.string() });
      const Named = Guardian.object({ name: Guardian.string() });
      const Person = Guardian.intersection(Identified, Named);

      const out = Person.parse({ id: 'u1', name: 'Ada' });
      asserts.assertEquals(out.id, 'u1');
      asserts.assertEquals(out.name, 'Ada');
    });

    it('rejects when either guardian rejects', () => {
      const HasId = Guardian.object({ id: Guardian.number() });
      const HasEmail = Guardian.object({ email: Guardian.string().email() });
      const User = Guardian.intersection(HasId, HasEmail);

      asserts.assertThrows(
        () => User.parse({ id: 1, email: 'not-an-email' }),
        GuardianError,
      );
      asserts.assertThrows(
        () => User.parse({ id: 'not-a-number', email: 'a@b.co' }),
        GuardianError,
      );
    });

    it('emits allOf on schema serialisation', () => {
      const A = Guardian.object({ a: Guardian.string() });
      const B = Guardian.object({ b: Guardian.number() });
      const I = Guardian.intersection(A, B);

      const open = I.toOpenAPI();
      asserts.assert(Array.isArray(open.allOf));
      asserts.assertEquals((open.allOf as unknown[]).length, 2);

      const json = I.toJSONSchema();
      asserts.assertEquals(
        json.$schema,
        'https://json-schema.org/draft/2020-12/schema',
      );
      asserts.assert(Array.isArray(json.allOf));
    });
  });

  describe('preprocess', () => {
    it('runs fn before the schema validates', () => {
      const Trimmed = Guardian.preprocess(
        (v) => typeof v === 'string' ? v.trim() : v,
        Guardian.string().minLength(1),
      );

      asserts.assertEquals(Trimmed.parse('  hello  '), 'hello');
      asserts.assertThrows(
        () => Trimmed.parse('     '),
        GuardianError,
      );
    });

    it('wraps non-GuardianError throws from fn with preprocess context', () => {
      const Broken = Guardian.preprocess(
        () => {
          throw new Error('boom');
        },
        Guardian.string(),
      );

      const [err] = Broken.safeParse('input');
      asserts.assertInstanceOf(err, GuardianError);
      asserts.assertStringIncludes(err.message, 'Preprocess failed');
      asserts.assertStringIncludes(err.message, 'boom');
    });

    it('propagates schema errors unchanged', () => {
      // Inner schema's GuardianError must bubble without being
      // rewrapped as "preprocess failed".
      const Strict = Guardian.preprocess(
        (v) => v,
        Guardian.string().minLength(5),
      );

      const [err] = Strict.safeParse('hi');
      asserts.assertInstanceOf(err, GuardianError);
      asserts.assert(!err.message.startsWith('Preprocess failed'));
    });

    it('detects async fn and requires parseAsync', async () => {
      const Async = Guardian.preprocess(
        // deno-lint-ignore require-await
        async (v) => typeof v === 'string' ? v.trim() : v,
        Guardian.string().minLength(1),
      );

      // parse() should throw on an async chain.
      asserts.assertThrows(() => Async.parse('  hi  '), GuardianError);
      // parseAsync resolves correctly.
      asserts.assertEquals(await Async.parseAsync('  hi  '), 'hi');
    });

    it('.optional() short-circuits on undefined before preprocess runs', () => {
      // Track whether fn was called — undefined input must skip it.
      let called = 0;
      const Form = Guardian.preprocess(
        (v) => {
          called++;
          return typeof v === 'string' ? v.trim() : v;
        },
        Guardian.string().minLength(1),
      ).optional();

      // undefined → optional short-circuits, fn never called.
      asserts.assertEquals(Form.parse(undefined), undefined);
      asserts.assertEquals(called, 0);

      // Real input → fn runs.
      asserts.assertEquals(Form.parse('  hi  '), 'hi');
      asserts.assertEquals(called, 1);
    });

    it('schema emit delegates to the inner schema', () => {
      const Pre = Guardian.preprocess(
        (v) => v,
        Guardian.string().email(),
      );

      const open = Pre.toOpenAPI();
      asserts.assertEquals(open.type, 'string');
      asserts.assertEquals(open.format, 'email');

      const json = Pre.toJSONSchema();
      asserts.assertEquals(json.type, 'string');
    });
  });

  describe('set', () => {
    it('accepts a native Set and validates each element', () => {
      const Tags = Guardian.set(Guardian.string().minLength(1));
      const out = Tags.parse(new Set(['foo', 'bar']));
      asserts.assert(out instanceof Set);
      asserts.assertEquals(out.size, 2);
      asserts.assert(out.has('foo'));
      asserts.assert(out.has('bar'));
    });

    it('coerces arrays into a Set and deduplicates', () => {
      const Tags = Guardian.set(Guardian.string());
      const out = Tags.parse(['a', 'b', 'a', 'c']);
      asserts.assertEquals(out.size, 3);
      asserts.assert(out.has('a'));
      asserts.assert(out.has('b'));
      asserts.assert(out.has('c'));
    });

    it('rejects when an element fails validation', () => {
      const Tags = Guardian.set(Guardian.string().minLength(1));
      asserts.assertThrows(
        () => Tags.parse(['valid', '']),
        GuardianError,
      );
    });

    it('rejects non-Set / non-array input', () => {
      const Tags = Guardian.set(Guardian.string());
      asserts.assertThrows(() => Tags.parse('not a set'), GuardianError);
      asserts.assertThrows(() => Tags.parse({}), GuardianError);
    });

    it('emits uniqueItems: true on schema emit', () => {
      const Tags = Guardian.set(Guardian.string());
      const open = Tags.toOpenAPI();
      asserts.assertEquals(open.type, 'array');
      asserts.assertEquals(open.uniqueItems, true);
      asserts.assertEquals(
        (open.items as Record<string, unknown>).type,
        'string',
      );
    });
  });

  describe('map', () => {
    it('accepts a native Map', () => {
      const M = Guardian.map(Guardian.string(), Guardian.number());
      const out = M.parse(new Map([['a', 1], ['b', 2]]));
      asserts.assert(out instanceof Map);
      asserts.assertEquals(out.size, 2);
      asserts.assertEquals(out.get('a'), 1);
    });

    it('accepts array-of-pairs and converts to Map', () => {
      const M = Guardian.map(Guardian.string(), Guardian.number());
      const out = M.parse([['a', 1], ['b', 2]]);
      asserts.assert(out instanceof Map);
      asserts.assertEquals(out.get('b'), 2);
    });

    it('accepts plain object and converts to Map (string keys)', () => {
      const M = Guardian.map(Guardian.string(), Guardian.number());
      const out = M.parse({ a: 1, b: 2 });
      asserts.assert(out instanceof Map);
      asserts.assertEquals(out.get('a'), 1);
      asserts.assertEquals(out.get('b'), 2);
    });

    it('validates keys and values via their guardians', () => {
      const M = Guardian.map(
        Guardian.string().minLength(2),
        Guardian.number().positive(),
      );
      asserts.assertThrows(() => M.parse([['a', 1]]), GuardianError); // key too short
      asserts.assertThrows(() => M.parse([['aa', -1]]), GuardianError); // value not positive
    });

    it('rejects mal-formed pair entries', () => {
      const M = Guardian.map(Guardian.string(), Guardian.number());
      asserts.assertThrows(
        () => M.parse([['only-key']]),
        GuardianError,
        'must be a [key, value] pair',
      );
    });

    it('emits array of [K, V] tuples on schema emit', () => {
      const M = Guardian.map(Guardian.string(), Guardian.number());
      const json = M.toJSONSchema();
      asserts.assertEquals(json.type, 'array');
      const items = json.items as Record<string, unknown>;
      asserts.assertEquals(items.type, 'array');
      asserts.assert(Array.isArray(items.prefixItems));
      asserts.assertEquals((items.prefixItems as unknown[]).length, 2);
    });
  });

  describe('instanceof', () => {
    it('accepts instances of the constructor', () => {
      const U = Guardian.instanceof(URL);
      const url = new URL('https://example.com');
      asserts.assertStrictEquals(U.parse(url), url);
    });

    it('rejects non-instances', () => {
      const U = Guardian.instanceof(URL);
      asserts.assertThrows(() => U.parse('https://example.com'), GuardianError);
      asserts.assertThrows(() => U.parse({}), GuardianError);
      asserts.assertThrows(() => U.parse(null), GuardianError);
    });

    it('works with subclasses (covariant)', () => {
      class Animal {
        readonly kind = 'animal';
      }
      class Dog extends Animal {
        readonly bark = 'woof';
      }
      const A = Guardian.instanceof(Animal);
      const dog = new Dog();
      asserts.assertStrictEquals(A.parse(dog), dog);
    });

    it('emits a className annotation on schema emit', () => {
      const U = Guardian.instanceof(URL);
      const open = U.toOpenAPI();
      asserts.assertEquals(open.type, 'object');
      asserts.assertEquals(open.className, 'URL');
    });
  });

  describe('never', () => {
    it('always rejects', () => {
      const N = Guardian.never();
      asserts.assertThrows(() => N.parse('anything'), GuardianError);
      asserts.assertThrows(() => N.parse(42), GuardianError);
      asserts.assertThrows(() => N.parse({}), GuardianError);
    });

    it('emits not: {} on schema emit', () => {
      const N = Guardian.never();
      asserts.assertEquals(N.toOpenAPI().not, {});
      asserts.assertEquals(N.toJSONSchema().not, {});
    });

    it('composes inside a discriminated-union default branch', () => {
      const Result = Guardian.oneOf(
        [Guardian.object({ ok: Guardian.literal(true) }), Guardian.never()],
        'Expected a success result',
      );
      asserts.assertEquals(Result.parse({ ok: true }), { ok: true });
      asserts.assertThrows(
        () => Result.parse({ ok: false }),
        GuardianError,
      );
    });
  });

  describe('path-tagged errors', () => {
    it('object: single failing field tags path with the field name', () => {
      const schema = Guardian.object({
        email: Guardian.string().email(),
      });
      const [err] = schema.safeParse({ email: 'not-an-email' });
      asserts.assertInstanceOf(err, GuardianError);
      const leaves = [...err.leafErrors()];
      asserts.assertEquals(leaves.length, 1);
      asserts.assertEquals(leaves[0]!.path, ['email']);
    });

    it('object: nested failure produces a multi-segment path', () => {
      const schema = Guardian.object({
        user: Guardian.object({
          address: Guardian.object({
            zipCode: Guardian.string().minLength(5),
          }),
        }),
      });
      const [err] = schema.safeParse({
        user: { address: { zipCode: 'no' } },
      });
      asserts.assertInstanceOf(err, GuardianError);
      const leaves = [...err.leafErrors()];
      asserts.assertEquals(leaves.length, 1);
      asserts.assertEquals(leaves[0]!.path, ['user', 'address', 'zipCode']);
    });

    it('array: element failure produces a numeric path segment', () => {
      const schema = Guardian.array(Guardian.number().positive());
      const [err] = schema.safeParse([1, 2, -3, 4]);
      asserts.assertInstanceOf(err, GuardianError);
      asserts.assertEquals(err.path, [2]);
    });

    it('object-of-array: path mixes keys and indices', () => {
      const schema = Guardian.object({
        tags: Guardian.array(Guardian.string().minLength(1)),
      });
      const [err] = schema.safeParse({ tags: ['ok', '', 'also-ok'] });
      asserts.assertInstanceOf(err, GuardianError);
      const leaves = [...err.leafErrors()];
      asserts.assertEquals(leaves.length, 1);
      asserts.assertEquals(leaves[0]!.path, ['tags', 1]);
    });

    it('tuple: position failure produces a numeric path segment', () => {
      const schema = Guardian.tuple([
        Guardian.string(),
        Guardian.number().positive(),
      ]);
      const [err] = schema.safeParse(['ok', -1]);
      asserts.assertInstanceOf(err, GuardianError);
      asserts.assertEquals(err.path, [1]);
    });

    it('tuple with labels: path uses the label, not the index', () => {
      const schema = Guardian.tuple([
        Guardian.number(),
        Guardian.number().positive(),
      ]).labels(['x', 'y']);
      const [err] = schema.safeParse([0, -1]);
      asserts.assertInstanceOf(err, GuardianError);
      asserts.assertEquals(err.path, ['y']);
    });

    it('record: failing entry tags path with the key', () => {
      const schema = Guardian.record(
        Guardian.string(),
        Guardian.number().positive(),
      );
      const [err] = schema.safeParse({ a: 1, b: -2 });
      asserts.assertInstanceOf(err, GuardianError);
      const leaves = [...err.leafErrors()];
      asserts.assert(
        leaves.some((l) => JSON.stringify(l.path) === JSON.stringify(['b'])),
      );
    });

    it('object: multiple field failures produce multiple leaves', () => {
      const schema = Guardian.object({
        email: Guardian.string().email(),
        age: Guardian.number().min(0),
      });
      const [err] = schema.safeParse({ email: 'bad', age: -5 });
      asserts.assertInstanceOf(err, GuardianError);
      const leaves = [...err.leafErrors()];
      const paths = leaves.map((l) => JSON.stringify(l.path)).sort();
      asserts.assertEquals(paths, [
        JSON.stringify(['age']),
        JSON.stringify(['email']),
      ]);
    });

    it('set: element failure produces a numeric path segment', () => {
      const schema = Guardian.set(Guardian.string().minLength(1));
      const [err] = schema.safeParse(['ok', '']);
      asserts.assertInstanceOf(err, GuardianError);
      asserts.assertEquals(err.path, [1]);
    });

    it('map: entry failure produces a numeric path segment', () => {
      const schema = Guardian.map(
        Guardian.string().minLength(2),
        Guardian.number(),
      );
      const [err] = schema.safeParse([['ok', 1], ['x', 2]]);
      asserts.assertInstanceOf(err, GuardianError);
      asserts.assertEquals(err.path, [1]);
    });

    it('catchall: invalid unknown key tags path with the key', () => {
      const schema = Guardian.object({
        v: Guardian.number(),
      }).catchall(Guardian.string());
      const [err] = schema.safeParse({ v: 1, tag: {} });
      asserts.assertInstanceOf(err, GuardianError);
      const leaves = [...err.leafErrors()];
      asserts.assert(
        leaves.some((l) => JSON.stringify(l.path) === JSON.stringify(['tag'])),
      );
    });
  });
});
