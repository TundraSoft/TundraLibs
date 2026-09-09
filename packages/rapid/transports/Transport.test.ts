/**
 * @fileoverview Transport._invoke — the shared invocation cycle. Locks
 * R1: a synchronous onion + finalize finishes WITHOUT allocating a
 * request promise (returns the value directly), while an async onion
 * still returns a promise. Also pins the invariants the collapse must
 * preserve: ambient correlation active across the cycle, and any throw
 * disclosed onto ctx.response with finalize still running.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { ambient } from '@tundralibs/ambient';
import { MemoryExporter, SpanKind } from '@tundralibs/tracer';
import { Client } from '@tundralibs/rpc';
import { Application } from '../Application.ts';
import { HTTPContext } from '../context/mod.ts';
import { RapidError } from '../errors/mod.ts';
import type { RapidContextState } from '../types/mod.ts';
import { Transport } from './Transport.ts';
import { HTTPTransport } from './HTTPTransport.ts';

// Minimal concrete transport that exposes the protected cycle.
class TestTransport<S extends RapidContextState = RapidContextState>
  extends Transport<S> {
  start(): Promise<void> {
    return Promise.resolve();
  }
  stop(): Promise<void> {
    return Promise.resolve();
  }
  public run<R>(
    ctx: HTTPContext<S>,
    chain: (c: HTTPContext<S>, next: () => void | Promise<void>) =>
      | void
      | Promise<void>,
    dispatch: () => void | Promise<void>,
    finalize?: () => R | Promise<R>,
  ): R | Promise<R> {
    return this._invoke(ctx, chain, dispatch, undefined, undefined, finalize);
  }
}

const newCtx = (app: Application) =>
  new HTTPContext(app, {
    request: new Request('http://localhost/'),
    remoteAddress: '127.0.0.1',
    action: 'GET /',
    matched: true,
    requestId: 'req-fixed',
  });

const passthrough = (_c: unknown, next: () => void | Promise<void>) => next();

describe('rapid.Transport._invoke', () => {
  it('R1: a sync onion + sync finalize returns SYNCHRONOUSLY (no promise)', async () => {
    const app = await Application.initialize({ name: 't', mode: 'PRODUCTION' });
    const t = new TestTransport(app);
    let handlerRan = false;
    const out = t.run(
      newCtx(app),
      passthrough,
      () => {
        handlerRan = true;
      },
      () => 'FINALIZED',
    );
    asserts.assert(
      !(out instanceof Promise),
      'sync path must not allocate a promise',
    );
    asserts.assert(handlerRan);
    asserts.assertEquals(out, 'FINALIZED');
  });

  it('an async handler still returns a promise (resolves to finalize)', async () => {
    const app = await Application.initialize({ name: 't', mode: 'PRODUCTION' });
    const t = new TestTransport(app);
    const out = t.run(
      newCtx(app),
      passthrough,
      () => Promise.resolve(), // async dispatch
      () => 'FINALIZED',
    );
    asserts.assert(out instanceof Promise, 'async path must be a promise');
    asserts.assertEquals(await out, 'FINALIZED');
  });

  it('ambient correlation is active inside the onion AND finalize', async () => {
    const app = await Application.initialize({ name: 't', mode: 'PRODUCTION' });
    const t = new TestTransport(app);
    let inOnion: string | undefined;
    let inFinalize: string | undefined;
    t.run(
      newCtx(app),
      passthrough,
      () => {
        inOnion = ambient.get()?.requestId as string | undefined;
      },
      () => {
        inFinalize = ambient.get()?.requestId as string | undefined;
        return undefined;
      },
    );
    asserts.assertEquals(inOnion, 'req-fixed');
    asserts.assertEquals(inFinalize, 'req-fixed');
  });

  it('a SYNC throw is disclosed onto ctx.response; finalize still runs', async () => {
    const app = await Application.initialize({ name: 't', mode: 'PRODUCTION' });
    const t = new TestTransport(app);
    const ctx = newCtx(app);
    let finalizeRan = false;
    // A throwing dispatch must NOT escape _invoke — it becomes a
    // disclosure override, and finalize (the response step) still runs.
    const out = t.run(
      ctx,
      passthrough,
      () => {
        throw new Error('boom');
      },
      () => {
        finalizeRan = true;
        return 'FINALIZED';
      },
    );
    asserts.assert(!(out instanceof Promise), 'sync throw stays sync');
    asserts.assertEquals(out, 'FINALIZED');
    asserts.assert(finalizeRan);
    asserts.assert(ctx.response !== null, 'error was disclosed onto response');
    asserts.assertEquals(ctx.status, 500);
  });
});

describe('rapid.Transport._invoke — tracer span path', () => {
  // Enabling `tracer` flips _invoke onto its fully-async span branch:
  // startActiveSpan wraps the onion, setAttributes stamps the request,
  // and an in-span throw is still turned into a disclosure 500 by the
  // SAME catch. None of that runs on the untraced fast path.
  it('records a SERVER span per invocation; an in-span throw still discloses a 500', async () => {
    const exporter = new MemoryExporter();
    const app = await Application.initialize({
      name: 'tr',
      server: { port: 0 },
      tracer: { exporter },
      logger: { handlers: [] },
    });
    app.get('/ok', () => ({ content: 'fine' }));
    app.get('/boom', () => {
      throw new Error('boom');
    });

    const ok = await app.fetch(new Request('http://x/ok'));
    asserts.assertEquals(ok.status, 200);
    asserts.assertEquals(await ok.text(), 'fine');

    const bad = await app.fetch(new Request('http://x/boom'));
    asserts.assertEquals(bad.status, 500);
    // The disclosure envelope (PRODUCTION default) — generic, no leak.
    const body = await bad.json();
    asserts.assertEquals(body.code, 'RAPID_UNHANDLED');
    asserts.assertEquals(body.message, 'Internal server error');
    // Key-exact: nothing else (no details, no debug, no stack) rides a
    // PRODUCTION 500.
    asserts.assertEquals(Object.keys(body).sort(), [
      'code',
      'message',
      'requestId',
    ]);
    asserts.assert(!JSON.stringify(body).includes('boom'));

    // startActiveSpan ran for BOTH: a SERVER span named by the matched
    // route, carrying the low-cardinality attributes setAttributes stamped.
    const okSpan = exporter.find('GET /ok');
    asserts.assert(okSpan !== undefined, 'OK invocation recorded a span');
    asserts.assertEquals(okSpan!.kind, SpanKind.SERVER);
    asserts.assertEquals(okSpan!.attributes['http.route'], '/ok');
    asserts.assertEquals(okSpan!.attributes['http.request.method'], 'GET');
    asserts.assert(
      exporter.find('GET /boom') !== undefined,
      'the throwing invocation still ended (and exported) its span',
    );
  });

  it('extracts an inbound traceparent so the span joins the caller trace', async () => {
    const exporter = new MemoryExporter();
    const app = await Application.initialize({
      name: 'tr2',
      server: { port: 0 },
      tracer: { exporter },
      logger: { handlers: [] },
    });
    app.get('/trace', () => ({ content: 'ok' }));
    const traceId = '0af7651916cd43dd8448eb211c80319c';
    const parentSpanId = 'b7ad6b7169203331';
    const r = await app.fetch(
      new Request('http://x/trace', {
        headers: { traceparent: `00-${traceId}-${parentSpanId}-01` },
      }),
    );
    asserts.assertEquals(r.status, 200);
    const span = exporter.find('GET /trace');
    asserts.assert(span !== undefined, 'the traced request recorded a span');
    // extract() parsed the header and the span joined that trace...
    asserts.assertEquals(span!.context.traceId, traceId);
    // ...as a child of the inbound span (extraction actually ran).
    asserts.assertEquals(span!.parentSpanId, parentSpanId);
  });
});

describe('rapid.Transport._invoke — async metrics bracket', () => {
  // Every other metrics test uses SYNC handlers, so the thenable arm of
  // the metrics bracket (close on resolve) and the 5xx error counter are
  // dark. Async handlers exercise both. `app.fetch` runs headless — the
  // Meter exists from construction (server.metrics), no listener needed.
  it('closes the metric on an async success AND counts an async 5xx', async () => {
    const app = await Application.initialize({
      name: 'am',
      server: { port: 0, hostname: '127.0.0.1', metrics: true },
      logger: { handlers: [] },
    });
    app.get('/ok', async () => {
      await Promise.resolve();
      return { content: 'ok' };
    });
    app.get('/boom', async () => {
      await Promise.resolve();
      throw new Error('async boom');
    });

    asserts.assertEquals(
      (await app.fetch(new Request('http://x/ok'))).status,
      200,
    );
    asserts.assertEquals(
      (await app.fetch(new Request('http://x/boom'))).status,
      500,
    );

    const text = app.meter!.collect('PROMETHEUS');
    // The 5xx counter fired (Meter.end's `status >= 500` arm). Falsifiable:
    // if the async reject arm skipped close(), or the guard regressed, no
    // `rapid_errors_total` SAMPLE line would ever be emitted.
    const errorLines = text.split('\n').filter((l) =>
      l.startsWith('rapid_errors_total')
    );
    asserts.assert(errorLines.length > 0, 'the 5xx error counter was emitted');
    asserts.assert(
      errorLines.some((l) =>
        l.includes('transport="HTTP"') && l.includes('action="GET /boom"')
      ),
      'error counter labelled by HTTP transport + failing route',
    );
    // The async SUCCESS also closed its metric — the 2xx sample proves the
    // resolve arm of the bracket ran, not just the reject arm.
    asserts.assertStringIncludes(
      text,
      'rapid_requests_total{action="GET /ok",status="2xx",transport="HTTP"} 1',
    );
  });
});

describe('rapid.HTTPTransport — finalization + prepare guard', () => {
  it('a mid-chain respond() on a SOCKET frame rejects with a uniform envelope', async () => {
    // The HTTP and JOB early-respond() paths are covered; the SOCKET
    // finalization catch (respond() throwing RAPID_RESPONSE_INVALID the
    // second time, mapped to the rpc error envelope) is not.
    const app = await Application.initialize({
      name: 'sockfin',
      server: { port: 0, hostname: '127.0.0.1' },
      logger: { handlers: [] },
    });
    app.use(async (ctx, next) => {
      if (ctx.type === 'SOCKET') ctx.respond(); // the forbidden early finalize
      await next();
    });
    app.socket('cmd', () => ({ content: 'x' }));
    await app.start();
    const ws = new Client({
      url: `ws://127.0.0.1:${app.port}/ws`,
      reconnect: { enabled: false },
    });
    try {
      await ws.connect();
      const err = await asserts.assertRejects(() => ws.command('cmd', {})) as
        & Error
        & { code?: string };
      asserts.assertEquals(err.code, 'RAPID_RESPONSE_INVALID');
      asserts.assertStringIncludes(err.message, 'Internal server error');
    } finally {
      await ws.close();
      await app.stop();
    }
  });

  it('handle() before prepare() is a loud RAPID_CONFIG, not a null-deref', async () => {
    const app = await Application.initialize({
      name: 'hp',
      server: { enabled: false },
      logger: { handlers: [] },
    });
    const t = new HTTPTransport(app);
    asserts.assertThrows(
      () => t.handle(new Request('http://x/'), null),
      RapidError,
      'before prepare',
    );
  });
});

type AccessLine = { level: string; msg: string; meta: Record<string, unknown> };

/** Capture the app's log lines by shadowing the slogger methods. */
function captureLog(app: Application): AccessLine[] {
  const lines: AccessLine[] = [];
  for (const level of ['debug', 'info', 'warn', 'error'] as const) {
    (app.log as unknown as Record<string, unknown>)[level] = (
      msg: string,
      meta: Record<string, unknown> = {},
    ) => {
      lines.push({ level, msg, meta });
    };
  }
  return lines;
}
/** Access lines carry `ms` + `status`; disclose lines carry neither. */
const accessLines = (lines: AccessLine[]) =>
  lines.filter((l) => typeof l.meta['ms'] === 'number' && 'status' in l.meta);

