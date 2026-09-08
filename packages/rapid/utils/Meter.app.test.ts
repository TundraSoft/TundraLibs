/**
 * @fileoverview The metric families end to end — an Application with
 * `server.metrics` on records error codes, job outcomes, middleware
 * decisions, body bytes and representations; families switched off
 * declare nothing; the object form is validated at boot.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { Application } from '../Application.ts';
import { rateLimit } from '../middlewares/rateLimit.ts';
import { html, template } from '../ui/html.ts';
import type { RapidApplicationMetricsOptions } from '../types/mod.ts';

const make = (metrics: boolean | RapidApplicationMetricsOptions = true) =>
  Application.initialize({
    name: 'meter-app',
    mode: 'DEVELOPMENT',
    server: { port: 0, metrics },
    logger: { handlers: [] },
  });

describe('rapid.utils.Meter (application)', () => {
  it('records error codes, middleware decisions, request bytes and job outcomes on one scrape', async () => {
    const app = await make();
    app.use(rateLimit({ max: 1, window: 60 }));
    app.post('/echo', async (ctx) => ({
      content: { got: (await ctx.payload) as Record<string, unknown> },
    }));
    app.job('tick', '* * * * *', () => ({ content: { ok: true } }));
    app.job('boom', '* * * * *', () => {
      throw new Error('kaput');
    });

    const first = await app.fetch(
      new Request('http://app/echo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"a":1}',
      }),
    );
    asserts.assertEquals(first.status, 200);
    await first.body?.cancel();
    const limited = await app.fetch(new Request('http://app/missing'));
    asserts.assertEquals(limited.status, 429); // second hit in the window
    await limited.body?.cancel();
    await app.triggerJob('tick');
    await app.triggerJob('boom');

    const text = app.meter!.collect('PROMETHEUS');
    asserts.assertStringIncludes(
      text,
      'rapid_error_codes_total{code="RAPID_RATE_LIMITED",transport="HTTP"} 1',
    );
    asserts.assertStringIncludes(
      text,
      'rapid_middleware_events_total{action="GET <unmatched>",event="rejected",middleware="rateLimit"} 1',
    );
    asserts.assertStringIncludes(
      text,
      'rapid_request_bytes_total{transport="HTTP"} 7',
    );
    asserts.assertStringIncludes(
      text,
      'rapid_job_runs_total{job="tick",outcome="ok"} 1',
    );
    asserts.assertStringIncludes(
      text,
      'rapid_job_runs_total{job="boom",outcome="failed"} 1',
    );
    asserts.assertStringIncludes(text, 'rapid_job_duration_ms_bucket{');
    asserts.assertStringIncludes(
      text,
      'rapid_error_codes_total{code="RAPID_UNHANDLED",transport="JOB"} 1',
    );
    await app.stop();
  });

  it('records representations of a templated route by kind', async () => {
    const View = template<{ n: number }>((d) => html`<b>${d.n}</b>`, 'View');
    const app = await make();
    app.get('/n', { template: { render: View, prefer: 'html' } }, () => ({
      content: { n: 1 },
    }));
    app.get('/j', { template: View }, () => ({ content: { n: 2 } }));
    for (
      const [path, headers] of [
        ['/n', {}],
        ['/n', { 'rapid-swap': '1' }],
        ['/j', {}],
      ] as const
    ) {
      const res = await app.fetch(
        new Request(`http://app${path}`, { headers }),
      );
      await res.body?.cancel();
    }
    const text = app.meter!.collect('PROMETHEUS');
    asserts.assertStringIncludes(
      text,
      'rapid_representations_total{kind="page"} 1',
    );
    asserts.assertStringIncludes(
      text,
      'rapid_representations_total{kind="fragment"} 1',
    );
    asserts.assertStringIncludes(
      text,
      'rapid_representations_total{kind="json"} 1',
    );
    await app.stop();
  });

  it('a family switched off declares no series and its recorder is a no-op', async () => {
    const app = await make({ errors: false, middleware: false, bodies: false });
    app.use(rateLimit({ max: 1, window: 60 }));
    for (let i = 0; i < 2; i++) {
      const res = await app.fetch(new Request('http://app/x'));
      await res.body?.cancel();
    }
    const text = app.meter!.collect('PROMETHEUS');
    asserts.assertStringIncludes(text, 'rapid_requests_total{'); // requests family still on
    asserts.assertEquals(text.includes('rapid_error_codes_total'), false);
    asserts.assertEquals(text.includes('rapid_middleware_events_total'), false);
    asserts.assertEquals(text.includes('rapid_request_bytes_total'), false);
    asserts.assertEquals(app.meter!.families.errors, false);
    await app.stop();
  });

  it('the object form is validated at boot: unknown families and non-boolean switches are RAPID_CONFIG', async () => {
    await asserts.assertRejects(
      () =>
        make({ sockets: 'yes' } as unknown as RapidApplicationMetricsOptions),
      Error,
      'server.metrics.sockets',
    );
    await asserts.assertRejects(
      () =>
        make({ latency: true } as unknown as RapidApplicationMetricsOptions),
      Error,
      "unknown family 'latency'",
    );
    const off = await make(false);
    asserts.assertEquals(off.meter, undefined);
    await off.stop();
  });
});
