import * as asserts from "$asserts";
import { BaseGuardian } from "../BaseGuardian.ts";
import { StringGuardian } from "../guards/StringGuardian.ts";
import { NumberGuardian } from "../guards/NumberGuardian.ts";
import { GuardianError } from "../GuardianError.ts";

Deno.test("guardian.BaseGuardian", async (t) => {
  await t.step("metadata properties", async (t) => {
    await t.step("should set and get description", () => {
      const guard = new StringGuardian();
      guard.description = "Test description";
      asserts.assertEquals(guard.metaData?.description, "Test description");
    });

    await t.step("should set and get title", () => {
      const guard = new StringGuardian();
      guard.title = "Test Title";
      asserts.assertEquals(guard.metaData?.title, "Test Title");
    });

    await t.step("should set and get examples", () => {
      const guard = new StringGuardian();
      const examples = ["example1", "example2"];
      guard.examples = examples;
      asserts.assertEquals(guard.metaData?.examples, examples);
    });

    await t.step("should set and get deprecated flag", () => {
      const guard = new StringGuardian();
      guard.deprecated = true;
      asserts.assertEquals(guard.metaData?.deprecated, true);
    });

    await t.step(
      "should initialize metadata object when setting properties",
      () => {
        const guard = new StringGuardian();
        asserts.assertEquals(guard.metaData, undefined);
        guard.description = "Test";
        asserts.assertNotEquals(guard.metaData, undefined);
      },
    );
  });

  await t.step("immutable functionality", async (t) => {
    await t.step("should initially be mutable", () => {
      const guard = new StringGuardian();
      asserts.assertEquals(guard.isImmutable, false);
    });

    await t.step("should become immutable after calling immutable()", () => {
      const guard = new StringGuardian();
      const immutableGuard = guard.immutable();
      asserts.assertEquals(immutableGuard.isImmutable, true);
      asserts.assertStrictEquals(guard, immutableGuard); // Same instance
    });

    await t.step("freeze() should be alias for immutable()", () => {
      const guard = new StringGuardian();
      const frozen = guard.freeze();
      asserts.assertEquals(frozen.isImmutable, true);
      asserts.assertStrictEquals(guard, frozen);
    });

    await t.step(
      "immutable guard should return new instances on process",
      () => {
        const guard = new StringGuardian().immutable();
        const processed = guard.process((val) => val.toUpperCase());
        asserts.assertNotStrictEquals(guard, processed);
      },
    );
  });

  await t.step("clone functionality", async (t) => {
    await t.step("should create a mutable copy", () => {
      const guard = new StringGuardian().immutable();
      guard.title = "Original";

      const cloned = guard.clone();
      asserts.assertNotStrictEquals(guard, cloned);
      asserts.assertEquals(cloned.isImmutable, false);
      asserts.assertEquals(cloned.metaData?.title, "Original");
    });

    await t.step("should clone metadata without isImmutable flag", () => {
      const guard = new StringGuardian().immutable();
      guard.description = "Test description";

      const cloned = guard.clone();
      asserts.assertEquals(cloned.metaData?.description, "Test description");
      asserts.assertEquals(cloned.isImmutable, false);
    });
  });

  await t.step("process method", async (t) => {
    await t.step("should transform values", () => {
      const guard = new StringGuardian();
      const result = guard.process((val) => val.toUpperCase()).parse("hello");
      asserts.assertEquals(result, "HELLO");
    });

    await t.step("should handle async transformations", async () => {
      const guard = new StringGuardian();
      const asyncGuard = guard.process(async (val) => val.toUpperCase());
      const result = await asyncGuard.parseAsync("hello");
      asserts.assertEquals(result, "HELLO");
    });

    await t.step("should throw error when called after nullable()", () => {
      const guard = new StringGuardian().nullable();
      asserts.assertThrows(
        () => guard.process((val) => val ? val.toUpperCase() : ""),
        GuardianError,
        "Cannot call process() after nullable()",
      );
    });

    await t.step("should throw error when called after optional()", () => {
      const guard = new StringGuardian().optional();
      asserts.assertThrows(
        () => guard.process((val) => val ? val.toUpperCase() : ""),
        GuardianError,
        "Cannot call process() after optional()",
      );
    });

    await t.step("should use provided constructor", () => {
      const stringGuard = new StringGuardian();
      const numberGuard = stringGuard.process(
        (val) => parseInt(val, 10),
        NumberGuardian,
      );
      asserts.assertInstanceOf(numberGuard, NumberGuardian);
    });
  });

  await t.step("test method", async (t) => {
    await t.step("should validate using test function", () => {
      const guard = new StringGuardian().test(
        (val) => val.length >= 5,
        "String must be at least 5 characters",
      );

      asserts.assertEquals(guard.parse("hello"), "hello");
      asserts.assertThrows(() => guard.parse("hi"), GuardianError);
    });

    await t.step("should throw error when called after nullable()", () => {
      const guard = new StringGuardian().nullable();
      asserts.assertThrows(
        () => guard.test((val) => val ? val.length > 0 : false),
        GuardianError,
        "Cannot call test() after nullable()",
      );
    });

    await t.step("should throw error when called after optional()", () => {
      const guard = new StringGuardian().optional();
      asserts.assertThrows(
        () => guard.test((val) => val ? val.length > 0 : false),
        GuardianError,
        "Cannot call test() after optional()",
      );
    });
  });

  await t.step("equals method", async (t) => {
    await t.step("should validate equality", () => {
      const guard = new StringGuardian().equals("expected");

      asserts.assertEquals(guard.parse("expected"), "expected");
      asserts.assertThrows(() => guard.parse("different"), GuardianError);
    });

    await t.step("should use custom error message", () => {
      const guard = new StringGuardian().equals("expected", "Must be expected");

      try {
        guard.parse("different");
        asserts.fail("Should have thrown");
      } catch (error) {
        asserts.assertInstanceOf(error, GuardianError);
        asserts.assertEquals(error.message, "Must be expected");
      }
    });
  });

  await t.step("notEquals method", async (t) => {
    await t.step("should validate inequality", () => {
      const guard = new StringGuardian().notEquals("forbidden");

      asserts.assertEquals(guard.parse("allowed"), "allowed");
      asserts.assertThrows(() => guard.parse("forbidden"), GuardianError);
    });

    await t.step("should use custom error message", () => {
      const guard = new StringGuardian().notEquals(
        "forbidden",
        "Cannot be forbidden",
      );

      try {
        guard.parse("forbidden");
        asserts.fail("Should have thrown");
      } catch (error) {
        asserts.assertInstanceOf(error, GuardianError);
        asserts.assertEquals(error.message, "Cannot be forbidden");
      }
    });
  });

  await t.step("isIn method", async (t) => {
    await t.step("should validate value is in allowed list", () => {
      const guard = new StringGuardian().isIn(["a", "b", "c"]);

      asserts.assertEquals(guard.parse("a"), "a");
      asserts.assertEquals(guard.parse("b"), "b");
      asserts.assertThrows(() => guard.parse("d"), GuardianError);
    });

    await t.step("should use custom error message", () => {
      const guard = new StringGuardian().isIn(["a", "b"], "Must be a or b");

      try {
        guard.parse("c");
        asserts.fail("Should have thrown");
      } catch (error) {
        asserts.assertInstanceOf(error, GuardianError);
        asserts.assertEquals(error.message, "Must be a or b");
      }
    });
  });

  await t.step("isNotIn method", async (t) => {
    await t.step("should validate value is not in forbidden list", () => {
      const guard = new StringGuardian().isNotIn(["x", "y", "z"]);

      asserts.assertEquals(guard.parse("a"), "a");
      asserts.assertThrows(() => guard.parse("x"), GuardianError);
    });

    await t.step("should use custom error message", () => {
      const guard = new StringGuardian().isNotIn(
        ["x", "y"],
        "Cannot be x or y",
      );

      try {
        guard.parse("x");
        asserts.fail("Should have thrown");
      } catch (error) {
        asserts.assertInstanceOf(error, GuardianError);
        asserts.assertEquals(error.message, "Cannot be x or y");
      }
    });
  });

  await t.step("nullable method", async (t) => {
    await t.step("should handle null values", () => {
      const guard = new StringGuardian().nullable();

      asserts.assertEquals(guard.parse("hello"), "hello");
      asserts.assertEquals(guard.parse(null), null);
      // For StringGuardian, undefined behavior depends on implementation
      // Let's just test that null works
    });

    await t.step("should throw error on multiple nullable() calls", () => {
      const guard = new StringGuardian().nullable();
      asserts.assertThrows(
        () => guard.nullable(),
        GuardianError,
        "nullable() has already been called",
      );
    });

    await t.step("should return new instance when immutable", () => {
      const guard = new StringGuardian().immutable();
      const nullable = guard.nullable();
      asserts.assertNotStrictEquals(guard, nullable);
    });
  });

  await t.step("optional method", async (t) => {
    await t.step("should handle undefined values without default", () => {
      const guard = new StringGuardian().optional();

      asserts.assertEquals(guard.parse("hello"), "hello");
      asserts.assertEquals(guard.parse(undefined), undefined);
    });

    await t.step("should handle undefined values with default value", () => {
      const guard = new StringGuardian().optional("default");

      asserts.assertEquals(guard.parse("hello"), "hello");
      asserts.assertEquals(guard.parse(undefined), "default");
    });

    await t.step("should handle undefined values with default function", () => {
      const guard = new StringGuardian().optional(() => "computed");

      asserts.assertEquals(guard.parse("hello"), "hello");
      asserts.assertEquals(guard.parse(undefined), "computed");
    });

    await t.step("should handle async default function", async () => {
      const guard = new StringGuardian().optional(async () => "async-default");

      const result = await guard.parseAsync(undefined);
      asserts.assertEquals(result, "async-default");
    });

    await t.step("should throw error on multiple optional() calls", () => {
      const guard = new StringGuardian().optional();
      asserts.assertThrows(
        () => guard.optional(),
        GuardianError,
        "optional() has already been called",
      );
    });

    await t.step("should return new instance when immutable", () => {
      const guard = new StringGuardian().immutable();
      const optional = guard.optional();
      asserts.assertNotStrictEquals(guard, optional);
    });
  });

  await t.step("parse method", async (t) => {
    await t.step("should throw error for async guardian", () => {
      const guard = new StringGuardian();
      // Manually set async flag to test error handling
      guard["_metaData"] = { isAsync: true };

      asserts.assertThrows(
        () => guard.parse("test"),
        GuardianError,
        "Cannot use parse() with async validation steps. Use parseAsync() instead.",
      );
    });

    await t.step("should wrap non-GuardianError exceptions", () => {
      const guard = new StringGuardian().process(() => {
        throw new Error("Custom error");
      });

      try {
        guard.parse("test");
        asserts.fail("Should have thrown");
      } catch (error) {
        asserts.assertInstanceOf(error, GuardianError);
        asserts.assertEquals(error.message, "Validation failed");
      }
    });
  });

  await t.step("parseAsync method", async (t) => {
    await t.step("should handle sync transformations", async () => {
      const guard = new StringGuardian();
      const result = await guard.parseAsync("hello");
      asserts.assertEquals(result, "hello");
    });

    await t.step("should handle async transformations", async () => {
      const guard = new StringGuardian().process(async (val) =>
        val.toUpperCase()
      );
      const result = await guard.parseAsync("hello");
      asserts.assertEquals(result, "HELLO");
    });

    await t.step("should wrap non-GuardianError exceptions", async () => {
      const guard = new StringGuardian().process(async () => {
        throw new Error("Custom error");
      });

      try {
        await guard.parseAsync("test");
        asserts.fail("Should have thrown");
      } catch (error) {
        asserts.assertInstanceOf(error, GuardianError);
        asserts.assertEquals(error.message, "Validation failed");
      }
    });
  });

  await t.step("safeParse method", async (t) => {
    await t.step("should return success result for valid input", () => {
      const guard = new StringGuardian();
      const [error, data] = guard.safeParse("hello");

      asserts.assertEquals(error, null);
      asserts.assertEquals(data, "hello");
    });

    await t.step("should return error result for invalid input", () => {
      const guard = new StringGuardian();
      const [error, data] = guard.safeParse(123);

      asserts.assertInstanceOf(error, GuardianError);
      asserts.assertEquals(data, undefined);
    });

    await t.step("should handle non-GuardianError exceptions", () => {
      const guard = new StringGuardian().process(() => {
        throw new Error("Custom error");
      });

      const [error, data] = guard.safeParse("test");
      asserts.assertInstanceOf(error, GuardianError);
      // The actual error message is "Validation failed" based on the implementation
      asserts.assertEquals(error.message, "Validation failed");
      asserts.assertEquals(data, undefined);
    });
  });

  await t.step("safeParseAsync method", async (t) => {
    await t.step("should return success result for valid input", async () => {
      const guard = new StringGuardian();
      const [error, data] = await guard.safeParseAsync("hello");

      asserts.assertEquals(error, null);
      asserts.assertEquals(data, "hello");
    });

    await t.step("should return error result for invalid input", async () => {
      const guard = new StringGuardian();
      const [error, data] = await guard.safeParseAsync(123);

      asserts.assertInstanceOf(error, GuardianError);
      asserts.assertEquals(data, undefined);
    });

    await t.step("should handle non-GuardianError exceptions", async () => {
      const guard = new StringGuardian().process(async () => {
        throw new Error("Custom error");
      });

      const [error, data] = await guard.safeParseAsync("test");
      asserts.assertInstanceOf(error, GuardianError);
      // The actual error message is "Validation failed" based on the implementation
      asserts.assertEquals(error.message, "Validation failed");
      asserts.assertEquals(data, undefined);
    });
  });

  await t.step("documentation methods", async (t) => {
    await t.step("toOpenAPI should generate schema", () => {
      const guard = new StringGuardian();
      guard.title = "Test String";
      guard.description = "A test string field";
      guard.examples = ["example1", "example2"];
      guard.deprecated = true;

      const schema = guard.toOpenAPI();

      asserts.assertEquals(schema.type, "string");
      asserts.assertEquals(schema.title, "Test String");
      asserts.assertEquals(schema.description, "A test string field");
      asserts.assertEquals(schema.examples, ["example1", "example2"]);
      asserts.assertEquals(schema.deprecated, true);
    });

    await t.step("toOpenAPI should include nullable flag", () => {
      const guard = new StringGuardian().nullable();
      const schema = guard.toOpenAPI();

      asserts.assertEquals(schema.nullable, true);
    });

    await t.step("toMarkdown should generate documentation", () => {
      const guard = new StringGuardian();
      guard.title = "Test String";
      guard.description = "A test string field";
      guard.examples = ["example1", "example2"];

      const markdown = guard.toMarkdown();

      asserts.assert(markdown.includes("### Test String"));
      asserts.assert(markdown.includes("A test string field"));
      asserts.assert(markdown.includes("**Type:** string"));
      asserts.assert(markdown.includes("**Examples:**"));
      asserts.assert(markdown.includes('`"example1"`'));
    });

    await t.step(
      "toMarkdown should include nullable and optional flags",
      () => {
        const guard = new StringGuardian().nullable().optional();
        guard.title = "Optional Field";

        const markdown = guard.toMarkdown();

        asserts.assert(markdown.includes("nullable"));
        asserts.assert(markdown.includes("optional"));
      },
    );

    await t.step("toMarkdown should include deprecation warning", () => {
      const guard = new StringGuardian();
      guard.deprecated = true;

      const markdown = guard.toMarkdown();

      asserts.assert(markdown.includes("⚠️ **Deprecated**"));
    });
  });

  await t.step("chaining nullable and optional", async (t) => {
    await t.step("nullable().optional() should work correctly", () => {
      const guard = new StringGuardian().nullable().optional();

      asserts.assertEquals(guard.parse("hello"), "hello");
      asserts.assertEquals(guard.parse(null), null);
      asserts.assertEquals(guard.parse(undefined), undefined);
    });

    await t.step("optional().nullable() should work correctly", () => {
      const guard = new StringGuardian().optional().nullable();

      asserts.assertEquals(guard.parse("hello"), "hello");
      asserts.assertEquals(guard.parse(undefined), undefined);
      asserts.assertEquals(guard.parse(null), null);
    });

    await t.step("optional with default should work with nullable", () => {
      const guard = new StringGuardian().optional("default").nullable();

      asserts.assertEquals(guard.parse("hello"), "hello");
      asserts.assertEquals(guard.parse(undefined), "default");
      asserts.assertEquals(guard.parse(null), null);
    });
  });
});
