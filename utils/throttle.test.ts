// throttle.test.ts

import * as asserts from '$asserts';
import { Throttle, throttle } from './throttle.ts';

Deno.test({
  name: 'utils.throttle',
}, async (t) => {
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
});
