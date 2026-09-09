/**
 * @fileoverview Tests for `JOBContext` — the scheduled-job context. Covers the
 * JOB-specific invariants a background firing must hold: the uniform args shape
 * (frozen params, empty query, default paging), a response setter that rejects
 * a 3xx and a stream body (neither has meaning off an HTTP wire) yet lets a
 * body-only override through WITHOUT downgrading an already-set failure status,
 * and drift measured from the two tick timestamps.
 * @module
 */
import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { Application } from '../Application.ts';
import { JOBContext } from './JOBContext.ts';
import { RapidError } from '../errors/mod.ts';

const makeApp = () =>
  Application.initialize({
    name: 'jobctx',
    server: { port: 0, hostname: '127.0.0.1' },
    logger: { handlers: [] },
  });

const tick = (scheduledAt: Date, firedAt: Date, count = 1) => ({
  scheduledAt,
  firedAt,
  count,
});

const make = async (params?: Record<string, unknown>) => {
  const app = await makeApp();
  return new JOBContext(app, {
    job: 'nightly',
    tick: tick(new Date(0), new Date(0)),
    params,
  });
};

describe('rapid.context.JOBContext', () => {
  it('args carries the merged params, an empty query, and default paging — all frozen', async () => {
    const ctx = await make({ tenant: 'acme' });
    asserts.assertEquals(ctx.args.params, { tenant: 'acme' });
    asserts.assertEquals(ctx.args.query, { filters: {}, sorting: [] });
    asserts.assert(typeof ctx.args.paging.size === 'number');
    // Readonly is real at runtime, not just in the types.
    asserts.assertThrows(() => {
      (ctx.args.params as Record<string, unknown>).tenant = 'evil';
    });
  });

  it('action is the job name and drift is firedAt − scheduledAt', async () => {
    const app = await makeApp();
    const ctx = new JOBContext(app, {
      job: 'report',
      tick: tick(new Date(1_000), new Date(1_025)),
    });
    asserts.assertEquals(ctx.action, 'report');
    asserts.assertEquals(ctx.drift, 25);
  });

  it('a body-only override never downgrades an already-set failure status', async () => {
    const ctx = await make();
    ctx.response = { status: 500, content: 'boom' };
    asserts.assertEquals(ctx.status, 500);
    // Enrich the body only — the failure outcome must survive.
    ctx.response = { content: { enriched: true } };
    asserts.assertEquals(ctx.status, 500);
    asserts.assertEquals(ctx.response, {
      status: 500,
      content: { enriched: true },
    });
  });

  it('clearing the response resets the outcome to 200', async () => {
    const ctx = await make();
    ctx.response = { status: 503, content: 'x' };
    ctx.response = null;
    asserts.assertEquals(ctx.status, 200);
    asserts.assertEquals(ctx.response, null);
  });

  it('rejects a 3xx status — a redirect has no meaning on a job', async () => {
    const ctx = await make();
    asserts.assertEquals(
      asserts.assertThrows(() => {
        ctx.response = { status: 302, content: 'x' };
      }, RapidError).code,
      'RAPID_RESPONSE_INVALID',
    );
  });

  it('rejects a stream body — streaming is HTTP-only', async () => {
    const ctx = await make();
    asserts.assertEquals(
      asserts.assertThrows(() => {
        ctx.response = { content: new ReadableStream() };
      }, RapidError).code,
      'RAPID_RESPONSE_INVALID',
    );
  });

  it('respond() yields the { status, content } job outcome', async () => {
    const ctx = await make();
    ctx.response = { status: 201, content: { id: 7 } };
    asserts.assertEquals(ctx.respond(), { status: 201, content: { id: 7 } });
  });
});