describe('rapid Transport — logger.access', () => {
  const boot = (logger?: Record<string, unknown>) =>
    Application.initialize({
      name: 'access',
      server: { port: 0 },
      ...(logger === undefined ? {} : { logger }),
    });

  it('writes one line per HTTP request after finalize: info / warn / error by status, with code, matched and surface', async () => {
    const app = await boot();
    const lines = captureLog(app);
    app.get('/ok', () => ({ content: 'fine' }));
    app.get('/denied', () => {
      throw new RapidError('RAPID_ACCESS_DENIED', {});
    });
    app.get('/boom', () => {
      throw new Error('kaboom');
    });
    for (const path of ['/ok', '/denied', '/boom', '/nope']) {
      await (await app.fetch(new Request(`http://app${path}`))).text();
    }
    const logged = accessLines(lines);
    asserts.assertEquals(logged.map((l) => l.level), [
      'info',
      'warn',
      'error',
      'info',
    ]);
    asserts.assertEquals(logged[0]!.meta['status'], 200);
    asserts.assertEquals(logged[0]!.meta['action'], 'GET /ok');
    // The message alone tells the story on a plain console.
    asserts.assertMatch(logged[0]!.msg, /^GET \/ok 200 \d+ms$/);
    asserts.assertMatch(logged[3]!.msg, /^GET \/nope 404 \d+ms$/);
    asserts.assertEquals(logged[0]!.meta['type'], 'HTTP');
    asserts.assertEquals(logged[0]!.meta['matched'], true);
    asserts.assertEquals(logged[0]!.meta['surface'], 'ui');
    asserts.assert(typeof logged[0]!.meta['ms'] === 'number');
    asserts.assertEquals(logged[1]!.meta['status'], 403);
    asserts.assertEquals(logged[1]!.meta['code'], 'RAPID_ACCESS_DENIED');
    asserts.assertEquals(logged[2]!.meta['status'], 500);
    // An unmatched 404 is scanner noise — info, flagged, never a warning.
    asserts.assertEquals(logged[3]!.meta['status'], 404);
    asserts.assertEquals(logged[3]!.meta['matched'], false);
  });

  it('disclose logs a 5xx at error with its stack and a 4xx only as a debug breadcrumb — no stack, no error-level flood', async () => {
    const app = await boot();
    const lines = captureLog(app);
    app.get('/boom', () => {
      throw new Error('kaboom');
    });
    app.get('/denied', () => {
      throw new RapidError('RAPID_ACCESS_DENIED', {});
    });
    for (const path of ['/boom', '/denied', '/nope']) {
      await (await app.fetch(new Request(`http://app${path}`))).text();
    }
    const disclosed = lines.filter((l) => !accessLines([l]).length);
    asserts.assertEquals(disclosed.map((l) => l.level), [
      'error',
      'debug',
      'debug',
    ]);
    asserts.assertEquals(disclosed[0]!.meta['code'], 'RAPID_UNHANDLED');
    asserts.assert(typeof disclosed[0]!.meta['stack'] === 'string');
    asserts.assertEquals(disclosed[1]!.meta['code'], 'RAPID_ACCESS_DENIED');
    asserts.assertEquals(disclosed[1]!.meta['stack'], undefined);
    asserts.assertEquals(disclosed[2]!.meta['code'], 'RAPID_NOT_FOUND');
  });

  it('logs job firings too, with the schedule drift', async () => {
    const app = await Application.initialize({
      name: 'access-jobs',
      server: { enabled: false },
    });
    const lines = captureLog(app);
    app.job('tick', '0 6 * * *', () => ({ content: 'ran' }));
    asserts.assertEquals((await app.triggerJob('tick')).status, 200);
    const logged = accessLines(lines);
    asserts.assertEquals(logged.length, 1);
    asserts.assertEquals(logged[0]!.level, 'info');
    asserts.assertEquals(logged[0]!.meta['type'], 'JOB');
    asserts.assertEquals(logged[0]!.meta['action'], 'tick');
    asserts.assertMatch(logged[0]!.msg, /^JOB tick 200 \d+ms$/);
    asserts.assert(typeof logged[0]!.meta['drift'] === 'number');
  });

  it('skip paths (exact and prefix) suppress the line, not the request; enabled: false silences everything', async () => {
    const app = await boot({
      access: { skip: ['/healthz', '/assets/*'] },
    });
    const lines = captureLog(app);
    app.get('/healthz', () => ({ content: 'ok' }));
    app.get('/assets/app.css', () => ({ content: 'ok' }));
    app.get('/real', () => ({ content: 'ok' }));
    for (const path of ['/healthz', '/assets/app.css', '/real']) {
      const r = await app.fetch(new Request(`http://app${path}`));
      asserts.assertEquals(r.status, 200);
      await r.text();
    }
    asserts.assertEquals(
      accessLines(lines).map((l) => l.meta['action']),
      ['GET /real'],
    );
    const quiet = await boot({ access: { enabled: false } });
    const silent = captureLog(quiet);
    quiet.get('/real', () => ({ content: 'ok' }));
    await (await quiet.fetch(new Request('http://app/real'))).text();
    asserts.assertEquals(accessLines(silent), []);
  });

  it('slow lifts an info line to warn with slow: true; client fields are opt-in', async () => {
    const app = await boot({ access: { slow: 0.01, client: true } });
    const lines = captureLog(app);
    app.get('/slow', async () => {
      await new Promise((r) => setTimeout(r, 30));
      return { content: 'ok' };
    });
    app.get('/fast', () => ({ content: 'ok' }));
    const headers = { 'user-agent': 'probe/1', referer: 'https://x.example/' };
    await (await app.fetch(new Request('http://app/slow', { headers }))).text();
    await (await app.fetch(new Request('http://app/fast', { headers }))).text();
    const [slow, fast] = accessLines(lines);
    asserts.assertEquals(slow!.level, 'warn');
    asserts.assertEquals(slow!.meta['slow'], true);
    asserts.assertMatch(slow!.msg, /^GET \/slow 200 \d+ms slow$/);
    asserts.assertEquals(slow!.meta['userAgent'], 'probe/1');
    asserts.assertEquals(slow!.meta['referer'], 'https://x.example/');
    asserts.assert('remoteAddress' in slow!.meta);
    asserts.assertEquals(fast!.level, 'info');
    asserts.assertEquals(fast!.meta['slow'], undefined);
    const plain = await boot();
    const plainLines = captureLog(plain);
    plain.get('/fast', () => ({ content: 'ok' }));
    await (await plain.fetch(new Request('http://app/fast', { headers })))
      .text();
    asserts.assertEquals(
      accessLines(plainLines)[0]!.meta['userAgent'],
      undefined,
    );
  });

  it('rejects a relative skip path or a non-positive slow at boot', async () => {
    for (const access of [{ skip: ['healthz'] }, { slow: 0 }, { slow: -1 }]) {
      const err = await asserts.assertRejects(
        () => boot({ access }),
        RapidError,
      );
      asserts.assertEquals(err.code, 'RAPID_CONFIG');
    }
  });
});
