import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat';
import { AbstractEngine } from './AbstractEngine.ts';
import { CacherEngineError } from './errors/mod.ts';
import type { CacherOptions, CacheValue } from './types/mod.ts';

// Wave-note: emission/option accessors are protected now — tests reach
// them through deliberate casts.
// deno-lint-ignore no-explicit-any
const readOption = (t: unknown, k: string): any =>
  // deno-lint-ignore no-explicit-any
  (t as any)._getOption(k);
// deno-lint-ignore no-explicit-any
const readOptions = (t: unknown): any =>
  // deno-lint-ignore no-explicit-any
  (t as any)._getOptions();
// deno-lint-ignore no-explicit-any
const fireEvent = (t: unknown, e: string, ...a: unknown[]): any =>
  // deno-lint-ignore no-explicit-any
  (t as any)._emitRaw(e, ...a);

/**
 * Test implementation of AbstractEngine for comprehensive testing
 */
class TestEngine extends AbstractEngine<CacherOptions> {
  public readonly Engine = 'TEST';

  private readonly _storage = new Map<string, CacheValue>();
  private _shouldFailInit = false;
  private _shouldFailFinalize = false;
  private _initCallCount = 0;
  private _finalizeCallCount = 0;

  // Test helpers
  setFailInit(shouldFail: boolean) {
    this._shouldFailInit = shouldFail;
  }

  setFailFinalize(shouldFail: boolean) {
    this._shouldFailFinalize = shouldFail;
  }

  getInitCallCount(): number {
    return this._initCallCount;
  }

  getFinalizeCallCount(): number {
    return this._finalizeCallCount;
  }

  getStorageSize(): number {
    return this._storage.size;
  }

  getRawStorage(): Map<string, CacheValue> {
    return this._storage;
  }

  public override async init(): Promise<void> {
    this._initCallCount++;
    if (this._shouldFailInit) {
      throw new Error('Test init failure');
    }
  }

  public override async finalize(): Promise<void> {
    this._finalizeCallCount++;
    if (this._shouldFailFinalize) {
      throw new Error('Test finalize failure');
    }
    this._storage.clear();
  }

  protected override async _set(key: string, value: CacheValue): Promise<void> {
    this._storage.set(key, value);
  }

  protected override async _get(key: string): Promise<CacheValue | undefined> {
    const value = this._storage.get(key);

    // Simulate expiry checking
    if (value && value.expiry > 0) {
      // For testing purposes, we don't do actual time-based expiry
      // The memory engine handles this properly
    }

    return value;
  }

  protected override async _has(key: string): Promise<boolean> {
    return this._storage.has(key);
  }

  protected override async _delete(key: string): Promise<void> {
    this._storage.delete(key);
  }

  protected override async _clear(): Promise<void> {
    this._storage.clear();
  }
}

/**
 * Synchronous test engine to test sync abstract methods
 */
class SyncTestEngine extends AbstractEngine<CacherOptions> {
  public readonly Engine = 'SYNC_TEST';

  private readonly _storage = new Map<string, CacheValue>();

  protected _set(key: string, value: CacheValue): void {
    this._storage.set(key, value);
  }

  protected _get(key: string): CacheValue | undefined {
    return this._storage.get(key);
  }

  protected _has(key: string): boolean {
    return this._storage.has(key);
  }

  protected _delete(key: string): void {
    this._storage.delete(key);
  }

  protected _clear(): void {
    this._storage.clear();
  }
}

