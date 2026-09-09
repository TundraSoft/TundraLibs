/**
 * @fileoverview `session()` — persistence across requests via the signed
 * cookie, no cookie for read-only requests, regenerate (rotate id + keep data
 * + evict old), destroy (clear), and rejection of a tampered id.
 * @module
 */
import { describe, it } from '@tundralibs/compat/test';
import { RapidError } from '../errors/mod.ts';
import * as asserts from '@std/asserts';
import { Application } from '../Application.ts';
import { getSession, session } from './session.ts';
import { memorySessionHooks, type SessionHooks } from './session.ts';

const makeApp = async () => {
  const app = await Application.initialize({
    name: 'sess',
    secret: 'test-secret-0123456789-abcdefghijklmnop',
    server: { port: 0, hostname: '127.0.0.1' },
    logger: { handlers: [] },
  });
  app.use(session({ secure: false })); // http test → Secure off
  app.get(
    '/read',
    async (ctx) => ({
      content: { hits: (await getSession(ctx))!.get<number>('hits') ?? 0 },
    }),
  );
  app.post('/hit', async (ctx) => {
    const s = (await getSession(ctx))!;
    s.set('hits', (s.get<number>('hits') ?? 0) + 1);
    return { content: { hits: s.get<number>('hits') } };
  });
  app.post('/login', async (ctx) => {
    const s = (await getSession(ctx))!;
    s.regenerate();
    s.set('userId', 'u1');
    return { content: { ok: true } };
  });
  app.post('/logout', async (ctx) => {
    (await getSession(ctx))!.destroy();
    return { content: { ok: true } };
  });
  return app;
};

const sidFrom = (res: Response): string | undefined =>
  res.headers.get('set-cookie')?.match(/sid=([^;]+)/)?.[1];

