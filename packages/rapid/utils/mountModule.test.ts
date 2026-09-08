/**
 * @fileoverview mountModule — a transport-invoked RapidModule method is the
 * PARENT of the invocations it makes (the request's identity reaches a
 * nested `@Use` guard), and a RapidModule cannot be mounted without its
 * runtime.
 * @module
 */
import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { Application } from '../Application.ts';
import { GET, JOB, Module, param, SOCKET } from '../decorators/mod.ts';
import { RapidError } from '../errors/mod.ts';
import type {
  RapidContextResponse,
  RapidHTTPMiddleware,
  RapidMiddleware,
} from '../types/mod.ts';
import {
  RapidModule,
  type RapidModuleInvokeMiddleware,
  Use,
} from '../modules/mod.ts';

const EVENTS = {};

describe('rapid.utils.mountModule', () => {
  it('this.invoke() from a route method inherits the request identity — an auth-aware @Use guard sees ctx.auth', async () => {
    let seen: { auth?: Record<string, unknown>; requestId: string } | undefined;
    const observe: RapidModuleInvokeMiddleware = (ctx, next) => {
      seen = { auth: ctx.auth, requestId: ctx.requestId };
      return next();
    };
    class Orders extends RapidModule<typeof EVENTS> {
      readonly name = 'Orders';
      readonly namespace = 'shop';
      protected readonly events = EVENTS;
      @Use(observe)
      create(n: number) {
        return { id: n };
      }
    }
    class Shop extends RapidModule<typeof EVENTS> {
      readonly name = 'Shop';
      readonly namespace = 'shop';
      protected readonly events = EVENTS;
      @GET('/buy')
      async buy() {
        const out = await this.invoke(Orders, 'create', [1]);
        return { content: { status: out.status } };
      }
    }
    const app = await Application.initialize({
      name: 'invoke-seed',
      server: { port: 0, hostname: '127.0.0.1' },
      logger: { handlers: [] },
    });
    app.use((ctx, next) => {
      ctx.setAuth({ role: 'admin' });
      return next();
    });
    await app.modules({ modules: [{ Orders, Shop }] });
    const res = await app.fetch(
      new Request('http://app/buy', { headers: { 'x-request-id': 'req-7' } }),
    );
    asserts.assertEquals(await res.json(), { status: 200 });
    asserts.assertEquals(seen, { auth: { role: 'admin' }, requestId: 'req-7' });
    await app.stop();
  });

  it('app.module(new RapidModuleSubclass()) is a loud config error — the runtime that hosts @On/log/emit is missing', async () => {
    class Lone extends RapidModule<typeof EVENTS> {
      readonly name = 'Lone';
      readonly namespace = 'x';
      protected readonly events = EVENTS;
      @GET('/lone')
      get() {
        return { content: 'x' };
      }
    }
    const app = await Application.initialize({
      name: 'lone',
      server: { port: 0, hostname: '127.0.0.1' },
      logger: { handlers: [] },
    });
    asserts.assertThrows(
      () => app.module(new Lone()),
      RapidError,
      'app.modules()',
    );
    await app.stop();
  });
});

describe('rapid.utils.mountModule — binders off HTTP', () => {
  it('param() without a validator rejects a non-string on a JOB (typed string, delivered JSON otherwise)', async () => {
    class Jobs extends RapidModule<typeof EVENTS> {
      readonly name = 'Jobs';
      readonly namespace = 'ops';
      protected readonly events = EVENTS;
      @JOB('j', '0 6 * * *', { bind: [param('id')] })
      run(id: string) {
        return { content: { len: id.length } };
      }
    }
    const app = await Application.initialize({
      name: 'param-job',
      server: { enabled: false },
      logger: { handlers: [] },
    });
    await app.modules({ modules: [{ Jobs }] });
    const ok = await app.triggerJob('ops.j', { id: 'abc' });
    asserts.assertEquals(ok.status, 200);
    const bad = await app.triggerJob('ops.j', { id: { $gt: '' } });
    asserts.assertEquals(bad.status, 400);
    asserts.assertEquals(
      (bad.content as Record<string, unknown>).code,
      'RAPID_VALIDATION_FAILED',
    );
    await app.stop();
  });
});

