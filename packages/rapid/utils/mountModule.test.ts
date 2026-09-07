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
import { GET, JOB, param } from '../decorators/mod.ts';
import { RapidError } from '../errors/mod.ts';
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
