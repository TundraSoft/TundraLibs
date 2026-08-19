/**
 * @fileoverview Application lifecycle + error-classification
 * regressions from the phase-1 adversarial review (REVIEW.md): U1
 * prototype-pollution in error codes, U2 triggerJob-then-start, B3
 * lifecycle idempotency/symmetry, teardown isolation.
 * @module
 */

import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { makeTempDirSync, pathExists, remove } from '@tundralibs/compat/file';
import { Application } from './Application.ts';
import { HTTPContext, JOBContext, SOCKETContext } from './context/mod.ts';
import { Client } from '@tundralibs/rpc';
import { RapidError } from './errors/mod.ts';

describe('rapid.Application', () => {
  describe('error classification (U1)', () => {
    it('a prototype-key context.code cannot leak or reclassify', () => {
      const evil = Object.assign(new Error('SECRET db string'), {
        context: { code: 'constructor', details: { secret: 'x' } },
      });
      const err = RapidError.from(evil);
      asserts.assertEquals(err.code, 'RAPID_UNHANDLED');
      asserts.assertEquals(err.status, 500);
      asserts.assertEquals(err.payload('PRODUCTION'), {
        code: 'RAPID_UNHANDLED',
        message: 'Internal server error',
      });
    });

    it('a REAL registered code still classifies normally', () => {
      const thrown = new RapidError('RAPID_VALIDATION_FAILED', {
        details: { field: 'email' },
      });
      const err = RapidError.from(thrown);
      asserts.assertEquals(err.code, 'RAPID_VALIDATION_FAILED');
      asserts.assertEquals(err.status, 400);
    });
  });

  describe('lifecycle (U2/B3)', () => {
    it('triggerJob() before start() cannot brick the server', async () => {
      const app = new Application({ name: 'a', server: { port: 0 } });
      app.job('j', '0 6 * * *', () => ({ content: 'ran' }));
      app.get('/', () => ({ content: 'hi' }));
      const outcome = await app.triggerJob('j'); // throwaway transport
      asserts.assertEquals(outcome.status, 200);
      asserts.assertEquals(app.running, false); // no lifecycle pollution
      await app.start();
      asserts.assert(app.address !== null); // the server actually boots
      await app.stop();
    });

    it('start/stop are idempotent and event-symmetric, even bootless', async () => {
      const app = new Application({ name: 'b', server: { enabled: false } });
      let starts = 0;
      let stops = 0;
      app.on('start', () => starts++);
      app.on('stop', () => stops++);
      await app.start();
      await app.start(); // no re-boot, no second event
      asserts.assertEquals(app.running, true);
      asserts.assertEquals(starts, 1);
      await app.stop();
      await app.stop();
      asserts.assertEquals(stops, 1);
      asserts.assertEquals(app.running, false);
    });

    it('restart works after a clean stop', async () => {
      const app = new Application({ name: 'c', server: { port: 0 } });
      app.get('/', () => ({ content: 'x' }));
      await app.start();
      const first = app.port;
      await app.stop();
      asserts.assertEquals(app.running, false);
      await app.start();
      asserts.assert(app.port !== null); // listening again
      void first;
      asserts.assertEquals(app.running, true);
      await app.stop();
    });
  });

  describe("job handlers see the app's typed state, like HTTP/SOCKET (B11 gap)", () => {
    it('ctx.state in a job handler is the declared S, not the untyped base bag', async () => {
      const app = new Application<{ counter: number }>(
        { name: 'typed-jobs', server: { enabled: false } },
        { counter: 0 },
      );
      let seen = -1;
      app.job('j', '0 6 * * *', (ctx) => {
        // Compiles only because ctx: JOBContext<{counter:number}> — if
        // RapidJOBHandler ever regresses to its old non-generic form,
        // ctx.state.counter degrades to `unknown` and this line stops
        // type-checking (no runtime signal would catch that regression).
        const counter: number = ctx.state.counter;
        seen = counter;
        return { content: 'ran' };
      });
      await app.triggerJob('j');
      asserts.assertEquals(seen, 0);
    });
  });

  describe('upload temp dir ownership (resource leak)', () => {
    it('a caller-supplied uploads.path is never removed by stop()', async () => {
      const own = makeTempDirSync({ prefix: 'rapid-m-owned-' });
      const app = new Application({
        name: 'owned-path',
        server: { enabled: false },
        uploads: { path: own },
      });
      await app.stop(); // never started — still must not touch a path we don't own
      asserts.assertEquals(await pathExists(own), true);
      await remove(own).catch(() => {});
    });

    it('an auto-created uploads dir is removed by stop() even when never started', async () => {
      const app = new Application({
        name: 'auto-path',
        server: { enabled: false },
      });
      const auto = app.option('uploads')!.path!;
      asserts.assertEquals(await pathExists(auto), true);
      await app.stop(); // no start() call — construction alone owns the dir
      asserts.assertEquals(await pathExists(auto), false);
    });

    // A construction-failure-specific case (bad `name` etc.) is covered
    // by code structure, not a filesystem-scan test: the constructor
    // wraps exactly the `_setOptions`/`__validate()` span that can throw
    // in a try/catch that removeSync()s `ownedUploadPath` before
    // rethrowing (see Application.ts). A test proving "no stray dir
    // survives" would need to scan the shared OS temp root, which is
    // racy against every OTHER concurrently-running test file that also
    // auto-creates a `rapid-*` dir — not worth trading determinism for.
  });

  describe('route grammar (radrouter-native)', () => {
    it('a malformed path (express-style :id) fails LOUDLY at start()', async () => {
      // Grammar is radrouter's to enforce — its MalformedPathError
      // names the segment and every legal form; rapid wraps it as
      // RAPID_CONFIG at boot.
      const app = new Application({ name: 'rg', server: { port: 0 } });
      app.get('/users/:id', () => ({ content: 'x' }));
      const err = await asserts.assertRejects(
        () => app.start(),
        RapidError,
        'Malformed path segment',
      );
      asserts.assertEquals(err.code, 'RAPID_CONFIG');
      asserts.assertEquals(app.running, false); // boot failure tore down
    });
  });

  describe('stateMode SHARE vs. a stateKey-writing middleware', () => {
    it('fails LOUDLY at start() rather than corrupting state under concurrency', async () => {
      const { responseTimer } = await import('./middlewares/mod.ts');
      const app = new Application({
        name: 'share-conflict',
        server: { port: 0 },
        stateMode: 'SHARE',
      });
      app.use(responseTimer({ stateKey: 'tookMs' }));
      app.get('/x', () => ({ content: 'ok' }));
      const err = await asserts.assertRejects(
        () => app.start(),
        RapidError,
        "stateMode: 'SHARE'",
      );
      asserts.assertEquals(err.code, 'RAPID_CONFIG');
      asserts.assertEquals(app.running, false);
    });

    it('requestId({stateKey}) is caught the same way', async () => {
      const { requestId } = await import('./middlewares/mod.ts');
      const app = new Application({
        name: 'share-conflict-2',
        server: { port: 0 },
        stateMode: 'SHARE',
      });
      app.use(requestId({ stateKey: 'rid' }));
      app.get('/x', () => ({ content: 'ok' }));
      await asserts.assertRejects(() => app.start(), RapidError);
    });

    it('a stateKey-writing middleware boots fine under CLONE/PROTOTYPE (the default)', async () => {
      const { responseTimer } = await import('./middlewares/mod.ts');
      const app = new Application({ name: 'share-ok', server: { port: 0 } });
      app.use(responseTimer({ stateKey: 'tookMs' }));
      app.get('/x', () => ({ content: 'ok' }));
      await app.start();
      try {
        asserts.assertEquals(app.running, true);
      } finally {
        await app.stop();
      }
    });

    it('SHARE with NO stateKey-writing middleware boots fine', async () => {
      const app = new Application({
        name: 'share-no-conflict',
        server: { port: 0 },
        stateMode: 'SHARE',
      });
      app.get('/x', () => ({ content: 'ok' }));
      await app.start();
      try {
        asserts.assertEquals(app.running, true);
      } finally {
        await app.stop();
      }
    });

    it('the boot guard SURVIVES onlyHTTP/guardHTTP wrapping, not just the bare middleware', async () => {
      // scope.ts wraps a middleware in a brand-new closure — the guard
      // must carry the MIDDLEWARE_STATE_KEY stamp across that wrap, or
      // this documented, first-party composition
      // (`use(onlyHTTP(responseTimer({stateKey})))`) silently defeats
      // the boot check M9 exists to provide.
      const { onlyHTTP, guardHTTP, responseTimer } = await import(
        './middlewares/mod.ts'
      );
      const shareApp = () =>
        new Application({
          name: 'share-wrapped',
          server: { port: 0 },
          stateMode: 'SHARE',
        });

      const wrappedByOnly = shareApp();
      wrappedByOnly.use(onlyHTTP(responseTimer({ stateKey: 'tookMs' })));
      wrappedByOnly.get('/x', () => ({ content: 'ok' }));
      await asserts.assertRejects(() => wrappedByOnly.start(), RapidError);

      const wrappedByGuard = shareApp();
      wrappedByGuard.use(guardHTTP(responseTimer({ stateKey: 'tookMs' })));
      wrappedByGuard.get('/x', () => ({ content: 'ok' }));
      await asserts.assertRejects(() => wrappedByGuard.start(), RapidError);
    });
  });

  describe('HTTP request path (review security set)', () => {
    const spin = async (
      configure: (app: Application) => void,
      trustProxy: boolean | number = false,
    ) => {
      const app = new Application({
        name: 'h',
        server: { port: 0, trustProxy },
      });
      configure(app);
      await app.start();
      return {
        app,
        base: `http://localhost:${app.port}`,
        [Symbol.asyncDispose]: () => app.stop(),
      };
    };

    it('U5: forged x-forwarded-for is ignored by default (trustProxy 0)', async () => {
      const s = await spin((app) =>
        app.get('/ip', (ctx) => ({ content: { ip: ctx.remoteAddress } }))
      );
      try {
        const r = await fetch(`${s.base}/ip`, {
          headers: { 'x-forwarded-for': '8.8.8.8' },
        });
        asserts.assertEquals((await r.json()).ip, ''); // loopback socket, header untrusted
      } finally {
        await s.app.stop();
      }
    });

    it('U5: trustProxy=1 takes the rightmost hop, not the forgeable leftmost', async () => {
      const s = await spin(
        (app) =>
          app.get('/ip', (ctx) => ({ content: { ip: ctx.remoteAddress } })),
        1,
      );
      try {
        const r = await fetch(`${s.base}/ip`, {
          headers: { 'x-forwarded-for': '1.2.3.4, 8.8.8.8' },
        });
        asserts.assertEquals((await r.json()).ip, '8.8.8.8');
      } finally {
        await s.app.stop();
      }
    });

    it('U6: a chunked body (no content-length) is byte-capped', async () => {
      // The bypass the header-only gate missed: no content-length, so
      // the cap must count bytes actually read. Driven at the context
      // level — a lying/absent content-length is a malformed frame the
      // network clients handle inconsistently across runtimes.
      const app = new Application({ name: 'u6', server: { enabled: false } });
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          const chunk = new Uint8Array(256 * 1024); // 256 KB
          for (let i = 0; i < 8; i++) controller.enqueue(chunk); // 2 MB
          controller.close();
        },
      });
      const request = new Request('http://x/echo', {
        method: 'POST',
        headers: { 'content-type': 'text/plain' }, // NO content-length
        body,
        // deno-lint-ignore no-explicit-any
        duplex: 'half',
      } as any);
      const ctx = new HTTPContext(app, { request, remoteAddress: '' });
      await asserts.assertRejects(
        () => ctx.payload,
        RapidError,
        'Payload too large',
      );
    });

    it('B1: malformed JSON is a 400, not a 500', async () => {
      const s = await spin((app) =>
        app.post('/echo', async (ctx) => ({
          content: { body: await ctx.payload },
        }))
      );
      try {
        const r = await fetch(`${s.base}/echo`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{bad',
        });
        asserts.assertEquals(r.status, 400);
      } finally {
        await s.app.stop();
      }
    });

    it('B2: a body-only override preserves an already-set status', async () => {
      const s = await spin((app) =>
        app.get('/k', (ctx) => {
          ctx.response = { status: 404, content: { a: 1 } };
          ctx.response = { content: { a: 2 } };
        })
      );
      try {
        const r = await fetch(`${s.base}/k`);
        asserts.assertEquals(r.status, 404);
        asserts.assertEquals((await r.json()).a, 2);
      } finally {
        await s.app.stop();
      }
    });

    it('B12: an empty handler yields 204, not a 501 string', async () => {
      const s = await spin((app) => app.get('/empty', () => {}));
      try {
        const r = await fetch(`${s.base}/empty`);
        asserts.assertEquals(r.status, 204);
        asserts.assertEquals(await r.text(), '');
      } finally {
        await s.app.stop();
      }
    });

    it('B16: an error response carries requestId in the body and header', async () => {
      const s = await spin((app) =>
        app.get('/boom', () => {
          throw new Error('kaboom');
        })
      );
      try {
        const r = await fetch(`${s.base}/boom`);
        asserts.assertEquals(r.status, 500);
        const headerId = r.headers.get('x-request-id');
        const bodyId = (await r.json()).requestId;
        asserts.assert(headerId !== null);
        asserts.assertEquals(headerId, bodyId);
      } finally {
        await s.app.stop();
      }
    });
  });

  describe('context contract: body-only override preserves status', () => {
    it('holds on JOB outcomes too (not just HTTP/SOCKET)', async () => {
      const app = new Application({ name: 'jc', server: { enabled: false } });
      app.job('j', '0 6 * * *', (ctx) => {
        ctx.response = { status: 500, content: { failed: true } };
        ctx.response = { content: { failed: true, enriched: true } }; // body-only
      });
      const outcome = await app.triggerJob('j');
      asserts.assertEquals(outcome.status, 500); // NOT laundered to 200
    });
  });

  describe('websocket commands (rpc mounted on the HTTP listener)', () => {
    it('registration validates: duplicates and empty commands are loud', () => {
      const app = new Application({ name: 'w', server: { enabled: false } });
      app.socket('a', () => {});
      asserts.assertThrows(() => app.socket('a', () => {}), RapidError);
      asserts.assertThrows(() => app.socket('  ', () => {}), RapidError);
    });

    it('dispatches commands through the shared cycle, same port as HTTP', async () => {
      const app = new Application(
        { name: 'w2', server: { port: 0 }, stateMode: 'SHARE' },
        { visits: 7 },
      );
      app.get('/health', () => ({ content: 'ok' }));
      app.socket('echo', (ctx) => ({
        content: { echo: ctx.payload, conn: ctx.connectionId },
      }));
      app.socket('visits', (ctx) => ({
        content: { visits: (ctx.state as { visits: number }).visits },
      }));
      app.socket('deny', () => {
        throw new RapidError('RAPID_ACCESS_DENIED', {
          details: { hint: 'no' },
        });
      });
      await app.start();
      const ws = new Client({
        url: `ws://localhost:${app.port}/ws`,
        reconnect: { enabled: false },
      });
      try {
        await ws.connect();
        // HTTP still serves on the same port:
        const http = await fetch(`http://localhost:${app.port}/health`);
        asserts.assertEquals(await http.text(), 'ok');
        // command round-trip + per-connection identity:
        const echoed = await ws.command<{ echo: unknown; conn: string }>(
          'echo',
          { n: 1 },
        );
        asserts.assertEquals(echoed.echo, { n: 1 });
        asserts.assert(echoed.conn.length > 0);
        // typed shared state, same bag as HTTP:
        const v = await ws.command<{ visits: number }>('visits');
        asserts.assertEquals(v.visits, 7);
        // errors ride rpc's envelope with the disclosure code:
        const err = await asserts.assertRejects(() => ws.command('deny'));
        asserts.assert(String(err).includes('Access denied'));
        // unknown command is rpc's own loud error:
        await asserts.assertRejects(() => ws.command('nope'));
      } finally {
        await ws.close();
        await app.stop();
      }
    });
  });

  describe('ctx.args — one shape on every transport (Phase B)', () => {
    it('HTTP: route params + parsed query + dual-source paging', async () => {
      const app = new Application({ name: 'args', server: { port: 0 } });
      app.get('/items/:id:', (ctx) => ({
        content: { args: ctx.args, action: ctx.action },
      }));
      await app.start();
      try {
        const r = await fetch(
          `http://localhost:${app.port}/items/42` +
            `?status=eq:open&sort=name:desc&page=7&limit=5`,
          { headers: { 'x-page-number': '2', 'x-page-size': '50' } },
        );
        const body = await r.json();
        asserts.assertEquals(body.action, 'GET /items/:id:');
        asserts.assertEquals(body.args.params, { id: '42' });
        asserts.assertEquals(body.args.query.filters, {
          status: { $eq: 'open' },
        });
        asserts.assertEquals(body.args.query.sorting, [
          { field: 'name', direction: 'DESC' },
        ]);
        // Query params override the paging headers, per key:
        asserts.assertEquals(body.args.paging, { page: 7, size: 5 });
      } finally {
        await app.stop();
      }
    });

    it('HTTP: a query over the structural caps is a 400, lazily', async () => {
      const app = new Application({
        name: 'caps',
        server: { port: 0, query: { maxFilters: 1 } },
      });
      app.get('/lazy', () => ({ content: 'never reads args' }));
      app.get('/eager', (ctx) => ({ content: { n: ctx.args.query } }));
      await app.start();
      try {
        // A route that never reads args never pays for the bad query:
        const lazy = await fetch(`http://localhost:${app.port}/lazy?a=1&b=2`);
        asserts.assertEquals(lazy.status, 200);
        await lazy.text();
        const eager = await fetch(
          `http://localhost:${app.port}/eager?a=1&b=2`,
        );
        asserts.assertEquals(eager.status, 400);
        asserts.assertEquals((await eager.json()).code, 'RAPID_QUERY_INVALID');
      } finally {
        await app.stop();
      }
    });

    it('SOCKET: params = frame payload; connection is envelope', async () => {
      const app = new Application({ name: 'sargs', server: { port: 0 } });
      app.socket('inspect', (ctx) => ({
        content: {
          action: ctx.action,
          params: ctx.args.params,
          paging: ctx.args.paging,
          upgradeQuery: ctx.connection.query,
          connId: ctx.connection.id,
        },
      }));
      app.socket('any', () => ({ content: 'ok' }));
      await app.start();
      const ws = new Client({
        url: `ws://localhost:${app.port}/ws?token=abc`,
        reconnect: { enabled: false },
      });
      try {
        await ws.connect();
        const r = await ws.command<{
          action: string;
          params: Record<string, unknown>;
          paging: { page: number; size: number };
          upgradeQuery: Record<string, string>;
          connId: string;
        }>('inspect', { q: 'x', page: 3, limit: 5 });
        asserts.assertEquals(r.action, 'inspect');
        // Frame payload IS params — paging keys stay visible in it:
        asserts.assertEquals(r.params, { q: 'x', page: 3, limit: 5 });
        // ...and paging honours them ("may honor", per the design):
        asserts.assertEquals(r.paging, { page: 3, size: 5 });
        // Connection scope came from the UPGRADE, not the frame:
        asserts.assertEquals(r.upgradeQuery, { token: 'abc' });
        asserts.assert(r.connId.length > 0);
        // A commandless payload resolves to empty params (no error):
        const bare = await ws.command<string>('any');
        asserts.assertEquals(bare, 'ok');
      } finally {
        await ws.close();
        await app.stop();
      }
    });

    it('SOCKET: a non-object payload is rejected for EVERY command', async () => {
      const app = new Application({ name: 'sval', server: { port: 0 } });
      // This handler never reads args — the contract must hold anyway.
      app.socket('blind', () => ({ content: 'ran' }));
      await app.start();
      const ws = new Client({
        url: `ws://localhost:${app.port}/ws`,
        reconnect: { enabled: false },
      });
      try {
        await ws.connect();
        const err = await asserts.assertRejects(() =>
          ws.command(
            'blind',
            'a plain string' as unknown as Record<
              string,
              unknown
            >,
          )
        );
        // 400-class codes disclose their message (client errors):
        asserts.assert(String(err).includes('RAPID_VALIDATION_FAILED'));
        asserts.assert(String(err).includes('must be an object'));
        // The connection survives; a valid frame still works:
        asserts.assertEquals(await ws.command<string>('blind', {}), 'ran');
      } finally {
        await ws.close();
        await app.stop();
      }
    });

    it('JOB: registration defaults ⊕ trigger overrides', async () => {
      const app = new Application({
        name: 'jargs',
        server: { enabled: false },
      });
      app.job('sync', '0 6 * * *', (ctx) => ({
        content: {
          action: ctx.action,
          params: ctx.args.params,
          paging: ctx.args.paging,
          payload: ctx.payload === undefined ? 'undefined' : 'set',
        },
      }), { args: { source: 'cron', keep: 1 } });
      // Overrides merge OVER defaults, per key:
      const t1 = await app.triggerJob('sync', { source: 'manual' });
      asserts.assertEquals(t1.status, 200);
      const c1 = t1.content as Record<string, unknown>;
      asserts.assertEquals(c1['action'], 'sync');
      asserts.assertEquals(c1['params'], { source: 'manual', keep: 1 });
      asserts.assertEquals(c1['paging'], { page: 1, size: 10 });
      asserts.assertEquals(c1['payload'], 'undefined');
      // No overrides → the registration defaults verbatim:
      const t2 = await app.triggerJob('sync');
      asserts.assertEquals(
        (t2.content as Record<string, unknown>)['params'],
        { source: 'cron', keep: 1 },
      );
    });
  });

  describe('R2 LOW sweep: context immutability + status truth', () => {
    it('L4: args.params is FROZEN, so the Readonly type is real', () => {
      const app = new Application({ name: 'l4', server: { enabled: false } });
      const ctx = new SOCKETContext(app, {
        connection: { id: 'c', query: {}, headers: new Headers() },
        command: 'x',
        payload: { a: 1 },
      });
      const params = ctx.args.params as Record<string, unknown>;
      asserts.assertThrows(() => {
        params['a'] = 'mutated';
      }, TypeError);
      asserts.assertEquals(ctx.args.params['a'], 1);
    });

    it('L10: exotic objects are rejected as socket params', () => {
      const app = new Application({ name: 'l10', server: { enabled: false } });
      for (const payload of [new Date(), new Map(), [1, 2]]) {
        const ctx = new SOCKETContext(app, {
          connection: { id: 'c', query: {}, headers: new Headers() },
          command: 'x',
          payload,
        });
        asserts.assertThrows(
          () => ctx.args,
          RapidError,
          'must be an object',
        );
      }
      // A null-prototype bag IS a plain object and is accepted.
      const ok = new SOCKETContext(app, {
        connection: { id: 'c', query: {}, headers: new Headers() },
        command: 'x',
        payload: Object.assign(Object.create(null), { a: 1 }),
      });
      asserts.assertEquals(ok.args.params['a'], 1);
    });

    it('L7: the response getter hands out a headers COPY', () => {
      const app = new Application({ name: 'l7', server: { enabled: false } });
      const ctx = new HTTPContext(app, {
        request: new Request('http://x/'),
        remoteAddress: '',
      });
      ctx.response = { content: 'x' };
      ctx.response!.headers instanceof Headers &&
        (ctx.response!.headers as Headers).set('x-sneaky', 'yes');
      asserts.assertEquals(ctx.responseHeaders.get('x-sneaky'), null);
    });

    it('L5: ctx.status is the wire truth even when content is null', () => {
      const app = new Application({ name: 'l5', server: { enabled: false } });
      const ctx = new HTTPContext(app, {
        request: new Request('http://x/'),
        remoteAddress: '',
      });
      ctx.response = { status: 401, content: null as unknown as string };
      // `response` reads null (no content) — the old logger source...
      asserts.assertEquals(ctx.response, null);
      // ...while `status` agrees with what the transport will send.
      asserts.assertEquals(ctx.status, 401);
    });
  });

  describe('R2-M7: upload cleanup vs an in-flight parse', () => {
    it('cleanup() awaits a started-but-unawaited parse, so no temp file is orphaned', async () => {
      const uploads = makeTempDirSync({ prefix: 'rapid-m7-' });
      const app = new Application({
        name: 'm7',
        server: { enabled: false },
        uploads: { path: uploads, allowedExtensions: ['.txt'], maxSize: 1024 },
      });
      const form = new FormData();
      form.append(
        'doc',
        new File(['hello'], 'note.txt', { type: 'text/plain' }),
      );
      const ctx = new HTTPContext(app, {
        request: new Request('http://x/upload', {
          method: 'POST',
          body: form,
        }),
        remoteAddress: '',
      });
      // Kick the parse off WITHOUT awaiting it — the handler pattern
      // that used to strand files: cleanup ran while _fileUploads was
      // still empty, then the parse wrote a file nobody tracked.
      const parse = ctx.payload;
      await ctx.cleanup();
      await parse;
      // Every file the parse wrote is accounted for and gone.
      asserts.assert(ctx.files.length > 0, 'the parse did write a file');
      for (const file of ctx.files) {
        asserts.assertEquals(await pathExists(file), false);
      }
      await remove(uploads).catch(() => {});
    });
  });

  describe('ctx.payload — the reserved lazy body channel (Phase B)', () => {
    const request = (body: string, type = 'application/json') =>
      new Request('http://x/echo', {
        method: 'POST',
        headers: { 'content-type': type },
        body,
      });

    it('HTTP: parse-once — every access shares ONE parse', async () => {
      const app = new Application({ name: 'p1', server: { enabled: false } });
      const ctx = new HTTPContext(app, {
        request: request('{"a":1}'),
        remoteAddress: '',
      });
      // The getter returns the SAME promise (not merely equal values) —
      // concurrent first readers cannot double-read the one-shot stream.
      asserts.assertStrictEquals(ctx.payload, ctx.payload);
      const [first, second] = await Promise.all([ctx.payload, ctx.payload]);
      asserts.assertStrictEquals(first, second);
      asserts.assertEquals(first, { a: 1 });
    });

    it('HTTP: a parse FAILURE replays — never a second stream read', async () => {
      const app = new Application({ name: 'p2', server: { enabled: false } });
      const ctx = new HTTPContext(app, {
        request: request('{bad json'),
        remoteAddress: '',
      });
      await asserts.assertRejects(
        () => ctx.payload,
        RapidError,
        'not valid JSON',
      );
      // The SAME error again — not a consumed-stream crash:
      await asserts.assertRejects(
        () => ctx.payload,
        RapidError,
        'not valid JSON',
      );
    });

    it('HTTP: files is a defensive copy, empty before any parse', () => {
      const app = new Application({ name: 'p3', server: { enabled: false } });
      const ctx = new HTTPContext(app, {
        request: request('{}'),
        remoteAddress: '',
      });
      const files = ctx.files as string[];
      asserts.assertEquals(files, []);
      files.push('/tmp/evil');
      asserts.assertEquals(ctx.files, []); // the copy absorbed the write
    });

    it('await ctx.payload is uniform across transports', async () => {
      // SOCKET: synchronous frame value — await passes it through.
      // (Round-tripped in the websocket suite; here the JOB base case.)
      const app = new Application({ name: 'p4', server: { enabled: false } });
      app.job('j', '0 6 * * *', async (ctx) => ({
        content: { payload: (await ctx.payload) === undefined },
      }));
      const outcome = await app.triggerJob('j');
      asserts.assertEquals(
        (outcome.content as Record<string, unknown>)['payload'],
        true,
      );
    });
  });

  describe('universal middleware engine (Phase C)', () => {
    it('ONE use() registration runs on HTTP, SOCKET, and JOB', async () => {
      const app = new Application({ name: 'um', server: { port: 0 } });
      const seen: string[] = [];
      app.use(async (ctx, next) => {
        seen.push(`${ctx.type}:${ctx.action}`);
        await next();
      });
      app.get('/u', () => ({ content: 'ok' }));
      app.socket('cmd', () => ({ content: 'ok' }));
      app.job('j', '0 6 * * *', () => ({ content: 'ok' }));
      await app.start();
      const ws = new Client({
        url: `ws://localhost:${app.port}/ws`,
        reconnect: { enabled: false },
      });
      try {
        await (await fetch(`http://localhost:${app.port}/u`)).text();
        await ws.connect();
        await ws.command('cmd', {});
        await app.triggerJob('j');
        asserts.assertEquals(seen, ['HTTP:GET /u', 'SOCKET:cmd', 'JOB:j']);
      } finally {
        await ws.close();
        await app.stop();
      }
    });

    it('a middleware short-circuiting a JOB is a loud, distinct outcome', async () => {
      const app = new Application({ name: 'ums', server: { enabled: false } });
      const warns: Record<string, unknown>[] = [];
      (app.log as unknown as Record<string, unknown>)['warn'] = (
        msg: string,
        meta: Record<string, unknown> = {},
      ) => {
        warns.push({ msg, ...meta });
      };
      let handlerCalls = 0;
      app.use(async (ctx, next) => {
        if (ctx.type === 'JOB') {
          ctx.response = { status: 200, content: 'held back' };
          return; // never calls next()
        }
        await next();
      });
      app.job('nightly', '0 6 * * *', () => {
        handlerCalls++;
        return { content: 'ran' };
      });
      const outcome = await app.triggerJob('nightly');
      asserts.assertEquals(handlerCalls, 0);
      asserts.assertEquals(outcome.handlerRan, false);
      asserts.assertEquals(outcome.content, 'held back');
      // WARN-level and named — never a debug "finished".
      asserts.assertEquals(warns.length, 1);
      asserts.assertEquals(warns[0]!['msg'], 'job skipped by middleware');
      asserts.assertEquals(warns[0]!['job'], 'nightly');
    });

    it('a 3xx status is rejected AT SET TIME off-HTTP', () => {
      const app = new Application({ name: 'um3', server: { enabled: false } });
      const job = new JOBContext(app, {
        job: 'j',
        tick: { scheduledAt: new Date(), firedAt: new Date(), count: 1 },
      });
      asserts.assertThrows(
        () => {
          job.response = { status: 301, content: 'moved' };
        },
        RapidError,
        'no meaning on a background job',
      );
      const socket = new SOCKETContext(app, {
        connection: { id: 'c', query: {}, headers: new Headers() },
        command: 'x',
        payload: {},
      });
      asserts.assertThrows(
        () => {
          socket.response = { status: 302, content: 'moved' };
        },
        RapidError,
        'no meaning on a socket frame',
      );
      // Sanity: non-3xx still flows.
      socket.response = { status: 201, content: 'fine' };
      asserts.assertEquals(socket.response?.status, 201);
    });

    it('per-COMMAND socket chains compose after the universal chain', async () => {
      const app = new Application({ name: 'umc', server: { port: 0 } });
      const order: string[] = [];
      app.use(async (_ctx, next) => {
        order.push('universal');
        await next();
      });
      app.socket('guarded', async (ctx, next) => {
        order.push('command');
        if (ctx.args.params['deny'] === true) {
          throw new RapidError('RAPID_ACCESS_DENIED', {});
        }
        await next();
      }, () => {
        order.push('handler');
        return { content: 'ok' };
      });
      // Registration still validates: a chain with no handler is loud.
      asserts.assertThrows(
        () => (app.socket as unknown as (c: string) => void).call(app, 'bare'),
        RapidError,
        'needs a handler',
      );
      await app.start();
      const ws = new Client({
        url: `ws://localhost:${app.port}/ws`,
        reconnect: { enabled: false },
      });
      try {
        await ws.connect();
        asserts.assertEquals(await ws.command('guarded', {}), 'ok');
        asserts.assertEquals(order, ['universal', 'command', 'handler']);
        // The command chain rejecting rides the rpc error envelope:
        const err = await asserts.assertRejects(() =>
          ws.command('guarded', { deny: true })
        );
        asserts.assert(String(err).includes('RAPID_ACCESS_DENIED'));
      } finally {
        await ws.close();
        await app.stop();
      }
    });

    it('R2-M2: a handler 4xx reaches a socket client with body AND code', async () => {
      const app = new Application({ name: 'sm2', server: { port: 0 } });
      app.socket('create', (ctx) => {
        // A handler-authored error: not a framework disclosure payload.
        ctx.response = { status: 422, content: { fields: { email: 'taken' } } };
      });
      app.post('/create', (ctx) => {
        ctx.response = { status: 422, content: { fields: { email: 'taken' } } };
      });
      await app.start();
      const ws = new Client({
        url: `ws://localhost:${app.port}/ws`,
        reconnect: { enabled: false },
      });
      try {
        await ws.connect();
        const err = await asserts.assertRejects(
          () => ws.command('create'),
        ) as Error & { code?: string; data?: { fields?: unknown } };
        // Status-derived code, NOT laundered to RAPID_UNHANDLED:
        asserts.assertEquals(err.code, 'RAPID_VALIDATION_FAILED');
        // ...and the body survives the socket envelope:
        asserts.assertEquals(err.data?.fields, { email: 'taken' });
        // The SAME handler over HTTP says the same thing:
        const http = await fetch(`http://localhost:${app.port}/create`, {
          method: 'POST',
        });
        asserts.assertEquals(http.status, 422);
        asserts.assertEquals((await http.json()).fields, { email: 'taken' });
      } finally {
        await ws.close();
        await app.stop();
      }
    });

    it('an early respond() surfaces as a uniform 500, never silence', async () => {
      // HTTP: the finalize guard turns it into a disclosure 500.
      const app = new Application({ name: 'umr', server: { port: 0 } });
      app.use(async (ctx, next) => {
        if (ctx.type === 'HTTP') ctx.respond(); // the forbidden move
        await next();
      });
      app.get('/r', () => ({ content: 'never' }));
      app.job('j', '0 6 * * *', () => ({ content: 'never' }));
      await app.start();
      try {
        const r = await fetch(`http://localhost:${app.port}/r`);
        asserts.assertEquals(r.status, 500);
        await r.text();
        // JOB parity: a mid-chain respond() yields a 500 OUTCOME (no
        // path-dependent rejection from triggerJob).
        const appJ = new Application({
          name: 'umrj',
          server: { enabled: false },
        });
        appJ.use(async (ctx, next) => {
          ctx.respond();
          await next();
        });
        appJ.job('j', '0 6 * * *', () => ({ content: 'never' }));
        const outcome = await appJ.triggerJob('j');
        asserts.assertEquals(outcome.status, 500);
        asserts.assertEquals(
          (outcome.content as Record<string, unknown>)['code'],
          'RAPID_RESPONSE_INVALID',
        );
      } finally {
        await app.stop();
      }
    });

    it('route-scoped middleware still compose AFTER the universal chain', async () => {
      const app = new Application({ name: 'umo', server: { port: 0 } });
      const order: string[] = [];
      app.use(async (_ctx, next) => {
        order.push('universal');
        await next();
      });
      app.get('/o', async (ctx, next) => {
        order.push('route');
        await next();
      }, () => ({ content: 'ok' }));
      await app.start();
      try {
        await (await fetch(`http://localhost:${app.port}/o`)).text();
        asserts.assertEquals(order, ['universal', 'route']);
      } finally {
        await app.stop();
      }
    });
  });
});
