/**
 * Orbit — a small project-management API showing a complete pact
 * integration over oak (runs on Deno, Bun, and Node):
 *
 * - auth guard MIDDLEWARE: header → PactCredential → authenticate
 * - error boundary: the mechanical PactError → 401/403/409/500 mapping
 * - routes: register/activate, login/logout, password reset, API keys,
 *   MFA, OAuth redirect, and permission-gated resources
 * - audit trail: every pact event captured via listeners
 *
 * Run: `deno run -A main.ts` (or `bun main.ts` /
 * `node --import tsx main.ts` — Node without import.meta.main support
 * only builds the app; see the listen guard at the bottom).
 */

// Needs a separate install: deno add @oak/oak
import { Application, type Middleware, Router } from '@oak/oak';
import {
  PACT_AUTH_FAILURE_CODES,
  Pact,
  type PactAuthContext,
  type PactCredential,
  PactError,
  serializeGrants,
} from '@tundralibs/pact';
import {
  activateUser,
  hooks,
  identifierOf,
  keyOwner,
  setGrants,
  setMfaSecret,
} from './store.ts';

// ── the pact instance ───────────────────────────────────────────────

const BITS = { READ: 1n, CREATE: 2n, EDIT: 4n, DELETE: 8n } as const;

export const pact = Pact.create({
  bits: BITS,
  modulePermissions: {
    Projects: ['READ', 'CREATE', 'EDIT', 'DELETE'],
    Billing: ['READ', 'EDIT'],
  },
  // The instance name roots the cache namespace (`orbit__principal`, …)
  // so two apps on one shared Redis can never read each other's grants.
  name: 'orbit',
  activeStatuses: ['ACTIVE'],
  hooks,
  options: {
    // JWT sessions: short access tokens rotated via /refresh, with
    // reuse detection killing a stolen family.
    session: {
      ttl: 60, // access-token lifetime (minutes)
      strategy: 'JWT',
      secret: 'orbit-demo-signing-secret-at-least-32ch', // env/KMS in reality
      refresh: { ttl: 1_440, grace: 30 },
    },
    // Caching is OPT-IN — without this block every check hits store.ts.
    // cache: { ttl: { principal: 15, apiKey: 5, session: 5 } },
    oauth: {
      google: {
        kind: 'GOOGLE',
        clientId: 'demo-client-id', // real credentials via env/KMS
        clientSecret: 'demo-client-secret',
        redirectUri: 'http://localhost:8734/auth/google/callback',
        autoProvision: true,
      },
    },
  },
});

type Modules = 'Projects' | 'Billing';

// ── audit trail: the events seam ────────────────────────────────────

export const audit: { at: string; event: string; detail: unknown[] }[] = [];
const record = (event: string) => (...detail: unknown[]) => {
  audit.push({ at: new Date().toISOString(), event, detail });
};
pact.on('login', (principal, method) => record('login')(principal.id, method));
pact.on('loginFailed', record('loginFailed'));
pact.on('logout', record('logout'));
pact.on('authenticateFailed', record('authenticateFailed'));
pact.on('idTokenUnverified', record('idTokenUnverified'));

// ── middleware ──────────────────────────────────────────────────────

type AppState = { auth?: PactAuthContext<Modules> };

export const app = new Application<AppState>();

// Error boundary: the mechanical mapping an adapter provides. Codes in
// PACT_AUTH_FAILURE_CODES are 401s, PERMISSION_DENIED is the authz 403,
// USER_EXISTS is a 409 — anything else is a real 500.
app.use(async (ctx, next) => {
  try {
    await next();
  } catch (error) {
    if (error instanceof PactError) {
      if (PACT_AUTH_FAILURE_CODES.has(error.code)) {
        ctx.response.status = 401;
        ctx.response.body = { error: error.code };
        return;
      }
      if (error.code === 'PERMISSION_DENIED') {
        ctx.response.status = 403;
        ctx.response.body = { error: error.code };
        return;
      }
      if (error.code === 'USER_EXISTS') {
        ctx.response.status = 409;
        ctx.response.body = { error: error.code };
        return;
      }
    }
    console.error(error);
    ctx.response.status = 500;
    ctx.response.body = { error: 'INTERNAL' };
  }
});

/** Transport extraction — the half pact deliberately does not do. */
function extractCredential(
  headers: Headers,
  method: string,
  path: string,
): PactCredential | null {
  const auth = headers.get('authorization');
  if (auth?.startsWith('Bearer ')) {
    return { scheme: 'BEARER', token: auth.slice(7) };
  }
  if (auth?.startsWith('Basic ')) {
    const [identifier, password] = atob(auth.slice(6)).split(':', 2);
    if (identifier === undefined || password === undefined) return null;
    return { scheme: 'BASIC', identifier, password };
  }
  if (auth?.startsWith('ApiKey ')) {
    const [keyId, secret] = auth.slice(7).split(':', 2);
    if (keyId === undefined || secret === undefined) return null;
    return { scheme: 'APIKEY', keyId, secret };
  }
  const keyId = headers.get('x-key-id');
  const signature = headers.get('x-signature');
  if (keyId !== null && signature !== null) {
    // The canonicalization CONTRACT between client and server — pact
    // never guesses which bytes are signed.
    return { scheme: 'HMAC', keyId, signature, payload: `${method} ${path}` };
  }
  return null;
}

