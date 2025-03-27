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
      counter = 0;
      @Memoize(1)
      multiply(a: number, b: number): number {
        this.counter++;
        return a * b;
      }
    }

    const calc = new Calculator();
    asserts.assertEquals(calc.multiply(2, 3), 6);
    asserts.assertEquals(calc.multiply(2, 3), 6);
    asserts.assertEquals(calc.counter, 1);
    asserts.assertEquals(calc.multiply(4, 5), 20);
    asserts.assertEquals(calc.multiply(4, 5), 20);
    asserts.assertEquals(calc.counter, 2);
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

  await t.step(
    'should memoize getter methods in a class with decorator',
    async () => {
      class Person {
        private _name: string;
        private callCount = 0;

        constructor(name: string) {
          this._name = name;
        }

        @Memoize(1)
        get fullName(): string {
          this.callCount++;
          return `Mr/Ms. ${this._name}`;
        }

        getCallCount(): number {
          return this.callCount;
        }
      }

      const person = new Person('Smith');

      // First call should compute
      asserts.assertEquals(person.fullName, 'Mr/Ms. Smith');
      asserts.assertEquals(person.getCallCount(), 1);

      // Second call should use cached value
      asserts.assertEquals(person.fullName, 'Mr/Ms. Smith');
      asserts.assertEquals(person.getCallCount(), 1);

      // After timeout, should recompute
      await new Promise((resolve) => setTimeout(resolve, 1100));
      asserts.assertEquals(person.fullName, 'Mr/Ms. Smith');
      asserts.assertEquals(person.getCallCount(), 2);
    },
  );

  await t.step('should handle non-serializable arguments', () => {
    let counter = 0;

    // Function with circular reference argument
    const processCircular = (obj: Record<string, unknown>): string => {
      counter++;
      return String(obj.id || 'unknown');
    };

    const memoizedProcess = memoize(processCircular, 60);

    // Create an object with a circular reference
    const circularObj: Record<string, unknown> = { id: 'circular' };
    circularObj.self = circularObj; // Create circular reference

    // First call
    const result1 = memoizedProcess(circularObj);
    asserts.assertEquals(result1, 'circular');
    asserts.assertEquals(counter, 1);

    // Second call with same object
    const result2 = memoizedProcess(circularObj);

    // We expect the fallback key generation to consider this a different object
    // since we can't reliably stringify circular objects
    asserts.assertEquals(result2, 'circular');
    asserts.assertEquals(
      counter,
      2,
      'Counter should increment for non-serializable objects',
    );
  });

  await t.step('should handle concurrent async calls correctly', async () => {
    let counter = 0;
    const slowOperation = async (id: string): Promise<string> => {
      counter++;
      await new Promise((resolve) => setTimeout(resolve, 50));
      return `Result for ${id}`;
    };

    const memoizedOperation = memoize(slowOperation, 60);

    // Start two concurrent calls with the same argument
    const promise1 = memoizedOperation('same-id');
    const promise2 = memoizedOperation('same-id');

    // Both should resolve with the same result
    const [result1, result2] = await Promise.all([promise1, promise2]);

    asserts.assertEquals(result1, 'Result for same-id');
    asserts.assertEquals(result2, 'Result for same-id');
    asserts.assertEquals(
      counter,
      1,
      'Function should only be called once for concurrent requests',
    );

    // Different argument should trigger a new call
    const result3 = await memoizedOperation('different-id');
    asserts.assertEquals(result3, 'Result for different-id');
    asserts.assertEquals(counter, 2);
  });

  await t.step('should handle edge case timeouts', () => {
    let counter = 0;
    const simpleOp = (): number => {
      counter++;
      return 42;
    };

    // Test with zero timeout (should cache but expire immediately)
    const zeroTimeoutMemoized = memoize(simpleOp, 0);
    zeroTimeoutMemoized();
    zeroTimeoutMemoized();
    asserts.assertEquals(counter, 2, 'Zero timeout should not cache');

    // Reset counter
    counter = 0;

    // Test with negative timeout (should be treated as zero)
    const negativeTimeoutMemoized = memoize(simpleOp, -10);
    negativeTimeoutMemoized();
    negativeTimeoutMemoized();
    asserts.assertEquals(counter, 2, 'Negative timeout should not cache');

    // Reset counter
    counter = 0;

    // Test with very long timeout
    const longTimeoutMemoized = memoize(simpleOp, 3600); // 1 hour
    longTimeoutMemoized();
    longTimeoutMemoized();
    asserts.assertEquals(counter, 1, 'Long timeout should cache as expected');
  });

  await t.step('should handle rejected promises correctly', async () => {
    let counter = 0;

    const failingOperation = async (shouldFail: boolean): Promise<string> => {
      counter++;
      await new Promise((resolve) => setTimeout(resolve, 50));
      if (shouldFail) {
        throw new Error('Operation failed');
      }
      return 'Success';
    };

    const memoizedOperation = memoize(failingOperation, 60);

    // Test successful case
    const successResult = await memoizedOperation(false);
    asserts.assertEquals(successResult, 'Success');
    asserts.assertEquals(counter, 1);

    // Same call should be memoized
    await memoizedOperation(false);
    asserts.assertEquals(counter, 1);

    // Test failing case
    let caught = false;
    try {
      await memoizedOperation(true);
    } catch (error) {
      caught = true;
      asserts.assertEquals((error as Error).message, 'Operation failed');
    }
    asserts.assertEquals(caught, true, 'Should throw the expected error');
    asserts.assertEquals(counter, 2, 'Failure should not be cached');

    // Same failing call should not be memoized
    caught = false;
    try {
      await memoizedOperation(true);
    } catch {
      caught = true;
    }
    asserts.assertEquals(caught, true);
    asserts.assertEquals(counter, 3, 'Failures should never be memoized');
  });
});
