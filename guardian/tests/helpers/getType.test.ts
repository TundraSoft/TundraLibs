import * as asserts from '$asserts';
import { getType } from '../../helpers/mod.ts';

/**
 * Comprehensive test suite for getType helper function.
 * Tests type detection functionality for various JavaScript values.
 */
Deno.test('guardian.helpers.getType', async (t) => {
  await t.step('Primitive types', async (e) => {
    await e.step('string', async (s) => {
      await s.step('basic', () => {
        asserts.assertEquals(getType('hello'), 'string');
        asserts.assertEquals(getType(''), 'string');
        asserts.assertEquals(getType('123'), 'string');
        asserts.assertEquals(getType(' '), 'string');
        asserts.assertEquals(getType('\n\t'), 'string');
        asserts.assertEquals(getType('🚀'), 'string');
      });

      await s.step('conversions', () => {
        asserts.assertEquals(getType(String('world')), 'string');
        asserts.assertEquals(getType(String(123)), 'string');
        asserts.assertEquals(getType(String(true)), 'string');
      });
    });

    await e.step('number', async (s) => {
      await s.step('basic', () => {
        asserts.assertEquals(getType(42), 'number');
        asserts.assertEquals(getType(0), 'number');
        asserts.assertEquals(getType(-42), 'number');
        asserts.assertEquals(getType(3.14), 'number');
      });

      await s.step('special values', () => {
        asserts.assertEquals(getType(NaN), 'number');
        asserts.assertEquals(getType(Infinity), 'number');
        asserts.assertEquals(getType(-Infinity), 'number');
      });

      await s.step('conversions', () => {
        asserts.assertEquals(getType(Number('123')), 'number');
        asserts.assertEquals(getType(Number(true)), 'number');
        asserts.assertEquals(getType(parseInt('42')), 'number');
        asserts.assertEquals(getType(parseFloat('3.14')), 'number');
      });
    });

    await e.step('boolean', () => {
      asserts.assertEquals(getType(true), 'boolean');
      asserts.assertEquals(getType(false), 'boolean');
      asserts.assertEquals(getType(Boolean(1)), 'boolean');
      asserts.assertEquals(getType(Boolean(0)), 'boolean');
      asserts.assertEquals(getType(Boolean('test')), 'boolean');
      asserts.assertEquals(getType(Boolean('')), 'boolean');
    });

    await e.step('bigint', () => {
      asserts.assertEquals(getType(BigInt(123)), 'bigint');
      asserts.assertEquals(getType(123n), 'bigint');
      asserts.assertEquals(getType(BigInt(0)), 'bigint');
      asserts.assertEquals(getType(BigInt('999999999999999999999')), 'bigint');
    });

    await e.step('symbol', () => {
      asserts.assertEquals(getType(Symbol()), 'symbol');
      asserts.assertEquals(getType(Symbol('test')), 'symbol');
      asserts.assertEquals(getType(Symbol.for('global')), 'symbol');
      asserts.assertEquals(getType(Symbol.iterator), 'symbol');
    });
  });

  await t.step('Special values', async (e) => {
    await e.step('null', () => {
      asserts.assertEquals(getType(null), 'null');
    });

    await e.step('undefined', () => {
      asserts.assertEquals(getType(undefined), 'undefined');
      let uninitialized;
      asserts.assertEquals(getType(uninitialized), 'undefined');
    });
  });

  await t.step('Enhanced object detection', async (e) => {
    await e.step('arrays', () => {
      asserts.assertEquals(getType([]), 'array');
      asserts.assertEquals(getType([1, 2, 3]), 'array');
      asserts.assertEquals(getType(['a', 'b', 'c']), 'array');
      asserts.assertEquals(getType([null, undefined, {}]), 'array');
      asserts.assertEquals(getType(new Array()), 'array');
      asserts.assertEquals(getType(new Array(5)), 'array');
      asserts.assertEquals(getType(Array.from([1, 2, 3])), 'array');
    });

    await e.step('dates', () => {
      asserts.assertEquals(getType(new Date()), 'Date');
      asserts.assertEquals(getType(new Date('2023-01-01')), 'Date');
      asserts.assertEquals(getType(new Date(0)), 'Date');
      asserts.assertEquals(getType(new Date(1640995200000)), 'Date');

      // Invalid dates are still Date objects
      asserts.assertEquals(getType(new Date('invalid')), 'Date');
    });

    await e.step('regular expressions', () => {
      asserts.assertEquals(getType(/test/), 'RegExp');
      asserts.assertEquals(getType(new RegExp('test')), 'RegExp');
      asserts.assertEquals(getType(/test/gi), 'RegExp');
      asserts.assertEquals(getType(/^[a-zA-Z0-9]+$/), 'RegExp');
      asserts.assertEquals(getType(RegExp('test', 'i')), 'RegExp');
    });
  });

  await t.step('Functions', async (e) => {
    await e.step('function declarations and expressions', () => {
      asserts.assertEquals(getType(() => {}), 'function');
      asserts.assertEquals(getType(function () {}), 'function');
      asserts.assertEquals(getType(function named() {}), 'function');
      asserts.assertEquals(getType(async () => {}), 'function');
      asserts.assertEquals(getType(async function () {}), 'function');
    });

    await e.step('generator functions', () => {
      asserts.assertEquals(getType(function* () {}), 'function');
      asserts.assertEquals(getType(async function* () {}), 'function');
    });

    await e.step('built-in functions', () => {
      asserts.assertEquals(getType(Math.max), 'function');
      asserts.assertEquals(getType(console.log), 'function');
      asserts.assertEquals(getType(Array.isArray), 'function');
      asserts.assertEquals(getType(Object.keys), 'function');
    });

    await e.step('classes', () => {
      class TestClass {}
      class ExtendedClass extends TestClass {}

      asserts.assertEquals(getType(TestClass), 'function');
      asserts.assertEquals(getType(ExtendedClass), 'function');
    });
  });

  await t.step('Other objects', async (e) => {
    await e.step('plain objects', () => {
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

    await e.step('collection objects', () => {
      asserts.assertEquals(getType(new Map()), 'object');
      asserts.assertEquals(getType(new Map([['key', 'value']])), 'object');
      asserts.assertEquals(getType(new Set()), 'object');
      asserts.assertEquals(getType(new Set([1, 2, 3])), 'object');
      asserts.assertEquals(getType(new WeakMap()), 'object');
      asserts.assertEquals(getType(new WeakSet()), 'object');
    });

    await e.step('error objects', () => {
      asserts.assertEquals(getType(new Error()), 'object');
      asserts.assertEquals(getType(new TypeError()), 'object');
      asserts.assertEquals(getType(new RangeError()), 'object');
      asserts.assertEquals(getType(new SyntaxError()), 'object');
      asserts.assertEquals(getType(new ReferenceError()), 'object');
    });

    await e.step('promises', () => {
      asserts.assertEquals(getType(Promise.resolve()), 'object');
      asserts.assertEquals(getType(new Promise(() => {})), 'object');
      asserts.assertEquals(getType(Promise.reject().catch(() => {})), 'object');
    });

    await e.step('typed arrays and buffers', () => {
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

    await e.step('custom class instances', () => {
      class CustomClass {
        constructor(public value: number) {}
      }

      const instance = new CustomClass(42);
      asserts.assertEquals(getType(instance), 'object');
    });

    await e.step('special object types', () => {
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

  await t.step('Boxed primitives', () => {
    // Boxed primitives should return 'object' not their primitive type
    asserts.assertEquals(getType(new String('test')), 'object');
    asserts.assertEquals(getType(new Number(42)), 'object');
    asserts.assertEquals(getType(new Boolean(true)), 'object');
  });

  await t.step('Edge cases', async (e) => {
    await e.step('arguments object', () => {
      function testArgs() {
        return getType(arguments);
      }

      // Arguments object should be detected as 'object'
      asserts.assertEquals(testArgs(), 'object');
    });

    await e.step('generators and iterators', () => {
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

    await e.step('global objects', () => {
      // Global objects that might be available
      if (typeof globalThis !== 'undefined') {
        asserts.assertEquals(getType(globalThis), 'object');
      }
    });
  });

  await t.step('Consistency', () => {
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

    const numberValues = [0, 42, -1, 3.14, NaN, Infinity];
    numberValues.forEach((value) => {
      asserts.assertEquals(getType(value), 'number');
    });
  });

  await t.step('Documentation examples', () => {
    // Test all examples from the documentation to ensure they work as documented

    // Primitive types
    asserts.assertEquals(getType('hello'), 'string');
    asserts.assertEquals(getType(42), 'number');
    asserts.assertEquals(getType(NaN), 'number');
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