/** The session/validation middleware. */
const authGuard: Middleware<AppState> = async (ctx, next) => {
  const credential = extractCredential(
    ctx.request.headers,
    ctx.request.method,
    ctx.request.url.pathname,
  );
  if (credential === null) {
    ctx.response.status = 401;
    ctx.response.body = { error: 'NO_CREDENTIALS' };
    return;
  }
  ctx.state.auth = await pact.authenticate(credential); // throws → boundary
  await next();
};

// ── routes ──────────────────────────────────────────────────────────

const router = new Router<AppState>();

router.post('/register', async (ctx) => {
  // Real apps validate shape/policy here (guardian at the boundary).
  const { email, password } = await ctx.request.body.json();
  const user = await pact.register({
    identifier: email,
    password,
    status: 'PENDING', // activation flips it — see /activate
    grants: { Projects: BITS.READ | BITS.CREATE },
  });
  ctx.response.status = 201;
  ctx.response.body = { id: user.id, status: user.status };
});

// Demo stand-in for an email-verification link.
router.post('/activate', async (ctx) => {
  const { userId } = await ctx.request.body.json();
  ctx.response.status = activateUser(userId) ? 200 : 404;
  ctx.response.body = {};
});

router.post('/login', async (ctx) => {
  const { email, password } = await ctx.request.body.json();
  const result = await pact.login({ identifier: email, password });
  ctx.response.body = {
    token: result.session.token,
    refreshToken: result.session.refreshToken,
    expiresAt: result.session.expiresAt.toISOString(),
  };
});

router.post('/refresh', async (ctx) => {
  const { refreshToken } = await ctx.request.body.json();
  const result = await pact.refresh(refreshToken);
  ctx.response.body = {
    token: result.session.token,
    refreshToken: result.session.refreshToken,
    expiresAt: result.session.expiresAt.toISOString(),
  };
});

router.post('/logout', async (ctx) => {
  const auth = ctx.request.headers.get('authorization') ?? '';
  if (auth.startsWith('Bearer ')) await pact.logout(auth.slice(7));
  ctx.response.status = 204;
});

router.post('/password-reset', async (ctx) => {
  const { email } = await ctx.request.body.json();
  const reset = await pact.requestPasswordReset(email);
  // Deliver out-of-band in reality — returned here so the demo can run.
  ctx.response.status = 202;
  ctx.response.body = reset === null ? {} : { token: reset.token };
});

router.post('/password-reset/complete', async (ctx) => {
  const { token, password } = await ctx.request.body.json();
  const ok = await pact.resetPassword(token, password);
  ctx.response.status = ok ? 200 : 400;
  ctx.response.body = { ok };
});

// Introspection: who am I, how did I authenticate, what may I do —
// the bound principal drives the per-module permission map with no
// store round-trips (authenticate already resolved the grants).
router.get('/me', authGuard, async (ctx) => {
  const { principal, via, sessionId } = ctx.state.auth!;
  const permissions: Record<string, string[]> = {};
  for (const module of pact.modules) {
    const names: string[] = [];
    for (const name of pact.getModulePermissions(module)) {
      if (await principal.hasPermission(module, name)) {
        names.push(String(name));
      }
    }
    permissions[module] = names;
  }
  ctx.response.body = { id: principal.id, kind: principal.kind, via, sessionId, permissions };
});

// Grants issuance is the app's write; pact is told to forget the
// cached principal so the change is immediate even with caching on.
router.patch('/users/:id/grants', authGuard, async (ctx) => {
  await ctx.state.auth!.principal.assert('Billing', 'EDIT');
  const body = await ctx.request.body.json() as Record<string, string[]>;
  const masks: Partial<Record<Modules, bigint>> = {};
  for (const [module, names] of Object.entries(body)) {
    // Validate request-supplied names — an unknown name would reduce
    // with `undefined` and 500; an unknown module would store dead
    // grants.
    if (!(pact.modules as readonly string[]).includes(module)) {
      ctx.response.status = 400;
      ctx.response.body = { error: 'UNKNOWN_MODULE', module };
      return;
    }
    let mask = 0n;
    for (const name of names) {
      const bit = BITS[name as keyof typeof BITS];
      if (bit === undefined) {
        ctx.response.status = 400;
        ctx.response.body = { error: 'UNKNOWN_PERMISSION', name };
        return;
      }
      mask |= bit;
    }
    masks[module as Modules] = mask;
  }
  if (!setGrants(ctx.params.id, serializeGrants(masks))) {
    ctx.response.status = 404;
    ctx.response.body = {};
    return;
  }
  await pact.invalidatePrincipal(ctx.params.id);
  ctx.response.status = 204;
});

