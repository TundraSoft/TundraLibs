import { Cacher } from '../Cacher.ts';
import { AbstractCache } from '../AbstractCache.ts';
import { MemoryCacher, RedisCacher } from '../clients/mod.ts';

import { afterEach, beforeEach, describe, it } from '../../dev.dependencies.ts';
import {
  assertEquals,
  assertStrictEquals,
  assertThrows,
} from '../../dev.dependencies.ts';
// Mock instances

describe('Cacher class', () => {
  it('Initialize a cache instance outside Cacher. Cacher should still be aware of it', () => {
    const newCache = new MemoryCacher('newCache', { engine: 'MEMORY' });
    const redisInstance = new RedisCacher('redisInstance', {
      engine: 'REDIS',
      host: 'localhost',
      port: 6379,
    });
    assertEquals(Cacher.has('newCache'), true);
    assertEquals(Cacher.has('redisInstance'), true);
  });

  it('Case Insensitive check', () => {
    const newCache = new MemoryCacher('newCache', { engine: 'MEMORY' });
    const redisInstance = new RedisCacher('redisInstance', {
      engine: 'REDIS',
      host: 'localhost',
      port: 6379,
    });
    assertEquals(Cacher.has('newcache'), true);
    assertEquals(Cacher.has('redisinstance'), true);
  });

  it('Fetch the correct class', () => {
    const newCache = new MemoryCacher('newCache', { engine: 'MEMORY' });
    const redisInstance = new RedisCacher('redisInstance', {
      engine: 'REDIS',
      host: 'localhost',
      port: 6379,
    });
    assertEquals(Cacher.get('newcache')?.name, 'newCache');
    assertEquals(Cacher.get('redisinstance')?.name, 'redisInstance');
  });

  it('Fetch the correct class', () => {
    const newCache = new MemoryCacher('newCache', { engine: 'MEMORY' });
    const redisInstance = new RedisCacher('redisInstance', {
      engine: 'REDIS',
      host: 'localhost',
      port: 6379,
    });
    assertEquals(Cacher.get('newcache')?.name, 'newCache');
    assertEquals(Cacher.get('redisinstance')?.name, 'redisInstance');
  });
});
