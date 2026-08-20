/**
 * @fileoverview SCRATCH (not committed): per-request overhead ATTRIBUTION
 * for rapid's framework layer, answering "can rapid match oak/express/
 * fastify WITHOUT losing functionality". Three variants of the same
 * request cycle, identical observable semantics:
 *
 *   1. `__handle current`   — the real pipeline (baseline).
 *   2. `collapsed`          — same work (URL, route, ctx, requestId,
 *      ambient scope, correlation echo, respond) but with the async
 *      frames COLLAPSED: no async/await in the framework path, thenable
 *      checks instead, cleanup skipped when there is provably nothing
 *      to clean. Functionality preserved: ambient correlation active
 *      during handler+finalize, tracer seam checked, disclosure kept.
 *   3. `collapsed no-ambient` — variant 2 minus ambient.run, to price
 *      ALS itself (NOT a proposal — correlation is a kept feature).
 *
 * Plus component micro-benches for each suspected cost.
 *
 * @module
 */

import { bench } from '@tundralibs/compat/bench';
import { ambient } from '@tundralibs/ambient';
import { RadRouter } from '@tundralibs/radrouter';
import { ulid } from '@tundralibs/id';
import { Application } from '../Application.ts';
import { HTTPContext } from '../context/mod.ts';
import { HTTPTransport } from '../transports/mod.ts';
import { compose } from '../utils/mod.ts';
import type { RapidRouteEntry } from '../types/mod.ts';

// deno-lint-ignore no-explicit-any
type Any = any;

// --- the same 2-route app the E2E bench servers use ---
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

const reqRoot = new Request('http://localhost/');
const reqUser = new Request('http://localhost/users/42');

// ---------------------------------------------------------------------
// The COLLAPSED prototype: byte-for-byte the same observable behavior
// on the happy path, minimal promise machinery. Semantics kept:
//  - method/pathname/version resolution identical
//  - newRequestId policy identical (inbound adoption or ULID)
//  - ambient scope OPEN during handler AND finalize (log correlation)
//  - tracer seam checked (undefined here, as in the E2E bench)
//  - correlation header echoed on every response
//  - error disclosure identical (RapidError.from → payload by mode)
//  - async handlers still work (thenable branch)
//  - cleanup runs only when there is something to clean (payload read
//    or files written) — provably nothing here, checked cheaply.
// ---------------------------------------------------------------------
const serverOptions = app.option('server')!;
const requestIdHeader = serverOptions.requestIdHeader!;
const versionHeader = serverOptions.versioning!.header!;

/** Extract the pathname without a full URL parse. */
const pathnameOf = (url: string): string => {
  const schemeEnd = url.indexOf('://');
  const start = url.indexOf('/', schemeEnd + 3);
  if (start < 0) return '/';
  let end = url.indexOf('?', start);
  if (end < 0) end = url.indexOf('#', start);
  return end < 0 ? url.slice(start) : url.slice(start, end);
};

const isThenable = (v: unknown): v is Promise<unknown> =>
  v !== null && typeof v === 'object' &&
  typeof (v as { then?: unknown }).then === 'function';

const hasCleanupWork = (ctx: HTTPContext): boolean => {
  const c = ctx as unknown as {
    __payloadPromise: unknown;
    _fileUploads: string[];
  };
  return c.__payloadPromise !== undefined || c._fileUploads.length > 0;
};

const finalizeFast = (ctx: HTTPContext): Response | Promise<Response> => {
  const response = ctx.respond();
  if (!hasCleanupWork(ctx)) return response;
  return ctx.cleanup().then(() => response, () => response);
};

