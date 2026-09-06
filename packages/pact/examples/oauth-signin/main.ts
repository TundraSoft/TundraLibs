/**
 * oauth-signin — a minimal "sign in with Google/GitHub" API on oak,
 * using pact's OAuth client, cache-only sessions, and the shipped oak
 * middleware. Configure providers via environment variables (see the
 * README); the app boots either way and lists what is configured.
 *
 * Run: `deno run -A main.ts` (or `bun main.ts` / `node --import tsx main.ts`).
 */
import process from 'node:process';
import { Application, Router } from '@oak/oak';
import {
  Pact,
  type PactOAuthProviderConfig,
  type PactOAuthRedirect,
} from '@tundralibs/pact';
import { failureResponse } from '@tundralibs/pact/middleware';
import { oakAuth, oakGuard } from '@tundralibs/pact/middleware/oak';
import { PactError } from '@tundralibs/pact/errors';
import { hooks } from './store.ts';

const PORT = Number(process.env.PORT ?? 8735);

// ── providers from the environment ──────────────────────────────────

const oauth: Record<string, PactOAuthProviderConfig> = {};
if (
  process.env.GOOGLE_CLIENT_ID !== undefined &&
  process.env.GOOGLE_CLIENT_SECRET !== undefined
) {
  oauth.google = {
    kind: 'GOOGLE',
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: `http://localhost:${PORT}/auth/google/callback`,
    autoProvision: true,
  };
}
if (
  process.env.GITHUB_CLIENT_ID !== undefined &&
  process.env.GITHUB_CLIENT_SECRET !== undefined
) {
  oauth.github = {
    kind: 'GITHUB',
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    redirectUri: `http://localhost:${PORT}/auth/github/callback`,
    autoProvision: true,
  };
}

// ── the pact instance ───────────────────────────────────────────────

export const pact = Pact.create({
  bits: { READ: 1n, WRITE: 2n },
  modulePermissions: { Notes: ['READ', 'WRITE'] },
  hooks,
  options: {
    // Cache-only sessions: no session hooks needed for a demo — the
    // session cache is the store (single process, MEMORY engine).
    cache: { ttl: { session: 60 } },
    ...(Object.keys(oauth).length > 0 ? { oauth } : {}),
  },
});

// The state/PKCE material between redirect and callback. A real app
// stows this in a signed cookie or its session store.
const pending = new Map<string, PactOAuthRedirect>();

// ── routes ──────────────────────────────────────────────────────────

const router = new Router();

router.get('/', (ctx) => {
  const providers = Object.keys(oauth);
  ctx.response.body = providers.length === 0
    ? { hint: 'no providers configured — see README for the env variables' }
    : { signIn: providers.map((name) => `/auth/${name}`) };
});

router.get('/auth/:provider', async (ctx) => {
  const redirect = await pact.oauthRedirect(ctx.params.provider);
  pending.set(redirect.state, redirect);
  setTimeout(() => pending.delete(redirect.state), 10 * 60_000);
  ctx.response.redirect(redirect.url);
});

router.get('/auth/:provider/callback', async (ctx) => {
  const query = ctx.request.url.searchParams;
  const state = query.get('state') ?? '';
  const expected = pending.get(state);
  if (expected === undefined) {
    ctx.response.status = 400;
    ctx.response.body = { error: 'UNKNOWN_STATE' };
    return;
  }
  pending.delete(state);
  const denied = query.get('error');
  if (denied !== null) {
    ctx.response.status = 400;
    ctx.response.body = { error: denied };
    return;
  }
  const result = await pact.oauthLogin(ctx.params.provider, {
    code: query.get('code') ?? '',
    state,
  }, expected);
  ctx.response.body = {
    // A real app would set a cookie; the demo hands the token over for
    // use as `Authorization: Bearer <token>`.
    token: result.session.token,
    expiresAt: result.session.expiresAt.toISOString(),
    user: {
      id: result.principal.id,
      name: result.profile.name,
      email: result.profile.email,
    },
  };
});

// Protected routes via the shipped middleware.
router.get('/me', oakAuth(pact), (ctx) => {
  const auth = ctx.state.pact!;
  ctx.response.body = { id: auth.principal.id, via: auth.via };
});

router.get(
  '/notes',
  oakAuth(pact),
  oakGuard('Notes', 'READ') as Parameters<Router['get']>[2],
  (ctx) => {
    ctx.response.body = { notes: ['pact ships its own middleware now'] };
  },
);

// ── app ─────────────────────────────────────────────────────────────

type AppState = { pact?: Awaited<ReturnType<typeof pact.authenticate>> };
export const app = new Application<AppState>();
app.use(async (ctx, next) => {
  try {
    await next();
  } catch (error) {
    if (error instanceof PactError && error.code === 'UNKNOWN_PROVIDER') {
      ctx.response.status = 404;
      ctx.response.body = { error: error.code };
      return;
    }
    // The middleware core's mapping doubles as the app error boundary.
    const failure = failureResponse(error);
    if (failure === null) console.error(error);
    ctx.response.status = failure?.status ?? 500;
    ctx.response.body = failure?.body ?? { error: 'INTERNAL' };
  }
});
app.use(router.routes());
app.use(router.allowedMethods());

if (import.meta.main) {
  app.addEventListener('listen', ({ port }) => {
    console.log(`oauth-signin on http://localhost:${port}`);
    console.log(`providers: ${Object.keys(oauth).join(', ') || '(none)'}`);
  });
  await app.listen({ port: PORT });
}