describe('rapid session()', () => {
  it('is callable with no arguments (the documented app.use(session()) form)', () => {
    asserts.assertEquals(typeof session(), 'function');
  });

  it('persists data across requests via the signed cookie', async () => {
    const app = await makeApp();
    const r1 = await app.fetch(
      new Request('http://app/hit', { method: 'POST' }),
    );
    asserts.assertEquals((await r1.json()).hits, 1);
    const sid = sidFrom(r1);
    asserts.assert(sid, 'first write should issue a sid cookie');
    const r2 = await app.fetch(
      new Request('http://app/hit', {
        method: 'POST',
        headers: { cookie: `sid=${sid}` },
      }),
    );
    asserts.assertEquals((await r2.json()).hits, 2);
  });

  it('does not set a cookie for a read-only request with no session', async () => {
    const app = await makeApp();
    const r = await app.fetch(new Request('http://app/read'));
    asserts.assertEquals((await r.json()).hits, 0);
    asserts.assertEquals(r.headers.get('set-cookie'), null);
  });

  it('regenerate() rotates the id, keeps the data, evicts the old id', async () => {
    const app = await makeApp();
    const sid1 = sidFrom(
      await app.fetch(new Request('http://app/hit', { method: 'POST' })),
    )!;
    const sid2 = sidFrom(
      await app.fetch(
        new Request('http://app/login', {
          method: 'POST',
          headers: { cookie: `sid=${sid1}` },
        }),
      ),
    )!;
    asserts.assert(sid2 && sid2 !== sid1, 'login should rotate the sid');
    // Rotated session still carries the pre-login hit count.
    const r3 = await app.fetch(
      new Request('http://app/read', { headers: { cookie: `sid=${sid2}` } }),
    );
    asserts.assertEquals((await r3.json()).hits, 1);
    // The old id was evicted → fresh session.
    const r4 = await app.fetch(
      new Request('http://app/read', { headers: { cookie: `sid=${sid1}` } }),
    );
    asserts.assertEquals((await r4.json()).hits, 0);
  });

  it('destroy() clears the session', async () => {
    const app = await makeApp();
    const sid = sidFrom(
      await app.fetch(new Request('http://app/hit', { method: 'POST' })),
    )!;
    const r2 = await app.fetch(
      new Request('http://app/logout', {
        method: 'POST',
        headers: { cookie: `sid=${sid}` },
      }),
    );
    asserts.assertStringIncludes(r2.headers.get('set-cookie') ?? '', 'sid=');
    const r3 = await app.fetch(
      new Request('http://app/read', { headers: { cookie: `sid=${sid}` } }),
    );
    asserts.assertEquals((await r3.json()).hits, 0);
  });

  it('is LAZY: a request that never touches the session does zero store I/O and never slides the window', async () => {
    let reads = 0;
    let writes = 0;
    const backing = memorySessionHooks();
    const counting: SessionHooks = {
      ...backing,
      getSession(id) {
        reads++;
        return backing.getSession(id);
      },
      saveSession(id, record, ttl) {
        writes++;
        return backing.saveSession(id, record, ttl);
      },
    };
    const app = await Application.initialize({
      name: 'session-lazy',
      secret: 'a'.repeat(32),
      server: { port: 0, hostname: '127.0.0.1' },
      logger: { handlers: [] },
    });
    app.use(session({ secure: false, hooks: counting }));
    app.get('/untouched', () => ({ content: { ok: true } }));
    app.get('/touched', async (ctx) => ({
      content: { id: (await getSession(ctx))!.id ?? null },
    }));

    // Mint a session first so a cookie exists to tempt an eager load.
    const seed = await app.fetch(
      new Request('http://app/touched', { method: 'GET' }),
    );
    await seed.body?.cancel();
    const afterSeed = { reads, writes };

    // An untouched request with NO session access: zero store I/O.
    const r = await app.fetch(new Request('http://app/untouched'));
    asserts.assertEquals((await r.json()).ok, true);
    asserts.assertEquals(reads, afterSeed.reads);
    asserts.assertEquals(writes, afterSeed.writes);
    await app.stop();
  });

  it('rejects a tampered id (bad signature) as no session', async () => {
    const app = await makeApp();
    const r = await app.fetch(
      new Request('http://app/read', {
        headers: { cookie: 'sid=forged.bad' }, // malformed sig must not 500
      }),
    );
    asserts.assertEquals((await r.json()).hits, 0);
  });

  it('a transient store-read failure 500s the request but never wipes the live record', async () => {
    const backing = memorySessionHooks();
    let failReads = false;
    const flaky: SessionHooks = {
      ...backing,
      // deno-lint-ignore require-await
      getSession: async (id) => {
        if (failReads) throw new Error('redis blip');
        return backing.getSession(id);
      },
    };
    const app = await Application.initialize({
      name: 'session-flaky',
      secret: 'a'.repeat(32),
      server: { port: 0, hostname: '127.0.0.1' },
      logger: { handlers: [] },
    });
    app.use(session({ secure: false, hooks: flaky }));
    app.post('/hit', async (ctx) => {
      const s = (await getSession(ctx))!;
      s.set('hits', (s.get<number>('hits') ?? 0) + 1);
      return { content: { hits: s.get<number>('hits') } };
    });
    app.get('/read', async (ctx) => ({
      content: { hits: (await getSession(ctx))!.get<number>('hits') ?? 0 },
    }));

    const sid = sidFrom(
      await app.fetch(new Request('http://app/hit', { method: 'POST' })),
    )!;
    failReads = true;
    const err = await app.fetch(
      new Request('http://app/read', { headers: { cookie: `sid=${sid}` } }),
    );
    asserts.assertEquals(err.status, 500); // the blip surfaces...
    await err.body?.cancel();
    failReads = false;
    // ...but the record SURVIVED — a failed load must never save over it.
    const r = await app.fetch(
      new Request('http://app/read', { headers: { cookie: `sid=${sid}` } }),
    );
    asserts.assertEquals((await r.json()).hits, 1);
  });

  it('regenerate() then destroy() in one request evicts the pre-rotation record too', async () => {
    const app = await makeApp();
    app.post('/rotate-and-out', async (ctx) => {
      const s = (await getSession(ctx))!;
      s.regenerate();
      s.destroy();
      return { content: { ok: true } };
    });
    const sid = sidFrom(
      await app.fetch(new Request('http://app/hit', { method: 'POST' })),
    )!;
    const out = await app.fetch(
      new Request('http://app/rotate-and-out', {
        method: 'POST',
        headers: { cookie: `sid=${sid}` },
      }),
    );
    await out.body?.cancel();
    // The pre-rotation record must be gone — not parked behind the rotation.
    const r = await app.fetch(
      new Request('http://app/read', { headers: { cookie: `sid=${sid}` } }),
    );
    asserts.assertEquals((await r.json()).hits, 0);
  });

  it('destroy() followed by a throw still logs the user out', async () => {
    const app = await makeApp();
    app.post('/logout-throw', async (ctx) => {
      (await getSession(ctx))!.destroy();
      throw new Error('audit hook failed');
    });
    const sid = sidFrom(
      await app.fetch(new Request('http://app/hit', { method: 'POST' })),
    )!;
    const err = await app.fetch(
      new Request('http://app/logout-throw', {
        method: 'POST',
        headers: { cookie: `sid=${sid}` },
      }),
    );
    asserts.assertEquals(err.status, 500);
    await err.body?.cancel();
    const r = await app.fetch(
      new Request('http://app/read', { headers: { cookie: `sid=${sid}` } }),
    );
    asserts.assertEquals((await r.json()).hits, 0); // record dropped despite the throw
  });

  it('storing an unclonable value fails THAT request loudly — the record is never poisoned', async () => {
    const app = await makeApp();
    app.post('/poison', async (ctx) => {
      (await getSession(ctx))!.set('cb', () => {}); // no store can serialize this
      return { content: { ok: true } };
    });
    const sid = sidFrom(
      await app.fetch(new Request('http://app/hit', { method: 'POST' })),
    )!;
    const bad = await app.fetch(
      new Request('http://app/poison', {
        method: 'POST',
        headers: { cookie: `sid=${sid}` },
      }),
    );
    asserts.assertEquals(bad.status, 500); // the WRITING request fails...
    await bad.body?.cancel();
    // ...and the stored record is untouched — no permanent 500 wedge.
    const r = await app.fetch(
      new Request('http://app/read', { headers: { cookie: `sid=${sid}` } }),
    );
    asserts.assertEquals(r.status, 200);
    asserts.assertEquals((await r.json()).hits, 1);
  });

  it('in-place mutation without set() never persists — the load is a clone, not an alias', async () => {
    const app = await Application.initialize({
      name: 'session-alias',
      secret: 'a'.repeat(32),
      server: { port: 0, hostname: '127.0.0.1' },
      logger: { handlers: [] },
    });
    // rolling off: an untouched-but-read session writes nothing back, so
    // an aliased store object would be the ONLY way a mutation persists.
    app.use(session({ secure: false, rolling: false }));
    app.post('/seed', async (ctx) => {
      (await getSession(ctx))!.set('obj', { n: 1 });
      return { content: { ok: true } };
    });
    app.post('/mutate', async (ctx) => {
      const obj = (await getSession(ctx))!.get<{ n: number }>('obj');
      if (obj !== undefined) obj.n = 99; // in place, no set()
      return { content: { ok: true } };
    });
    app.get('/peek', async (ctx) => ({
      content: { n: (await getSession(ctx))!.get<{ n: number }>('obj')?.n },
    }));
    const sid = sidFrom(
      await app.fetch(new Request('http://app/seed', { method: 'POST' })),
    )!;
    const m = await app.fetch(
      new Request('http://app/mutate', {
        method: 'POST',
        headers: { cookie: `sid=${sid}` },
      }),
    );
    await m.body?.cancel();
    const r = await app.fetch(
      new Request('http://app/peek', { headers: { cookie: `sid=${sid}` } }),
    );
    asserts.assertEquals((await r.json()).n, 1); // the mutation stayed request-local
  });
});

