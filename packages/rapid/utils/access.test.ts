/**
 * @fileoverview The access cycle: `app.auth()` identifies once and
 * `access` strings are judged on every path — the route, `invoke()`, a
 * job — by the one binding; the boot refuses a declaration nobody can
 * judge; the failure modes of `authenticate` land where designed.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { Application } from '../Application.ts';
import { Action, GET, JOB } from '../decorators/mod.ts';
import { RapidError } from '../errors/mod.ts';
import { RapidModule, reply } from '../modules/mod.ts';
import { allowAll, harness } from '../testing/mod.ts';
import type { RapidAuthBinding, RapidContext } from '../types/mod.ts';
import { buildOpenApi } from './buildOpenApi.ts';

const QUIET = { logger: { handlers: [] as never[] } };

/**
 * A binding with a trivial grammar: the `x-user` header names the caller
 * (`admin` holds everything, `member` holds `Posts:READ`), a JOB runs as
 * `system`; `access` clauses are `|`-joined names of what the caller holds.
 */
const HOLDS: Record<string, readonly string[]> = {
  admin: ['Posts:READ', 'Posts:EDIT', 'signed-in'],
  member: ['Posts:READ', 'signed-in'],
};
const denials: string[] = [];
const binding: RapidAuthBinding = {
  authenticate: (ctx) => {
    if (ctx.type === 'JOB') return { subject: 'system' };
    if (ctx.type !== 'HTTP') return undefined;
    const user = ctx.headers.get('x-user');
    if (user === 'broken') throw new Error('session store down');
    if (user === 'bad-token') {
      throw new RapidError('RAPID_UNAUTHENTICATED', {
        message: 'invalid credential',
      });
    }
    return user === null ? undefined : { subject: user };
  },
  authorize: (ctx, access) => {
    const subject = (ctx.auth as { subject?: string } | undefined)?.subject;
    const held = subject === 'system' ? ['system'] : HOLDS[subject ?? ''] ?? [];
    return access.split('|').some((clause) => held.includes(clause));
  },
  onDenied: (ctx, access) => {
    denials.push(`${ctx.action} ${access}`);
  },
};

const get = (
  app: Application,
  path: string,
  headers: Record<string, string> = {},
) => app.fetch(new Request(`http://app${path}`, { headers }));

const codeOf = async (res: Response): Promise<string | undefined> =>
  ((await res.json()) as { code?: string }).code;

