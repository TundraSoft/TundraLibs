import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat';
import { Guardian } from '../../Guardian.ts';
import {
  BooleanGuardian,
  GuardianError,
  NumberGuardian,
  ObjectGuardian,
  StringGuardian,
} from '../../mod.ts';
import type { GuardianInfer } from '../../types/mod.ts';

describe('guardian.ObjectGuardian', () => {
  describe('Creation and basic functionality', () => {
    it('should create an ObjectGuardian with empty schema', () => {
      const guard = new ObjectGuardian({});
      const result = guard.parse({});
      asserts.assertEquals(result, {});
    });

    it('should create an ObjectGuardian with schema', () => {
      const guard = new ObjectGuardian({
        name: new StringGuardian(),
        age: new NumberGuardian(),
      });

      const result = guard.parse({ name: 'John', age: 30 });
      asserts.assertEquals(result.name, 'John');
      asserts.assertEquals(result.age, 30);
    });

    it('should default to strip mode (extra props dropped)', () => {
      const guard = new ObjectGuardian({
        name: new StringGuardian(),
      });

      const result = guard.parse({ name: 'John', extra: 'value' });
      asserts.assertEquals(result.name, 'John');
      // Strip mode silently drops keys not in the schema. This is
      // the default since the BREAKING change — safer for API
      // boundaries where client-controlled keys shouldn't leak onto
      // the domain object.
      asserts.assertEquals((result as any).extra, undefined);
    });
  });

  describe('Validation modes', () => {
    it(
      'Strip mode (default) - should drop additional properties',
      () => {
        const guard = new ObjectGuardian({
          name: new StringGuardian(),
          age: new NumberGuardian(),
        });

        const input = { name: 'John', age: 30, extra: 'dropped' };
        const result = guard.parse(input);
        asserts.assertEquals(result.name, 'John');
        asserts.assertEquals(result.age, 30);
        asserts.assertEquals((result as any).extra, undefined);
      },
    );

    it(
      'Passthrough mode - explicit opt-in keeps additional properties',
      () => {
        const guard = new ObjectGuardian({
          name: new StringGuardian(),
          age: new NumberGuardian(),
        }).passthrough();

        const input = { name: 'John', age: 30, extra: 'kept' };
        const result = guard.parse(input);
        asserts.assertEquals(result.name, 'John');
        asserts.assertEquals(result.age, 30);
        asserts.assertEquals((result as any).extra, 'kept');
      },
    );

    it('should validate required properties', () => {
      const guard = new ObjectGuardian({
        name: new StringGuardian(),
        age: new NumberGuardian(),
      });

      asserts.assertThrows(
        () => guard.parse({ name: 'John' }),
        GuardianError,
      );
    });

    it('Strict mode - should reject additional properties', () => {
      const guard = new ObjectGuardian({
        name: new StringGuardian(),
        age: new NumberGuardian(),
      }).strict();

      asserts.assertThrows(
        () => guard.parse({ name: 'John', age: 30, extra: 'not allowed' }),
        GuardianError,
      );
    });

    it(
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

    it('Strip mode - should remove additional properties', () => {
      const guard = new ObjectGuardian({
        name: new StringGuardian(),
        age: new NumberGuardian(),
      }).strip();

      const result = guard.parse({ name: 'John', age: 30, extra: 'removed' });
      asserts.assertEquals(result.name, 'John');
      asserts.assertEquals(result.age, 30);
      asserts.assertEquals((result as any).extra, undefined);
    });

    it('Catchall mode - keeps unknowns that pass the catchall guardian', () => {
      const guard = new ObjectGuardian({
        v: new NumberGuardian(),
        event: new StringGuardian(),
      }).catchall(new StringGuardian());

      const result = guard.parse({
        v: 1,
        event: 'hi',
        tag: 'foo',
        label: 'bar',
      });
      asserts.assertEquals(result.v, 1);
      asserts.assertEquals(result.event, 'hi');
      asserts.assertEquals((result as Record<string, unknown>).tag, 'foo');
      asserts.assertEquals((result as Record<string, unknown>).label, 'bar');
    });

    it('passthrough drops prototype-pollution keys', () => {
      const guard = new ObjectGuardian({ a: new NumberGuardian() })
        .passthrough();
      // `JSON.parse` makes `__proto__` an own enumerable key — the
      // classic prototype-pollution vector.
      const input = JSON.parse(
        '{"a":1,"__proto__":{"x":1},"constructor":2,"prototype":3,"safe":"keep"}',
      );
      const result = guard.parse(input) as Record<string, unknown>;
      asserts.assertEquals(Object.keys(result).sort(), ['a', 'safe']);
      asserts.assertEquals(
        Object.prototype.hasOwnProperty.call(result, '__proto__'),
        false,
      );
      // The Object prototype itself was not polluted.
      asserts.assertEquals(({} as Record<string, unknown>).x, undefined);
    });

    it('catchall drops prototype-pollution keys', () => {
      const guard = new ObjectGuardian({ a: new NumberGuardian() })
        .catchall(new NumberGuardian());
      const input = JSON.parse(
        '{"a":1,"__proto__":2,"constructor":3,"prototype":4,"keep":5}',
      );
      const result = guard.parse(input) as Record<string, unknown>;
      asserts.assertEquals(Object.keys(result).sort(), ['a', 'keep']);
      asserts.assertEquals(
        Object.prototype.hasOwnProperty.call(result, '__proto__'),
        false,
      );
    });

    it('Catchall mode - rejects unknowns that fail the catchall guardian', () => {
      const guard = new ObjectGuardian({
        v: new NumberGuardian(),
      }).catchall(new StringGuardian());

      // `tag: 42` should fail — catchall expects strings, not numbers.
      // StringGuardian coerces 42 → '42' rather than throwing, so use
      // an explicitly non-coercible value to exercise the rejection path.
      asserts.assertThrows(
        () => guard.parse({ v: 1, tag: {} }),
        GuardianError,
      );
    });

    it('Catchall mode - last mode call wins (strict after catchall clears it)', () => {
      const guard = new ObjectGuardian({
        v: new NumberGuardian(),
      })
        .catchall(new StringGuardian())
        .strict();

      // Now strict — extras rejected outright; catchall guard is gone.
      asserts.assertThrows(
        () => guard.parse({ v: 1, tag: 'still rejected' }),
        GuardianError,
      );
    });

    it('Catchall mode - emits additionalProperties as the guardian schema', () => {
      const guard = new ObjectGuardian({
        v: new NumberGuardian(),
      }).catchall(new StringGuardian());

      const schema = guard.toOpenAPI();
      // OpenAPI 3.0: additionalProperties carries the catchall schema.
      const additional = schema.additionalProperties as Record<string, unknown>;
      asserts.assertEquals(additional.type, 'string');
    });
  });

  describe('Schema manipulation', () => {
    it(
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

    it('pick method - should pick specific properties', () => {
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

    it('omit method - should omit specific properties', () => {
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

  describe('Optional defaults on absent keys', () => {
    it('fills .optional(default) when the key is MISSING entirely', () => {
      const guard = new ObjectGuardian({
        name: new StringGuardian(),
        status: new StringGuardian().optional('pending'),
        count: new NumberGuardian().optional(() => 7),
      });
      const result = guard.parse({ name: 'ada' });
      asserts.assertEquals(result.status, 'pending');
      asserts.assertEquals(result.count, 7);
    });

    it('fills .optional(default) for explicit undefined (unchanged)', () => {
      const guard = new ObjectGuardian({
        status: new StringGuardian().optional('pending'),
      });
      asserts.assertEquals(
        guard.parse({ status: undefined }).status,
        'pending',
      );
    });

    it('plain .optional() still DROPS missing keys from output', () => {
      const guard = new ObjectGuardian({
        name: new StringGuardian(),
        email: new StringGuardian().optional(),
      });
      const result = guard.parse({ name: 'ada' });
      asserts.assertEquals('email' in result, false);
    });

    it('supplied values still win over the default', () => {
      const guard = new ObjectGuardian({
        status: new StringGuardian().optional('pending'),
      });
      asserts.assertEquals(guard.parse({ status: 'active' }).status, 'active');
    });

    it('the filled default is validated by the field chain', () => {
      const guard = new ObjectGuardian({
        code: new StringGuardian().minLength(5).optional('abc'),
      });
      asserts.assertThrows(() => guard.parse({}), GuardianError);
    });

    it('strict mode composes: defaults fill, unknown keys still throw', () => {
      const guard = new ObjectGuardian({
        status: new StringGuardian().optional('pending'),
      }).strict();
      asserts.assertEquals(guard.parse({}).status, 'pending');
      asserts.assertThrows(
        () => guard.parse({ ghost: 1 }),
        GuardianError,
      );
    });
  });

  describe('Key validations', () => {
    describe('hasKeys validation', () => {
      it('should pass when all required keys are present', () => {
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

      it(
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

      it('should fail when required keys are missing', () => {
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

      it('should use custom error message', () => {
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

    describe('forbiddenKeys validation', () => {
      it('should pass when no forbidden keys are present', () => {
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

      // NOTE: `forbiddenKeys` runs as a refinement after schema
      // validation. Under the default `strip` mode, extra keys are
      // dropped *before* the refinement sees them, so the check is
      // a no-op. Combine with `.passthrough()` (or use `.strict()`,
      // which throws first) for forbiddenKeys to be meaningful.
      it('should fail when forbidden keys are present (passthrough)', () => {
        const guard = new ObjectGuardian({
          id: new NumberGuardian(),
          name: new StringGuardian(),
        }).passthrough().forbiddenKeys(['password', 'secret']);

        asserts.assertThrows(
          () => guard.parse({ id: 1, name: 'John', password: 'secret123' }),
          GuardianError,
          'Object must not contain forbidden keys: password, secret',
        );
      });

      it('should fail when any forbidden key is present (passthrough)', () => {
        const guard = new ObjectGuardian({
          id: new NumberGuardian(),
          name: new StringGuardian(),
        }).passthrough().forbiddenKeys(['password', 'secret', 'private']);

        asserts.assertThrows(
          () => guard.parse({ id: 1, name: 'John', private: 'data' }),
          GuardianError,
          'Object must not contain forbidden keys: password, secret, private',
        );
      });

      it('should use custom error message (passthrough)', () => {
        const guard = new ObjectGuardian({
          id: new NumberGuardian(),
          name: new StringGuardian(),
        }).passthrough().forbiddenKeys(
          ['password'],
          'Security: Password field not allowed',
        );

        asserts.assertThrows(
          () => guard.parse({ id: 1, name: 'John', password: 'secret' }),
          GuardianError,
          'Security: Password field not allowed',
        );
      });

      it('strip mode silently drops keys before forbiddenKeys runs', () => {
        // Default strip mode + forbiddenKeys = no-op for unknown keys.
        // Documenting the interaction so this isn't a future surprise.
        const guard = new ObjectGuardian({
          id: new NumberGuardian(),
          name: new StringGuardian(),
        }).forbiddenKeys(['password']);

        const result = guard.parse({
          id: 1,
          name: 'John',
          password: 'secret',
        });
        asserts.assertEquals(result.id, 1);
        asserts.assertEquals(result.name, 'John');
        asserts.assertEquals((result as any).password, undefined);
      });
    });

    it('chaining key validations', () => {
      const guard = new ObjectGuardian({
        id: new NumberGuardian().optional(),
        name: new StringGuardian().optional(),
        email: new StringGuardian().optional(),
      })
        .passthrough() // keep unknown keys so forbiddenKeys can inspect them
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

  describe('Error handling', () => {
    it('should reject non-objects', () => {
      const guard = new ObjectGuardian({});

      asserts.assertThrows(() => guard.parse('not an object'), GuardianError);
      asserts.assertThrows(() => guard.parse(123), GuardianError);
      asserts.assertThrows(() => guard.parse(null), GuardianError);
      asserts.assertThrows(() => guard.parse([]), GuardianError);
    });
  });

  describe('SafeParse functionality', () => {
    it('should return success result for valid data', () => {
      const guard = new ObjectGuardian({
        name: new StringGuardian(),
        age: new NumberGuardian().optional(),
      });

      const [error, data] = guard.safeParse({ name: 'John', age: 30 });
      asserts.assertEquals(error, null);
      asserts.assertEquals(data?.name, 'John');
      asserts.assertEquals(data?.age, 30);
    });

    it('should return error result for invalid data', () => {
      const guard = new ObjectGuardian({
        name: new StringGuardian(),
        age: new NumberGuardian(),
      });

      const [error, data] = guard.safeParse({ name: 'John' });
      asserts.assertEquals(data, undefined);
      asserts.assertEquals(error instanceof GuardianError, true);
    });
  });

  describe('Refine functionality', () => {
    it('should validate password confirmation', () => {
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

    it('should validate conditional requirements', () => {
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

    it('should support multiple refinements with superRefine', () => {
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

    it('should handle async refinements', async () => {
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
          error.message.includes(
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

    it('should reject async refinements in sync parsing', () => {
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

  describe('partial() method', () => {
    it('should make all properties optional', () => {
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

    it('should work with partial schema from strict mode', () => {
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

  describe('required() method', () => {
    it('should make all properties required', () => {
      const optionalSchema = new ObjectGuardian({
        id: new NumberGuardian().optional(),
        name: new StringGuardian().optional(),
        email: new StringGuardian().optional(),
      });

      const requiredSchema = optionalSchema.required();

      // Should accept all properties when provided
      const result = requiredSchema.parse({
        id: 1,
        name: 'John',
        email: 'john@example.com',
      });
      asserts.assertEquals(result.id, 1);
      asserts.assertEquals(result.name, 'John');
      asserts.assertEquals(result.email, 'john@example.com');

      // Should now reject missing properties since they're required
      asserts.assertThrows(
        () => requiredSchema.parse({ id: 1 }),
        GuardianError,
        'Object validation failed',
      );
    });
  });

  describe('property() method', () => {
    it('should add a new property to schema', () => {
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

    it('should require the new property by default', () => {
      const baseSchema = new ObjectGuardian({
        id: new NumberGuardian(),
      });

      const extendedSchema = baseSchema.property('name', new StringGuardian());

      // Should accept with the new property
      const result = extendedSchema.parse({ id: 1, name: 'John' });
      asserts.assertEquals(result.id, 1);
      asserts.assertEquals(result.name, 'John');

      // Should reject without the new required property
      asserts.assertThrows(
        () => extendedSchema.parse({ id: 1 }),
        GuardianError,
        'Object validation failed',
      );
    });

    it('should allow optional property when guard has optional', () => {
      const baseSchema = new ObjectGuardian({
        id: new NumberGuardian(),
      });

      const extendedSchema = baseSchema.property(
        'name',
        new StringGuardian().optional(),
      );

      // Should accept with the property
      const result = extendedSchema.parse({ id: 1, name: 'John' });
      asserts.assertEquals(result.id, 1);
      asserts.assertEquals(result.name, 'John');

      // Should also work without the optional property
      const result2 = extendedSchema.parse({ id: 1 });
      asserts.assertEquals(result2.id, 1);
    });
  });

  describe('clone() method', () => {
    it('should clone with schema and mode', () => {
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

  describe('transform() method', () => {
    it('should transform validated object', () => {
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

    it('should chain transformations', () => {
      const schema = new ObjectGuardian({
        value: new NumberGuardian(),
      })
        .transform((data) => ({ doubled: data.value * 2 }))
        .transform((data) => ({ tripled: data.doubled * 1.5 }));

      const result = schema.parse({ value: 10 });
      asserts.assertEquals(result.tripled, 30);
    });

    it('transform() preserves the catchall guardian', () => {
      // Regression: transform() copied __mode but not __catchallGuard,
      // leaving the result in catchall mode with no guard — so schema
      // introspection emitted `additionalProperties: false` and any
      // later re-chaining silently dropped the catchall contract.
      const guard = new ObjectGuardian({
        v: new NumberGuardian(),
      })
        .catchall(new StringGuardian())
        .transform((data) => ({ ...data, tag: 'x' }));

      const schema = guard.toOpenAPI();
      const additional = schema.additionalProperties as Record<string, unknown>;
      // The catchall's own schema survives, not `false`.
      asserts.assertEquals(additional.type, 'string');
    });

    it('should properly infer transformed type with GuardianInfer', () => {
      // Test that GuardianInfer correctly infers the transformed type
      const transformedSchema = Guardian.object({
        firstName: Guardian.string(),
        lastName: Guardian.string(),
      }).process((obj) => ({
        fullName: `${obj.firstName} ${obj.lastName}`,
        original: obj,
      }));

      type TransformedType = GuardianInfer<typeof transformedSchema>;

      // Verify runtime behavior matches types
      const result = transformedSchema.parse({
        firstName: 'Jane',
        lastName: 'Smith',
      });

      asserts.assertEquals(result.fullName, 'Jane Smith');
      asserts.assertEquals(result.original.firstName, 'Jane');
      asserts.assertEquals(result.original.lastName, 'Smith');

      // Type assertion to verify compile-time type correctness
      const _typeCheck: TransformedType = result;
      asserts.assertEquals(_typeCheck.fullName, 'Jane Smith');
    });

    it('should properly infer type when adding properties', () => {
      const addPropsSchema = Guardian.object({
        x: Guardian.number(),
        y: Guardian.number(),
      }).process((obj) => ({
        ...obj,
        sum: obj.x + obj.y,
        product: obj.x * obj.y,
      }));

      type AddPropsType = GuardianInfer<typeof addPropsSchema>;

      const result = addPropsSchema.parse({ x: 3, y: 4 });
      asserts.assertEquals(result.x, 3);
      asserts.assertEquals(result.y, 4);
      asserts.assertEquals(result.sum, 7);
      asserts.assertEquals(result.product, 12);

      // Type assertion to verify compile-time correctness
      const _typeCheck: AddPropsType = result;
      asserts.assertEquals(_typeCheck.sum, 7);
    });
  });

  describe('Error handling edge cases', () => {
    it('should handle validation errors in properties', () => {
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

    it('should preserve error context in nested objects', () => {
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

    it('should handle refinement errors with path', () => {
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
          error.message,
          'Passwords do not match',
        );
      }
    });

    it('should handle unexpected errors during refinement', () => {
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
          error.message.includes(
            'Refinement validation failed',
          ),
        );
      }
    });

    it(
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
            error.message.includes(
              'Refinement validation failed',
            ),
          );
        }
      },
    );
  });

  describe('SafeParse with refinements', () => {
    it('should return error for failed refinement', () => {
      const schema = new ObjectGuardian({
        age: new NumberGuardian(),
      }).refine((data) => data.age >= 18, 'Must be 18 or older');

      const [error, data] = schema.safeParse({ age: 16 });
      asserts.assertInstanceOf(error, GuardianError);
      asserts.assertEquals(data, undefined);
      asserts.assert(error.message.includes('Must be 18 or older'));
    });

    it('should return data for successful refinement', () => {
      const schema = new ObjectGuardian({
        age: new NumberGuardian(),
      }).refine((data) => data.age >= 18, 'Must be 18 or older');

      const [error, data] = schema.safeParse({ age: 20 });
      asserts.assertEquals(error, null);
      asserts.assertEquals(data?.age, 20);
    });
  });

  describe('Immutable mode behavior', () => {
    it('should create new instance when cloning', () => {
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
      const _refinedSchema = baseSchema.refine(
        (data) => data.value > 0,
        'Must be positive',
      );

      // Original and clone should not be affected
      const result3 = clonedSchema.parse({ value: -5 });
      asserts.assertEquals(result3.value, -5);
    });
  });

  describe('Complex chaining scenarios', () => {
    it('should chain multiple operations', () => {
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

  // ============================================================================
  // COMPREHENSIVE EDGE CASE TESTS - Added for Production Readiness
  // ============================================================================

  describe('Validation Mode Edge Cases', () => {
    it('strict mode should reject extra properties even with pick', () => {
      const schema = new ObjectGuardian({
        id: new NumberGuardian(),
        name: new StringGuardian(),
        email: new StringGuardian(),
      }).pick('id', 'name').strict();

      asserts.assertThrows(
        () => schema.parse({ id: 1, name: 'John', extra: 'value' }),
        GuardianError,
      );
    });

    it('strict mode should work after omit', () => {
      const schema = new ObjectGuardian({
        id: new NumberGuardian(),
        name: new StringGuardian(),
        email: new StringGuardian(),
      }).omit('email').strict();

      asserts.assertThrows(
        () => schema.parse({ id: 1, name: 'John', other: 'value' }),
        GuardianError,
      );
    });

    it('strip mode should work after partial', () => {
      const schema = new ObjectGuardian({
        name: new StringGuardian(),
        age: new NumberGuardian(),
      }).partial().strip();

      const result = schema.parse({ name: 'John', extra: 'removed' });
      asserts.assertEquals(result.name, 'John');
      asserts.assertEquals((result as any).extra, undefined);
    });

    it('passthrough mode should preserve extra properties after pick', () => {
      // Default is strip; opt into passthrough() to preserve unknowns.
      const schema = new ObjectGuardian({
        id: new NumberGuardian(),
        name: new StringGuardian(),
        email: new StringGuardian(),
      }).pick('id', 'name').passthrough();

      const result = schema.parse({ id: 1, name: 'John', extra: 'kept' });
      asserts.assertEquals(result.id, 1);
      asserts.assertEquals(result.name, 'John');
      asserts.assertEquals((result as any).extra, 'kept');
    });

    it('mode should be preserved through clone', () => {
      const strictSchema = new ObjectGuardian({
        id: new NumberGuardian(),
      }).strict();

      const cloned = strictSchema.clone();

      asserts.assertThrows(
        () => cloned.parse({ id: 1, extra: 'value' }),
        GuardianError,
      );
    });

    it('deriving mode variants leaves the source mode untouched', () => {
      // Base starts as the new default (strip). Branches go to other
      // modes via passthrough()/strict(); base must stay strip.
      const base = new ObjectGuardian({
        id: new NumberGuardian(),
      });

      const strict = base.strict();
      const passthrough = base.passthrough();

      // base (strip, the default) should silently drop extras.
      const result1 = base.parse({ id: 1, extra: 'dropped' });
      asserts.assertEquals((result1 as any).extra, undefined);

      // strict should reject extras.
      asserts.assertThrows(
        () => strict.parse({ id: 1, extra: 'rejected' }),
        GuardianError,
      );

      // passthrough should keep extras.
      const result2 = passthrough.parse({ id: 1, extra: 'kept' });
      asserts.assertEquals((result2 as any).extra, 'kept');
    });
  });

  describe('Clone and Schema Manipulation Combinations', () => {
    it('clone().omit() should validate correctly', () => {
      const original = new ObjectGuardian({
        id: new NumberGuardian(),
        name: new StringGuardian(),
        email: new StringGuardian(),
      }).strict();

      const modified = original.clone().omit('email');

      // Modified should work without email
      const result = modified.parse({ id: 1, name: 'John' });
      asserts.assertEquals(result.id, 1);
      asserts.assertEquals(result.name, 'John');

      // Modified should reject extra properties (strict mode preserved)
      asserts.assertThrows(
        () => modified.parse({ id: 1, name: 'John', extra: 'value' }),
        GuardianError,
      );

      // Original should still require email
      asserts.assertThrows(
        () => original.parse({ id: 1, name: 'John' }),
        GuardianError,
      );
    });

    it('clone().pick() should validate correctly', () => {
      const original = new ObjectGuardian({
        id: new NumberGuardian(),
        name: new StringGuardian(),
        email: new StringGuardian(),
        password: new StringGuardian(),
      });

      const picked = original.clone().pick('id', 'name');

      const result = picked.parse({ id: 1, name: 'John' });
      asserts.assertEquals(result.id, 1);
      asserts.assertEquals(result.name, 'John');
    });

    it('clone().partial() should not mutate original', () => {
      const original = new ObjectGuardian({
        id: new NumberGuardian(),
        name: new StringGuardian(),
      });

      const partial = original.clone().partial();

      // Partial should accept empty object
      const result1 = partial.parse({});
      asserts.assertEquals(result1, {});

      // Original should still require fields
      asserts.assertThrows(
        () => original.parse({}),
        GuardianError,
      );
    });

    it('clone().required() should make optional fields required', () => {
      const original = new ObjectGuardian({
        id: new NumberGuardian().optional(),
        name: new StringGuardian().optional(),
      });

      const required = original.clone().required();

      // Required should reject missing fields
      asserts.assertThrows(
        () => required.parse({}),
        GuardianError,
      );

      // Original should still accept empty
      const result = original.parse({}) as any;
      asserts.assertEquals(Object.keys(result).length, 0);
    });

    it('clone().extend() should add properties independently', () => {
      const base = new ObjectGuardian({
        id: new NumberGuardian(),
      });

      const extended1 = base.clone().extend({ name: new StringGuardian() });
      const extended2 = base.clone().extend({ email: new StringGuardian() });

      // extended1 should only have id and name
      const result1 = extended1.parse({ id: 1, name: 'John' });
      asserts.assertEquals(result1.id, 1);
      asserts.assertEquals(result1.name, 'John');

      // extended2 should only have id and email
      const result2 = extended2.parse({ id: 1, email: 'test@test.com' });
      asserts.assertEquals(result2.id, 1);
      asserts.assertEquals(result2.email, 'test@test.com');
    });

    it('pick() after omit() should work correctly', () => {
      const schema = new ObjectGuardian({
        id: new NumberGuardian(),
        name: new StringGuardian(),
        email: new StringGuardian(),
        password: new StringGuardian(),
        secret: new StringGuardian(),
      }).omit('password', 'secret').pick('id', 'name');

      const result = schema.parse({ id: 1, name: 'John' });
      asserts.assertEquals(result.id, 1);
      asserts.assertEquals(result.name, 'John');
    });

    it('omit() after pick() should work correctly', () => {
      const schema = new ObjectGuardian({
        id: new NumberGuardian(),
        name: new StringGuardian(),
        email: new StringGuardian(),
        password: new StringGuardian(),
      }).pick('id', 'name', 'email').omit('email');

      const result = schema.parse({ id: 1, name: 'John' });
      asserts.assertEquals(result.id, 1);
      asserts.assertEquals(result.name, 'John');
    });

    it('partial() after pick() should make picked fields optional', () => {
      const schema = new ObjectGuardian({
        id: new NumberGuardian(),
        name: new StringGuardian(),
        email: new StringGuardian(),
      }).pick('id', 'name').partial();

      const result = schema.parse({});
      asserts.assertEquals(result, {});

      const result2 = schema.parse({ id: 1 });
      asserts.assertEquals(result2.id, 1);
    });

    it('required() after partial() should make fields required again', () => {
      const schema = new ObjectGuardian({
        id: new NumberGuardian(),
        name: new StringGuardian(),
      }).partial().required();

      asserts.assertThrows(
        () => schema.parse({}),
        GuardianError,
      );
    });
  });

  describe('Chain immutability — mode + refine', () => {
    it('strict() returns a fresh instance and leaves the source as strip', () => {
      const schema = new ObjectGuardian({
        id: new NumberGuardian(),
      });

      const strict = schema.strict();

      // Different instances — chain methods never mutate the source.
      asserts.assertNotStrictEquals(schema, strict);

      // Original stays in strip mode (extras silently dropped).
      const stripped = schema.parse({ id: 1, extra: 'dropped' }) as Record<
        string,
        unknown
      >;
      asserts.assertEquals(stripped.id, 1);
      asserts.assertEquals(stripped.extra, undefined);

      // Strict instance rejects the extra.
      asserts.assertThrows(
        () => strict.parse({ id: 1, extra: 'value' }),
        GuardianError,
      );
    });

    it('passthrough is preserved on the source after deriving a strict variant', () => {
      const schema = new ObjectGuardian({
        id: new NumberGuardian(),
      }).passthrough();

      const strict = schema.strict();

      asserts.assertNotStrictEquals(schema, strict);

      // Original still in passthrough mode — extras flow through.
      const result = schema.parse({ id: 1, extra: 'kept' });
      asserts.assertEquals((result as any).extra, 'kept');
    });

    it('refine() returns a fresh instance and leaves the source unrefined', () => {
      const schema = new ObjectGuardian({
        value: new NumberGuardian(),
      });

      const refined = schema.refine(
        (data) => data.value > 0,
        'Must be positive',
      );

      asserts.assertNotStrictEquals(schema, refined);

      // Original accepts negative (no refinement applied).
      const result = schema.parse({ value: -5 });
      asserts.assertEquals(result.value, -5);

      // Refined rejects negative.
      asserts.assertThrows(
        () => refined.parse({ value: -5 }),
        GuardianError,
      );
    });

    it('strip() returns a fresh instance distinct from the source', () => {
      const schema = new ObjectGuardian({
        id: new NumberGuardian(),
      }).passthrough();

      const stripped = schema.strip();

      asserts.assertNotStrictEquals(schema, stripped);
    });
  });

  describe('Transform Edge Cases', () => {
    it('transform should work with pick', () => {
      const schema = new ObjectGuardian({
        firstName: new StringGuardian(),
        lastName: new StringGuardian(),
        age: new NumberGuardian(),
      }).pick('firstName', 'lastName').transform((data) => ({
        fullName: `${data.firstName} ${data.lastName}`,
      }));

      const result = schema.parse({ firstName: 'John', lastName: 'Doe' });
      asserts.assertEquals(result.fullName, 'John Doe');
    });

    it('transform should work with omit', () => {
      const schema = new ObjectGuardian({
        id: new NumberGuardian(),
        name: new StringGuardian(),
        password: new StringGuardian(),
      }).omit('password').transform((data) => ({
        userId: `USER_${data.id}`,
        displayName: data.name.toUpperCase(),
      }));

      const result = schema.parse({ id: 123, name: 'john' });
      asserts.assertEquals(result.userId, 'USER_123');
      asserts.assertEquals(result.displayName, 'JOHN');
    });

    it('transform should work with partial', () => {
      const schema = new ObjectGuardian({
        value: new NumberGuardian(),
      }).partial().transform((data) => ({
        hasValue: data.value !== undefined,
        doubled: data.value ? data.value * 2 : 0,
      }));

      const result1 = schema.parse({});
      asserts.assertEquals(result1.hasValue, false);
      asserts.assertEquals(result1.doubled, 0);

      const result2 = schema.parse({ value: 10 });
      asserts.assertEquals(result2.hasValue, true);
      asserts.assertEquals(result2.doubled, 20);
    });

    it('multiple transforms should chain correctly', () => {
      const schema = new ObjectGuardian({
        value: new NumberGuardian(),
      })
        .transform((data) => ({ doubled: data.value * 2 }))
        .transform((data) => ({ quadrupled: data.doubled * 2 }))
        .transform((data) => ({ octupled: data.quadrupled * 2 }));

      const result = schema.parse({ value: 5 });
      asserts.assertEquals(result.octupled, 40);
    });

    it('transform should happen before refinements', () => {
      const schema = new ObjectGuardian({
        value: new StringGuardian(),
      })
        .transform((data) => ({ numeric: Number.parseInt(data.value) }))
        .refine((data) => data.numeric > 0, 'Must be positive');

      const result = schema.parse({ value: '10' });
      asserts.assertEquals(result.numeric, 10);

      asserts.assertThrows(
        () => schema.parse({ value: '-5' }),
        GuardianError,
        'Must be positive',
      );
    });
  });

  describe('Refinement Edge Cases', () => {
    it('superRefine accumulates ALL failures into one aggregate error', () => {
      // `.refine()` chains short-circuit on first failure (matching
      // declaration-order semantics). `.superRefine([...])` is the
      // accumulating variant — it runs every check before throwing
      // and surfaces all failures in one error.
      const schema = new ObjectGuardian({
        value: new NumberGuardian(),
      }).superRefine([
        {
          validator: (d) => d.value > 0,
          message: 'Must be positive',
          path: 'value',
        },
        {
          validator: (d) => d.value % 2 === 0,
          message: 'Must be even',
          path: 'value',
        },
      ]);

      try {
        // -5 fails BOTH refinements (negative AND odd).
        schema.parse({ value: -5 });
        asserts.fail('expected throw');
      } catch (err) {
        asserts.assertInstanceOf(err, GuardianError);
        // Both per-refinement messages survive in the aggregate.
        asserts.assertStringIncludes(err.message, 'Must be positive');
        asserts.assertStringIncludes(err.message, 'Must be even');
        // Causes are walkable for tooling that wants per-path detail.
        asserts.assertEquals(err.causeSize() > 0, true);
      }
    });

    it('superRefine single failure with a path yields it via leafErrors', () => {
      // Regression: the single-failure branch used to do
      // `only.error.addCause(path, only.error)` (self-cause), so
      // `leafErrors()` hit the cycle guard and yielded NOTHING.
      const schema = new ObjectGuardian({
        value: new NumberGuardian(),
      }).superRefine([
        {
          validator: (d) => d.value > 0,
          message: 'Must be positive',
          path: 'value',
        },
      ]);

      try {
        schema.parse({ value: -5 });
        asserts.fail('expected throw');
      } catch (err) {
        asserts.assertInstanceOf(err, GuardianError);
        const leaves = [...err.leafErrors()];
        // Exactly the failing field surfaces, with its declared path.
        asserts.assertEquals(leaves.length, 1);
        asserts.assertEquals(leaves[0]!.path, ['value']);
        asserts.assertEquals(leaves[0]!.error.message, 'Must be positive');
        // The failure is a DISTINCT child, not the parent itself.
        asserts.assertNotStrictEquals(leaves[0]!.error, err);
      }
    });

    it('chained .refine() short-circuits on first failure (declaration order)', () => {
      // Under the new model, refinements run at their declaration
      // position. A failure throws immediately, so subsequent
      // refinements don't run.
      const schema = new ObjectGuardian({
        value: new NumberGuardian(),
      })
        .refine((d) => d.value > 0, 'Must be positive', 'value')
        .refine((d) => d.value % 2 === 0, 'Must be even', 'value');

      asserts.assertThrows(
        () => schema.parse({ value: -5 }),
        GuardianError,
        'Must be positive', // only the first failure surfaces
      );
    });

    it('refinement runs at declaration position (BEFORE transform if declared first)', () => {
      // The classic "password confirmation" pattern, fixed: the
      // refine() runs first because it's declared first — even
      // though the transform would otherwise consume the confirm
      // field.
      const schema = new ObjectGuardian({
        password: new StringGuardian(),
        confirm: new StringGuardian(),
      })
        .refine(
          (d) => d.password === d.confirm,
          'passwords do not match',
          'confirm',
        )
        .transform((d) => ({ password: d.password, hashed: true }));

      // Matching passwords → transform fires, output is the new shape.
      const ok = schema.parse({ password: 'abc', confirm: 'abc' });
      asserts.assertEquals(ok.password, 'abc');
      asserts.assertEquals((ok as Record<string, unknown>).hashed, true);

      // Mismatched → refinement throws BEFORE transform sees the data.
      asserts.assertThrows(
        () => schema.parse({ password: 'abc', confirm: 'xyz' }),
        GuardianError,
        'passwords do not match',
      );
    });

    it('multiple refinements should all execute', () => {
      const schema = new ObjectGuardian({
        value: new NumberGuardian(),
      })
        .refine((data) => data.value > 0, 'Must be positive')
        .refine((data) => data.value < 100, 'Must be less than 100')
        .refine((data) => data.value % 2 === 0, 'Must be even');

      const result = schema.parse({ value: 50 });
      asserts.assertEquals(result.value, 50);

      asserts.assertThrows(
        () => schema.parse({ value: -5 }),
        GuardianError,
        'Must be positive',
      );

      asserts.assertThrows(
        () => schema.parse({ value: 150 }),
        GuardianError,
        'Must be less than 100',
      );

      asserts.assertThrows(
        () => schema.parse({ value: 51 }),
        GuardianError,
        'Must be even',
      );
    });

    it('refinements should work after pick', () => {
      const schema = new ObjectGuardian({
        id: new NumberGuardian(),
        name: new StringGuardian(),
        age: new NumberGuardian(),
      })
        .pick('id', 'age')
        .refine((data) => data.age >= 18, 'Must be adult');

      const result = schema.parse({ id: 1, age: 25 });
      asserts.assertEquals(result.id, 1);
      asserts.assertEquals(result.age, 25);

      asserts.assertThrows(
        () => schema.parse({ id: 1, age: 16 }),
        GuardianError,
        'Must be adult',
      );
    });

    it('refinements should work after omit', () => {
      const schema = new ObjectGuardian({
        id: new NumberGuardian(),
        name: new StringGuardian(),
        password: new StringGuardian(),
      })
        .omit('password')
        .refine((data) => data.name.length > 3, 'Name too short');

      asserts.assertThrows(
        () => schema.parse({ id: 1, name: 'Jo' }),
        GuardianError,
        'Name too short',
      );
    });

    it('refinements should work after partial', () => {
      const schema = new ObjectGuardian({
        value: new NumberGuardian(),
      })
        .partial()
        .refine((data) => {
          if (data.value !== undefined) {
            return data.value > 0;
          }
          return true;
        }, 'If provided, value must be positive');

      const result1 = schema.parse({});
      asserts.assertEquals(result1, {});

      const result2 = schema.parse({ value: 10 });
      asserts.assertEquals(result2.value, 10);

      asserts.assertThrows(
        () => schema.parse({ value: -5 }),
        GuardianError,
        'If provided, value must be positive',
      );
    });

    it('pick/omit refuse to silently drop a chained refinement', () => {
      // A derived guardian is rebuilt from the schema and cannot carry
      // `_composedTransform`, so dropping the refinement would quietly
      // weaken validation. Refuse loudly instead (round-4 finding 5).
      const original = new ObjectGuardian({
        id: new NumberGuardian(),
        value: new NumberGuardian(),
      }).refine((data) => data.value > 0, 'Must be positive');

      asserts.assertThrows(
        () => original.pick('id'),
        GuardianError,
        'refinements or transforms',
      );
      asserts.assertThrows(
        () => original.omit('value'),
        GuardianError,
        'refinements or transforms',
      );

      // Derive first, then refine — the supported order.
      const picked = new ObjectGuardian({
        id: new NumberGuardian(),
        value: new NumberGuardian(),
      }).pick('id');
      asserts.assertEquals(picked.parse({ id: 1 }).id, 1);
    });

    it('async refinements should work in parseAsync', async () => {
      const schema = new ObjectGuardian({
        value: new NumberGuardian(),
      }).refine(
        async (data) => {
          await new Promise((resolve) => setTimeout(resolve, 1));
          return data.value > 0;
        },
        'Must be positive (async)',
      );

      const result = await schema.parseAsync({ value: 10 });
      asserts.assertEquals(result.value, 10);

      let caught = false;
      try {
        await schema.parseAsync({ value: -5 });
      } catch (error) {
        caught = true;
        asserts.assertInstanceOf(error, GuardianError);
      }
      asserts.assert(caught, 'Should have thrown error');
    });

    it('mixed sync and async refinements should work', async () => {
      const schema = new ObjectGuardian({
        value: new NumberGuardian(),
      })
        .refine((data) => data.value > 0, 'Must be positive')
        .refine(
          async (data) => {
            await new Promise((resolve) => setTimeout(resolve, 1));
            return data.value < 100;
          },
          'Must be less than 100',
        );

      const result = await schema.parseAsync({ value: 50 });
      asserts.assertEquals(result.value, 50);

      let caught1 = false;
      try {
        await schema.parseAsync({ value: -5 });
      } catch (error) {
        caught1 = true;
        asserts.assertInstanceOf(error, GuardianError);
      }
      asserts.assert(caught1);

      let caught2 = false;
      try {
        await schema.parseAsync({ value: 150 });
      } catch (error) {
        caught2 = true;
        asserts.assertInstanceOf(error, GuardianError);
      }
      asserts.assert(caught2);
    });
  });

  describe('Optional and Required Field Combinations', () => {
    it('should handle mix of required and optional fields', () => {
      const schema = new ObjectGuardian({
        required1: new StringGuardian(),
        required2: new NumberGuardian(),
        optional1: new StringGuardian().optional(),
        optional2: new NumberGuardian().optional(),
      });

      // All fields
      const result1 = schema.parse({
        required1: 'test',
        required2: 123,
        optional1: 'opt',
        optional2: 456,
      });
      asserts.assertEquals(result1.required1, 'test');
      asserts.assertEquals(result1.required2, 123);
      asserts.assertEquals(result1.optional1, 'opt');
      asserts.assertEquals(result1.optional2, 456);

      // Only required fields
      const result2 = schema.parse({ required1: 'test', required2: 123 });
      asserts.assertEquals(result2.required1, 'test');
      asserts.assertEquals(result2.required2, 123);

      // Missing required field
      asserts.assertThrows(
        () => schema.parse({ required1: 'test' }),
        GuardianError,
      );
    });

    it('should handle undefined vs missing for optional fields', () => {
      const schema = new ObjectGuardian({
        id: new NumberGuardian(),
        name: new StringGuardian().optional(),
      });

      // Missing optional field
      const result1 = schema.parse({ id: 1 });
      asserts.assertEquals(result1.id, 1);
      asserts.assertEquals(result1.name, undefined);

      // Explicitly undefined optional field
      const result2 = schema.parse({ id: 1, name: undefined });
      asserts.assertEquals(result2.id, 1);
      asserts.assertEquals(result2.name, undefined);

      // Provided optional field
      const result3 = schema.parse({ id: 1, name: 'John' });
      asserts.assertEquals(result3.id, 1);
      asserts.assertEquals(result3.name, 'John');
    });

    it('partial() should preserve explicit undefined', () => {
      const schema = new ObjectGuardian({
        value: new NumberGuardian(),
      }).partial();

      const result = schema.parse({ value: undefined });
      asserts.assertEquals(result.value, undefined);
    });
  });

  describe('Nested Object Validation', () => {
    it('should validate nested objects', () => {
      const schema = new ObjectGuardian({
        user: new ObjectGuardian({
          name: new StringGuardian(),
          age: new NumberGuardian(),
        }),
        meta: new ObjectGuardian({
          created: new StringGuardian(),
        }),
      });

      const result = schema.parse({
        user: { name: 'John', age: 30 },
        meta: { created: '2025-01-01' },
      });

      asserts.assertEquals(result.user.name, 'John');
      asserts.assertEquals(result.user.age, 30);
      asserts.assertEquals(result.meta.created, '2025-01-01');
    });

    it('should validate deeply nested objects', () => {
      const schema = new ObjectGuardian({
        level1: new ObjectGuardian({
          level2: new ObjectGuardian({
            level3: new ObjectGuardian({
              value: new StringGuardian(),
            }),
          }),
        }),
      });

      const result = schema.parse({
        level1: {
          level2: {
            level3: {
              value: 'deep',
            },
          },
        },
      });

      asserts.assertEquals((result.level1 as any).level2.level3.value, 'deep');
    });

    it('should handle errors in nested objects', () => {
      const schema = new ObjectGuardian({
        user: new ObjectGuardian({
          name: new StringGuardian(),
          age: new NumberGuardian(),
        }),
      });

      asserts.assertThrows(
        () => schema.parse({ user: { name: 'John' } }),
        GuardianError,
      );
    });

    it('should handle nested objects with strict mode', () => {
      const schema = new ObjectGuardian({
        user: new ObjectGuardian({
          name: new StringGuardian(),
        }).strict(),
      });

      asserts.assertThrows(
        () => schema.parse({ user: { name: 'John', extra: 'value' } }),
        GuardianError,
      );
    });

    it('should handle nested objects with optional fields', () => {
      const schema = new ObjectGuardian({
        user: new ObjectGuardian({
          name: new StringGuardian(),
          email: new StringGuardian().optional(),
        }),
      });

      const result1 = schema.parse({ user: { name: 'John' } });
      asserts.assertEquals(result1.user.name, 'John');

      const result2 = schema.parse({
        user: { name: 'John', email: 'j@test.com' },
      });
      asserts.assertEquals(result2.user.name, 'John');
      asserts.assertEquals(result2.user.email, 'j@test.com');
    });
  });

  describe('Empty and Edge Values', () => {
    it('should handle empty object with empty schema', () => {
      const schema = new ObjectGuardian({});
      const result = schema.parse({});
      asserts.assertEquals(result, {});
    });

    it('should handle empty object with empty schema in strict mode', () => {
      const schema = new ObjectGuardian({}).strict();
      const result = schema.parse({});
      asserts.assertEquals(result, {});

      // Should reject non-empty object
      asserts.assertThrows(
        () => schema.parse({ extra: 'value' }),
        GuardianError,
      );
    });

    it('should handle large objects', () => {
      const largeSchema: Record<string, NumberGuardian> = {};
      const largeData: Record<string, number> = {};

      for (let i = 0; i < 100; i++) {
        largeSchema[`field${i}`] = new NumberGuardian();
        largeData[`field${i}`] = i;
      }

      const schema = new ObjectGuardian(largeSchema);
      const result = schema.parse(largeData);

      asserts.assertEquals(Object.keys(result).length, 100);
      asserts.assertEquals(result.field50, 50);
    });

    it('should handle special characters in keys', () => {
      const schema = new ObjectGuardian({
        'key-with-dash': new StringGuardian(),
        'key.with.dot': new NumberGuardian(),
        'key with space': new BooleanGuardian(),
        'key$with$dollar': new StringGuardian(),
      });

      const result = schema.parse({
        'key-with-dash': 'test',
        'key.with.dot': 123,
        'key with space': true,
        'key$with$dollar': 'value',
      });

      asserts.assertEquals(result['key-with-dash'], 'test');
      asserts.assertEquals(result['key.with.dot'], 123);
      asserts.assertEquals(result['key with space'], true);
      asserts.assertEquals(result['key$with$dollar'], 'value');
    });

    it('should handle numeric string keys', () => {
      const schema = new ObjectGuardian({
        '0': new StringGuardian(),
        '1': new StringGuardian(),
        '100': new StringGuardian(),
      });

      const result = schema.parse({
        '0': 'zero',
        '1': 'one',
        '100': 'hundred',
      });
      asserts.assertEquals(result['0'], 'zero');
      asserts.assertEquals(result['1'], 'one');
      asserts.assertEquals(result['100'], 'hundred');
    });

    it('should reject null as value for object', () => {
      const schema = new ObjectGuardian({});

      asserts.assertThrows(
        () => schema.parse(null),
        GuardianError,
      );
    });

    it('should reject array as value for object', () => {
      const schema = new ObjectGuardian({});

      asserts.assertThrows(
        () => schema.parse([]),
        GuardianError,
      );
    });

    it('should reject primitives as value for object', () => {
      const schema = new ObjectGuardian({});

      asserts.assertThrows(() => schema.parse('string'), GuardianError);
      asserts.assertThrows(() => schema.parse(123), GuardianError);
      asserts.assertThrows(() => schema.parse(true), GuardianError);
      asserts.assertThrows(() => schema.parse(undefined), GuardianError);
    });
  });

  describe('Schema Method Combinations', () => {
    it('pick -> extend should work', () => {
      const schema = new ObjectGuardian({
        id: new NumberGuardian(),
        name: new StringGuardian(),
        email: new StringGuardian(),
      })
        .pick('id', 'name')
        .extend({ role: new StringGuardian() });

      const result = schema.parse({ id: 1, name: 'John', role: 'admin' });
      asserts.assertEquals(result.id, 1);
      asserts.assertEquals(result.name, 'John');
      asserts.assertEquals(result.role, 'admin');
    });

    it('omit -> extend should work', () => {
      const schema = new ObjectGuardian({
        id: new NumberGuardian(),
        name: new StringGuardian(),
        password: new StringGuardian(),
      })
        .omit('password')
        .extend({ email: new StringGuardian() });

      const result = schema.parse({ id: 1, name: 'John', email: 'j@test.com' });
      asserts.assertEquals(result.id, 1);
      asserts.assertEquals(result.name, 'John');
      asserts.assertEquals(result.email, 'j@test.com');
    });

    it('extend -> pick should work', () => {
      const schema = new ObjectGuardian({
        id: new NumberGuardian(),
      })
        .extend({ name: new StringGuardian(), email: new StringGuardian() })
        .pick('id', 'name');

      const result = schema.parse({ id: 1, name: 'John' });
      asserts.assertEquals(result.id, 1);
      asserts.assertEquals(result.name, 'John');
    });

    it('extend -> omit should work', () => {
      const schema = new ObjectGuardian({
        id: new NumberGuardian(),
      })
        .extend({ name: new StringGuardian(), password: new StringGuardian() })
        .omit('password');

      const result = schema.parse({ id: 1, name: 'John' });
      asserts.assertEquals(result.id, 1);
      asserts.assertEquals(result.name, 'John');
    });

    it('partial -> extend should work', () => {
      const schema = new ObjectGuardian({
        id: new NumberGuardian(),
      })
        .partial()
        .extend({ name: new StringGuardian() });

      const result1 = schema.parse({ name: 'John' });
      asserts.assertEquals(result1.name, 'John');

      const result2 = schema.parse({ id: 1, name: 'John' });
      asserts.assertEquals(result2.id, 1);
      asserts.assertEquals(result2.name, 'John');
    });

    it('extend -> partial should work', () => {
      const schema = new ObjectGuardian({
        id: new NumberGuardian(),
      })
        .extend({ name: new StringGuardian() })
        .partial();

      const result = schema.parse({});
      asserts.assertEquals(result, {});
    });

    it('property -> pick should work', () => {
      const schema = new ObjectGuardian({
        id: new NumberGuardian(),
      })
        .property('name', new StringGuardian())
        .property('email', new StringGuardian())
        .pick('id', 'name');

      const result = schema.parse({ id: 1, name: 'John' });
      asserts.assertEquals(result.id, 1);
      asserts.assertEquals(result.name, 'John');
    });

    it('pick -> property should work', () => {
      const schema = new ObjectGuardian({
        id: new NumberGuardian(),
        name: new StringGuardian(),
        email: new StringGuardian(),
      })
        .pick('id')
        .property('role', new StringGuardian());

      const result = schema.parse({ id: 1, role: 'admin' });
      asserts.assertEquals(result.id, 1);
      asserts.assertEquals(result.role, 'admin');
    });

    it('multiple property() calls should accumulate', () => {
      const schema = new ObjectGuardian({
        id: new NumberGuardian(),
      })
        .property('name', new StringGuardian())
        .property('email', new StringGuardian())
        .property('age', new NumberGuardian());

      const result = schema.parse({
        id: 1,
        name: 'John',
        email: 'j@test.com',
        age: 30,
      });

      asserts.assertEquals(result.id, 1);
      asserts.assertEquals(result.name, 'John');
      asserts.assertEquals(result.email, 'j@test.com');
      asserts.assertEquals(result.age, 30);
    });
  });

  describe('Async parseAsync Edge Cases', () => {
    it('should handle parseAsync with no async refinements', async () => {
      const schema = new ObjectGuardian({
        value: new NumberGuardian(),
      }).refine((data) => data.value > 0, 'Must be positive');

      const result = await schema.parseAsync({ value: 10 });
      asserts.assertEquals(result.value, 10);
    });

    it('should handle parseAsync with transform', async () => {
      const schema = new ObjectGuardian({
        value: new NumberGuardian(),
      }).transform((data) => ({ doubled: data.value * 2 }));

      const result = await schema.parseAsync({ value: 5 });
      asserts.assertEquals(result.doubled, 10);
    });

    it('should handle parseAsync with async transform and refinement', async () => {
      const schema = new ObjectGuardian({
        value: new NumberGuardian(),
      })
        .transform((data) => ({ processed: data.value * 2 }))
        .refine(
          async (data) => {
            await new Promise((resolve) => setTimeout(resolve, 1));
            return data.processed > 0;
          },
          'Processed value must be positive',
        );

      const result = await schema.parseAsync({ value: 5 });
      asserts.assertEquals(result.processed, 10);

      let caught = false;
      try {
        await schema.parseAsync({ value: -5 });
      } catch (error) {
        caught = true;
        asserts.assertInstanceOf(error, GuardianError);
      }
      asserts.assert(caught);
    });
  });

  describe('hasKeys and forbiddenKeys Combinations', () => {
    it('hasKeys should work after pick', () => {
      const schema = new ObjectGuardian({
        id: new NumberGuardian().optional(),
        name: new StringGuardian().optional(),
        email: new StringGuardian().optional(),
      })
        .pick('id', 'name')
        .hasKeys(['id', 'name']);

      const result = schema.parse({ id: 1, name: 'John' });
      asserts.assertEquals(result.id, 1);
      asserts.assertEquals(result.name, 'John');

      asserts.assertThrows(
        () => schema.parse({ id: 1 }),
        GuardianError,
      );
    });

    it('forbiddenKeys should work after omit (passthrough)', () => {
      const schema = new ObjectGuardian({
        id: new NumberGuardian(),
        name: new StringGuardian(),
        password: new StringGuardian(),
      })
        .omit('password')
        .passthrough() // keep unknowns so forbiddenKeys can see them
        .forbiddenKeys(['secret', 'private']);

      const result = schema.parse({ id: 1, name: 'John' });
      asserts.assertEquals(result.id, 1);
      asserts.assertEquals(result.name, 'John');

      asserts.assertThrows(
        () => schema.parse({ id: 1, name: 'John', secret: 'data' }),
        GuardianError,
      );
    });

    it('hasKeys and forbiddenKeys should work together after partial (passthrough)', () => {
      const schema = new ObjectGuardian({
        id: new NumberGuardian(),
        name: new StringGuardian(),
      })
        .partial()
        .passthrough() // keep unknowns so forbiddenKeys can see them
        .hasKeys(['id'])
        .forbiddenKeys(['password']);

      const result = schema.parse({ id: 1 });
      asserts.assertEquals(result.id, 1);

      asserts.assertThrows(
        () => schema.parse({ name: 'John' }),
        GuardianError,
      );

      asserts.assertThrows(
        () => schema.parse({ id: 1, password: 'secret' }),
        GuardianError,
      );
    });
  });

  describe('Error Message Quality', () => {
    it('should provide clear error for wrong type', () => {
      const schema = new ObjectGuardian({});

      try {
        schema.parse('not an object');
        asserts.fail('Should have thrown');
      } catch (error) {
        asserts.assertInstanceOf(error, GuardianError);
        asserts.assert(error.message.includes('object'));
        asserts.assert(error.message.includes('string'));
      }
    });

    it('should provide clear error for strict mode violation', () => {
      const schema = new ObjectGuardian({
        id: new NumberGuardian(),
      }).strict();

      try {
        schema.parse({ id: 1, extra1: 'a', extra2: 'b' });
        asserts.fail('Should have thrown');
      } catch (error) {
        asserts.assertInstanceOf(error, GuardianError);
        asserts.assert(error.message.includes('strict'));
        asserts.assert(
          error.message.includes('extra1') ||
            error.message.includes('properties'),
        );
      }
    });

    it('should provide clear error for missing required field', () => {
      const schema = new ObjectGuardian({
        id: new NumberGuardian(),
        name: new StringGuardian(),
      });

      try {
        schema.parse({ id: 1 });
        asserts.fail('Should have thrown');
      } catch (error) {
        asserts.assertInstanceOf(error, GuardianError);
        asserts.assert(error.message.includes('validation failed'));
      }
    });
  });

  describe('SafeParse Edge Cases', () => {
    it('safeParse should handle strict mode violations', () => {
      const schema = new ObjectGuardian({
        id: new NumberGuardian(),
      }).strict();

      const [error, data] = schema.safeParse({ id: 1, extra: 'value' });
      asserts.assertInstanceOf(error, GuardianError);
      asserts.assertEquals(data, undefined);
    });

    it('safeParse should handle nested errors', () => {
      const schema = new ObjectGuardian({
        user: new ObjectGuardian({
          age: new NumberGuardian(),
        }),
      });

      const [error, data] = schema.safeParse({ user: { age: 'not a number' } });
      asserts.assertInstanceOf(error, GuardianError);
      asserts.assertEquals(data, undefined);
    });

    it('safeParse should work with transforms', () => {
      const schema = new ObjectGuardian({
        value: new NumberGuardian(),
      }).transform((data) => ({ doubled: data.value * 2 }));

      const [error, data] = schema.safeParse({ value: 5 });
      asserts.assertEquals(error, null);
      asserts.assertEquals(data?.doubled, 10);
    });

    it('safeParse should handle transform errors', () => {
      const schema = new ObjectGuardian({
        value: new NumberGuardian(),
      }).transform((_data) => {
        throw new Error('Transform error');
      });

      const [error, data] = schema.safeParse({ value: 5 });
      asserts.assertInstanceOf(error, Error);
      asserts.assertEquals(data, undefined);
    });
  });

  describe('Chain immutability comprehensive tests', () => {
    it('every modification method returns a fresh instance', () => {
      const base = new ObjectGuardian({
        id: new NumberGuardian(),
        name: new StringGuardian(),
      });

      const strict = base.strict();
      const strip = base.strip();
      const refined = base.refine((data) => data.id > 0, 'ID must be positive');

      asserts.assertNotStrictEquals(base, strict);
      asserts.assertNotStrictEquals(base, strip);
      asserts.assertNotStrictEquals(base, refined);
      asserts.assertNotStrictEquals(strict, strip);
      asserts.assertNotStrictEquals(strict, refined);
      asserts.assertNotStrictEquals(strip, refined);
    });

    it('schema-manipulation methods produce independent copies', () => {
      const base = new ObjectGuardian({
        id: new NumberGuardian(),
        name: new StringGuardian(),
        email: new StringGuardian(),
      });

      const picked = base.pick('id', 'name');
      const omitted = base.omit('email');
      const partial = base.partial();

      // All should be different instances
      asserts.assertNotStrictEquals(base as any, picked as any);
      asserts.assertNotStrictEquals(base as any, omitted as any);
      asserts.assertNotStrictEquals(base as any, partial as any);

      // Base should still work with all fields
      const baseResult = base.parse({
        id: 1,
        name: 'John',
        email: 'j@test.com',
      });
      asserts.assertEquals(baseResult.email, 'j@test.com');

      // Picked should work without email
      const pickedResult = picked.parse({ id: 1, name: 'John' });
      asserts.assertEquals(pickedResult.id, 1);

      // Omitted should work without email
      const omittedResult = omitted.parse({ id: 1, name: 'John' });
      asserts.assertEquals(omittedResult.id, 1);

      // Partial should work with empty object
      const partialResult = partial.parse({});
      asserts.assertEquals(partialResult, {});
    });
  });

  describe('merge / deepPartial / keyOf / exclude / renameField', () => {
    it('merge combines two schemas (other wins on key conflict)', () => {
      const A = new ObjectGuardian({
        id: new StringGuardian(),
        name: new StringGuardian(),
      });
      const B = new ObjectGuardian({
        age: new NumberGuardian(),
      });
      const M = A.merge(B);

      const out = M.parse({ id: 'u1', name: 'Ada', age: 36 });
      asserts.assertEquals(out, { id: 'u1', name: 'Ada', age: 36 });
    });

    it('deepPartial recurses through nested ObjectGuardian children', () => {
      const Inner = new ObjectGuardian({ a: new NumberGuardian() });
      const Outer = new ObjectGuardian({
        inner: Inner,
        flag: new StringGuardian(),
      });
      const DP = Outer.deepPartial();

      // Everything optional at every level — empty object parses.
      asserts.assertEquals(DP.parse({}), {});
      // Partial nested also accepted. The type-level recursion
      // through nested guardians isn't surfaced on the output map,
      // but the runtime correctly recurses — assert against an
      // unknown view to bypass the surface-level type narrowing.
      const out1: unknown = DP.parse({ inner: {} as { a: number } });
      asserts.assertEquals(out1, { inner: {} });
      const out2: unknown = DP.parse({ inner: { a: 1 } });
      asserts.assertEquals(out2, { inner: { a: 1 } });
    });

    it('keyOf returns an EnumGuardian over the schema keys', () => {
      const User = new ObjectGuardian({
        id: new StringGuardian(),
        email: new StringGuardian(),
      });
      const KeyOf = User.keyOf();
      asserts.assertEquals(KeyOf.parse('id'), 'id');
      asserts.assertEquals(KeyOf.parse('email'), 'email');
      asserts.assertThrows(() => KeyOf.parse('age'), GuardianError);
    });

    it('exclude strips fields present in the `other` schema', () => {
      const All = new ObjectGuardian({
        id: new StringGuardian(),
        name: new StringGuardian(),
        password: new StringGuardian(),
      });
      const Sensitive = new ObjectGuardian({ password: new StringGuardian() });
      const Safe = All.exclude(Sensitive);
      const out = Safe.parse({ id: 'u1', name: 'Ada' });
      asserts.assertEquals(out, { id: 'u1', name: 'Ada' });
    });

    it('renameField renames the incoming key before validation', () => {
      const Src = new ObjectGuardian({
        firstName: new StringGuardian(),
      });
      const Renamed = Src.renameField('firstName', 'given_name');
      // Input arrives keyed on the ORIGINAL name; output is keyed on the
      // renamed key with the value carried across.
      const out = Renamed.parse({ firstName: 'Ada' }) as Record<
        string,
        unknown
      >;
      asserts.assertEquals(out, { given_name: 'Ada' });
      // The old name is gone from the output.
      asserts.assertEquals(out.firstName, undefined);
    });

    it('renameField passes through an absent optional source key', () => {
      const Src = new ObjectGuardian({
        nickname: new StringGuardian().optional(),
      });
      const Renamed = Src.renameField('nickname', 'handle');
      // Optional `from` left out of the input: nothing to remap, and the
      // optional `to` guard accepts the absence.
      const out = Renamed.parse({}) as Record<string, unknown>;
      asserts.assertEquals(out, {});
      asserts.assertEquals('handle' in out, false);
    });

    it('renameField: the source value wins on a from/to collision', () => {
      const Src = new ObjectGuardian({
        firstName: new StringGuardian(),
      });
      const Renamed = Src.renameField('firstName', 'given_name');
      // Both keys present: the renamed source value lands in `given_name`,
      // replacing the value that already occupied it.
      const out = Renamed.parse({
        firstName: 'Ada',
        given_name: 'Grace',
      }) as Record<string, unknown>;
      asserts.assertEquals(out, { given_name: 'Ada' });
    });

    it('renameField throws when source key is absent from the schema', () => {
      const Src = new ObjectGuardian({ id: new StringGuardian() });
      asserts.assertThrows(() =>
        (Src as ReturnType<typeof Src.renameField>).renameField(
          'missing' as never,
          'whatever',
        )
      );
    });
  });
});
