/**
 * @fileoverview `app.metrics` — the compat WebServer's per-request
 * counters surfaced on the Application. Opt-in via `server.metrics`.
 * @module
 */
import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { Application } from './Application.ts';

const drain = async (r: Response) => {
  await r.text();
};

describe('rapid.Application metrics', () => {
  it('counts requests + status classes + latency when enabled', async () => {
    const app = new Application({
      name: 'metrics-on',
      server: { port: 0, hostname: '127.0.0.1', metrics: true },
    });
    app.get('/ok', () => ({ content: { ok: true } }));
    await app.start();
    try {
      const base = `http://127.0.0.1:${app.port}`;
      await drain(await fetch(`${base}/ok`));
      await drain(await fetch(`${base}/ok`));
      await drain(await fetch(`${base}/missing`)); // framework 404

      const m = app.metrics;
      asserts.assert(m !== undefined, 'metrics present while listening');
      asserts.assertEquals(m!.requests.total, 3);
      asserts.assertEquals(m!.statusCodes['2xx'], 2);
      asserts.assertEquals(m!.statusCodes['4xx'], 1); // the 404 route miss
      asserts.assert(m!.responseTime.average >= 0);
    } finally {
      await app.stop();
    }
  });

  it('stays zeroed (no collection) when not enabled', async () => {
    const app = new Application({
      name: 'metrics-off',
      server: { port: 0, hostname: '127.0.0.1' },
    });
    app.get('/ok', () => ({ content: { ok: true } }));
    await app.start();
    try {
      await drain(await fetch(`http://127.0.0.1:${app.port}/ok`));
      asserts.assertEquals(app.metrics!.requests.total, 0);
    } finally {
      await app.stop();
    }
  });

  it('is undefined before the listener is up', () => {
    const app = new Application({ name: 'metrics-cold', server: { port: 0 } });
    asserts.assertEquals(app.metrics, undefined);
  });
});
