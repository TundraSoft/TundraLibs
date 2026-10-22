/**
 * `getMany` / `setMany` / `deleteMany` — one contract on every engine:
 * memory always; Redis and Memcached when a server is configured; Workers
 * KV through a binding (its REST bulk calls are covered in
 * workers-kv/kvHttpBinding.test.ts).
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

const kvStore = new Map<string, string>();
const engines: Array<
  [string, () => Promise<Engine | null>, { minExpiry: number }]
> = [
  ['MEMORY', () => Promise.resolve(new MemoryCacher('bulk', {}) as Engine), {
    minExpiry: 1,
  }],
  [
    'REDIS',
    () =>
      env.get('REDIS_HOST')
        ? reachable(() =>
          new RedisCacher('bulk', {
            host: env.get('REDIS_HOST'),
            port: Number.parseInt(env.get('REDIS_PORT') || '6379'),
            username: env.get('REDIS_USERNAME') || undefined,
            password: env.get('REDIS_PASSWORD') || undefined,
          }) as unknown as Engine
        )
        : Promise.resolve(null),
    { minExpiry: 1 },
  ],
  [
    'MEMCACHED',
    () =>
      env.get('MEMCACHED_HOST')
        ? reachable(() =>
          new MemCacher('bulk', {
            host: env.get('MEMCACHED_HOST'),
            ...(env.has('MEMCACHED_PORT')
              ? { port: Number.parseInt(env.get('MEMCACHED_PORT')) }
              : {}),
          }) as unknown as Engine
        )
        : Promise.resolve(null),
    { minExpiry: 1 },
  ],
  ['WORKERS_KV', () =>
    Promise.resolve(
      new WorkersKVCacher('bulk', {
        binding: {
          get: (k) => Promise.resolve(kvStore.get(k) ?? null),
          put: (k, v) => {
            kvStore.set(k, v);
            return Promise.resolve();
          },
          delete: (k) => {
            kvStore.delete(k);
            return Promise.resolve();
          },
        },
      }) as unknown as Engine,
    ), { minExpiry: 60 }],
];

for (const [name, open, { minExpiry }] of engines) {
  const engine = await open();
  describe({
    name: `cacher.engines ${name}: getMany / setMany / deleteMany`,
    ignore: engine === null,
    sanitizeResources: false,
    sanitizeOps: false,
    fn: () => {
      const cache = engine!;
      const k = (s: string) => `${s}:${Date.now()}:${seq++}`;

      it('round-trips many values; getMany holds only the keys found', async () => {
        const [a, b, c] = [k('a'), k('b'), k('c')];
        await cache.setMany({ [a]: 1, [b]: { x: 2 } });
        await cache.setMany([[c, 'three']]);
        const found = await cache.getMany([a, b, c, k('missing'), a]);
        asserts.assertEquals(
          found,
          new Map<string, unknown>([[a, 1], [b, { x: 2 }], [c, 'three']]),
        );
        asserts.assertEquals(await cache.get(b), { x: 2 });
        asserts.assertEquals((await cache.getMany([])).size, 0);
      });

      it('deleteMany removes the listed keys and ignores missing ones', async () => {
        const [a, b] = [k('del-a'), k('del-b')];
        await cache.setMany({ [a]: 1, [b]: 2 });
        await cache.deleteMany([a, k('never')]);
        asserts.assertEquals(await cache.getMany([a, b]), new Map([[b, 2]]));
      });

      it('validates every entry before writing any', async () => {
        const [a, b] = [k('bad-a'), k('bad-b')];
        const err = await asserts.assertRejects(
          () => cache.setMany({ [a]: 1, [b]: undefined }),
          CacherEngineError,
        );
        asserts.assertEquals(err.code, 'OPERATION_INVALID_PARAMS');
        asserts.assertEquals((await cache.getMany([a, b])).size, 0);
      });

      if (minExpiry === 1) {
        it('applies the expiry to every entry', async () => {
          const [a, b] = [k('ttl-a'), k('ttl-b')];
          await cache.setMany({ [a]: 1, [b]: 2 }, { expiry: 1 });
          asserts.assertEquals((await cache.getMany([a, b])).size, 2);
          await sleep(2100);
          asserts.assertEquals((await cache.getMany([a, b])).size, 0);
        });
      } else {
        it("rejects an expiry the engine can't store, writing nothing", async () => {
          const a = k('kv-ttl');
          const err = await asserts.assertRejects(
            () => cache.setMany({ [a]: 1 }, { expiry: 30 }),
            CacherEngineError,
          );
          asserts.assertEquals(err.code, 'OPERATION_INVALID_PARAMS');
          asserts.assertEquals(await cache.has(a), false);
        });
      }

      if (name === 'MEMCACHED') {
        it('getMany is one multi-key get, not one get per key', async () => {
          const keys = Array.from({ length: 30 }, (_, i) => k(`mc-${i}`));
          await cache.setMany(keys.map((key, i): [string, number] => [key, i]));
          // deno-lint-ignore no-explicit-any
          const client = (cache as any)._client;
          const calls = { get: 0, getMany: 0 };
          const { get, getMany } = client;
          client.get = (...a: unknown[]) => (calls.get++, get.apply(client, a));
          client.getMany = (...a: unknown[]) => (
            calls.getMany++, getMany.apply(client, a)
          );
          try {
            asserts.assertEquals((await cache.getMany(keys)).size, 30);
          } finally {
            client.get = get;
            client.getMany = getMany;
          }
          asserts.assertEquals(calls, { get: 0, getMany: 1 });
        });
      }

      if (name === 'REDIS' || name === 'MEMCACHED') {
        it('finalize', async () => {
          await cache.finalize();
        });
      }
    },
  });
}
