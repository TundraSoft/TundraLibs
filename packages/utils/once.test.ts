import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { Once, once } from './once.ts';

describe('utils.once', () => {
  it('should make a function callable only once', () => {
    let counter = 0;
    const add = (a: number, b: number): number => {
      counter++;
      return a + b;
    };
    const onceAdd = once(add);
    asserts.assertEquals(onceAdd(1, 2), 3);
    asserts.assertEquals(onceAdd(1, 2), 3);
    asserts.assertEquals(counter, 1);
    // Value should not change!!!
    asserts.assertEquals(onceAdd(2, 3), 3);
    asserts.assertEquals(onceAdd(2, 3), 3);
    asserts.assertEquals(counter, 1);
  });

  it('should make a class method callable only once', () => {
    class Calculator {
      static counter = 0;
      @Once
      multiply(a: number, b: number): number {
        Calculator.counter++;
        return a * b;
      }
    }

    const calc = new Calculator();
    asserts.assertEquals(calc.multiply(2, 3), 6);
    asserts.assertEquals(calc.multiply(2, 3), 6);
    asserts.assertEquals(Calculator.counter, 1);
    // Value should not change!!!
    asserts.assertEquals(calc.multiply(4, 5), 6);
    asserts.assertEquals(calc.multiply(4, 5), 6);
    asserts.assertEquals(Calculator.counter, 1);
  });

  it('should make an async function callable once', async () => {
    let counter = 0;
    const add = async (a: number, b: number): Promise<number> => {
      // Set a 500ms delay to simulate an async operation
      await new Promise((resolve) => setTimeout(resolve, 250));
      counter++;
      return a + b;
    };
    const onceAdd = once(add);
    asserts.assertEquals(await onceAdd(1, 2), 3);
    asserts.assertEquals(await onceAdd(1, 2), 3);
    asserts.assertEquals(counter, 1);
    // Value should not change!!!
    asserts.assertEquals(await onceAdd(2, 3), 3);
    asserts.assertEquals(await onceAdd(2, 3), 3);
    asserts.assertEquals(counter, 1);
  });

  it('should make an async method callable once', async () => {
    class Calculator {
      static counter = 0;
      @Once
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
    // Value should not change!!!
    asserts.assertEquals(await calc.multiply(4, 5), 6);
    asserts.assertEquals(await calc.multiply(4, 5), 6);
    asserts.assertEquals(Calculator.counter, 1);
  });

  it('should handle errors in once functions', () => {
    let counter = 0;
    const willThrow = (): number => {
      counter++;
      throw new Error('This function throws');
    };

    const onceThrow = once(willThrow);

    // First call should throw
    asserts.assertThrows(() => onceThrow(), Error, 'This function throws');
    asserts.assertEquals(counter, 1);

    // Second call should also throw the same error
    asserts.assertThrows(() => onceThrow(), Error, 'This function throws');
    // But the function shouldn't be called again
    asserts.assertEquals(counter, 1);
  });

  it('should handle void functions', () => {
    let counter = 0;
    const voidFn = (): void => {
      counter++;
    };

    const onceVoid = once(voidFn);

    onceVoid();
    asserts.assertEquals(counter, 1);

    onceVoid();
    asserts.assertEquals(counter, 1);
  });

  it('should ignore differing arguments after first call', () => {
    const fn = (a: number, b: number): number => a + b;
    const onceFn = once(fn);
    const first = onceFn(1, 2);
    const second = onceFn(100, 200); // Ignored new args
    asserts.assertEquals(first, 3);
    asserts.assertEquals(second, 3);
  });

  it(
    'should preserve this context with decorator across instances',
    () => {
      class Counter {
        value = 0;
        @Once
        inc(delta: number): number {
          this.value += delta;
          return this.value;
        }
      }
      const a = new Counter();
      const b = new Counter();
      asserts.assertEquals(a.inc(5), 5);
      asserts.assertEquals(a.inc(10), 5); // cached
      asserts.assertEquals(b.inc(7), 7); // separate instance cache
      asserts.assertEquals(b.inc(1), 7);
    },
  );

  it(
    'should only execute async function once under concurrent calls',
    async () => {
      let runs = 0;
      const fn = once(async (v: number) => {
        runs++;
        await new Promise((r) => setTimeout(r, 25));
        return v * 2;
      });
      const p1 = fn(10);
      const p2 = fn(20);
      const p3 = fn(30);
      const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
      asserts.assertEquals(r1, 20);
      asserts.assertEquals(r2, 20);
      asserts.assertEquals(r3, 20);
      asserts.assertEquals(runs, 1);
    },
  );

  it(
    'should rethrow same async error without re-executing',
    async () => {
      let runs = 0;
      const failing = once(async () => {
        runs++;
        await Promise.resolve();
        throw new Error('boom');
      });
      for (let i = 0; i < 3; i++) {
        await asserts.assertRejects(() => failing(), Error, 'boom');
      }
      asserts.assertEquals(runs, 1);
    },
  );

  it('should cache undefined result', () => {
    let runs = 0;
    const fn = once(() => {
      runs++;
      return undefined;
    });
    asserts.assertEquals(fn(), undefined);
    asserts.assertEquals(fn(), undefined);
    asserts.assertEquals(fn(), undefined);
    asserts.assertEquals(runs, 1);
  });

  it('should cache object reference and not clone', () => {
    let runs = 0;
    const obj = { a: 1 };
    const fn = once(() => {
      runs++;
      return obj;
    });
    const r1 = fn();
    const r2 = fn();
    asserts.assertStrictEquals(r1, obj);
    asserts.assertStrictEquals(r2, obj);
    asserts.assertEquals(runs, 1);
  });

  it('should return the target unchanged when applied to an unsupported placement', () => {
    // Untyped (plain-JS) callers can hand Once a non-method context; the
    // runtime guard returns the target untouched instead of wrapping.
    const target = () => 42;
    // deno-lint-ignore no-explicit-any
    const result = (Once as any)(target, { kind: 'getter', name: 'myProp' });
    asserts.assertStrictEquals(result, target);
  });

  it('should rethrow sync error on re-call via @Once decorator', () => {
    class Thrower {
      @Once
      boom(): number {
        throw new Error('sync boom');
      }
    }
    const t = new Thrower();
    asserts.assertThrows(() => t.boom(), Error, 'sync boom');
    // Second call should rethrow cached error
    asserts.assertThrows(() => t.boom(), Error, 'sync boom');
  });

  it('should return a Promise from @Once async method after it resolves', async () => {
    // Regression: post-resolution calls used to return the raw resolved
    // value instead of a Promise, breaking .then()/Promise.all().
    class Service {
      runs = 0;
      @Once
      async init(): Promise<number> {
        this.runs++;
        await Promise.resolve();
        return 42;
      }
    }
    const s = new Service();
    // First call resolves and caches.
    asserts.assertEquals(await s.init(), 42);
    // Later call must still hand back a thenable.
    const later = s.init();
    asserts.assertInstanceOf(later, Promise);
    asserts.assertEquals(await later, 42);
    // .then chaining must work on the cached call.
    const viaThen = await s.init().then((v) => v + 1);
    asserts.assertEquals(viaThen, 43);
    // Promise.all over repeated cached calls must work.
    const all = await Promise.all([s.init(), s.init(), s.init()]);
    asserts.assertEquals(all, [42, 42, 42]);
    asserts.assertEquals(s.runs, 1);
  });

  it('should return a Promise from @Once async method resolving to undefined', async () => {
    class Service {
      runs = 0;
      @Once
      async init(): Promise<void> {
        this.runs++;
        await Promise.resolve();
      }
    }
    const s = new Service();
    asserts.assertEquals(await s.init(), undefined);
    const later = s.init();
    asserts.assertInstanceOf(later, Promise);
    asserts.assertEquals(await later, undefined);
    asserts.assertEquals(s.runs, 1);
  });

  it('should handle async error in @Once decorated method', async () => {
    // Regression: a cached async rejection used to be re-thrown SYNCHRONOUSLY
    // on later calls, so `.catch()` never ran and the throw crashed callers.
    // A rejected async @Once must come back as a rejected Promise, symmetric
    // with the resolved path.
    class AsyncThrower {
      runs = 0;
      @Once
      async fail(): Promise<number> {
        this.runs++;
        await Promise.resolve();
        throw new Error('async once boom');
      }
    }
    const t = new AsyncThrower();
    await asserts.assertRejects(() => t.fail(), Error, 'async once boom');
    // Later call must return a rejected Promise, NOT throw synchronously.
    const later = t.fail();
    asserts.assertInstanceOf(later, Promise);
    // `.catch()` on the cached call must run its handler.
    let caught: unknown;
    await later.catch((e) => {
      caught = e;
    });
    asserts.assertInstanceOf(caught, Error);
    asserts.assertStrictEquals((caught as Error).message, 'async once boom');
    // assertRejects must also keep working on subsequent cached calls.
    await asserts.assertRejects(() => t.fail(), Error, 'async once boom');
    // The method still ran exactly once.
    asserts.assertStrictEquals(t.runs, 1);
  });

  it('re-throws a FALSY value thrown by the first call (0 / "" / false / null)', () => {
    // The first call throwing a falsy value must still be re-thrown on later
    // calls — the old truthiness guard (`if (error) throw error`) swallowed it.
    for (const falsy of [0, '', false, null] as const) {
      let runs = 0;
      const t = once((): never => {
        runs++;
        throw falsy;
      });
      const call = () => {
        try {
          t();
          return { threw: false, value: undefined as unknown };
        } catch (e) {
          return { threw: true, value: e };
        }
      };
      const first = call();
      const second = call();
      asserts.assert(first.threw, `first call should throw ${String(falsy)}`);
      asserts.assertStrictEquals(first.value, falsy);
      asserts.assert(
        second.threw,
        'second call should re-throw the falsy value',
      );
      asserts.assertStrictEquals(second.value, falsy);
      asserts.assertStrictEquals(runs, 1); // fn ran exactly once
    }
  });
});
