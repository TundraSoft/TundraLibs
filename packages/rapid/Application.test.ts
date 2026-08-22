/**
 * @fileoverview The Application test suite — ALL Application-level behavior in
 * one file, segregated by `describe` section (testing convention: one test
 * file per source module; Application.ts is one module). Sections below were
 * formerly separate `Application.*.test.ts` files; each satellite's body is
 * wrapped in a block so its section-local helpers (several files each define a
 * `make`/`class`/`type` of their own) stay block-scoped and cannot collide.
 * @module
 */

import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import {
  makeTempDir,
  makeTempDirSync,
  pathExists,
  remove,
  removeDir,
  writeTextFile,
} from '@tundralibs/compat/file';
import { Client } from '@tundralibs/rpc';
import { Doctor, inject, label } from '@tundralibs/doctor';
import { sequenceID, ulid } from '@tundralibs/id';
import { Application } from './Application.ts';
import { HTTPContext, JOBContext, SOCKETContext } from './context/mod.ts';
import type { SOCKETConnection } from './context/mod.ts';
import { RapidError } from './errors/mod.ts';
import { responseTimer } from './middlewares/mod.ts';
import { session as sessionMw } from './middlewares/session.ts';
import type { RapidSession } from './middlewares/session.ts';
import {
  auth,
  connection,
  cookie,
  GET,
  header,
  JOB,
  Module,
  On,
  paging,
  param,
  payload,
  query,
  session,
  SOCKET,
} from './decorators/mod.ts';
import { event, type EventContext, RapidModule } from './modules/mod.ts';
import type {
  RapidClusterSnapshot,
  RapidContextResponse,
} from './types/mod.ts';

