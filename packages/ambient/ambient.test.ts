import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { ambient } from './mod.ts';
import type { RequestContext } from './mod.ts';

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
});
