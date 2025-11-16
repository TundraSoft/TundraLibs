import { BaseGuardian } from '../BaseGuardian.ts';
import { GuardianError } from '../GuardianError.ts';
import type { GuardianMetaData } from '../types/mod.ts';
import { NumberGuardian } from './NumberGuardian.ts';

/**
 * Guardian for string validation and transformation.
 * Provides fluent API for building string validation pipelines.
 *
 * @example
 * ```ts
 * const schema = new StringGuardian()
 *   .minLength(3)
 *   .maxLength(10)
 *   .regex(/^[a-zA-Z]+$/, 'Only letters allowed');
 *
 * const result = schema.parse('hello'); // 'hello'
 * ```
 *
 * @since 1.0.0
 */
export class StringGuardian extends BaseGuardian<string> {
  /**
   * Creates a new StringGuardian instance.
   *
   * @param metaData - Optional metadata for this guardian
   */
  constructor(metaData?: GuardianMetaData) {
    super((input: unknown) => {
      if (typeof input !== 'string') {
        throw new GuardianError('Expected string but got ${got}', {
          expected: 'string',
          got: typeof input,
          comparison: 'type',
          type: 'string',
        });
      }
      return input;
    }, metaData);
  }

  //#region Validation Methods

  /**
   * Validates minimum string length.
   *
   * @param length - Minimum required length
   * @param errorMessage - Optional custom error message
   * @returns New StringGuardian with minimum length validation
   *
   * @example
   * ```ts
   * const schema = new StringGuardian().minLength(3);
   * schema.parse('hi'); // throws GuardianError
   * schema.parse('hello'); // 'hello'
   * ```
   */
  minLength(length: number, errorMessage?: string): StringGuardian {
    return this.step((value: string) => {
      if (value.length < length) {
        throw new GuardianError(
          errorMessage || 'String must be at least ${expected} characters long',
          {
            expected: length,
            got: value.length,
            comparison: 'minLength',
            type: 'string',
          },
        );
      }
      return value;
    }, `Minimum length validation (${length})`) as StringGuardian;
  }

  /**
   * Validates maximum string length.
   *
   * @param length - Maximum allowed length
   * @param errorMessage - Optional custom error message
   * @returns New StringGuardian with maximum length validation
   *
   * @example
   * ```ts
   * const schema = new StringGuardian().maxLength(10);
   * schema.parse('hello world!'); // throws GuardianError
   * schema.parse('hello'); // 'hello'
   * ```
   */
  maxLength(length: number, errorMessage?: string): StringGuardian {
    return this.step((value: string) => {
      if (value.length > length) {
        throw new GuardianError(
          errorMessage || 'String must be at most ${expected} characters long',
          {
            expected: length,
            got: value.length,
            comparison: 'maxLength',
            type: 'string',
          },
        );
      }
      return value;
    }, `Maximum length validation (${length})`) as StringGuardian;
  }

  /**
   * Validates exact string length.
   *
   * @param length - Exact required length
   * @param errorMessage - Optional custom error message
   * @returns New StringGuardian with exact length validation
   */
  length(length: number, errorMessage?: string): StringGuardian {
    return this.step((value: string) => {
      if (value.length !== length) {
        throw new GuardianError(
          errorMessage || 'String must be exactly ${expected} characters long',
          {
            expected: length,
            got: value.length,
            comparison: 'length',
            type: 'string',
          },
        );
      }
      return value;
    }, `Exact length validation (${length})`) as StringGuardian;
  }

  /**
   * Validates string against a regular expression.
   *
   * @param pattern - Regular expression pattern to match
   * @param errorMessage - Optional custom error message
   * @returns New StringGuardian with regex validation
   *
   * @example
   * ```ts
   * const schema = new StringGuardian().regex(/^[a-zA-Z]+$/, 'Letters only');
   * schema.parse('hello123'); // throws GuardianError
   * schema.parse('hello'); // 'hello'
   * ```
   */
  regex(pattern: RegExp, errorMessage?: string): StringGuardian {
    return this.step((value: string) => {
      if (!pattern.test(value)) {
        throw new GuardianError(
          errorMessage || 'String does not match pattern ${expected}',
          {
            expected: pattern,
            got: value,
            comparison: 'regex',
            type: 'string',
          },
        );
      }
      return value;
    }, `Regex validation (${pattern})`) as StringGuardian;
  }

  /**
   * Validates that string is not empty (after trimming whitespace).
   *
   * @param errorMessage - Optional custom error message
   * @returns New StringGuardian with non-empty validation
   */
  nonEmpty(errorMessage?: string): StringGuardian {
    return this.step((value: string) => {
      if (value.trim().length === 0) {
        throw new GuardianError(
          errorMessage || 'String cannot be empty',
          {
            expected: 'non-empty string',
            got: 'empty string',
            comparison: 'nonEmpty',
            type: 'string',
          },
        );
      }
      return value;
    }, 'Non-empty validation') as StringGuardian;
  }

