import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';

import { getType } from '../../helpers/mod.ts';

/**
 * Comprehensive test suite for getType helper function.
 * Tests type detection functionality for various JavaScript values.
 */
describe('guardian.helpers.getType', () => {
  describe('Primitive types', () => {
    describe('string', () => {
      it('basic', () => {
        asserts.assertEquals(getType('hello'), 'string');
        asserts.assertEquals(getType(''), 'string');
        asserts.assertEquals(getType('123'), 'string');
        asserts.assertEquals(getType(' '), 'string');
        asserts.assertEquals(getType('\n\t'), 'string');
        asserts.assertEquals(getType('🚀'), 'string');
      });

      it('conversions', () => {
        asserts.assertEquals(getType(String('world')), 'string');
        asserts.assertEquals(getType(String(123)), 'string');
        asserts.assertEquals(getType(String(true)), 'string');
      });
    });

    describe('number', () => {
      it('basic', () => {
        asserts.assertEquals(getType(42), 'number');
        asserts.assertEquals(getType(0), 'number');
        asserts.assertEquals(getType(-42), 'number');
        asserts.assertEquals(getType(3.14), 'number');
      });

      it('special values', () => {
        asserts.assertEquals(getType(Number.NaN), 'number');
        asserts.assertEquals(getType(Number.POSITIVE_INFINITY), 'number');
        asserts.assertEquals(getType(Number.NEGATIVE_INFINITY), 'number');
      });

      it('conversions', () => {
        asserts.assertEquals(getType(Number('123')), 'number');
        asserts.assertEquals(getType(Number(true)), 'number');
        asserts.assertEquals(getType(Number.parseInt('42')), 'number');
        asserts.assertEquals(getType(Number.parseFloat('3.14')), 'number');
      });
    });

    it('boolean', () => {
      asserts.assertEquals(getType(true), 'boolean');
      asserts.assertEquals(getType(false), 'boolean');
      asserts.assertEquals(getType(Boolean(1)), 'boolean');
      asserts.assertEquals(getType(Boolean(0)), 'boolean');
      asserts.assertEquals(getType(Boolean('test')), 'boolean');
      asserts.assertEquals(getType(Boolean('')), 'boolean');
    });

    it('bigint', () => {
      asserts.assertEquals(getType(BigInt(123)), 'bigint');
      asserts.assertEquals(getType(123n), 'bigint');
      asserts.assertEquals(getType(BigInt(0)), 'bigint');
      asserts.assertEquals(getType(BigInt('999999999999999999999')), 'bigint');
    });

    it('symbol', () => {
      asserts.assertEquals(getType(Symbol()), 'symbol');
      asserts.assertEquals(getType(Symbol('test')), 'symbol');
      asserts.assertEquals(getType(Symbol.for('global')), 'symbol');
      asserts.assertEquals(getType(Symbol.iterator), 'symbol');
    });
  });

  describe('Special values', () => {
    it('null', () => {
      asserts.assertEquals(getType(null), 'null');
    });

    it('undefined', () => {
      asserts.assertEquals(getType(undefined), 'undefined');
      let uninitialized;
      asserts.assertEquals(getType(uninitialized), 'undefined');
    });
  });

  describe('Enhanced object detection', () => {
    it('arrays', () => {
      asserts.assertEquals(getType([]), 'array');
      asserts.assertEquals(getType([1, 2, 3]), 'array');
      asserts.assertEquals(getType(['a', 'b', 'c']), 'array');
      asserts.assertEquals(getType([null, undefined, {}]), 'array');
      asserts.assertEquals(getType(new Array()), 'array');
      asserts.assertEquals(getType(new Array(5)), 'array');
      asserts.assertEquals(getType(Array.from([1, 2, 3])), 'array');
    });

    it('dates', () => {
      asserts.assertEquals(getType(new Date()), 'Date');
      asserts.assertEquals(getType(new Date('2023-01-01')), 'Date');
      asserts.assertEquals(getType(new Date(0)), 'Date');
      asserts.assertEquals(getType(new Date(1640995200000)), 'Date');

      // Invalid dates are still Date objects
      asserts.assertEquals(getType(new Date('invalid')), 'Date');
    });

    it('regular expressions', () => {
      asserts.assertEquals(getType(/test/), 'RegExp');
      asserts.assertEquals(getType(new RegExp('test')), 'RegExp');
      asserts.assertEquals(getType(/test/gi), 'RegExp');
      asserts.assertEquals(getType(/^[a-zA-Z0-9]+$/), 'RegExp');
      asserts.assertEquals(getType(RegExp('test', 'i')), 'RegExp');
    });
  });

  describe('Functions', () => {
    it('function declarations and expressions', () => {
      asserts.assertEquals(getType(() => {}), 'function');
      asserts.assertEquals(getType(function () {}), 'function');
      asserts.assertEquals(getType(function named() {}), 'function');
      asserts.assertEquals(getType(async () => {}), 'function');
      asserts.assertEquals(getType(async function () {}), 'function');
    });

    it('generator functions', () => {
      asserts.assertEquals(getType(function* () {}), 'function');
      asserts.assertEquals(getType(async function* () {}), 'function');
    });

    it('built-in functions', () => {
      asserts.assertEquals(getType(Math.max), 'function');
      asserts.assertEquals(getType(console.log), 'function');
      asserts.assertEquals(getType(Array.isArray), 'function');
      asserts.assertEquals(getType(Object.keys), 'function');
    });

    it('classes', () => {
      class TestClass {}
      class ExtendedClass extends TestClass {}

      asserts.assertEquals(getType(TestClass), 'function');
      asserts.assertEquals(getType(ExtendedClass), 'function');
    });
  });

  describe('Other objects', () => {
    it('plain objects', () => {
      asserts.assertEquals(getType({}), 'object');
      asserts.assertEquals(getType({ key: 'value' }), 'object');
      asserts.assertEquals(getType(new Object()), 'object');

      // Complex objects
      const complexObj = {
        nested: { deep: { value: 42 } },
        array: [1, 2, 3],
        func: () => 'test',
      };
      asserts.assertEquals(getType(complexObj), 'object');
    });

    it('collection objects', () => {
      asserts.assertEquals(getType(new Map()), 'object');
      asserts.assertEquals(getType(new Map([['key', 'value']])), 'object');
      asserts.assertEquals(getType(new Set()), 'object');
      asserts.assertEquals(getType(new Set([1, 2, 3])), 'object');
      asserts.assertEquals(getType(new WeakMap()), 'object');
      asserts.assertEquals(getType(new WeakSet()), 'object');
    });

    it('error objects', () => {
      asserts.assertEquals(getType(new Error()), 'object');
      asserts.assertEquals(getType(new TypeError()), 'object');
      asserts.assertEquals(getType(new RangeError()), 'object');
      asserts.assertEquals(getType(new SyntaxError()), 'object');
      asserts.assertEquals(getType(new ReferenceError()), 'object');
    });

    it('promises', () => {
      asserts.assertEquals(getType(Promise.resolve()), 'object');
      asserts.assertEquals(getType(new Promise(() => {})), 'object');
      asserts.assertEquals(getType(Promise.reject().catch(() => {})), 'object');
    });

    it('typed arrays and buffers', () => {
      asserts.assertEquals(getType(new ArrayBuffer(8)), 'object');
      asserts.assertEquals(getType(new Int8Array()), 'object');
      asserts.assertEquals(getType(new Uint8Array()), 'object');
      asserts.assertEquals(getType(new Int16Array()), 'object');
      asserts.assertEquals(getType(new Uint16Array()), 'object');
      asserts.assertEquals(getType(new Int32Array()), 'object');
      asserts.assertEquals(getType(new Uint32Array()), 'object');
      asserts.assertEquals(getType(new Float32Array()), 'object');
      asserts.assertEquals(getType(new Float64Array()), 'object');
      asserts.assertEquals(getType(new Uint8ClampedArray()), 'object');
    });

    it('custom class instances', () => {
      class CustomClass {
        constructor(public value: number) {}
      }

      const instance = new CustomClass(42);
      asserts.assertEquals(getType(instance), 'object');
    });

    it('special object types', () => {
      // Object created with null prototype
      const nullProtoObj = Object.create(null);
      asserts.assertEquals(getType(nullProtoObj), 'object');

      // Frozen objects
      const frozenObj = Object.freeze({});
      asserts.assertEquals(getType(frozenObj), 'object');

      // Sealed objects
      const sealedObj = Object.seal({});
      asserts.assertEquals(getType(sealedObj), 'object');
    });
  });

  describe('Boxed primitives', () => {
    // Boxed primitives should return 'object' not their primitive type
    asserts.assertEquals(getType(new String('test')), 'object');
    asserts.assertEquals(getType(new Number(42)), 'object');
    asserts.assertEquals(getType(new Boolean(true)), 'object');
  });

  describe('Edge cases', () => {
    it('arguments object', () => {
      function testArgs() {
        return getType(arguments);
      }

      // Arguments object should be detected as 'object'
      asserts.assertEquals(testArgs(), 'object');
    });

    it('generators and iterators', () => {
      function* testGenerator() {
        yield 1;
        yield 2;
      }

      const generator = testGenerator();
      asserts.assertEquals(getType(generator), 'object');

      // Array iterator
      const arrayIterator = [1, 2, 3][Symbol.iterator]();
      asserts.assertEquals(getType(arrayIterator), 'object');
    });

    it('global objects', () => {
      // Global objects that might be available
      if (typeof globalThis !== 'undefined') {
        asserts.assertEquals(getType(globalThis), 'object');
      }
    });
  });

  describe('Consistency', () => {
    // Test that the function returns consistent results across multiple calls
    const testValue = { test: 'value' };

    for (let i = 0; i < 10; i++) {
      asserts.assertEquals(getType(testValue), 'object');
    }

    // Test with different values of the same type
    const stringValues = ['', 'hello', '123', 'test'];
    stringValues.forEach((value) => {
      asserts.assertEquals(getType(value), 'string');
    });

    const numberValues = [0, 42, -1, 3.14, Number.NaN, Infinity];
    numberValues.forEach((value) => {
      asserts.assertEquals(getType(value), 'number');
    });
  });

  describe('Documentation examples', () => {
    // Test all examples from the documentation to ensure they work as documented

    // Primitive types
    asserts.assertEquals(getType('hello'), 'string');
    asserts.assertEquals(getType(42), 'number');
    asserts.assertEquals(getType(Number.NaN), 'number');
    asserts.assertEquals(getType(true), 'boolean');
    asserts.assertEquals(getType(BigInt(123)), 'bigint');
    asserts.assertEquals(getType(Symbol('test')), 'symbol');

    // Special values
    asserts.assertEquals(getType(null), 'null');
    asserts.assertEquals(getType(undefined), 'undefined');

    // Enhanced object detection
    asserts.assertEquals(getType([]), 'array');
    asserts.assertEquals(getType([1, 2, 3]), 'array');
    asserts.assertEquals(getType(new Date()), 'Date');
    asserts.assertEquals(getType(/regex/gi), 'RegExp');

    // Functions
    asserts.assertEquals(getType(() => {}), 'function');
    asserts.assertEquals(getType(function named() {}), 'function');
    asserts.assertEquals(getType(class MyClass {}), 'function');

    // Other objects
    asserts.assertEquals(getType({}), 'object');
    asserts.assertEquals(getType(new Map()), 'object');
    asserts.assertEquals(getType(new Set()), 'object');
    asserts.assertEquals(getType(new Error()), 'object');
  });
});
