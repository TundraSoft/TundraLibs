import { throttle } from './throttle.ts';
import { assertEquals } from '../../dev.dependencies.ts';

Deno.test('utils:decorators:throttle', async (t) => {
  class Test {
    called = 0;

    @throttle(5)
    methodName() {
      this.called += 1;
      return { a: this.called };
    }
  }

  const a = new Test();

  await t.step('should throttle the method execution', () => {
    assertEquals(a.called, 0);
    a.methodName();
    assertEquals(a.called, 1);
    a.methodName();
    a.methodName();
    a.methodName();
    a.methodName();
    assertEquals(a.called, 1);
  });
});
