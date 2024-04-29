import {
  assert,
  assertEquals,
  assertThrows,
} from '../../dev.dependencies.ts';

import { MemoryCache, type MemoryOptions, CacherConfigError } from '../mod.ts';

Deno.test('Cacher:Memory', async (t) => {
  const cacher = new MemoryCache('testCacher', {
    engine: 'MEMORY',
  });

  await t.step('should set and get values correctly', async () => {
    const key = 'testKey';
    const value = { data: 'testData' };
    await cacher.set(key, value);

    const result = await cacher.get(key);

    assertEquals(result, value);
    assertEquals(cacher.engine, 'MEMORY');
  });

  await t.step('should return undefined for non-existent keys', async () => {
    const key = 'nonExistentKey';
    const result = await cacher.get(key);
    assertEquals(result, undefined);
  });

  await t.step('should delete a key correctly', async () => {
    const key = 'testKey';
    const value = { data: 'testData' };
    await cacher.set(key, value);
    assertEquals(await cacher.get(key), value);
    await cacher.delete(key);

    const result = await cacher.get(key);
    assertEquals(result, undefined);
  });

  await t.step('should clear the cache correctly', async () => {
    const key1 = 'testKey1';
    const value1 = { data: 'testData1', adsf: 10 };
    const key2 = 'testKey2';
    const value2 = { data: 'testData2', adsf: 10 };
    await cacher.set(key1, value1);
    await cacher.set(key2, value2);

    await cacher.clear();

    const result1 = await cacher.get(key1);
    const result2 = await cacher.get(key2);
    assertEquals(result1, undefined);
    assertEquals(result2, undefined);
  });

  await t.step('should correctly set expiry and delete expired keys', async () => {
    const key = 'testKey';
    const value = { data: 'testData', adsf: 1 };
    await cacher.set(key, value, { expiry: 1 });

    await new Promise((resolve) => setTimeout(resolve, 2000));

    const result = await cacher.get(key);
    assertEquals(result, undefined);
  });

  await t.step('window function for expiry must work correctly', async () => {
    const key = 'testWindowKey';
    const value = { data: 'testData', adsf: 1 };
    await cacher.set(key, value, { expiry: 2, window: true});

    await new Promise((resolve) => setTimeout(resolve, 1000));

    const result = await cacher.get(key);
    assertEquals(result, { data: 'testData', adsf: 1 });
    await new Promise((resolve) => setTimeout(resolve, 1200));
    assertEquals(await cacher.has(key), true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    assertEquals(await cacher.has(key), false);
  });

  // Errors
  await t.step('throw error on invalid engine', () => {
    const test = {
      engine: 'sdfg'
    }
    assertThrows(() => new MemoryCache('tester', test as MemoryOptions), CacherConfigError, 'Invalid configuration value passed for engine - sdfg in tester');
    // Lets check the error out
    try {
      new MemoryCache('tester', test as MemoryOptions)
    } catch (e) {
      if (e instanceof CacherConfigError) {
        assertEquals(e.engine, 'MEMORY');
        assertEquals(e.config, 'tester');
        assertEquals(e.name, 'CacherConfigError');
        assertEquals(e.library, 'Cacher');
        assert(e.toString());
      }
    }
  });
});
