/**
 * @fileoverview `app.module()` — the mount tier end to end: prefix
 * joining (HTTP only), the six binder sources over real HTTP/SOCKET/
 * JOB dispatch, the runtime reply-shape check, the subclass-override
 * policy, the connection()-off-SOCKET guard, and reuse of the plain
 * `route()`/`socket()`/`job()` core (duplicate detection comes free).
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { Client } from '@tundralibs/rpc';
import { Application } from './Application.ts';
import {
  connection,
  GET,
  header,
  JOB,
  Module,
  paging,
  param,
  payload,
  query,
  SOCKET,
} from './decorators/mod.ts';
import { RapidError } from './errors/mod.ts';
import type { RapidContextResponse } from './types/mod.ts';
import type { SOCKETConnection } from './context/mod.ts';

describe('rapid.Application.module', () => {
  it('prefix joins HTTP paths only; SOCKET/JOB stay flat', async () => {
    @Module('Users', { prefix: '/api/v1' })
    class Users {
      @GET('/:id:', { bind: [param('id')] })
      find(id: string): RapidContextResponse {
        return { content: { id } };
      }

      @SOCKET('users.get', { bind: [param('id')] })
      findViaSocket(id: string): RapidContextResponse {
        return { content: { id } };
      }
    }

    const app = await Application.initialize({
      name: 'mod-prefix',
      server: { port: 0 },
    });
    app.module(new Users());
    await app.start();
    try {
      const res = await fetch(`http://localhost:${app.port}/api/v1/7`);
      asserts.assertEquals(res.status, 200);
      asserts.assertEquals(await res.json(), { id: '7' });

      const ws = new Client({
        url: `ws://localhost:${app.port}/ws`,
        reconnect: { enabled: false },
      });
      await ws.connect();
      try {
        // Socket commands ignore the module's HTTP prefix entirely.
        const r = await ws.command<{ id: string }>('users.get', { id: '9' });
        asserts.assertEquals(r, { id: '9' });
      } finally {
        await ws.close();
      }
    } finally {
      await app.stop();
    }
  });

  it('no @Module at all still mounts (opt-in, empty prefix)', async () => {
    class Bare {
      @GET('/plain')
      handler(): RapidContextResponse {
        return { content: 'ok' };
      }
    }
    const app = await Application.initialize({
      name: 'mod-bare',
      server: { port: 0 },
    });
    app.module(new Bare());
    await app.start();
    try {
      const res = await fetch(`http://localhost:${app.port}/plain`);
      asserts.assertEquals(await res.text(), 'ok');
    } finally {
      await app.stop();
    }
  });

  it('every binder source extracts correctly across all three transports', async () => {
    @Module('Reports', { prefix: '/svc' })
    class Reports {
      @GET('/:id:', {
        bind: [param('id'), query(), paging(), header('x-trace')],
      })
      httpFind(
        id: string,
        q: { filters: Record<string, unknown> },
        paging: { page: number; size: number },
        trace: string | null,
      ): RapidContextResponse {
        return {
          content: { id, filters: q.filters, page: paging.page, trace },
        };
      }

      @SOCKET('reports.inspect', {
        bind: [param('id'), payload(), connection()],
      })
      socketInspect(
        id: string,
        payload: unknown,
        conn: SOCKETConnection,
      ): RapidContextResponse {
        return { content: { id, payload, connId: conn.id } };
      }

      @JOB('daily-report', '0 6 * * *', {
        args: { id: 'latest' },
        bind: [param('id'), payload()],
      })
      job(id: string, payload: unknown): RapidContextResponse {
        return { content: { id, payload } };
      }
    }

    const app = await Application.initialize({
      name: 'mod-binders',
      server: { port: 0 },
    });
    app.module(new Reports());
    await app.start();
    try {
      // No query string: confirms wiring with the empty-query default,
      // not the query grammar itself (that's parseQueryFilters' own suite).
      const res = await fetch(`http://localhost:${app.port}/svc/7`, {
        headers: { 'x-trace': 'abc' },
      });
      asserts.assertEquals(await res.json(), {
        id: '7',
        filters: {},
        page: 1,
        trace: 'abc',
      });

      const ws = new Client({
        url: `ws://localhost:${app.port}/ws`,
        reconnect: { enabled: false },
      });
      await ws.connect();
      try {
        const r = await ws.command<
          { id: string; payload: unknown; connId: string }
        >('reports.inspect', { id: '9', extra: 'x' });
        // Frame payload IS params, so the whole frame becomes the payload():
        asserts.assertEquals(r.payload, { id: '9', extra: 'x' });
        asserts.assert(r.connId.length > 0);
      } finally {
        await ws.close();
      }

      const outcome = await app.triggerJob('daily-report');
      asserts.assertEquals(outcome.status, 200);
      // JOB has no payload source: ctx.payload resolves to undefined.
      asserts.assertEquals(outcome.content, {
        id: 'latest',
        payload: undefined,
      });
    } finally {
      await app.stop();
    }
  });

  it('connection() bound off @SOCKET is rejected at MOUNT time, not first request', async () => {
    class Bad {
      @GET('/x', { bind: [connection()] })
      // deno-lint-ignore no-explicit-any
      handler(_conn: any): RapidContextResponse {
        return { content: 'unreachable' };
      }
    }
    const app = await Application.initialize({
      name: 'mod-badbind',
      server: { enabled: false },
    });
    asserts.assertThrows(
      () => app.module(new Bad()),
      RapidError,
      'connection() only binds on @SOCKET',
    );
  });

  it('a malformed reply throws RAPID_RESPONSE_INVALID at invocation time', async () => {
    class Broken {
      @GET('/broken')
      // deno-lint-ignore no-explicit-any
      handler(): any {
        return 'not an envelope'; // missing { content }
      }
    }
    const app = await Application.initialize({
      name: 'mod-badreply',
      server: { port: 0 },
    });
    app.module(new Broken());
    await app.start();
    try {
      const res = await fetch(`http://localhost:${app.port}/broken`);
      asserts.assertEquals(res.status, 500); // RAPID_RESPONSE_INVALID maps to 500
    } finally {
      await app.stop();
    }
  });

  it('zero decorated methods anywhere on the instance is a mount-time error', async () => {
    class Empty {
      plain(): string {
        return 'not a route';
      }
    }
    const app = await Application.initialize({
      name: 'mod-empty',
      server: { enabled: false },
    });
    asserts.assertThrows(
      () => app.module(new Empty()),
      RapidError,
      'no @GET/@POST/@PUT/@PATCH/@DELETE/@SOCKET/@JOB decorated methods',
    );
  });

  it('an inherited (non-overridden) decorated method mounts fine, bound to the subclass instance', async () => {
    class Base {
      @GET('/who')
      who(): RapidContextResponse {
        // `this` must be the SUBCLASS instance at call time, not Base's.
        return { content: (this as unknown as Derived).label };
      }
    }
    class Derived extends Base {
      public readonly label = 'derived';
    }
    const app = await Application.initialize({
      name: 'mod-inherit',
      server: { port: 0 },
    });
    app.module(new Derived());
    await app.start();
    try {
      const res = await fetch(`http://localhost:${app.port}/who`);
      asserts.assertEquals(await res.text(), 'derived');
    } finally {
      await app.stop();
    }
  });

  it('a subclass overriding a decorated method WITHOUT re-decorating is rejected loudly', async () => {
    class Base {
      @GET('/x')
      handler(): RapidContextResponse {
        return { content: 'base' };
      }
    }
    class Broken extends Base {
      override handler(): RapidContextResponse {
        return { content: 'override' };
      }
    }
    const app = await Application.initialize({
      name: 'mod-override-bad',
      server: { enabled: false },
    });
    asserts.assertThrows(
      () => app.module(new Broken()),
      RapidError,
      'overrides a method decorated on Base',
    );
  });

  it('a subclass overriding AND re-decorating mounts the OVERRIDE, base entry shadowed', async () => {
    class Base {
      @GET('/x')
      handler(): RapidContextResponse {
        return { content: 'base' };
      }
    }
    class Fixed extends Base {
      @GET('/x')
      override handler(): RapidContextResponse {
        return { content: 'fixed' };
      }
    }
    const app = await Application.initialize({
      name: 'mod-override-fixed',
      server: { port: 0 },
    });
    app.module(new Fixed());
    await app.start();
    try {
      const res = await fetch(`http://localhost:${app.port}/x`);
      asserts.assertEquals(await res.text(), 'fixed');
    } finally {
      await app.stop();
    }
  });

  it('module() reuses the plain core: a duplicate socket command across TWO module() calls throws', async () => {
    class A {
      @SOCKET('dup')
      a(): RapidContextResponse {
        return { content: 'a' };
      }
    }
    class B {
      @SOCKET('dup')
      b(): RapidContextResponse {
        return { content: 'b' };
      }
    }
    const app = await Application.initialize({
      name: 'mod-dup',
      server: { enabled: false },
    });
    app.module(new A());
    asserts.assertThrows(
      () => app.module(new B()),
      RapidError,
      "socket command 'dup' is already registered",
    );
  });

  it('app.module(a, b) mounts several instances in one call', async () => {
    class Cats {
      @GET('/cats')
      list(): RapidContextResponse {
        return { content: 'cats' };
      }
    }
    class Dogs {
      @GET('/dogs')
      list(): RapidContextResponse {
        return { content: 'dogs' };
      }
    }
    const app = await Application.initialize({
      name: 'mod-multi',
      server: { port: 0 },
    });
    app.module(new Cats(), new Dogs());
    await app.start();
    try {
      const cats = await fetch(`http://localhost:${app.port}/cats`);
      const dogs = await fetch(`http://localhost:${app.port}/dogs`);
      asserts.assertEquals(await cats.text(), 'cats');
      asserts.assertEquals(await dogs.text(), 'dogs');
    } finally {
      await app.stop();
    }
  });
});
