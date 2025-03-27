// deno-lint-ignore-file no-explicit-any
// throttle.test.ts

import * as asserts from '$asserts';
import { Throttle, throttle } from './throttle.ts';

Deno.test('utils.throttle', async (t) => {
  await t.step('should throttle function calls', async () => {
    let counter = 0;
    const add = (a: number, b: number): number => {
      counter++;
      return a + b;
    };
    const throttledAdd = throttle(add, 500);
    asserts.assertEquals(throttledAdd(1, 2), 3);
    asserts.assertEquals(throttledAdd(1, 2), 3);
    asserts.assertEquals(counter, 1);
    asserts.assertEquals(throttledAdd(2, 1), 3);
    asserts.assertEquals(counter, 2);
    asserts.assertEquals(throttledAdd(2, 1), 3);
    asserts.assertEquals(counter, 2);
    asserts.assertEquals(throttledAdd(2, 1), 3);
    asserts.assertEquals(counter, 2);
    // Wait for the throttle to reset
    await new Promise((resolve) => setTimeout(resolve, 500));
    asserts.assertEquals(throttledAdd(1, 2), 3);
    asserts.assertEquals(counter, 3);
  });

  await t.step('should throttle async function calls', async () => {
    let counter = 0;
    const add = async (a: number, b: number): Promise<number> => {
      counter++;
      await 1;
      return a + b;
    };
    const throttledAdd = throttle(add, 500);
    asserts.assertEquals(await throttledAdd(1, 2), 3);
    asserts.assertEquals(await throttledAdd(1, 2), 3);
    asserts.assertEquals(counter, 1);
    asserts.assertEquals(await throttledAdd(2, 1), 3);
    asserts.assertEquals(counter, 2);
    asserts.assertEquals(await throttledAdd(2, 1), 3);
    asserts.assertEquals(counter, 2);
    asserts.assertEquals(await throttledAdd(2, 1), 3);
    asserts.assertEquals(counter, 2);
    // Wait for the throttle to reset
    await new Promise((resolve) => setTimeout(resolve, 500));
    asserts.assertEquals(await throttledAdd(1, 2), 3);
    asserts.assertEquals(counter, 3);
  });

  await t.step(
    'should throttle function calls with arguments ignored',
    async () => {
      let counter = 0;
      const add = (a: number, b: number): number => {
        counter++;
        return a + b;
      };
      const throttledAdd = throttle(add, 500, true);
      asserts.assertEquals(throttledAdd(1, 2), 3);
      asserts.assertEquals(throttledAdd(2, 1), 3);
      asserts.assertEquals(counter, 1);
      asserts.assertEquals(throttledAdd(2, 1), 3);
      asserts.assertEquals(counter, 1);
      asserts.assertEquals(throttledAdd(2, 1), 3);
      asserts.assertEquals(counter, 1);
      asserts.assertEquals(throttledAdd(2, 1), 3);
      asserts.assertEquals(counter, 1);
      // Wait for the throttle to reset
      await new Promise((resolve) => setTimeout(resolve, 500));
      asserts.assertEquals(throttledAdd(1, 2), 3);
      asserts.assertEquals(counter, 2);
    },
  );

  await t.step(
    'should throttle async function calls with arguments ignored',
    async () => {
      let counter = 0;
      const add = async (a: number, b: number): Promise<number> => {
        counter++;
        await 1;
        return a + b;
      };
      const throttledAdd = throttle(add, 500, true);
      asserts.assertEquals(await throttledAdd(1, 2), 3);
      asserts.assertEquals(await throttledAdd(2, 1), 3);
      asserts.assertEquals(counter, 1);
      asserts.assertEquals(await throttledAdd(2, 1), 3);
      asserts.assertEquals(counter, 1);
      asserts.assertEquals(await throttledAdd(2, 1), 3);
      asserts.assertEquals(counter, 1);
      asserts.assertEquals(await throttledAdd(2, 1), 3);
      asserts.assertEquals(counter, 1);
      // Wait for the throttle to reset
      await new Promise((resolve) => setTimeout(resolve, 500));
      asserts.assertEquals(await throttledAdd(1, 2), 3);
      asserts.assertEquals(counter, 2);
    },
  );

  await t.step('should throttle method calls', async () => {
    class Calculator {
      static counter = 0;
      @Throttle(500)
      multiply(a: number, b: number): number {
        Calculator.counter++;
        return a * b;
      }
    }
    const calculator = new Calculator();
    asserts.assertEquals(calculator.multiply(1, 2), 2);
    asserts.assertEquals(calculator.multiply(1, 2), 2);
    asserts.assertEquals(Calculator.counter, 1);
    asserts.assertEquals(calculator.multiply(2, 2), 4);
    asserts.assertEquals(Calculator.counter, 2);
    asserts.assertEquals(calculator.multiply(2, 2), 4);
    asserts.assertEquals(Calculator.counter, 2);

    // Wait for the throttle to reset
    await new Promise((resolve) => setTimeout(resolve, 500));
    asserts.assertEquals(calculator.multiply(2, 2), 4);
    asserts.assertEquals(Calculator.counter, 3);
  });

  await t.step('should throttle async method calls', async () => {
    class Calculator {
      static counter = 0;
      @Throttle(500)
      async multiply(a: number, b: number): Promise<number> {
        Calculator.counter++;
        await 1;
        return a * b;
      }
    }
    const calculator = new Calculator();
    asserts.assertEquals(await calculator.multiply(1, 2), 2);
    asserts.assertEquals(await calculator.multiply(1, 2), 2);
    asserts.assertEquals(Calculator.counter, 1);
    asserts.assertEquals(await calculator.multiply(2, 2), 4);
    asserts.assertEquals(Calculator.counter, 2);
    asserts.assertEquals(await calculator.multiply(2, 2), 4);
    asserts.assertEquals(Calculator.counter, 2);
    // Wait for the throttle to reset
    await new Promise((resolve) => setTimeout(resolve, 500));
    asserts.assertEquals(await calculator.multiply(2, 2), 4);
    asserts.assertEquals(Calculator.counter, 3);
  });

  await t.step(
    'should throttle method calls with arguments ignored',
    async () => {
      class Calculator {
        static counter = 0;
        @Throttle(500, true)
        multiply(a: number, b: number): number {
          Calculator.counter++;
          return a * b;
        }
      }
      const calculator = new Calculator();
      asserts.assertEquals(calculator.multiply(2, 2), 4);
      asserts.assertEquals(calculator.multiply(2, 2), 4);
      asserts.assertEquals(Calculator.counter, 1);
      asserts.assertEquals(calculator.multiply(2, 2), 4);
      asserts.assertEquals(Calculator.counter, 1);
      asserts.assertEquals(calculator.multiply(2, 2), 4);
      asserts.assertEquals(Calculator.counter, 1);
      asserts.assertEquals(calculator.multiply(2, 2), 4);
      asserts.assertEquals(Calculator.counter, 1);

      // Wait for the throttle to reset
      await new Promise((resolve) => setTimeout(resolve, 500));
      asserts.assertEquals(calculator.multiply(2, 2), 4);
      asserts.assertEquals(Calculator.counter, 2);
    },
  );

  await t.step('should handle function errors gracefully', async () => {
    let counter = 0;
    const errorFn = (throwError: boolean): number => {
      counter++;
      if (throwError) {
        throw new Error('Test error');
      }
      return 42;
    };

    const throttledFn = throttle(errorFn, 500);

    // First call throws error
    try {
      throttledFn(true);
      asserts.fail('Should have thrown an error');
    } catch (error) {
      asserts.assert(error instanceof Error);
      asserts.assertEquals(error.message, 'Test error');
    }

    // Second call should work and be executed (not throttled by error)
    asserts.assertEquals(throttledFn(false), 42);
    asserts.assertEquals(counter, 2);

    // Give the test proper async handling
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

  await t.step('should handle circular reference arguments', async () => {
    let counter = 0;
    const circularFn = (_obj: any): number => {
      counter++;
      return 42;
    };

    const throttledFn = throttle(circularFn, 500);
    const circular: any = { prop: 'value' };
    circular.self = circular;

    // Should not throw and successfully throttle
    asserts.assertEquals(throttledFn(circular), 42);
    asserts.assertEquals(throttledFn(circular), 42);
    asserts.assertEquals(counter, 1);

    // Wait for the throttle to reset
    await new Promise((resolve) => setTimeout(resolve, 500));
    asserts.assertEquals(throttledFn(circular), 42);
    asserts.assertEquals(counter, 2);
  });

  await t.step('should clean up memory after delay expires', async () => {
    let counter = 0;
    const fn = (): number => {
      counter++;
      return 42;
    };

    const throttledFn = throttle(fn, 200);

    throttledFn();
    asserts.assertEquals(counter, 1);

    // Wait past the throttle delay
    await new Promise((resolve) => setTimeout(resolve, 300));

    // This should execute again
    throttledFn();
    asserts.assertEquals(counter, 2);

    // Wait for cleanup
    await new Promise((resolve) => setTimeout(resolve, 300));

    // This should execute again as the entry should be cleared
    throttledFn();
    asserts.assertEquals(counter, 3);
  });
});
