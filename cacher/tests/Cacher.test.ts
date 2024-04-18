import {
  assertEquals,
  assertInstanceOf,
  assertThrows,
} from '../../dev.dependencies.ts';
import { envArgs } from '../../utils/envArgs.ts';

import { Cacher, MemoryCache, RedisCache, UnsupportedCacherError, CacherDuplicateError, CacherNotFound, type CacherOptions } from '../mod.ts';

const envData = envArgs('cacher/tests/');

Deno.test('Cacher.Manager', async (t) => {
  await t.step('Create a new cache instance', () => {
    const _newCache = new MemoryCache('newCache', { engine: 'MEMORY' });
    const _redisInstance = new RedisCache('redisInstance', {
      engine: 'REDIS',
      host: envData.get('REDIS_HOST') || 'localhost',
      port: 6379,
    });
    assertEquals(Cacher.has('newCache'), true);
    assertEquals(Cacher.has('redisInstance'), true);
  });

  await t.step('Case insensitive check', () => {
    assertEquals(Cacher.has('newcache'), true);
    assertEquals(Cacher.has('REDISINSTANCE'), true);
  });

  await t.step('Fetch the correct class', () => {
    assertEquals(Cacher.get('newcache')?.name, 'newcache');
    assertInstanceOf(Cacher.get('newcache'), MemoryCache);
    assertEquals(Cacher.get('redisinstance')?.name, 'redisinstance');
    assertInstanceOf(Cacher.get('redisinstance'), RedisCache);
  });

  await t.step('Throw error on duplicate name', () => {
    assertThrows(
      () => Cacher.create('newcache', { engine: 'REDIS',
      host: envData.get('REDIS_HOST') || 'localhost',
      port: 6379, } as CacherOptions),
      CacherDuplicateError,
    );
    assertThrows(
      () => Cacher.create('redisinstance', { engine: 'MEMORY' }),
      CacherDuplicateError,
    );
  });

  await t.step('Should NOT throw error if same config is passed', () => {
    Cacher.create('newcache', { engine: 'MEMORY' });
    Cacher.create('redisinstance', {
      engine: 'REDIS',
      host: envData.get('REDIS_HOST') || 'localhost',
      port: 6379,
    } as CacherOptions);
  });

  await t.step('Throw error on unsupported engine', () => {
    assertThrows(
      () => Cacher.create('unsupported', { engine: 'UNKNOWN' } as unknown as CacherOptions),
      UnsupportedCacherError,
    );
  });

  await t.step('Throw error on unknown engine', () => {
    assertThrows(
      () => Cacher.get('sdljfhb'),
      CacherNotFound,
    );
  });

});
