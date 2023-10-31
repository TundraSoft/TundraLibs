import { singleton } from './singleton.ts';
import { assertStrictEquals, describe, it } from '../../dev.dependencies.ts';

describe(`[library='utils' type='decorator' name='singleton']`, () => {
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

  it('should return the same instance each time it is called', () => {
    const instance1 = new TestClass();
    const instance2 = new TestClass();

    assertStrictEquals(instance1, instance2);
  });

  it('should preserve the state of the instance', () => {
    const instance = new TestClass();
    const instance2 = new TestClass();
    instance.incrementCounter();

    assertStrictEquals(instance.counter, 1);
    instance2.incrementCounter();
    assertStrictEquals(instance.counter, instance2.counter);
  });
});
