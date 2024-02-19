import { throttle } from './throttle.ts';
import { assertSpyCalls, describe, it, spy } from '../../dev.dependencies.ts';
import { assertSpyCall } from '../../dev.dependencies.ts';

describe({
  name: 'utils',
  sanitizeExit: false,
  sanitizeOps: false,
  sanitizeResources: false,
}, () => {
  describe('decorators', () => {
    describe('throttle', () => {
      class Test {
        @throttle(1000)
        public methodName() {
          return 'test';
        }
      }

      const a = new Test();

      it('should throttle the method execution', () => {
        const spied = spy(a.methodName);
        // Ensure return works
        assertSpyCall(spied, 0, {
          args: [5, 5],
          returned: 'test',
        });
        spied();
        // Should be 1 only
        assertSpyCalls(spied, 1);
      });
    });
  });
});
