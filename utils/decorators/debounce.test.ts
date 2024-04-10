import { debounce } from './debounce.ts';
import { assertEquals } from '../../dev.dependencies.ts';

Deno.test('utils/decorators/debounce', async (t) => {
  class Test {
    public cnt = 0;

    @debounce(1)
    public methodName() {
      this.cnt += 1;
    }
  }

  const a = new Test();

  await t.step('should throttle the method execution', async () => {
    assertEquals(a.cnt, 0);
    a.methodName();
    a.methodName();
    a.methodName();
    a.methodName();
    await new Promise((resolve) => setTimeout(resolve, 1200));
    a.methodName();
    assertEquals(a.cnt, 2);
  });
});