describe('rapid session() rolling save', () => {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  /** App whose read route holds its stale snapshot across a concurrent write. */
  const raceApp = async (hooks?: SessionHooks) => {
    const app = await Application.initialize({
      name: 'sess-race',
      secret: 'test-secret-0123456789-abcdefghijklmnop',
      server: { port: 0, hostname: '127.0.0.1' },
      logger: { handlers: [] },
    });
    app.use(session({ secure: false, ...(hooks ? { hooks } : {}) }));
    app.post('/hit', async (ctx) => {
      const s = (await getSession(ctx))!;
      s.set('hits', (s.get<number>('hits') ?? 0) + 1);
      return { content: { hits: s.get<number>('hits') } };
    });
    app.get('/slow', async (ctx) => {
      const before = (await getSession(ctx))!.get<number>('hits');
      await sleep(60); // a page render overlapping a POST
      return { content: { before } };
    });
    app.get('/read', async (ctx) => ({
      content: { hits: (await getSession(ctx))!.get<number>('hits') },
    }));
    return app;
  };

  const race = async (app: Application) => {
    const first = await app.fetch(
      new Request('http://app/hit', { method: 'POST' }),
    );
    const sid = sidFrom(first)!;
    await first.body?.cancel();
    const cookie = { cookie: `sid=${sid}` };
    const slow = app.fetch(new Request('http://app/slow', { headers: cookie }));
    await sleep(10);
    await (await app.fetch(
      new Request('http://app/hit', { method: 'POST', headers: cookie }),
    )).text();
    await (await slow).text();
    const read = await app.fetch(
      new Request('http://app/read', { headers: cookie }),
    );
    return (await read.json()).hits;
  };

  it('a read-only request slides the window WITHOUT overwriting a concurrent write (store.touch)', async () => {
    const app = await raceApp();
    asserts.assertEquals(await race(app), 2);
    await app.stop();
  });

  it('a store without touch() falls back to re-setting the CURRENT record, not the stale snapshot', async () => {
    // Hooks shaped like a minimal redis adapter: no touchSession.
    const { touchSession: _touch, ...minimal } = memorySessionHooks();
    const app = await raceApp(minimal);
    asserts.assertEquals(await race(app), 2);
    await app.stop();
  });
});

