/**
 * @fileoverview authenticate + authorize — over app.fetch (no ports).
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { Application } from '../Application.ts';
import { authenticate, authorize } from './auth.ts';
import { initModules, RapidModule, Use } from '../modules/mod.ts';
import { RapidError } from '../errors/mod.ts';

const make = () =>
  Application.initialize({
    name: 'auth-test',
    server: { port: 0, hostname: '127.0.0.1' },
    logger: { handlers: [] },
    uploads: { path: '/tmp/rapid-auth-test' },
  });

// A trivial token → identity map standing in for verify().
const verify = (token: string) =>
  token === 'ada' ? { id: 'ada', role: 'editor' } : null;

describe('rapid.middlewares.auth', () => {
  it('authenticate fills ctx.auth from a bearer token; anonymous flows through', async () => {
    const app = await make();
    app.use(authenticate({ verify }));
    app.get('/me', (ctx) => ({ content: { auth: ctx.auth ?? null } }));
    const ok = await (await app.fetch(
      new Request('http://app/me', {
        headers: { authorization: 'Bearer ada' },
      }),
    )).json();
    asserts.assertEquals(ok.auth, { id: 'ada', role: 'editor' });
    const anon = await (await app.fetch(new Request('http://app/me'))).json();
    asserts.assertEquals(anon.auth, null);
    await app.stop();
  });

  it('authorize: 401 anonymous, 200 authenticated, 403 when the check fails', async () => {
    const app = await make();
    app.use(
      authenticate({
        verify: (t) => t === 'ada' ? { id: 'ada', grants: { Post: 3n } } : null,
      }),
    );
    app.get(
      '/whoami',
      authorize(),
      (ctx) => ({ content: (ctx.auth as { id: string }).id }),
    );
    app.get(
      '/edit',
      authorize((auth) =>
        ((auth as { grants: Record<string, bigint> }).grants.Post ?? 0n) >= 2n
      ),
      () => ({ content: 'edited' }),
    );
    asserts.assertEquals(
      (await app.fetch(new Request('http://app/whoami'))).status,
      401,
    );
    const auth = { headers: { authorization: 'Bearer ada' } };
    asserts.assertEquals(
      await (await app.fetch(new Request('http://app/whoami', auth))).text(),
      'ada',
    );
    asserts.assertEquals(
      await (await app.fetch(new Request('http://app/edit', auth))).text(),
      'edited',
    );
    // a user whose grant is too low → 403
    const low = { headers: { authorization: 'Bearer ada' } };
    await app.stop();
    // separate app with a denying check
    const app2 = await make();
    app2.use(authenticate({ verify }));
    app2.get(
      '/edit',
      authorize(() => false),
      () => ({ content: 'x' }),
    );
    asserts.assertEquals(
      (await app2.fetch(new Request('http://app/edit', low))).status,
      403,
    );
    await app2.stop();
  });

  it('setAuth is once-only', async () => {
    const app = await make();
    app.use(authenticate({ verify }));
    app.use((ctx, next) => {
      // a second write is refused
      if (ctx.auth) {
        try {
          ctx.setAuth({ id: 'evil' });
        } catch {
          if (ctx.type === 'HTTP') ctx.setHeader('x-setauth', 'refused');
        }
      }
      return next();
    });
    app.get('/x', () => ({ content: 'ok' }));
    const r = await app.fetch(
      new Request('http://app/x', { headers: { authorization: 'Bearer ada' } }),
    );
    asserts.assertEquals(r.headers.get('x-setauth'), 'refused');
    await app.stop();
  });
  it('auth rides the module invoke seed — a module @Use guard reads it', async () => {
    class Secure extends RapidModule {
      readonly name = 'Secure';
      readonly namespace = 'secure';
      protected readonly events = {};
      @Use((ctx, next) => {
        if (ctx.auth === undefined) {
          throw new RapidError('RAPID_UNAUTHENTICATED');
        }
        return next();
      })
      secret() {
        return { who: (this.constructor as { name: string }).name };
      }
    }
    const { runtime } = await initModules(
      { name: 'auth-invoke', logger: { handlers: [] } },
      { modules: [{ Secure }] },
    );
    // no auth in the seed → the guard denies → 401 envelope
    asserts.assertEquals(
      (await runtime.invoke(Secure, 'secret', [])).status,
      401,
    );
    // auth flows in via the seed → 200
    const ok = await runtime.invoke(Secure, 'secret', [], {
      auth: { id: 'ada' },
    });
    asserts.assertEquals(ok.status, 200);
    await runtime.dispose();
  });
});
