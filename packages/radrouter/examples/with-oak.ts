/**
 * @fileoverview RadRouter wired into an Oak application.
 *
 * Oak's middleware signature — `(ctx, next) => Promise<void>` —
 * matches RadRouter's default `Middleware` shape almost exactly, so
 * the adapter is essentially a pass-through. Parameterise
 * `RadRouter<M>` with Oak's `Middleware` type and your captured
 * params flow into `ctx.state` for downstream handlers.
 *
 * Run (Deno):
 *   deno run --allow-net packages/radrouter/examples/with-oak.ts
 *   curl http://localhost:8080/health
 *   curl http://localhost:8080/users/AbCdEf
 *   curl -X POST -H 'content-type: application/json' \
 *        -d '{"name":"Ada"}' http://localhost:8080/users
 */

import {
  Application,
  type Context,
  type Middleware as OakMw,
} from 'jsr:@oak/oak@^17.1.4';
import { type HTTPMethod, RadRouter } from '../mod.ts';

// Type-narrow `ctx.state` so handlers can read `ctx.state.radParams.id`
// without casting on every access.
type AppState = { radParams: Record<string, string> };
type AppMw = OakMw<AppState>;
type AppCtx = Context<AppState>;

const router = new RadRouter<AppMw>({ caseSensitive: false });

// Router-level timing middleware — runs before every matched chain.
router.use(async (ctx, next) => {
  const start = performance.now();
  await next();
  ctx.response.headers.set(
    'x-elapsed-ms',
    (performance.now() - start).toFixed(2),
  );
});

// Health + read handlers are synchronous body assignments — keep
// the AppMw signature (returns Promise<void>) but drop `async`
// from the arrow since there's nothing to await.
router.get('/health', [(ctx: AppCtx) => {
  ctx.response.body = 'ok';
  ctx.response.type = 'text/plain';
  return Promise.resolve();
}]);

router.get('/users/:id:', [(ctx: AppCtx) => {
  ctx.response.body = { id: ctx.state.radParams.id };
  return Promise.resolve();
}]);

router.post('/users', [async (ctx: AppCtx) => {
  const body = await ctx.request.body.json();
  ctx.response.status = 201;
  ctx.response.body = { created: true, body };
}]);

const METHODS: HTTPMethod[] = [
  'GET',
  'POST',
  'PUT',
  'DELETE',
  'PATCH',
  'HEAD',
  'OPTIONS',
];

// The adapter: one Oak middleware that consults RadRouter and runs
// the matched chain. Because both signatures are `(ctx, next) =>
// Promise<void>`, the bridge is just a chain runner.
const radHandler: AppMw = async (ctx, next) => {
  const path = ctx.request.url.pathname;
  const method = ctx.request.method as HTTPMethod;
  const match = router.find(method, path);

  if (!match) {
    const allowed = METHODS.filter((m) => router.find(m, path));
    if (allowed.length) {
      ctx.response.status = 405;
      ctx.response.headers.set('Allow', allowed.join(', '));
      ctx.response.body = 'Method Not Allowed';
    } else {
      await next(); // let Oak emit its default 404
    }
    return;
  }

  ctx.state.radParams = match.params;

  let i = 0;
  const run = async (): Promise<void> => {
    const mw = match.middlewares[i++];
    if (!mw) {
      await next();
      return;
    }
    await mw(ctx, run);
  };
  await run();
};

const app = new Application<AppState>();
app.use(radHandler);

console.log('listening on http://localhost:8080');
await app.listen({ port: 8080 });
