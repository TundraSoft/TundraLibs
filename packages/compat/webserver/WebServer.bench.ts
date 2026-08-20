/**
 * @fileoverview Benchmarks for `WebServer` — the runtime's NATIVE HTTP
 * server vs. bare `WebServer`, same two hand-routed routes, measured as
 * sequential localhost fetch round trips. Isolates WebServer's own
 * per-request cost (Fetch-API translation on Node, bookkeeping
 * everywhere) from any consumer's.
 *
 * One file, all three lanes: the native side is `Deno.serve`,
 * `Bun.serve`, or `node:http` depending on where the file runs, so the
 * within-lane native-vs-WebServer ratio is the comparable number.
 * Single-connection round trips are NOT a load test — for concurrency
 * throughput history (autocannon, 50 connections) see
 * `bench/RESULTS.md` next to this file.
 *
 * @module
 */

import { bench } from '../bench.ts';
import { RUNTIME } from '../runtime.ts';
import { WebServer } from './mod.ts';

const NATIVE_PORT = 4123;
const COMPAT_PORT = 4124;
const JSON_TYPE = 'application/json';
const USERS_RE = /^\/users\/([^/]+)$/;

/** The shared route logic — Fetch shape, used verbatim on every lane. */
const fetchHandler = (request: Request): Response => {
  const url = new URL(request.url);
  if (url.pathname === '/') {
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'content-type': JSON_TYPE },
    });
  }
  const match = url.pathname.match(USERS_RE);
  if (match) {
    return new Response(JSON.stringify({ id: match[1] }), {
      headers: { 'content-type': JSON_TYPE },
    });
  }
  return new Response('Not Found', { status: 404 });
};

/**
 * Servers start ONCE, on the first bench invocation (the harness has
 * no setup hook, and top-level await is barred package-wide). Both are
 * unref'd so the process can exit when the run completes.
 */
let ready: Promise<void> | undefined;

const ensureServers = (): Promise<void> => (ready ??= (async () => {
  const g = globalThis as unknown as {
    Deno?: {
      serve(
        opts: { port: number; hostname: string; onListen: () => void },
        handler: (req: Request) => Response | Promise<Response>,
      ): { unref(): void };
    };
    Bun?: {
      serve(
        opts: {
          port: number;
          hostname: string;
          fetch: (req: Request) => Response | Promise<Response>;
        },
      ): { unref(): void };
    };
  };
  if (RUNTIME === 'DENO' && g.Deno) {
    await new Promise<void>((resolve) => {
      g.Deno!.serve(
        { port: NATIVE_PORT, hostname: 'localhost', onListen: resolve },
        fetchHandler,
      ).unref();
    });
  } else if (RUNTIME === 'BUN' && g.Bun) {
    g.Bun.serve({
      port: NATIVE_PORT,
      hostname: 'localhost',
      fetch: fetchHandler,
    }).unref();
  } else {
    // Node's floor speaks raw req/res — no Fetch objects at all;
    // that difference IS what the Node lane measures.
    const http = await import('node:http');
    const server = http.createServer((req, res) => {
      if (req.url === '/') {
        res.writeHead(200, { 'content-type': JSON_TYPE });
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      const match = req.url?.match(USERS_RE);
      if (match) {
        res.writeHead(200, { 'content-type': JSON_TYPE });
        res.end(JSON.stringify({ id: match[1] }));
        return;
      }
      res.writeHead(404);
      res.end('Not Found');
    });
    await new Promise<void>((resolve) => {
      server.listen(NATIVE_PORT, 'localhost', resolve);
    });
    server.unref();
  }

  const compat = new WebServer('bench', {
    mode: 'TCP',
    port: COMPAT_PORT,
    hostname: 'localhost',
    handler: fetchHandler,
  });
  await compat.start();
  compat.unref();
})());

/** One measured round trip — request out, body fully drained. */
const roundTrip = async (port: number, path: string): Promise<number> => {
  const response = await fetch(`http://localhost:${port}${path}`);
  await response.arrayBuffer();
  return response.status;
};

bench('native GET /', { group: 'GET /', baseline: true }, async (b) => {
  await ensureServers();
  b.start();
  const status = await roundTrip(NATIVE_PORT, '/');
  b.end();
  return status;
});

bench('WebServer GET /', { group: 'GET /' }, async (b) => {
  await ensureServers();
  b.start();
  const status = await roundTrip(COMPAT_PORT, '/');
  b.end();
  return status;
});

bench(
  'native GET /users/:id',
  { group: 'GET /users/:id', baseline: true },
  async (b) => {
    await ensureServers();
    b.start();
    const status = await roundTrip(NATIVE_PORT, '/users/42');
    b.end();
    return status;
  },
);

bench('WebServer GET /users/:id', { group: 'GET /users/:id' }, async (b) => {
  await ensureServers();
  b.start();
  const status = await roundTrip(COMPAT_PORT, '/users/42');
  b.end();
  return status;
});
