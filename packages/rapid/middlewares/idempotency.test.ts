/**
 * @fileoverview idempotency — replay, concurrent 409, key scoping (route
 * + identity), the never-record rules (throws, streams), record cloning,
 * and the abuse bounds (key cap, unmatched skip, bounded store), driven
 * through `app.fetch`.
 * @module
 */
import { afterAll, beforeAll, describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { Application } from '../Application.ts';
import { RapidError } from '../errors/mod.ts';
import { idempotency, type IdempotencyOptions } from './idempotency.ts';
import { memoryStore, type Store } from './store.ts';
import type { IdempotencyRecord } from './idempotency.ts';

const KEY = { 'idempotency-key': 'k-1' };

describe('rapid.middlewares.idempotency', () => {
  let app: Application;
  let calls: Record<string, number>;
  let releaseSlow!: () => void;

  const post = (path: string, headers: Record<string, string> = {}) =>
    app.fetch(
      new Request(`http://app${path}`, { method: 'POST', headers }),
    );

  beforeAll(async () => {
    calls = {};
    const count = (name: string) => calls[name] = (calls[name] ?? 0) + 1;
    app = await Application.initialize({
      name: 'idempotency',
      server: { port: 0, hostname: '127.0.0.1' },
      logger: { handlers: [] },
    });
    app.use(idempotency({ scope: false })); // deliberately shared key space
    app.post('/orders', () => {
      count('orders');
      return {
        status: 201,
        content: { order: calls['orders'] },
        headers: { 'x-order': String(calls['orders']) },
      };
    });
    app.post('/other', () => {
      count('other');
      return { content: { other: calls['other'] } };
    });
    app.post('/empty', () => {
      count('empty'); // void return → 204; the middleware stores reply null
    });
    app.post('/flaky', () => {
      count('flaky');
      if (calls['flaky'] === 1) {
        throw new RapidError('RAPID_VALIDATION_FAILED');
      }
      return { content: { attempt: calls['flaky'] } };
    });
    app.post('/stream', () => {
      count('stream');
      return {
        content: new Response('chunk').body!,
        headers: { 'content-type': 'text/plain' },
      };
    });
    const gate = new Promise<void>((resolve) => {
      releaseSlow = resolve;
    });
    app.post('/slow', async () => {
      await gate;
      return { content: { done: true } };
    });
  });
  afterAll(async () => {
    await app.stop();
  });

  it('replays the first reply — status, content, and handler headers — without re-running the handler', async () => {
    const r1 = await post('/orders', KEY);
    asserts.assertEquals(r1.status, 201);
    asserts.assertEquals(await r1.json(), { order: 1 });
    asserts.assertEquals(r1.headers.get('idempotency-replayed'), null);

    const r2 = await post('/orders', KEY);
    asserts.assertEquals(r2.status, 201);
    asserts.assertEquals(await r2.json(), { order: 1 }); // FIRST attempt's body
    asserts.assertEquals(r2.headers.get('x-order'), '1');
    asserts.assertEquals(r2.headers.get('idempotency-replayed'), 'true');
    asserts.assertEquals(calls['orders'], 1);
  });

  it('a replay re-issues per-request stamps — the request-id echo is never resurrected', async () => {
    const r1 = await post('/orders', { 'idempotency-key': 'k-echo' });
    const r2 = await post('/orders', { 'idempotency-key': 'k-echo' });
    await r1.body?.cancel();
    await r2.body?.cancel();
    const id1 = r1.headers.get('x-request-id');
    const id2 = r2.headers.get('x-request-id');
    asserts.assert(id1 !== null && id2 !== null);
    asserts.assertNotEquals(id1, id2);
  });

  it('a different key executes fresh; a missing key never records', async () => {
    const before = calls['orders'] ?? 0;
    await (await post('/orders', { 'idempotency-key': 'k-2' })).body?.cancel();
    asserts.assertEquals(calls['orders'], before + 1); // fresh execution

    await (await post('/orders')).body?.cancel();
    await (await post('/orders')).body?.cancel();
    asserts.assertEquals(calls['orders'], before + 3); // keyless: every time
  });

  it('the key is scoped per route — the same key on another route is a fresh record', async () => {
    const r = await post('/other', KEY); // 'k-1' already replayed on /orders
    asserts.assertEquals(await r.json(), { other: 1 });
    asserts.assertEquals(calls['other'], 1);
  });

  it('a no-body (204) completion replays as a 204', async () => {
    const r1 = await post('/empty', { 'idempotency-key': 'k-204' });
    asserts.assertEquals(r1.status, 204);
    const r2 = await post('/empty', { 'idempotency-key': 'k-204' });
    asserts.assertEquals(r2.status, 204);
    asserts.assertEquals(r2.headers.get('idempotency-replayed'), 'true');
    asserts.assertEquals(calls['empty'], 1);
  });

  it('a thrown attempt is never recorded — the retry re-executes', async () => {
    const r1 = await post('/flaky', { 'idempotency-key': 'k-3' });
    asserts.assertEquals(r1.status, 400);
    await r1.body?.cancel();
    const r2 = await post('/flaky', { 'idempotency-key': 'k-3' });
    asserts.assertEquals(r2.status, 200);
    asserts.assertEquals(await r2.json(), { attempt: 2 });
    asserts.assertEquals(r2.headers.get('idempotency-replayed'), null);
  });

  it('a streamed reply passes through un-recorded — the retry re-executes', async () => {
    const r1 = await post('/stream', { 'idempotency-key': 'k-4' });
    asserts.assertEquals(await r1.text(), 'chunk');
    const r2 = await post('/stream', { 'idempotency-key': 'k-4' });
    asserts.assertEquals(await r2.text(), 'chunk');
    asserts.assertEquals(r2.headers.get('idempotency-replayed'), null);
    asserts.assertEquals(calls['stream'], 2);
  });

  it('a concurrent duplicate is rejected 409 while the first attempt runs, then replays', async () => {
    const first = post('/slow', { 'idempotency-key': 'k-5' });
    await new Promise((resolve) => setTimeout(resolve, 20)); // let it claim
    const dup = await post('/slow', { 'idempotency-key': 'k-5' });
    asserts.assertEquals(dup.status, 409);
    asserts.assertEquals((await dup.json()).code, 'RAPID_CONFLICT');

    releaseSlow();
    const r1 = await first;
    asserts.assertEquals(await r1.json(), { done: true });
    const replay = await post('/slow', { 'idempotency-key': 'k-5' });
    asserts.assertEquals(replay.headers.get('idempotency-replayed'), 'true');
    asserts.assertEquals(await replay.json(), { done: true });
  });

  it('a key longer than 255 characters is rejected 400', async () => {
    const r = await post('/orders', { 'idempotency-key': 'x'.repeat(256) });
    asserts.assertEquals(r.status, 400);
    asserts.assertEquals((await r.json()).code, 'RAPID_VALIDATION_FAILED');
    const ok = await post('/orders', { 'idempotency-key': 'y'.repeat(255) });
    asserts.assertEquals(ok.status, 201);
    await ok.body?.cancel();
  });

  it('rejects a non-positive ttl at factory time', () => {
    asserts.assertThrows(
      () => idempotency({ scope: false, ttlMs: 0 }),
      RapidError,
      'ttlMs must be a positive integer',
    );
    asserts.assertThrows(
      () => idempotency({ scope: false, pendingTtlMs: -1 }),
      RapidError,
      'pendingTtlMs must be a positive integer',
    );
  });

  it('refuses to build without a scope — shared replay must be an explicit choice', () => {
    asserts.assertThrows(
      () => idempotency({} as IdempotencyOptions),
      RapidError,
      'requires a scope',
    );
  });
});

describe('rapid.middlewares.idempotency (identity scope)', () => {
  let app: Application;
  let handled = 0;

  const post = (headers: Record<string, string>) =>
    app.fetch(
      new Request('http://app/orders', { method: 'POST', headers }),
    );

  beforeAll(async () => {
    app = await Application.initialize({
      name: 'idempotency-scope',
      server: { port: 0, hostname: '127.0.0.1' },
      logger: { handlers: [] },
    });
    app.use(idempotency({
      scope: (ctx) => ctx.headers.get('x-user') ?? undefined,
    }));
    app.post('/orders', () => {
      handled++;
      return { content: { attempt: handled } };
    });
  });
  afterAll(async () => {
    await app.stop();
  });

  it('the same key from two identities is two records — never a cross-user replay', async () => {
    const a1 = await post({ 'idempotency-key': 'shared', 'x-user': 'alice' });
    asserts.assertEquals(await a1.json(), { attempt: 1 });
    const b1 = await post({ 'idempotency-key': 'shared', 'x-user': 'bob' });
    asserts.assertEquals(await b1.json(), { attempt: 2 }); // executed, not replayed
    asserts.assertEquals(b1.headers.get('idempotency-replayed'), null);
    const a2 = await post({ 'idempotency-key': 'shared', 'x-user': 'alice' });
    asserts.assertEquals(await a2.json(), { attempt: 1 }); // alice's own record
    asserts.assertEquals(a2.headers.get('idempotency-replayed'), 'true');
  });

  it('a scope of undefined (anonymous caller) skips idempotency — no replay, no record', async () => {
    const before = handled;
    await (await post({ 'idempotency-key': 'anon' })).body?.cancel();
    await (await post({ 'idempotency-key': 'anon' })).body?.cancel();
    asserts.assertEquals(handled, before + 2); // both executed
  });

  it("an EMPTY scope value ('' — a blank identity header) skips too, never a shared key space", async () => {
    const before = handled;
    const headers = { 'idempotency-key': 'anon2', 'x-user': '' };
    await (await post(headers)).body?.cancel();
    await (await post(headers)).body?.cancel();
    asserts.assertEquals(handled, before + 2); // both executed — no shared replay
  });
});

describe('rapid.middlewares.idempotency (bounds + store hygiene)', () => {
  it('an unmatched request never touches the store — no keys minted for 404s', async () => {
    let reads = 0;
    const backing = memoryStore<IdempotencyRecord>();
    const spy: Store<IdempotencyRecord> = {
      get: (k) => {
        reads++;
        return backing.get(k);
      },
      set: (k, v, ttl) => backing.set(k, v, ttl),
    };
    const app = await Application.initialize({
      name: 'idempotency-404',
      server: { port: 0, hostname: '127.0.0.1' },
      logger: { handlers: [] },
    });
    app.use(idempotency({ scope: false, store: spy }));
    const r = await app.fetch(
      new Request('http://app/no-such-route', {
        method: 'POST',
        headers: { 'idempotency-key': 'k' },
      }),
    );
    asserts.assertEquals(r.status, 404);
    await r.body?.cancel();
    asserts.assertEquals(reads, 0);
    await app.stop();
  });

  it('a PENDING marker survives eviction pressure — the 409 guarantee holds under key churn', async () => {
    let handled = 0;
    let releaseSlow!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseSlow = resolve;
    });
    const app = await Application.initialize({
      name: 'idempotency-pending',
      server: { port: 0, hostname: '127.0.0.1' },
      logger: { handlers: [] },
    });
    app.use(idempotency({ scope: false, maxRecords: 2 }));
    app.post('/slow', async () => {
      handled++;
      await gate;
      return { content: { done: true } };
    });
    app.post('/n', () => ({ content: { ok: true } }));
    const post = (path: string, key: string) =>
      app.fetch(
        new Request(`http://app${path}`, {
          method: 'POST',
          headers: { 'idempotency-key': key },
        }),
      );
    const first = post('/slow', 'K'); // claims K (pending)
    await new Promise((resolve) => setTimeout(resolve, 20));
    // Churn well past the bound — every COMPLETED record may evict, the
    // in-flight pending marker must not.
    for (const k of ['a', 'b', 'c']) await (await post('/n', k)).body?.cancel();
    const dup = await post('/slow', 'K');
    asserts.assertEquals(dup.status, 409); // marker survived → no double execution
    await dup.body?.cancel();
    releaseSlow();
    await (await first).body?.cancel();
    asserts.assertEquals(handled, 1);
    await app.stop();
  });

  it('a replay serializes the SAME bytes as the first attempt — toJSON projections are honored', async () => {
    class User {
      id = 'u1';
      _passwordHash = 'bcrypt$secret';
      toJSON() {
        return { id: this.id };
      }
    }
    const app = await Application.initialize({
      name: 'idempotency-tojson',
      server: { port: 0, hostname: '127.0.0.1' },
      logger: { handlers: [] },
    });
    app.use(idempotency({ scope: false }));
    app.post('/u', () => ({
      content: { user: new User() } as unknown as Record<string, unknown>,
    }));
    const post = () =>
      app.fetch(
        new Request('http://app/u', {
          method: 'POST',
          headers: { 'idempotency-key': 'k' },
        }),
      );
    const firstBody = await (await post()).text();
    const replayBody = await (await post()).text();
    asserts.assertEquals(replayBody, firstBody); // wire-identical
    asserts.assertEquals(firstBody.includes('secret'), false);
    asserts.assertEquals(replayBody.includes('secret'), false); // no projection bypass
    await app.stop();
  });

  it('memoryStore rejects a non-positive maxEntries (a zero bound would loop set() forever)', () => {
    asserts.assertThrows(
      () => memoryStore({ maxEntries: 0 }),
      RapidError,
      'maxEntries must be a positive integer',
    );
  });

  it('maxRecords bounds the default store — the oldest record evicts, its retry re-executes', async () => {
    let handled = 0;
    const app = await Application.initialize({
      name: 'idempotency-bound',
      server: { port: 0, hostname: '127.0.0.1' },
      logger: { handlers: [] },
    });
    app.use(idempotency({ scope: false, maxRecords: 2 }));
    app.post('/n', () => ({ content: { attempt: ++handled } }));
    const post = (key: string) =>
      app.fetch(
        new Request('http://app/n', {
          method: 'POST',
          headers: { 'idempotency-key': key },
        }),
      );
    await (await post('a')).body?.cancel();
    await (await post('b')).body?.cancel();
    await (await post('c')).body?.cancel(); // evicts 'a'
    const c = await post('c');
    asserts.assertEquals(c.headers.get('idempotency-replayed'), 'true'); // still held
    await c.body?.cancel();
    const a = await post('a');
    asserts.assertEquals(a.headers.get('idempotency-replayed'), null); // evicted → re-ran
    await a.body?.cancel();
    await app.stop();
  });

  it('replayed content is cloned per replay — outer mutation never compounds into the store', async () => {
    const app = await Application.initialize({
      name: 'idempotency-clone',
      server: { port: 0, hostname: '127.0.0.1' },
      logger: { handlers: [] },
    });
    // OUTER of idempotency: mutates the reply content in place after
    // next() — the classic enrichment stamp.
    app.use(async (ctx, next) => {
      await next();
      const content = ctx.response?.content;
      if (content !== null && typeof content === 'object') {
        ((content as { trail?: string[] }).trail ??= []).push(ctx.requestId);
      }
    });
    app.use(idempotency({ scope: false }));
    app.post('/o', () => ({ content: { ok: true } }));
    const post = () =>
      app.fetch(
        new Request('http://app/o', {
          method: 'POST',
          headers: { 'idempotency-key': 'k' },
        }),
      );
    await (await post()).body?.cancel(); // first attempt (stores pre-stamp clone)
    const r2 = await (await post()).json();
    const r3 = await (await post()).json();
    // Aliased records would COMPOUND: each replay's stamp baked into the
    // store, trail growing per replay. Cloned records: always exactly one.
    asserts.assertEquals(r2.trail.length, 1);
    asserts.assertEquals(r3.trail.length, 1);
    asserts.assertNotEquals(r2.trail[0], r3.trail[0]); // each replay's own stamp
    await app.stop();
  });

  it('a rejecting async release never masks the handler error nor crashes the process', async () => {
    const backing = memoryStore<IdempotencyRecord>();
    const failing: Store<IdempotencyRecord> = {
      // deno-lint-ignore require-await
      get: async (k) => backing.get(k),
      // deno-lint-ignore require-await
      set: async (k, v, ttl) => backing.set(k, v, ttl),
      // deno-lint-ignore require-await
      delete: async () => {
        throw new Error('store outage');
      },
    };
    const app = await Application.initialize({
      name: 'idempotency-release',
      server: { port: 0, hostname: '127.0.0.1' },
      logger: { handlers: [] },
    });
    app.use(idempotency({ scope: false, store: failing }));
    app.post('/boom', () => {
      throw new RapidError('RAPID_VALIDATION_FAILED');
    });
    const r = await app.fetch(
      new Request('http://app/boom', {
        method: 'POST',
        headers: { 'idempotency-key': 'k' },
      }),
    );
    asserts.assertEquals(r.status, 400); // the handler's error, not the store's
    asserts.assertEquals((await r.json()).code, 'RAPID_VALIDATION_FAILED');
    await app.stop();
  });
});
