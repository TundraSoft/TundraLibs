import { debounce } from './debounce.ts';
import { assertEquals, describe, it } from '../../dev.dependencies.ts';

describe({
  name: 'utils',
  sanitizeExit: false,
  sanitizeOps: false,
  sanitizeResources: false,
}, () => {
  describe('decorators', () => {
    describe('throttle', () => {
      class Test {
        public cnt = 0;

        @debounce(1000)
        public methodName() {
          this.cnt += 1;
        }
      }

      const a = new Test();

      it('should throttle the method execution', async () => {
        assertEquals(a.cnt, 0);
        a.methodName();
        a.methodName();
        a.methodName();
        a.methodName();
        await new Promise((resolve) => setTimeout(resolve, 1200));
        assertEquals(a.cnt, 1);
      });
    });
  });
});