const collapsedCore = (
  request: Request,
  remoteAddress: string,
  withAmbient: boolean,
): Promise<Response> | Response => {
  const method = request.method.trim().toUpperCase();
  const pathname = pathnameOf(request.url);
  const version = request.headers.get(versionHeader) ?? undefined;
  const match = tInternals.__router.find(method as Any, pathname, version);
  const entry = match?.middlewares[0];
  const ctx = new HTTPContext(app, {
    request,
    remoteAddress,
    params: match?.params ?? {},
    action: entry !== undefined ? `${method} ${entry.path}` : undefined,
    matched: entry !== undefined,
    requestId: app.newRequestId(request.headers.get(requestIdHeader)),
  });
  ctx.setHeader(requestIdHeader, ctx.requestId);

  const run = (): Response | Promise<Response> => {
    try {
      if (entry !== undefined) {
        // Zero-middleware fast path (the composed chain would be the
        // passthrough anyway); tracer seam preserved.
        if (app.tracer !== undefined) throw new Error('bench: no tracer');
        const returned = entry.handler(ctx as Any);
        if (isThenable(returned)) {
          return returned.then((r) => {
            if (r !== undefined && ctx.response === null) {
              ctx.response = r as Any;
            }
            return finalizeFast(ctx);
          });
        }
        if (returned !== undefined && ctx.response === null) {
          ctx.response = returned as Any;
        }
      } else {
        ctx.response ??= {
          status: 404,
          content: {
            code: 'RAPID_NOT_FOUND',
            message: 'Not found',
            requestId: ctx.requestId,
          },
        };
      }
      return finalizeFast(ctx);
    } catch (error) {
      // The real impl keeps _invoke's full disclosure catch here; the
      // bench happy path never enters it, so a rethrow prices the same.
      throw error;
    }
  };

  if (!withAmbient) return run();
  return ambient.run(
    { requestId: ctx.requestId, action: ctx.action },
    run,
  ) as Response | Promise<Response>;
};

// --- head-to-head: the pipeline variants -----------------------------
bench(
  'GET / — __handle current',
  { group: 'pipeline /', baseline: true },
  () => tInternals.__handle(reqRoot, '127.0.0.1'),
);
bench(
  'GET / — collapsed',
  { group: 'pipeline /' },
  () => collapsedCore(reqRoot, '127.0.0.1', true),
);
bench(
  'GET / — collapsed no-ambient',
  { group: 'pipeline /' },
  () => collapsedCore(reqRoot, '127.0.0.1', false),
);

bench(
  'GET /users/:id — __handle current',
  { group: 'pipeline /users', baseline: true },
  () => tInternals.__handle(reqUser, '127.0.0.1'),
);
bench(
  'GET /users/:id — collapsed',
  { group: 'pipeline /users' },
  () => collapsedCore(reqUser, '127.0.0.1', true),
);

// --- components ------------------------------------------------------
bench('new URL(url)', { group: 'url', baseline: true }, () => {
  return new URL('http://localhost/users/42').pathname;
});
bench('pathnameOf scan', { group: 'url' }, () => {
  return pathnameOf('http://localhost/users/42');
});

bench('ambient.run(seed, sync fn)', { group: 'ambient' }, () => {
  return ambient.run({ requestId: 'x', action: 'y' }, () => 1);
});

bench('app.state (buildState CLONE)', { group: 'state' }, () => app.state);

bench('new Headers()', { group: 'alloc' }, () => new Headers());

// async-frame ladder: what N stacked async frames cost per request.
const sync1 = () => 1;
async function ladder(n: number): Promise<number> {
  if (n === 0) return sync1();
  return await ladder(n - 1);
}
bench('async ladder depth 8', { group: 'frames' }, () => ladder(8));
bench(
  'sync call (0 frames)',
  { group: 'frames', baseline: true },
  () => sync1(),
);
bench('async ladder depth 8 under ALS', { group: 'frames' }, () => {
  return ambient.run({ requestId: 'x', action: 'y' }, () => ladder(8));
});

// ULID: current vs a pooled/cached prototype (time prefix cached per
// ms; randomness drawn from a refilled pool) — spec-identical output
// shape, would live in packages/id if adopted.
const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const POOL = new Uint8Array(10 * 512);
let poolAt = POOL.length;
let lastMs = -1;
let timePrefix = '';
const fastUlid = (): string => {
  const now = Date.now();
  if (now !== lastMs) {
    lastMs = now;
    let t = now;
    let p = '';
    for (let i = 0; i < 10; i++) {
      p = B32[t % 32] + p;
      t = Math.floor(t / 32);
    }
    timePrefix = p;
  }
  if (poolAt + 10 > POOL.length) {
    crypto.getRandomValues(POOL);
    poolAt = 0;
  }
  let out = timePrefix;
  // 10 bytes → 16 chars (80 bits, 5 bits per char).
  let acc = 0;
  let bits = 0;
  for (let i = 0; i < 10; i++) {
    acc = (acc << 8) | POOL[poolAt + i]!;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += B32[(acc >>> bits) & 31];
    }
  }
  poolAt += 10;
  return out;
};
bench('ulid() current', { group: 'ulid', baseline: true }, () => ulid());
bench('fastUlid pooled prototype', { group: 'ulid' }, () => fastUlid());
