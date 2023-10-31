import {
  assertEquals,
  assertStrictEquals,
  assertThrows,
} from '../dev.dependencies.ts';
import { afterEach, beforeEach, describe, it } from '../dev.dependencies.ts';

import { privateObject } from './privateObject.ts';
import type { PrivateObject } from './privateObject.ts';

describe(`[library='utils' name='privateObject' mode='sealed']`, () => {
  describe('sealed object', () => {
    let secretObject: PrivateObject;

    beforeEach(() => {
      secretObject = privateObject<Record<string, unknown>>({
        key1: 'value1',
        key2: 'value2',
      }, false);
    });

    it('get should return the value for a given key', () => {
      assertEquals(secretObject.get('key1'), 'value1');
      assertEquals(secretObject.get('key2'), 'value2');
      assertEquals(secretObject.get('key3'), undefined);
    });

    it('has should return true if the key exists, otherwise false', () => {
      assertEquals(secretObject.has('key1'), true);
      assertEquals(secretObject.has('key2'), true);
      assertEquals(secretObject.has('key3'), false);
    });

    it('set should set the value for a given key', () => {
      secretObject.set('key1', 'new value');
      assertEquals(secretObject.get('key1'), 'value1'); // Should not change
      secretObject.set('key3', 'value3');
      assertEquals(secretObject.get('key3'), undefined);
      assertEquals(secretObject.has('key3'), false);
    });

    it('delete should remove the key and its value from the object', () => {
      secretObject.delete('key1');
      assertEquals(secretObject.get('key1'), 'value1');
      assertEquals(secretObject.has('key1'), true);
      secretObject.delete('key3'); // Deleting non-existing key should not throw error
    });
  });

  describe(`[library='utils' name='privateObject' mode='sealed']`, () => {
    let secretObject: PrivateObject;

    beforeEach(() => {
      secretObject = privateObject<Record<string, unknown>>({
        key1: 'value1',
        key2: 'value2',
      });
    });

    it('get should return the value for a given key', () => {
      assertEquals(secretObject.get('key1'), 'value1');
      assertEquals(secretObject.get('key2'), 'value2');
      assertEquals(secretObject.get('key3'), undefined);
    });

    it('has should return true if the key exists, otherwise false', () => {
      assertEquals(secretObject.has('key1'), true);
      assertEquals(secretObject.has('key2'), true);
      assertEquals(secretObject.has('key3'), false);
    });

    it('set should set the value for a given key', () => {
      secretObject.set('key1', 'new value');
      assertEquals(secretObject.get('key1'), 'new value');
      secretObject.set('key3', 'value3');
      assertEquals(secretObject.get('key3'), 'value3');
      assertEquals(secretObject.has('key3'), true);
    });

    it('delete should remove the key and its value from the object', () => {
      secretObject.delete('key1');
      assertEquals(secretObject.get('key1'), undefined);
      assertEquals(secretObject.has('key1'), false);
      secretObject.delete('key3'); // Deleting non-existing key should not throw error
    });
  });
});
