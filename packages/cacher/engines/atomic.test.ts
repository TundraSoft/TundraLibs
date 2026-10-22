/**
 * `add` (set-if-absent) and `increment` — one contract, every engine that
 * can do them atomically: memory always; Redis and Memcached when a server
 * is configured (as their own suites gate). Workers KV must refuse both.
 */

import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { envArgs } from '@tundralibs/utils';
import type { AbstractEngine } from '../AbstractEngine.ts';
import { CacherEngineError } from '../errors/mod.ts';
import { MemCacher } from './memcached/mod.ts';
import { MemoryCacher } from './memory/mod.ts';
import { RedisCacher } from './redis/mod.ts';
import { WorkersKVCacher } from './workers-kv/mod.ts';

const env = envArgs('./packages/cacher/engines/');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let seq = 0;

type Engine = AbstractEngine<Record<string, unknown>>;

/** A connected engine, or `null` when its server is not reachable. */
async function reachable(make: () => Engine): Promise<Engine | null> {
  const engine = make();
  try {
    await engine.init();
    return engine;
  } catch {
    try {
      await engine.finalize();
    } catch {
      // Probe teardown only.
    }
    return null;
  }
}

const engines: Array<[string, () => Promise<Engine | null>]> = [
  ['MEMORY', () => Promise.resolve(new MemoryCacher('atomic', {}) as Engine)],
  [
    'REDIS',
    () =>
      env.get('REDIS_HOST')
        ? reachable(() =>
          new RedisCacher('atomic', {
            host: env.get('REDIS_HOST'),
            port: Number.parseInt(env.get('REDIS_PORT') || '6379'),
            username: env.get('REDIS_USERNAME') || undefined,
            password: env.get('REDIS_PASSWORD') || undefined,
          }) as unknown as Engine
        )
        : Promise.resolve(null),
  ],
  [
    'MEMCACHED',
    () =>
      env.get('MEMCACHED_HOST')
        ? reachable(() =>
          new MemCacher('atomic', {
            host: env.get('MEMCACHED_HOST'),
            ...(env.has('MEMCACHED_PORT')
              ? { port: Number.parseInt(env.get('MEMCACHED_PORT')) }
              : {}),
          }) as unknown as Engine
        )
        : Promise.resolve(null),
  ],
];

for (const [name, open] of engines) {
  const engine = await open();
  describe({
    name: `cacher.engines ${name}: add / increment`,
    ignore: engine === null,
    sanitizeResources: false,
    sanitizeOps: false,
    fn: () => {
      const cache = engine!;
      const key = (k: string) => `${k}:${Date.now()}:${seq++}`;

      it('add: of many concurrent calls on one key, exactly one sets it', async () => {
        const k = key('add');
        const results = await Promise.all(
          Array.from({ length: 50 }, (_, i) => cache.add(k, { winner: i })),
        );
        asserts.assertEquals(results.filter((r) => r).length, 1);
        const winner = results.indexOf(true);
        asserts.assertEquals(await cache.get(k), { winner });
        asserts.assertEquals(await cache.add(k, 'again'), false);
      });

      it('add: an expired key is absent again', async () => {
        const k = key('add-ttl');
        asserts.assert(await cache.add(k, 1, { expiry: 1 }));
        await sleep(2100);
        asserts.assertEquals(await cache.has(k), false);
        asserts.assertEquals(await cache.get(k), undefined);
        asserts.assert(await cache.add(k, 2, { expiry: 1 }));
      });

      it('increment: concurrent calls never lose an update; get reads a number', async () => {
        const k = key('incr');
        const results = await Promise.all(
          Array.from({ length: 100 }, () => cache.increment(k)),
        );
        asserts.assertEquals(
          [...results].sort((a, b) => a - b),
          Array.from({ length: 100 }, (_, i) => i + 1),
        );
        asserts.assertStrictEquals(await cache.get(k), 100);
        asserts.assert(await cache.has(k));
        asserts.assertEquals(await cache.increment(k, 5), 105);
      });

      it('increment: a counter created with an expiry expires', async () => {
        const k = key('incr-ttl');
        asserts.assertEquals(await cache.increment(k, 3, { expiry: 1 }), 3);
        asserts.assertEquals(await cache.increment(k, 1, { expiry: 1 }), 4);
        await sleep(2100);
        asserts.assertEquals(await cache.has(k), false);
        asserts.assertEquals(await cache.increment(k, 1, { expiry: 1 }), 1);
      });

      it('increment: refuses a non-integer value and a bad step', async () => {
        const k = key('incr-bad');
        await cache.set(k, { not: 'a number' });
        const failed = await asserts.assertRejects(
          () => cache.increment(k),
          CacherEngineError,
        );
        asserts.assertEquals(failed.code, 'OPERATION_FAILED');
        for (const by of [0, -1, 1.5]) {
          const bad = await asserts.assertRejects(
            () => cache.increment(key('incr-by'), by),
            CacherEngineError,
          );
          asserts.assertEquals(bad.code, 'OPERATION_INVALID_PARAMS');
        }
      });

      if (name !== 'MEMORY') {
        it('finalize', async () => {
          await cache.finalize();
        });
      }
    },
  });
}

describe('cacher.engines WORKERS_KV: add / increment', () => {
  it('refuses both: KV cannot do them atomically', async () => {
    const writes: string[] = [];
    const cache = new WorkersKVCacher('atomic', {
      binding: {
        get: () => Promise.resolve(null),
        put: (key) => {
          writes.push(key);
          return Promise.resolve();
        },
        delete: () => Promise.resolve(),
      },
    });
    for (const call of [() => cache.add('k', 1), () => cache.increment('k')]) {
      const err = await asserts.assertRejects(call, CacherEngineError);
      asserts.assertEquals(err.code, 'OPERATION_NOT_SUPPORTED');
    }
    asserts.assertEquals(writes, [], 'never emulated with a read and a write');
  });
});
