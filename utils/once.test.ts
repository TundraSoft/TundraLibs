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
});
