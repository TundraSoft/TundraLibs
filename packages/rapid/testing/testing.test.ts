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
import { client, harness } from './mod.ts';

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
});
