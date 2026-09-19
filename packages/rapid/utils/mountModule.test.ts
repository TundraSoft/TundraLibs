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
  it('a collection answers as a bare array, and the paging key becomes headers — page/size from the resolved window, total only when counted', async () => {
    @Module('Posts', { prefix: '/posts' })
    class Posts {
      @GET('/')
      list(): RapidContextResponse {
        // Only what the handler alone knows.
        return { content: [{ id: 'a' }, { id: 'b' }], paging: { total: 137 } };
      }
      @GET('/uncounted')
      uncounted(): RapidContextResponse {
        return { content: [], paging: {} };
      }
      @GET('/plain')
      plain(): RapidContextResponse {
        return { content: [{ id: 'a' }] };
      }
    }
    const app = await Application.initialize({
      name: 'x-paging',
      server: { port: 0 },
    });
    app.module(new Posts());

    const res = await app.fetch(
      new Request('http://x/posts/?page=2&limit=25'),
    );
    // The BODY is the collection — no envelope around it.
    asserts.assertEquals(await res.json(), [{ id: 'a' }, { id: 'b' }]);
    asserts.assertEquals(res.headers.get('x-page-number'), '2');
    asserts.assertEquals(res.headers.get('x-page-size'), '25');
    asserts.assertEquals(res.headers.get('x-total-rows'), '137');

    // No count → no total header at all. Absent is a different fact from
    // zero, so it must not be reported as 0.
    const none = await app.fetch(new Request('http://x/posts/uncounted'));
    asserts.assertEquals(none.headers.get('x-total-rows'), null);
    asserts.assertEquals(none.headers.get('x-page-number'), '1');

    // No paging key → none of the three headers.
    const plain = await app.fetch(new Request('http://x/posts/plain'));
    asserts.assertEquals(plain.headers.get('x-page-number'), null);
    asserts.assertEquals(plain.headers.get('x-page-size'), null);
  });

  it('an explicit page/size in the reply overrides the request window', async () => {
    @Module('Posts', { prefix: '/posts' })
    class Posts {
      @GET('/')
      list(): RapidContextResponse {
        // The handler clamped to the last real page.
        return { content: [], paging: { page: 3, size: 5, total: 11 } };
      }
    }
    const app = await Application.initialize({
      name: 'x-paging-override',
      server: { port: 0 },
    });
    app.module(new Posts());
    const res = await app.fetch(new Request('http://x/posts/?page=99'));
    asserts.assertEquals(res.headers.get('x-page-number'), '3');
    asserts.assertEquals(res.headers.get('x-page-size'), '5');
    asserts.assertEquals(res.headers.get('x-total-rows'), '11');
  });

  it('the configured header names are the ones written, and an illegal name fails at boot', async () => {
    @Module('Posts', { prefix: '/posts' })
    class Posts {
      @GET('/')
      list(): RapidContextResponse {
        return { content: [], paging: { total: 4 } };
      }
    }
    const app = await Application.initialize({
      name: 'x-paging-names',
      server: {
        port: 0,
        paging: {
          pageHeader: 'x-pg',
          sizeHeader: 'x-sz',
          totalHeader: 'x-tot',
        },
      },
    });
    app.module(new Posts());
    const res = await app.fetch(new Request('http://x/posts/'));
    asserts.assertEquals(res.headers.get('x-tot'), '4');
    asserts.assertEquals(res.headers.get('x-pg'), '1');
    asserts.assertEquals(res.headers.get('x-total-rows'), null);

    await asserts.assertRejects(
      () =>
        Application.initialize({
          name: 'x-bad-header',
          server: { port: 0, paging: { totalHeader: 'not a header' } },
        }),
      RapidError,
      'must be a valid HTTP header name',
    );
  });

  it('prefixes × paths: one declaration mounts the whole cross product, and every operationId stays unique', async () => {
    @Module('Users', { prefix: ['', '/:orgCode:'] })
    class Users {
      @GET('/users')
      list(): RapidContextResponse {
        return { content: { scope: 'list' } };
      }
      @GET(['/users/:id:', '/u/:id:'], { bind: [param('id')] })
      one(id: string): RapidContextResponse {
        return { content: { id } };
      }
    }
    const app = await Application.initialize({
      name: 'x-multi',
      server: { port: 0 },
    });
    app.module(new Users());

    asserts.assertEquals(
      app.routes.map((r) => `${r.method} ${r.path}`).sort(),
      [
        'GET /:orgCode:/u/:id:',
        'GET /:orgCode:/users',
        'GET /:orgCode:/users/:id:',
        'GET /u/:id:',
        'GET /users',
        'GET /users/:id:',
      ],
    );

    // OpenAPI requires operationId to be unique across the document; one
    // method serving six paths must not repeat one id six times.
    const ids = app.routes.map((r) => r.openapi?.operationId);
    asserts.assertEquals(ids.filter((id) => id === undefined).length, 0);
    asserts.assertEquals(new Set(ids).size, ids.length);
    asserts.assert(
      ids.includes('Users_list_orgCode_users'),
      `expected a path-derived id, got ${JSON.stringify(ids)}`,
    );

    // Both shapes actually serve, with the tenant param present only on
    // the prefixed one.
    const plain = await app.fetch(new Request('http://x/users/7'));
    asserts.assertEquals(await plain.json(), { id: '7' });
    const scoped = await app.fetch(new Request('http://x/acme/u/7'));
    asserts.assertEquals(await scoped.json(), { id: '7' });
  });

  it('a SINGLE-path route keeps its plain operationId — disambiguation applies only when a method serves several', async () => {
    @Module('Solo', { prefix: '/solo' })
    class Solo {
      @GET('/one')
      one(): RapidContextResponse {
        return { content: {} };
      }
    }
    const app = await Application.initialize({
      name: 'x-solo',
      server: { port: 0 },
    });
    app.module(new Solo());
    asserts.assertEquals(app.routes[0]?.openapi?.operationId, 'Solo_one');
  });

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
