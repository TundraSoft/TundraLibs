import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
// Import the decorators from the package's PUBLIC entry point (mod.ts) — the
// exact surface consumers get as `@tundralibs/utils`. If the decorators stop
// being re-exported here, every documented decorator import
// (Utils-Once.md / Utils-Throttle.md / Utils-Memoize.md) breaks for consumers.
import { Memoize, Once, Throttle } from './mod.ts';

describe('utils.mod public surface', () => {
  it('re-exports Once/Throttle/Memoize from the root entry point', () => {
    asserts.assertEquals(typeof Once, 'function');
    asserts.assertEquals(typeof Throttle, 'function');
    asserts.assertEquals(typeof Memoize, 'function');
  });

  it('@Once imported from the public entry point runs a method once', () => {
    class Service {
      runs = 0;
      @Once
      init(): number {
        this.runs++;
        return 42;
      }
    }
    const s = new Service();
    asserts.assertEquals(s.init(), 42);
    asserts.assertEquals(s.init(), 42);
    asserts.assertEquals(s.runs, 1);
  });

  it('@Throttle imported from the public entry point throttles a method', async () => {
    class Api {
      static calls = 0;
      @Throttle(200)
      hit(): number {
        Api.calls++;
        return Api.calls;
      }
    }
    const a = new Api();
    a.hit();
    a.hit();
    asserts.assertEquals(Api.calls, 1);
    await new Promise((resolve) => setTimeout(resolve, 250));
    a.hit();
    asserts.assertEquals(Api.calls, 2);
  });

  it('@Memoize imported from the public entry point memoizes a method', () => {
    class Calc {
      runs = 0;
      @Memoize(60)
      add(a: number, b: number): number {
        this.runs++;
        return a + b;
      }
    }
    const c = new Calc();
    asserts.assertEquals(c.add(1, 2), 3);
    asserts.assertEquals(c.add(1, 2), 3);
    asserts.assertEquals(c.runs, 1);
  });
});