describe('rapid.access: the binding identifies, access strings gate', () => {
  it('authenticate() answers ctx.auth; absent access is public; declared access is 401 / 403 / 200 by caller', async () => {
    const app = await Application.initialize({ name: 'acc1', ...QUIET });
    app.auth(binding);
    app.get('/whoami', (ctx) => ({ content: { auth: ctx.auth ?? null } }));
    app.get('/read', { access: 'Posts:READ' }, () => ({ content: 'read' }));
    app.get('/edit', { access: 'Posts:EDIT' }, () => ({ content: 'edit' }));
    denials.length = 0;

    asserts.assertEquals(await (await get(app, '/whoami')).json(), {
      auth: null,
    });
    asserts.assertEquals(
      await (await get(app, '/whoami', { 'x-user': 'member' })).json(),
      { auth: { subject: 'member' } },
    );
    const anonymous = await get(app, '/read');
    asserts.assertEquals(anonymous.status, 401);
    asserts.assertEquals(await codeOf(anonymous), 'RAPID_UNAUTHENTICATED');
    const forbidden = await get(app, '/edit', { 'x-user': 'member' });
    asserts.assertEquals(forbidden.status, 403);
    asserts.assertEquals(await codeOf(forbidden), 'RAPID_ACCESS_DENIED');
    asserts.assertEquals(
      await (await get(app, '/edit', { 'x-user': 'admin' })).text(),
      'edit',
    );
    asserts.assertEquals(denials, [
      'GET /read Posts:READ',
      'GET /edit Posts:EDIT',
    ]);
  });

  it('a route may name several clauses — any one the caller holds passes', async () => {
    const app = await Application.initialize({ name: 'acc2', ...QUIET });
    app.auth(binding);
    app.get(
      '/either',
      { access: 'Posts:EDIT|Posts:READ' },
      () => ({ content: 'ok' }),
    );
    asserts.assertEquals(
      (await get(app, '/either', { 'x-user': 'member' })).status,
      200,
    );
    asserts.assertEquals((await get(app, '/either')).status, 401);
  });

  it('the pre-auth phase runs before authenticate, use() after it, the guard after that', async () => {
    const order: string[] = [];
    const app = await Application.initialize({ name: 'acc3', ...QUIET });
    app.use(async (ctx, next) => {
      order.push(`use:${ctx.auth === undefined ? 'anon' : 'known'}`);
      await next();
    });
    app.preAuth(async (ctx, next) => {
      order.push(`pre:${ctx.auth === undefined ? 'anon' : 'known'}`);
      await next();
    });
    app.auth({
      ...binding,
      authorize: (ctx, access) => {
        order.push('guard');
        return binding.authorize(ctx, access);
      },
    });
    app.get('/read', { access: 'Posts:READ' }, () => {
      order.push('handler');
      return { content: 'ok' };
    });
    await get(app, '/read', { 'x-user': 'member' });
    asserts.assertEquals(order, ['pre:anon', 'use:known', 'guard', 'handler']);
  });

  it('finish() runs after a chain that completed, not after one that threw', async () => {
    const finished: string[] = [];
    const app = await Application.initialize({ name: 'acc4', ...QUIET });
    app.auth({
      ...binding,
      finish: (ctx) => {
        finished.push(ctx.action);
      },
    });
    app.get('/ok', () => ({ content: 'ok' }));
    app.get('/boom', () => {
      throw new RapidError('RAPID_CONFLICT');
    });
    await get(app, '/ok');
    await get(app, '/boom');
    asserts.assertEquals(finished, ['GET /ok']);
  });
});

describe('rapid.access: authenticate() failure modes', () => {
  it('a thrown 4xx RapidError is a refusal — answered as thrown, on a public route too', async () => {
    const app = await Application.initialize({ name: 'acc5', ...QUIET });
    app.auth(binding);
    app.get('/public', () => ({ content: 'ok' }));
    const res = await get(app, '/public', { 'x-user': 'bad-token' });
    asserts.assertEquals(res.status, 401);
    asserts.assertEquals(await codeOf(res), 'RAPID_UNAUTHENTICATED');
  });

  it('any other throw: a guarded route is 503, an unguarded one serves anonymous and sees authFailed', async () => {
    const app = await Application.initialize({ name: 'acc6', ...QUIET });
    app.auth(binding);
    app.get('/read', { access: 'Posts:READ' }, () => ({ content: 'read' }));
    app.get('/public', (ctx) => ({
      content: {
        auth: ctx.auth ?? null,
        failed: ctx.authFailed instanceof Error ? ctx.authFailed.message : null,
      },
    }));
    const guarded = await get(app, '/read', { 'x-user': 'broken' });
    asserts.assertEquals(guarded.status, 503);
    asserts.assertEquals(await codeOf(guarded), 'RAPID_AUTH_UNAVAILABLE');
    asserts.assertEquals(
      await (await get(app, '/public', { 'x-user': 'broken' })).json(),
      { auth: null, failed: 'session store down' },
    );
  });
});

