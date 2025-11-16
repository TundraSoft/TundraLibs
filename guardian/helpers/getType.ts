/**
 * Returns the type of a given value as a string, with enhanced type detection
 * for common JavaScript types and objects.
 *
 * This function provides more accurate type detection than the native `typeof` operator
 * by distinguishing between arrays, dates, regular expressions, and null values that
 * would otherwise return 'object'.
 *
 * @param value - The value to get the type of
 * @returns A string representing the type of the value
 *
 * Possible return values:
 * - `'null'` - for null values
 * - `'undefined'` - for undefined values
 * - `'array'` - for arrays (instead of 'object')
 * - `'Date'` - for Date instances (instead of 'object')
 * - `'RegExp'` - for regular expressions (instead of 'object')
 * - `'string'` - for string primitives
 * - `'number'` - for numbers (including NaN and Infinity)
 * - `'boolean'` - for boolean primitives
 * - `'bigint'` - for BigInt values
 * - `'symbol'` - for symbols
 * - `'function'` - for functions (including classes, generators, etc.)
 * - `'object'` - for all other objects (Map, Set, custom classes, etc.)
 *
 * @example
 * ```ts
 * // Primitive types
 * getType('hello') // 'string'
 * getType(42) // 'number'
 * getType(NaN) // 'number'
 * getType(true) // 'boolean'
 * getType(BigInt(123)) // 'bigint'
 * getType(Symbol('test')) // 'symbol'
 *
 * // Special values
 * getType(null) // 'null'
 * getType(undefined) // 'undefined'
 *
 * // Enhanced object detection
 * getType([]) // 'array'
 * getType([1, 2, 3]) // 'array'
 * getType(new Date()) // 'Date'
 * getType(/regex/gi) // 'RegExp'
 *
 * // Functions
 * getType(() => {}) // 'function'
 * getType(function named() {}) // 'function'
 * getType(class MyClass {}) // 'function'
 *
 * // Other objects
 * getType({}) // 'object'
 * getType(new Map()) // 'object'
 * getType(new Set()) // 'object'
 * getType(new Error()) // 'object'
 * ```
 */
export const getType = (value: unknown): string => {
  if (value === null) {
    return 'null';
  }

  if (Array.isArray(value)) {
    return 'array';
  }

  if (value instanceof Date) {
    return 'Date';
  }

  if (value instanceof RegExp) {
    return 'RegExp';
  }

  return typeof value;
};