describe('rapid session() — memory bound', () => {
  it('maxSessions evicts the oldest live session; a non-positive bound is RAPID_CONFIG', async () => {
    asserts.assertThrows(
      () => session({ maxSessions: 0 }),
      RapidError,
      'maxSessions',
    );
    const app = await Application.initialize({
      name: 'sess-bound',
      secret: 'test-secret-0123456789-abcdefghijklmnop',
      server: { port: 0, hostname: '127.0.0.1' },
      logger: { handlers: [] },
    });
    app.use(session({ secure: false, maxSessions: 2 }));
    app.post('/hit', async (ctx) => {
      const s = (await getSession(ctx))!;
      s.set('hits', (s.get<number>('hits') ?? 0) + 1);
      return { content: { hits: s.get<number>('hits') } };
    });
    app.get('/read', async (ctx) => ({
      content: { hits: (await getSession(ctx))!.get<number>('hits') ?? 0 },
    }));
    try {
      const sids: string[] = [];
      for (let i = 0; i < 3; i++) {
        const r = await app.fetch(
          new Request('http://app/hit', { method: 'POST' }),
        );
        sids.push(sidFrom(r)!);
        await r.body?.cancel();
      }
      // Three anonymous visitors, a bound of two: the first record is gone.
      const evicted = await app.fetch(
        new Request('http://app/read', {
          headers: { cookie: `sid=${sids[0]}` },
        }),
      );
      asserts.assertEquals(await evicted.json(), { hits: 0 });
      const kept = await app.fetch(
        new Request('http://app/read', {
          headers: { cookie: `sid=${sids[2]}` },
        }),
      );
      asserts.assertEquals(await kept.json(), { hits: 1 });
    } finally {
      await app.stop();
    }
  });
});
