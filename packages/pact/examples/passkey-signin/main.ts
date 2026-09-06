/**
 * passkey-signin — passwordless sign-up and sign-in with passkeys, end
 * to end in a real browser: registration ceremony, identifier-first and
 * usernameless login, session mint, and the oak middleware guarding an
 * API route. Serves a single vanilla-JS page; no client library.
 *
 * Run: `deno run -A main.ts` (or `bun main.ts` / `node --import tsx main.ts`),
 * then open http://localhost:8736 in a browser with a passkey-capable
 * authenticator (Touch ID, Windows Hello, a phone, a security key).
 */
import process from 'node:process';
import { Application, Router } from '@oak/oak';
import { Pact, PactError } from '@tundralibs/pact';
import { failureResponse } from '@tundralibs/pact/middleware';
import { oakAuth } from '@tundralibs/pact/middleware/oak';
import { createUser, hooks, passkeyCount } from './store.ts';

const PORT = Number(process.env.PORT ?? 8736);

export const pact = Pact.create({
  bits: { READ: 1n },
  modulePermissions: { Notes: ['READ'] },
  hooks,
  options: {
    cache: { ttl: { session: 60 } }, // cache-only sessions for the demo
    passkeys: {
      rpId: 'localhost', // a secure context despite http
      rpName: 'Passkey Demo',
      origins: [`http://localhost:${PORT}`],
    },
  },
});

// Challenge stash between begin and finish — a real app uses a signed
// cookie or its session store; the demo is single-process. Entries are
// keyed by ceremony kind (and, for registration, the user the ceremony
// was begun for): the challenge is the ONLY thing binding a finish call
// to its begin, so an unkeyed stash would let anyone register a passkey
// onto any account.
type PendingCeremony = { kind: 'REG' | 'LOGIN'; userId?: string };
const pending = new Map<string, PendingCeremony>();
function stash(challenge: string, entry: PendingCeremony): void {
  pending.set(challenge, entry);
  setTimeout(() => pending.delete(challenge), 5 * 60_000);
}
function consume(challenge: unknown, kind: 'REG' | 'LOGIN'): PendingCeremony | null {
  if (typeof challenge !== 'string') return null;
  const entry = pending.get(challenge);
  if (entry === undefined || entry.kind !== kind) return null;
  pending.delete(challenge);
  return entry;
}

const router = new Router();

router.post('/signup', async (ctx) => {
  const { username } = await ctx.request.body.json();
  if (typeof username !== 'string' || username.trim() === '') {
    ctx.response.status = 400;
    ctx.response.body = { error: 'USERNAME_REQUIRED' };
    return;
  }
  const user = createUser(username.trim());
  if (user === null) {
    ctx.response.status = 409;
    ctx.response.body = { error: 'USERNAME_TAKEN' };
    return;
  }
  const begin = await pact.beginPasskeyRegistration(user.id, username.trim());
  stash(begin.challenge, { kind: 'REG', userId: user.id });
  ctx.response.body = { userId: user.id, options: begin.options };
});

router.post('/passkeys/finish', async (ctx) => {
  const { userId, response, challenge } = await ctx.request.body.json();
  const entry = consume(challenge, 'REG');
  // The stashed userId must match: a registration finish may only bind
  // the credential to the user its ceremony was begun for.
  if (entry === null || entry.userId !== userId) {
    ctx.response.status = 400;
    ctx.response.body = { error: 'UNKNOWN_CHALLENGE' };
    return;
  }
  const record = await pact.finishPasskeyRegistration(userId, response, {
    challenge,
  });
  ctx.response.body = {
    credentialId: record.id,
    passkeys: passkeyCount(userId),
  };
});

router.post('/login/begin', async (ctx) => {
  const { username } = await ctx.request.body.json();
  const begin = await pact.beginPasskeyLogin(
    typeof username === 'string' && username.trim() !== ''
      ? username.trim()
      : undefined,
  );
  stash(begin.challenge, { kind: 'LOGIN' });
  ctx.response.body = { options: begin.options };
});

