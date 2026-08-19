/**
 * The phase-1 rAPId example: a config-driven app assembling FUNCTIONS —
 * no modules, no decorators; the Oak-tier authoring surface. Shows the
 * full middleware engine: shipped middlewares, universal `use()`, the
 * transport-scoping sugar, route/command-scoped chains, `ctx.args`,
 * and the lazy `ctx.payload`. For decorated CLASSES mounted via
 * `app.module()` instead, see `modules.ts` in this same directory.
 *
 * Run (from the repo root):
 *
 * ```bash
 * GREETING_SOURCE=the-env deno run --allow-net --allow-read --allow-env \
 *   --allow-sys --allow-write packages/rapid/examples/main.ts
 * ```
 *
 * Try it:
 *
 * ```bash
 * curl -s localhost:3000/ | jq                      # route map
 * curl -s localhost:3000/hello/ada                  # params + file config + env interpolation
 * curl -si localhost:3000/visits                    # SHARE state counter + shipped middleware headers
 * curl -s -X POST localhost:3000/echo -H 'content-type: application/json' -d '{"a":1}'
 * curl -s 'localhost:3000/items?status=eq:open&price=gt:100&sort=name:desc&page=2&limit=5' | jq
 * curl -s localhost:3000/items -H 'x-page-number: 3' | jq '.paging'   # header paging, query overrides
 * curl -si localhost:3000/limited && curl -si localhost:3000/limited \
 *   && curl -si localhost:3000/limited                # third hit: 429 + retry-after
 * curl -si localhost:3000/slow                        # 504 RAPID_TIMEOUT (route-scoped deadline)
 * curl -si localhost:3000/admin                       # 403 (route middleware)
 * curl -si localhost:3000/admin -H 'x-admin: yes'     # 200
 * curl -si localhost:3000/visits -H 'origin: https://app.example'  # CORS + secure headers
 * curl -si localhost:3000/boom                        # DEVELOPMENT: real message + debug
 * curl -si localhost:3000/nope                        # 404 + x-request-id / x-correlation-id echo
 * ```
 *
 * Websocket (same port, rpc protocol on /ws — e.g. `@tundralibs/rpc`):
 *
 * ```typescript
 * const ws = new Client({ url: 'ws://localhost:3000/ws?team=blue' });
 * await ws.connect();
 * await ws.command('echo', { hi: 1 });      // + requestId echoed into the envelope
 * await ws.command('whoami');               // connection id + upgrade query
 * await ws.command('secret', {});           // RAPID_ACCESS_DENIED (command chain)
 * await ws.command('secret', { token: 'open-sesame' });
 * ```
 */

import { rapid } from '../mod.ts';
import { RapidError } from '../errors/mod.ts';
import {
  cors,
  onlyJOB,
  rateLimit,
  requestId,
  requestLogger,
  responseTimer,
  secureHeaders,
  timeout,
} from '../middlewares/mod.ts';
import type {
  RapidHTTPMiddleware,
  RapidMiddleware,
  RapidSOCKETMiddleware,
} from '../types/mod.ts';

// ── boot: options come from configs/Application.yaml; the second
//    argument is the state TEMPLATE (runtime data, not config) ─────────
const configDir = new URL('./configs', import.meta.url).pathname;
const app = await rapid(configDir, { visits: 0 });

// Lifecycle listeners register post-construction:
app.on('stop', () => app.log.info('goodbye'));

// ── the shipped middlewares: ONE registration each, EVERY transport.
//    Order = onion order (logger outermost sees the true total time).
app.use(
  requestLogger({ skip: (ctx) => ctx.action === 'GET /' }),
  responseTimer(), // x-response-time on HTTP; pair with stateKey off-HTTP
  secureHeaders(), // nosniff + frame DENY + no-referrer (HSTS/CSP opt-in)
  cors(), // wildcard by default; see /limited curl with an origin header
  requestId({ headers: ['x-correlation-id'], socketEcho: true }),
  timeout(5_000), // global safety net; /slow tightens it per-route
);

// ── a hand-rolled UNIVERSAL middleware: the ctx.type ladder style ────
const auditWrites: RapidMiddleware = async (ctx, next) => {
  await next();
  if (ctx.type === 'HTTP' && ctx.method !== 'GET') {
    ctx.app.log.info('write audited', {
      action: ctx.action,
      status: ctx.response?.status ?? 200,
    });
  }
};
app.use(auditWrites);

