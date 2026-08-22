/**
 * @fileoverview Per-app DI container: each `Application` owns a child of
 * the global `Doctor`, pinned on every request's ambient context, so a
 * handler's `inject()` — even after an `await` — resolves against THAT
 * app. Two apps in one process stay isolated, and an app-scoped `stock`
 * never leaks to a sibling or to the global.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { Doctor, inject, label } from '@tundralibs/doctor';
import { Application } from './Application.ts';

type Greeter = { hi(): string };
const GREETER = label<Greeter>('AppGreeter');

const makeApp = async (word: string) => {
  const app = await Application.initialize({
    name: `container-${word}`,
    server: { port: 0, hostname: '127.0.0.1' },
    logger: { handlers: [] },
  });
  app.container.stock(GREETER, { hi: () => word });
  app.get('/hi', () => ({ content: { word: inject(GREETER).hi() } }));
  app.get('/hi-async', async () => {
    await Promise.resolve(); // the sync ambient stack cannot span this
    return { content: { word: inject(GREETER).hi() } };
  });
  return app;
};

describe('rapid.Application per-app container', () => {
  it('routes a handler’s inject() to the app handling the request — two apps stay isolated', async () => {
    const a = await makeApp('alpha');
    const b = await makeApp('beta');
    const [ra, rb] = await Promise.all([
      a.fetch(new Request('http://app/hi')),
      b.fetch(new Request('http://app/hi')),
    ]);
    asserts.assertEquals((await ra.json()).word, 'alpha');
    asserts.assertEquals((await rb.json()).word, 'beta');
  });

  it('resolves the app container even when inject() runs after an await', async () => {
    const a = await makeApp('gamma');
    const res = await a.fetch(new Request('http://app/hi-async'));
    asserts.assertEquals((await res.json()).word, 'gamma');
  });

  it('gives each app a distinct child; a stock never leaks to a sibling or the global', async () => {
    const a = await makeApp('one');
    const b = await makeApp('two');
    asserts.assert(a.container !== b.container);
    asserts.assertEquals(a.container.dispense(GREETER).hi(), 'one');
    asserts.assertEquals(b.container.dispense(GREETER).hi(), 'two');
    // The global registry never saw either app-scoped stock.
    asserts.assertEquals(Doctor.has(GREETER), false);
  });
});
