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
  it('R1: a sync onion + sync finalize returns SYNCHRONOUSLY (no promise)', () => {
    const app = new Application({ name: 't', mode: 'PRODUCTION' });
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
    const app = new Application({ name: 't', mode: 'PRODUCTION' });
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

  it('ambient correlation is active inside the onion AND finalize', () => {
    const app = new Application({ name: 't', mode: 'PRODUCTION' });
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

  it('a SYNC throw is disclosed onto ctx.response; finalize still runs', () => {
    const app = new Application({ name: 't', mode: 'PRODUCTION' });
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
    const app = new Application({
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
    const app = new Application({
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
    const app = new Application({
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
    const app = new Application({
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

  it('handle() before prepare() is a loud RAPID_CONFIG, not a null-deref', () => {
    const app = new Application({
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
