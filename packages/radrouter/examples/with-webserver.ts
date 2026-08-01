/**
 * @fileoverview RadRouter wired into `@tundralibs/compat/webserver`.
 *
 * The canonical integration pattern: construct the router once at
 * module scope, look up on every request, run the resulting chain
 * against a per-request context object the consumer owns.
 *
 * Run:
 *   deno run --allow-net packages/radrouter/examples/with-webserver.ts
 *   curl http://localhost:8080/health
 *   curl http://localhost:8080/users/42
 *   curl -X POST http://localhost:8080/users
 */

import { WebServer } from '../../compat/webserver/mod.ts';
import { RadRouter } from '../mod.ts';
import type { HTTPMethod } from '../../compat/http.ts';

type AppCtx = {
  request: Request;
  response: Response;
  state: Record<string, unknown>;
};
type AppMw = (ctx: AppCtx, next: () => Promise<void>) => Promise<void>;

const router = new RadRouter<AppMw>();

// Timing middleware — runs before and after the handler.
router.use(async (ctx, next) => {
  const start = performance.now();
  await next();
  ctx.response.headers.set(
    'x-elapsed-ms',
    (performance.now() - start).toFixed(2),
  );
});

router.get('/health', [
  async (ctx, next) => {
    ctx.response = new Response('ok');
    await next();
  },
]);

router.get('/users/:id:', [
  async (ctx, next) => {
    // The lookup result is passed via the closure that ran `find()`;
    // params live on `ctx` only if your wire-up copies them across.
    // For brevity this demo reads the URL directly.
    const id = new URL(ctx.request.url).pathname.split('/').pop();
    ctx.response = new Response(JSON.stringify({ id }), {
      headers: { 'content-type': 'application/json' },
    });
    await next();
  },
]);

const METHODS: HTTPMethod[] = [
  'GET',
  'POST',
  'PUT',
  'DELETE',
  'PATCH',
  'HEAD',
  'OPTIONS',
];

const server = new WebServer<unknown>('demo', {
  mode: 'TCP',
  port: 8080,
  handler: async (request) => {
    const url = new URL(request.url);
    const method = request.method as HTTPMethod;
    const match = router.find(method, url.pathname);

    if (!match) {
      // Probe other methods on the same path to distinguish 404 from 405.
      const allowed = METHODS.filter((m) => router.find(m, url.pathname));
      if (allowed.length) {
        return new Response('Method Not Allowed', {
          status: 405,
          headers: { Allow: allowed.join(', ') },
        });
      }
      return new Response('Not Found', { status: 404 });
    }

    const ctx: AppCtx = { request, response: new Response(), state: {} };
    let i = 0;
    const next = async () => {
      const mw = match.middlewares[i++];
      if (mw) await mw(ctx, next);
    };
    await next();
    return ctx.response;
  },
});

await server.start();
console.log('listening on http://localhost:8080');
