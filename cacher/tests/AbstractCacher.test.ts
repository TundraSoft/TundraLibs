import * as asserts from '$asserts';
import { AbstractCacher } from '../AbstractCacher.ts';
import { CacherConfigError, CacherOperationError } from '../errors/mod.ts';
import type { CacherOptions, CacheValue } from '../types/mod.ts';

// Test implementation of AbstractCacher
class TestCacher extends AbstractCacher {
  public readonly Engine: string = 'MEMORY';

  private store: Record<string, CacheValue> = {};

  // Make protected methods public for testing
  public normalizeKey(key: string): string {
    return this._normalizeKey(key);
  }

  public processOption<K extends keyof CacherOptions>(
    key: K,
    value: any,
  ): any {
    return this._processOption(key, value);
  }

  protected _set(key: string, value: CacheValue): void {
    this.store[key] = value;
  }

  protected _get(key: string): CacheValue | undefined {
    return this.store[key];
  }

  protected _has(key: string): boolean {
    return key in this.store;
  }

  protected _delete(key: string): void {
    delete this.store[key];
  }

  protected _clear(): void {
    this.store = {};
  }
}

Deno.test('Cacher.AbstractCacher', async (t) => {
  await t.step('constructor and initialization', async (t) => {
    await t.step('should create an instance with valid options', () => {
      const cacher = new TestCacher('test-cacher', {
        defaultExpiry: 600,
      });

      asserts.assert(cacher instanceof AbstractCacher);
      asserts.assertEquals(cacher.name, 'test-cacher');
      asserts.assertEquals(cacher.getOption('defaultExpiry'), 600);
    });

    await t.step('should use default options when not provided', () => {
      const cacher = new TestCacher('test-cacher', {});

      asserts.assertEquals(cacher.getOption('defaultExpiry'), 300);
    });

    await t.step('should throw for invalid defaultExpiry', () => {
      asserts.assertThrows(
        () => new TestCacher('test-cacher', { defaultExpiry: -1 }),
        CacherConfigError,
        'Default Expiry (defaultExpiry) must be a positive number between 0 and 216000',
      );

      asserts.assertThrows(
        () => new TestCacher('test-cacher', { defaultExpiry: 300000 }),
        CacherConfigError,
        'Default Expiry (defaultExpiry) must be a positive number between 0 and 216000',
      );
    });
  });

  await t.step('key normalization', async (t) => {
    const cacher = new TestCacher('test-cacher', {});

    await t.step('should normalize keys with namespace', () => {
      const normalizedKey = cacher.normalizeKey('test-key');
      asserts.assertEquals(normalizedKey, 'test-cacher:test-key');
    });

    await t.step('should convert keys to lowercase', () => {
      const normalizedKey = cacher.normalizeKey('TEST-KEY');
      asserts.assertEquals(normalizedKey, 'test-cacher:test-key');
    });

    await t.step('should trim keys', () => {
      const normalizedKey = cacher.normalizeKey(' test-key ');
      asserts.assertEquals(normalizedKey, 'test-cacher:test-key');
    });
  });

  await t.step('cache operations', async (t) => {
    const cacher = new TestCacher('test-cacher', {});

    await t.step('should set and get values', async () => {
      const testData = { name: 'test', value: 123 };

      await cacher.set('test-key', testData, { expiry: 60 });
      const result = await cacher.get<typeof testData>('test-key');

      asserts.assertEquals(result, testData);
    });

    await t.step('should check if a key exists', async () => {
      const testData = { name: 'test', value: 123 };

      await cacher.set('exists-key', testData, { expiry: 60 });
      const exists = await cacher.has('exists-key');
      const notExists = await cacher.has('not-exists-key');

      asserts.assertEquals(exists, true);
      asserts.assertEquals(notExists, false);
    });

    await t.step('should delete a key', async () => {
      const testData = { name: 'test', value: 123 };

      await cacher.set('delete-key', testData, { expiry: 60 });
      await cacher.delete('delete-key');
      const exists = await cacher.has('delete-key');

      asserts.assertEquals(exists, false);
    });

    await t.step('should clear all keys', async () => {
      const testData = { name: 'test', value: 123 };

      await cacher.set('clear-key-1', testData, { expiry: 60 });
      await cacher.set('clear-key-2', testData, { expiry: 60 });
      await cacher.clear();

      const exists1 = await cacher.has('clear-key-1');
      const exists2 = await cacher.has('clear-key-2');

      asserts.assertEquals(exists1, false);
      asserts.assertEquals(exists2, false);
    });

    await t.step(
      'should throw for invalid expiry in set operation',
      async () => {
        const testData = { name: 'test', value: 123 };

        await asserts.assertRejects(
          () => cacher.set('test-key', testData, { expiry: -1 }),
          CacherOperationError,
          'Cache value expiry must be a positive number between 0 and 216000',
        );

        await asserts.assertRejects(
          () => cacher.set('test-key', testData, { expiry: 300000 }),
          CacherOperationError,
          'Cache value expiry must be a positive number between 0 and 216000',
        );
      },
    );
  });
});
