import { asserts } from '../../dev.dependencies.ts';
import { memoize } from './memoize.ts';

Deno.test('utils:decorators:memoize', async (t) => {
  let counter = 0;

  class MyClass {
    @memoize
    myMethod(arg: number) {
      counter += arg;
      return counter;
    }

    @memoize
    async myMethodAsync(arg: number) {
      counter += arg;
      await new Promise((resolve) => setTimeout(resolve, 1));
      return counter;
    }
  }

  const myClass = new MyClass();

  await t.step('memoize function sync', () => {
    counter = 0;
    asserts.assertEquals(myClass.myMethod(1), 1);
    asserts.assertEquals(myClass.myMethod(1), 1);
    asserts.assertEquals(myClass.myMethod(2), 3);
    asserts.assertEquals(myClass.myMethod(2), 3);
  });

  await t.step('memoize function async', async () => {
    counter = 0;
    asserts.assertEquals(await myClass.myMethodAsync(1), 1);
    asserts.assertEquals(await myClass.myMethodAsync(1), 1);
    asserts.assertEquals(await myClass.myMethodAsync(2), 3);
    asserts.assertEquals(await myClass.myMethodAsync(2), 3);
  });
});
