import { assertEquals, assertRejects, assertThrows } from '$asserts';
import { GuardianError } from '../../GuardianError.ts';
import { FunctionGuardian } from '../../guards/mod.ts';

const delay = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms * 1000));

Deno.test('FunctionGuardian', async (t) => {
  await t.step('create', async (t) => {
    await t.step('passes through function values', () => {
      const func = (a: number, b: number) => a + b;
      const guard = FunctionGuardian.create();
      const validated = guard(func);
      assertEquals(typeof validated, 'function');
      assertEquals(validated(2, 3), 5);
    });

    await t.step('throws for non-function values', () => {
      const guard = FunctionGuardian.create();
      assertThrows(
        () => guard('not a function'),
        GuardianError,
        'Expected function, got string',
      );
      assertThrows(
        () => guard(42),
        GuardianError,
        'Expected function, got number',
      );
      assertThrows(
        () => guard({}),
        GuardianError,
        'Expected function, got object',
      );
      assertThrows(
        () => guard(null),
        GuardianError,
        'Expected function, got null',
      );
      assertThrows(
        () => guard(undefined),
        GuardianError,
        'Expected function, got undefined',
      );
    });

    await t.step('uses custom error message when provided', () => {
      const guard = FunctionGuardian.create('Custom error message');
      assertThrows(() => guard(42), GuardianError, 'Custom error message');
    });
  });

  await t.step('parameter validations', async (t) => {
    await t.step('parameters', async (t) => {
      await t.step('passes when function has exact parameter count', () => {
        const func = (a: number, b: number) => a + b;
        const guard = FunctionGuardian.create().parameters(2);
        const validated = guard(func);
        assertEquals(validated(2, 3), 5);
      });

      await t.step('throws when function has incorrect parameter count', () => {
        const func = (a: number, b: number) => a + b;
        const guard = FunctionGuardian.create().parameters(3);
        assertThrows(
          () => guard(func),
          GuardianError,
          'Expected function to have 3 parameters',
        );
      });
    });

    await t.step('minParameters', async (t) => {
      await t.step('passes when function has minimum parameter count', () => {
        const func = (a: number, b: number) => a + b;
        const guard = FunctionGuardian.create().minParameters(2);
        const validated = guard(func);
        assertEquals(validated(2, 3), 5);

        const guard2 = FunctionGuardian.create().minParameters(1);
        const validated2 = guard2(func);
        assertEquals(validated2(2, 3), 5);
      });

      await t.step('throws when function has too few parameters', () => {
        const func = (a: number) => a * 2;
        const guard = FunctionGuardian.create().minParameters(2);
        assertThrows(
          () => guard(func),
          GuardianError,
          'Expected function to have at least 2 parameters',
        );
      });
    });

    await t.step('maxParameters', async (t) => {
      await t.step('passes when function has maximum parameter count', () => {
        const func = (a: number, b: number) => a + b;
        const guard = FunctionGuardian.create().maxParameters(2);
        const validated = guard(func);
        assertEquals(validated(2, 3), 5);

        const guard2 = FunctionGuardian.create().maxParameters(3);
        const validated2 = guard2(func);
        assertEquals(validated2(2, 3), 5);
      });

      await t.step('throws when function has too many parameters', () => {
        const func = (a: number, b: number, c: number) => a + b + c;
        const guard = FunctionGuardian.create().maxParameters(2);
        assertThrows(
          () => guard(func),
          GuardianError,
          'Expected function to have at most 2 parameters',
        );
      });
    });
  });

  await t.step('function type validations', async (t) => {
    await t.step('isAsync', async (t) => {
      await t.step('passes when function is async', () => {
        const asyncFunc = async () => 42;
        const guard = FunctionGuardian.create().isAsync();
        const validated = guard(asyncFunc);
        assertEquals(typeof validated, 'function');
      });

      await t.step('passes when function returns a Promise', () => {
        const promiseFunc = () => Promise.resolve(42);
        const guard = FunctionGuardian.create().isAsync();
        const validated = guard(promiseFunc);
        assertEquals(typeof validated, 'function');
      });

      await t.step('throws when function is synchronous', () => {
        const syncFunc = () => 42;
        const guard = FunctionGuardian.create().isAsync();
        assertThrows(
          () => guard(syncFunc),
          GuardianError,
          'Expected function to be async',
        );
      });
    });

    await t.step('isSync', async (t) => {
      await t.step('passes when function is synchronous', () => {
        const syncFunc = () => 42;
        const guard = FunctionGuardian.create().isSync();
        const validated = guard(syncFunc);
        assertEquals(typeof validated, 'function');
        assertEquals(validated(), 42);
      });

      await t.step('throws when function is async', () => {
        const asyncFunc = async () => 42;
        const guard = FunctionGuardian.create().isSync();
        assertThrows(
          () => guard(asyncFunc),
          GuardianError,
          'Expected function to be synchronous',
        );
      });

      await t.step('throws when function returns a Promise', () => {
        const promiseFunc = () => Promise.resolve(42);
        const guard = FunctionGuardian.create().isSync();
        assertThrows(
          () => guard(promiseFunc),
          GuardianError,
          'Expected function to be synchronous',
        );
      });
    });
  });

  await t.step('chaining validations', () => {
    const func = (a: number, b: number) => a + b;
    const guard = FunctionGuardian.create()
      .parameters(2)
      .isSync();

    const validated = guard(func);
    assertEquals(validated(2, 3), 5);

    const asyncFunc = async (a: number, b: number) => a + b;
    assertThrows(() => guard(asyncFunc), GuardianError);

    const singleParamFunc = (a: number) => a * 2;
    assertThrows(() => guard(singleParamFunc), GuardianError);
  });

  await t.step('additional parameter validation tests', async (t) => {
    await t.step('validates arrow functions with various parameters', () => {
      const noParamsFn = () => 42;
      const oneParamFn = (a: number) => a * 2;
      const twoParamsFn = (a: number, b: number) => a + b;
      const restParamsFn = (...args: number[]) =>
        args.reduce((a, b) => a + b, 0);

      assertEquals(
        FunctionGuardian.create().parameters(0)(noParamsFn),
        noParamsFn,
      );
      assertEquals(
        FunctionGuardian.create().parameters(1)(oneParamFn),
        oneParamFn,
      );
      assertEquals(
        FunctionGuardian.create().parameters(2)(twoParamsFn),
        twoParamsFn,
      );
      assertEquals(
        FunctionGuardian.create().parameters(0)(restParamsFn),
        restParamsFn,
      );

      assertThrows(
        () => FunctionGuardian.create().parameters(1)(noParamsFn),
        GuardianError,
      );
      assertThrows(
        () => FunctionGuardian.create().parameters(2)(oneParamFn),
        GuardianError,
      );
    });

    await t.step('validates traditional functions', () => {
      function noParams() {
        return 42;
      }
      function oneParam(a: number) {
        return a * 2;
      }
      function twoParams(a: number, b: number) {
        return a + b;
      }

      assertEquals(FunctionGuardian.create().parameters(0)(noParams), noParams);
      assertEquals(FunctionGuardian.create().parameters(1)(oneParam), oneParam);
      assertEquals(
        FunctionGuardian.create().parameters(2)(twoParams),
        twoParams,
      );
    });

    await t.step('validates class methods and constructors', () => {
      class TestClass {
        constructor(name: string) {
          this.name = name;
        }

        name: string;

        greet() {
          return `Hello, ${this.name}`;
        }

        add(a: number, b: number) {
          return a + b;
        }
      }

      const instance = new TestClass('Test');

      assertEquals(
        FunctionGuardian.create().parameters(0)(instance.greet),
        instance.greet,
      );
      assertEquals(
        FunctionGuardian.create().parameters(2)(instance.add),
        instance.add,
      );
    });
  });

  await t.step('async function validation', async (t) => {
    await t.step('identifies async functions correctly', async () => {
      const asyncFn = async () => 42;
      const syncFn = () => 42;
      const asyncWithParams = async (a: number, b: number) => a + b;

      assertEquals(FunctionGuardian.create().isAsync()(asyncFn), asyncFn);
      assertEquals(
        FunctionGuardian.create().isAsync()(asyncWithParams),
        asyncWithParams,
      );
      assertThrows(
        () => FunctionGuardian.create().isAsync()(syncFn),
        GuardianError,
      );
    });

    await t.step('validates functions returning promises as async', () => {
      const promiseFn = () => Promise.resolve(42);
      assertEquals(FunctionGuardian.create().isAsync()(promiseFn), promiseFn);
    });

    await t.step('correctly identifies sync functions', () => {
      const syncFn = () => 42;
      const syncWithParams = (a: number, b: number) => a + b;

      assertEquals(FunctionGuardian.create().isSync()(syncFn), syncFn);
      assertEquals(
        FunctionGuardian.create().isSync()(syncWithParams),
        syncWithParams,
      );
      assertThrows(
        () => FunctionGuardian.create().isSync()(async () => 42),
        GuardianError,
      );
    });
  });

  await t.step('combining multiple function validations', async (t) => {
    await t.step('combines isAsync with parameter validation', () => {
      const asyncFn = async (a: number, b: number) => a + b;
      const complexGuard = FunctionGuardian.create()
        .parameters(2)
        .isAsync();

      assertEquals(complexGuard(asyncFn), asyncFn);

      // Should fail on sync function with 2 params
      assertThrows(
        () => complexGuard((a: number, b: number) => a + b),
        GuardianError,
      );

      // Should fail on async function with wrong param count
      assertThrows(
        () => complexGuard(async (a: number) => a * 2),
        GuardianError,
      );
    });

    await t.step('validates variadic functions correctly', () => {
      function sum(...numbers: number[]) {
        return numbers.reduce((a, b) => a + b, 0);
      }

      // This should pass because rest parameters count as 0 formal parameters
      assertEquals(FunctionGuardian.create().parameters(0)(sum), sum);

      // Can combine with max/min params
      assertEquals(
        FunctionGuardian.create().minParameters(0).maxParameters(0)(sum),
        sum,
      );
    });
  });
});
