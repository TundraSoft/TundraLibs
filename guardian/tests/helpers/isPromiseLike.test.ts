import * as asserts from "$asserts";
import { isPromiseLike } from "../../helpers/mod.ts";

/**
 * Comprehensive test suite for isPromiseLike helper function.
 * Tests detection of promise-like objects (thenables) and async functions.
 */
Deno.test("guardian.helpers.isPromiseLike", async (t) => {
  await t.step("Native Promises", async (e) => {
    await e.step("basic promises", () => {
      asserts.assertEquals(isPromiseLike(Promise.resolve()), true);
      asserts.assertEquals(
        isPromiseLike(Promise.reject().catch(() => {})),
        true,
      );
      asserts.assertEquals(isPromiseLike(new Promise(() => {})), true);
    });

    await e.step("promise methods", () => {
      asserts.assertEquals(isPromiseLike(Promise.all([])), true);
      asserts.assertEquals(isPromiseLike(Promise.race([])), true);
      asserts.assertEquals(isPromiseLike(Promise.allSettled([])), true);
      asserts.assertEquals(
        isPromiseLike(Promise.any([Promise.resolve(1)])),
        true,
      );
    });

    await e.step("resolved and rejected promises", () => {
      asserts.assertEquals(isPromiseLike(Promise.resolve("value")), true);
      asserts.assertEquals(isPromiseLike(Promise.resolve(42)), true);
      asserts.assertEquals(isPromiseLike(Promise.resolve(null)), true);
      asserts.assertEquals(isPromiseLike(Promise.resolve(undefined)), true);
    });
  });

  await t.step("Thenable objects", async (e) => {
    await e.step("basic thenables", () => {
      const basicThenable = {
        then: () => {},
      };
      asserts.assertEquals(isPromiseLike(basicThenable), true);

      const thenableWithArgs = {
        then: (
          onResolve: (value: unknown) => void,
          onReject: (reason: unknown) => void,
        ) => {
          onResolve("success");
        },
      };
      asserts.assertEquals(isPromiseLike(thenableWithArgs), true);
    });

    await e.step("complex thenables", () => {
      const complexThenable = {
        then: function (
          onResolve: (value: unknown) => void,
          onReject: (reason: unknown) => void,
        ) {
          if (Math.random() > 0.5) {
            onResolve("success");
          } else {
            onReject(new Error("failure"));
          }
        },
        catch: function (onReject: (reason: unknown) => void) {
          return this.then(() => {}, onReject);
        },
      };
      asserts.assertEquals(isPromiseLike(complexThenable), true);

      // Thenable with additional promise-like methods
      const promiseLikeObject = {
        then: () => {},
        catch: () => {},
        finally: () => {},
      };
      asserts.assertEquals(isPromiseLike(promiseLikeObject), true);
    });

    await e.step("edge cases with then method", () => {
      // then method that throws
      const throwingThenable = {
        then() {
          throw new Error("then throws");
        },
      };
      asserts.assertEquals(isPromiseLike(throwingThenable), true);

      // then method with getter
      const getterThenable = {
        get then() {
          return () => {};
        },
      };
      asserts.assertEquals(isPromiseLike(getterThenable), true);

      // then method with setter
      const setterThenable = {
        _then: () => {},
        get then() {
          return this._then;
        },
        set then(value) {
          this._then = value;
        },
      };
      asserts.assertEquals(isPromiseLike(setterThenable), true);
    });
  });

  await t.step("Async functions", async (e) => {
    await e.step("arrow functions", () => {
      asserts.assertEquals(isPromiseLike(async () => {}), true);
      asserts.assertEquals(isPromiseLike(async () => "value"), true);
      asserts.assertEquals(isPromiseLike(async (x: number) => x * 2), true);
    });

    await e.step("function declarations", () => {
      async function namedAsyncFn() {}
      async function asyncWithReturn() {
        return "value";
      }
      async function asyncWithParams(a: number, b: string) {
        return { a, b };
      }

      asserts.assertEquals(isPromiseLike(namedAsyncFn), true);
      asserts.assertEquals(isPromiseLike(asyncWithReturn), true);
      asserts.assertEquals(isPromiseLike(asyncWithParams), true);
    });

    await e.step("async generator functions", () => {
      async function* asyncGenerator() {
        yield 1;
        yield 2;
      }

      asserts.assertEquals(isPromiseLike(asyncGenerator), true);
    });

    await e.step("async methods", () => {
      class TestClass {
        async method() {
          return "async method";
        }

        async *asyncGeneratorMethod() {
          yield "value";
        }
      }

      const instance = new TestClass();
      asserts.assertEquals(isPromiseLike(instance.method), true);
      asserts.assertEquals(isPromiseLike(instance.asyncGeneratorMethod), true);
    });
  });

  await t.step("Non-promise-like values", async (e) => {
    await e.step("primitives", () => {
      asserts.assertEquals(isPromiseLike(null), false);
      asserts.assertEquals(isPromiseLike(undefined), false);
      asserts.assertEquals(isPromiseLike("string"), false);
      asserts.assertEquals(isPromiseLike(42), false);
      asserts.assertEquals(isPromiseLike(true), false);
      asserts.assertEquals(isPromiseLike(false), false);
      asserts.assertEquals(isPromiseLike(Symbol("test")), false);
      asserts.assertEquals(isPromiseLike(BigInt(123)), false);
    });

    await e.step("regular functions", () => {
      asserts.assertEquals(isPromiseLike(() => {}), false);
      asserts.assertEquals(isPromiseLike(function () {}), false);
      asserts.assertEquals(isPromiseLike(function named() {}), false);

      // Generator functions are not promise-like
      function* generator() {
        yield 1;
      }
      asserts.assertEquals(isPromiseLike(generator), false);

      // Built-in functions
      asserts.assertEquals(isPromiseLike(Math.max), false);
      asserts.assertEquals(isPromiseLike(console.log), false);
      asserts.assertEquals(isPromiseLike(Array.isArray), false);
    });

    await e.step("objects without then method", () => {
      asserts.assertEquals(isPromiseLike({}), false);
      asserts.assertEquals(isPromiseLike([]), false);
      asserts.assertEquals(isPromiseLike(new Date()), false);
      asserts.assertEquals(isPromiseLike(/test/), false);
      asserts.assertEquals(isPromiseLike(new Map()), false);
      asserts.assertEquals(isPromiseLike(new Set()), false);
      asserts.assertEquals(isPromiseLike(new Error()), false);

      const objectWithOtherMethods = {
        catch: () => {},
        finally: () => {},
        resolve: () => {},
        reject: () => {},
      };
      asserts.assertEquals(isPromiseLike(objectWithOtherMethods), false);
    });

    await e.step("objects with non-function then property", () => {
      const objectWithThenString = {
        then: "not a function",
      };
      asserts.assertEquals(isPromiseLike(objectWithThenString), false);

      const objectWithThenNumber = {
        then: 42,
      };
      asserts.assertEquals(isPromiseLike(objectWithThenNumber), false);

      const objectWithThenNull = {
        then: null,
      };
      asserts.assertEquals(isPromiseLike(objectWithThenNull), false);

      const objectWithThenUndefined = {
        then: undefined,
      };
      asserts.assertEquals(isPromiseLike(objectWithThenUndefined), false);
    });
  });

  await t.step("Functions with then property", () => {
    // Regular functions with then property should NOT be considered promise-like
    const functionWithThen = () => {};
    (functionWithThen as unknown as { then: () => void }).then = () => {};
    asserts.assertEquals(isPromiseLike(functionWithThen), false);

    // Only async functions should be considered promise-like, not regular functions
    function regularFunction() {
      return "not async";
    }
    (regularFunction as unknown as { then: () => void }).then = () => {};
    asserts.assertEquals(isPromiseLike(regularFunction), false);
  });

  await t.step("Class instances", async (e) => {
    await e.step("regular classes", () => {
      class RegularClass {
        value = 42;
      }
      asserts.assertEquals(isPromiseLike(new RegularClass()), false);
    });

    await e.step("classes with then method", () => {
      class ClassWithThen {
        then() {
          return "not a real thenable";
        }
      }
      asserts.assertEquals(isPromiseLike(new ClassWithThen()), true);

      class PromiseLikeClass {
        then(
          onResolve?: (value: unknown) => void,
          onReject?: (reason: unknown) => void,
        ) {
          setTimeout(() => onResolve?.(42), 0);
        }
      }
      asserts.assertEquals(isPromiseLike(new PromiseLikeClass()), true);
    });

    await e.step("classes themselves", () => {
      class TestClass {}
      class AsyncClass {
        async method() {}
      }

      // Classes are functions, not promise-like
      asserts.assertEquals(isPromiseLike(TestClass), false);
      asserts.assertEquals(isPromiseLike(AsyncClass), false);
    });
  });

  await t.step("Prototype chain handling", () => {
    // Object with then in prototype
    const parent = { then: () => {} };
    const child = Object.create(parent);
    asserts.assertEquals(isPromiseLike(child), true);

    // Multiple levels of prototype chain
    const grandparent = { then: () => {} };
    const parent2 = Object.create(grandparent);
    const child2 = Object.create(parent2);
    asserts.assertEquals(isPromiseLike(child2), true);

    // Prototype with non-function then
    const parentWithBadThen = { then: "not a function" };
    const childOfBadThen = Object.create(parentWithBadThen);
    asserts.assertEquals(isPromiseLike(childOfBadThen), false);
  });

  await t.step("Third-party promise libraries", () => {
    // Simulate popular promise library patterns

    // Bluebird-style promise
    const bluebirdLike = {
      then: (
        onResolve: (value: unknown) => void,
        onReject: (reason: unknown) => void,
      ) => {},
      catch: (onReject: (reason: unknown) => void) => {},
      finally: (onFinally: () => void) => {},
      timeout: (ms: number) => {},
      cancel: () => {},
    };
    asserts.assertEquals(isPromiseLike(bluebirdLike), true);

    // Q-style promise
    const qLike = {
      then: (
        onResolve: (value: unknown) => void,
        onReject: (reason: unknown) => void,
        onProgress: (progress: unknown) => void,
      ) => {},
      catch: (onReject: (reason: unknown) => void) => {},
      fin: (callback: () => void) => {},
      progress: (onProgress: (progress: unknown) => void) => {},
    };
    asserts.assertEquals(isPromiseLike(qLike), true);

    // jQuery Deferred-style
    const jqueryDeferred = {
      then: () => {},
      done: () => {},
      fail: () => {},
      always: () => {},
      state: () => "pending",
    };
    asserts.assertEquals(isPromiseLike(jqueryDeferred), true);
  });

  await t.step("Special object types", async (e) => {
    await e.step("frozen and sealed objects", () => {
      const frozenThenable = Object.freeze({ then: () => {} });
      asserts.assertEquals(isPromiseLike(frozenThenable), true);

      const sealedThenable = Object.seal({ then: () => {} });
      asserts.assertEquals(isPromiseLike(sealedThenable), true);

      const frozenNonThenable = Object.freeze({ value: 42 });
      asserts.assertEquals(isPromiseLike(frozenNonThenable), false);
    });

    await e.step("objects with null prototype", () => {
      const nullProtoThenable = Object.create(null);
      nullProtoThenable.then = () => {};
      asserts.assertEquals(isPromiseLike(nullProtoThenable), true);

      const nullProtoNonThenable = Object.create(null);
      nullProtoNonThenable.value = 42;
      asserts.assertEquals(isPromiseLike(nullProtoNonThenable), false);
    });

    await e.step("array-like objects with then", () => {
      const arrayLikeWithThen = {
        0: "first",
        1: "second",
        length: 2,
        then: () => {},
      };
      asserts.assertEquals(isPromiseLike(arrayLikeWithThen), true);

      // Arguments-like object with then
      function createArgsLikeWithThen(...args: string[]) {
        const argsLike = Array.prototype.slice.call(args);
        (argsLike as unknown as { then: () => void }).then = () => {};
        return argsLike;
      }

      const argsLikeWithThen = createArgsLikeWithThen("a", "b", "c");
      asserts.assertEquals(isPromiseLike(argsLikeWithThen), true);
    });

    await e.step("error objects with then method", () => {
      const errorWithThen = new Error("test error");
      (errorWithThen as unknown as { then: () => void }).then = () => {};
      asserts.assertEquals(isPromiseLike(errorWithThen), true);

      const customErrorWithThen = new TypeError("type error");
      (customErrorWithThen as unknown as { then: () => void }).then = () => {};
      asserts.assertEquals(isPromiseLike(customErrorWithThen), true);
    });
  });

  await t.step("Edge cases and safety", async (e) => {
    await e.step("circular references", () => {
      const circular: { then?: () => unknown; self?: unknown } = {};
      circular.then = () => circular;
      circular.self = circular;

      // Should not crash or hang
      asserts.assertEquals(isPromiseLike(circular), true);

      const circularNonThenable: { self?: unknown } = {};
      circularNonThenable.self = circularNonThenable;
      asserts.assertEquals(isPromiseLike(circularNonThenable), false);
    });

    await e.step("arguments object", () => {
      function testArgs() {
        return isPromiseLike(arguments);
      }

      // Arguments object should not be promise-like
      asserts.assertEquals(testArgs(), false);
    });

    await e.step("toString() failures", () => {
      // Function with problematic toString
      const funcWithBadToString = async () => {};
      Object.defineProperty(funcWithBadToString, "toString", {
        value: () => {
          throw new Error("toString fails");
        },
      });

      // Should still work via constructor name
      asserts.assertEquals(isPromiseLike(funcWithBadToString), true);
    });
  });

  await t.step("Performance and consistency", async (e) => {
    await e.step("consistent behavior", () => {
      const testCases = [
        { value: Promise.resolve(), expected: true },
        { value: { then: () => {} }, expected: true },
        { value: async () => {}, expected: true },
        { value: {}, expected: false },
        { value: null, expected: false },
        { value: "string", expected: false },
        { value: () => {}, expected: false },
      ];

      // Test multiple times to ensure consistency
      for (let iteration = 0; iteration < 10; iteration++) {
        for (const { value, expected } of testCases) {
          asserts.assertEquals(
            isPromiseLike(value),
            expected,
            `Iteration ${iteration}: ${JSON.stringify(value)} should ${
              expected ? "be" : "not be"
            } promise-like`,
          );
        }
      }
    });

    await e.step("performance requirements", () => {
      // Test performance with many checks
      const testValues = [
        Promise.resolve(),
        { then: () => {} },
        async () => {},
        {},
        null,
        "string",
        42,
        () => {},
      ];

      const start = performance.now();

      for (let i = 0; i < 1000; i++) {
        for (const value of testValues) {
          isPromiseLike(value);
        }
      }

      const end = performance.now();

      // Should complete quickly even with many iterations
      asserts.assert(end - start < 100, "isPromiseLike should be performant");
    });
  });

  await t.step("Documentation examples", () => {
    // Test all examples from the documentation to ensure they work as documented

    // Native Promises
    asserts.assertEquals(isPromiseLike(Promise.resolve()), true);
    asserts.assertEquals(isPromiseLike(Promise.reject().catch(() => {})), true);

    // Thenable objects
    asserts.assertEquals(isPromiseLike({ then: () => {} }), true);
    asserts.assertEquals(
      isPromiseLike({
        then: (
          resolve: (value: unknown) => void,
          reject: (reason: unknown) => void,
        ) => resolve(42),
      }),
      true,
    );

    // Async functions
    asserts.assertEquals(isPromiseLike(async () => {}), true);
    asserts.assertEquals(isPromiseLike(async function () {}), true);

    // Non-promise-like values
    asserts.assertEquals(isPromiseLike({}), false);
    asserts.assertEquals(isPromiseLike(() => {}), false); // regular function
    asserts.assertEquals(isPromiseLike({ then: "not a function" }), false);
    asserts.assertEquals(isPromiseLike(null), false);
    asserts.assertEquals(isPromiseLike(undefined), false);
  });
});
