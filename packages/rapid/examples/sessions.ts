/**
 * @fileoverview Sessions + CSRF — an anonymous cart that survives login (the
 * session id is regenerated on login for fixation safety, the data carried
 * over), logout, and a CSRF-protected mutation. Driven over `app.fetch` with a
 * tiny cookie jar so it runs with no port.
 *
 * Run: `deno run -A packages/rapid/examples/sessions.ts`
 * @module
 */
import { Application, csrf, getSession, session } from '../mod.ts';

const app = new Application({
  name: 'sessions-example',
  mode: 'DEVELOPMENT',
  server: { port: 0, hostname: '127.0.0.1' },
  logger: { handlers: [] },
});

// This demo talks http://app, so Secure is off. In production drop `secure`
// (it defaults to true) and serve over HTTPS.
app.use(session({ secret: 'demo-session-secret', secure: false }));
app.use(csrf({ secret: 'demo-csrf-secret', secure: false }));

app.get('/me', (ctx) => {
  const s = getSession(ctx)!;
  return {
    content: {
      userId: s.get<string>('userId') ?? null,
      cart: s.get<string[]>('cart') ?? [],
    },
  };
});

app.post('/cart/add/:item:', (ctx) => {
  const s = getSession(ctx)!;
  const cart = s.get<string[]>('cart') ?? [];
  cart.push(ctx.params.item);
  s.set('cart', cart); // persists to the session store
  return { content: { cart } };
});

app.post('/login', (ctx) => {
  const s = getSession(ctx)!;
  s.regenerate(); // new id (fixation-safe); the anonymous cart carries over
  s.set('userId', 'user-42');
  return { content: { ok: true } };
});

app.post('/logout', (ctx) => {
  getSession(ctx)!.destroy();
  return { content: { ok: true } };
});

// --- drive it with a cookie jar (no port) ---------------------------------
const jar = new Map<string, string>();
const call = async (
  method: string,
  path: string,
  extra: Record<string, string> = {},
) => {
  const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  const res = await app.fetch(
    new Request(`http://app${path}`, {
      method,
      headers: { ...(cookie ? { cookie } : {}), ...extra },
    }),
  );
  for (const c of res.headers.getSetCookie()) {
    const pair = c.slice(0, c.indexOf(';') === -1 ? undefined : c.indexOf(';'));
    const eq = pair.indexOf('=');
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
  return res;
};
// The app's own JS mirrors the csrf cookie into the header on every mutation.
const withCsrf = () => ({ 'x-csrf-token': jar.get('csrf') ?? '' });

const show = async (label: string, res: Response) =>
  console.log(label, res.status, await res.json().catch(() => '(no body)'));

// 1. First visit — issues session + csrf cookies; cart is empty.
await show('GET  /me            ', await call('GET', '/me'));

// 2. Add to cart while anonymous (CSRF token required on the POST).
await show(
  'POST /cart/add/apple',
  await call('POST', '/cart/add/apple', withCsrf()),
);
await show(
  'POST /cart/add/pear ',
  await call('POST', '/cart/add/pear', withCsrf()),
);

// 3. A CSRF-less mutation is rejected (403).
await show('POST (no csrf)      ', await call('POST', '/cart/add/hack'));

// 4. Log in — id rotates, the anonymous cart survives.
await show('POST /login         ', await call('POST', '/login', withCsrf()));
await show('GET  /me (post-login)', await call('GET', '/me'));

// 5. Log out — session cleared.
await show('POST /logout        ', await call('POST', '/logout', withCsrf()));
await show('GET  /me (post-logout)', await call('GET', '/me'));