// ==========================================================================
// Core
// ==========================================================================

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
      const app = await Application.initialize({
        name: 'a',
        server: { port: 0 },
      });
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
      const app = await Application.initialize({
        name: 'b',
        server: { enabled: false },
      });
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
      const app = await Application.initialize({
        name: 'c',
        server: { port: 0 },
      });
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
      const app = await Application.initialize<{ counter: number }>(
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
      const app = await Application.initialize({
        name: 'owned-path',
        server: { enabled: false },
        uploads: { path: own },
      });
      await app.stop(); // never started — still must not touch a path we don't own
      asserts.assertEquals(await pathExists(own), true);
      await remove(own).catch(() => {});
    });

    it('an auto-created uploads dir is removed by stop() even when never started', async () => {
      const app = await Application.initialize({
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
      const app = await Application.initialize({
        name: 'rg',
        server: { port: 0 },
      });
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
      const app = await Application.initialize({
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
      const app = await Application.initialize({
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
      const app = await Application.initialize({
        name: 'share-ok',
        server: { port: 0 },
      });
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
      const app = await Application.initialize({
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
        Application.initialize({
          name: 'share-wrapped',
          server: { port: 0 },
          stateMode: 'SHARE',
        });

      const wrappedByOnly = await shareApp();
      wrappedByOnly.use(onlyHTTP(responseTimer({ stateKey: 'tookMs' })));
      wrappedByOnly.get('/x', () => ({ content: 'ok' }));
      await asserts.assertRejects(() => wrappedByOnly.start(), RapidError);

      const wrappedByGuard = await shareApp();
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
      const app = await Application.initialize({
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
      const app = await Application.initialize({
        name: 'u6',
        server: { enabled: false },
      });
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
      const app = await Application.initialize({
        name: 'jc',
        server: { enabled: false },
      });
      app.job('j', '0 6 * * *', (ctx) => {
        ctx.response = { status: 500, content: { failed: true } };
        ctx.response = { content: { failed: true, enriched: true } }; // body-only
      });
      const outcome = await app.triggerJob('j');
      asserts.assertEquals(outcome.status, 500); // NOT laundered to 200
    });
  });

  describe('route versioning (a dimension separate from path)', () => {
    it('the same path resolves a DIFFERENT handler per x-api-version', async () => {
      const app = await Application.initialize({
        name: 'ver',
        server: { port: 0 },
      });
      app.route('GET', '/x', { version: 'v1' }, () => ({ content: 'v1' }));
      app.route('GET', '/x', { version: 'v2' }, () => ({ content: 'v2' }));
      await app.start();
      try {
        const v1 = await fetch(`http://localhost:${app.port}/x`, {
          headers: { 'x-api-version': 'v1' },
        });
        asserts.assertEquals(await v1.text(), 'v1');
        const v2 = await fetch(`http://localhost:${app.port}/x`, {
          headers: { 'x-api-version': 'v2' },
        });
        asserts.assertEquals(await v2.text(), 'v2');
      } finally {
        await app.stop();
      }
    });

    it('an unversioned request falls back to server.versioning.default, then 404s with neither', async () => {
      const withDefault = await Application.initialize({
        name: 'ver-default',
        server: { port: 0, versioning: { default: 'v1' } },
      });
      withDefault.route(
        'GET',
        '/x',
        { version: 'v1' },
        () => ({ content: 'v1' }),
      );
      await withDefault.start();
      try {
        const r = await fetch(`http://localhost:${withDefault.port}/x`); // no header at all
        asserts.assertEquals(await r.text(), 'v1');
      } finally {
        await withDefault.stop();
      }

      const noDefault = await Application.initialize({
        name: 'ver-404',
        server: { port: 0 },
      });
      noDefault.route('GET', '/x', { version: 'v1' }, () => ({
        content: 'v1',
      }));
      await noDefault.start();
      try {
        const r = await fetch(`http://localhost:${noDefault.port}/x`); // no header, no default configured
        asserts.assertEquals(r.status, 404);
      } finally {
        await noDefault.stop();
      }
    });

    it('an unversioned route is unaffected by versioning entirely', async () => {
      const app = await Application.initialize({
        name: 'ver-none',
        server: { port: 0 },
      });
      app.get('/plain', () => ({ content: 'ok' })); // no version option
      await app.start();
      try {
        const r = await fetch(`http://localhost:${app.port}/plain`, {
          headers: { 'x-api-version': 'whatever' }, // ignored — no version was registered
        });
        asserts.assertEquals(await r.text(), 'ok');
      } finally {
        await app.stop();
      }
    });
  });

  describe('websocket commands (rpc mounted on the HTTP listener)', () => {
    it('registration validates: duplicates and empty commands are loud', async () => {
      const app = await Application.initialize({
        name: 'w',
        server: { enabled: false },
      });
      app.socket('a', () => {});
      asserts.assertThrows(() => app.socket('a', () => {}), RapidError);
      asserts.assertThrows(() => app.socket('  ', () => {}), RapidError);
    });

    it('dispatches commands through the shared cycle, same port as HTTP', async () => {
      const app = await Application.initialize(
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
      const app = await Application.initialize({
        name: 'args',
        server: { port: 0 },
      });
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
      const app = await Application.initialize({
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
      const app = await Application.initialize({
        name: 'sargs',
        server: { port: 0 },
      });
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
      const app = await Application.initialize({
        name: 'sval',
        server: { port: 0 },
      });
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
      const app = await Application.initialize({
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
    it('L4: args.params is FROZEN, so the Readonly type is real', async () => {
      const app = await Application.initialize({
        name: 'l4',
        server: { enabled: false },
      });
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

    it('L4 follow-up: freezing args.params does NOT also freeze ctx.payload (they were the same object)', async () => {
      // args.params used to alias ctx.__framePayload directly — freezing
      // one froze both, even though ctx.payload is documented VERBATIM,
      // typed unknown, with no Readonly promise. A handler mutating
      // ctx.payload (a reasonable thing to do given its type) got a
      // TypeError purely as a side effect of an UNRELATED freeze.
      const app = await Application.initialize({
        name: 'l4-alias',
        server: { enabled: false },
      });
      const ctx = new SOCKETContext(app, {
        connection: { id: 'c', query: {}, headers: new Headers() },
        command: 'x',
        payload: { a: 1 },
      });
      void ctx.args; // triggers the freeze, same as the transport's `void ctx.args`
      asserts.assertEquals(Object.isFrozen(ctx.args.params), true);
      asserts.assertEquals(Object.isFrozen(ctx.payload), false);
      // deno-lint-ignore no-explicit-any
      (ctx.payload as any).b = 2; // does not throw
      asserts.assertEquals((ctx.payload as Record<string, unknown>)['b'], 2);
    });

    it('L4 follow-up: query/paging are frozen too, not just params', async () => {
      // The original L4 fix only froze args.params — a middleware
      // mutating args.query.filters/sorting or args.paging silently
      // changed what every LATER middleware in the same chain saw
      // (args is memoized per-instance), despite the Readonly type.
      const httpApp = await Application.initialize({
        name: 'l4-http',
        server: { enabled: false },
      });
      const httpCtx = new HTTPContext(httpApp, {
        request: new Request('http://x/?filter=a:eq:1&sort=a'),
        remoteAddress: '',
      });
      asserts.assertEquals(Object.isFrozen(httpCtx.args.query), true);
      asserts.assertEquals(Object.isFrozen(httpCtx.args.query.filters), true);
      asserts.assertEquals(Object.isFrozen(httpCtx.args.query.sorting), true);
      asserts.assertEquals(Object.isFrozen(httpCtx.args.paging), true);

      const jobApp = await Application.initialize({
        name: 'l4-job',
        server: { enabled: false },
      });
      const jobCtx = new JOBContext(jobApp, {
        job: 'j',
        tick: { scheduledAt: new Date(), firedAt: new Date(), count: 1 },
      });
      asserts.assertEquals(Object.isFrozen(jobCtx.args.query.filters), true);
      asserts.assertEquals(Object.isFrozen(jobCtx.args.query.sorting), true);
      asserts.assertEquals(Object.isFrozen(jobCtx.args.paging), true);

      const socketApp = await Application.initialize({
        name: 'l4-socket',
        server: { enabled: false },
      });
      const socketCtx = new SOCKETContext(socketApp, {
        connection: { id: 'c', query: {}, headers: new Headers() },
        command: 'x',
        payload: {},
      });
      asserts.assertEquals(Object.isFrozen(socketCtx.args.query.filters), true);
      asserts.assertEquals(Object.isFrozen(socketCtx.args.query.sorting), true);
      asserts.assertEquals(Object.isFrozen(socketCtx.args.paging), true);
    });

    it('L10: exotic objects are rejected as socket params', async () => {
      const app = await Application.initialize({
        name: 'l10',
        server: { enabled: false },
      });
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

    it('L7: the response getter hands out a headers COPY', async () => {
      const app = await Application.initialize({
        name: 'l7',
        server: { enabled: false },
      });
      const ctx = new HTTPContext(app, {
        request: new Request('http://x/'),
        remoteAddress: '',
      });
      ctx.response = { content: 'x' };
      ctx.response!.headers instanceof Headers &&
        (ctx.response!.headers as Headers).set('x-sneaky', 'yes');
      asserts.assertEquals(ctx.responseHeaders.get('x-sneaky'), null);
    });

    it('L5: ctx.status is the wire truth even when content is null', async () => {
      const app = await Application.initialize({
        name: 'l5',
        server: { enabled: false },
      });
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
      const app = await Application.initialize({
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
      const app = await Application.initialize({
        name: 'p1',
        server: { enabled: false },
      });
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
      const app = await Application.initialize({
        name: 'p2',
        server: { enabled: false },
      });
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

    it('HTTP: files is a defensive copy, empty before any parse', async () => {
      const app = await Application.initialize({
        name: 'p3',
        server: { enabled: false },
      });
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
      const app = await Application.initialize({
        name: 'p4',
        server: { enabled: false },
      });
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
      const app = await Application.initialize({
        name: 'um',
        server: { port: 0 },
      });
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
      const app = await Application.initialize({
        name: 'ums',
        server: { enabled: false },
      });
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

    it('a 3xx status is rejected AT SET TIME off-HTTP', async () => {
      const app = await Application.initialize({
        name: 'um3',
        server: { enabled: false },
      });
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
      const app = await Application.initialize({
        name: 'umc',
        server: { port: 0 },
      });
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
      const app = await Application.initialize({
        name: 'sm2',
        server: { port: 0 },
      });
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
      const app = await Application.initialize({
        name: 'umr',
        server: { port: 0 },
      });
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
        const appJ = await Application.initialize({
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
      const app = await Application.initialize({
        name: 'umo',
        server: { port: 0 },
      });
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

  describe('triggerJob / fetch / newRequestId guards', () => {
    it('triggerJob() for an unregistered name rejects with RAPID_CONFIG', async () => {
      const app = await Application.initialize({
        name: 'tj',
        server: { enabled: false },
      });
      const err = await asserts.assertRejects(
        () => app.triggerJob('does-not-exist'),
        RapidError,
        'No job registered',
      );
      asserts.assertEquals(err.code, 'RAPID_CONFIG');
    });

    it('fetch() with socket commands throws RAPID_CONFIG synchronously', async () => {
      // fetch has no socket owner; the guard fires on the first call
      // (before any listener), SYNCHRONOUSLY out of __prepareFetch.
      const app = await Application.initialize({
        name: 'f',
        server: { enabled: false },
      });
      app.socket('cmd', () => ({ content: 'x' }));
      const err = asserts.assertThrows(
        () => app.fetch(new Request('http://x/')),
        RapidError,
        'serves HTTP only',
      ) as RapidError;
      asserts.assertEquals(err.code, 'RAPID_CONFIG');
    });

    it('newRequestId adopts a safe inbound id and rejects unsafe ones', async () => {
      const app = await Application.initialize({
        name: 'ri',
        server: { enabled: false },
      });
      // Safe charset within the 64-char cap → adopted verbatim (trusted edge).
      asserts.assertEquals(app.newRequestId('abc_1.2-3'), 'abc_1.2-3');
      // Illegal characters → a fresh ULID, never the tainted value.
      asserts.assertNotEquals(app.newRequestId('bad id!'), 'bad id!');
      // Over the 64-char cap → a fresh ULID too.
      const long = 'x'.repeat(65);
      asserts.assertNotEquals(app.newRequestId(long), long);
      // Absent inbound → still a fresh, non-empty id.
      asserts.assert(app.newRequestId(null).length > 0);
    });

    it('ctx.detach absorbs a rejection (no unhandled rejection on the HTTP path)', async () => {
      // settleDetached() only runs for the JOB slot-hold; on the HTTP path
      // nothing awaits detached work, so detach() itself must swallow the
      // rejection. If that regressed, the test runner would flag an
      // unhandled rejection from the line below.
      const app = await Application.initialize({
        name: 'detach',
        server: { port: 0, hostname: '127.0.0.1' },
      });
      app.get('/fire', (ctx) => {
        ctx.detach(Promise.reject(new Error('fire-and-forget boom')));
        return { content: { ok: true } };
      });
      const res = await app.fetch(new Request('http://x/fire'));
      asserts.assertEquals(res.status, 200);
      await res.text();
      // Let the rejected microtask reach the unhandled-rejection checkpoint.
      await new Promise((r) => setTimeout(r, 20));
    });
  });
});

// ==========================================================================
// initialize() — the sole entry point
// ==========================================================================
{
  describe('Application.initialize', () => {
    it('programmatic shape: uses options verbatim, config is empty', async () => {
      const app = await Application.initialize({
        name: 'prog',
        mode: 'DEVELOPMENT',
      });
      asserts.assertEquals(app.option('name'), 'prog');
      asserts.assertEquals(app.config.has('database'), false);
    });

    it('config-driven: sources options from Application.yaml AND loads sibling sets', async () => {
      const dir = await makeTempDir({ prefix: 'rapid-init-' });
      try {
        await writeTextFile(
          `${dir}/Application.yaml`,
          'name: from-config\nmode: DEVELOPMENT\n',
        );
        await writeTextFile(
          `${dir}/Database.yaml`,
          'host: db.example.com\nport: 5432\n',
        );
        const app = await Application.initialize(dir);
        // Options came from the Application set...
        asserts.assertEquals(app.option('name'), 'from-config');
        // ...and the sibling Database set is readable — the whole point.
        asserts.assertEquals(app.config.get('database.host'), 'db.example.com');
      } finally {
        await removeDir(dir, { recursive: true });
      }
    });

    it('rejects a direct construction that bypasses the private constructor', () => {
      // Reach past the compile-time private modifier — the runtime brand still guards.
      const Ctor = Application as unknown as new (
        ...args: unknown[]
      ) => unknown;
      asserts.assertThrows(
        () => new Ctor('not-the-brand', { name: 'x' }),
        Error,
        'Application.initialize',
      );
    });
  });
}

// ==========================================================================
// error handling / onError
// ==========================================================================
{
  describe('rapid.Application onError', () => {
    it('overrides the disclosure envelope (status + body)', async () => {
      const app = await Application.initialize({
        name: 'oe',
        server: { port: 0, hostname: '127.0.0.1' },
      });
      app.onError((err, ctx) => ({
        status: 418,
        content: { teapot: true, code: err.code, id: ctx.requestId },
      }));
      app.get('/boom', () => {
        throw new Error('kaboom');
      });
      const res = await app.fetch(new Request('http://app/boom'));
      asserts.assertEquals(res.status, 418);
      const body = await res.json();
      asserts.assertEquals(body.teapot, true);
      asserts.assertEquals(body.code, 'RAPID_UNHANDLED');
      asserts.assert(typeof body.id === 'string' && body.id.length > 0);
    });

    it('fires for a framework 404 too (every disclosed error)', async () => {
      const app = await Application.initialize({
        name: 'oe-404',
        server: { port: 0, hostname: '127.0.0.1' },
      });
      app.onError((err) =>
        err.code === 'RAPID_NOT_FOUND'
          ? { status: 404, content: { oops: 'nowhere' } }
          : undefined
      );
      const res = await app.fetch(new Request('http://app/missing'));
      asserts.assertEquals(res.status, 404);
      asserts.assertEquals((await res.json()).oops, 'nowhere');
    });

    it('returning nothing keeps the DEFAULT envelope', async () => {
      const app = await Application.initialize({
        name: 'oe-passthrough',
        server: { port: 0, hostname: '127.0.0.1' },
      });
      app.onError(() => undefined);
      app.get('/boom', () => {
        throw new RapidError('RAPID_ACCESS_DENIED');
      });
      const res = await app.fetch(new Request('http://app/boom'));
      asserts.assertEquals(res.status, 403);
      asserts.assertEquals((await res.json()).code, 'RAPID_ACCESS_DENIED');
    });

    it('a THROWING hook never breaks disclosure — falls back to default', async () => {
      const app = await Application.initialize({
        name: 'oe-throws',
        server: { port: 0, hostname: '127.0.0.1' },
        logger: { handlers: [] }, // silence the logged hook error
      });
      app.onError(() => {
        throw new Error('hook is buggy');
      });
      app.get('/boom', () => {
        throw new Error('kaboom');
      });
      const res = await app.fetch(new Request('http://app/boom'));
      asserts.assertEquals(res.status, 500);
      asserts.assertEquals((await res.json()).code, 'RAPID_UNHANDLED');
    });
  });
}

// ==========================================================================
// autoHead
// ==========================================================================
{
  const GET_BODY = { hello: 'world' };
  const GET_LEN = String(
    new TextEncoder().encode(JSON.stringify(GET_BODY)).byteLength,
  );

  describe('rapid.Application autoHead', () => {
    it('default: HEAD to a GET route → 200, GET headers + content-length, empty body', async () => {
      const app = await Application.initialize({
        name: 'ah-on',
        server: { port: 0, hostname: '127.0.0.1' },
      });
      app.get('/thing', () => ({ content: GET_BODY }));
      const res = await app.fetch(
        new Request('http://app/thing', { method: 'HEAD' }),
      );
      asserts.assertEquals(res.status, 200);
      asserts.assertStringIncludes(
        res.headers.get('content-type') ?? '',
        'json',
      );
      asserts.assertEquals(res.headers.get('content-length'), GET_LEN);
      asserts.assertEquals(await res.text(), ''); // no body
    });

    it('off: HEAD to a GET-only route is unmatched (404)', async () => {
      const app = await Application.initialize({
        name: 'ah-off',
        server: { port: 0, hostname: '127.0.0.1', autoHead: false },
      });
      app.get('/thing', () => ({ content: GET_BODY }));
      const res = await app.fetch(
        new Request('http://app/thing', { method: 'HEAD' }),
      );
      await res.body?.cancel();
      asserts.assertEquals(res.status, 404);
    });

    it('an explicit HEAD route wins over the synthesized one', async () => {
      const app = await Application.initialize({
        name: 'ah-explicit',
        server: { port: 0, hostname: '127.0.0.1' },
      });
      app.get('/thing', () => ({ content: GET_BODY }));
      app.route('HEAD', '/thing', () => ({
        content: { ok: true },
        headers: { 'x-explicit': 'yes' },
      }));
      const res = await app.fetch(
        new Request('http://app/thing', { method: 'HEAD' }),
      );
      asserts.assertEquals(res.status, 200);
      asserts.assertEquals(res.headers.get('x-explicit'), 'yes');
      await res.body?.cancel();
    });

    it('a GET with no matching path still 404s on HEAD (no phantom routes)', async () => {
      const app = await Application.initialize({
        name: 'ah-none',
        server: { port: 0, hostname: '127.0.0.1' },
      });
      app.get('/thing', () => ({ content: GET_BODY }));
      const res = await app.fetch(
        new Request('http://app/other', { method: 'HEAD' }),
      );
      await res.body?.cancel();
      asserts.assertEquals(res.status, 404);
    });
  });
}

// ==========================================================================
// methodNotAllowed / 405
// ==========================================================================
{
  const make = async (methodNotAllowed: boolean, autoHead = false) => {
    const app = await Application.initialize({
      name: 'mna',
      server: { port: 0, hostname: '127.0.0.1', methodNotAllowed, autoHead },
    });
    app.get('/thing', () => ({ content: 'ok' }));
    app.post('/thing', () => ({ content: 'made' }));
    return app;
  };

  describe('rapid.Application methodNotAllowed', () => {
    it('on: a wrong method → 405 + Allow (path exists under other methods)', async () => {
      const app = await make(true); // autoHead off → deterministic Allow
      const res = await app.fetch(
        new Request('http://app/thing', { method: 'DELETE' }),
      );
      asserts.assertEquals(res.status, 405);
      const allow = res.headers.get('allow') ?? '';
      asserts.assert(allow.includes('GET'), `Allow missing GET: ${allow}`);
      asserts.assert(allow.includes('POST'), `Allow missing POST: ${allow}`);
      asserts.assert(
        allow.includes('OPTIONS'),
        `Allow missing OPTIONS: ${allow}`,
      );
      const body = await res.json();
      asserts.assertEquals(body.code, 'RAPID_METHOD_NOT_ALLOWED');
      asserts.assert((body.details.allow as string[]).includes('GET'));
    });

    it('on: generic OPTIONS → 204 + Allow', async () => {
      const app = await make(true);
      const res = await app.fetch(
        new Request('http://app/thing', { method: 'OPTIONS' }),
      );
      asserts.assertEquals(res.status, 204);
      asserts.assert((res.headers.get('allow') ?? '').includes('GET'));
      await res.body?.cancel();
    });

    it('on: an unknown path is still 404 (not 405)', async () => {
      const app = await make(true);
      const res = await app.fetch(
        new Request('http://app/nope', { method: 'DELETE' }),
      );
      const body = await res.json();
      asserts.assertEquals(res.status, 404);
      asserts.assertEquals(body.code, 'RAPID_NOT_FOUND');
    });

    it('off (default): a wrong method → 404, hiding the path', async () => {
      const app = await make(false);
      const res = await app.fetch(
        new Request('http://app/thing', { method: 'DELETE' }),
      );
      const body = await res.json();
      asserts.assertEquals(res.status, 404);
      asserts.assertEquals(body.code, 'RAPID_NOT_FOUND');
    });

    it('Allow reflects the synthesized HEAD when autoHead is on', async () => {
      const app = await make(true, true); // methodNotAllowed + autoHead
      const res = await app.fetch(
        new Request('http://app/thing', { method: 'DELETE' }),
      );
      asserts.assertEquals(res.status, 405);
      asserts.assert((res.headers.get('allow') ?? '').includes('HEAD'));
      await res.body?.cancel();
    });
  });
}

// ==========================================================================
// ignoreTrailingSlash
// ==========================================================================
{
  const status = async (app: Application, path: string) =>
    (await app.fetch(new Request(`http://app${path}`))).status;

  describe('rapid.Application ignoreTrailingSlash', () => {
    it('default: a stray trailing slash routes to the slash-less route; root untouched', async () => {
      const app = await Application.initialize({
        name: 'slash',
        server: { port: 0, hostname: '127.0.0.1' },
        logger: { handlers: [] },
      });
      app.get('/users', () => ({ content: { ok: true } }));
      asserts.assertEquals(await status(app, '/users'), 200);
      asserts.assertEquals(await status(app, '/users/'), 200); // forgiven
      asserts.assertEquals(await status(app, '/'), 404); // root untouched, unregistered here
    });

    it('normalises BEFORE path-mode version resolution, so /v1/users/ still resolves v1', async () => {
      const app = await Application.initialize({
        name: 'slash-ver',
        server: {
          port: 0,
          hostname: '127.0.0.1',
          versioning: { mode: 'path', default: 'v1' },
        },
        logger: { handlers: [] },
      });
      app.route('GET', '/users', { version: 'v1' }, () => ({
        content: { v: 'v1' },
      }));
      const r = await app.fetch(new Request('http://app/v1/users/'));
      asserts.assertEquals(r.status, 200);
      asserts.assertEquals((await r.json()).v, 'v1');
    });

    it('strict (false): /users and /users/ are DISTINCT routes; a mismatch is a 404', async () => {
      const app = await Application.initialize({
        name: 'slash-strict',
        server: { port: 0, hostname: '127.0.0.1', ignoreTrailingSlash: false },
        logger: { handlers: [] },
      });
      app.get('/users', () => ({ content: { which: 'no-slash' } }));
      app.get('/users/', () => ({ content: { which: 'slash' } }));
      // Each form resolves to ITS OWN handler — they are genuinely distinct.
      const a = await app.fetch(new Request('http://app/users'));
      asserts.assertEquals((await a.json()).which, 'no-slash');
      const b = await app.fetch(new Request('http://app/users/'));
      asserts.assertEquals((await b.json()).which, 'slash');
      // Only one form registered → the other is a plain 404 (no redirect).
      const strict = await Application.initialize({
        name: 'slash-strict-404',
        server: { port: 0, hostname: '127.0.0.1', ignoreTrailingSlash: false },
        logger: { handlers: [] },
      });
      strict.get('/items', () => ({ content: { ok: true } }));
      asserts.assertEquals(await status(strict, '/items'), 200);
      asserts.assertEquals(await status(strict, '/items/'), 404);
    });
  });
}

// ==========================================================================
// content negotiation
// ==========================================================================
{
  describe('rapid.Application ctx.accepts()', () => {
    it('negotiates the response type from the Accept header', async () => {
      const app = await Application.initialize({
        name: 'neg',
        server: { port: 0, hostname: '127.0.0.1' },
        logger: { handlers: [] },
      });
      app.get('/data', (ctx) => ({
        content: { type: ctx.accepts('application/json', 'text/html') ?? null },
      }));

      const html = await app.fetch(
        new Request('http://app/data', { headers: { accept: 'text/html' } }),
      );
      asserts.assertEquals((await html.json()).type, 'text/html');

      const json = await app.fetch(
        new Request('http://app/data', {
          headers: { accept: 'application/json' },
        }),
      );
      asserts.assertEquals((await json.json()).type, 'application/json');

      // Client accepts neither offer → undefined (null over JSON).
      const none = await app.fetch(
        new Request('http://app/data', { headers: { accept: 'text/plain' } }),
      );
      asserts.assertEquals((await none.json()).type, null);
    });
  });
}

// ==========================================================================
// request id generation
// ==========================================================================
{
  const SAFE = /^[A-Za-z0-9._-]{1,64}$/;
  const make = () =>
    Application.initialize({
      name: 'rid',
      server: { port: 0, hostname: '127.0.0.1' },
      logger: { handlers: [] },
    });

  describe('Application.requestIdGenerator', () => {
    it('default mints a safe, non-empty string that differs per call', async () => {
      const app = await make();
      const a = app.newRequestId();
      const b = app.newRequestId();
      asserts.assert(SAFE.test(a), `unsafe id ${a}`);
      asserts.assertNotEquals(a, b);
    });

    it('a set generator is what newRequestId mints with (restored after)', async () => {
      const prior = Application.requestIdGenerator;
      try {
        let n = 0;
        Application.requestIdGenerator = () => `req-${++n}`;
        const app = await make();
        asserts.assertEquals(app.newRequestId(), 'req-2'); // the setter consumed req-1
        asserts.assertEquals(app.newRequestId(), 'req-3');
        // And it rides the response header end-to-end.
        app.get('/', () => ({ content: '' }));
        const res = await app.fetch(new Request('http://app/'));
        asserts.assertEquals(res.headers.get('x-request-id'), 'req-4');
      } finally {
        Application.requestIdGenerator = prior;
      }
    });

    it('an inbound safe id is still adopted over the generator', async () => {
      const app = await make();
      asserts.assertEquals(app.newRequestId('edge-abc.1'), 'edge-abc.1');
    });

    it('rejects a non-function at assignment', () => {
      const prior = Application.requestIdGenerator;
      asserts.assertThrows(
        () => {
          Application.requestIdGenerator = 'nope' as unknown as () => string;
        },
        RapidError,
        'must be a function',
      );
      asserts.assertStrictEquals(Application.requestIdGenerator, prior); // unchanged
    });

    it('rejects a generator that throws when blind-called', () => {
      const prior = Application.requestIdGenerator;
      asserts.assertThrows(
        () => {
          Application.requestIdGenerator = () => {
            throw new Error('boom');
          };
        },
        RapidError,
        'threw',
      );
      asserts.assertStrictEquals(Application.requestIdGenerator, prior);
    });

    it('rejects a non-string output — a raw sequenceID() returns bigint', () => {
      const prior = Application.requestIdGenerator;
      const raw = sequenceID(); // returns bigint, not string
      asserts.assertThrows(
        () => {
          Application.requestIdGenerator = raw as unknown as () => string;
        },
        RapidError,
        'non-empty string',
      );
      asserts.assertStrictEquals(Application.requestIdGenerator, prior);
    });

    it('rejects an unsafe output (injection chars / too long / empty)', () => {
      const prior = Application.requestIdGenerator;
      for (const bad of ['a\nb', 'x'.repeat(65), '']) {
        asserts.assertThrows(
          () => {
            Application.requestIdGenerator = () => bad;
          },
          RapidError,
        );
      }
      asserts.assertStrictEquals(Application.requestIdGenerator, prior);
    });

    it('a real alternative (ulid) is accepted and used', async () => {
      const prior = Application.requestIdGenerator;
      try {
        Application.requestIdGenerator = ulid;
        const app = await make();
        asserts.assertEquals(app.newRequestId().length, 26);
      } finally {
        Application.requestIdGenerator = prior;
      }
    });
  });
}

// ==========================================================================
// fetch adapter
// ==========================================================================
{
  const make = (name: string, extra: Record<string, unknown> = {}) =>
    Application.initialize({
      name,
      server: { port: 0, hostname: '127.0.0.1' },
      logger: { handlers: [] },
      uploads: { path: '/tmp/rapid-fetch-test' },
      ...extra,
    });

  describe('rapid.Application.fetch', () => {
    it('serves routes, middleware and 404s from a Request — no port, no start()', async () => {
      const app = await make('fetch-basic');
      app.use((ctx, next) => {
        if (ctx.type === 'HTTP') ctx.setHeader('x-mw', 'ran');
        return next();
      });
      app.get(
        '/hello/:name:',
        (ctx) => ({ content: { hi: ctx.args.params.name } }),
      );

      const ok = await app.fetch(new Request('http://app/hello/ada'));
      asserts.assertEquals(ok.status, 200);
      asserts.assertEquals(await ok.json(), { hi: 'ada' });
      asserts.assertEquals(ok.headers.get('x-mw'), 'ran');
      asserts.assert(ok.headers.get('x-request-id')); // correlation echo, framework-owned

      const miss = await app.fetch(new Request('http://app/nope'));
      asserts.assertEquals(miss.status, 404);
      asserts.assertEquals((await miss.json()).code, 'RAPID_NOT_FOUND');

      asserts.assertEquals(app.address, null);
      asserts.assertEquals(app.port, null);
      asserts.assertEquals(app.metrics, undefined);
      await app.stop(); // fetch-only use: nothing to tear down, must not throw
    });

    it('a sync handler yields a Response synchronously (no promise on the hot path)', async () => {
      const app = await make('fetch-sync');
      app.get('/s', () => ({ content: 'sync' }));
      const r = app.fetch(new Request('http://app/s'));
      asserts.assert(r instanceof Response);
      asserts.assertEquals(await r.text(), 'sync');
      await app.stop();
    });

    it('info.remoteAddress reaches ctx.remoteAddress (public IPs only, per resolveClientAddress); absent → empty', async () => {
      const app = await make('fetch-addr');
      app.get('/ip', (ctx) => ({
        content: { address: ctx.remoteAddress, chain: [...ctx.remoteAddrList] },
      }));
      asserts.assertEquals(
        await (await app.fetch(new Request('http://app/ip'), {
          remoteAddress: '8.8.8.8',
        })).json(),
        { address: '8.8.8.8', chain: ['8.8.8.8'] },
      );
      // A non-public peer resolves to '' but still appears in the observed chain.
      asserts.assertEquals(
        await (await app.fetch(new Request('http://app/ip'), {
          remoteAddress: '10.0.0.5',
        })).json(),
        { address: '', chain: ['10.0.0.5'] },
      );
      asserts.assertEquals(
        await (await app.fetch(new Request('http://app/ip'))).json(),
        {
          address: '',
          chain: [],
        },
      );
      await app.stop();
    });

    it('registered socket commands make fetch() refuse with RAPID_CONFIG — HTTP only', async () => {
      const app = await make('fetch-socket');
      app.socket('ping', () => {});
      const err = asserts.assertThrows(
        () => app.fetch(new Request('http://app/')),
        RapidError,
      );
      asserts.assertEquals(err.code, 'RAPID_CONFIG');
      asserts.assertStringIncludes(err.message, 'socket commands');
    });

    it("shares start()'s boot invariants: SHARE state + a stateKey middleware is refused", async () => {
      const app = await make('fetch-share', { stateMode: 'SHARE' });
      app.use(responseTimer({ stateKey: 'duration' }));
      const err = asserts.assertThrows(
        () => app.fetch(new Request('http://app/')),
        RapidError,
      );
      asserts.assertEquals(err.code, 'RAPID_CONFIG');
      asserts.assertStringIncludes(err.message, "stateMode: 'SHARE'");
    });

    it('fetch() then start(): the prepared routes are reused on the listener, not re-registered', async () => {
      const app = await make('fetch-then-start');
      app.get('/x', () => ({ content: { ok: true } }));
      asserts.assertEquals(
        (await app.fetch(new Request('http://app/x'))).status,
        200,
      );
      await app.start(); // a second registration of /x would be a radrouter collision → RAPID_CONFIG
      try {
        const live = await fetch(`http://127.0.0.1:${app.port}/x`);
        asserts.assertEquals(await live.json(), { ok: true });
        asserts.assertEquals(
          (await app.fetch(new Request('http://app/x'))).status,
          200,
        ); // still works alongside
      } finally {
        await app.stop();
      }
    });

    it('jobs are not scheduled by fetch(); triggerJob still runs the onion', async () => {
      const app = await make('fetch-jobs');
      let ran = 0;
      app.job('tick', '0 6 * * *', () => {
        ran++;
        return { content: 'ran' };
      });
      app.get('/', () => ({ content: 'hi' }));
      await app.fetch(new Request('http://app/'));
      asserts.assertEquals(app.jobMetrics, undefined); // no scheduler started
      const outcome = await app.triggerJob('tick');
      asserts.assertEquals([outcome.status, outcome.handlerRan, ran], [
        200,
        true,
        1,
      ]);
      await app.stop();
    });
  });
}

// ==========================================================================
// metrics
// ==========================================================================
{
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
      asserts.assert(
        !text.includes('wp-admin'),
        'raw 404 path leaked to labels',
      );
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
}

// ==========================================================================
// socket pub/sub
// ==========================================================================
{
  const make = (name: string) =>
    Application.initialize({
      name,
      server: { port: 0, hostname: '127.0.0.1' },
      logger: { handlers: [] },
      uploads: { path: '/tmp/rapid-pubsub-test' },
    });

  const nextMessage = <T>(): [Promise<T>, (v: T) => void] => {
    let resolve!: (v: T) => void;
    const p = new Promise<T>((r) => {
      resolve = r;
    });
    return [p, resolve];
  };

  describe('rapid.Application pub/sub', () => {
    it('a channel-only app mounts /ws; app.publish reaches a subscriber', async () => {
      const app = await make('pubsub-basic');
      app.channel('news'); // no socket() commands — the channel alone mounts the listener
      await app.start();
      const ws = new Client({
        url: `ws://localhost:${app.port}/ws`,
        reconnect: { enabled: false },
      });
      try {
        await ws.connect();
        const [got, resolve] = nextMessage<{ headline: string }>();
        await ws.subscribe('news', (m) => resolve(m as { headline: string }));
        await app.publish('news', { headline: 'rapid ships pub/sub' });
        asserts.assertEquals(await got, { headline: 'rapid ships pub/sub' });
      } finally {
        await ws.close();
        await app.stop();
      }
    });

    it('ctx.publish from an HTTP handler reaches a socket subscriber', async () => {
      const app = await make('pubsub-ctx');
      app.channel('events');
      app.get('/emit', (ctx) => {
        void ctx.publish('events', { at: 'handler' });
        return { content: { ok: true } };
      });
      await app.start();
      const ws = new Client({
        url: `ws://localhost:${app.port}/ws`,
        reconnect: { enabled: false },
      });
      try {
        await ws.connect();
        const [got, resolve] = nextMessage<{ at: string }>();
        await ws.subscribe('events', (m) => resolve(m as { at: string }));
        const r = await fetch(`http://localhost:${app.port}/emit`);
        asserts.assertEquals((await r.json()).ok, true);
        asserts.assertEquals(await got, { at: 'handler' });
      } finally {
        await ws.close();
        await app.stop();
      }
    });

    it('authorize gates subscription — a denied client cannot subscribe', async () => {
      const app = await make('pubsub-authz');
      app.channel('secret', { authorize: (conn) => conn.query.token === 'ok' });
      await app.start();
      const denied = new Client({
        url: `ws://localhost:${app.port}/ws`,
        reconnect: { enabled: false },
      });
      try {
        await denied.connect();
        await asserts.assertRejects(() => denied.subscribe('secret', () => {}));
      } finally {
        await denied.close();
        await app.stop();
      }
    });

    it('a duplicate channel name is refused; publish before start is a no-op', async () => {
      const app = await make('pubsub-guards');
      app.channel('a');
      asserts.assertThrows(
        () => app.channel('a'),
        RapidError,
        'already declared',
      );
      asserts.assertThrows(() => app.channel(''), RapidError, 'non-empty');
      await app.publish('a', {}); // no listener yet → resolves, no throw
      await app.stop();
    });
  });
}

// ==========================================================================
// per-app DI container
// ==========================================================================
{
  type Greeter = { hi(): string };
  const GREETER = label<Greeter>('AppGreeter');

  const makeApp = async (word: string) => {
    const app = await Application.initialize({
      name: `container-${word}`,
      server: { port: 0, hostname: '127.0.0.1' },
      logger: { handlers: [] },
    });
    app.container.stock(GREETER, { hi: () => word });
    app.get('/hi', () => ({ content: { word: inject(GREETER).hi() } }));
    app.get('/hi-async', async () => {
      await Promise.resolve(); // the sync ambient stack cannot span this
      return { content: { word: inject(GREETER).hi() } };
    });
    return app;
  };

  describe('rapid.Application per-app container', () => {
    it('routes a handler’s inject() to the app handling the request — two apps stay isolated', async () => {
      const a = await makeApp('alpha');
      const b = await makeApp('beta');
      const [ra, rb] = await Promise.all([
        a.fetch(new Request('http://app/hi')),
        b.fetch(new Request('http://app/hi')),
      ]);
      asserts.assertEquals((await ra.json()).word, 'alpha');
      asserts.assertEquals((await rb.json()).word, 'beta');
    });

    it('resolves the app container even when inject() runs after an await', async () => {
      const a = await makeApp('gamma');
      const res = await a.fetch(new Request('http://app/hi-async'));
      asserts.assertEquals((await res.json()).word, 'gamma');
    });

    it('gives each app a distinct child; a stock never leaks to a sibling or the global', async () => {
      const a = await makeApp('one');
      const b = await makeApp('two');
      asserts.assert(a.container !== b.container);
      asserts.assertEquals(a.container.dispense(GREETER).hi(), 'one');
      asserts.assertEquals(b.container.dispense(GREETER).hi(), 'two');
      // The global registry never saw either app-scoped stock.
      asserts.assertEquals(Doctor.has(GREETER), false);
    });
  });
}

// ==========================================================================
// graceful drain / shutdown
// ==========================================================================
{
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  describe('rapid.Application graceful drain', () => {
    it('drains an in-flight request on stop() when a shutdown window is set', async () => {
      let markEntered = () => {};
      const entered = new Promise<void>((r) => {
        markEntered = r;
      });
      const app = await Application.initialize({
        name: 'drain-test',
        // A generous window: the drain finishes in ~150ms, well under it, so
        // the unref'd exit backstop (armed at 1.1x, cleared on completion)
        // never fires.
        server: { port: 0, hostname: '127.0.0.1' },
        logger: { handlers: [] },
        shutdownTimeout: 5_000,
      });
      app.get('/slow', async () => {
        markEntered();
        await sleep(150);
        return { content: { ok: true } };
      });

      await app.start();
      const base = `http://127.0.0.1:${app.port}`;
      // Fire but don't await; wait until the handler has actually started so
      // the request is genuinely in-flight (not idle) when we stop.
      const inflight = fetch(`${base}/slow`).then((r) => r.json());
      await entered;

      const t0 = Date.now();
      await app.stop();
      const body = await inflight;
      const elapsed = Date.now() - t0;

      // Drained to its real response — a force-close would have reset the
      // connection (fetch rejects) or returned before the handler finished.
      asserts.assertEquals(body.ok, true);
      asserts.assert(
        elapsed >= 60,
        `stop() resolved too early (${elapsed}ms); it did not drain`,
      );
    });
  });
}

// ==========================================================================
// cluster seam
// ==========================================================================
{
  const make = (name: string) =>
    Application.initialize({
      name,
      server: { port: 0, hostname: '127.0.0.1' },
      logger: { handlers: [] },
      uploads: { path: '/tmp/rapid-cluster-test' },
    });

  describe('rapid.Application cluster seams', () => {
    it('instanceId is a stable, non-empty id, distinct per app, unlike the per-request id', async () => {
      const a = await make('inst-a');
      const b = await make('inst-b');
      asserts.assert(a.instanceId.length > 0);
      asserts.assertStrictEquals(a.instanceId, a.instanceId); // stable
      asserts.assertNotEquals(a.instanceId, b.instanceId);
      asserts.assertNotEquals(a.instanceId, a.newRequestId()); // not the request id
    });

    it('cluster is undefined until fed, then returns the snapshot, then clears', async () => {
      const app = await make('cluster-slot');
      asserts.assertEquals(app.cluster, undefined);
      const snap: RapidClusterSnapshot = {
        seq: 1,
        at: '2026-08-22T00:00:00.000Z',
        leader: app.instanceId,
        members: [{
          id: app.instanceId,
          host: 'pod-1',
          startedAt: '2026-08-22T00:00:00.000Z',
          role: 'leader',
          lastSeen: '2026-08-22T00:00:01.000Z',
        }],
      };
      app.setCluster(snap);
      asserts.assertStrictEquals(app.cluster, snap);
      app.setCluster(undefined);
      asserts.assertEquals(app.cluster, undefined);
    });
  });
}

// ==========================================================================
// module system — app.modules()
// ==========================================================================
{
  const make = (name: string) =>
    Application.initialize({
      name,
      server: { port: 0, hostname: '127.0.0.1' },
      logger: { handlers: [] },
      uploads: { path: '/tmp/rapid-modules-test' },
    });

  const USER_EVENTS = { UserViewed: event<{ id: string }>() };
  @Module({ prefix: '/users' }) // no `version`: the test app sets no versioning default
  class Users extends RapidModule<typeof USER_EVENTS> {
    readonly name = 'Users';
    readonly namespace = 'users';
    protected readonly events = USER_EVENTS;
    @GET('/:id:', { bind: [param('id')] })
    async find(id: string) {
      await this.emit('UserViewed', { id });
      this.log.info('user viewed');
      return { content: { id } };
    }
  }
  class Audit extends RapidModule {
    readonly name = 'Audit';
    readonly namespace = 'audit';
    protected readonly events = {};
    readonly seen: { id: string; requestId: string }[] = [];
    disposed = false;
    @On('users:Users:UserViewed')
    record(p: { id: string }, ctx: EventContext) {
      this.seen.push({ id: p.id, requestId: ctx.requestId });
    }
    dispose() {
      this.disposed = true;
    }
  }

  describe('rapid.Application.modules', () => {
    it("boots the runtime on the app, mounts decorated routes, and a request's id flows into module events", async () => {
      const app = await make('mods-boot');
      const { modules, runtime } = await app.modules({
        modules: [{ Users, Audit }],
      });
      asserts.assertStrictEquals(app.moduleRuntime, runtime);
      asserts.assertEquals(runtime.declaredEvents, ['users:Users:UserViewed']);

      const res = await app.fetch(new Request('http://app/users/7'));
      asserts.assertEquals([res.status, await res.json()], [200, { id: '7' }]);
      const requestId = res.headers.get('x-request-id')!;
      asserts.assertEquals(modules.Audit.seen, [{ id: '7', requestId }]); // transport scope → event
      await app.stop();
    });

    it('module log lines carry the module identity (scoped view of the app logger)', async () => {
      const app = await make('mods-log');
      const lines: Record<string, unknown>[] = [];
      (app.log as unknown as {
        log: (l: number, m: string, c?: Record<string, unknown>) => void;
      }).log = (
        _l,
        _m,
        c,
      ) => {
        lines.push(c ?? {});
      };
      await app.modules({ modules: [{ Users, Audit }] });
      await app.fetch(new Request('http://app/users/1'));
      asserts.assert(lines.some((c) => c.module === 'users:Users'));
      await app.stop();
    });

    it('identity comes from the fields: @Module with a name on a RapidModule is refused', async () => {
      @Module('Twice', { prefix: '/t' })
      class Twice extends RapidModule {
        readonly name = 'Twice';
        readonly namespace = 'twice';
        protected readonly events = {};
        @GET('/')
        root() {
          return { content: 'x' };
        }
      }
      const app = await make('mods-identity');
      const err = await asserts.assertRejects(
        () => app.modules({ modules: [{ Twice }] }),
        RapidError,
      );
      asserts.assertEquals(err.code, 'RAPID_CONFIG');
      asserts.assertStringIncludes(
        err.message,
        'name/namespace come from the class fields',
      );
      asserts.assertEquals(app.moduleRuntime, undefined); // rolled back
    });

    it('event-only modules mount without decorations; a second modules() call is refused', async () => {
      const app = await make('mods-twice');
      await app.modules({ modules: [{ Users, Audit }] }); // Audit has no routes — still mounted in the runtime
      const err = await asserts.assertRejects(
        () => app.modules({ modules: [{ Users }] }),
        RapidError,
      );
      asserts.assertEquals(err.code, 'RAPID_CONFIG');
      await app.stop();
    });

    it('stop() disposes the runtime — after start(), and for a fetch-only app that never listened', async () => {
      const started = await make('mods-stop-started');
      const a = await started.modules({ modules: [{ Users, Audit }] });
      await started.start();
      await started.stop();
      asserts.assert(a.runtime.disposed);
      asserts.assert(a.modules.Audit.disposed);
      asserts.assertEquals(started.moduleRuntime, undefined);

      const fetchOnly = await make('mods-stop-fetch');
      const b = await fetchOnly.modules({ modules: [{ Users, Audit }] });
      await fetchOnly.fetch(new Request('http://app/users/2'));
      await fetchOnly.stop();
      asserts.assert(b.runtime.disposed);
    });
  });
}

// ==========================================================================
// module system — routes/commands/jobs
// ==========================================================================
{
  describe('rapid.Application.module', () => {
    it('prefix joins HTTP paths only; SOCKET/JOB stay flat', async () => {
      @Module('Users', { prefix: '/api/v1' })
      class Users {
        @GET('/:id:', { bind: [param('id')] })
        find(id: string): RapidContextResponse {
          return { content: { id } };
        }

        @SOCKET('users.get', { bind: [param('id')] })
        findViaSocket(id: string): RapidContextResponse {
          return { content: { id } };
        }
      }

      const app = await Application.initialize({
        name: 'mod-prefix',
        server: { port: 0 },
      });
      app.module(new Users());
      await app.start();
      try {
        const res = await fetch(`http://localhost:${app.port}/api/v1/7`);
        asserts.assertEquals(res.status, 200);
        asserts.assertEquals(await res.json(), { id: '7' });

        const ws = new Client({
          url: `ws://localhost:${app.port}/ws`,
          reconnect: { enabled: false },
        });
        await ws.connect();
        try {
          // Socket commands ignore the module's HTTP prefix entirely.
          const r = await ws.command<{ id: string }>('users.get', { id: '9' });
          asserts.assertEquals(r, { id: '9' });
        } finally {
          await ws.close();
        }
      } finally {
        await app.stop();
      }
    });

    it('no @Module at all still mounts (opt-in, empty prefix)', async () => {
      class Bare {
        @GET('/plain')
        handler(): RapidContextResponse {
          return { content: 'ok' };
        }
      }
      const app = await Application.initialize({
        name: 'mod-bare',
        server: { port: 0 },
      });
      app.module(new Bare());
      await app.start();
      try {
        const res = await fetch(`http://localhost:${app.port}/plain`);
        asserts.assertEquals(await res.text(), 'ok');
      } finally {
        await app.stop();
      }
    });

    it('every binder source extracts correctly across all three transports', async () => {
      @Module('Reports', { prefix: '/svc' })
      class Reports {
        @GET('/:id:', {
          bind: [param('id'), query(), paging(), header('x-trace')],
        })
        httpFind(
          id: string,
          q: { filters: Record<string, unknown> },
          paging: { page: number; size: number },
          trace: string | null,
        ): RapidContextResponse {
          return {
            content: { id, filters: q.filters, page: paging.page, trace },
          };
        }

        @SOCKET('reports.inspect', {
          bind: [param('id'), payload(), connection()],
        })
        socketInspect(
          id: string,
          payload: unknown,
          conn: SOCKETConnection,
        ): RapidContextResponse {
          return { content: { id, payload, connId: conn.id } };
        }

        @JOB('daily-report', '0 6 * * *', {
          args: { id: 'latest' },
          bind: [param('id'), payload()],
        })
        job(id: string, payload: unknown): RapidContextResponse {
          return { content: { id, payload } };
        }
      }

      const app = await Application.initialize({
        name: 'mod-binders',
        server: { port: 0 },
      });
      app.module(new Reports());
      await app.start();
      try {
        // No query string: confirms wiring with the empty-query default,
        // not the query grammar itself (that's parseQueryFilters' own suite).
        const res = await fetch(`http://localhost:${app.port}/svc/7`, {
          headers: { 'x-trace': 'abc' },
        });
        asserts.assertEquals(await res.json(), {
          id: '7',
          filters: {},
          page: 1,
          trace: 'abc',
        });

        const ws = new Client({
          url: `ws://localhost:${app.port}/ws`,
          reconnect: { enabled: false },
        });
        await ws.connect();
        try {
          const r = await ws.command<
            { id: string; payload: unknown; connId: string }
          >('reports.inspect', { id: '9', extra: 'x' });
          // Frame payload IS params, so the whole frame becomes the payload():
          asserts.assertEquals(r.payload, { id: '9', extra: 'x' });
          asserts.assert(r.connId.length > 0);
        } finally {
          await ws.close();
        }

        const outcome = await app.triggerJob('daily-report');
        asserts.assertEquals(outcome.status, 200);
        // JOB has no payload source: ctx.payload resolves to undefined.
        asserts.assertEquals(outcome.content, {
          id: 'latest',
          payload: undefined,
        });
      } finally {
        await app.stop();
      }
    });

    it('connection() bound off @SOCKET is rejected at MOUNT time, not first request', async () => {
      class Bad {
        @GET('/x', { bind: [connection()] })
        // deno-lint-ignore no-explicit-any
        handler(_conn: any): RapidContextResponse {
          return { content: 'unreachable' };
        }
      }
      const app = await Application.initialize({
        name: 'mod-badbind',
        server: { enabled: false },
      });
      asserts.assertThrows(
        () => app.module(new Bad()),
        RapidError,
        'connection() only binds on @SOCKET',
      );
    });

    it('a malformed reply throws RAPID_RESPONSE_INVALID at invocation time', async () => {
      class Broken {
        @GET('/broken')
        // deno-lint-ignore no-explicit-any
        handler(): any {
          return 'not an envelope'; // missing { content }
        }
      }
      const app = await Application.initialize({
        name: 'mod-badreply',
        server: { port: 0 },
      });
      app.module(new Broken());
      await app.start();
      try {
        const res = await fetch(`http://localhost:${app.port}/broken`);
        asserts.assertEquals(res.status, 500); // RAPID_RESPONSE_INVALID maps to 500
      } finally {
        await app.stop();
      }
    });

    it('zero decorated methods anywhere on the instance is a mount-time error', async () => {
      class Empty {
        plain(): string {
          return 'not a route';
        }
      }
      const app = await Application.initialize({
        name: 'mod-empty',
        server: { enabled: false },
      });
      asserts.assertThrows(
        () => app.module(new Empty()),
        RapidError,
        'no @GET/@POST/@PUT/@PATCH/@DELETE/@SOCKET/@JOB decorated methods',
      );
    });

    it('an inherited (non-overridden) decorated method mounts fine, bound to the subclass instance', async () => {
      class Base {
        @GET('/who')
        who(): RapidContextResponse {
          // `this` must be the SUBCLASS instance at call time, not Base's.
          return { content: (this as unknown as Derived).label };
        }
      }
      class Derived extends Base {
        public readonly label = 'derived';
      }
      const app = await Application.initialize({
        name: 'mod-inherit',
        server: { port: 0 },
      });
      app.module(new Derived());
      await app.start();
      try {
        const res = await fetch(`http://localhost:${app.port}/who`);
        asserts.assertEquals(await res.text(), 'derived');
      } finally {
        await app.stop();
      }
    });

    it('a subclass overriding a decorated method WITHOUT re-decorating is rejected loudly', async () => {
      class Base {
        @GET('/x')
        handler(): RapidContextResponse {
          return { content: 'base' };
        }
      }
      class Broken extends Base {
        override handler(): RapidContextResponse {
          return { content: 'override' };
        }
      }
      const app = await Application.initialize({
        name: 'mod-override-bad',
        server: { enabled: false },
      });
      asserts.assertThrows(
        () => app.module(new Broken()),
        RapidError,
        'overrides a method decorated on Base',
      );
    });

    it('a subclass overriding AND re-decorating mounts the OVERRIDE, base entry shadowed', async () => {
      class Base {
        @GET('/x')
        handler(): RapidContextResponse {
          return { content: 'base' };
        }
      }
      class Fixed extends Base {
        @GET('/x')
        override handler(): RapidContextResponse {
          return { content: 'fixed' };
        }
      }
      const app = await Application.initialize({
        name: 'mod-override-fixed',
        server: { port: 0 },
      });
      app.module(new Fixed());
      await app.start();
      try {
        const res = await fetch(`http://localhost:${app.port}/x`);
        asserts.assertEquals(await res.text(), 'fixed');
      } finally {
        await app.stop();
      }
    });

    it('module() reuses the plain core: a duplicate socket command across TWO module() calls throws', async () => {
      class A {
        @SOCKET('dup')
        a(): RapidContextResponse {
          return { content: 'a' };
        }
      }
      class B {
        @SOCKET('dup')
        b(): RapidContextResponse {
          return { content: 'b' };
        }
      }
      const app = await Application.initialize({
        name: 'mod-dup',
        server: { enabled: false },
      });
      app.module(new A());
      asserts.assertThrows(
        () => app.module(new B()),
        RapidError,
        "socket command 'dup' is already registered",
      );
    });

    it('app.module(a, b) mounts several instances in one call', async () => {
      class Cats {
        @GET('/cats')
        list(): RapidContextResponse {
          return { content: 'cats' };
        }
      }
      class Dogs {
        @GET('/dogs')
        list(): RapidContextResponse {
          return { content: 'dogs' };
        }
      }
      const app = await Application.initialize({
        name: 'mod-multi',
        server: { port: 0 },
      });
      app.module(new Cats(), new Dogs());
      await app.start();
      try {
        const cats = await fetch(`http://localhost:${app.port}/cats`);
        const dogs = await fetch(`http://localhost:${app.port}/dogs`);
        asserts.assertEquals(await cats.text(), 'cats');
        asserts.assertEquals(await dogs.text(), 'dogs');
      } finally {
        await app.stop();
      }
    });
  });
}

// ==========================================================================
// module binders — cookie/auth/session
// ==========================================================================
{
  @Module('Binders', {})
  class Binders {
    @GET('/cookie', { bind: [cookie('theme')] })
    readCookie(theme: string | null): RapidContextResponse {
      return { content: { theme } };
    }

    @GET('/auth', { bind: [auth()] })
    readAuth(a: Record<string, unknown> | undefined): RapidContextResponse {
      return { content: { user: (a?.userId as string | undefined) ?? null } };
    }

    @GET('/session', { bind: [session()] })
    readSession(s: RapidSession | undefined): RapidContextResponse {
      if (s) s.set('seen', (s.get<number>('seen') ?? 0) + 1);
      return { content: { seen: s?.get<number>('seen') ?? null } };
    }
  }

  const make = () =>
    Application.initialize({
      name: 'binders',
      secret: 'test-secret-0123456789-abcdefghijklmnop',
      server: { port: 0, hostname: '127.0.0.1' },
      logger: { handlers: [] },
    });

  describe('rapid module binders (cookie / auth / session)', () => {
    it('cookie() binds an inbound cookie to a method param', async () => {
      const app = await make();
      app.module(new Binders());
      const r = await app.fetch(
        new Request('http://app/cookie', { headers: { cookie: 'theme=dark' } }),
      );
      asserts.assertEquals((await r.json()).theme, 'dark');
      // Absent cookie → null (the pinned type).
      const r2 = await app.fetch(new Request('http://app/cookie'));
      asserts.assertEquals((await r2.json()).theme, null);
    });

    it('auth() binds the ctx.auth bag set by an upstream middleware', async () => {
      const app = await make();
      app.use((ctx, next) => {
        if (ctx.type === 'HTTP') ctx.setAuth({ userId: 'u1' });
        return next();
      });
      app.module(new Binders());
      const r = await app.fetch(new Request('http://app/auth'));
      asserts.assertEquals((await r.json()).user, 'u1');
    });

    it('session() binds the request session', async () => {
      const app = await make();
      app.use(sessionMw({ secure: false }));
      app.module(new Binders());
      const r = await app.fetch(new Request('http://app/session'));
      asserts.assertEquals((await r.json()).seen, 1);
    });
  });
}
