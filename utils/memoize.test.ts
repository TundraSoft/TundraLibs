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

  await t.step('should handle function input validation', () => {
    // Test non-function input
    asserts.assertThrows(
      () => memoize(null as any),
      TypeError,
      'Expected a function',
    );

    asserts.assertThrows(
      () => memoize(undefined as any),
      TypeError,
      'Expected a function',
    );

    asserts.assertThrows(
      () => memoize('not a function' as any),
      TypeError,
      'Expected a function',
    );

    asserts.assertThrows(
      () => memoize(123 as any),
      TypeError,
      'Expected a function',
    );

    asserts.assertThrows(
      () => memoize({} as any),
      TypeError,
      'Expected a function',
    );
  });

  await t.step('should handle cache expiration edge cases', async () => {
    let counter = 0;
    const fn = () => ++counter;

    // Test with very small timeout
    const memoizedFn = memoize(fn, 0.001); // 1ms timeout

    asserts.assertEquals(memoizedFn(), 1);
    asserts.assertEquals(memoizedFn(), 1); // Should be cached

    // Wait for cache to expire
    await new Promise((resolve) => setTimeout(resolve, 5));

    asserts.assertEquals(memoizedFn(), 2); // Should execute again after expiration
  });

  await t.step('should handle cache key creation edge cases', () => {
    let counter = 0;
    const fn = (...args: any[]) => ++counter;
    const memoizedFn = memoize(fn, 60);

    // Test with circular reference objects
    const circular: any = { value: 1 };
    circular.self = circular;

    // These should not throw and should create different cache entries
    const result1 = memoizedFn(circular);
    const result2 = memoizedFn(circular);

    // Due to non-serializable args, each call gets a unique key, so no caching
    asserts.assertEquals(result1, 1);
    asserts.assertEquals(result2, 2);

    // Test with functions as arguments
    const func1 = () => 'test';
    const func2 = () => 'test';

    const result3 = memoizedFn(func1);
    const result4 = memoizedFn(func2);

    // Different function objects should get different cache keys
    asserts.assertEquals(result3, 3);
    asserts.assertEquals(result4, 4);
  });

  await t.step(
    'should handle concurrent async call deduplication',
    async () => {
      let counter = 0;
      const asyncFn = async (value: string): Promise<string> => {
        counter++;
        await new Promise((resolve) => setTimeout(resolve, 50));
        return `${value}-${counter}`;
      };

      const memoizedFn = memoize(asyncFn, 60);

      // Start multiple concurrent calls with same arguments
      const promises = [
        memoizedFn('test'),
        memoizedFn('test'),
        memoizedFn('test'),
      ];

      const results = await Promise.all(promises);

      // All should return the same result and function should only execute once
      asserts.assertEquals(results[0], 'test-1');
      asserts.assertEquals(results[1], 'test-1');
      asserts.assertEquals(results[2], 'test-1');
      asserts.assertEquals(counter, 1);
    },
  );

  await t.step('should handle promise rejection cleanup', async () => {
    let counter = 0;
    const failingAsyncFn = async (shouldFail: boolean): Promise<string> => {
      counter++;
      await new Promise((resolve) => setTimeout(resolve, 10));
      if (shouldFail) {
        throw new Error(`Failure ${counter}`);
      }
      return `Success ${counter}`;
    };

    const memoizedFn = memoize(failingAsyncFn, 60);

    // First call fails
    try {
      await memoizedFn(true);
      asserts.fail('Should have thrown');
    } catch (error) {
      asserts.assert(error instanceof Error);
      asserts.assertEquals(error.message, 'Failure 1');
    }

    // Second call with same args should execute again (not cached due to error)
    try {
      await memoizedFn(true);
      asserts.fail('Should have thrown');
    } catch (error) {
      asserts.assert(error instanceof Error);
      asserts.assertEquals(error.message, 'Failure 2');
    }

    // Successful call should be cached
    const result1 = await memoizedFn(false);
    const result2 = await memoizedFn(false);

    asserts.assertEquals(result1, 'Success 3');
    asserts.assertEquals(result2, 'Success 3'); // Cached
    asserts.assertEquals(counter, 3);
  });

  await t.step('should handle synchronous function error cases', () => {
    let counter = 0;
    const throwingFn = (shouldThrow: boolean): number => {
      counter++;
      if (shouldThrow) {
        throw new Error(`Error ${counter}`);
      }
      return counter;
    };

    const memoizedFn = memoize(throwingFn, 60);

    // Errors should not be cached
    asserts.assertThrows(
      () => memoizedFn(true),
      Error,
      'Error 1',
    );

    asserts.assertThrows(
      () => memoizedFn(true),
      Error,
      'Error 2',
    );

    // Successful calls should be cached
    asserts.assertEquals(memoizedFn(false), 3);
    asserts.assertEquals(memoizedFn(false), 3); // Cached
    asserts.assertEquals(counter, 3);
  });

  await t.step('should handle cache expiration correctly', async () => {
    let counter = 0;
    const fn = () => ++counter;
    const memoizedFn = memoize(fn, 0.1); // 100ms timeout

    // Initial calls
    asserts.assertEquals(memoizedFn(), 1);
    asserts.assertEquals(memoizedFn(), 1); // Cached

    // Wait for cache to expire
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Should execute again
    asserts.assertEquals(memoizedFn(), 2);
    asserts.assertEquals(memoizedFn(), 2); // New cached value
  });

  await t.step('should handle complex object arguments', () => {
    let counter = 0;
    const fn = (obj: any) => ({ ...obj, counter: ++counter });
    const memoizedFn = memoize(fn, 60);

    const input1 = { a: 1, b: [1, 2, 3] };
    const input2 = { a: 1, b: [1, 2, 3] }; // Same content, different object
    const input3 = { a: 2, b: [1, 2, 3] }; // Different content

    const result1 = memoizedFn(input1);
    const result2 = memoizedFn(input2); // Should be cached
    const result3 = memoizedFn(input3); // Should not be cached

    asserts.assertEquals(result1.counter, 1);
    asserts.assertEquals(result2.counter, 1); // Same as result1 (cached)
    asserts.assertEquals(result3.counter, 2); // New execution
  });

  await t.step('should handle zero and negative timeout values', () => {
    let counter = 0;
    const fn = () => ++counter;

    // Zero timeout should use 0 (immediate expiration)
    const memoizedFn1 = memoize(fn, 0);
    asserts.assertEquals(memoizedFn1(), 1);

    // Negative timeout should be treated as 0 (Math.max)
    const memoizedFn2 = memoize(fn, -10);
    asserts.assertEquals(memoizedFn2(), 2);
  });

  await t.step('should handle decorator on various method types', () => {
    class TestClass {
      static counter = 0;
      private value = 0;

      @Memoize(60)
      regularMethod(input: number): number {
        TestClass.counter++;
        return input * 2;
      }

      @Memoize(60)
      get computedValue(): number {
        TestClass.counter++;
        return this.value * 3;
      }

      setValue(val: number) {
        this.value = val;
      }
    }

    const instance = new TestClass();

    // Test regular method
    asserts.assertEquals(instance.regularMethod(5), 10);
    asserts.assertEquals(instance.regularMethod(5), 10); // Cached
    asserts.assertEquals(TestClass.counter, 1);

    // Test getter
    instance.setValue(10);
    asserts.assertEquals(instance.computedValue, 30);
    asserts.assertEquals(instance.computedValue, 30); // Cached
    asserts.assertEquals(TestClass.counter, 2);
  });

  await t.step('should handle decorator without constructor', () => {
    // Test case where this.constructor might not exist
    const descriptor: PropertyDescriptor = {
      value: function (this: any, x: number) {
        return x * 2;
      },
      writable: true,
      enumerable: true,
      configurable: true,
    };

    // Apply decorator to function without constructor context
    Memoize(60)({}, 'testMethod', descriptor);

    // Should not throw and descriptor should be modified
    asserts.assert(typeof descriptor.value === 'function');
  });

  await t.step('should handle getter decorator without constructor', () => {
    const descriptor: PropertyDescriptor = {
      get: function (this: any) {
        return 42;
      },
      enumerable: true,
      configurable: true,
    };

    // Apply decorator to getter without constructor context
    Memoize(60)({}, 'testGetter', descriptor);

    // Should not throw and descriptor should be modified
    asserts.assert(typeof descriptor.get === 'function');
  });

  await t.step('should handle neither value nor get descriptor', () => {
    const descriptor: PropertyDescriptor = {
      writable: true,
      enumerable: true,
      configurable: true,
      // No value or get property
    };

    const originalDescriptor = { ...descriptor };

    // Apply decorator - should not modify descriptor
    Memoize(60)({}, 'testProperty', descriptor);

    // Should return the same descriptor unchanged
    asserts.assertEquals(descriptor.value, originalDescriptor.value);
    asserts.assertEquals(descriptor.get, originalDescriptor.get);
  });
});