describe('rapid.utils.mountModule.middleware', () => {
  const make = () =>
    Application.initialize({
      name: 'route-mw',
      server: { port: 0, hostname: '127.0.0.1' },
      logger: { handlers: [] },
    });

  it('@Module middleware runs before @GET middleware, both inside the app onion; a guard short-circuits', async () => {
    const order: string[] = [];
    const tag = (label: string): RapidMiddleware => (_ctx, next) => {
      order.push(label);
      return next();
    };
    const deny: RapidHTTPMiddleware = (ctx, _next): Promise<void> => {
      order.push('deny');
      ctx.response = { status: 403, content: { denied: true } };
      return Promise.resolve();
    };
    @Module('Admin', { prefix: '/admin', middleware: [tag('module')] })
    class Admin {
      @GET('/a', { middleware: [tag('route')] })
      a(): RapidContextResponse {
        order.push('handler');
        return { content: { ok: true } };
      }
      @GET('/deny', { middleware: [deny] })
      denied(): RapidContextResponse {
        order.push('handler');
        return { content: { ok: true } };
      }
      @GET('/plain')
      plain(): RapidContextResponse {
        order.push('handler');
        return { content: { ok: true } };
      }
    }
    const app = await make();
    app.use(tag('app'));
    app.module(new Admin());
    const ok = await app.fetch(new Request('http://app/admin/a'));
    asserts.assertEquals(ok.status, 200);
    await ok.body?.cancel();
    asserts.assertEquals(order, ['app', 'module', 'route', 'handler']);

    order.length = 0;
    const denied = await app.fetch(new Request('http://app/admin/deny'));
    asserts.assertEquals(denied.status, 403);
    asserts.assertEquals(await denied.json(), { denied: true });
    asserts.assertEquals(order, ['app', 'module', 'deny']);

    order.length = 0;
    await (await app.fetch(new Request('http://app/admin/plain'))).body
      ?.cancel();
    asserts.assertEquals(order, ['app', 'module', 'handler']);
    // The route entries carry the chains — the SHARE-mode boot check and
    // tooling read them there.
    const entry = app.routes.find((r) => r.path === '/admin/a');
    asserts.assertEquals(entry?.middlewares.length, 2);
    asserts.assertEquals(
      app.routes.find((r) => r.path === '/admin/plain')?.middlewares.length,
      1,
    );
    await app.stop();
  });

  it('@SOCKET middleware is registered after the module chain; @JOB takes none', async () => {
    const noop: RapidMiddleware = (_ctx, next) => next();
    @Module('Ops', { namespace: 'ops', middleware: [noop] })
    class Ops {
      @SOCKET('ping', { middleware: [noop, noop] })
      ping(): RapidContextResponse {
        return { content: 'pong' };
      }
      @JOB('tick', '* * * * *')
      tick(): RapidContextResponse {
        return { content: 'tock' };
      }
    }
    const app = await make();
    app.module(new Ops());
    const command = app.socketCommands.find((c) => c.command === 'ops.ping');
    asserts.assertEquals(command?.middlewares.length, 3);
    asserts.assert(app.jobs.some((j) => j.name === 'ops.tick'));
    await app.stop();
  });

  it('a non-function middleware entry is RAPID_CONFIG at decoration time, naming the decorator and index', () => {
    const bad = ['nope'] as never;
    const atRoute = asserts.assertThrows(
      () => {
        class X {
          @GET('/x', { middleware: bad })
          x(): RapidContextResponse {
            return { content: 'x' };
          }
        }
        return X;
      },
      RapidError,
      '@GET middleware[0] is not a function',
    );
    asserts.assertEquals(atRoute.code, 'RAPID_CONFIG');
    asserts.assertThrows(
      () => {
        @Module('Y', { middleware: bad })
        class Y {
          @GET('/y')
          y(): RapidContextResponse {
            return { content: 'x' };
          }
        }
        return Y;
      },
      RapidError,
      '@Module middleware[0]',
    );
    asserts.assertThrows(
      () => {
        class Z {
          @SOCKET('z', { middleware: bad })
          z(): RapidContextResponse {
            return { content: 'x' };
          }
        }
        return Z;
      },
      RapidError,
      '@SOCKET middleware[0]',
    );
  });
});
