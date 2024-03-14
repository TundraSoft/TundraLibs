import { afterEach, beforeEach, describe, it, assertEquals, assertThrows } from '../../dev.dependencies.ts';

import { MemoryCacher } from '../clients/mod.ts';

describe('Cacher', () => {
  describe('MemoryCacher', () => {
    let cacher: MemoryCacher;

    beforeEach(() => {
      cacher = new MemoryCacher('testCacher', {
        engine: 'MEMORY',
      });
    });

    afterEach(async () => {
      await cacher.clear();
    });

    it('throw error on invalid engine', () => {
      assertThrows(() => { 
        new MemoryCacher('testCacher', JSON.parse(JSON.stringify({
          engine: 'INVALID',
        })));
      });
    });

    it('should set and get values correctly', async () => {
      const key = 'testKey';
      const value = { data: 'testData' };
      await cacher.set(key, value);

      const result = await cacher.get(key);

      assertEquals(result, value);
    });

    it('should return undefined for non-existent keys', async () => {
      const key = 'nonExistentKey';
      const result = await cacher.get(key);
      assertEquals(result, undefined);
    });

    it('should delete a key correctly', async () => {
      const key = 'testKey';
      const value = { data: 'testData' };
      await cacher.set(key, value);
      assertEquals(await cacher.get(key), value);
      await cacher.delete(key);

      const result = await cacher.get(key);
      assertEquals(result, undefined);
    });

    it('should clear the cache correctly', async () => {
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

    it('should correctly set expiry and delete expired keys', async () => {
      const key = 'testKey';
      const value = { data: 'testData', adsf: 1 };
      await cacher.set(key, value, { expiry: 1 });

      await new Promise((resolve) => setTimeout(resolve, 2000));

      const result = await cacher.get(key);
      assertEquals(result, undefined);
    });
  });
});
