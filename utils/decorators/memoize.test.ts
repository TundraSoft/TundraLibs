import { assertEquals, describe, it } from '../../dev.dependencies.ts';
import { memoize } from './memoize.ts';

describe('utils', () => {
  describe('decorators', () => {
    describe('memoize', () => {
      let counter = 0;

      class MyClass {
        @memoize
        myMethod(arg: number) {
          console.log('asdf');
          counter += arg;
          return counter;
        }
      }

      const myClass = new MyClass();

      it('memoize function', async () => {
        assertEquals(await myClass.myMethod(1), 1);
        assertEquals(await myClass.myMethod(1), 1);
        assertEquals(await myClass.myMethod(2), 3);
        assertEquals(await myClass.myMethod(2), 3);
      });
    });
  });
});