// Change own password: hashes, evicts the principal, ends sessions.
router.post('/password', authGuard, async (ctx) => {
  const { password } = await ctx.request.body.json();
  await pact.setPassword(ctx.state.auth!.principal.id, password);
  ctx.response.status = 204;
});

router.post('/logout-all', authGuard, async (ctx) => {
  await pact.logoutAll(ctx.state.auth!.principal.id);
  ctx.response.status = 204;
});

router.get('/projects', authGuard, async (ctx) => {
  await ctx.state.auth!.principal.assert('Projects', 'READ');
  ctx.response.body = { projects: ['orbit-launch'], via: ctx.state.auth!.via };
});

router.post('/projects', authGuard, async (ctx) => {
  await ctx.state.auth!.principal.assert('Projects', 'CREATE');
  ctx.response.status = 201;
  ctx.response.body = { created: true };
});

router.get('/billing', authGuard, async (ctx) => {
  await ctx.state.auth!.principal.assert('Billing', 'READ');
  ctx.response.body = { invoices: [] };
});

router.post('/keys', authGuard, async (ctx) => {
  const pair = await pact.issueApiKey({
    userId: ctx.state.auth!.principal.id,
    grants: { Projects: BITS.READ },
  });
  // Shown once — pact stores no retrievable copy of the plain pair.
  ctx.response.status = 201;
  ctx.response.body = pair;
});

router.delete('/keys/:id', authGuard, async (ctx) => {
  // Ownership check — anyone-can-revoke-any-key would be a DoS lever.
  // 404 (not 403) so key ids can't be enumerated.
  if (keyOwner(ctx.params.id) !== ctx.state.auth!.principal.id) {
    ctx.response.status = 404;
    ctx.response.body = {};
    return;
  }
  await pact.revokeApiKey(ctx.params.id);
  ctx.response.status = 204;
});

router.post('/mfa/enroll', authGuard, async (ctx) => {
  const userId = ctx.state.auth!.principal.id;
  const seed = pact.generateMFASecret();
  await setMfaSecret(userId, seed);
  ctx.response.body = {
    secret: seed,
    url: pact.generateMFAAuthURL(
      seed,
      identifierOf(userId) ?? userId,
      'Orbit',
    ),
  };
});

router.post('/mfa/verify', authGuard, async (ctx) => {
  const { code } = await ctx.request.body.json();
  ctx.response.body = {
    verified: await pact.verifyMFA(ctx.state.auth!.principal.id, code),
  };
});

router.get('/auth/google', async (ctx) => {
  const redirect = await pact.oauthRedirect('google');
  // Stow the transient state — pact holds nothing between the calls.
  await ctx.cookies.set(
    'oauth_flow',
    JSON.stringify({
      state: redirect.state,
      codeVerifier: redirect.codeVerifier,
      nonce: redirect.nonce,
    }),
    { httpOnly: true, sameSite: 'lax' },
  );
  ctx.response.redirect(redirect.url);
});

router.get('/auth/google/callback', async (ctx) => {
  const stowed = await ctx.cookies.get('oauth_flow');
  const code = ctx.request.url.searchParams.get('code');
  const state = ctx.request.url.searchParams.get('state') ?? undefined;
  if (stowed === undefined || code === null) {
    ctx.response.status = 400;
    ctx.response.body = { error: 'MISSING_FLOW_STATE' };
    return;
  }
  const expected = JSON.parse(stowed) as {
    state: string;
    codeVerifier: string;
    nonce?: string;
  };
  // Needs REAL Google credentials configured above to complete.
  const result = await pact.oauthLogin('google', { code, state }, expected);
  ctx.response.body = {
    token: result.session.token,
    profile: { id: result.profile.id, email: result.profile.email },
  };
});

router.get('/audit', authGuard, async (ctx) => {
  // The auditor needs Billing access — regular users get the 403 demo.
  await ctx.state.auth!.principal.assert('Billing', 'READ');
  ctx.response.body = { audit };
});

app.use(router.routes());
app.use(router.allowedMethods());

// ── boot ────────────────────────────────────────────────────────────

/** Seed an admin (ACTIVE, all grants) so /audit is reachable. */
export async function seedAdmin(): Promise<string> {
  const admin = await pact.register({
    identifier: 'admin@orbit.dev',
    password: 'admin-pass-1',
    status: 'ACTIVE',
    grants: {
      Projects: BITS.READ | BITS.CREATE | BITS.EDIT | BITS.DELETE,
      Billing: BITS.READ | BITS.EDIT,
    },
  });
  return admin.id;
}

if ((import.meta as { main?: boolean }).main === true) {
  await seedAdmin();
  const port = 8734;
  console.log(`Orbit listening on http://localhost:${port}`);
  await app.listen({ port });
}
