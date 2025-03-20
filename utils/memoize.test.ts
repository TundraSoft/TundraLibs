import * as asserts from '$asserts';
import { Memoize, memoize } from './memoize.ts';

Deno.test('utils.memoize', async (t) => {
  await t.step('should memoize the result of a function', () => {
    let counter = 0;
    const add = (a: number, b: number): number => {
      counter++;
      return a + b;
    };
    const memoizedAdd = memoize(add, 1);
    asserts.assertEquals(memoizedAdd(1, 2), 3);
    asserts.assertEquals(memoizedAdd(1, 2), 3);
    asserts.assertEquals(counter, 1);
    asserts.assertEquals(memoizedAdd(2, 3), 5);
    asserts.assertEquals(memoizedAdd(2, 3), 5);
    asserts.assertEquals(counter, 2);
  });

  await t.step('should memoize the result of a method', () => {
    class Calculator {
      static counter = 0;
      @Memoize(1)
      multiply(a: number, b: number): number {
        Calculator.counter++;
        return a * b;
      }
    }

    const calc = new Calculator();
    asserts.assertEquals(calc.multiply(2, 3), 6);
    asserts.assertEquals(calc.multiply(2, 3), 6);
    asserts.assertEquals(Calculator.counter, 1);
    asserts.assertEquals(calc.multiply(4, 5), 20);
    asserts.assertEquals(calc.multiply(4, 5), 20);
    asserts.assertEquals(Calculator.counter, 2);
  });

  await t.step('should memoize the result of an async function', async () => {
    let counter = 0;
    const add = async (a: number, b: number): Promise<number> => {
      // Set a 500ms delay to simulate an async operation
      await new Promise((resolve) => setTimeout(resolve, 250));
      counter++;
      return a + b;
    };
    const memoizedAdd = memoize(add);
    asserts.assertEquals(await memoizedAdd(1, 2), 3);
    asserts.assertEquals(await memoizedAdd(1, 2), 3);
    asserts.assertEquals(counter, 1);
    asserts.assertEquals(await memoizedAdd(2, 3), 5);
    asserts.assertEquals(await memoizedAdd(2, 3), 5);
    asserts.assertEquals(counter, 2);
  });

  await t.step('should memoize the result of an async method', async () => {
    class Calculator {
      static counter = 0;
      @Memoize(1)
      async multiply(a: number, b: number): Promise<number> {
        // Set a 500ms delay to simulate an async operation
        await new Promise((resolve) => setTimeout(resolve, 250));
        Calculator.counter++;
        return a * b;
      }
    }

    const calc = new Calculator();
    asserts.assertEquals(await calc.multiply(2, 3), 6);
    asserts.assertEquals(await calc.multiply(2, 3), 6);
    asserts.assertEquals(Calculator.counter, 1);
    asserts.assertEquals(await calc.multiply(4, 5), 20);
    asserts.assertEquals(await calc.multiply(4, 5), 20);
    asserts.assertEquals(Calculator.counter, 2);
  });

  await t.step('should reset the cache after the timeout', async () => {
    let counter = 0;
    const add = async (a: number, b: number): Promise<number> => {
      // Set a 500ms delay to simulate an async operation
      await new Promise((resolve) => setTimeout(resolve, 250));
      counter++;
      return a + b;
    };
    const memoizedAdd = memoize(add, 1);
    asserts.assertEquals(await memoizedAdd(1, 2), 3);
    asserts.assertEquals(await memoizedAdd(1, 2), 3);
    asserts.assertEquals(counter, 1);
    // Wait for the cache to expire
    await new Promise((resolve) => setTimeout(resolve, 1000));
    asserts.assertEquals(await memoizedAdd(1, 2), 3);
    asserts.assertEquals(counter, 2);
  });

  await t.step(
    'should reset the cache after the timeout for a method',
    async () => {
      class Calculator {
        static counter = 0;
        @Memoize(1)
        async multiply(a: number, b: number): Promise<number> {
          // Set a 500ms delay to simulate an async operation
          await new Promise((resolve) => setTimeout(resolve, 250));
          Calculator.counter++;
          return a * b;
        }
      }

      const calc = new Calculator();
      asserts.assertEquals(await calc.multiply(2, 3), 6);
      asserts.assertEquals(await calc.multiply(2, 3), 6);
      asserts.assertEquals(Calculator.counter, 1);
      // Wait for the cache to expire
      await new Promise((resolve) => setTimeout(resolve, 1000));
      asserts.assertEquals(await calc.multiply(2, 3), 6);
      asserts.assertEquals(Calculator.counter, 2);
    },
  );

  await t.step('should handle functions that throw errors', () => {
    let counter = 0;
    const division = (a: number, b: number): number => {
      counter++;
      if (b === 0) throw new Error('Division by zero');
      return a / b;
    };

    const memoizedDivision = memoize(division, 60);

    // First call with valid input
    asserts.assertEquals(memoizedDivision(10, 2), 5);
    asserts.assertEquals(counter, 1);

    // Same call should be memoized
    asserts.assertEquals(memoizedDivision(10, 2), 5);
    asserts.assertEquals(counter, 1);

    // Error should be thrown and not memoized
    asserts.assertThrows(
      () => memoizedDivision(10, 0),
      Error,
      'Division by zero',
    );
    asserts.assertEquals(counter, 2);

    // Error case should not be cached
    asserts.assertThrows(
      () => memoizedDivision(10, 0),
      Error,
      'Division by zero',
    );
    asserts.assertEquals(counter, 3);
  });

  await t.step('should correctly memoize with complex object arguments', () => {
    let counter = 0;
    const processObject = (obj: Record<string, unknown>): string => {
      counter++;
      return JSON.stringify(obj);
    };

    const memoizedProcess = memoize(processObject, 60);

    const obj1 = { name: 'Test', nested: { value: 42 } };
    const obj2 = { name: 'Test', nested: { value: 42 } }; // Same structure but different reference
    const obj3 = { name: 'Test', nested: { value: 43 } }; // Different value

    const result1 = memoizedProcess(obj1);
    asserts.assertEquals(counter, 1);

    // Same structure should be memoized regardless of reference
    const result2 = memoizedProcess(obj2);
    asserts.assertEquals(counter, 1);
    asserts.assertEquals(result1, result2);

    // Different structure should not be memoized
    memoizedProcess(obj3);
    asserts.assertEquals(counter, 2);
  });
});
