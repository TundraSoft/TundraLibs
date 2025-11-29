import * as asserts from '$asserts';
import { Once, once } from './once.ts';

Deno.test('utils.once', async (t) => {
  await t.step('should make a function callable only once', () => {
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

  await t.step('should make a class method callable only once', () => {
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

  await t.step('should make an async function callable once', async () => {
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

  await t.step('should make an async method callable once', async () => {
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

  await t.step('should handle errors in once functions', () => {
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

  await t.step('should handle void functions', () => {
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

  await t.step('should ignore differing arguments after first call', () => {
    const fn = (a: number, b: number): number => a + b;
    const onceFn = once(fn);
    const first = onceFn(1, 2);
    const second = onceFn(100, 200); // Ignored new args
    asserts.assertEquals(first, 3);
    asserts.assertEquals(second, 3);
  });

  await t.step(
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

  await t.step(
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

  await t.step(
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

  await t.step('should cache undefined result', () => {
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

  await t.step('should cache object reference and not clone', () => {
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
});
