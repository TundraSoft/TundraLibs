import { throttle } from './throttle.ts';
import { describe, it } from '../../dev.dependencies.ts';
import { assertEquals } from '../../dev.dependencies.ts';

describe({
  name: 'utils',
}, () => {
  describe('decorators', () => {
    describe('throttle', () => {
      class Test {
        public called = 0;

        @throttle(5)
        public methodName() {
          this.called += 1;
          return { a: this.called };
        }
      }

      const a = new Test();

      it('should throttle the method execution', () => {
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
  });
});
