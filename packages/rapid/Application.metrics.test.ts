/**
 * @fileoverview `app.metrics` / `app.socketMetrics` / `app.jobMetrics` —
 * the request, websocket and cron counters surfaced on the Application
 * (and mirrored on the context). HTTP/socket counters are opt-in via
 * `server.metrics`; cron stats are always tracked.
 * @module
 */
import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { Client } from '@tundralibs/rpc';
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

  it('jobMetrics reports registered jobs + snapshots (not gated on metrics)', async () => {
    const app = new Application({
      name: 'jobmetrics',
      server: { port: 0, hostname: '127.0.0.1' }, // metrics OFF
    });
    app.job('nightly', '0 0 1 1 *', () => ({ content: 'ok' }));
    await app.start();
    try {
      const jm = app.jobMetrics;
      asserts.assert(jm !== undefined, 'job transport is running');
      asserts.assertEquals(jm!.total, 1);
      asserts.assertEquals(jm!.running, 0);
      asserts.assertEquals(jm!.jobs[0]!.name, 'nightly');
      asserts.assertEquals(jm!.jobs[0]!.runCount, 0);
    } finally {
      await app.stop();
    }
  });

  it('socketMetrics reports websocket connection counters', async () => {
    const app = new Application({
      name: 'sockmetrics',
      server: { port: 0, hostname: '127.0.0.1', metrics: true },
    });
    app.socket('echo', (ctx) => ({ content: ctx.args.params }));
    await app.start();
    const ws = new Client({ url: `ws://127.0.0.1:${app.port}/ws` });
    try {
      await ws.connect();
      await ws.command('echo', { a: 1 });
      const sm = app.socketMetrics;
      asserts.assert(sm !== undefined);
      asserts.assertEquals(sm!.connections.active, 1);
      asserts.assertEquals(sm!.messages.received, 1);
    } finally {
      await ws.close();
      await app.stop();
    }
  });

  it('all three are reachable from the context (ctx.metrics / socketMetrics / jobMetrics)', async () => {
    const app = new Application({
      name: 'ctxmetrics',
      server: { port: 0, hostname: '127.0.0.1', metrics: true },
    });
    app.job('j', '0 0 1 1 *', () => ({ content: 'ok' }));
    app.get('/peek', (ctx) => ({
      content: {
        http: ctx.metrics !== undefined,
        socket: ctx.socketMetrics !== undefined,
        jobs: ctx.jobMetrics?.total ?? -1,
      },
    }));
    await app.start();
    try {
      const body = await (await fetch(`http://127.0.0.1:${app.port}/peek`))
        .json();
      asserts.assertEquals(body, { http: true, socket: true, jobs: 1 });
    } finally {
      await app.stop();
    }
  });
});
