/**
 * @fileoverview idempotency — replay, concurrent 409, key scoping, and
 * the never-record rules (throws, streams), driven through `app.fetch`.
 * @module
 */
import { afterAll, beforeAll, describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { Application } from '../Application.ts';
import { RapidError } from '../errors/mod.ts';
import { idempotency } from './idempotency.ts';

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
    app.use(idempotency());
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

  it('rejects a non-positive ttl at factory time', () => {
    asserts.assertThrows(
      () => idempotency({ ttlMs: 0 }),
      RapidError,
      'ttlMs must be a positive integer',
    );
    asserts.assertThrows(
      () => idempotency({ pendingTtlMs: -1 }),
      RapidError,
      'pendingTtlMs must be a positive integer',
    );
  });
});
