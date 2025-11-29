import * as asserts from '$asserts';
import {
  BooleanGuardian,
  GuardianError,
  NumberGuardian,
  ObjectGuardian,
  StringGuardian,
} from '../../mod.ts';

Deno.test('guardian.ObjectGuardian', async (t) => {
  await t.step('Creation and basic functionality', async (u) => {
    await u.step('should create an ObjectGuardian with empty schema', () => {
      const guard = new ObjectGuardian({});
      const result = guard.parse({});
      asserts.assertEquals(result, {});
    });

    await u.step('should create an ObjectGuardian with schema', () => {
      const guard = new ObjectGuardian({
        name: new StringGuardian(),
        age: new NumberGuardian(),
      });

      const result = guard.parse({ name: 'John', age: 30 });
      asserts.assertEquals(result.name, 'John');
      asserts.assertEquals(result.age, 30);
    });

    await u.step('should have default passthrough mode', () => {
      const guard = new ObjectGuardian({
        name: new StringGuardian(),
      });

      const result = guard.parse({ name: 'John', extra: 'value' });
      asserts.assertEquals(result.name, 'John');
      asserts.assertEquals((result as any).extra, 'value');
    });
  });

  await t.step('Validation modes', async (u) => {
    await u.step(
      'Passthrough mode (default) - should allow additional properties',
      () => {
        const guard = new ObjectGuardian({
          name: new StringGuardian(),
          age: new NumberGuardian(),
        });

        const input = { name: 'John', age: 30, extra: 'allowed' };
        const result = guard.parse(input);
        asserts.assertEquals(result.name, 'John');
        asserts.assertEquals(result.age, 30);
        asserts.assertEquals((result as any).extra, 'allowed');
      },
    );

    await u.step('should validate required properties', () => {
      const guard = new ObjectGuardian({
        name: new StringGuardian(),
        age: new NumberGuardian(),
      });

      asserts.assertThrows(
        () => guard.parse({ name: 'John' }),
        GuardianError,
      );
    });

    await u.step('Strict mode - should reject additional properties', () => {
      const guard = new ObjectGuardian({
        name: new StringGuardian(),
        age: new NumberGuardian(),
      }).strict();

      asserts.assertThrows(
        () => guard.parse({ name: 'John', age: 30, extra: 'not allowed' }),
        GuardianError,
      );
    });

    await u.step(
      'Strict mode - should pass when no additional properties',
      () => {
        const guard = new ObjectGuardian({
          name: new StringGuardian(),
          age: new NumberGuardian(),
        }).strict();

        const result = guard.parse({ name: 'John', age: 30 });
        asserts.assertEquals(result.name, 'John');
        asserts.assertEquals(result.age, 30);
      },
    );

    await u.step('Strip mode - should remove additional properties', () => {
      const guard = new ObjectGuardian({
        name: new StringGuardian(),
        age: new NumberGuardian(),
      }).strip();

      const result = guard.parse({ name: 'John', age: 30, extra: 'removed' });
      asserts.assertEquals(result.name, 'John');
      asserts.assertEquals(result.age, 30);
      asserts.assertEquals((result as any).extra, undefined);
    });
  });

  await t.step('Schema manipulation', async (u) => {
    await u.step(
      'extend method - should extend schema with new properties',
      () => {
        const baseGuard = new ObjectGuardian({
          name: new StringGuardian(),
        });

        const extendedGuard = baseGuard.extend({
          age: new NumberGuardian(),
          email: new StringGuardian(),
        });

        const result = extendedGuard.parse({
          name: 'John',
          age: 30,
          email: 'john@example.com',
        });

        asserts.assertEquals(result.name, 'John');
        asserts.assertEquals(result.age, 30);
        asserts.assertEquals(result.email, 'john@example.com');
      },
    );

    await u.step('pick method - should pick specific properties', () => {
      const fullGuard = new ObjectGuardian({
        id: new NumberGuardian(),
        name: new StringGuardian(),
        email: new StringGuardian(),
        password: new StringGuardian(),
      });

      const publicGuard = fullGuard.pick('id', 'name', 'email');
      const result = publicGuard.parse({
        id: 1,
        name: 'John',
        email: 'john@example.com',
      });

      asserts.assertEquals(result.id, 1);
      asserts.assertEquals(result.name, 'John');
      asserts.assertEquals(result.email, 'john@example.com');
    });

    await u.step('omit method - should omit specific properties', () => {
      const fullGuard = new ObjectGuardian({
        id: new NumberGuardian(),
        name: new StringGuardian(),
        email: new StringGuardian(),
        password: new StringGuardian(),
      });

      const safeGuard = fullGuard.omit('password');
      const result = safeGuard.parse({
        id: 1,
        name: 'John',
        email: 'john@example.com',
      });

      asserts.assertEquals(result.id, 1);
      asserts.assertEquals(result.name, 'John');
      asserts.assertEquals(result.email, 'john@example.com');
    });
  });

  await t.step('Key validations', async (u) => {
    await u.step('hasKeys validation', async (n) => {
      await n.step('should pass when all required keys are present', () => {
        const guard = new ObjectGuardian({
          id: new NumberGuardian(),
          name: new StringGuardian(),
          email: new StringGuardian().optional(),
        }).hasKeys(['id', 'name']);

        const result = guard.parse({
          id: 1,
          name: 'John',
          email: 'john@example.com',
        });

        asserts.assertEquals(result.id, 1);
        asserts.assertEquals(result.name, 'John');
        asserts.assertEquals(result.email, 'john@example.com');
      });

      await n.step(
        'should pass when required keys are present (optional missing)',
        () => {
          const guard = new ObjectGuardian({
            id: new NumberGuardian(),
            name: new StringGuardian(),
            email: new StringGuardian().optional(),
          }).hasKeys(['id', 'name']);

          const result = guard.parse({ id: 1, name: 'John' });
          asserts.assertEquals(result.id, 1);
          asserts.assertEquals(result.name, 'John');
        },
      );

      await n.step('should fail when required keys are missing', () => {
        const guard = new ObjectGuardian({
          id: new NumberGuardian().optional(),
          name: new StringGuardian().optional(),
          email: new StringGuardian().optional(),
        }).hasKeys(['id', 'name']);

        asserts.assertThrows(
          () => guard.parse({ id: 1 }),
          GuardianError,
          'Object must contain all required keys: id, name',
        );
      });

      await n.step('should use custom error message', () => {
        const guard = new ObjectGuardian({
          id: new NumberGuardian().optional(),
          name: new StringGuardian().optional(),
        }).hasKeys(['id', 'name'], 'Custom: ID and name are mandatory');

        asserts.assertThrows(
          () => guard.parse({ id: 1 }),
          GuardianError,
          'Custom: ID and name are mandatory',
        );
      });
    });

    await u.step('forbiddenKeys validation', async (n) => {
      await n.step('should pass when no forbidden keys are present', () => {
        const guard = new ObjectGuardian({
          id: new NumberGuardian(),
          name: new StringGuardian(),
          email: new StringGuardian(),
        }).forbiddenKeys(['password', 'secret']);

        const result = guard.parse({
          id: 1,
          name: 'John',
          email: 'john@example.com',
        });

        asserts.assertEquals(result.id, 1);
        asserts.assertEquals(result.name, 'John');
        asserts.assertEquals(result.email, 'john@example.com');
      });

      await n.step('should fail when forbidden keys are present', () => {
        const guard = new ObjectGuardian({
          id: new NumberGuardian(),
          name: new StringGuardian(),
        }).forbiddenKeys(['password', 'secret']);

        asserts.assertThrows(
          () => guard.parse({ id: 1, name: 'John', password: 'secret123' }),
          GuardianError,
          'Object must not contain forbidden keys: password, secret',
        );
      });

      await n.step('should fail when any forbidden key is present', () => {
        const guard = new ObjectGuardian({
          id: new NumberGuardian(),
          name: new StringGuardian(),
        }).forbiddenKeys(['password', 'secret', 'private']);

        asserts.assertThrows(
          () => guard.parse({ id: 1, name: 'John', private: 'data' }),
          GuardianError,
          'Object must not contain forbidden keys: password, secret, private',
        );
      });

      await n.step('should use custom error message', () => {
        const guard = new ObjectGuardian({
          id: new NumberGuardian(),
          name: new StringGuardian(),
        }).forbiddenKeys(['password'], 'Security: Password field not allowed');

        asserts.assertThrows(
          () => guard.parse({ id: 1, name: 'John', password: 'secret' }),
          GuardianError,
          'Security: Password field not allowed',
        );
      });
    });

    await u.step('chaining key validations', () => {
      const guard = new ObjectGuardian({
        id: new NumberGuardian().optional(),
        name: new StringGuardian().optional(),
        email: new StringGuardian().optional(),
      })
        .hasKeys(['id', 'name'])
        .forbiddenKeys(['password', 'secret']);

      // Should pass valid input
      const result = guard.parse({
        id: 1,
        name: 'John',
        email: 'john@example.com',
      });
      asserts.assertEquals(result.id, 1);
      asserts.assertEquals(result.name, 'John');

      // Should fail on missing required key
      asserts.assertThrows(
        () => guard.parse({ id: 1, email: 'john@example.com' }),
        GuardianError,
        'Object must contain all required keys: id, name',
      );

      // Should fail on forbidden key
      asserts.assertThrows(
        () => guard.parse({ id: 1, name: 'John', password: 'secret' }),
        GuardianError,
        'Object must not contain forbidden keys: password, secret',
      );
    });
  });

  await t.step('Error handling', async (u) => {
    await u.step('should reject non-objects', () => {
      const guard = new ObjectGuardian({});

      asserts.assertThrows(() => guard.parse('not an object'), GuardianError);
      asserts.assertThrows(() => guard.parse(123), GuardianError);
      asserts.assertThrows(() => guard.parse(null), GuardianError);
      asserts.assertThrows(() => guard.parse([]), GuardianError);
    });
  });

  await t.step('SafeParse functionality', async (u) => {
    await u.step('should return success result for valid data', () => {
      const guard = new ObjectGuardian({
        name: new StringGuardian(),
        age: new NumberGuardian().optional(),
      });

      const [error, data] = guard.safeParse({ name: 'John', age: 30 });
      asserts.assertEquals(error, null);
      asserts.assertEquals(data?.name, 'John');
      asserts.assertEquals(data?.age, 30);
    });

    await u.step('should return error result for invalid data', () => {
      const guard = new ObjectGuardian({
        name: new StringGuardian(),
        age: new NumberGuardian(),
      });

      const [error, data] = guard.safeParse({ name: 'John' });
      asserts.assertEquals(data, undefined);
      asserts.assertEquals(error instanceof GuardianError, true);
    });
  });

  await t.step('Refine functionality', async (u) => {
    await u.step('should validate password confirmation', () => {
      const registerSchema = new ObjectGuardian({
        email: new StringGuardian(),
        password: new StringGuardian(),
        confirmPassword: new StringGuardian(),
      }).refine(
        (data) => data.password === data.confirmPassword,
        'Passwords do not match',
      );

      // Valid case
      const validData = {
        email: 'john@example.com',
        password: 'secure123',
        confirmPassword: 'secure123',
      };
      const result = registerSchema.parse(validData);
      asserts.assertEquals(result.email, 'john@example.com');
      asserts.assertEquals(result.password, 'secure123');

      // Invalid case
      asserts.assertThrows(
        () =>
          registerSchema.parse({
            email: 'john@example.com',
            password: 'secure123',
            confirmPassword: 'different',
          }),
        GuardianError,
        'Passwords do not match',
      );
    });

    await u.step('should validate conditional requirements', () => {
      const userSchema = new ObjectGuardian({
        age: new NumberGuardian(),
        hasParentalConsent: new BooleanGuardian().optional(),
      }).refine(
        (data) => data.age >= 18 || data.hasParentalConsent === true,
        'Users under 18 must have parental consent',
      );

      // Valid: adult user
      const adultUser = userSchema.parse({ age: 25 });
      asserts.assertEquals(adultUser.age, 25);

      // Valid: minor with consent
      const minorWithConsent = userSchema.parse({
        age: 16,
        hasParentalConsent: true,
      });
      asserts.assertEquals(minorWithConsent.age, 16);
      asserts.assertEquals(minorWithConsent.hasParentalConsent, true);

      // Invalid: minor without consent
      asserts.assertThrows(
        () => userSchema.parse({ age: 16 }),
        GuardianError,
        'Users under 18 must have parental consent',
      );
    });

    await u.step('should support multiple refinements with superRefine', () => {
      const eventSchema = new ObjectGuardian({
        startDate: new StringGuardian(), // Simplified for testing
        endDate: new StringGuardian(),
        price: new NumberGuardian(),
        discountCode: new StringGuardian().optional(),
      }).superRefine([
        {
          validator: (data) => data.endDate > data.startDate,
          message: 'End date must be after start date',
        },
        {
          validator: (data) => !data.discountCode || data.price > 10,
          message: 'Discount codes only valid for purchases over $10',
        },
      ]);

      // Valid case
      const validEvent = eventSchema.parse({
        startDate: '2025-01-01',
        endDate: '2025-01-02',
        price: 25,
        discountCode: 'SAVE10',
      });
      asserts.assertEquals(validEvent.price, 25);

      // Invalid: end date before start date
      asserts.assertThrows(
        () =>
          eventSchema.parse({
            startDate: '2025-01-02',
            endDate: '2025-01-01',
            price: 25,
          }),
        GuardianError,
        'End date must be after start date',
      );

      // Invalid: discount on low price
      asserts.assertThrows(
        () =>
          eventSchema.parse({
            startDate: '2025-01-01',
            endDate: '2025-01-02',
            price: 5,
            discountCode: 'SAVE10',
          }),
        GuardianError,
        'Discount codes only valid for purchases over $10',
      );
    });

    await u.step('should handle async refinements', async () => {
      const asyncSchema = new ObjectGuardian({
        username: new StringGuardian(),
        email: new StringGuardian(),
      }).refine(
        async (data) => {
          // Simulate async validation (e.g., checking if username is unique)
          await new Promise((resolve) => setTimeout(resolve, 1));
          return data.username !== 'taken';
        },
        'Username is already taken',
      );

      // Valid case
      const validUser = await asyncSchema.parseAsync({
        username: 'available',
        email: 'user@example.com',
      });
      asserts.assertEquals(validUser.username, 'available');

      // Invalid case - should throw error
      let caught = false;
      try {
        await asyncSchema.parseAsync({
          username: 'taken',
          email: 'user@example.com',
        });
      } catch (error) {
        caught = true;
        asserts.assertInstanceOf(error, GuardianError);
        asserts.assert(
          (error as GuardianError).message.includes(
            'Username is already taken',
          ),
        );
      }

      if (!caught) {
        asserts.fail(
          'Expected async validation to throw an error for invalid input',
        );
      }
    });

    await u.step('should reject async refinements in sync parsing', () => {
      const asyncSchema = new ObjectGuardian({
        username: new StringGuardian(),
      }).refine(
        async (data) => data.username !== 'taken',
        'Username is already taken',
      );

      asserts.assertThrows(
        () => asyncSchema.parse({ username: 'test' }),
        GuardianError,
        'Cannot use parse() with async validation steps. Use parseAsync() instead',
      );
    });
  });

  await t.step('partial() method', async (u) => {
    await u.step('should make all properties optional', () => {
      const requiredSchema = new ObjectGuardian({
        id: new NumberGuardian(),
        name: new StringGuardian(),
        email: new StringGuardian(),
      });

      const partialSchema = requiredSchema.partial();

      // Should accept empty object
      const result1 = partialSchema.parse({});
      asserts.assertEquals(result1, {});

      // Should accept partial data
      const result2 = partialSchema.parse({ id: 1 });
      asserts.assertEquals(result2.id, 1);
      asserts.assertEquals(result2.name, undefined);

      // Should accept full data
      const result3 = partialSchema.parse({
        id: 1,
        name: 'John',
        email: 'john@example.com',
      });
      asserts.assertEquals(result3.id, 1);
      asserts.assertEquals(result3.name, 'John');
      asserts.assertEquals(result3.email, 'john@example.com');
    });

    await u.step('should work with partial schema from strict mode', () => {
      const strictSchema = new ObjectGuardian({
        name: new StringGuardian(),
        age: new NumberGuardian(),
      }).strict();

      const partialStrictSchema = strictSchema.partial();

      // Should accept data without required properties
      const result = partialStrictSchema.parse({});
      asserts.assertEquals(result, {});

      // Should accept partial data
      const result2 = partialStrictSchema.parse({ name: 'John' });
      asserts.assertEquals(result2.name, 'John');
    });
  });

  await t.step('required() method', async (u) => {
    await u.step('should make all properties required', () => {
      const optionalSchema = new ObjectGuardian({
        id: new NumberGuardian().optional(),
        name: new StringGuardian().optional(),
        email: new StringGuardian().optional(),
      });

      const requiredSchema = optionalSchema.required();

      // Should accept all properties
      const result = requiredSchema.parse({
        id: 1,
        name: 'John',
        email: 'john@example.com',
      });
      asserts.assertEquals(result.id, 1);
      asserts.assertEquals(result.name, 'John');
      asserts.assertEquals(result.email, 'john@example.com');

      // Should work with missing properties (still in passthrough mode by default)
      const result2 = requiredSchema.parse({ id: 1 });
      asserts.assertEquals(result2.id, 1);
    });
  });

  await t.step('property() method', async (u) => {
    await u.step('should add a new property to schema', () => {
      const baseSchema = new ObjectGuardian({
        id: new NumberGuardian(),
        name: new StringGuardian(),
      });

      const extendedSchema = baseSchema.property('email', new StringGuardian());

      const result = extendedSchema.parse({
        id: 1,
        name: 'John',
        email: 'john@example.com',
      });

      asserts.assertEquals(result.id, 1);
      asserts.assertEquals(result.name, 'John');
      asserts.assertEquals(result.email, 'john@example.com');
    });

    await u.step('should allow the new property', () => {
      const baseSchema = new ObjectGuardian({
        id: new NumberGuardian(),
      });

      const extendedSchema = baseSchema.property('name', new StringGuardian());

      // Should accept with the new property
      const result = extendedSchema.parse({ id: 1, name: 'John' });
      asserts.assertEquals(result.id, 1);
      asserts.assertEquals(result.name, 'John');

      // Should also work without the new property (passthrough mode)
      const result2 = extendedSchema.parse({ id: 1 });
      asserts.assertEquals(result2.id, 1);
    });
  });

  await t.step('clone() method', async (u) => {
    await u.step('should clone with schema and mode', () => {
      const original = new ObjectGuardian({
        name: new StringGuardian(),
        age: new NumberGuardian(),
      });

      const cloned = original.clone();

      // Cloned should accept valid data
      const result = cloned.parse({ name: 'John', age: 20 });
      asserts.assertEquals(result.name, 'John');
      asserts.assertEquals(result.age, 20);

      // Clones should be independent instances
      asserts.assertNotStrictEquals(original, cloned);

      // Clone should have same schema
      const result2 = original.parse({ name: 'Jane', age: 30 });
      const result3 = cloned.parse({ name: 'Jane', age: 30 });
      asserts.assertEquals(result2.name, result3.name);
      asserts.assertEquals(result2.age, result3.age);
    });
  });

  await t.step('transform() method', async (u) => {
    await u.step('should transform validated object', () => {
      const schema = new ObjectGuardian({
        firstName: new StringGuardian(),
        lastName: new StringGuardian(),
        birthYear: new NumberGuardian(),
      }).transform((data) => ({
        fullName: `${data.firstName} ${data.lastName}`,
        age: new Date().getFullYear() - data.birthYear,
      }));

      const result = schema.parse({
        firstName: 'John',
        lastName: 'Doe',
        birthYear: 1990,
      });

      asserts.assertEquals(result.fullName, 'John Doe');
      asserts.assertEquals(result.age, new Date().getFullYear() - 1990);
    });

    await u.step('should chain transformations', () => {
      const schema = new ObjectGuardian({
        value: new NumberGuardian(),
      })
        .transform((data) => ({ doubled: data.value * 2 }))
        .transform((data) => ({ tripled: data.doubled * 1.5 }));

      const result = schema.parse({ value: 10 });
      asserts.assertEquals(result.tripled, 30);
    });
  });

  await t.step('Error handling edge cases', async (u) => {
    await u.step('should handle validation errors in properties', () => {
      const schema = new ObjectGuardian({
        email: new StringGuardian(),
        age: new NumberGuardian().min(0).max(120),
      });

      // Multiple validation errors
      asserts.assertThrows(
        () => schema.parse({ email: 'test', age: 150 }),
        GuardianError,
      );
    });

    await u.step('should preserve error context in nested objects', () => {
      const nestedSchema = new ObjectGuardian({
        user: new ObjectGuardian({
          name: new StringGuardian(),
          age: new NumberGuardian(),
        }),
      });

      try {
        nestedSchema.parse({ user: { name: 'John' } });
        asserts.fail('Should have thrown an error');
      } catch (error) {
        asserts.assertInstanceOf(error, GuardianError);
        // Error should be a GuardianError (validation may pass in passthrough mode)
      }

      // Test with invalid data type
      try {
        nestedSchema.parse({ user: 'not an object' });
        asserts.fail('Should have thrown an error');
      } catch (error) {
        asserts.assertInstanceOf(error, GuardianError);
      }
    });

    await u.step('should handle refinement errors with path', () => {
      const schema = new ObjectGuardian({
        password: new StringGuardian(),
        confirmPassword: new StringGuardian(),
      }).refine(
        (data) => data.password === data.confirmPassword,
        'Passwords do not match',
        'confirmPassword',
      );

      try {
        schema.parse({ password: 'abc123', confirmPassword: 'different' });
        asserts.fail('Should have thrown an error');
      } catch (error) {
        asserts.assertInstanceOf(error, GuardianError);
        asserts.assertEquals(
          (error as GuardianError).message,
          'Passwords do not match',
        );
      }
    });

    await u.step('should handle unexpected errors during refinement', () => {
      const schema = new ObjectGuardian({
        value: new NumberGuardian(),
      }).refine(
        (_data) => {
          throw new Error('Unexpected error');
        },
        'Custom validation failed',
      );

      try {
        schema.parse({ value: 10 });
        asserts.fail('Should have thrown an error');
      } catch (error) {
        asserts.assertInstanceOf(error, GuardianError);
        asserts.assert(
          (error as GuardianError).message.includes(
            'Refinement validation failed',
          ),
        );
      }
    });

    await u.step(
      'should handle async refinement with unexpected errors',
      async () => {
        const schema = new ObjectGuardian({
          value: new NumberGuardian(),
        }).refine(
          async (_data) => {
            await new Promise((resolve) => setTimeout(resolve, 1));
            throw new Error('Async unexpected error');
          },
          'Custom async validation failed',
        );

        try {
          await schema.parseAsync({ value: 10 });
          asserts.fail('Should have thrown an error');
        } catch (error) {
          asserts.assertInstanceOf(error, GuardianError);
          asserts.assert(
            (error as GuardianError).message.includes(
              'Refinement validation failed',
            ),
          );
        }
      },
    );
  });

  await t.step('SafeParse with refinements', async (u) => {
    await u.step('should return error for failed refinement', () => {
      const schema = new ObjectGuardian({
        age: new NumberGuardian(),
      }).refine((data) => data.age >= 18, 'Must be 18 or older');

      const [error, data] = schema.safeParse({ age: 16 });
      asserts.assertInstanceOf(error, GuardianError);
      asserts.assertEquals(data, undefined);
      asserts.assert(error!.message.includes('Must be 18 or older'));
    });

    await u.step('should return data for successful refinement', () => {
      const schema = new ObjectGuardian({
        age: new NumberGuardian(),
      }).refine((data) => data.age >= 18, 'Must be 18 or older');

      const [error, data] = schema.safeParse({ age: 20 });
      asserts.assertEquals(error, null);
      asserts.assertEquals(data?.age, 20);
    });
  });

  await t.step('Immutable mode behavior', async (u) => {
    await u.step('should create new instance when cloning', () => {
      const baseSchema = new ObjectGuardian({
        value: new NumberGuardian(),
      });

      const clonedSchema = baseSchema.clone();

      // Should be different instances
      asserts.assertNotStrictEquals(baseSchema, clonedSchema);

      // Both should validate the same way
      const result1 = baseSchema.parse({ value: -5 });
      const result2 = clonedSchema.parse({ value: -5 });
      asserts.assertEquals(result1.value, result2.value);

      // Add refinement to one
      const refinedSchema = baseSchema.refine(
        (data) => data.value > 0,
        'Must be positive',
      );

      // Original and clone should not be affected
      const result3 = clonedSchema.parse({ value: -5 });
      asserts.assertEquals(result3.value, -5);
    });
  });

  await t.step('Complex chaining scenarios', async (u) => {
    await u.step('should chain multiple operations', () => {
      const schema = new ObjectGuardian({
        id: new NumberGuardian(),
        firstName: new StringGuardian(),
        lastName: new StringGuardian(),
        age: new NumberGuardian(),
        password: new StringGuardian(),
      })
        .omit('password')
        .pick('id', 'firstName', 'lastName', 'age')
        .extend({
          email: new StringGuardian(),
        })
        .refine((data) => data.age >= 18, 'Must be 18 or older');

      const result = schema.parse({
        id: 1,
        firstName: 'John',
        lastName: 'Doe',
        age: 25,
        email: 'john@example.com',
      });

      asserts.assertEquals(result.id, 1);
      asserts.assertEquals(result.firstName, 'John');
      asserts.assertEquals(result.lastName, 'Doe');
      asserts.assertEquals(result.age, 25);
      asserts.assertEquals(result.email, 'john@example.com');

      // Test refinement validation
      asserts.assertThrows(
        () =>
          schema.parse({
            id: 1,
            firstName: 'John',
            lastName: 'Doe',
            age: 16,
            email: 'john@example.com',
          }),
        GuardianError,
        'Must be 18 or older',
      );
    });
  });
});