describe('rapid.access: the one boot failure — access declared, nothing bound', () => {
  it('fetch(), start() and triggerJob() refuse with RAPID_AUTH_UNBOUND naming the action', async () => {
    const app = await Application.initialize({
      name: 'acc8',
      server: { enabled: false },
      ...QUIET,
    });
    app.get('/read', { access: 'Posts:READ' }, () => ({ content: 'read' }));
    const unbound = (fn: () => unknown) => {
      const error = asserts.assertThrows(fn, RapidError);
      asserts.assertEquals(error.code, 'RAPID_AUTH_UNBOUND');
      asserts.assertStringIncludes(error.message, 'GET /read');
    };
    unbound(() => app.fetch(new Request('http://app/read')));
    await asserts.assertRejects(() => app.start(), RapidError, 'GET /read');
    app.job('nightly', '0 6 * * *', () => ({ content: 'ran' }), {
      access: 'system',
    });
    await asserts.assertRejects(
      () => app.triggerJob('nightly'),
      RapidError,
      'declares access',
    );
  });

  it('an app with no declarations boots without a binding — and stays public', async () => {
    const app = await Application.initialize({ name: 'acc9', ...QUIET });
    app.get('/open', () => ({ content: 'open' }));
    asserts.assertEquals((await get(app, '/open')).status, 200);
  });

  it('a job declaring access runs under the identity authenticate() gives a JOB', async () => {
    const app = await Application.initialize({
      name: 'acc10',
      server: { enabled: false },
      ...QUIET,
    });
    app.auth(binding);
    app.job('nightly', '0 6 * * *', () => ({ content: 'ran' }), {
      access: 'system',
    });
    app.job('forbidden', '0 6 * * *', () => ({ content: 'ran' }), {
      access: 'Posts:EDIT',
    });
    asserts.assertEquals((await app.triggerJob('nightly')).status, 200);
    const denied = await app.triggerJob('forbidden');
    asserts.assertEquals(denied.status, 403);
    asserts.assertEquals(denied.handlerRan, false);
  });
});

// ── modules: the same string on the request and on invoke() ────────────
const EVENTS = {};
class Posts extends RapidModule<typeof EVENTS> {
  readonly name = 'Posts';
  readonly namespace = 'blog';
  protected readonly events = EVENTS;
  @GET('/posts', { access: 'Posts:READ' })
  list() {
    return { content: ['a'] };
  }
  @GET('/posts/edit', { access: 'Posts:EDIT' })
  edit() {
    return { content: 'edited' };
  }
  @Action({ access: 'system' })
  purge() {
    return reply(200, { purged: true });
  }
  helper() {
    return reply(200, { plain: true });
  }
}
class Pages extends RapidModule<typeof EVENTS> {
  readonly name = 'Pages';
  readonly namespace = 'blog';
  protected readonly events = EVENTS;
  @GET('/pages/edit-post')
  async editPost() {
    const out = await this.invoke(Posts, 'edit', []);
    return { content: { status: out.status } };
  }
  @GET('/pages/purge')
  async purge() {
    const out = await this.invoke(Posts, 'purge', []);
    return { content: { status: out.status } };
  }
  @GET('/pages/helper')
  async helper() {
    const out = await this.invoke(Posts, 'helper', []);
    return { content: { status: out.status } };
  }
  @JOB('purge', '0 5 * * *', { access: 'system' }) // mounted as `blog.purge`
  async nightly() {
    const out = await this.invoke(Posts, 'purge', []);
    return { content: { status: out.status } };
  }
}

