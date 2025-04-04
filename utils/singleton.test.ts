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

  await t.step('should work correctly with inheritance', () => {
    @Singleton
    class BaseClass {
      baseValue: string;

      constructor(value: string) {
        this.baseValue = value;
      }
    }

    @Singleton
    class DerivedClass extends BaseClass {
      derivedValue: string;

      constructor(baseValue: string, derivedValue: string) {
        super(baseValue);
        this.derivedValue = derivedValue;
      }
    }

    // Each class should have its own singleton instance
    const base1 = new BaseClass('base');
    const base2 = new BaseClass('newbase');
    asserts.assertStrictEquals(base1, base2);
    asserts.assertEquals(base1.baseValue, 'base');

    const derived1 = new DerivedClass('derivedbase', 'derived');
    const derived2 = new DerivedClass('newderivedbase', 'newderived');
    asserts.assertStrictEquals(derived1, derived2);
    asserts.assertEquals(derived1.baseValue, 'base');
    asserts.assertEquals(derived1.derivedValue, 'derived');

    // Base and derived instances should be different
    asserts.assertStrictEquals(base1, derived1);
  });

  await t.step('should work with async methods', async () => {
    @Singleton
    class AsyncClass {
      counter = 0;

      async incrementAsync(): Promise<number> {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return ++this.counter;
      }
    }

    const instance1 = new AsyncClass();
    const instance2 = new AsyncClass();

    const result1 = await instance1.incrementAsync();
    asserts.assertEquals(result1, 1);

    const result2 = await instance2.incrementAsync();
    asserts.assertEquals(result2, 2);
    asserts.assertEquals(instance1.counter, 2);
  });
});
