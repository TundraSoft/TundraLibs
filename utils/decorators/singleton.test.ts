import { singleton } from './singleton.ts';
import { asserts } from '../../dev.dependencies.ts';

Deno.test('utils:decorators:singleton', async (t) => {
  @singleton
  class TestClass {
    counter: number;

    constructor() {
      this.counter = 0;
    }

    incrementCounter() {
      this.counter++;
    }
  }

  await t.step('should return the same instance each time it is called', () => {
    const instance1 = new TestClass();
    const instance2 = new TestClass();

    asserts.assertStrictEquals(instance1, instance2);
  });

  await t.step('should preserve the state of the instance', () => {
    const instance = new TestClass();
    const instance2 = new TestClass();
    instance.incrementCounter();

    asserts.assertStrictEquals(instance.counter, 1);
    instance2.incrementCounter();
    asserts.assertStrictEquals(instance.counter, instance2.counter);
  });
});
