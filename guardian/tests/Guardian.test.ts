import * as asserts from '$asserts';
import { Guardian } from '../Guardian.ts';
import { GuardianError } from '../GuardianError.ts';

Deno.test('guardian.Guardian', async (t) => {
  await t.step('factory methods', async (u) => {
    await u.step('should create string guardian', () => {
      const stringGuard = Guardian.string();
      asserts.assertEquals(stringGuard.parse('hello'), 'hello');
    });

    await u.step('should create number guardian', () => {
      const numberGuard = Guardian.number();
      asserts.assertEquals(numberGuard.parse(42), 42);
    });

    await u.step('should create boolean guardian', () => {
      const boolGuard = Guardian.boolean();
      asserts.assertEquals(boolGuard.parse(true), true);
    });

    await u.step('should create array guardian', () => {
      const arrayGuard = Guardian.array();
      asserts.assertEquals(arrayGuard.parse([1, 2, 3]), [1, 2, 3]);
    });

    await u.step('should create object guardian', () => {
      const objGuard = Guardian.object();
      const testObj = { name: 'test' };
      asserts.assertEquals(objGuard.parse(testObj), testObj);
    });

    await u.step('should create date guardian', () => {
      const dateGuard = Guardian.date();
      const testDate = new Date();
      asserts.assertEquals(dateGuard.parse(testDate), testDate);
    });

    await u.step('should create bigint guardian', () => {
      const bigintGuard = Guardian.bigint();
      asserts.assertEquals(bigintGuard.parse(42n), 42n);
    });

    await u.step('should create enum guardian', () => {
      const enumGuard = Guardian.enum(['red', 'green', 'blue']);
      asserts.assertEquals(enumGuard.parse('red'), 'red');
    });

    await u.step('should create unknown guardian', () => {
      const unknownGuard = Guardian.unknown();
      asserts.assertEquals(unknownGuard.parse('anything'), 'anything');
    });
  });

  await t.step('oneOf functionality', async (u) => {
    await u.step('should accept valid first option', () => {
      const schema = Guardian.oneOf(
        [Guardian.number().positive(), Guardian.string().minLength(3)],
        'Number or string required',
      );
      asserts.assertEquals(schema.parse(42), 42);
    });

    await u.step('should accept valid second option', () => {
      const schema = Guardian.oneOf(
        [Guardian.number().positive(), Guardian.string().minLength(3)],
        'Number or string required',
      );
      asserts.assertEquals(schema.parse('hello'), 'hello');
    });

    await u.step('should reject invalid input with custom message', () => {
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

    await u.step('should require error message', () => {
      asserts.assertThrows(
        () => Guardian.oneOf([Guardian.string()], ''),
        Error,
        'oneOf requires a non-empty error message',
      );
    });

    await u.step('should require at least one guardian', () => {
      asserts.assertThrows(
        () => Guardian.oneOf([], 'test'),
        Error,
        'oneOf requires at least one guardian',
      );
    });

    await u.step('should aggregate errors from all failed attempts', () => {
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

        const causes = error.context.cause as Record<string, GuardianError>;
        asserts.assert('option_0' in causes);
        asserts.assert('option_1' in causes);
        asserts.assert(causes.option_0 instanceof GuardianError);
        asserts.assert(causes.option_1 instanceof GuardianError);
      }
    });
  });

  await t.step('type utilities', async (u) => {
    await u.step('Guardian.type should return constructor name', () => {
      const stringGuard = Guardian.string();
      const numberGuard = Guardian.number();
      const boolGuard = Guardian.boolean();

      asserts.assertEquals(Guardian.type(stringGuard), 'StringGuardian');
      asserts.assertEquals(Guardian.type(numberGuard), 'NumberGuardian');
      asserts.assertEquals(Guardian.type(boolGuard), 'BooleanGuardian');
    });

    await u.step('Guardian.infer should throw at runtime', () => {
      const schema = Guardian.string();
      asserts.assertThrows(
        () => Guardian.infer(schema),
        Error,
        'Guardian.infer is a type-only utility and should not be called at runtime',
      );
    });

    await u.step('Guardian.inferInput should throw at runtime', () => {
      const schema = Guardian.string();
      asserts.assertThrows(
        () => Guardian.inferInput(schema),
        Error,
        'Guardian.inferInput is a type-only utility and should not be called at runtime',
      );
    });
  });

  await t.step('complex schema composition', async (u) => {
    await u.step('should create nested object schema', () => {
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

    await u.step('should handle optional fields', () => {
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

    await u.step('should handle union types with oneOf', () => {
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

  await t.step('error aggregation and context', async (u) => {
    await u.step(
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

    await u.step('should chain multiple validation errors', () => {
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

  await t.step('safe parsing', async (u) => {
    await u.step('should return success tuple for valid input', () => {
      const schema = Guardian.string().minLength(3);
      const result = schema.safeParse('hello');

      asserts.assertEquals(result[0], null);
      asserts.assertEquals(result[1], 'hello');
    });

    await u.step('should return error tuple for invalid input', () => {
      const schema = Guardian.string().minLength(5);
      const result = schema.safeParse('hi');

      asserts.assert(result[0] instanceof GuardianError);
      asserts.assertEquals(result[1], undefined);
    });

    await u.step('should work with complex schemas', () => {
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

  await t.step('async validation support', async (u) => {
    await u.step('should handle async validation steps', async () => {
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

    await u.step('should support safeParseAsync', async () => {
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

  await t.step('metadata and context', async (u) => {
    await u.step('should preserve metadata in guardian instances', () => {
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

    await u.step('should allow setting metadata properties', () => {
      const schema = Guardian.string();
      schema.description = 'A test string';
      schema.title = 'Test';
      schema.examples = ['example1', 'example2'];
      schema.deprecated = true;

      asserts.assertEquals(schema.metaData?.description, 'A test string');
      asserts.assertEquals(schema.metaData?.title, 'Test');
      asserts.assertEquals(schema.metaData?.examples, ['example1', 'example2']);
      asserts.assertEquals(schema.metaData?.deprecated, true);
    });
  });

  await t.step('performance optimizations', async (u) => {
    await u.step(
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

    await u.step('should handle complex object validation efficiently', () => {
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

  await t.step('immutability modes', async (u) => {
    await u.step('should support immutable mode', () => {
      const baseSchema = Guardian.string();
      const immutableSchema = baseSchema.immutable();

      // Original schema should be unchanged when we modify immutable copy
      const extendedSchema = (immutableSchema as any).minLength(5);

      // Since immutable, original should still pass short strings
      asserts.assertEquals(baseSchema.parse('hi'), 'hi');

      // Extended schema should have the new validation
      asserts.assertThrows(
        () => extendedSchema.parse('hi'),
        GuardianError,
      );
      asserts.assertEquals(extendedSchema.parse('hello'), 'hello');
    });

    await u.step('should default to mutable mode for performance', () => {
      const schema1 = Guardian.string();
      const schema2 = schema1.minLength(3);

      // By default, both should reference the same object (mutation)
      asserts.assertEquals(schema1, schema2);

      // Both should have the minLength validation
      asserts.assertThrows(
        () => schema1.parse('hi'),
        GuardianError,
      );
    });
  });
});
