/**
 * @fileoverview The HTTP-context binders on the module path: cookie() binds an
 * inbound cookie, auth() binds the ctx.auth bag, session() binds the request
 * session — each into a decorated method param, extracted at mount time.
 * @module
 */
import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { Application } from './Application.ts';
import { auth, cookie, GET, Module, session } from './decorators/mod.ts';
import { session as sessionMw } from './middlewares/session.ts';
import type { RapidSession } from './middlewares/session.ts';
import type { RapidContextResponse } from './types/mod.ts';

@Module('Binders', {})
class Binders {
  @GET('/cookie', { bind: [cookie('theme')] })
  readCookie(theme: string | null): RapidContextResponse {
    return { content: { theme } };
  }

  @GET('/auth', { bind: [auth()] })
  readAuth(a: Record<string, unknown> | undefined): RapidContextResponse {
    return { content: { user: (a?.userId as string | undefined) ?? null } };
  }

  @GET('/session', { bind: [session()] })
  readSession(s: RapidSession | undefined): RapidContextResponse {
    if (s) s.set('seen', (s.get<number>('seen') ?? 0) + 1);
    return { content: { seen: s?.get<number>('seen') ?? null } };
  }
}

const make = () =>
  Application.initialize({
    name: 'binders',
    secret: 'test-secret-0123456789-abcdefghijklmnop',
    server: { port: 0, hostname: '127.0.0.1' },
    logger: { handlers: [] },
  });

describe('rapid module binders (cookie / auth / session)', () => {
  it('cookie() binds an inbound cookie to a method param', async () => {
    const app = await make();
    app.module(new Binders());
    const r = await app.fetch(
      new Request('http://app/cookie', { headers: { cookie: 'theme=dark' } }),
    );
    asserts.assertEquals((await r.json()).theme, 'dark');
    // Absent cookie → null (the pinned type).
    const r2 = await app.fetch(new Request('http://app/cookie'));
    asserts.assertEquals((await r2.json()).theme, null);
  });

  it('auth() binds the ctx.auth bag set by an upstream middleware', async () => {
    const app = await make();
    app.use((ctx, next) => {
      if (ctx.type === 'HTTP') ctx.setAuth({ userId: 'u1' });
      return next();
    });
    app.module(new Binders());
    const r = await app.fetch(new Request('http://app/auth'));
    asserts.assertEquals((await r.json()).user, 'u1');
  });

  it('session() binds the request session', async () => {
    const app = await make();
    app.use(sessionMw({ secure: false }));
    app.module(new Binders());
    const r = await app.fetch(new Request('http://app/session'));
    asserts.assertEquals((await r.json()).seen, 1);
  });
});
