/**
 * @fileoverview Minimal RadRouter demo — one typed middleware, two
 * routes, three lookups.
 *
 * Run:
 *   deno run packages/radrouter/examples/basic.ts
 */

import { RadRouter } from '../mod.ts';

// Application context flows through every middleware via the typed
// AppMw alias passed as the router's M parameter.
type AppCtx = {
  request: Request;
  state: { user?: string };
};
type AppMw = (ctx: AppCtx, next: () => Promise<void>) => Promise<void>;

const router = new RadRouter<AppMw>();

// Global middleware — runs first on every match.
router.use(async (ctx, next) => {
  ctx.state.user = ctx.request.headers.get('x-user') ?? undefined;
  await next();
});

// One static route + one parameterised route.
router.get('/health', [
  async (_ctx, next) => {
    console.log('health check');
    await next();
  },
]);

router.get('/users/:userId:', [
  async (ctx, next) => {
    // ctx.state.user came from the global middleware; the userId
    // capture is delivered alongside it via the match.
    console.log('viewer:', ctx.state.user);
    await next();
  },
]);

const cases = [
  { method: 'GET' as const, path: '/health' },
  { method: 'GET' as const, path: '/users/42' },
  { method: 'GET' as const, path: '/unknown' },
];

for (const c of cases) {
  const match = router.find(c.method, c.path);
  if (match) {
    console.log(
      `${c.method} ${c.path} → ${match.middlewares.length} mw, params=${
        JSON.stringify(match.params)
      }`,
    );
  } else {
    console.log(`${c.method} ${c.path} → no match`);
  }
}
