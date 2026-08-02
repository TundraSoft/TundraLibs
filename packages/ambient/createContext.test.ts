import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { createContext } from './mod.ts';
import { assertAsyncLocalStorage } from './createContext.ts';

describe('ambient.createContext', () => {
  it('assertAsyncLocalStorage passes when a constructor is available', () => {
    assertAsyncLocalStorage(); // the runtime's real ALS
    assertAsyncLocalStorage(class {}); // any constructor
  });

  it('assertAsyncLocalStorage throws an actionable error when ALS is missing', () => {
    // Pass a non-function that is NOT `undefined` (which would trigger the
    // default parameter and defeat the test) to simulate a runtime lacking it.
    asserts.assertThrows(
      () => assertAsyncLocalStorage(null),
      Error,
      'AsyncLocalStorage',
    );
  });

  it('returns undefined / fallback / false outside any run scope', () => {
    const ctx = createContext<number>();
    asserts.assertEquals(ctx.get(), undefined);
    asserts.assertEquals(ctx.getOr(42), 42);
    asserts.assertEquals(ctx.active(), false);
  });

  it('exposes the value inside run', () => {
    const ctx = createContext<number>();
    ctx.run(7, () => {
      asserts.assertEquals(ctx.get(), 7);
      asserts.assertEquals(ctx.getOr(0), 7);
      asserts.assertEquals(ctx.active(), true);
    });
    asserts.assertEquals(ctx.get(), undefined);
  });

  it('returns the callback result', () => {
    const ctx = createContext<string>();
    asserts.assertEquals(ctx.run('x', () => 'result'), 'result');
  });

  it('survives await inside the run', async () => {
    const ctx = createContext<string>();
    await ctx.run('acme', async () => {
      await new Promise((r) => setTimeout(r, 1));
      asserts.assertEquals(ctx.get(), 'acme');
    });
  });

  it('isolates concurrent run flows', async () => {
    const ctx = createContext<string>();
    const seen: string[] = [];
    const flow = (id: string, delay: number) =>
      ctx.run(id, async () => {
        await new Promise((r) => setTimeout(r, delay));
        seen.push(`${id}:${ctx.get()}`);
      });
    await Promise.all([flow('a', 5), flow('b', 1)]);
    asserts.assertArrayIncludes(seen, ['a:a', 'b:b']);
  });

  it('keeps distinct stores independent', () => {
    const a = createContext<string>();
    const b = createContext<string>();
    a.run('A', () => {
      asserts.assertEquals(a.get(), 'A');
      asserts.assertEquals(b.get(), undefined);
    });
  });

  it('supports nested runs — inner shadows, outer is restored', () => {
    const ctx = createContext<number>();
    ctx.run(1, () => {
      asserts.assertEquals(ctx.get(), 1);
      ctx.run(2, () => asserts.assertEquals(ctx.get(), 2));
      asserts.assertEquals(ctx.get(), 1);
    });
  });
});
