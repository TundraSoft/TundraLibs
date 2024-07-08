import { asserts } from '../dev.dependencies.ts';

import { privateObject } from './privateObject.ts';
import type { PrivateObject } from './privateObject.ts';

Deno.test('utils:privateObject', async (t) => {
  let secretObject: PrivateObject;

  await t.step('sealed object', async (t) => {
    await t.step('get should return the value for a given key', () => {
      secretObject = privateObject<Record<string, unknown>>({
        key1: 'value1',
        key2: 'value2',
      }, false);
      asserts.assertEquals(secretObject.get('key1'), 'value1');
      asserts.assertEquals(secretObject.get('key2'), 'value2');
      asserts.assertEquals(secretObject.get('key3'), undefined);
    });

    await t.step(
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

    await t.step('set should set the value for a given key', () => {
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

    await t.step(
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

    await t.step('test foreach', () => {
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
  });

  await t.step('unsealed object', async (t) => {
    await t.step('get should return the value for a given key', () => {
      secretObject = privateObject<Record<string, unknown>>({
        key1: 'value1',
        key2: 'value2',
      });
      asserts.assertEquals(secretObject.get('key1'), 'value1');
      asserts.assertEquals(secretObject.get('key2'), 'value2');
      asserts.assertEquals(secretObject.get('key3'), undefined);
    });

    await t.step(
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

    await t.step('set should set the value for a given key', () => {
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

    await t.step(
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

    await t.step('test foreach', () => {
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

    await t.step('test clear', () => {
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
  });
});
