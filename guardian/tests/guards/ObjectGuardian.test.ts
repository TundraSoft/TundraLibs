import * as asserts from "$asserts";
import {
  BooleanGuardian,
  GuardianError,
  NumberGuardian,
  ObjectGuardian,
  StringGuardian,
} from "../../mod.ts";

Deno.test("guardian.ObjectGuardian", async (t) => {
  await t.step("Creation and basic functionality", async (t) => {
    await t.step("should create an ObjectGuardian with empty schema", () => {
      const guard = new ObjectGuardian({});
      const result = guard.parse({});
      asserts.assertEquals(result, {});
    });

    await t.step("should create an ObjectGuardian with schema", () => {
      const guard = new ObjectGuardian({
        name: new StringGuardian(),
        age: new NumberGuardian(),
      });

      const result = guard.parse({ name: "John", age: 30 });
      asserts.assertEquals(result.name, "John");
      asserts.assertEquals(result.age, 30);
    });

    await t.step("should have default passthrough mode", () => {
      const guard = new ObjectGuardian({
        name: new StringGuardian(),
      });

      const result = guard.parse({ name: "John", extra: "value" });
      asserts.assertEquals(result.name, "John");
      asserts.assertEquals((result as any).extra, "value");
    });
  });

  await t.step("Validation modes", async (t) => {
    await t.step(
      "Passthrough mode (default) - should allow additional properties",
      () => {
        const guard = new ObjectGuardian({
          name: new StringGuardian(),
          age: new NumberGuardian(),
        });

        const input = { name: "John", age: 30, extra: "allowed" };
        const result = guard.parse(input);
        asserts.assertEquals(result.name, "John");
        asserts.assertEquals(result.age, 30);
        asserts.assertEquals((result as any).extra, "allowed");
      },
    );

    await t.step("should validate required properties", () => {
      const guard = new ObjectGuardian({
        name: new StringGuardian(),
        age: new NumberGuardian(),
      });

      asserts.assertThrows(
        () => guard.parse({ name: "John" }),
        GuardianError,
      );
    });

    await t.step("Strict mode - should reject additional properties", () => {
      const guard = new ObjectGuardian({
        name: new StringGuardian(),
        age: new NumberGuardian(),
      }).strict();

      asserts.assertThrows(
        () => guard.parse({ name: "John", age: 30, extra: "not allowed" }),
        GuardianError,
      );
    });

    await t.step(
      "Strict mode - should pass when no additional properties",
      () => {
        const guard = new ObjectGuardian({
          name: new StringGuardian(),
          age: new NumberGuardian(),
        }).strict();

        const result = guard.parse({ name: "John", age: 30 });
        asserts.assertEquals(result.name, "John");
        asserts.assertEquals(result.age, 30);
      },
    );

    await t.step("Strip mode - should remove additional properties", () => {
      const guard = new ObjectGuardian({
        name: new StringGuardian(),
        age: new NumberGuardian(),
      }).strip();

      const result = guard.parse({ name: "John", age: 30, extra: "removed" });
      asserts.assertEquals(result.name, "John");
      asserts.assertEquals(result.age, 30);
      asserts.assertEquals((result as any).extra, undefined);
    });
  });

  await t.step("Schema manipulation", async (t) => {
    await t.step(
      "extend method - should extend schema with new properties",
      () => {
        const baseGuard = new ObjectGuardian({
          name: new StringGuardian(),
        });

        const extendedGuard = baseGuard.extend({
          age: new NumberGuardian(),
          email: new StringGuardian(),
        });

        const result = extendedGuard.parse({
          name: "John",
          age: 30,
          email: "john@example.com",
        });

        asserts.assertEquals(result.name, "John");
        asserts.assertEquals(result.age, 30);
        asserts.assertEquals(result.email, "john@example.com");
      },
    );

    await t.step("pick method - should pick specific properties", () => {
      const fullGuard = new ObjectGuardian({
        id: new NumberGuardian(),
        name: new StringGuardian(),
        email: new StringGuardian(),
        password: new StringGuardian(),
      });

      const publicGuard = fullGuard.pick("id", "name", "email");
      const result = publicGuard.parse({
        id: 1,
        name: "John",
        email: "john@example.com",
      });

      asserts.assertEquals(result.id, 1);
      asserts.assertEquals(result.name, "John");
      asserts.assertEquals(result.email, "john@example.com");
    });

    await t.step("omit method - should omit specific properties", () => {
      const fullGuard = new ObjectGuardian({
        id: new NumberGuardian(),
        name: new StringGuardian(),
        email: new StringGuardian(),
        password: new StringGuardian(),
      });

      const safeGuard = fullGuard.omit("password");
      const result = safeGuard.parse({
        id: 1,
        name: "John",
        email: "john@example.com",
      });

      asserts.assertEquals(result.id, 1);
      asserts.assertEquals(result.name, "John");
      asserts.assertEquals(result.email, "john@example.com");
    });
  });

  await t.step("Key validations", async (t) => {
    await t.step("hasKeys validation", async (t) => {
      await t.step("should pass when all required keys are present", () => {
        const guard = new ObjectGuardian({
          id: new NumberGuardian(),
          name: new StringGuardian(),
          email: new StringGuardian().optional(),
        }).hasKeys(['id', 'name']);

        const result = guard.parse({
          id: 1,
          name: "John",
          email: "john@example.com",
        });

        asserts.assertEquals(result.id, 1);
        asserts.assertEquals(result.name, "John");
        asserts.assertEquals(result.email, "john@example.com");
      });

      await t.step("should pass when required keys are present (optional missing)", () => {
        const guard = new ObjectGuardian({
          id: new NumberGuardian(),
          name: new StringGuardian(),
          email: new StringGuardian().optional(),
        }).hasKeys(['id', 'name']);

        const result = guard.parse({ id: 1, name: "John" });
        asserts.assertEquals(result.id, 1);
        asserts.assertEquals(result.name, "John");
      });

      await t.step("should fail when required keys are missing", () => {
        const guard = new ObjectGuardian({
          id: new NumberGuardian().optional(),
          name: new StringGuardian().optional(),
          email: new StringGuardian().optional(),
        }).hasKeys(['id', 'name']);

        asserts.assertThrows(
          () => guard.parse({ id: 1 }),
          GuardianError,
          "Object must contain all required keys: id, name"
        );
      });

      await t.step("should use custom error message", () => {
        const guard = new ObjectGuardian({
          id: new NumberGuardian().optional(),
          name: new StringGuardian().optional(),
        }).hasKeys(['id', 'name'], 'Custom: ID and name are mandatory');

        asserts.assertThrows(
          () => guard.parse({ id: 1 }),
          GuardianError,
          "Custom: ID and name are mandatory"
        );
      });
    });

    await t.step("forbiddenKeys validation", async (t) => {
      await t.step("should pass when no forbidden keys are present", () => {
        const guard = new ObjectGuardian({
          id: new NumberGuardian(),
          name: new StringGuardian(),
          email: new StringGuardian(),
        }).forbiddenKeys(['password', 'secret']);

        const result = guard.parse({
          id: 1,
          name: "John",
          email: "john@example.com",
        });

        asserts.assertEquals(result.id, 1);
        asserts.assertEquals(result.name, "John");
        asserts.assertEquals(result.email, "john@example.com");
      });

      await t.step("should fail when forbidden keys are present", () => {
        const guard = new ObjectGuardian({
          id: new NumberGuardian(),
          name: new StringGuardian(),
        }).forbiddenKeys(['password', 'secret']);

        asserts.assertThrows(
          () => guard.parse({ id: 1, name: "John", password: "secret123" }),
          GuardianError,
          "Object must not contain forbidden keys: password, secret"
        );
      });

      await t.step("should fail when any forbidden key is present", () => {
        const guard = new ObjectGuardian({
          id: new NumberGuardian(),
          name: new StringGuardian(),
        }).forbiddenKeys(['password', 'secret', 'private']);

        asserts.assertThrows(
          () => guard.parse({ id: 1, name: "John", private: "data" }),
          GuardianError,
          "Object must not contain forbidden keys: password, secret, private"
        );
      });

      await t.step("should use custom error message", () => {
        const guard = new ObjectGuardian({
          id: new NumberGuardian(),
          name: new StringGuardian(),
        }).forbiddenKeys(['password'], 'Security: Password field not allowed');

        asserts.assertThrows(
          () => guard.parse({ id: 1, name: "John", password: "secret" }),
          GuardianError,
          "Security: Password field not allowed"
        );
      });
    });

    await t.step("chaining key validations", () => {
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
        name: "John",
        email: "john@example.com",
      });
      asserts.assertEquals(result.id, 1);
      asserts.assertEquals(result.name, "John");

      // Should fail on missing required key
      asserts.assertThrows(
        () => guard.parse({ id: 1, email: "john@example.com" }),
        GuardianError,
        "Object must contain all required keys: id, name"
      );

      // Should fail on forbidden key
      asserts.assertThrows(
        () => guard.parse({ id: 1, name: "John", password: "secret" }),
        GuardianError,
        "Object must not contain forbidden keys: password, secret"
      );
    });
  });

  await t.step("Error handling", async (t) => {
    await t.step("should reject non-objects", () => {
      const guard = new ObjectGuardian({});

      asserts.assertThrows(() => guard.parse("not an object"), GuardianError);
      asserts.assertThrows(() => guard.parse(123), GuardianError);
      asserts.assertThrows(() => guard.parse(null), GuardianError);
      asserts.assertThrows(() => guard.parse([]), GuardianError);
    });
  });

  await t.step("SafeParse functionality", async (t) => {
    await t.step("should return success result for valid data", () => {
      const guard = new ObjectGuardian({
        name: new StringGuardian(),
        age: new NumberGuardian().optional(),
      });

      const [error, data] = guard.safeParse({ name: "John", age: 30 });
      asserts.assertEquals(error, null);
      asserts.assertEquals(data?.name, "John");
      asserts.assertEquals(data?.age, 30);
    });

    await t.step("should return error result for invalid data", () => {
      const guard = new ObjectGuardian({
        name: new StringGuardian(),
        age: new NumberGuardian(),
      });

      const [error, data] = guard.safeParse({ name: "John" });
      asserts.assertEquals(data, undefined);
      asserts.assertEquals(error instanceof GuardianError, true);
    });
  });

  await t.step("Refine functionality", async (t) => {
    await t.step("should validate password confirmation", () => {
      const registerSchema = new ObjectGuardian({
        email: new StringGuardian(),
        password: new StringGuardian(),
        confirmPassword: new StringGuardian(),
      }).refine(
        (data) => data.password === data.confirmPassword,
        "Passwords do not match",
      );

      // Valid case
      const validData = {
        email: "john@example.com",
        password: "secure123",
        confirmPassword: "secure123",
      };
      const result = registerSchema.parse(validData);
      asserts.assertEquals(result.email, "john@example.com");
      asserts.assertEquals(result.password, "secure123");

      // Invalid case
      asserts.assertThrows(
        () =>
          registerSchema.parse({
            email: "john@example.com",
            password: "secure123",
            confirmPassword: "different",
          }),
        GuardianError,
        "Passwords do not match",
      );
    });

    await t.step("should validate conditional requirements", () => {
      const userSchema = new ObjectGuardian({
        age: new NumberGuardian(),
        hasParentalConsent: new BooleanGuardian().optional(),
      }).refine(
        (data) => data.age >= 18 || data.hasParentalConsent === true,
        "Users under 18 must have parental consent",
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
        "Users under 18 must have parental consent",
      );
    });

    await t.step("should support multiple refinements with superRefine", () => {
      const eventSchema = new ObjectGuardian({
        startDate: new StringGuardian(), // Simplified for testing
        endDate: new StringGuardian(),
        price: new NumberGuardian(),
        discountCode: new StringGuardian().optional(),
      }).superRefine([
        {
          validator: (data) => data.endDate > data.startDate,
          message: "End date must be after start date",
        },
        {
          validator: (data) => !data.discountCode || data.price > 10,
          message: "Discount codes only valid for purchases over $10",
        },
      ]);

      // Valid case
      const validEvent = eventSchema.parse({
        startDate: "2025-01-01",
        endDate: "2025-01-02",
        price: 25,
        discountCode: "SAVE10",
      });
      asserts.assertEquals(validEvent.price, 25);

      // Invalid: end date before start date
      asserts.assertThrows(
        () =>
          eventSchema.parse({
            startDate: "2025-01-02",
            endDate: "2025-01-01",
            price: 25,
          }),
        GuardianError,
        "End date must be after start date",
      );

      // Invalid: discount on low price
      asserts.assertThrows(
        () =>
          eventSchema.parse({
            startDate: "2025-01-01",
            endDate: "2025-01-02",
            price: 5,
            discountCode: "SAVE10",
          }),
        GuardianError,
        "Discount codes only valid for purchases over $10",
      );
    });

    await t.step("should handle async refinements", async () => {
      const asyncSchema = new ObjectGuardian({
        username: new StringGuardian(),
        email: new StringGuardian(),
      }).refine(
        async (data) => {
          // Simulate async validation (e.g., checking if username is unique)
          await new Promise((resolve) => setTimeout(resolve, 1));
          return data.username !== "taken";
        },
        "Username is already taken",
      );

      // Valid case
      const validUser = await asyncSchema.parseAsync({
        username: "available",
        email: "user@example.com",
      });
      asserts.assertEquals(validUser.username, "available");

      // Invalid case - should throw error
      let caught = false;
      try {
        await asyncSchema.parseAsync({
          username: "taken",
          email: "user@example.com",
        });
      } catch (error) {
        caught = true;
        asserts.assertInstanceOf(error, GuardianError);
        asserts.assert(
          (error as GuardianError).message.includes(
            "Username is already taken",
          ),
        );
      }

      if (!caught) {
        asserts.fail(
          "Expected async validation to throw an error for invalid input",
        );
      }
    });

    await t.step("should reject async refinements in sync parsing", () => {
      const asyncSchema = new ObjectGuardian({
        username: new StringGuardian(),
      }).refine(
        async (data) => data.username !== "taken",
        "Username is already taken",
      );

      asserts.assertThrows(
        () => asyncSchema.parse({ username: "test" }),
        GuardianError,
        "Cannot use parse() with async validation steps. Use parseAsync() instead",
      );
    });
  });
});