// ── transport-scoping sugar: this one only ever runs on job firings ──
app.use(onlyJOB(async (ctx, next) => {
  ctx.app.log.debug('job starting', { job: ctx.action, drift: ctx.drift });
  await next();
}));

// ── a route-scoped guard (middleware chain, handler LAST) ────────────
const requireAdmin: RapidHTTPMiddleware = async (ctx, next) => {
  if (ctx.headers.get('x-admin') !== 'yes') {
    throw new RapidError('RAPID_ACCESS_DENIED', {
      details: { hint: 'send x-admin: yes' },
    });
  }
  await next();
};

// ── routes: return-style OR ctx-style — same payload model ───────────
app.get('/', () => ({
  content: {
    routes: [
      '/hello/:name:',
      '/visits',
      '/echo (POST)',
      '/items?status=eq:open&sort=name:desc&page=2',
      '/limited',
      '/slow',
      '/admin',
      '/boom',
    ],
  },
}));

app.get('/hello/:name:', (ctx) => ({
  content: {
    // file config (env-interpolated) read straight off the app:
    message: `${ctx.app.config.get('messages.greeting')}, ${
      ctx.params['name']
    }!`,
    route: ctx.action, // the MATCHED pattern: "GET /hello/:name:"
  },
}));

app.get('/visits', (ctx) => {
  // stateMode SHARE (from the config file): one bag across requests.
  const state = ctx.state as { visits: number };
  state.visits += 1;
  ctx.response = { status: 200, content: { visits: state.visits } };
});

app.post('/echo', async (ctx) => ({
  // ctx.payload: lazy, parse-once, byte-capped (see server.maxBodySize).
  content: { received: await ctx.payload },
}));

// ctx.args — the uniform invocation arguments: route params, the parsed
// query grammar ($op filters + sorting), and dual-source paging
// (x-page-number/x-page-size headers, query params override).
app.get('/items', (ctx) => ({
  content: {
    filters: ctx.args.query.filters, // e.g. status=eq:open → {$eq:'open'}
    sorting: ctx.args.query.sorting, // e.g. sort=name:desc
    paging: ctx.args.paging, // caps/defaults from server.paging
  },
}));

// Universal middleware fit route chains too — a per-route budget:
app.get('/limited', rateLimit({ max: 2, windowMs: 30_000 }), () => ({
  content: { scarce: true },
}));

// Route-scoped deadline TIGHTER than the global one:
app.get('/slow', timeout(150), async () => {
  await new Promise((resolve) => setTimeout(resolve, 2_000));
  return { content: 'you will never see this' };
});

app.get('/admin', requireAdmin, () => ({ content: { secret: 'plans' } }));

app.get('/boom', () => {
  throw new Error('the demo explosion');
});

// ── jobs: same app, same middleware onion, the trigger triad ─────────
app.job('heartbeat', '* * * * *', (ctx) => {
  ctx.app.log.info('heartbeat', { count: ctx.tick.count });
  return { content: { ok: true } };
});
// Registration-default args; `app.triggerJob('daily-report', { scope:
// 'adhoc' })` would override per firing (ctx.args.params carries them).
app.job('daily-report', '0 6 * * *', (ctx) => ({
  content: { reported: true, scope: ctx.args.params['scope'] },
}), { args: { scope: 'daily' } });

// ── websocket commands: same app, same port, rpc protocol on /ws ────
app.socket('echo', (ctx) => ({
  // requestId({ socketEcho }) adds the correlation id to this envelope.
  content: { echo: ctx.payload, connection: ctx.connectionId },
}));

app.socket('visits', (ctx) => {
  // The SAME shared state bag the HTTP routes use (stateMode: SHARE).
  const state = ctx.state as { visits: number };
  return { content: { visits: state.visits } };
});

// ctx.connection: upgrade-time scope (id + upgrade URL query + headers)
// — connect as ws://localhost:3000/ws?team=blue and see it here.
app.socket('whoami', (ctx) => ({
  content: { connection: ctx.connectionId, upgrade: ctx.connection.query },
}));

// A COMMAND-SCOPED chain (route() grammar): guard first, handler last.
const requireToken: RapidSOCKETMiddleware = async (ctx, next) => {
  if (ctx.args.params['token'] !== 'open-sesame') {
    throw new RapidError('RAPID_ACCESS_DENIED', {
      details: { hint: "send { token: 'open-sesame' }" },
    });
  }
  await next();
};
app.socket('secret', requireToken, () => ({
  content: { secret: 'plans' },
}));

await app.start();
app.log.info(`try: curl -s localhost:${app.port}/hello/ada`);
