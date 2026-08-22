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
    const app = await Application.initialize({
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

  it('collapses unmatched (404) routes to one low-cardinality meter series', async () => {
    // The metro-man Meter labels by `action`; an unmatched request's action
    // is the raw (attacker-controlled) path. Distinct 404 URLs must NOT each
    // mint a new time-series — they collapse to `<METHOD> <unmatched>`.
    const app = await Application.initialize({
      name: 'meter-cardinality',
      server: { port: 0, hostname: '127.0.0.1', metrics: true },
    });
    app.get('/ok', () => ({ content: 'ok' }));
    await app.fetch(new Request('http://app/wp-admin'));
    await app.fetch(new Request('http://app/.env-secret-xyz'));
    const text = app.meter!.collect('PROMETHEUS');
    asserts.assertStringIncludes(text, 'action="GET <unmatched>"');
    // The raw scan paths must NEVER appear as label values.
    asserts.assert(!text.includes('wp-admin'), 'raw 404 path leaked to labels');
    asserts.assert(
      !text.includes('.env-secret'),
      'raw 404 path leaked to labels',
    );
  });

  it('stays zeroed (no collection) when not enabled', async () => {
    const app = await Application.initialize({
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

  it('is undefined before the listener is up', async () => {
    const app = await Application.initialize({
      name: 'metrics-cold',
      server: { port: 0 },
    });
    asserts.assertEquals(app.metrics, undefined);
  });

  it('jobMetrics reports registered jobs + snapshots (not gated on metrics)', async () => {
    const app = await Application.initialize({
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
    const app = await Application.initialize({
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

  it('context exposes meter + jobMetrics; server counters come from ctx.app (not mirrored on ctx)', async () => {
    const app = await Application.initialize({
      name: 'ctxmetrics',
      server: { port: 0, hostname: '127.0.0.1', metrics: true },
    });
    app.job('j', '0 0 1 1 *', () => ({ content: 'ok' }));
    app.get('/peek', (ctx) => ({
      content: {
        meter: ctx.meter !== undefined, // the metro-man recorder (kept on ctx)
        jobs: ctx.jobMetrics?.total ?? -1, // cron stats (kept on ctx)
        // Server HTTP/websocket counters moved OFF the context (G5) — reach
        // them via the app, so a JOB context no longer carries HTTP surface.
        http: ctx.app.metrics !== undefined,
        socket: ctx.app.socketMetrics !== undefined,
      },
    }));
    await app.start();
    try {
      const body = await (await fetch(`http://127.0.0.1:${app.port}/peek`))
        .json();
      asserts.assertEquals(body, {
        meter: true,
        jobs: 1,
        http: true,
        socket: true,
      });
    } finally {
      await app.stop();
    }
  });
});
