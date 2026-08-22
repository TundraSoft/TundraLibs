/**
 * @fileoverview `app.modules()` — the module system booted ON an app:
 * decorated routes mounted, identity from the fields, scoped logger,
 * request → event correlation, disposal on stop.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { Application } from './Application.ts';
import { GET, Module, On, param } from './decorators/mod.ts';
import { RapidError } from './errors/mod.ts';
import { event, type EventContext, RapidModule } from './modules/mod.ts';

const make = (name: string) =>
  Application.initialize({
    name,
    server: { port: 0, hostname: '127.0.0.1' },
    logger: { handlers: [] },
    uploads: { path: '/tmp/rapid-modules-test' },
  });

const USER_EVENTS = { UserViewed: event<{ id: string }>() };
@Module({ prefix: '/users' }) // no `version`: the test app sets no versioning default
class Users extends RapidModule<typeof USER_EVENTS> {
  readonly name = 'Users';
  readonly namespace = 'users';
  protected readonly events = USER_EVENTS;
  @GET('/:id:', { bind: [param('id')] })
  async find(id: string) {
    await this.emit('UserViewed', { id });
    this.log.info('user viewed');
    return { content: { id } };
  }
}
class Audit extends RapidModule {
  readonly name = 'Audit';
  readonly namespace = 'audit';
  protected readonly events = {};
  readonly seen: { id: string; requestId: string }[] = [];
  disposed = false;
  @On('users:Users:UserViewed')
  record(p: { id: string }, ctx: EventContext) {
    this.seen.push({ id: p.id, requestId: ctx.requestId });
  }
  dispose() {
    this.disposed = true;
  }
}

describe('rapid.Application.modules', () => {
  it("boots the runtime on the app, mounts decorated routes, and a request's id flows into module events", async () => {
    const app = await make('mods-boot');
    const { modules, runtime } = await app.modules({
      modules: [{ Users, Audit }],
    });
    asserts.assertStrictEquals(app.moduleRuntime, runtime);
    asserts.assertEquals(runtime.declaredEvents, ['users:Users:UserViewed']);

    const res = await app.fetch(new Request('http://app/users/7'));
    asserts.assertEquals([res.status, await res.json()], [200, { id: '7' }]);
    const requestId = res.headers.get('x-request-id')!;
    asserts.assertEquals(modules.Audit.seen, [{ id: '7', requestId }]); // transport scope → event
    await app.stop();
  });

  it('module log lines carry the module identity (scoped view of the app logger)', async () => {
    const app = await make('mods-log');
    const lines: Record<string, unknown>[] = [];
    (app.log as unknown as {
      log: (l: number, m: string, c?: Record<string, unknown>) => void;
    }).log = (
      _l,
      _m,
      c,
    ) => {
      lines.push(c ?? {});
    };
    await app.modules({ modules: [{ Users, Audit }] });
    await app.fetch(new Request('http://app/users/1'));
    asserts.assert(lines.some((c) => c.module === 'users:Users'));
    await app.stop();
  });

  it('identity comes from the fields: @Module with a name on a RapidModule is refused', async () => {
    @Module('Twice', { prefix: '/t' })
    class Twice extends RapidModule {
      readonly name = 'Twice';
      readonly namespace = 'twice';
      protected readonly events = {};
      @GET('/')
      root() {
        return { content: 'x' };
      }
    }
    const app = await make('mods-identity');
    const err = await asserts.assertRejects(
      () => app.modules({ modules: [{ Twice }] }),
      RapidError,
    );
    asserts.assertEquals(err.code, 'RAPID_CONFIG');
    asserts.assertStringIncludes(
      err.message,
      'name/namespace come from the class fields',
    );
    asserts.assertEquals(app.moduleRuntime, undefined); // rolled back
  });

  it('event-only modules mount without decorations; a second modules() call is refused', async () => {
    const app = await make('mods-twice');
    await app.modules({ modules: [{ Users, Audit }] }); // Audit has no routes — still mounted in the runtime
    const err = await asserts.assertRejects(
      () => app.modules({ modules: [{ Users }] }),
      RapidError,
    );
    asserts.assertEquals(err.code, 'RAPID_CONFIG');
    await app.stop();
  });

  it('stop() disposes the runtime — after start(), and for a fetch-only app that never listened', async () => {
    const started = await make('mods-stop-started');
    const a = await started.modules({ modules: [{ Users, Audit }] });
    await started.start();
    await started.stop();
    asserts.assert(a.runtime.disposed);
    asserts.assert(a.modules.Audit.disposed);
    asserts.assertEquals(started.moduleRuntime, undefined);

    const fetchOnly = await make('mods-stop-fetch');
    const b = await fetchOnly.modules({ modules: [{ Users, Audit }] });
    await fetchOnly.fetch(new Request('http://app/users/2'));
    await fetchOnly.stop();
    asserts.assert(b.runtime.disposed);
  });
});
