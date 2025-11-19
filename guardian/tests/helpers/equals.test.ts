import * as asserts from "$asserts";
import { equals } from "../../helpers/mod.ts";
import { GuardianError } from "../../GuardianError.ts";

/**
 * Comprehensive test suite for equals helper function.
 * Tests equality validation functionality.
 */
Deno.test("guardian.helpers.equals", async (t) => {
  await t.step("Basic equality validation", async (t) => {
    await t.step("should pass when values are equal", () => {
      const validator = equals("hello");
      asserts.assertEquals(validator("hello"), "hello");

      const numberValidator = equals(42);
      asserts.assertEquals(numberValidator(42), 42);

      const booleanValidator = equals(true);
      asserts.assertEquals(booleanValidator(true), true);
    });

    await t.step("should fail when values are not equal", () => {
      const validator = equals("hello");
      asserts.assertThrows(
        () => validator("world"),
        GuardianError,
      );

      const numberValidator = equals(42);
      asserts.assertThrows(
        () => numberValidator(43),
        GuardianError,
      );
    });
  });

  await t.step("Custom error messages", async (t) => {
    await t.step("should use custom error message when provided", () => {
      const validator = equals("expected", "Custom error message");
      asserts.assertThrows(
        () => validator("actual"),
        GuardianError,
        "Custom error message",
      );
    });

    await t.step("should use default error message when not provided", () => {
      const validator = equals("expected");
      asserts.assertThrows(
        () => validator("actual"),
        GuardianError,
      );
    });
  });

  await t.step("Type safety and special values", async (t) => {
    await t.step("should handle null values", () => {
      const validator = equals(null);
      asserts.assertEquals(validator(null), null);

      asserts.assertThrows(
        () => validator("not-null" as any),
        GuardianError,
      );
    });

    await t.step("should handle undefined values", () => {
      const validator = equals(undefined);
      asserts.assertEquals(validator(undefined), undefined);

      asserts.assertThrows(
        () => validator("not-undefined" as any),
        GuardianError,
      );
    });

    await t.step("should handle zero and false", () => {
      const zeroValidator = equals(0);
      asserts.assertEquals(zeroValidator(0), 0);
      asserts.assertThrows(() => zeroValidator("false" as any), GuardianError);

      const falseValidator = equals(false);
      asserts.assertEquals(falseValidator(false), false);
      asserts.assertThrows(() => falseValidator("0" as any), GuardianError);
    });

    await t.step("should handle NaN correctly", () => {
      const nanValidator = equals(NaN);
      // NaN !== NaN, so this should throw
      asserts.assertThrows(() => nanValidator(NaN), GuardianError);
    });
  });

  await t.step("Object and array equality", async (t) => {
    await t.step("should use reference equality for objects", () => {
      const obj = { a: 1 };
      const validator = equals(obj);

      asserts.assertEquals(validator(obj), obj);

      // Different object with same content should fail
      asserts.assertThrows(
        () => validator({ a: 1 }),
        GuardianError,
      );
    });

    await t.step("should use reference equality for arrays", () => {
      const arr = [1, 2, 3];
      const validator = equals(arr);

      asserts.assertEquals(validator(arr), arr);

      // Different array with same content should fail
      asserts.assertThrows(
        () => validator([1, 2, 3]),
        GuardianError,
      );
    });
  });

  await t.step("Error metadata", async (t) => {
    await t.step("should include correct metadata in error", () => {
      const validator = equals("expected");

      try {
        validator("actual");
        asserts.fail("Should have thrown an error");
      } catch (error) {
        if (error instanceof GuardianError) {
          asserts.assertEquals(error.context.expected, "expected");
          asserts.assertEquals(error.context.got, "actual");
          asserts.assertEquals(error.context.comparison, "equals");
          asserts.assertEquals(error.context.type, "validation");
        } else {
          asserts.fail("Should have thrown a GuardianError");
        }
      }
    });
  });
});