describe('rapid.access: modules — invoke() is judged for the CALLER', () => {
  const boot = async () => {
    const app = await Application.initialize({
      name: 'acc-mod',
      server: { enabled: false },
      ...QUIET,
    });
    app.auth(binding);
    await app.modules({ modules: [{ Posts, Pages }] });
    return app;
  };

  it("a public page invoking a guarded method gets the caller's verdict as the envelope", async () => {
    const app = await boot();
    const anonymous = await get(app, '/pages/edit-post');
    asserts.assertEquals(await anonymous.json(), { status: 401 });
    const member = await get(app, '/pages/edit-post', { 'x-user': 'member' });
    asserts.assertEquals(await member.json(), { status: 403 });
    const admin = await get(app, '/pages/edit-post', { 'x-user': 'admin' });
    asserts.assertEquals(await admin.json(), { status: 200 });
    // An unguarded helper stays reachable by anyone in the process.
    asserts.assertEquals(await (await get(app, '/pages/helper')).json(), {
      status: 200,
    });
    await app.stop();
  });

  it('an @Action({ access }) is invoke-only: a request as admin is denied, a system job passes', async () => {
    const app = await boot();
    asserts.assertEquals(
      await (await get(app, '/pages/purge', { 'x-user': 'admin' })).json(),
      { status: 403 },
    );
    asserts.assertEquals((await app.triggerJob('blog.purge')).status, 200);
    asserts.assertEquals((await get(app, '/posts/purge')).status, 404);
    await app.stop();
  });

  it('accessReport() lists routes, jobs and unrouted actions once each, with the declared string', async () => {
    const app = await boot();
    const rows = app.accessReport().map((r) =>
      `${r.kind} ${r.action} ${r.access ?? '-'}`
    ).sort();
    asserts.assertEquals(rows, [
      'ACTION blog:Posts.purge system',
      'HTTP GET /pages/edit-post -',
      'HTTP GET /pages/helper -',
      'HTTP GET /pages/purge -',
      'HTTP GET /posts Posts:READ',
      'HTTP GET /posts/edit Posts:EDIT',
      'JOB blog.purge system',
    ]);
    await app.stop();
  });

  it('a module declaring access boots only with a binding — in the app and in the harness', async () => {
    const app = await Application.initialize({
      name: 'acc-unbound',
      server: { enabled: false },
      ...QUIET,
    });
    await app.modules({ modules: [{ Posts }] });
    asserts.assertThrows(
      () => app.fetch(new Request('http://app/posts')),
      RapidError,
      'GET /posts',
    );
    await app.stop();
    await asserts.assertRejects(
      () => harness({ modules: [{ Posts }] }),
      RapidError,
      'blog:Posts.',
    );
  });

  it('harness: as(identity) invokes under that caller; allowAll opts out explicitly', async () => {
    await using h = await harness({ modules: [{ Posts }], auth: binding });
    asserts.assertEquals(
      (await h.as(undefined)(Posts, 'edit', [])).status,
      401,
    );
    asserts.assertEquals(
      (await h.as({ subject: 'member' })(Posts, 'edit', [])).status,
      403,
    );
    asserts.assertEquals(
      (await h.as({ subject: 'admin' })(Posts, 'edit', [])).status,
      200,
    );
    await using open = await harness({ modules: [{ Posts }], auth: allowAll });
    asserts.assertEquals((await open.invoke(Posts, 'purge', [])).status, 200);
  });
});

describe('rapid.access: the declared string reaches the OpenAPI document', () => {
  it('emits x-access on the operation, as written, and nothing on an undeclared one', async () => {
    const app = await Application.initialize({ name: 'acc-oas', ...QUIET });
    app.auth(binding);
    app.get('/read', { access: 'Posts:READ' }, () => ({ content: 'r' }));
    app.get('/open', () => ({ content: 'o' }));
    const doc = buildOpenApi(app.routes, {}) as {
      paths: Record<string, Record<string, Record<string, unknown>>>;
    };
    asserts.assertEquals(doc.paths['/read']!['get']!['x-access'], 'Posts:READ');
    asserts.assertEquals('x-access' in doc.paths['/open']!['get']!, false);
  });
});

describe('rapid.access: ctx.memo', () => {
  it('loads once per key for the invocation, concurrent callers included; a rejection is forgotten', async () => {
    const app = await Application.initialize({ name: 'memo', ...QUIET });
    let loads = 0;
    let fails = 0;
    app.get('/m', async (ctx: RapidContext) => {
      const [a, b] = await Promise.all([
        ctx.memo('k', () => ++loads),
        ctx.memo('k', () => ++loads),
      ]);
      const c = await ctx.memo('k', () => ++loads);
      await ctx.memo('bad', () => {
        fails++;
        throw new Error('no');
      }).catch(() => {});
      await ctx.memo('bad', () => {
        fails++;
        throw new Error('no');
      }).catch(() => {});
      return { content: { a, b, c, loads, fails } };
    });
    asserts.assertEquals(await (await get(app, '/m')).json(), {
      a: 1,
      b: 1,
      c: 1,
      loads: 1,
      fails: 2,
    });
  });
});
