import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { Cacher } from '../../Cacher.ts';
import { CacherEngineError } from '../../errors/mod.ts';
import { WorkersKVCacher, type WorkersKVNamespace } from './mod.ts';

type Put = { key: string; options?: { expirationTtl?: number } };

/** In-memory KV binding that records every `put`. */
const fakeKV = () => {
  const store = new Map<string, string>();
  const puts: Put[] = [];
  const binding: WorkersKVNamespace = {
    get: (key) => Promise.resolve(store.get(key) ?? null),
    put: (key, value, options) => {
      puts.push({ key, options });
      store.set(key, value);
      return Promise.resolve();
    },
    delete: (key) => {
      store.delete(key);
      return Promise.resolve();
    },
  };
  return { binding, store, puts };
};

const rejectsWith = async (fn: () => Promise<unknown>, code: string) => {
  const err = await asserts.assertRejects(fn, CacherEngineError);
  asserts.assertEquals(err.code, code);
  return err;
};

describe('cacher.engines.WorkersKVCacher', () => {
  it('round-trips set, get, has and delete', async () => {
    const { binding } = fakeKV();
    const cache = new WorkersKVCacher('app', { binding });
    await cache.set('user:1', { name: 'Alice' });
    asserts.assertEquals(await cache.get('user:1'), { name: 'Alice' });
    asserts.assert(await cache.has('user:1'));
    await cache.delete('user:1');
    asserts.assertEquals(await cache.get('user:1'), undefined);
    asserts.assertFalse(await cache.has('user:1'));
  });

  it('passes expiry to KV as expirationTtl, and none for 0', async () => {
    const { binding, puts } = fakeKV();
    const cache = new WorkersKVCacher('app', { binding });
    await cache.set('a', 1);
    await cache.set('b', 1, { expiry: 600 });
    await cache.set('c', 1, { expiry: 0 });
    asserts.assertEquals(puts.map((p) => p.options), [
      { expirationTtl: 300 },
      { expirationTtl: 600 },
      undefined,
    ]);
  });

  it('rejects an expiry KV cannot store, before writing', async () => {
    const { binding, puts } = fakeKV();
    const cache = new WorkersKVCacher('app', { binding });
    await rejectsWith(
      () => cache.set('k', 1, { expiry: 59 }),
      'OPERATION_INVALID_PARAMS',
    );
    asserts.assertEquals(puts, []);
    await cache.set('k', 1, { expiry: 60 });
    asserts.assertEquals(puts.length, 1);
  });

  it('rejects window mode, before writing', async () => {
    const { binding, puts } = fakeKV();
    const cache = new WorkersKVCacher('app', { binding });
    const err = await rejectsWith(
      () => cache.set('k', 1, { window: true }),
      'OPERATION_INVALID_PARAMS',
    );
    asserts.assertStringIncludes(err.message, 'window mode is not supported');
    asserts.assertEquals(puts, []);
  });

  it('validates its configuration', () => {
    const { binding } = fakeKV();
    asserts.assertThrows(
      () => new WorkersKVCacher('app', { binding, defaultExpiry: 30 }),
      CacherEngineError,
      'defaultExpiry',
    );
    new WorkersKVCacher('app', { binding, defaultExpiry: 0 });
    const missing = asserts.assertThrows(
      () => new WorkersKVCacher('app', {} as never),
      CacherEngineError,
    );
    asserts.assertEquals(missing.code, 'CONFIG_MISSING');
    const invalid = asserts.assertThrows(
      () =>
        new WorkersKVCacher('app', {
          binding: { get: binding.get, put: binding.put } as never,
        }),
      CacherEngineError,
    );
    asserts.assertEquals(invalid.code, 'CONFIG_INVALID');
  });

  it('keeps namespaces sharing one binding apart', async () => {
    const { binding } = fakeKV();
    const a = new WorkersKVCacher('a', { binding });
    const b = new WorkersKVCacher('b', { binding });
    await a.set('k', 'from-a');
    await b.set('k', 'from-b');
    await a.clear();
    asserts.assertEquals(await a.get('k'), undefined);
    asserts.assertEquals(await b.get('k'), 'from-b');
  });

  it('clear() is stored in KV, so a fresh instance sees it', async () => {
    const { binding } = fakeKV();
    const writer = new WorkersKVCacher('app', { binding });
    await writer.set('k', 'old');
    await writer.clear();
    const reader = new WorkersKVCacher('app', { binding });
    asserts.assertEquals(await reader.get('k'), undefined);
    await writer.set('k', 'new');
    asserts.assertEquals(await reader.get('k'), 'new');
  });

  it('a clear from a stale reader still clears later writes', async () => {
    // KV reads can lag writes by up to 60s. An isolate that still sees the
    // old version must not "clear" to a version another isolate already uses.
    const { binding, store } = fakeKV();
    const stale = new Map(store);
    const a = new WorkersKVCacher('app', { binding });
    const b = new WorkersKVCacher('app', {
      binding: {
        ...binding,
        get: (k) => Promise.resolve(stale.get(k) ?? null),
      },
    });
    await a.clear();
    await a.set('k', 'written after the first clear');
    await b.clear();
    const fresh = new WorkersKVCacher('app', { binding });
    asserts.assertEquals(await fresh.get('k'), undefined);
  });

  it('keeps every stored key within KV’s 512-byte limit', async () => {
    const { binding, puts } = fakeKV();
    const long = 'x'.repeat(600);
    const cache = new WorkersKVCacher('n'.repeat(480), { binding });
    await cache.set(long, 'v');
    asserts.assertEquals(await cache.get(long), 'v');
    await cache.clear();
    for (const { key } of puts) {
      asserts.assert(
        new TextEncoder().encode(key).length <= 512,
        `${key.length}-byte key`,
      );
    }
  });

  it('wraps a KV failure as OPERATION_FAILED with the cause', async () => {
    const { binding } = fakeKV();
    const limited = new Error('KV PUT failed: 429 Too Many Requests');
    const cache = new WorkersKVCacher('app', {
      binding: { ...binding, put: () => Promise.reject(limited) },
    });
    const err = await rejectsWith(() => cache.set('k', 1), 'OPERATION_FAILED');
    asserts.assertStrictEquals(err.cause, limited);
  });

  it('is registered with Cacher as WORKERS_KV', async () => {
    const { binding } = fakeKV();
    const cache = Cacher.create('WORKERS_KV', 'kv-registered', { binding });
    asserts.assertInstanceOf(cache, WorkersKVCacher);
    await cache.set('k', 'v');
    asserts.assertEquals(await cache.get('k'), 'v');
    await Cacher.clear();
  });
});
