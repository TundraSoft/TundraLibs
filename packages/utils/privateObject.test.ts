import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat';
import { privateObject } from './privateObject.ts';
import type { PrivateObject } from './privateObject.ts';

describe('utils.privateObject', () => {
  let secretObject: PrivateObject;

  describe('sealed object', () => {
    it('get should return the value for a given key', () => {
      secretObject = privateObject<Record<string, unknown>>({
        key1: 'value1',
        key2: 'value2',
      }, false);
      asserts.assertEquals(secretObject.get('key1'), 'value1');
      asserts.assertEquals(secretObject.get('key2'), 'value2');
      asserts.assertEquals(secretObject.get('key3'), undefined);
    });

    it(
      'has should return true if the key exists, otherwise false',
      () => {
        secretObject = privateObject<Record<string, unknown>>({
          key1: 'value1',
          key2: 'value2',
        }, false);
        asserts.assertEquals(secretObject.has('key1'), true);
        asserts.assertEquals(secretObject.has('key2'), true);
        asserts.assertEquals(secretObject.has('key3'), false);
      },
    );

    it('set should set the value for a given key', () => {
      secretObject = privateObject<Record<string, unknown>>({
        key1: 'value1',
        key2: 'value2',
      }, false);
      secretObject.set('key1', 'new value');
      asserts.assertEquals(secretObject.get('key1'), 'value1'); // Should not change
      secretObject.set('key3', 'value3');
      asserts.assertEquals(secretObject.get('key3'), undefined);
      asserts.assertEquals(secretObject.has('key3'), false);
    });

    it(
      'delete should remove the key and its value from the object',
      () => {
        secretObject = privateObject<Record<string, unknown>>({
          key1: 'value1',
          key2: 'value2',
        }, false);
        secretObject.delete('key1');
        asserts.assertEquals(secretObject.get('key1'), 'value1');
        asserts.assertEquals(secretObject.has('key1'), true);
        secretObject.delete('key3'); // Deleting non-existing key should not throw error
      },
    );

    it('test foreach', () => {
      secretObject = privateObject<Record<string, unknown>>({
        key1: 'value1',
        key2: 'value2',
      }, false);
      const keys: string[] = [];
      const values: unknown[] = [];
      secretObject.forEach((key, value) => {
        keys.push(key);
        values.push(value);
      });
      asserts.assertEquals(keys, ['key1', 'key2']);
      asserts.assertEquals(values, ['value1', 'value2']);
    });

    it('should return correct keys', () => {
      secretObject = privateObject<Record<string, unknown>>({
        key1: 'value1',
        key2: 'value2',
      }, false);
      const keys = secretObject.keys();
      asserts.assertEquals(keys.length, 2);
      asserts.assertEquals(keys.includes('key1'), true);
      asserts.assertEquals(keys.includes('key2'), true);
    });

    it('asObject should return a defensive copy that does not leak the store', () => {
      const originalObj = {
        key1: 'value1',
        key2: 'value2',
      };
      secretObject = privateObject<Record<string, unknown>>(originalObj, false);
      const returnedObj = secretObject.asObject();
      // Deep-equal to the backing data...
      asserts.assertEquals(returnedObj, originalObj);
      // ...but NOT the live reference — read-only hands back a copy.
      asserts.assertNotStrictEquals(returnedObj, originalObj);

      // Mutating the returned object must not leak into the hidden store.
      returnedObj.key1 = 'mutated';
      returnedObj.key3 = 'injected';
      delete returnedObj.key2;

      asserts.assertEquals(secretObject.get('key1'), 'value1');
      asserts.assertEquals(secretObject.get('key2'), 'value2');
      asserts.assertEquals(secretObject.has('key3'), false);
      // A fresh asObject() still reflects the untouched store.
      asserts.assertEquals(secretObject.asObject(), {
        key1: 'value1',
        key2: 'value2',
      });
    });
  });

  describe('unsealed object', () => {
    it('initialize empty and set', () => {
      secretObject = privateObject<Record<string, unknown>>();
      asserts.assertEquals(secretObject.has('key1'), false);
      secretObject.set('key1', 'value1');
      asserts.assertEquals(secretObject.get('key1'), 'value1');
    });

    it('get should return the value for a given key', () => {
      secretObject = privateObject<Record<string, unknown>>({
        key1: 'value1',
        key2: 'value2',
      });
      asserts.assertEquals(secretObject.get('key1'), 'value1');
      asserts.assertEquals(secretObject.get('key2'), 'value2');
      asserts.assertEquals(secretObject.get('key3'), undefined);
    });

    it(
      'has should return true if the key exists, otherwise false',
      () => {
        secretObject = privateObject<Record<string, unknown>>({
          key1: 'value1',
          key2: 'value2',
        });
        asserts.assertEquals(secretObject.has('key1'), true);
        asserts.assertEquals(secretObject.has('key2'), true);
        asserts.assertEquals(secretObject.has('key3'), false);
      },
    );

    it('set should set the value for a given key', () => {
      secretObject = privateObject<Record<string, unknown>>({
        key1: 'value1',
        key2: 'value2',
      });
      secretObject.set('key1', 'new value');
      asserts.assertEquals(secretObject.get('key1'), 'new value');
      secretObject.set('key3', 'value3');
      asserts.assertEquals(secretObject.get('key3'), 'value3');
      asserts.assertEquals(secretObject.has('key3'), true);
    });

    it(
      'delete should remove the key and its value from the object',
      () => {
        secretObject = privateObject<Record<string, unknown>>({
          key1: 'value1',
          key2: 'value2',
        });
        secretObject.delete('key1');
        asserts.assertEquals(secretObject.get('key1'), undefined);
        asserts.assertEquals(secretObject.has('key1'), false);
        secretObject.delete('key3'); // Deleting non-existing key should not throw error
      },
    );

    it('test foreach', () => {
      secretObject = privateObject<Record<string, unknown>>({
        key1: 'value1',
        key2: 'value2',
      });
      const keys: string[] = [];
      const values: unknown[] = [];
      secretObject.forEach((key, value) => {
        keys.push(key);
        values.push(value);
      });
      asserts.assertEquals(keys, ['key1', 'key2']);
      asserts.assertEquals(values, ['value1', 'value2']);
    });

    it('test clear', () => {
      secretObject = privateObject<Record<string, unknown>>({
        key1: 'value1',
        key2: 'value2',
      });
      secretObject.clear();
      asserts.assertEquals(secretObject.keys(), []);
      // Should not clear the object if mutations are disabled
      secretObject = privateObject<Record<string, unknown>>({
        key1: 'value1',
        key2: 'value2',
      }, false);
      secretObject.clear();
      asserts.assertEquals(secretObject.keys(), ['key1', 'key2']);
    });

    it('asObject should return the live backing reference when mutable', () => {
      const originalObj = {
        key1: 'value1',
        key2: 'value2',
      };
      secretObject = privateObject<Record<string, unknown>>(originalObj);
      const returnedObj = secretObject.asObject();
      // Mutable objects hand back the live reference (no copy).
      asserts.assertStrictEquals(returnedObj, originalObj);
      // Writes through set() are visible on that same reference.
      secretObject.set('key3', 'value3');
      asserts.assertEquals(
        (returnedObj as Record<string, unknown>).key3,
        'value3',
      );
    });

    it('should handle complex object values', () => {
      const complexObject = {
        simple: 'string',
        array: [1, 2, 3],
        nested: { a: 1, b: 2 },
        func: () => 'function',
      };

      secretObject = privateObject<Record<string, unknown>>();
      secretObject.set('complex', complexObject);

      // Check direct reference preservation
      asserts.assertStrictEquals(secretObject.get('complex'), complexObject);

      // Check that modifying the original affects the private object
      complexObject.array.push(4);
      const retrieved = secretObject.get('complex') as typeof complexObject;
      asserts.assertEquals(retrieved.array, [1, 2, 3, 4]);
    });

    it('should handle null and undefined values', () => {
      secretObject = privateObject<Record<string, unknown>>({
        nullValue: null,
        undefinedValue: undefined,
      });

      asserts.assertEquals(secretObject.get('nullValue'), null);
      asserts.assertEquals(secretObject.get('undefinedValue'), undefined);
      asserts.assertEquals(secretObject.has('nullValue'), true);
      asserts.assertEquals(secretObject.has('undefinedValue'), true);
    });
  });
});