describe('cacher.AbstractEngine', () => {
  describe('constructor and initialization', () => {
    it(
      'should create an instance with proper name and options',
      () => {
        const engine = new TestEngine('test-cache', { defaultExpiry: 600 });

        asserts.assertEquals(engine.name, 'test-cache');
        asserts.assertEquals(engine.Engine, 'TEST');
        asserts.assertEquals(readOption(engine, 'defaultExpiry'), 600);
      },
    );

    it('should trim whitespace from name', () => {
      const engine = new TestEngine('  test-cache  ', {});
      asserts.assertEquals(engine.name, 'test-cache');
    });

    it('should reject an instance name containing the ":" namespace separator', () => {
      // ':' is the reserved namespace separator: every engine stores keys as
      // `${name}:${key}` (see _normalizeKey). A name that is a colon-prefix of
      // another (e.g. 'app' vs 'app:sessions') lets RedisCacher.clear()'s
      // `${name}:*` glob wipe the sibling namespace. Enforce it in the base
      // class so EVERY engine — including directly-constructed engines that
      // bypass the Cacher manager — rejects it, not just Cacher.create().
      asserts.assertThrows(
        () => new TestEngine('app:sessions', {}),
        CacherEngineError,
        'must not contain ":"',
      );
      // Rejection triggers regardless of surrounding whitespace (trim runs
      // first, but the interior ':' survives).
      asserts.assertThrows(
        () => new TestEngine('  a:b  ', {}),
        CacherEngineError,
        'must not contain ":"',
      );
    });

    it('should use default options when not provided', () => {
      const engine = new TestEngine('test', {});
      asserts.assertEquals(readOption(engine, 'defaultExpiry'), 300);
    });

    it('should validate defaultExpiry option', () => {
      asserts.assertThrows(
        () => new TestEngine('test', { defaultExpiry: -1 }),
        CacherEngineError,
        'Configuration value for defaultExpiry is invalid',
      );

      asserts.assertThrows(
        () => new TestEngine('test', { defaultExpiry: Number.NaN }),
        CacherEngineError,
        'Configuration value for defaultExpiry is invalid',
      );

      asserts.assertThrows(
        () => new TestEngine('test', { defaultExpiry: 'invalid' as any }),
        CacherEngineError,
        'Configuration value for defaultExpiry is invalid',
      );
    });

    it('should accept zero as valid defaultExpiry', () => {
      const engine = new TestEngine('test', { defaultExpiry: 0 });
      asserts.assertEquals(readOption(engine, 'defaultExpiry'), 0);
    });
  });

  describe('initialization and finalization', () => {
    it('calls init() on every operation (engines make init idempotent)', async () => {
      const engine = new TestEngine('test', {});

      asserts.assertEquals(engine.getInitCallCount(), 0);

      // AbstractEngine calls init() unconditionally before each public op;
      // engines are expected to make init() idempotent (a no-op once ready).
      await engine.set('key1', 'value1');
      await engine.get('key1');
      await engine.has('key1');
      await engine.delete('key1');
      await engine.clear();

      // One init() per operation → 5 for these 5 calls.
      asserts.assertEquals(engine.getInitCallCount(), 5);
    });

    it('should handle init failures gracefully', async () => {
      const engine = new TestEngine('test', {});
      engine.setFailInit(true);

      await asserts.assertRejects(
        () => engine.set('key1', 'value1'),
        Error,
        'Test init failure',
      );
    });

    it('should handle finalize calls', async () => {
      const engine = new TestEngine('test', {});

      asserts.assertEquals(engine.getFinalizeCallCount(), 0);

      await engine.finalize();
      asserts.assertEquals(engine.getFinalizeCallCount(), 1);
    });

    it('should handle finalize failures gracefully', async () => {
      const engine = new TestEngine('test', {});
      engine.setFailFinalize(true);

      await asserts.assertRejects(
        () => engine.finalize(),
        Error,
        'Test finalize failure',
      );
    });
  });

  describe('key normalization', () => {
    it('should normalize keys by trimming only (case-preserving)', async () => {
      const engine = new TestEngine('test-cache', {});

      // Set with various key formats
      await engine.set('  KEY1  ', 'value1');
      await engine.set('Key2', 'value2');
      await engine.set('key3', 'value3');

      // Keys are trimmed but case is preserved, so the exact (trimmed) case
      // is required to read them back.
      asserts.assertEquals(await engine.get('KEY1'), 'value1');
      asserts.assertEquals(await engine.get('Key2'), 'value2');
      asserts.assertEquals(await engine.get('  key3  '), 'value3');

      // Check raw storage to verify normalization preserves case.
      const storage = engine.getRawStorage();
      asserts.assert(storage.has('test-cache:KEY1'));
      asserts.assert(storage.has('test-cache:Key2'));
      asserts.assert(storage.has('test-cache:key3'));
    });

    it('should treat keys differing only in case as distinct', async () => {
      const engine = new TestEngine('test-cache', {});

      // "User:1" and "user:1" must NOT collide on the same entry.
      await engine.set('User:1', 'upper');
      await engine.set('user:1', 'lower');

      asserts.assertEquals(await engine.get('User:1'), 'upper');
      asserts.assertEquals(await engine.get('user:1'), 'lower');

      const storage = engine.getRawStorage();
      asserts.assert(storage.has('test-cache:User:1'));
      asserts.assert(storage.has('test-cache:user:1'));
      asserts.assertEquals(storage.size, 2);
    });

    it('should add namespace prefix to keys', async () => {
      const engine = new TestEngine('my-namespace', {});

      await engine.set('testkey', 'value');

      const storage = engine.getRawStorage();
      asserts.assert(storage.has('my-namespace:testkey'));
      asserts.assertFalse(storage.has('testkey'));
    });
  });

  describe('set operation', () => {
    it('should store values with default options', async () => {
      const engine = new TestEngine('test', { defaultExpiry: 300 });

      await engine.set('key1', 'string-value');
      await engine.set('key2', { complex: 'object', num: 42 });
      await engine.set('key3', [1, 2, 3]);
      await engine.set('key4', 123);
      await engine.set('key5', true);
      await engine.set('key6', null);

      asserts.assertEquals(await engine.get('key1'), 'string-value');
      asserts.assertEquals(await engine.get('key2'), {
        complex: 'object',
        num: 42,
      });
      asserts.assertEquals(await engine.get('key3'), [1, 2, 3]);
      asserts.assertEquals(await engine.get('key4'), 123);
      asserts.assertEquals(await engine.get('key5'), true);
      asserts.assertEquals(await engine.get('key6'), null);
    });

    it('should store values with custom expiry', async () => {
      const engine = new TestEngine('test', {});

      await engine.set('key1', 'value1', { expiry: 600 });

      const storage = engine.getRawStorage();
      const stored = storage.get('test:key1');
      asserts.assert(stored);
      asserts.assertEquals(stored.expiry, 600);
      asserts.assertEquals(stored.window, false);
    });

    it('should store values with window mode', async () => {
      const engine = new TestEngine('test', {});

      await engine.set('key1', 'value1', { window: true });

      const storage = engine.getRawStorage();
      const stored = storage.get('test:key1');
      asserts.assert(stored);
      asserts.assertEquals(stored.window, true);
    });

    it('should validate expiry values', async () => {
      const engine = new TestEngine('test', {});

      await asserts.assertRejects(
        () => engine.set('key1', 'value1', { expiry: -1 }),
        CacherEngineError,
        'Invalid parameters for operation SET',
      );

      await asserts.assertRejects(
        () => engine.set('key1', 'value1', { expiry: Number.NaN }),
        CacherEngineError,
        'Invalid parameters for operation SET',
      );

      await asserts.assertRejects(
        () => engine.set('key1', 'value1', { expiry: 'invalid' as any }),
        CacherEngineError,
        'Invalid parameters for operation SET',
      );
    });

    it('should accept zero expiry', async () => {
      const engine = new TestEngine('test', {});

      // Should not throw
      await engine.set('key1', 'value1', { expiry: 0 });

      const storage = engine.getRawStorage();
      const stored = storage.get('test:key1');
      asserts.assert(stored);
      asserts.assertEquals(stored.expiry, 0);
    });

    it('should serialize values to JSON', async () => {
      const engine = new TestEngine('test', {});

      const complexValue = {
        string: 'test',
        number: 42,
        boolean: true,
        array: [1, 2, 3],
        nested: { deep: { value: 'nested' } },
      };

      await engine.set('complex', complexValue);

      const storage = engine.getRawStorage();
      const stored = storage.get('test:complex');
      asserts.assert(stored);
      asserts.assertEquals(typeof stored.data, 'string');
      asserts.assertEquals(JSON.parse(stored.data), complexValue);
    });
  });

  describe('get operation', () => {
    it('should retrieve stored values', async () => {
      const engine = new TestEngine('test', {});

      await engine.set('key1', 'value1');
      await engine.set('key2', { obj: 'value' });

      asserts.assertEquals(await engine.get('key1'), 'value1');
      asserts.assertEquals(await engine.get('key2'), { obj: 'value' });
    });

    it('should return undefined for non-existent keys', async () => {
      const engine = new TestEngine('test', {});

      asserts.assertEquals(await engine.get('nonexistent'), undefined);
    });

    it('should deserialize JSON values', async () => {
      const engine = new TestEngine('test', {});

      const originalValue = { complex: 'object', array: [1, 2, 3], num: 42 };
      await engine.set('key1', originalValue);

      const retrieved = await engine.get('key1');
      asserts.assertEquals(retrieved, originalValue);
    });
  });

  describe('has operation', () => {
    it('should return true for existing keys', async () => {
      const engine = new TestEngine('test', {});

      await engine.set('key1', 'value1');

      asserts.assertEquals(await engine.has('key1'), true);
    });

    it('should return false for non-existent keys', async () => {
      const engine = new TestEngine('test', {});

      asserts.assertEquals(await engine.has('nonexistent'), false);
    });

    it('should normalize keys for checking (trim only, case-sensitive)', async () => {
      const engine = new TestEngine('test', {});

      await engine.set('  KEY1  ', 'value1');

      // Trimming is applied, case is preserved.
      asserts.assertEquals(await engine.has('KEY1'), true);
      asserts.assertEquals(await engine.has('  KEY1  '), true);
      // Different case is a different key.
      asserts.assertEquals(await engine.has('key1'), false);
    });
  });

  describe('delete operation', () => {
    it('should delete existing keys', async () => {
      const engine = new TestEngine('test', {});

      await engine.set('key1', 'value1');
      asserts.assertEquals(await engine.has('key1'), true);

      await engine.delete('key1');
      asserts.assertEquals(await engine.has('key1'), false);
      asserts.assertEquals(await engine.get('key1'), undefined);
    });

    it('should handle deletion of non-existent keys', async () => {
      const engine = new TestEngine('test', {});

      // Should not throw
      await engine.delete('nonexistent');
    });

    it('should normalize keys for deletion (trim only, case-sensitive)', async () => {
      const engine = new TestEngine('test', {});

      await engine.set('  KEY1  ', 'value1');
      // Different case must not delete the entry...
      await engine.delete('key1');
      asserts.assertEquals(await engine.has('KEY1'), true);
      // ...the matching (trimmed) case does.
      await engine.delete('  KEY1  ');
      asserts.assertEquals(await engine.has('KEY1'), false);
    });
  });

  describe('clear operation', () => {
    it('should clear all keys', async () => {
      const engine = new TestEngine('test', {});

      await engine.set('key1', 'value1');
      await engine.set('key2', 'value2');
      await engine.set('key3', 'value3');

      asserts.assertEquals(engine.getStorageSize(), 3);

      await engine.clear();

      asserts.assertEquals(engine.getStorageSize(), 0);
      asserts.assertEquals(await engine.has('key1'), false);
      asserts.assertEquals(await engine.has('key2'), false);
      asserts.assertEquals(await engine.has('key3'), false);
    });

    it('should handle clearing empty cache', async () => {
      const engine = new TestEngine('test', {});

      // Should not throw
      await engine.clear();
      asserts.assertEquals(engine.getStorageSize(), 0);
    });
  });

  describe('synchronous engine support', () => {
    it('should work with synchronous implementations', async () => {
      const engine = new SyncTestEngine('sync-test', {});

      await engine.set('key1', 'value1');
      asserts.assertEquals(await engine.get('key1'), 'value1');
      asserts.assertEquals(await engine.has('key1'), true);

      await engine.delete('key1');
      asserts.assertEquals(await engine.has('key1'), false);

      await engine.set('key2', 'value2');
      await engine.clear();
      asserts.assertEquals(await engine.has('key2'), false);
    });
  });

  describe('expiry validation', () => {
    it(
      'should validate expiry parameter types correctly',
      async () => {
        const engine = new TestEngine('test', {});

        // Valid expiry values
        await engine.set('key1', 'value', { expiry: 0 });
        await engine.set('key2', 'value', { expiry: 300 });
        await engine.set('key3', 'value', { expiry: 3600.5 }); // decimal should work

        // 30 days (the cap) is valid; Infinity and anything above the cap are
        // rejected — Memcached would otherwise misread a large expiry as an
        // absolute timestamp and store the value already-expired.
        await engine.set('key4', 'value', { expiry: 2592000 });
        await asserts.assertRejects(
          () => engine.set('key4b', 'value', { expiry: Infinity }),
          CacherEngineError,
        );
        await asserts.assertRejects(
          () => engine.set('key4c', 'value', { expiry: 2592001 }),
          CacherEngineError,
        );

        // Invalid expiry values should throw
        await asserts.assertRejects(
          () => engine.set('key5', 'value', { expiry: -0.1 }),
          CacherEngineError,
        );

        await asserts.assertRejects(
          () => engine.set('key6', 'value', { expiry: -Infinity }),
          CacherEngineError,
        );
      },
    );
  });

  describe('option processing', () => {
    it(
      'should process defaultExpiry option correctly in _processOption',
      () => {
        const engine = new TestEngine('test', { defaultExpiry: 600 });
        asserts.assertEquals(readOption(engine, 'defaultExpiry'), 600);

        // Test with undefined (should get default)
        const engine2 = new TestEngine('test2', {});
        asserts.assertEquals(readOption(engine2, 'defaultExpiry'), 300);
      },
    );
  });

  describe('edge cases and error handling', () => {
    it(
      'should handle undefined and null values correctly',
      async () => {
        const engine = new TestEngine('test', {});

        await engine.set('null-key', null);

        // null should be retrievable
        asserts.assertEquals(await engine.get('null-key'), null);

        // `undefined` has no JSON representation (`JSON.stringify(undefined)`
        // returns the value `undefined`, not a string). Previously set() stored
        // that as CacheValue.data, producing a poisoned entry: has() reported it
        // present while get() ran JSON.parse(undefined) and threw a raw
        // SyntaxError. set() must now reject it up front with the engine's own
        // CacherEngineError contract and write nothing.
        await asserts.assertRejects(
          () => engine.set('undefined-key', undefined),
          CacherEngineError,
          'value must be JSON-serialisable',
        );
        // No poisoned entry was written: has() is false and get() is undefined,
        // and get() must never throw a raw SyntaxError.
        asserts.assertEquals(await engine.has('undefined-key'), false);
        asserts.assertEquals(await engine.get('undefined-key'), undefined);
      },
    );

    it('should handle empty string keys', async () => {
      const engine = new TestEngine('test', {});

      await engine.set('', 'empty-key-value');
      asserts.assertEquals(await engine.get(''), 'empty-key-value');
    });

    it('should handle very long keys', async () => {
      const engine = new TestEngine('test', {});
      const longKey = 'x'.repeat(1000);

      await engine.set(longKey, 'long-key-value');
      asserts.assertEquals(await engine.get(longKey), 'long-key-value');
    });

    it('should handle special characters in keys', async () => {
      const engine = new TestEngine('test', {});
      const specialKey =
        'key:with!@#$%^&*()_+-={}[]|\\:";\'<>?,./special~chars'; //NOSONAR

      await engine.set(specialKey, 'special-value');
      asserts.assertEquals(await engine.get(specialKey), 'special-value');
    });
  });
});
