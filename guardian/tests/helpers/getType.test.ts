import { assertEquals } from '$asserts';
import { getType } from '../../helpers/mod.ts';

Deno.test('Guardian.helpers.getType', async (t) => {
  await t.step('correctly identifies null', () => {
    assertEquals(getType(null), 'null');
  });

  await t.step('correctly identifies arrays', () => {
    assertEquals(getType([]), 'array');
    assertEquals(getType([1, 2, 3]), 'array');
    assertEquals(getType(new Array(5)), 'array');
  });

  await t.step('correctly identifies Date objects', () => {
    assertEquals(getType(new Date()), 'Date');
  });

  await t.step('correctly identifies RegExp objects', () => {
    assertEquals(getType(/test/), 'RegExp');
    assertEquals(getType(new RegExp('test')), 'RegExp');
  });

  await t.step('correctly identifies strings', () => {
    assertEquals(getType(''), 'string');
    assertEquals(getType('hello'), 'string');
    assertEquals(getType(String('world')), 'string');
  });

  await t.step('correctly identifies numbers', () => {
    assertEquals(getType(0), 'number');
    assertEquals(getType(42), 'number');
    assertEquals(getType(-3.14), 'number');
    assertEquals(getType(NaN), 'number');
    assertEquals(getType(Infinity), 'number');
  });

  await t.step('correctly identifies booleans', () => {
    assertEquals(getType(true), 'boolean');
    assertEquals(getType(false), 'boolean');
    assertEquals(getType(Boolean(1)), 'boolean');
  });

  await t.step('correctly identifies bigint values', () => {
    assertEquals(getType(BigInt(123)), 'bigint');
    assertEquals(getType(123n), 'bigint');
  });

  await t.step('correctly identifies functions', () => {
    assertEquals(getType(() => {}), 'function');
    assertEquals(getType(function () {}), 'function');
    assertEquals(getType(Math.random), 'function');
  });

  await t.step('correctly identifies undefined', () => {
    assertEquals(getType(undefined), 'undefined');
    let undef;
    assertEquals(getType(undef), 'undefined');
  });

  await t.step('correctly identifies objects', () => {
    assertEquals(getType({}), 'object');
    assertEquals(getType({ key: 'value' }), 'object');
    assertEquals(getType(new Object()), 'object');
    assertEquals(getType(new Map()), 'object');
    assertEquals(getType(new Set()), 'object');
  });

  await t.step('handles special JavaScript objects correctly', () => {
    // Web APIs
    if (typeof URL !== 'undefined') {
      assertEquals(getType(new URL('https://example.com')), 'object');
    }

    // Collection objects
    assertEquals(getType(new Map()), 'object');
    assertEquals(getType(new Set()), 'object');
    assertEquals(getType(new WeakMap()), 'object');
    assertEquals(getType(new WeakSet()), 'object');
  });

  await t.step('works with custom class instances', () => {
    class TestClass {
      property = 'value';
    }
    assertEquals(getType(new TestClass()), 'object');
  });

  await t.step('handles TypedArrays correctly', () => {
    assertEquals(getType(new Int8Array()), 'object');
    assertEquals(getType(new Uint8Array()), 'object');
    assertEquals(getType(new Float32Array()), 'object');
    assertEquals(getType(new Uint8ClampedArray()), 'object');
  });

  await t.step('handles symbol type', () => {
    assertEquals(getType(Symbol('test')), 'symbol');
  });

  await t.step('handles errors correctly', () => {
    assertEquals(getType(new Error()), 'object');
    assertEquals(getType(new TypeError()), 'object');
    assertEquals(getType(new SyntaxError()), 'object');
  });
});