router.post('/login/finish', async (ctx) => {
  const { response, challenge } = await ctx.request.body.json();
  if (consume(challenge, 'LOGIN') === null) {
    ctx.response.status = 400;
    ctx.response.body = { error: 'UNKNOWN_CHALLENGE' };
    return;
  }
  const result = await pact.finishPasskeyLogin(response, {
    challenge,
  });
  ctx.response.body = {
    token: result.session.token,
    user: result.principal.id,
    expiresAt: result.session.expiresAt.toISOString(),
  };
});

// A protected API route through the shipped middleware — the passkey
// session is an ordinary bearer token from here on.
router.get('/me', oakAuth(pact), (ctx) => {
  const auth = ctx.state.pact!;
  ctx.response.body = { id: auth.principal.id, via: auth.via };
});

router.get('/', (ctx) => {
  ctx.response.type = 'text/html';
  ctx.response.body = PAGE;
});

export const app = new Application<
  { pact?: Awaited<ReturnType<typeof pact.authenticate>> }
>();
app.use(async (ctx, next) => {
  try {
    await next();
  } catch (error) {
    // Registration failures are diagnostic (the caller is signed up /
    // authenticated) — surface them as a 400 with the reason.
    if (error instanceof PactError && error.code === 'PASSKEY_REGISTRATION_FAILED') {
      ctx.response.status = 400;
      ctx.response.body = { error: error.code, reason: error.message };
      return;
    }
    const failure = failureResponse(error);
    if (failure === null) console.error(error);
    ctx.response.status = failure?.status ?? 500;
    ctx.response.body = failure?.body ?? { error: 'INTERNAL' };
  }
});
app.use(router.routes());
app.use(router.allowedMethods());

// ── the demo page (vanilla JS, WebAuthn Level-3 JSON APIs) ──────────

const PAGE = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Passkey demo</title>
<style>
  body { font-family: system-ui; max-width: 40rem; margin: 3rem auto; }
  fieldset { margin-bottom: 1rem; border-radius: 8px; }
  pre { background: #f4f4f4; padding: .75rem; border-radius: 8px; white-space: pre-wrap; word-break: break-all; }
</style></head>
<body>
<h1>Passkey demo</h1>
<fieldset>
  <legend>1 — Sign up with a passkey</legend>
  <input id="signup-name" placeholder="username">
  <button onclick="signup()">Create account + passkey</button>
</fieldset>
<fieldset>
  <legend>2 — Sign in</legend>
  <input id="login-name" placeholder="username (leave empty for usernameless)">
  <button onclick="login()">Sign in with a passkey</button>
</fieldset>
<fieldset>
  <legend>3 — Call the API with the session</legend>
  <button onclick="me()">GET /me</button>
</fieldset>
<pre id="out">ready</pre>
<script>
const out = (v) => document.getElementById('out').textContent =
  typeof v === 'string' ? v : JSON.stringify(v, null, 2);
const post = (url, body) => fetch(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
}).then((r) => r.json());
let token;

async function signup() {
  const username = document.getElementById('signup-name').value;
  const { userId, options } = await post('/signup', { username });
  const credential = await navigator.credentials.create({
    publicKey: PublicKeyCredential.parseCreationOptionsFromJSON(options),
  });
  out(await post('/passkeys/finish', {
    userId,
    challenge: options.challenge,
    response: credential.toJSON(),
  }));
}

async function login() {
  const username = document.getElementById('login-name').value;
  const { options } = await post('/login/begin', { username });
  const credential = await navigator.credentials.get({
    publicKey: PublicKeyCredential.parseRequestOptionsFromJSON(options),
  });
  const result = await post('/login/finish', {
    challenge: options.challenge,
    response: credential.toJSON(),
  });
  token = result.token;
  out(result);
}

async function me() {
  const response = await fetch('/me', {
    headers: token ? { authorization: 'Bearer ' + token } : {},
  });
  out(await response.json());
}
</script>
</body>
</html>`;

if (import.meta.main) {
  app.addEventListener('listen', ({ port }) => {
    console.log(`passkey-signin on http://localhost:${port}`);
  });
  await app.listen({ port: PORT });
}
