/**
 * @fileoverview compat `WebServer` (bare transport) vs rAPId (the
 * framework on top), same two routes, IN-PROCESS. Both are driven
 * through the IDENTICAL `WebServer._processRequest` cycle — the bare
 * side hands it a trivial hand-routed handler; the rAPId side hands it
 * the framework pipeline (`HTTPTransport.__handle`: route → context →
 * middleware onion → finalize → serialize). The gap between the two is
 * exactly what rAPId's framework layer costs over the transport it runs
 * on, and answers "where are we slower than bare compat, and why".
 *
 * Measured in-process (no socket) so the numbers are per-request CPU,
 * not ~40µs of RTT that would hide the difference. `_processRequest` is
 * pure (state check, requestInfo, handler call, error/metric
 * bookkeeping) — reached via a cast, with `_state` forced to RUNNING so
 * no port is bound; the transport's router is populated exactly as
 * `HTTPTransport.start()` does, minus the server bind.
 *
 * @module
 */

import { bench } from '@tundralibs/compat/bench';
import { WebServer } from '@tundralibs/compat/webserver';
import { RadRouter } from '@tundralibs/radrouter';
import { Application } from '../Application.ts';
import { HTTPTransport } from './mod.ts';
import { compose } from '../utils/mod.ts';
import type { RapidRouteEntry } from '../types/mod.ts';

const JSON_H = { 'content-type': 'application/json' };
const USERS_RE = /^\/users\/([^/]+)$/;

// deno-lint-ignore no-explicit-any
type Any = any;

/** Force a WebServer into the RUNNING state without binding a port. */
const asRunning = (ws: WebServer): WebServer => {
  (ws as unknown as { _state: string })._state = 'RUNNING';
  return ws;
};

/** Call the protected per-request cycle directly (no socket). */
const processRequest = (ws: WebServer, req: Request): Promise<Response> =>
  (ws as unknown as {
    _processRequest(
      r: Request,
      i: { remoteAddress: string | null; remotePort: number | null },
    ): Promise<Response>;
  })._processRequest(req, { remoteAddress: '127.0.0.1', remotePort: 12345 });

// --- BARE compat: a WebServer with a hand-routed handler (the
//     compat-server.ts shape) ---
const compatWs = asRunning(
  new WebServer('compat-bare', {
    mode: 'TCP',
    port: 0,
    hostname: 'localhost',
    handler: (req) => {
      const url = new URL(req.url);
      if (url.pathname === '/') {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: JSON_H,
        });
      }
      const m = url.pathname.match(USERS_RE);
      if (m) {
        return new Response(JSON.stringify({ id: m[1] }), {
          status: 200,
          headers: JSON_H,
        });
      }
      return new Response('Not Found', { status: 404 });
    },
  }),
);

// --- rAPId: a transport whose router is populated like start(), wrapped
//     in a WebServer whose handler IS __handle (the real per-request
//     stack a rAPId consumer pays) ---
const app = new Application({ name: 'bench', mode: 'PRODUCTION' });
app.get('/', () => ({ content: { ok: true } }));
app.get('/users/:id:', (ctx) => ({ content: { id: ctx.args.params.id } }));

const transport = new HTTPTransport(app);
const tInternals = transport as unknown as {
  __router: RadRouter<RapidRouteEntry>;
  __composedRoutes: Map<RapidRouteEntry, unknown>;
  __composedNoMatch: unknown;
  __handle(req: Request, addr: string): Promise<Response>;
};
for (const entry of app.routes) {
  tInternals.__router.addRoute(
    entry.method,
    entry.path,
    [entry],
    entry.version,
  );
  tInternals.__composedRoutes.set(
    entry,
    compose([...app.middlewares, ...entry.middlewares] as Any),
  );
}
tInternals.__composedNoMatch = compose([...app.middlewares] as Any);

const rapidWs = asRunning(
  new WebServer('rapid', {
    mode: 'TCP',
    port: 0,
    hostname: 'localhost',
    handler: (req, info) => tInternals.__handle(req, info.remoteAddress ?? ''),
  }),
);

const reqRoot = new Request('http://localhost/');
const reqUser = new Request('http://localhost/users/42');

bench(
  'GET / - compat bare',
  { group: 'GET /', baseline: true },
  () => processRequest(compatWs, reqRoot),
);
bench(
  'GET / - rAPId',
  { group: 'GET /' },
  () => processRequest(rapidWs, reqRoot),
);

bench(
  'GET /users/:id - compat bare',
  { group: 'GET /users/:id', baseline: true },
  () => processRequest(compatWs, reqUser),
);
bench(
  'GET /users/:id - rAPId',
  { group: 'GET /users/:id' },
  () => processRequest(rapidWs, reqUser),
);
