/**
 * @fileoverview scope sugar — only* skips, guard* fails closed, the
 * metadata survives, and the boot diagnostic reads it.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { Application } from '../Application.ts';
import type { RapidContext, RapidMiddleware } from '../types/mod.ts';
import {
  guardHTTP,
  guardJOB,
  guardSOCKET,
  middlewareScope,
  onlyHTTP,
  onlyJOB,
  onlySOCKET,
} from './scope.ts';

describe('rapid.middlewares.scope', () => {
  it('onlyHTTP runs on HTTP and SKIPS jobs (chain continues)', async () => {
    const app = await Application.initialize({
      name: 'sc1',
      server: { port: 0 },
    });
    const ran: string[] = [];
    app.use(onlyHTTP(async (ctx, next) => {
      ran.push(`http:${ctx.method}`);
      await next();
    }));
    app.get('/s', () => ({ content: 'ok' }));
    app.job('j', '0 6 * * *', () => ({ content: 'ran' }));
    await app.start();
    try {
      await (await fetch(`http://localhost:${app.port}/s`)).text();
      const outcome = await app.triggerJob('j');
      // The job SKIPPED the wrapper but still ran its handler:
      asserts.assertEquals(outcome.status, 200);
      asserts.assertEquals(outcome.handlerRan, true);
      asserts.assertEquals(ran, ['http:GET']);
    } finally {
      await app.stop();
    }
  });

  it('guardHTTP REJECTS a job invocation (fail-closed)', async () => {
    const app = await Application.initialize({
      name: 'sc2',
      server: { enabled: false },
    });
    app.use(guardHTTP(async (_ctx, next) => {
      await next();
    }));
    app.job('j', '0 6 * * *', () => ({ content: 'ran' }));
    const outcome = await app.triggerJob('j');
    asserts.assertEquals(outcome.status, 403);
    asserts.assertEquals(outcome.handlerRan, false);
    asserts.assertEquals(
      (outcome.content as Record<string, unknown>)['code'],
      'RAPID_ACCESS_DENIED',
    );
  });

  it('onlyJOB gates the other direction', async () => {
    const app = await Application.initialize({
      name: 'sc3',
      server: { port: 0 },
    });
    let jobRuns = 0;
    app.use(onlyJOB(async (_ctx, next) => {
      jobRuns++;
      await next();
    }));
    app.get('/s', () => ({ content: 'ok' }));
    app.job('j', '0 6 * * *', () => ({ content: 'ran' }));
    await app.start();
    try {
      await (await fetch(`http://localhost:${app.port}/s`)).text();
      asserts.assertEquals(jobRuns, 0);
      await app.triggerJob('j');
      asserts.assertEquals(jobRuns, 1);
    } finally {
      await app.stop();
    }
  });

  it('scope metadata is readable; unscoped middleware are universal', () => {
    const scoped = onlyHTTP(async (_ctx, next) => await next());
    asserts.assertEquals(middlewareScope(scoped), ['HTTP']);
    asserts.assertEquals(
      middlewareScope(async (_ctx, next) => await next()),
      undefined,
    );
  });

  it('guardSOCKET REJECTS a job invocation (fail-closed); wrapped never runs', async () => {
    const app = await Application.initialize({
      name: 'sc4',
      server: { enabled: false },
    });
    let wrappedRan = false;
    app.use(guardSOCKET(async (_ctx, next) => {
      wrappedRan = true;
      await next();
    }));
    app.job('j', '0 6 * * *', () => ({ content: 'ran' }));
    const outcome = await app.triggerJob('j');
    asserts.assertEquals(outcome.status, 403);
    asserts.assertEquals(outcome.handlerRan, false);
    asserts.assertEquals(
      (outcome.content as Record<string, unknown>)['code'],
      'RAPID_ACCESS_DENIED',
    );
    asserts.assertEquals(wrappedRan, false);
  });

  it('guardSOCKET REJECTS an HTTP invocation with a 403', async () => {
    const app = await Application.initialize({
      name: 'sc5',
      server: { port: 0, hostname: '127.0.0.1' },
    });
    let wrappedRan = false;
    app.use(guardSOCKET(async (_ctx, next) => {
      wrappedRan = true;
      await next();
    }));
    app.get('/s', () => ({ content: 'ok' }));
    const r = await app.fetch(new Request('http://app/s'));
    await r.text();
    asserts.assertEquals(r.status, 403);
    asserts.assertEquals(wrappedRan, false);
    await app.stop();
  });

  it('guardJOB REJECTS an HTTP invocation with a 403 (fail-closed)', async () => {
    const app = await Application.initialize({
      name: 'sc6',
      server: { port: 0, hostname: '127.0.0.1' },
    });
    let wrappedRan = false;
    app.use(guardJOB(async (_ctx, next) => {
      wrappedRan = true;
      await next();
    }));
    app.get('/s', () => ({ content: 'ok' }));
    const r = await app.fetch(new Request('http://app/s'));
    const body = await r.json();
    asserts.assertEquals(r.status, 403);
    asserts.assertEquals(body.code, 'RAPID_ACCESS_DENIED');
    asserts.assertEquals(wrappedRan, false);
    await app.stop();
  });

  it('onlySOCKET SKIPS HTTP and JOB (chain continues) and RUNS on SOCKET', async () => {
    const app = await Application.initialize({
      name: 'sc7',
      server: { port: 0, hostname: '127.0.0.1' },
    });
    let httpJobRuns = 0;
    app.use(onlySOCKET(async (_ctx, next) => {
      httpJobRuns++;
      await next();
    }));
    app.get('/s', () => ({ content: 'ok' }));
    app.job('j', '0 6 * * *', () => ({ content: 'ran' }));
    // HTTP → wrapper skipped, handler still runs.
    const http = await app.fetch(new Request('http://app/s'));
    asserts.assertEquals(await http.text(), 'ok');
    asserts.assertEquals(http.status, 200);
    // JOB → wrapper skipped, handler still runs.
    const job = await app.triggerJob('j');
    asserts.assertEquals(job.status, 200);
    asserts.assertEquals(job.handlerRan, true);
    asserts.assertEquals(httpJobRuns, 0);
    await app.stop();

    // SOCKET → the wrapped middleware actually runs.
    let socketRan = false;
    let continued = false;
    const wrapped = onlySOCKET(async (_ctx, next) => {
      socketRan = true;
      await next();
    });
    await wrapped(
      { type: 'SOCKET' } as unknown as RapidContext,
      () => {
        continued = true;
        return Promise.resolve();
      },
    );
    asserts.assertEquals(socketRan, true);
    asserts.assertEquals(continued, true);
  });

  it('guardSOCKET / guardJOB carry their transport scope metadata', () => {
    const noop: RapidMiddleware = async (_ctx, next) => await next();
    asserts.assertEquals(
      middlewareScope(guardSOCKET(noop as never)),
      ['SOCKET'],
    );
    asserts.assertEquals(middlewareScope(guardJOB(noop as never)), ['JOB']);
  });

  it('R2-H3: boot emits NO scope-coverage warning (removed by design)', async () => {
    // The old warning asked only "does SOME middleware reach SOCKET",
    // which any unscoped middleware answers yes to — so it went silent
    // for exactly the hole below (an onlyHTTP'd guard beside a logger)
    // while firing for the fail-CLOSED guardHTTP case. It was removed;
    // coverage checking belongs to the auth-context design round, which
    // will know which middleware is security-relevant. This test pins
    // the removal so it cannot creep back as a heuristic.
    const app = await Application.initialize({
      name: 'scw',
      server: { port: 0 },
    });
    const warnings: string[] = [];
    (app.log as unknown as Record<string, unknown>)['warn'] = (
      msg: string,
    ) => {
      warnings.push(msg);
    };
    app.socket('cmd', () => ({ content: 'ok' }));
    app.use(onlyHTTP(async (_ctx, next) => await next()));
    await app.start();
    await app.stop();
    asserts.assertEquals(warnings, []);
  });
});
