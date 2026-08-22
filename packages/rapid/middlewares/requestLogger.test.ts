/**
 * @fileoverview requestLogger — level-by-outcome access lines on every
 * transport, skip predicate, and error rethrow.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { Application } from '../Application.ts';
import { RapidError } from '../errors/mod.ts';
import { requestLogger } from './requestLogger.ts';

type Line = { level: string; msg: string; meta: Record<string, unknown> };

/** Capture the app's log lines by shadowing the slogger methods. */
function capture(app: Application): Line[] {
  const lines: Line[] = [];
  for (const level of ['info', 'warn', 'error'] as const) {
    (app.log as unknown as Record<string, unknown>)[level] = (
      msg: string,
      meta: Record<string, unknown> = {},
    ) => {
      lines.push({ level, msg, meta });
    };
  }
  return lines;
}

const access = (lines: Line[]) => lines.filter((l) => l.msg === 'access');

describe('rapid.middlewares.requestLogger', () => {
  it('logs info on success, warn on 4xx, error on 5xx — HTTP', async () => {
    const app = await Application.initialize({
      name: 'rl',
      server: { port: 0 },
    });
    const lines = capture(app);
    app.use(requestLogger());
    app.get('/ok', () => ({ content: 'fine' }));
    app.get('/denied', () => {
      throw new RapidError('RAPID_ACCESS_DENIED', {});
    });
    app.get('/boom', () => {
      throw new Error('kaboom');
    });
    await app.start();
    const base = `http://localhost:${app.port}`;
    try {
      await (await fetch(`${base}/ok`)).text();
      await (await fetch(`${base}/denied`)).text();
      await (await fetch(`${base}/boom`)).text();
      const logged = access(lines);
      asserts.assertEquals(logged.length, 3);
      asserts.assertEquals(logged[0]!.level, 'info');
      asserts.assertEquals(logged[0]!.meta['status'], 200);
      asserts.assertEquals(logged[0]!.meta['matched'], true);
      asserts.assertEquals(logged[0]!.meta['type'], 'HTTP');
      asserts.assertEquals(logged[0]!.meta['action'], 'GET /ok');
      asserts.assertEquals(logged[1]!.level, 'warn');
      asserts.assertEquals(logged[1]!.meta['status'], 403);
      asserts.assertEquals(logged[1]!.meta['code'], 'RAPID_ACCESS_DENIED');
      asserts.assertEquals(logged[2]!.level, 'error');
      asserts.assertEquals(logged[2]!.meta['status'], 500);
    } finally {
      await app.stop();
    }
  });

  it('a 404 logs warn with matched=false (attacker-controlled action)', async () => {
    const app = await Application.initialize({
      name: 'rl4',
      server: { port: 0 },
    });
    const lines = capture(app);
    app.use(requestLogger());
    app.get('/known', () => ({ content: 'x' }));
    await app.start();
    try {
      await (await fetch(`http://localhost:${app.port}/nope`)).text();
      const logged = access(lines);
      asserts.assertEquals(logged.length, 1);
      asserts.assertEquals(logged[0]!.level, 'warn');
      asserts.assertEquals(logged[0]!.meta['status'], 404);
      asserts.assertEquals(logged[0]!.meta['matched'], false);
    } finally {
      await app.stop();
    }
  });

  it('logs job firings through the same registration', async () => {
    const app = await Application.initialize({
      name: 'rlj',
      server: { enabled: false },
    });
    const lines = capture(app);
    app.use(requestLogger());
    app.job('tick', '0 6 * * *', () => ({ content: 'ran' }));
    const outcome = await app.triggerJob('tick');
    asserts.assertEquals(outcome.status, 200);
    const logged = access(lines);
    asserts.assertEquals(logged.length, 1);
    asserts.assertEquals(logged[0]!.meta['type'], 'JOB');
    asserts.assertEquals(logged[0]!.meta['action'], 'tick');
    asserts.assertEquals(logged[0]!.level, 'info');
  });

  it('the skip predicate suppresses the line, not the invocation', async () => {
    const app = await Application.initialize({
      name: 'rls',
      server: { port: 0 },
    });
    const lines = capture(app);
    app.use(requestLogger({ skip: (ctx) => ctx.action === 'GET /health' }));
    app.get('/health', () => ({ content: 'ok' }));
    app.get('/real', () => ({ content: 'ok' }));
    await app.start();
    const base = `http://localhost:${app.port}`;
    try {
      const health = await fetch(`${base}/health`);
      asserts.assertEquals(health.status, 200); // chain ran fine
      await health.text();
      await (await fetch(`${base}/real`)).text();
      const logged = access(lines);
      asserts.assertEquals(logged.length, 1);
      asserts.assertEquals(logged[0]!.meta['action'], 'GET /real');
    } finally {
      await app.stop();
    }
  });
});
