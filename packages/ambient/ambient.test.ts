import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { ambient, createContext } from './mod.ts';
import { buildAmbient } from './ambient.ts';
import { assertAsyncLocalStorage } from './createContext.ts';
import type { Context, RequestContext } from './mod.ts';

describe('ambient', () => {
  it('is empty outside any run scope', () => {
    asserts.assertEquals(ambient.get(), undefined);
    asserts.assertEquals(ambient.active(), false);
  });

  it('exposes the seeded context inside run', () => {
    ambient.run({ correlationId: 'c1' }, () => {
      asserts.assertEquals(ambient.get()?.correlationId, 'c1');
      asserts.assertEquals(ambient.active(), true);
    });
    asserts.assertEquals(ambient.get(), undefined);
  });

  it('survives await', async () => {
    await ambient.run({ correlationId: 'c2' }, async () => {
      await new Promise((r) => setTimeout(r, 1));
      asserts.assertEquals(ambient.get()?.correlationId, 'c2');
    });
  });

  it('set() mutates the live bag within a scope', () => {
    ambient.run({ correlationId: 'c3' }, () => {
      ambient.set('userId', 'u_1');
      asserts.assertEquals(ambient.get()?.userId, 'u_1');
    });
  });

  it('set() outside a scope is a silent no-op', () => {
    ambient.set('userId', 'nope'); // must not throw
    asserts.assertEquals(ambient.get(), undefined);
  });

  it('child() inherits parent fields and overlays the patch', () => {
    ambient.run({ correlationId: 'c4', tenant: 't1' }, () => {
      ambient.child({ spanId: 's1', tenant: 't2' }, () => {
        const c = ambient.get();
        asserts.assertEquals(c?.correlationId, 'c4'); // inherited
        asserts.assertEquals(c?.spanId, 's1'); // added
        asserts.assertEquals(c?.tenant, 't2'); // overridden
      });
      // parent scope unchanged once the child returns
      asserts.assertEquals(ambient.get()?.tenant, 't1');
      asserts.assertEquals(ambient.get()?.spanId, undefined);
    });
  });

  it('child() outside a scope behaves like run over the patch alone', () => {
    ambient.child({ spanId: 's-solo' }, () => {
      asserts.assertEquals(ambient.get()?.spanId, 's-solo');
      asserts.assertEquals(ambient.get()?.correlationId, undefined);
    });
    asserts.assertEquals(ambient.get(), undefined);
  });

  it('isolates concurrent requests', async () => {
    const seen: Array<string | undefined> = [];
    const req = (id: string, delay: number) =>
      ambient.run({ correlationId: id }, async () => {
        await new Promise((r) => setTimeout(r, delay));
        seen.push(ambient.get()?.correlationId);
      });
    await Promise.all([req('r1', 5), req('r2', 1)]);
    asserts.assertArrayIncludes(seen, ['r1', 'r2']);
  });

  it('run() copies the seed — mutation does not leak to the caller', () => {
    const seed: RequestContext = { correlationId: 'c5' };
    ambient.run(seed, () => ambient.set('userId', 'u'));
    asserts.assertEquals(seed.userId, undefined);
  });

  it('builds the store on first use and reuses that one instance', () => {
    // The store is created lazily, so the very first access must still be a
    // fully working context — and every later access must land on the same
    // instance. A second store would not observe the first's writes, so a
    // value written through `set` and read back through `get` (two separate
    // accessor calls, hence two separate store lookups) proves reuse.
    ambient.run({ correlationId: 'm1' }, () => {
      ambient.set('userId', 'u_m1');
      asserts.assertEquals(ambient.get()?.userId, 'u_m1');
    });
    ambient.run({ correlationId: 'm2' }, () => {
      asserts.assertEquals(ambient.get()?.correlationId, 'm2');
      asserts.assertEquals(ambient.get()?.userId, undefined); // fresh scope
    });
  });
});

describe('ambient (runtime without AsyncLocalStorage)', () => {
  /**
   * Stands in for a browser: the store can never be built. It fails through the
   * real `assertAsyncLocalStorage` guard, so this exercises the production
   * error rather than a copy of its message — if the message changes, these
   * tests follow it automatically.
   */
  const noAsyncLocalStorage = (): never => {
    assertAsyncLocalStorage(null);
    throw new Error('unreachable: assertAsyncLocalStorage should have thrown');
  };

  const degraded = buildAmbient(noAsyncLocalStorage);

  it('get() returns undefined instead of throwing', () => {
    asserts.assertEquals(degraded.get(), undefined);
  });

  it('set() is a silent no-op', () => {
    degraded.set('userId', 'u_1'); // must not throw
    asserts.assertEquals(degraded.get(), undefined);
  });

  it('active() reports false instead of throwing', () => {
    asserts.assertEquals(degraded.active(), false);
  });

  it('run() throws the documented TypeError', () => {
    asserts.assertThrows(
      () => degraded.run({ correlationId: 'c' }, () => 'never'),
      TypeError,
      'AsyncLocalStorage',
    );
  });

  it('child() throws the documented TypeError', () => {
    asserts.assertThrows(
      () => degraded.child({ spanId: 's' }, () => 'never'),
      TypeError,
      'AsyncLocalStorage',
    );
  });

  it('run() does not run the callback when it throws', () => {
    let ran = false;
    asserts.assertThrows(() =>
      degraded.run({ correlationId: 'c' }, () => {
        ran = true;
      })
    );
    // Failing loudly is the point: silently running `fn` outside any context
    // would hand the callback a scope that does not exist.
    asserts.assertEquals(ran, false);
  });

  it('names the supported runtimes in the error', () => {
    const error = asserts.assertThrows(
      () => degraded.run({}, () => 'never'),
    ) as TypeError;
    asserts.assertStringIncludes(error.message, '@tundralibs/ambient');
    asserts.assertStringIncludes(error.message, 'node:async_hooks');
    asserts.assertStringIncludes(error.message, 'Deno, Bun, and Node.js >= 22');
  });

  it('works normally again once the resolver supplies a store', () => {
    // The seam is honoured in the working direction too, so the degradation
    // above is genuinely driven by store availability and not by the seam
    // itself being broken.
    const store: Context<RequestContext> = createContext<RequestContext>();
    const working = buildAmbient(() => store);
    working.run({ correlationId: 'w1' }, () => {
      working.set('userId', 'u_w');
      asserts.assertEquals(working.get()?.correlationId, 'w1');
      asserts.assertEquals(working.get()?.userId, 'u_w');
      asserts.assertEquals(working.active(), true);
    });
    asserts.assertEquals(working.get(), undefined);
    asserts.assertEquals(working.active(), false);
  });
});
