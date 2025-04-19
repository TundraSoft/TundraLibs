import { BaseGuardian } from '../BaseGuardian.ts';
import type { FunctionType, GuardianProxy } from '../types/mod.ts';
import { NumberGuardian } from './Number.ts';
import { DateGuardian } from './Date.ts';
import { GuardianError } from '../GuardianError.ts';
import { isValidIPv4, isValidIPv6Structure } from '@tundralibs/utils';
import { getType } from '../helpers/getType.ts';

/**
 * StringGuardian provides validation and transformation utilities for string values.
 * It extends BaseGuardian to provide a chainable API for string processing.
 *
 * @example
 * ```ts
 * const emailValidator = StringGuardian.create()
 *   .trim()
 *   .email();
 *
 * // Validate an email
 * const validatedEmail = emailValidator("user@example.com"); // Returns: "user@example.com"
 * emailValidator("invalid"); // Throws: "Expected value (invalid) to be a valid email"
 * ```
 */
export class StringGuardian extends BaseGuardian<FunctionType<string>> {
  /**
   * Collection of commonly used regular expression patterns for string validation.
   * These patterns can be used with the `pattern` method or accessed directly for custom validation.
   */
  public static readonly patterns: Record<string, RegExp> = {
    email: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
    url:
      /^(https?:\/\/)((([^:@\/\n]+)(:([^:@\/\n]+))?@)?)([^:\/\n]+)(:(\d+))?(\/[^?#]*)?(\?[^#]*)?(#.*)?$/,
    alpha: /^[a-zA-Z]+$/,
    alphanumeric: /^[a-zA-Z0-9]+$/,
    numeric: /^[0-9\.]+$/,
    uuid:
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  };

  /**
   * Creates a new StringGuardian instance that validates if a value is a string.
   *
   * @param error - Custom error message to use when validation fails
   * @returns A proxy that acts as both the guardian function and method provider
   *
   * @example
   * ```ts
   * const stringGuard = StringGuardian.create();
   * const str = stringGuard("hello"); // Returns: "hello"
   * stringGuard(123); // Throws: "Expected string, got number"
   * ```
   */
  static create(error?: string): GuardianProxy<StringGuardian> {
    return new StringGuardian((value: unknown): string => {
      if (typeof value === 'string') return value;
      throw new GuardianError(
        {
          got: value,
          comparison: 'type',
          expected: 'string',
          type: getType(value),
        },
        error || 'Expected value to be a string, got ${type}',
      );
    }).proxy();
  }

  //#region Transformations
  /**
   * Converts the string to uppercase.
   *
   * @returns A new Guardian instance with the uppercase transformation applied
   *
   * @example
   * ```ts
   * StringGuardian.create()("hello").upperCase(); // Returns: "HELLO"
   * ```
   */
  public upperCase(): GuardianProxy<this> {
    return this.transform((value) => value.toUpperCase());
  }

  /**
   * Converts the string to lowercase.
   *
   * @returns A new Guardian instance with the lowercase transformation applied
   *
   * @example
   * ```ts
   * StringGuardian.create()("HELLO").lowerCase(); // Returns: "hello"
   * ```
   */
  public lowerCase(): GuardianProxy<this> {
    return this.transform((value) => value.toLowerCase());
  }

  /**
   * Removes whitespace from both ends of the string.
   *
   * @returns A new Guardian instance with the trim transformation applied
   *
   * @example
   * ```ts
   * StringGuardian.create()("  hello  ").trim(); // Returns: "hello"
   * ```
   */
  public trim(): GuardianProxy<this> {
    return this.transform((value) => value.trim());
  }

  /**
   * Removes all whitespace characters from the string.
   *
   * @returns A new Guardian instance with all spaces removed
   *
   * @example
   * ```ts
   * StringGuardian.create()("hello world").stripSpaces(); // Returns: "helloworld"
   * ```
   */
  public stripSpaces(): GuardianProxy<this> {
    return this.transform((value) => value.replace(/\s+/g, ''));
  }

  /**
   * Replaces occurrences of a string or pattern with another string.
   *
   * @param searchValue - The string or regular expression to search for
   * @param replaceValue - The string to replace matches with
   * @returns A new Guardian instance with replacements applied
   *
   * @example
   * ```ts
   * StringGuardian.create()("hello world").replace("world", "universe");
   * // Returns: "hello universe"
   * ```
   */
  public replace(
    searchValue: string | RegExp,
    replaceValue: string,
  ): GuardianProxy<this> {
    return this.transform((value) => value.replace(searchValue, replaceValue));
  }

  /**
   * Extracts a section of the string from start to an optional end index.
   *
   * @param start - The index to start extraction from (0-based)
   * @param end - Optional end index (exclusive) where to end extraction
   * @returns A new Guardian instance with the extracted substring
   *
   * @example
   * ```ts
   * StringGuardian.create()("hello world").slice(0, 5); // Returns: "hello"
   * ```
   */
  public slice(start: number, end?: number): GuardianProxy<this> {
    return this.transform((value) => value.slice(start, end));
  }

  /**
   * Adds a prefix to the beginning of the string.
   *
   * @param prefix - The string to add at the beginning
   * @returns A new Guardian instance with the prefix added
   *
   * @example
   * ```ts
   * StringGuardian.create()("world").prefix("hello "); // Returns: "hello world"
   * ```
   */
  public prefix(prefix: string): GuardianProxy<this> {
    return this.transform((value) => `${prefix}${value}`);
  }

  /**
   * Adds a suffix to the end of the string.
   *
   * @param suffix - The string to add at the end
   * @returns A new Guardian instance with the suffix added
   *
   * @example
   * ```ts
   * StringGuardian.create()("hello").suffix(" world"); // Returns: "hello world"
   * ```
   */
  public suffix(suffix: string): GuardianProxy<this> {
    return this.transform((value) => `${value}${suffix}`);
  }

  /**
   * Converts the string to a number.
   *
   * @returns A NumberGuardian instance containing the parsed number
   * @throws If the string cannot be converted to a valid number
   *
   * @example
   * ```ts
   * StringGuardian.create()("123").toNumber(); // Returns NumberGuardian with value 123
   * ```
   */
  public toNumber(): GuardianProxy<NumberGuardian> {
    return this.transform((value) => Number(value), NumberGuardian);
  }

  /**
   * Converts the string to a Date object.
   *
   * @returns A DateGuardian instance containing the parsed date
   * @throws If the string cannot be converted to a valid Date
   *
   * @example
   * ```ts
   * StringGuardian.create()("2023-01-01").toDate(); // Returns DateGuardian with Date object
   * ```
   */
  public toDate(): GuardianProxy<DateGuardian> {
    return this.transform((value) => new Date(value), DateGuardian);
  }
  //#endregion Transformations

  //#region Validations
  /**
   * Validates that the string has at least the specified length.
   *
   * @param length - The minimum number of characters required
   * @param error - Custom error message to use when validation fails
   * @returns A new Guardian instance with the minimum length validation applied
   *
   * @example
   * ```ts
   * StringGuardian.create()("a").minLength(3);
   * // Throws: "Expected value must be at least 3 characters long"
   * ```
   */
  public minLength(length: number, error?: string): GuardianProxy<this> {
    return this.test(
      (value) => value.length >= length,
      error || 'Expected value must be at least ${expected} characters long',
      length,
    );
  }

  /**
   * Validates that the string does not exceed the specified length.
   *
   * @param length - The maximum number of characters allowed
   * @param error - Custom error message to use when validation fails
   * @returns A new Guardian instance with the maximum length validation applied
   *
   * @example
   * ```ts
   * StringGuardian.create()("hello world").maxLength(5);
   * // Throws: "Expected value must be at most 5 characters long"
   * ```
   */
  public maxLength(length: number, error?: string): GuardianProxy<this> {
    return this.test(
      (value) => value.length <= length,
      error || 'Expected value must be at most ${expected} characters long',
      length,
    );
  }

  /**
   * Validates that the string matches a regular expression pattern.
   *
   * @param pattern - The regular expression to test against
   * @param error - Custom error message to use when validation fails
   * @returns A new Guardian instance with the pattern validation applied
   *
   * @example
   * ```ts
   * StringGuardian.create()("123abc").pattern(/^\d+$/);
   * // Throws: "Expected value to match pattern /^\\d+$/"
   * ```
   */
  public pattern(
    pattern: RegExp,
    error?: string,
  ): GuardianProxy<this> {
    return this.test(
      (value) => pattern.test(value),
      error || 'Expected value to match pattern ${expected}',
      pattern,
    );
  }

  /**
   * Validates that the string is a valid email address.
   *
   * @param error - Custom error message to use when validation fails
   * @returns A new Guardian instance with the email validation applied
   *
   * @example
   * ```ts
   * StringGuardian.create()("invalid").email();
   * // Throws: "Expected value (invalid) to be a valid email"
   * ```
   */
  public email(error?: string): GuardianProxy<this> {
    return this.pattern(
      StringGuardian.patterns['email']!,
      error || 'Expected value (${got}) to be a valid email',
    );
  }

  /**
   * Validates that the string is not empty (has at least one character).
   *
   * @param error - Custom error message to use when validation fails
   * @returns A new Guardian instance with the non-empty validation applied
   *
   * @example
   * ```ts
   * StringGuardian.create()("").notEmpty();
   * // Throws: "Expected value to not be empty"
   * ```
   */
  public notEmpty(error?: string): GuardianProxy<this> {
    return this.test(
      (value) => value.trim().length > 0,
      error || 'Expected value to not be empty',
    );
  }

  /**
   * Validates that the string is a valid URL.
   *
   * @param error - Custom error message to use when validation fails
   * @returns A new Guardian instance with the URL validation applied
   *
   * @example
   * ```ts
   * StringGuardian.create()("invalid").url();
   * // Throws: "Expected value (invalid) to be a valid URL"
   * ```
   */
  public url(error?: string): GuardianProxy<this> {
    return this.pattern(
      StringGuardian.patterns['url']!,
      error || 'Expected value (${got}) to be a valid URL',
    );
  }

  /**
   * Validates that the string contains only alphabetic characters.
   *
   * @param error - Custom error message to use when validation fails
   * @returns A new Guardian instance with the alpha validation applied
   *
   * @example
   * ```ts
   * StringGuardian.create()("abc123").alpha();
   * // Throws: "Expected value (abc123) to contain only alphabets"
   * ```
   */
  public alpha(error?: string): GuardianProxy<this> {
    return this.pattern(
      StringGuardian.patterns['alpha']!,
      error || 'Expected value (${got}) to contain only alphabets',
    );
  }

  /**
   * Validates that the string contains only alphanumeric characters.
   *
   * @param error - Custom error message to use when validation fails
   * @returns A new Guardian instance with the alphanumeric validation applied
   *
   * @example
   * ```ts
   * StringGuardian.create()("abc_123").alphanumeric();
   * // Throws: "Expected value (abc_123) to contain only alphanumeric characters"
   * ```
   */
  public alphanumeric(error?: string): GuardianProxy<this> {
    return this.pattern(
      StringGuardian.patterns['alphanumeric']!,
      error ||
        'Expected value (${got}) to contain only alphanumeric characters',
    );
  }

  /**
   * Validates that the string contains only numeric characters (including decimal points).
   *
   * @param error - Custom error message to use when validation fails
   * @returns A new Guardian instance with the numeric validation applied
   *
   * @example
   * ```ts
   * StringGuardian.create()("123a").numeric();
   * // Throws: "Expected value (123a) to contain only numbers"
   * ```
   */
  public numeric(error?: string): GuardianProxy<this> {
    return this.pattern(
      StringGuardian.patterns['numeric']!,
      error || 'Expected value (${got}) to contain only numbers',
    );
  }

  /**
   * Validates that the string is a valid UUID.
   *
   * @param error - Custom error message to use when validation fails
   * @returns A new Guardian instance with the UUID validation applied
   *
   * @example
   * ```ts
   * StringGuardian.create()("invalid").uuid();
   * // Throws: "Expected value (invalid) to be a valid UUID"
   * ```
   */
  public uuid(error?: string): GuardianProxy<this> {
    return this.pattern(
      StringGuardian.patterns['uuid']!,
      error || 'Expected value (${got}) to be a valid UUID',
    );
  }

  /**
   * Validates that the string is a valid IPv4 address.
   *
   * @param error - Custom error message to use when validation fails
   * @returns A new Guardian instance with the IPv4 validation applied
   *
   * @example
   * ```ts
   * StringGuardian.create()("256.0.0.1").ipv4();
   * // Throws: "Expected value (256.0.0.1) to be an IPv4 address"
   * ```
   */
  public ipv4(error?: string): GuardianProxy<this> {
    return this.test(
      isValidIPv4,
      error || 'Expected value (${got}) to be an IPv4 address',
    );
  }

  /**
   * Validates that the string is a valid IPv6 address.
   *
   * @param error - Custom error message to use when validation fails
   * @returns A new Guardian instance with the IPv6 validation applied
   *
   * @example
   * ```ts
   * StringGuardian.create()("invalid").ipv6();
   * // Throws: "Expected value (invalid) to be an IPv6 address"
   * ```
   */
  public ipv6(error?: string): GuardianProxy<this> {
    return this.test(
      isValidIPv6Structure,
      error || 'Expected value (${got}) to be an IPv6 address',
    );
  }

  /**
   * Validates that the string contains a specified substring.
   *
   * @param substring - The substring that should be present
   * @param error - Custom error message to use when validation fails
   * @returns A new Guardian instance with the contains validation applied
   *
   * @example
   * ```ts
   * StringGuardian.create()("hello").contains("world");
   * // Throws: "Expected value (hello) to contain world"
   * ```
   */
  public contains(substring: string, error?: string): GuardianProxy<this> {
    return this.test(
      (value) => value.includes(substring),
      error || 'Expected value (${got}) to contain ${expected}',
      substring,
    );
  }

  /**
   * Validates that the string does not contain a specified substring.
   *
   * @param substring - The substring that should not be present
   * @param error - Custom error message to use when validation fails
   * @returns A new Guardian instance with the not-contains validation applied
   *
   * @example
   * ```ts
   * StringGuardian.create()("hello world").notContains("world");
   * // Throws: "Expected value (hello world) to not contain world"
   * ```
   */
  public notContains(substring: string, error?: string): GuardianProxy<this> {
    return this.test(
      (value) => value.includes(substring),
      error || 'Expected value (${got}) to not contain ${expected}',
      substring,
    );
  }

  /**
   * Validates that the string starts with a specified prefix.
   *
   * @param prefix - The prefix the string should start with
   * @param error - Custom error message to use when validation fails
   * @returns A new Guardian instance with the starts-with validation applied
   *
   * @example
   * ```ts
   * StringGuardian.create()("hello").startsWith("hi");
   * // Throws: "Expected value (hello) to start with hi"
   * ```
   */
  public startsWith(prefix: string, error?: string): GuardianProxy<this> {
    return this.test(
      (value) => value.startsWith(prefix),
      error || 'Expected value (${got}) to start with ${expected}',
      prefix,
    );
  }

  /**
   * Validates that the string ends with a specified suffix.
   *
   * @param suffix - The suffix the string should end with
   * @param error - Custom error message to use when validation fails
   * @returns A new Guardian instance with the ends-with validation applied
   *
   * @example
   * ```ts
   * StringGuardian.create()("hello").endsWith("world");
   * // Throws: "Expected value (hello) to end with world"
   * ```
   */
  public endsWith(suffix: string, error?: string): GuardianProxy<this> {
    return this.test(
      (value) => value.endsWith(suffix),
      error || 'Expected value (${got}) to end with ${expected}',
      suffix,
    );
  }
  //#endregion Validations
}