  /**
   * Validates string is a valid email address.
   *
   * @param errorMessage - Optional custom error message
   * @returns New StringGuardian with email validation
   */
  email(errorMessage?: string): StringGuardian {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return this.regex(
      emailRegex,
      errorMessage || 'Invalid email address format',
    );
  }

  /**
   * Validates string is a valid URL.
   *
   * @param errorMessage - Optional custom error message
   * @returns New StringGuardian with URL validation
   */
  url(errorMessage?: string): StringGuardian {
    return this.step((value: string) => {
      try {
        new URL(value);
        return value;
      } catch {
        throw new GuardianError(
          errorMessage || 'Invalid URL format',
          {
            expected: 'valid URL',
            got: value,
            comparison: 'url',
            type: 'string',
          },
        );
      }
    }, 'URL validation') as StringGuardian;
  }

  //#endregion

  //#region String Transformation Methods

  /**
   * Transforms string to uppercase.
   *
   * @returns New StringGuardian that transforms to uppercase
   *
   * @example
   * ```ts
   * const schema = new StringGuardian().toUpperCase();
   * schema.parse('hello'); // 'HELLO'
   * ```
   */
  toUpperCase(description?: string): StringGuardian {
    const transformedGuardian = this.mutate((value: string) => {
      return value.toUpperCase();
    }, description || 'Convert to uppercase');

    return transformedGuardian as StringGuardian;
  }

  /**
   * Transforms string to lowercase.
   *
   * @returns New StringGuardian that transforms to lowercase
   */
  toLowerCase(description?: string): StringGuardian {
    const transformedGuardian = this.mutate((value: string) => {
      return value.toLowerCase();
    }, description || 'Convert to lowercase');

    return transformedGuardian as StringGuardian;
  }

  /**
   * Trims whitespace from both ends of the string.
   *
   * @returns New StringGuardian that trims whitespace
   */
  trim(description?: string): StringGuardian {
    return this.mutate((value: string) => {
      return value.trim();
    }, description || 'Trim whitespace') as StringGuardian;
  }

  //#endregion

  //#region Type Transformation Methods

  /**
   * Transforms string to a number.
   *
   * @param errorMessage - Optional custom error message for invalid numbers
   * @returns New NumberGuardian with number transformation
   *
   * @example
   * ```ts
   * const schema = new StringGuardian().toNumber();
   * schema.parse('123'); // 123
   * schema.parse('abc'); // throws GuardianError
   * ```
   */
  toNumber(errorMessage?: string): NumberGuardian {
    const transformedGuardian = this.mutate((value: string) => {
      const num = Number(value);
      if (isNaN(num)) {
        throw new GuardianError(
          errorMessage || 'Cannot convert string to number',
          {
            expected: 'numeric string',
            got: value,
            comparison: 'conversion',
            type: 'string_to_number',
          },
        );
      }
      return num;
    }, 'String to number transformation');

    // Create a new NumberGuardian with the same composed transform
    const numberGuardian = new NumberGuardian();
    (numberGuardian as BaseGuardian<number>)['_composedTransform'] =
      (transformedGuardian as BaseGuardian<number>)['_composedTransform'];
    return numberGuardian;
  }

  /**
   * Transforms string to integer.
   *
   * @param radix - Optional radix for parsing (default: 10)
   * @param errorMessage - Optional custom error message
   * @returns New NumberGuardian with integer transformation
   */
  toInt(radix = 10, errorMessage?: string): NumberGuardian {
    const transformedGuardian = this.mutate((value: string) => {
      const num = parseInt(value, radix);
      if (isNaN(num)) {
        throw new GuardianError(
          errorMessage || 'Cannot convert string to integer',
          {
            expected: 'integer string',
            got: value,
            comparison: 'conversion',
            type: 'number',
          },
        );
      }
      return num;
    }, `String to integer transformation (radix: ${radix})`);

    // Create a new NumberGuardian with the same composed transform
    const numberGuardian = new NumberGuardian();
    (numberGuardian as BaseGuardian<number>)['_composedTransform'] =
      (transformedGuardian as BaseGuardian<number>)['_composedTransform'];
    return numberGuardian;
  }

  /**
   * Transforms string to a Date object.
   *
   * @param errorMessage - Optional custom error message
   * @returns New BaseGuardian<Date> with date transformation
   */
  toDate(errorMessage?: string): BaseGuardian<Date> {
    return this.mutate((value: string) => {
      const date = new Date(value);
      if (isNaN(date.getTime())) {
        throw new GuardianError(
          errorMessage || 'Cannot convert string to date',
          {
            expected: 'valid date string',
            got: value,
            comparison: 'conversion',
            type: 'date',
          },
        );
      }
      return date;
    }, 'String to date transformation');
  }

  //#endregion
}
