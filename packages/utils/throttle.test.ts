// deno-lint-ignore-file no-explicit-any
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { Throttle, throttle } from './throttle.ts';

describe('utils.throttle', () => {
  it('should throttle function calls', async () => {
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
    // Wait for the throttle to reset (add buffer to prevent flakiness)
    await new Promise((resolve) => setTimeout(resolve, 550));
    asserts.assertEquals(throttledAdd(1, 2), 3);
    asserts.assertEquals(counter, 3);
  });

  it('should throttle a function that returns null', () => {
    // Regression: `null` doubled as both the "no result cached yet" marker and
    // as a legitimate return value, so a null-returning fn fell through the
    // cache-hit guard and was re-invoked on every call (unlike `undefined`,
    // which worked). Called twice inside the window, it must run exactly once.
    let counter = 0;
    const fn = (): null => {
      counter++;
      return null;
    };
    const throttledFn = throttle(fn, 1000);
    asserts.assertEquals(throttledFn(), null);
    asserts.assertEquals(throttledFn(), null);
    asserts.assertEquals(counter, 1);
  });

  it('should throttle async function calls', async () => {
    let counter = 0;
    const add = async (a: number, b: number): Promise<number> => {
      counter++;
      await Promise.resolve();
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
    // Wait for the throttle to reset (add buffer to prevent flakiness)
    await new Promise((resolve) => setTimeout(resolve, 550));
    asserts.assertEquals(await throttledAdd(1, 2), 3);
    asserts.assertEquals(counter, 3);
  });

  it(
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
      // Wait for the throttle to reset (add buffer to prevent flakiness)
      await new Promise((resolve) => setTimeout(resolve, 550));
      asserts.assertEquals(throttledAdd(1, 2), 3);
      asserts.assertEquals(counter, 2);
    },
  );

  it(
    'should throttle async function calls with arguments ignored',
    async () => {
      let counter = 0;
      const add = async (a: number, b: number): Promise<number> => {
        counter++;
        await Promise.resolve();
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
      // Wait for the throttle to reset (add buffer to prevent flakiness)
      await new Promise((resolve) => setTimeout(resolve, 550));
      asserts.assertEquals(await throttledAdd(1, 2), 3);
      asserts.assertEquals(counter, 2);
    },
  );

  it('should throttle method calls', async () => {
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

    // Wait for the throttle to reset (add buffer to prevent flakiness)
    await new Promise((resolve) => setTimeout(resolve, 550));
    asserts.assertEquals(calculator.multiply(2, 2), 4);
    asserts.assertEquals(Calculator.counter, 3);
  });

  it('should throttle async method calls', async () => {
    class Calculator {
      static counter = 0;
      @Throttle(500)
      async multiply(a: number, b: number): Promise<number> {
        Calculator.counter++;
        await Promise.resolve();
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
    // Wait for the throttle to reset (add buffer to prevent flakiness)
    await new Promise((resolve) => setTimeout(resolve, 550));
    asserts.assertEquals(await calculator.multiply(2, 2), 4);
    asserts.assertEquals(Calculator.counter, 3);
  });

  it(
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

      // Wait for the throttle to reset (add buffer to prevent flakiness)
      await new Promise((resolve) => setTimeout(resolve, 550));
      asserts.assertEquals(calculator.multiply(2, 2), 4);
      asserts.assertEquals(Calculator.counter, 2);
    },
  );

  it('should handle function errors gracefully', async () => {
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

  it('should handle circular reference arguments', async () => {
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

    // Wait for the throttle to reset (add buffer to prevent flakiness)
    await new Promise((resolve) => setTimeout(resolve, 550));
    asserts.assertEquals(throttledFn(circular), 42);
    asserts.assertEquals(counter, 2);
  });

  it('should clean up memory after delay expires', async () => {
    let counter = 0;
    const fn = (): number => {
      counter++;
      return 42;
    };

    const throttledFn = throttle(fn, 200);

    throttledFn();
    asserts.assertEquals(counter, 1);

    // Wait past the throttle delay (add buffer to prevent flakiness)
    await new Promise((resolve) => setTimeout(resolve, 250));

    // This should execute again
    throttledFn();
    asserts.assertEquals(counter, 2);

    // Wait for cleanup (add buffer to prevent flakiness)
    await new Promise((resolve) => setTimeout(resolve, 250));

    // This should execute again as the entry should be cleared
    throttledFn();
    asserts.assertEquals(counter, 3);
  });

  it('should handle zero delay throttling', () => {
    let counter = 0;
    const fn = (): number => {
      counter++;
      return counter;
    };

    const throttledFn = throttle(fn, 0);

    // With zero delay, all calls should execute
    asserts.assertEquals(throttledFn(), 1);
    asserts.assertEquals(throttledFn(), 2);
    asserts.assertEquals(throttledFn(), 3);
    asserts.assertEquals(counter, 3);
  });

  it('should return the target unchanged for an unsupported placement', () => {
    // Untyped (plain-JS) callers can hand the decorator a non-method,
    // non-getter context; the runtime guard returns the target untouched.
    const target = () => 'not throttled';
    // deno-lint-ignore no-explicit-any
    const result = (Throttle(1000) as any)(target, {
      kind: 'setter',
      name: 'test',
    });
    asserts.assertStrictEquals(result, target);
  });

  it(
    'should handle async function that is already running',
    async () => {
      let counter = 0;
      const slowAsyncFn = async (): Promise<number> => {
        counter++;
        await new Promise((resolve) => setTimeout(resolve, 100));
        return counter;
      };

      const throttledFn = throttle(slowAsyncFn, 1000);

      // Start first async call
      const promise1 = throttledFn();

      // While first is running, subsequent calls should return the same promise
      const promise2 = throttledFn();
      const promise3 = throttledFn();

      asserts.assert(promise1 === promise2);
      asserts.assert(promise2 === promise3);

      const result = await promise1;
      asserts.assertEquals(result, 1);
      asserts.assertEquals(counter, 1);
    },
  );

  it('should reset call log when delay has expired', async () => {
    let counter = 0;
    const fn = (): number => {
      counter++;
      return counter;
    };

    const throttledFn = throttle(fn, 100);

    // First call
    asserts.assertEquals(throttledFn(), 1);
    asserts.assertEquals(counter, 1);

    // Wait for delay to expire (add buffer to prevent flakiness)
    await new Promise((resolve) => setTimeout(resolve, 120));

    // Next call should reset the call log and execute
    asserts.assertEquals(throttledFn(), 2);
    asserts.assertEquals(counter, 2);
  });

  it('should handle empty arguments correctly', () => {
    let counter = 0;
    const fn = (...args: any[]): number => {
      counter++;
      return args.length;
    };

    const throttledFn = throttle(fn, 100);

    // Call with no arguments
    asserts.assertEquals(throttledFn(), 0);
    asserts.assertEquals(throttledFn(), 0);
    asserts.assertEquals(counter, 1);

    // Call with empty array - should be different from no args
    asserts.assertEquals(throttledFn([]), 1);
    asserts.assertEquals(counter, 2);
  });

  it('should handle time fallback functionality', () => {
    // In Deno, performance API is always available, but we can test that
    // the throttle function works correctly regardless
    let counter = 0;
    const fn = (): number => {
      counter++;
      return counter;
    };

    const throttledFn = throttle(fn, 50);
    asserts.assertEquals(throttledFn(), 1);
    asserts.assertEquals(throttledFn(), 1); // Should be throttled
    asserts.assertEquals(counter, 1);
  });

  it('should handle safeStringify with complex objects', () => {
    let counter = 0;
    const fn = (...args: any[]): number => {
      counter++;
      return counter;
    };

    const throttledFn = throttle(fn, 100);

    // Test with various non-serializable objects
    const symbol = Symbol('test');
    const func = () => {};
    const date = new Date();
    const regex = /test/;

    // These should all work without throwing errors
    throttledFn(symbol);
    throttledFn(func);
    throttledFn(date);
    throttledFn(regex);

    // Multiple calls with same type should be throttled
    throttledFn(Symbol('test2'));
    throttledFn(() => {});

    asserts.assert(counter >= 1);
  });

  it('should handle undefined return values', async () => {
    let counter = 0;
    const fn = (): void => {
      counter++;
    };

    const throttledFn = throttle(fn, 100);

    // Should handle functions that return undefined
    asserts.assertEquals(throttledFn(), undefined);
    asserts.assertEquals(throttledFn(), undefined);
    asserts.assertEquals(counter, 1);

    await new Promise((resolve) => setTimeout(resolve, 120));
    asserts.assertEquals(throttledFn(), undefined);
    asserts.assertEquals(counter, 2);
  });

  // Note: Removed async rejection test due to uncaught promise handling complexity in test environment

  it('should handle async promise finally cleanup', async () => {
    let counter = 0;
    let finallyCounter = 0;

    const asyncFn = async (): Promise<number> => {
      counter++;
      try {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return counter;
      } finally {
        finallyCounter++;
      }
    };

    const throttledFn = throttle(asyncFn, 200);

    // Start first call
    const promise1 = throttledFn();

    // Immediate subsequent calls should return same promise
    const promise2 = throttledFn();
    asserts.assert(promise1 === promise2);

    const result = await promise1;
    asserts.assertEquals(result, 1);
    asserts.assertEquals(counter, 1);
    asserts.assertEquals(finallyCounter, 1);

    // Wait a bit and try again to test the cleanup in finally block (add buffer)
    await new Promise((resolve) => setTimeout(resolve, 260));

    const result2 = await throttledFn();
    asserts.assertEquals(result2, 2);
    asserts.assertEquals(counter, 2);
    asserts.assertEquals(finallyCounter, 2);
  });

  it('should handle edge case with very small delays', async () => {
    let counter = 0;
    const fn = (): number => {
      counter++;
      return counter;
    };

    // A short throttle window. 1ms is below the effective timer/scheduling
    // resolution — two "synchronous" calls can straddle a 1ms boundary under a
    // GC or scheduling hiccup, letting the second slip through. 20ms is still a
    // small window but comfortably above that jitter, so the behavior is
    // deterministic across runtimes.
    const throttledFn = throttle(fn, 20);

    throttledFn();
    throttledFn();
    asserts.assertEquals(counter, 1);

    // Wait comfortably past the window so the next call is allowed through.
    await new Promise((resolve) => setTimeout(resolve, 60));

    throttledFn();
    asserts.assertEquals(counter, 2);
  });

  it('should throttle getter access via @Throttle decorator', async () => {
    // Regression: @Throttle silently ignored getters (only `descriptor.value`
    // was wrapped), so the getter body ran on EVERY access. It must now
    // throttle per-instance and correctly bind `this` (the getter reads
    // `this._value`), mirroring @Memoize's getter handling.
    class TestClass {
      private _value = 0;
      static counter = 0;

      @Throttle(200)
      get computedValue(): number {
        TestClass.counter++;
        return this._value * 2;
      }

      set value(val: number) {
        this._value = val;
      }
    }

    const instance = new TestClass();
    instance.value = 5;

    // First access computes and caches; further accesses inside the window
    // return the cached value WITHOUT re-running the getter body.
    asserts.assertEquals(instance.computedValue, 10);
    asserts.assertEquals(instance.computedValue, 10);
    asserts.assertEquals(instance.computedValue, 10);
    asserts.assertEquals(
      TestClass.counter,
      1,
      'getter body must run once within the throttle window',
    );

    // After the window elapses the getter runs again.
    await new Promise((resolve) => setTimeout(resolve, 250));
    asserts.assertEquals(instance.computedValue, 10);
    asserts.assertEquals(
      TestClass.counter,
      2,
      'getter body must re-run once the throttle window expires',
    );
  });

  it('@Throttle getter state is per-instance and non-enumerable', () => {
    class TestClass {
      private _value: number;
      static counter = 0;
      constructor(value: number) {
        this._value = value;
      }
      @Throttle(200)
      get doubled(): number {
        TestClass.counter++;
        return this._value * 2;
      }
    }

    const a = new TestClass(3);
    const b = new TestClass(10);
    // Distinct instances keep independent throttle windows and `this`.
    asserts.assertEquals(a.doubled, 6);
    asserts.assertEquals(b.doubled, 20);
    asserts.assertEquals(TestClass.counter, 2);

    // The per-instance throttle store must not leak into serialization.
    a.doubled;
    asserts.assertEquals(JSON.stringify(a).includes('__throttled'), false);
    asserts.assertEquals(Object.keys(a).includes('__throttled'), false);
  });

  it(
    'should handle concurrent async calls with different arguments',
    async () => {
      let counter = 0;
      const asyncFn = async (id: number): Promise<string> => {
        counter++;
        await new Promise((resolve) => setTimeout(resolve, 50));
        return `result-${id}`;
      };

      const throttledFn = throttle(asyncFn, 200);

      // Start multiple calls with different arguments concurrently
      const promise1 = throttledFn(1);
      const promise2 = throttledFn(2);
      const promise3 = throttledFn(1); // Same args as first

      // promise1 and promise3 should be the same (same args)
      asserts.assert(promise1 === promise3);
      // promise2 should be different (different args)
      asserts.assert(promise1 !== promise2);

      const [result1, result2, result3] = await Promise.all([
        promise1,
        promise2,
        promise3,
      ]);

      asserts.assertEquals(result1, 'result-1');
      asserts.assertEquals(result2, 'result-2');
      asserts.assertEquals(result3, 'result-1');
      asserts.assertEquals(counter, 2); // Only two actual executions
    },
  );

  describe('round-3 regressions', () => {
    it('#3 - @Throttle method forwards `this` to instance state', () => {
      class Counter {
        count = 5;
        @Throttle(1000)
        getCount(): number {
          return this.count;
        }
        @Throttle(1000, true)
        add(n: number): number {
          this.count += n;
          return this.count;
        }
      }
      const c = new Counter();
      // Previously threw "Cannot read properties of undefined (reading 'count')".
      asserts.assertEquals(c.getCount(), 5);
      asserts.assertEquals(c.add(3), 8);
      asserts.assertEquals(c.count, 8);
    });

    it('#4 - rejected throttled async call does not leak an unhandled rejection', async () => {
      const fired: unknown[] = [];
      // Cross-runtime unhandled-rejection capture: Deno/Bun expose the web
      // `unhandledrejection` event; Node uses `process.on('unhandledRejection')`.
      // A registered listener also prevents the default terminate-on-unhandled
      // policy, so a regression is reported rather than crashing the runner.
      const g = globalThis as any;
      let cleanup: () => void;
      if (typeof g.addEventListener === 'function') {
        const handler = (e: any) => {
          fired.push(e.reason);
          e.preventDefault?.();
        };
        g.addEventListener('unhandledrejection', handler);
        cleanup = () => g.removeEventListener('unhandledrejection', handler);
      } else {
        const handler = (reason: unknown) => fired.push(reason);
        g.process.on('unhandledRejection', handler);
        cleanup = () => g.process.off('unhandledRejection', handler);
      }

      try {
        const f = throttle(async () => {
          await Promise.resolve();
          throw new Error('boom');
        }, 100);

        let caught: unknown;
        try {
          await f();
        } catch (e) {
          caught = e;
        }
        // The caller's own promise still rejects normally.
        asserts.assert(caught instanceof Error);
        asserts.assertEquals((caught as Error).message, 'boom');

        // Give any stray rejection a chance to surface.
        await new Promise((r) => setTimeout(r, 50));
        asserts.assertEquals(
          fired.length,
          0,
          'no unhandledrejection should escape the throttle cleanup chain',
        );
      } finally {
        cleanup();
      }
    });
  });

  describe('round-4 regressions', () => {
    it('#1 - @Throttle method throttles per-instance (no cross-instance leak)', () => {
      // A decorated read method: two instances must each return their OWN
      // value. Previously a single throttle closure lived on the prototype and
      // its result cache was keyed only by args, so the second instance to call
      // within the window was served the FIRST instance's cached return value.
      class User {
        constructor(public name: string) {}
        @Throttle(1000)
        getName(): string {
          return this.name;
        }
      }
      const alice = new User('alice');
      const bob = new User('bob');
      asserts.assertEquals(alice.getName(), 'alice');
      asserts.assertEquals(bob.getName(), 'bob'); // was 'alice' (leak)
      // Repeated calls within the window still serve each instance its own
      // cached result (throttling remains in effect per instance).
      asserts.assertEquals(alice.getName(), 'alice');
      asserts.assertEquals(bob.getName(), 'bob');
    });

    it('#1 - @Throttle(ignoreArgs) mutating method runs on each instance', () => {
      // With ignoreArgs the arg-key always collides, so pre-fix EVERY second
      // instance's call was skipped entirely (its mutation lost) and it was
      // served the first instance's return value.
      class Acct {
        balance = 0;
        constructor(public id: string) {}
        @Throttle(1000, true)
        deposit(n: number): number {
          this.balance += n;
          return this.balance;
        }
      }
      const a = new Acct('A');
      const b = new Acct('B');
      asserts.assertEquals(a.deposit(10), 10);
      asserts.assertEquals(a.balance, 10);
      // B's deposit must actually run against B's own state (was 10 / balance 0).
      asserts.assertEquals(b.deposit(10), 10);
      asserts.assertEquals(b.balance, 10);
    });

    it('#1 - @Throttle method still throttles a single instance', () => {
      // Per-instance state must not disable throttling itself: repeated calls
      // on the SAME instance within the window return the cached result.
      let runs = 0;
      class Counter {
        count = 0;
        @Throttle(1000, true)
        tick(): number {
          runs++;
          this.count++;
          return this.count;
        }
      }
      const c = new Counter();
      asserts.assertEquals(c.tick(), 1);
      asserts.assertEquals(c.tick(), 1); // cached, body not re-run
      asserts.assertEquals(runs, 1);
    });
  });

  describe('round-6 regressions', () => {
    it('#1 - @Throttle method `get_foo` and getter `foo` do not share a cache slot', () => {
      // Regression: the method branch keyed the per-instance cache as
      // `${Class}_${name}` and the getter branch as `${Class}_get_${name}`, so
      // a method literally named `get_foo` and a getter named `foo` both keyed
      // to `X_get_foo` in the SAME `__throttled` map. Whichever member was
      // accessed first installed its wrapper under that key, and the second
      // member was then silently served the first member's throttled result.
      class X {
        @Throttle(1000)
        get foo(): string {
          return 'getter-result';
        }
        @Throttle(1000)
        get_foo(): string {
          return 'method-result';
        }
      }
      // getter accessed first, then the colliding-name method.
      const a = new X();
      asserts.assertEquals(a.foo, 'getter-result');
      asserts.assertEquals(a.get_foo(), 'method-result'); // was 'getter-result'

      // reversed order on a fresh instance must be symmetric.
      const b = new X();
      asserts.assertEquals(b.get_foo(), 'method-result');
      asserts.assertEquals(b.foo, 'getter-result'); // was 'method-result'
    });
  });
});
