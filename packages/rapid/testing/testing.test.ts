/**
 * @fileoverview The test harness itself — `harness()` (fakes + boot +
 * restore) and `client()` (route driving over app.fetch).
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { Doctor, inject, label } from '@tundralibs/doctor';
import { Application } from '../Application.ts';
import { RapidModule } from '../modules/mod.ts';
import { client, harness, view } from './mod.ts';

type Clock = { now(): string };
const CLOCK = label<Clock>('Clock');

class Stamper extends RapidModule {
  readonly name = 'Stamper';
  readonly namespace = 'stamp';
  protected readonly events = {};
  private readonly __clock = inject(CLOCK);
  stamp() {
    return { at: this.__clock.now() };
  }
}

describe('rapid/testing harness', () => {
  it('boots modules with a stubbed dependency, then restores it on dispose', async () => {
    asserts.assertEquals(Doctor.has(CLOCK), false);
    const h = await harness({
      modules: [{ Stamper }],
      stub: [[CLOCK, { now: () => 'FROZEN' }]],
    });
    asserts.assertEquals(h.modules.Stamper.stamp(), { at: 'FROZEN' });
    const res = await h.invoke(Stamper, 'stamp', []);
    asserts.assertEquals(res.content, { at: 'FROZEN' });
    await h.dispose();
    asserts.assertEquals(Doctor.has(CLOCK), false); // stub revoked
  });

  it('await using disposes automatically', async () => {
    let ref: { disposed?: boolean } = {};
    {
      await using h = await harness({
        modules: [{ Stamper }],
        stub: [[CLOCK, { now: () => 'X' }]],
      });
      ref = h.runtime as unknown as { disposed?: boolean };
      asserts.assertEquals(h.modules.Stamper.stamp().at, 'X');
    }
    asserts.assertEquals(ref.disposed, true); // runtime.disposed after the block
    asserts.assertEquals(Doctor.has(CLOCK), false);
  });
});

describe('rapid/testing client', () => {
  it('drives routes over app.fetch with parsed responses', async () => {
    const app = await Application.initialize({
      name: 'client-test',
      server: { port: 0, hostname: '127.0.0.1' },
      logger: { handlers: [] },
      uploads: { path: '/tmp/rapid-client-test' },
    });
    app.get(
      '/echo/:name:',
      (ctx) => ({ content: { hi: ctx.args.params.name } }),
    );
    app.post('/sum', async (ctx) => {
      const { a, b } = (await ctx.payload) as { a: number; b: number };
      return { status: 201, content: { sum: a + b } };
    });
    const api = client(app);
    const got = await api.get('/echo/ada', { query: { q: '1' } });
    asserts.assertEquals([got.status, got.body], [200, { hi: 'ada' }]);
    const posted = await api.post('/sum', { body: { a: 2, b: 3 } });
    asserts.assertEquals([posted.status, posted.body], [201, { sum: 5 }]);
    await app.stop();
  });

  it('view() hands a frozen bag with defaults; overrides and extras merge', () => {
    const bag = view();
    asserts.assert(Object.isFrozen(bag));
    asserts.assertEquals(bag.path, '/');
    asserts.assertEquals(bag.runtimePath, '/__rapid/ui.js');
    const custom = view({ path: '/posts', user: { name: 'Ada' } }) as
      & ReturnType<typeof view>
      & { user?: { name: string } };
    asserts.assertEquals(custom.path, '/posts');
    asserts.assertEquals(custom.user?.name, 'Ada');
    // An OVERRIDDEN query is frozen too — buildView deep-freezes it, so
    // a query-mutating template must fail in the unit test, not first
    // in production.
    const overridden = view({ query: { level: 'advanced' } });
    asserts.assert(Object.isFrozen(overridden.query));
    asserts.assertEquals(overridden.query['level'], 'advanced');
  });

  it('client swap:true sends the app-RESOLVED swap header', async () => {
    const app = await Application.initialize({
      name: 'client-swap-test',
      server: { port: 0, hostname: '127.0.0.1' },
      logger: { handlers: [] },
    });
    app.ui({ swapHeader: 'hx-request' });
    const seen: (string | null)[] = [];
    app.get('/probe', (ctx) => {
      seen.push(ctx.headers.get('hx-request'), ctx.headers.get('rapid-swap'));
      return { content: 'ok' };
    });
    const api = client(app);
    await api.get('/probe', { swap: true });
    // The configured name, not the hardcoded default.
    asserts.assertEquals(seen, ['1', null]);
    await app.stop();
  });
});
