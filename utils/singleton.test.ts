import * as asserts from '$asserts';
import { Singleton } from './singleton.ts';

Deno.test('utils.singleton', async (t) => {
  @Singleton
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

  await t.step('should work with constructor arguments', () => {
    @Singleton
    class ConfiguredClass {
      public readonly config: string;

      constructor(config: string) {
        this.config = config;
      }
    }

    // First instance initializes with its arguments
    const instance1 = new ConfiguredClass('initial config');
    asserts.assertEquals(instance1.config, 'initial config');

    // Second instance is the same as the first, ignoring new arguments
    const instance2 = new ConfiguredClass('different config');
    asserts.assertStrictEquals(instance1, instance2);
    asserts.assertEquals(instance2.config, 'initial config');
  });
});
