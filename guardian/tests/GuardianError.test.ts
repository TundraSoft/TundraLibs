import * as asserts from "$asserts";
import { GuardianError, type GuardianErrorMeta } from "../GuardianError.ts";

Deno.test("guardian.GuardianError", async (t) => {
  await t.step("constructor and basic properties", async (t) => {
    await t.step("should create error with basic meta", () => {
      const meta: GuardianErrorMeta = {
        got: "string",
        expected: "number",
        comparison: "type",
      };
      const error = new GuardianError("Invalid type", meta);

      asserts.assertEquals(error.name, "GuardianError");
      asserts.assertEquals(error.message, "Invalid type");
      asserts.assertEquals(error.context, meta);
      asserts.assertInstanceOf(error.timeStamp, Date);
    });

    await t.step("should create error with type meta", () => {
      const meta: GuardianErrorMeta = {
        type: "string",
        got: 42,
        expected: "string",
        comparison: "type",
      };
      const error = new GuardianError("Expected string, got number", meta);

      asserts.assertEquals(error.context.type, "string");
      asserts.assertEquals(error.context.got, 42);
      asserts.assertEquals(error.context.expected, "string");
      asserts.assertEquals(error.context.comparison, "type");
    });

    await t.step("should inherit from Error", () => {
      const meta: GuardianErrorMeta = {
        got: null,
        comparison: "required",
      };
      const error = new GuardianError("Value is required", meta);

      asserts.assertInstanceOf(error, Error);
      asserts.assertInstanceOf(error, GuardianError);
    });
  });

  await t.step("cause management", async (t) => {
    await t.step("should start with no causes", () => {
      const meta: GuardianErrorMeta = {
        got: {},
        comparison: "object",
      };
      const error = new GuardianError("Object validation failed", meta);

      asserts.assertEquals(error.causeSize(), 0);
      asserts.assertEquals(error.listCauses(), {});
    });

    await t.step("should add single cause", () => {
      const parentMeta: GuardianErrorMeta = {
        got: { name: 123 },
        comparison: "object",
      };
      const parentError = new GuardianError(
        "Object validation failed",
        parentMeta,
      );

      const childMeta: GuardianErrorMeta = {
        got: 123,
        expected: "string",
        comparison: "type",
      };
      const childError = new GuardianError(
        "Expected string, got number",
        childMeta,
      );

      parentError.addCause("name", childError);

      asserts.assertEquals(parentError.causeSize(), 1);
      asserts.assertEquals(parentError.listCauses(), {
        "name": "Expected string, got number",
      });
    });

    await t.step("should add multiple causes", () => {
      const parentMeta: GuardianErrorMeta = {
        got: { name: 123, age: "invalid" },
        comparison: "object",
      };
      const parentError = new GuardianError(
        "Object validation failed",
        parentMeta,
      );

      const nameError = new GuardianError("Expected string, got number", {
        got: 123,
        expected: "string",
        comparison: "type",
      });

      const ageError = new GuardianError("Expected number, got string", {
        got: "invalid",
        expected: "number",
        comparison: "type",
      });

      parentError.addCause("name", nameError);
      parentError.addCause("age", ageError);

      asserts.assertEquals(parentError.causeSize(), 2);
      asserts.assertEquals(parentError.listCauses(), {
        "name": "Expected string, got number",
        "age": "Expected number, got string",
      });
    });

    await t.step("should handle nested causes", () => {
      const rootError = new GuardianError("Root validation failed", {
        got: { user: { profile: { name: 123 } } },
        comparison: "object",
      });

      const userError = new GuardianError("User validation failed", {
        got: { profile: { name: 123 } },
        comparison: "object",
      });

      const profileError = new GuardianError("Profile validation failed", {
        got: { name: 123 },
        comparison: "object",
      });

      const nameError = new GuardianError("Expected string, got number", {
        got: 123,
        expected: "string",
        comparison: "type",
      });

      profileError.addCause("name", nameError);
      userError.addCause("profile", profileError);
      rootError.addCause("user", userError);

      asserts.assertEquals(rootError.listCauses(), {
        "user.profile.name": "Expected string, got number",
      });
    });

    await t.step("should handle circular references", () => {
      const error1 = new GuardianError("Error 1", {
        got: "value1",
        comparison: "test",
      });

      const error2 = new GuardianError("Error 2", {
        got: "value2",
        comparison: "test",
      });

      // Create circular reference
      error1.addCause("error2", error2);
      error2.addCause("error1", error1);

      const causes = error1.listCauses();
      asserts.assertEquals(causes["error2.error1"], "Error 1 [circular]");
    });
  });

  await t.step("JSON serialization", async (t) => {
    await t.step("should serialize basic error to JSON", () => {
      const meta: GuardianErrorMeta = {
        type: "string",
        got: 42,
        expected: "string",
        comparison: "type",
      };
      const error = new GuardianError("Expected string, got number", meta);
      const json = error.toJSON();

      asserts.assertEquals(json.name, "GuardianError");
      asserts.assertEquals(json.message, "Expected string, got number");
      asserts.assertEquals(json.context, meta);
      asserts.assertExists(json.timeStamp);
      asserts.assertExists(json.stack);
      asserts.assertEquals(json.causes, undefined);
    });

    await t.step("should serialize error with causes to JSON", () => {
      const parentError = new GuardianError("Parent error", {
        got: { field1: "invalid", field2: 123 },
        comparison: "object",
      });

      const child1Error = new GuardianError("Child 1 error", {
        got: "invalid",
        comparison: "validation",
      });

      const child2Error = new GuardianError("Child 2 error", {
        got: 123,
        comparison: "validation",
      });

      parentError.addCause("field1", child1Error);
      parentError.addCause("field2", child2Error);

      const json = parentError.toJSON();

      asserts.assertEquals(json.causes, {
        "field1": "Child 1 error",
        "field2": "Child 2 error",
      });
    });

    await t.step("should serialize error without causes as undefined", () => {
      const error = new GuardianError("Simple error", {
        got: "test",
        comparison: "validation",
      });

      const json = error.toJSON();
      asserts.assertEquals(json.causes, undefined);
    });
  });

  await t.step("value formatting", async (t) => {
    await t.step("should format array values", () => {
      const meta: GuardianErrorMeta = {
        got: [1, "hello", true],
        expected: "string",
        comparison: "type",
      };
      const error = new GuardianError("Expected ${expected}, got ${got}", meta);

      asserts.assertStringIncludes(error.message, "(1, hello, true)");
    });

    await t.step("should format nested array values", () => {
      const meta: GuardianErrorMeta = {
        got: [1, [2, 3], "hello"],
        expected: "string",
        comparison: "type",
      };
      const error = new GuardianError("Expected ${expected}, got ${got}", meta);

      asserts.assertStringIncludes(error.message, "(1, 2,3, hello)");
    });

    await t.step("should format Date values", () => {
      const testDate = new Date("2023-01-01T00:00:00.000Z");
      const meta: GuardianErrorMeta = {
        got: testDate,
        expected: "string",
        comparison: "type",
      };
      const error = new GuardianError("Expected ${expected}, got ${got}", meta);

      asserts.assertStringIncludes(error.message, "2023-01-01T00:00:00.000Z");
    });

    await t.step("should format RegExp values", () => {
      const regex = /test/gi;
      const meta: GuardianErrorMeta = {
        got: regex,
        expected: "string",
        comparison: "type",
      };
      const error = new GuardianError("Expected ${expected}, got ${got}", meta);

      asserts.assertStringIncludes(error.message, "/test/gi");
    });

    await t.step("should format object values", () => {
      const obj = { name: "test", age: 30 };
      const meta: GuardianErrorMeta = {
        got: obj,
        expected: "string",
        comparison: "type",
      };
      const error = new GuardianError("Expected ${expected}, got ${got}", meta);

      asserts.assertStringIncludes(error.message, '{"name":"test","age":30}');
    });

    await t.step("should format null and undefined values", () => {
      const nullMeta: GuardianErrorMeta = {
        got: null,
        expected: "string",
        comparison: "type",
      };
      const nullError = new GuardianError(
        "Expected ${expected}, got ${got}",
        nullMeta,
      );

      const undefinedMeta: GuardianErrorMeta = {
        got: undefined,
        expected: "string",
        comparison: "type",
      };
      const undefinedError = new GuardianError(
        "Expected ${expected}, got ${got}",
        undefinedMeta,
      );

      asserts.assertStringIncludes(nullError.message, "null");
      asserts.assertStringIncludes(undefinedError.message, "undefined");
    });

    await t.step("should format boolean values", () => {
      const trueMeta: GuardianErrorMeta = {
        got: true,
        expected: "string",
        comparison: "type",
      };
      const trueError = new GuardianError(
        "Expected ${expected}, got ${got}",
        trueMeta,
      );

      const falseMeta: GuardianErrorMeta = {
        got: false,
        expected: "string",
        comparison: "type",
      };
      const falseError = new GuardianError(
        "Expected ${expected}, got ${got}",
        falseMeta,
      );

      asserts.assertStringIncludes(trueError.message, "true");
      asserts.assertStringIncludes(falseError.message, "false");
    });

    await t.step("should format primitive values as strings", () => {
      const numberMeta: GuardianErrorMeta = {
        got: 42,
        expected: "string",
        comparison: "type",
      };
      const numberError = new GuardianError(
        "Expected ${expected}, got ${got}",
        numberMeta,
      );

      const stringMeta: GuardianErrorMeta = {
        got: "hello",
        expected: "number",
        comparison: "type",
      };
      const stringError = new GuardianError(
        "Expected ${expected}, got ${got}",
        stringMeta,
      );

      asserts.assertStringIncludes(numberError.message, "42");
      asserts.assertStringIncludes(stringError.message, "hello");
    });
  });

  await t.step("message templating", async (t) => {
    await t.step("should support variable replacement in messages", () => {
      const meta: GuardianErrorMeta = {
        type: "string",
        got: 42,
        expected: "string",
        comparison: "type",
      };
      const error = new GuardianError(
        "Expected ${expected}, got ${got} (type: ${type})",
        meta,
      );

      asserts.assertEquals(
        error.message,
        "Expected string, got 42 (type: string)",
      );
    });

    await t.step("should handle missing variables gracefully", () => {
      const meta: GuardianErrorMeta = {
        got: 42,
        comparison: "type",
      };
      const error = new GuardianError("Expected ${expected}, got ${got}", meta);

      asserts.assertStringIncludes(error.message, "got 42");
      asserts.assertStringIncludes(error.message, "Expected undefined");
    });

    await t.step("should include timestamp in message variables", () => {
      const meta: GuardianErrorMeta = {
        got: "test",
        comparison: "validation",
      };
      const error = new GuardianError(
        "Error at ${timeStamp}: ${message}",
        meta,
      );

      asserts.assertStringIncludes(error.message, "Error at");
      asserts.assertStringIncludes(error.message, "T");
      asserts.assertStringIncludes(error.message, "Z");
    });

    await t.step("should handle nested variable replacement", () => {
      const meta: GuardianErrorMeta = {
        got: "test value",
        comparison: "validation",
      };
      const error = new GuardianError("Validation failed: ${got}", meta);

      // The message should contain the formatted value
      asserts.assertStringIncludes(error.message, "test value");
    });
  });

  await t.step("edge cases and error conditions", async (t) => {
    await t.step("should handle empty causes object", () => {
      const meta: GuardianErrorMeta = {
        cause: {},
        got: "test",
        comparison: "validation",
      };
      const error = new GuardianError("Test error", meta);

      asserts.assertEquals(error.causeSize(), 0);
      asserts.assertEquals(error.listCauses(), {});
    });

    await t.step("should handle complex nested objects in got/expected", () => {
      const complexObject = {
        nested: {
          array: [1, 2, { deep: "value" }],
          date: new Date("2023-01-01"),
          regex: /test/g,
        },
      };

      const meta: GuardianErrorMeta = {
        got: complexObject,
        expected: "simple string",
        comparison: "type",
      };
      const error = new GuardianError("Expected ${expected}, got ${got}", meta);

      asserts.assertStringIncludes(error.message, "simple string");
      asserts.assertStringIncludes(error.message, "nested");
    });

    await t.step("should handle bigint values", () => {
      const meta: GuardianErrorMeta = {
        got: 42n,
        expected: "number",
        comparison: "type",
      };
      const error = new GuardianError("Expected ${expected}, got ${got}", meta);

      asserts.assertStringIncludes(error.message, "42");
    });

    await t.step("should handle symbol values", () => {
      const symbol = Symbol("test");
      const meta: GuardianErrorMeta = {
        got: symbol,
        expected: "string",
        comparison: "type",
      };
      const error = new GuardianError("Expected ${expected}, got ${got}", meta);

      asserts.assertStringIncludes(error.message, "Symbol(test)");
    });

    await t.step("should handle function values", () => {
      const func = () => "test";
      const meta: GuardianErrorMeta = {
        got: func,
        expected: "string",
        comparison: "type",
      };
      const error = new GuardianError("Expected ${expected}, got ${got}", meta);

      // Functions should be converted to string representation
      asserts.assertStringIncludes(error.message, "=>");
    });
  });

  await t.step("inheritance and compatibility", async (t) => {
    await t.step("should be instanceof Error and GuardianError", () => {
      const meta: GuardianErrorMeta = {
        got: "test",
        comparison: "validation",
      };
      const error = new GuardianError("Test error", meta);

      asserts.assertInstanceOf(error, Error);
      asserts.assertInstanceOf(error, GuardianError);
    });

    await t.step("should have correct error name", () => {
      const meta: GuardianErrorMeta = {
        got: "test",
        comparison: "validation",
      };
      const error = new GuardianError("Test error", meta);

      asserts.assertEquals(error.name, "GuardianError");
    });

    await t.step("should have stack trace", () => {
      const meta: GuardianErrorMeta = {
        got: "test",
        comparison: "validation",
      };
      const error = new GuardianError("Test error", meta);

      asserts.assertExists(error.stack);
      asserts.assertStringIncludes(error.stack!, "GuardianError");
    });
  });
});
