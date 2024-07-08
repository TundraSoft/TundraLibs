import { debounce } from './debounce.ts';
import { asserts } from '../../dev.dependencies.ts';

Deno.test('utils:decorators:debounce', async (t) => {
  class Test {
    public cnt = 0;

    @debounce(1)
    public methodName() {
      this.cnt += 1;
    }
  }

  const a = new Test();

  await t.step('should throttle the method execution', async () => {
    asserts.assertEquals(a.cnt, 0);
    a.methodName();
    a.methodName();
    a.methodName();
    a.methodName();
    await new Promise((resolve) => setTimeout(resolve, 1200));
    a.methodName();
    asserts.assertEquals(a.cnt, 2);
  });
});
