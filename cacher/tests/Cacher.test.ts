import { Cacher } from '../Cacher.ts';
import { MemoryCacher, RedisCacher } from '../clients/mod.ts';

import { describe, it } from '../../dev.dependencies.ts';
import { assertEquals } from '../../dev.dependencies.ts';

import { envArgs } from '../../utils/envArgs.ts';

const envData = envArgs('cacher/tests');

// Mock instances

describe('Cacher class', () => {
  it('Initialize a cache instance outside Cacher. Cacher should still be aware of it', () => {
    const _newCache = new MemoryCacher('newCache', { engine: 'MEMORY' });
    const _redisInstance = new RedisCacher('redisInstance', {
      engine: 'REDIS',
      host: envData.get('REDIS_HOST') || 'redis',
      port: 6379,
    });
    assertEquals(Cacher.has('newCache'), true);
    assertEquals(Cacher.has('redisInstance'), true);
  });

  it('Case Insensitive check', () => {
    const _newCache = new MemoryCacher('newCache', { engine: 'MEMORY' });
    const _redisInstance = new RedisCacher('redisInstance', {
      engine: 'REDIS',
      host: envData.get('REDIS_HOST') || 'redis',
      port: 6379,
    });
    assertEquals(Cacher.has('newcache'), true);
    assertEquals(Cacher.has('redisinstance'), true);
  });

  it('Fetch the correct class', () => {
    const _newCache = new MemoryCacher('newCache', { engine: 'MEMORY' });
    const _redisInstance = new RedisCacher('redisInstance', {
      engine: 'REDIS',
      host: envData.get('REDIS_HOST') || 'redis',
      port: 6379,
    });
    assertEquals(Cacher.get('newcache')?.name, 'newCache');
    assertEquals(Cacher.get('redisinstance')?.name, 'redisInstance');
  });

  it('Fetch the correct class', () => {
    const _newCache = new MemoryCacher('newCache', { engine: 'MEMORY' });
    const _redisInstance = new RedisCacher('redisInstance', {
      engine: 'REDIS',
      host: envData.get('REDIS_HOST') || 'redis',
      port: 6379,
    });
    assertEquals(Cacher.get('newcache')?.name, 'newCache');
    assertEquals(Cacher.get('redisinstance')?.name, 'redisInstance');
  });
});
