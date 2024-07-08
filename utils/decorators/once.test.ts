import { asserts } from '../../dev.dependencies.ts';
import { once } from './once.ts';

Deno.test('utils:decorators:once', async (t) => {
  class MyClass {
    counter = 0;

    @once
    myMethod(arg: number) {
      this.counter += arg;
      return this.counter;
    }

    @once
    async myAsyncMethod(arg: number) {
      this.counter += arg;
      await Promise.resolve();
      return this.counter;
    }
  }

  await t.step('once function', () => {
    const myClass = new MyClass();
    asserts.assertEquals(myClass.myMethod(1), 1);
    asserts.assertEquals(myClass.myMethod(1), 1); // Should return cached result
    asserts.assertEquals(myClass.myMethod(2), 1); // Should return cached result
    asserts.assertEquals(myClass.myMethod(2), 1); // Should return cached result
  });

  await t.step('once async function', async () => {
    const myClass = new MyClass();
    asserts.assertEquals(await myClass.myAsyncMethod(1), 1);
    asserts.assertEquals(await myClass.myAsyncMethod(1), 1); // Should return cached result
    asserts.assertEquals(await myClass.myAsyncMethod(2), 1); // Should return cached result
    asserts.assertEquals(await myClass.myAsyncMethod(2), 1); // Should return cached result
  });
});
