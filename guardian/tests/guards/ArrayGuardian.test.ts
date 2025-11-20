import * as asserts from "$asserts";
import { Guardian } from "../../Guardian.ts";
import { GuardianError } from "../../GuardianError.ts";

Deno.test("guardian.ArrayGuardian", async (t) => {
  await t.step("basic functionality", async (t) => {
    await t.step("should validate array type", () => {
      const arrayGuard = Guardian.array();
      const result = arrayGuard.parse([1, 2, 3]);
      asserts.assertEquals(result, [1, 2, 3]);
    });

    await t.step("should reject non-array values", () => {
      const arrayGuard = Guardian.array();
      asserts.assertThrows(
        () => arrayGuard.parse("not array"),
        GuardianError,
        "Expected array but got string",
      );
    });

    await t.step("should accept empty arrays by default", () => {
      const arrayGuard = Guardian.array();
      const result = arrayGuard.parse([]);
      asserts.assertEquals(result, []);
    });

    await t.step("should preserve mixed types without element guardian", () => {
      const arrayGuard = Guardian.array();
      const input = [1, "hello", true, null];
      const result = arrayGuard.parse(input);
      asserts.assertEquals(result, input);
    });
  });

  await t.step("element validation with constructor", async (t) => {
    await t.step("should validate string elements", () => {
      const stringArrayGuard = Guardian.array(Guardian.string());
      const result = stringArrayGuard.parse(["hello", "world"]);
      asserts.assertEquals(result, ["hello", "world"]);
    });

    await t.step("should reject invalid element types", () => {
      const stringArrayGuard = Guardian.array(Guardian.string());
      asserts.assertThrows(
        () => stringArrayGuard.parse(["hello", 42]),
        GuardianError,
        "Array element at index 1: Expected string but got number",
      );
    });

    await t.step("should validate number elements with constraints", () => {
      const positiveNumberArray = Guardian.array(
        Guardian.number().positive(),
      );
      const result = positiveNumberArray.parse([1, 2, 3]);
      asserts.assertEquals(result, [1, 2, 3]);
    });

    await t.step("should reject elements that fail constraints", () => {
      const positiveNumberArray = Guardian.array(
        Guardian.number().positive(),
      );
      asserts.assertThrows(
        () => positiveNumberArray.parse([1, -2, 3]),
        GuardianError,
        "Array element at index 1",
      );
    });

    await t.step("should handle empty arrays with element validation", () => {
      const stringArrayGuard = Guardian.array(Guardian.string());
      const result = stringArrayGuard.parse([]);
      asserts.assertEquals(result, []);
    });
  });

  await t.step("length validations", async (t) => {
    await t.step("should validate exact length", () => {
      const exactLengthGuard = Guardian.array().length(3);
      const result = exactLengthGuard.parse([1, 2, 3]);
      asserts.assertEquals(result, [1, 2, 3]);
    });

    await t.step("should reject incorrect exact length", () => {
      const exactLengthGuard = Guardian.array().length(3);
      asserts.assertThrows(
        () => exactLengthGuard.parse([1, 2]),
        GuardianError,
        "Expected array length 3, got 2",
      );
    });

    await t.step("should validate minimum length", () => {
      const minLengthGuard = Guardian.array().minLength(2);
      const result = minLengthGuard.parse([1, 2, 3]);
      asserts.assertEquals(result, [1, 2, 3]);
    });

    await t.step("should reject arrays shorter than minimum", () => {
      const minLengthGuard = Guardian.array().minLength(2);
      asserts.assertThrows(
        () => minLengthGuard.parse([1]),
        GuardianError,
        "Array length must be at least 2, got 1",
      );
    });

    await t.step("should validate maximum length", () => {
      const maxLengthGuard = Guardian.array().maxLength(3);
      const result = maxLengthGuard.parse([1, 2]);
      asserts.assertEquals(result, [1, 2]);
    });

    await t.step("should reject arrays longer than maximum", () => {
      const maxLengthGuard = Guardian.array().maxLength(3);
      asserts.assertThrows(
        () => maxLengthGuard.parse([1, 2, 3, 4]),
        GuardianError,
        "Array length must be at most 3, got 4",
      );
    });

    await t.step("should combine min and max length validations", () => {
      const rangeGuard = Guardian.array().minLength(2).maxLength(4);
      const result = rangeGuard.parse([1, 2, 3]);
      asserts.assertEquals(result, [1, 2, 3]);
    });

    await t.step("should validate non-empty arrays", () => {
      const nonEmptyGuard = Guardian.array().nonEmpty();
      const result = nonEmptyGuard.parse([1]);
      asserts.assertEquals(result, [1]);
    });

    await t.step("should reject empty arrays when non-empty required", () => {
      const nonEmptyGuard = Guardian.array().nonEmpty();
      asserts.assertThrows(
        () => nonEmptyGuard.parse([]),
        GuardianError,
        "Array must not be empty",
      );
    });
  });

  await t.step("array validations", async (t) => {
    await t.step("should validate unique elements", () => {
      const uniqueGuard = Guardian.array(Guardian.string()).unique();
      const result = uniqueGuard.parse(["a", "b", "c"]);
      asserts.assertEquals(result, ["a", "b", "c"]);
    });

    await t.step("should reject duplicate elements", () => {
      const uniqueGuard = Guardian.array(Guardian.string()).unique();
      asserts.assertThrows(
        () => uniqueGuard.parse(["a", "b", "a"]),
        GuardianError,
        "Array must contain unique elements, found duplicates:",
      );
    });

    await t.step("should validate element inclusion", () => {
      const includesGuard = Guardian.array(Guardian.string()).includes(
        "hello",
      );
      const result = includesGuard.parse(["hello", "world"]);
      asserts.assertEquals(result, ["hello", "world"]);
    });

    await t.step("should reject arrays missing required element", () => {
      const includesGuard = Guardian.array(Guardian.string()).includes(
        "hello",
      );
      asserts.assertThrows(
        () => includesGuard.parse(["world", "test"]),
        GuardianError,
        "Array must include hello",
      );
    });

    await t.step("should validate element exclusion", () => {
      const excludesGuard = Guardian.array(Guardian.string()).excludes(
        "forbidden",
      );
      const result = excludesGuard.parse(["hello", "world"]);
      asserts.assertEquals(result, ["hello", "world"]);
    });

    await t.step("should reject arrays containing forbidden element", () => {
      const excludesGuard = Guardian.array(Guardian.string()).excludes(
        "forbidden",
      );
      asserts.assertThrows(
        () => excludesGuard.parse(["hello", "forbidden", "world"]),
        GuardianError,
        "Array must not include forbidden",
      );
    });
  });

  await t.step("transformations", async (t) => {
    await t.step("should map array elements", () => {
      const mappedGuard = Guardian.array(Guardian.number())
        .map((x) => x * 2);
      const result = mappedGuard.parse([1, 2, 3]);
      asserts.assertEquals(result, [2, 4, 6]);
    });

    await t.step("should map with index", () => {
      const mappedWithIndexGuard = Guardian.array(Guardian.string())
        .map((x, i) => `${i}: ${x}`);
      const result = mappedWithIndexGuard.parse(["a", "b", "c"]);
      asserts.assertEquals(result, ["0: a", "1: b", "2: c"]);
    });

    await t.step("should filter array elements", () => {
      const filteredGuard = Guardian.array(Guardian.number())
        .filter((x) => x > 2);
      const result = filteredGuard.parse([1, 2, 3, 4, 5]);
      asserts.assertEquals(result, [3, 4, 5]);
    });

    await t.step("should sort array elements", () => {
      const sortedGuard = Guardian.array(Guardian.number())
        .sort();
      const result = sortedGuard.parse([3, 1, 4, 1, 5]);
      asserts.assertEquals(result, [1, 1, 3, 4, 5]);
    });

    await t.step("should sort with custom compare function", () => {
      const sortedGuard = Guardian.array(Guardian.number())
        .sort((a, b) => b - a); // descending
      const result = sortedGuard.parse([3, 1, 4, 1, 5]);
      asserts.assertEquals(result, [5, 4, 3, 1, 1]);
    });

    await t.step("should reverse array elements", () => {
      const reversedGuard = Guardian.array(Guardian.string())
        .reverse();
      const result = reversedGuard.parse(["a", "b", "c"]);
      asserts.assertEquals(result, ["c", "b", "a"]);
    });

    await t.step("should not mutate original array in transformations", () => {
      const originalArray = [3, 1, 4];
      const sortedGuard = Guardian.array(Guardian.number())
        .sort();
      const result = sortedGuard.parse(originalArray);
      asserts.assertEquals(result, [1, 3, 4]);
      asserts.assertEquals(originalArray, [3, 1, 4]); // Original unchanged
    });
  });

  await t.step("chained validations", async (t) => {
    await t.step("should chain multiple array validations", () => {
      const complexGuard = Guardian.array(Guardian.string().minLength(2))
        .minLength(2)
        .maxLength(5)
        .unique();
      const result = complexGuard.parse(["hello", "world"]);
      asserts.assertEquals(result, ["hello", "world"]);
    });

    await t.step("should chain validations and transformations", () => {
      const chainedGuard = Guardian.array(Guardian.number().positive())
        .minLength(1)
        .map((x) => x * 2)
        .filter((x) => x > 4)
        .sort((a, b) => a - b);
      const result = chainedGuard.parse([1, 2, 3, 4, 5]);
      asserts.assertEquals(result, [6, 8, 10]);
    });

    await t.step("should maintain type safety through chaining", () => {
      const typedGuard = Guardian.array(Guardian.string())
        .map((s) => s.length)
        .filter((n) => n > 3);
      const result = typedGuard.parse(["hello", "hi", "world"]);
      asserts.assertEquals(result, [5, 5]);
    });
  });

  await t.step("safe parsing", async (t) => {
    await t.step("should return success result for valid input", () => {
      const arrayGuard = Guardian.array(Guardian.string());
      const [error, data] = arrayGuard.safeParse(["hello", "world"]);
      asserts.assertEquals(error, null);
      asserts.assertEquals(data, ["hello", "world"]);
    });

    await t.step("should return error result for invalid input", () => {
      const arrayGuard = Guardian.array(Guardian.string());
      const [error, data] = arrayGuard.safeParse(["hello", 42]);
      asserts.assertInstanceOf(error, GuardianError);
      asserts.assertEquals(data, undefined);
      asserts.assertStringIncludes(error!.message, "Array element at index 1");
    });

    await t.step("should return error result for invalid array type", () => {
      const arrayGuard = Guardian.array();
      const [error, data] = arrayGuard.safeParse("not array");
      asserts.assertInstanceOf(error, GuardianError);
      asserts.assertEquals(data, undefined);
      asserts.assertStringIncludes(
        error!.message,
        "Expected array but got string",
      );
    });
  });

  await t.step("error handling", async (t) => {
    await t.step("should provide detailed error messages", () => {
      const stringArrayGuard = Guardian.array(
        Guardian.string().minLength(5),
      );
      asserts.assertThrows(
        () => stringArrayGuard.parse(["hello", "hi"]),
        GuardianError,
        "Array element at index 1",
      );
    });

    await t.step("should support custom error messages", () => {
      const customGuard = Guardian.array().length(
        3,
        "Array must have exactly 3 items",
      );
      asserts.assertThrows(
        () => customGuard.parse([1, 2]),
        GuardianError,
        "Array must have exactly 3 items",
      );
    });

    await t.step("should preserve error context", () => {
      const arrayGuard = Guardian.array(Guardian.number().min(10));
      try {
        arrayGuard.parse([15, 5, 20]);
        asserts.fail("Should have thrown an error");
      } catch (error) {
        asserts.assertInstanceOf(error, GuardianError);
        asserts.assertEquals(error.context?.type, "array_element");
      }
    });
  });

  await t.step("complex scenarios", async (t) => {
    await t.step("should handle nested arrays", () => {
      const nestedArrayGuard = Guardian.array(
        Guardian.array(Guardian.number()),
      );
      const result = nestedArrayGuard.parse([[1, 2], [3, 4], [5]]);
      asserts.assertEquals(result, [[1, 2], [3, 4], [5]]);
    });

    await t.step("should validate array of emails", () => {
      const emailArrayGuard = Guardian.array(Guardian.string().pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/))
        .minLength(1)
        .unique();

      const result = emailArrayGuard.parse([
        "user1@example.com",
        "user2@test.org",
      ]);
      asserts.assertEquals(result, ["user1@example.com", "user2@test.org"]);
    });

    await t.step("should handle complex transformation pipeline", () => {
      const pipelineGuard = Guardian.array(Guardian.string().minLength(1))
        .nonEmpty()
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s.length > 2)
        .sort();

      // This will include duplicate 'hello' since unique() isn't applied
      const result = pipelineGuard.parse([
        " Hello ",
        "WORLD",
        "hi",
        "Hello",
        "test",
      ]);
      asserts.assertEquals(result, ["hello", "hello", "test", "world"]);
    });
  });

  await t.step("metadata handling", async (t) => {
    await t.step("should store and retrieve metadata", () => {
      const metaData = {
        description: "Array of user IDs",
        title: "User IDs",
        examples: [[1, 2, 3]],
      };
      const arrayGuard = Guardian.array(undefined, metaData);
      asserts.assertEquals(arrayGuard.metaData, metaData);
    });

    await t.step("should allow setting metadata properties", () => {
      const arrayGuard = Guardian.array();
      arrayGuard.description = "List of names";
      arrayGuard.title = "Names";
      arrayGuard.examples = [["Alice", "Bob"]];

      asserts.assertEquals(arrayGuard.metaData?.description, "List of names");
      asserts.assertEquals(arrayGuard.metaData?.title, "Names");
      asserts.assertEquals(arrayGuard.metaData?.examples, [["Alice", "Bob"]]);
    });
  });

  await t.step("real world usage", async (t) => {
    await t.step("should validate shopping cart items", () => {
      // Simulating product IDs as positive integers
      const cartGuard = Guardian.array(Guardian.number().positive().integer())
        .minLength(1)
        .maxLength(50)
        .unique();

      const result = cartGuard.parse([101, 202, 303]);
      asserts.assertEquals(result, [101, 202, 303]);
    });

    await t.step("should validate tag system", () => {
      const tagGuard = Guardian.array(Guardian.string().minLength(1).maxLength(20))
        .minLength(1)
        .maxLength(10)
        .unique()
        .map((tag) => tag.toLowerCase().trim());

      const result = tagGuard.parse(["JavaScript", "TypeScript", "Web"]);
      asserts.assertEquals(result, ["javascript", "typescript", "web"]);
    });
  });
});
