/**
 * @fileoverview `StringGuardian` — coerce-by-default string validator
 * with length, pattern, and format presets (email, UUID, URL, IP, …)
 * plus transforms (trim, case, JSON-parse, …).
 *
 * @module
 */

import { BaseGuardian } from '../BaseGuardian.ts';
import { GuardianError } from '../errors/Base.ts';
import { coerceString } from '../helpers/coerce.ts';
import { gateAsyncStepResult } from '../helpers/thenable.ts';
import type { GuardianMetaData, GuardianTransform } from '../types/mod.ts';
// Sibling guards are referenced ONLY as return types here — the
// constructors the transitions hand to `process()` come from the
// registry, so these imports erase and create no runtime cycle.
import type { NumberGuardian } from './NumberGuardian.ts';
import type { DateGuardian } from './DateGuardian.ts';
import type { BigIntGuardian } from './BigIntGuardian.ts';
import { registerGuardian, resolveGuardian } from '../helpers/mod.ts';

/**
 * String validator. Coerces primitives (number, bigint, boolean) and
 * valid `Date` instances to their string form at parse time; rejects
 * `null`, `undefined`, objects, arrays, and `NaN`. See
 * {@link Guardian.string} for the standard factory.
 *
 * @example
 * ```ts
 * const Name = Guardian.string().minLength(1).maxLength(50);
 * Name.parse('Ada');  // 'Ada'
 * Name.parse(42);     // '42'  ← coerced
 * ```
 *
 * @see {@link Guardian.string}
 */
export class StringGuardian extends BaseGuardian<string> {
  protected override readonly _type = 'string';

  /**
   * Collection of commonly used regular expression patterns for string validation.
   * These patterns can be used with validation methods or accessed directly for custom validation.
   */
  public static readonly patterns = {
    email: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
    url: /^https?:\/\/[^\s/$.?#].[^\s]*$/i,
    alpha: /^[a-zA-Z]+$/,
    alphanumeric: /^[a-zA-Z0-9]+$/,
    // Real (unsigned) number: integer or decimal with exactly one `.`
    // and digits on at least one side. Rejects `1.2.3`, `.`, `...`
    // (the old `/^[0-9.]+$/` accepted all three).
    numeric: /^(?:\d+\.?\d*|\.\d+)$/,
    uuid:
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    uuidv1: /^[\da-f]{8}-[\da-f]{4}-1[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i,
    uuidv4: /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i,
    phone: /^(\+?1-?)?(\(\d{3}\)|\d{3})[-.\s]?\d{3}[-.\s]?\d{4}$/,
    ipv4:
      /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/, //NOSONAR
    ipv6: /^(?:[\da-fA-F]{1,4}:){7}[\da-fA-F]{1,4}$/,
    macAddress: /^([\dA-Fa-f]{2}[:-]){5}([\dA-Fa-f]{2})$/,
    creditCardVisa: /^4\d{12}(?:\d{3})?$/,
    creditCardMastercard: /^5[1-5]\d{14}$/,
    creditCardAmex: /^3[47]\d{13}$/,
    creditCard: /^(?:4\d{12}(?:\d{3})?|5[1-5]\d{14}|3[47]\d{13})$/,
    slug: /^[a-z\d]+(?:-[a-z\d]+)*$/,
    hexColor: /^#(?:[\da-fA-F]{3}){1,2}$/,
    domain:
      /^[a-zA-Z\d]([a-zA-Z\d-]{0,61}[a-zA-Z\d])?(?:\.[a-zA-Z\d]([a-zA-Z\d-]{0,61}[a-zA-Z\d])?)*$/,
    ascii: /^[ -~]*$/,
    noWhitespace: /^\S*$/,
    base64: /^[A-Za-z0-9+/]+={0,2}$/,
    base64Url: /^[A-Za-z0-9_-]+={0,2}$/,
    hex: /^[A-Fa-f0-9]+$/,
    hex0x: /^0x[A-Fa-f0-9]+$/,
    jwt: /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/,
    semver:
      // SemVer 2.0.0 spec: https://semver.org/#backusnaur-form-grammar-for-valid-semver-versions
      /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/,
    mimeType:
      // type/subtype with optional parameters (e.g. `text/html; charset=utf-8`)
      /^[a-zA-Z][a-zA-Z0-9!#$&^_-]*\/[a-zA-Z0-9][a-zA-Z0-9!#$&^_+.-]*(\s*;\s*[a-zA-Z0-9!#$&^_-]+=("[^"]*"|[a-zA-Z0-9!#$&^_.-]+))*$/,
    ulid: /^[0-9A-HJKMNP-TV-Z]{26}$/i, // Crockford base32, excludes I/L/O/U
    cuid: /^c[a-z0-9]{24}$/, // cuid v1 — starts with 'c'
    cuid2: /^[a-z][a-z0-9]{23,}$/, // cuid v2 — starts with letter
    // BCP 47 language tag: language (2-3 lowercase) + optional script
    // (4 letters, title case) + optional region (2 uppercase letters
    // or 3 digits) + optional variant(s). Variants follow the strict
    // RFC 5646 form: 5-8 alphanumerics, OR exactly 4 chars starting
    // with a digit. This deliberately rejects 2-char lowercase
    // suffixes like `en-us` (region must be uppercase). Covers common
    // forms (`en`, `en-US`, `zh-Hans`, `zh-Hans-CN`, `de-DE-1996`,
    // `es-419`) but not the full BCP 47 grammar (extension singletons,
    // private-use blocks).
    languageCode:
      /^[a-z]{2,3}(-[A-Z][a-z]{3})?(-([A-Z]{2}|\d{3}))?(-([a-zA-Z0-9]{5,8}|\d[a-zA-Z0-9]{3}))*$/,
    // Base58 alphabet (Bitcoin / IPFS): omits `0`, `O`, `I`, `l` to
    // avoid visual confusion.
    base58: /^[1-9A-HJ-NP-Za-km-z]+$/,
    // Base32 standard (RFC 4648): `A-Z` and `2-7`, with optional `=`
    // padding to a multiple of 8 chars.
    base32: /^[A-Z2-7]+=*$/,
  } as const;

  /**
   * Creates a new StringGuardian instance.
   *
   * @param initialTransform - Optional composed transformation from previous guardian
   * @param metaData - Optional metadata for this guardian
   */
  constructor(
    initialTransform?: GuardianTransform<unknown, string>,
    metaData?: GuardianMetaData,
  ) {
    // Coerce-by-default — see `helpers/coerce.ts` for accepted forms.
    // Strings pass through unchanged; number / bigint / boolean /
    // valid Date are coerced; everything else throws.
    const defaultStringValidation = coerceString;

    let finalTransform: GuardianTransform<unknown, string>;
    if (initialTransform) {
      // Chain the provided transform with default validation
      finalTransform = (input: unknown) => {
        const transformedValue = initialTransform(input);
        // A type-crossing transform reached via `.process(fn,
        // StringGuardian)` (e.g. `date().toISOString()`,
        // `number().formatCurrency()`) may sit on an async chain, in
        // which case `initialTransform` returns a Promise. Await it
        // before coercion — otherwise the synchronous coercion helper
        // receives a Promise object and throws "Cannot coerce object to
        // string". The guardian is already flagged `isAsync` upstream,
        // so `parseAsync` awaits this. Only a real Promise is a leaked
        // async step to thread through `.then()`; a non-Promise
        // thenable-shaped VALUE would be ADOPTED (and silently destroyed)
        // if `.then()` were called on it, so refuse it loudly instead.
        if (transformedValue instanceof Promise) {
          return transformedValue.then((v) => defaultStringValidation(v));
        }
        return defaultStringValidation(gateAsyncStepResult(transformedValue));
      };
    } else {
      finalTransform = defaultStringValidation;
    }

    super(finalTransform, metaData);
  }

  //#region Validation Methods

  /**
   * Validates minimum string length.
   *
   * @param length - Minimum required length
   * @param errorMessage - Optional custom error message
   * @returns A new StringGuardian with the validation applied (the receiver is never mutated)
   * @throws {GuardianError} If string length is less than the specified minimum
   *
   * @example
   * ```ts
   * const schema = new StringGuardian().minLength(3);
   * schema.parse('hi'); // throws GuardianError
   * schema.parse('hello'); // 'hello'
   * ```
   */
  minLength(length: number, errorMessage?: string): this {
    const result = this.process((str: string) => {
      if (str.length < length) {
        throw new GuardianError(
          errorMessage || `String must be at least ${length} characters long`,
          {
            expected: length,
            got: str.length,
            comparison: 'minLength',
            type: 'string',
          },
        );
      }
      return str;
    }) as this;

    // Store constraint for OpenAPI generation
    result._metaData ??= {};
    result._metaData.minLength = length;
    return result;
  }

  /**
   * Validates maximum string length.
   *
   * @param length - Maximum allowed length
   * @param errorMessage - Optional custom error message
   * @returns A new StringGuardian with the validation applied (the receiver is never mutated)
   * @throws {GuardianError} If string length exceeds the specified maximum
   *
   * @example
   * ```ts
   * const schema = new StringGuardian().maxLength(10);
   * schema.parse('hello world!'); // throws GuardianError
   * schema.parse('hello'); // 'hello'
   * ```
   */
  maxLength(length: number, errorMessage?: string): this {
    const result = this.process((str: string) => {
      if (str.length > length) {
        throw new GuardianError(
          errorMessage ?? `String must be at most ${length} characters long`,
          {
            expected: length,
            got: str.length,
            comparison: 'maxLength',
            type: 'string',
          },
        );
      }
      return str;
    }) as this;

    result._metaData ??= {};
    result._metaData.maxLength = length;
    return result;
  }

  /**
   * Validates exact string length.
   *
   * @param length - Exact required length
   * @param errorMessage - Optional custom error message
   * @returns A new StringGuardian with the validation applied (the receiver is never mutated)
   * @throws {GuardianError} If string length does not match the specified length
   */
  length(length: number, errorMessage?: string): this {
    return this.process(
      (value: string) => {
        if (value.length !== length) {
          throw new GuardianError(
            errorMessage || `String must be exactly ${length} characters long`,
            {
              expected: `string with length ${length}`,
              got: value,
              comparison: 'length',
              type: 'validation',
            },
          );
        }
        return value;
      },
    ) as this;
  }

  /**
   * Validates string against a regular expression.
   *
   * @param pattern - Regular expression pattern to match
   * @param errorMessage - Optional custom error message
   * @returns A new StringGuardian with the validation applied (the receiver is never mutated)
   * @throws {GuardianError} If string does not match the specified pattern
   *
   * @example
   * ```ts
   * const schema = new StringGuardian().pattern(/^[a-zA-Z]+$/, 'Letters only');
   * schema.parse('hello123'); // throws GuardianError
   * schema.parse('hello'); // 'hello'
   * ```
   */
  /**
   * Return a stateless copy of a caller-supplied pattern. A `g` / `y`
   * regex is stateful: `.test()` advances its `lastIndex`, so the same
   * guardian would flip between pass and fail on identical input (a
   * valid string passes, the next identical parse starts matching
   * mid-string and fails, the next resets and passes, …). Strip those
   * flags — whole-string validation membership doesn't depend on them —
   * so matching is deterministic. Flag-free patterns are returned as-is
   * (the shared built-in patterns never carry `g` / `y`).
   *
   * @internal
   */
  private static __statelessPattern(pattern: RegExp): RegExp {
    if (!pattern.global && !pattern.sticky) return pattern;
    return new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, ''));
  }

  pattern(pattern: RegExp, errorMessage?: string): this {
    // Neutralise stateful `g` / `y` flags so repeated parses are
    // deterministic — see `__statelessPattern`.
    const safePattern = StringGuardian.__statelessPattern(pattern);
    const result = this.process(
      (value: string) => {
        if (!safePattern.test(value)) {
          throw new GuardianError(
            errorMessage || `String does not match pattern ${pattern}`,
            {
              expected: `string matching ${pattern}`,
              got: value,
              comparison: 'pattern',
              type: 'validation',
            },
          );
        }
        return value;
      },
    ) as this;

    // Store pattern for OpenAPI generation
    result._metaData ??= {};
    result._metaData.pattern = pattern.source;
    return result;
  }

  /**
   * Validates that string is not empty (after trimming whitespace).
   *
   * @param errorMessage - Optional custom error message
   * @returns A new StringGuardian with the validation applied (the receiver is never mutated)
   * @throws {GuardianError} If string is empty or contains only whitespace
   */
  notEmpty(errorMessage?: string): this {
    return this.process(
      (value: string) => {
        if (value.trim().length === 0) {
          throw new GuardianError(
            errorMessage || 'String cannot be empty',
            {
              expected: 'non-empty string',
              got: value,
              comparison: 'nonEmpty',
              type: 'validation',
            },
          );
        }
        return value;
      },
    ) as this;
  }

  /**
   * Validates string is a valid email address.
   *
   * @param errorMessage - Optional custom error message
   * @returns A new StringGuardian with the validation applied (the receiver is never mutated)
   * @throws {GuardianError} If string is not a valid email address format
   */
  email(errorMessage?: string): this {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    const result = this.pattern(
      emailRegex,
      errorMessage || 'Invalid email address format',
    );

    // Override pattern constraint with format for OpenAPI
    result._metaData ??= {};
    result._metaData.format = 'email';
    // Pattern removed for format-specific validations
    delete result._metaData.pattern; // Remove the regex pattern
    return result;
  }

  /**
   * Validates string is a valid URL.
   *
   * @param errorMessage - Optional custom error message
   * @returns A new StringGuardian with the validation applied (the receiver is never mutated)
   * @throws {GuardianError} If string is not a valid URL format
   */
  url(errorMessage?: string): this {
    const result = this.process((str: string) => {
      try {
        new URL(str);
        return str;
      } catch {
        throw new GuardianError(errorMessage || 'Expected valid URL', {
          expected: 'URL format',
          got: str,
          comparison: 'format',
          type: 'string',
        });
      }
    }) as this;

    // Store format for OpenAPI generation
    result._metaData ??= {};
    result._metaData.format = 'uri';
    return result;
  }

  /**
   * Validates string contains only alphabetic characters (a-z, A-Z).
   *
   * @param errorMessage - Optional custom error message
   * @returns A new StringGuardian with the validation applied (the receiver is never mutated)
   */
  alpha(errorMessage?: string): this {
    const result = this.pattern(
      StringGuardian.patterns.alpha,
      errorMessage || 'String must contain only alphabetic characters',
    );

    // Override pattern constraint with format for OpenAPI
    result._metaData ??= {};
    result._metaData.format = 'alpha';
    // Pattern removed for format-specific validations
    delete result._metaData.pattern;
    return result;
  }

  /**
   * Validates string contains only alphanumeric characters (a-z, A-Z, 0-9).
   *
   * @param errorMessage - Optional custom error message
   * @returns A new StringGuardian with the validation applied (the receiver is never mutated)
   */
  alphanumeric(errorMessage?: string): this {
    const result = this.pattern(
      StringGuardian.patterns.alphanumeric,
      errorMessage || 'String must contain only alphanumeric characters',
    );

    // Override pattern constraint with format for OpenAPI
    result._metaData ??= {};
    result._metaData.format = 'alphanumeric';
    // Pattern removed for format-specific validations
    delete result._metaData.pattern;
    return result;
  }

  /**
   * Validates string is a valid UUID (any version).
   *
   * @param errorMessage - Optional custom error message
   * @returns A new StringGuardian with the validation applied (the receiver is never mutated)
   */
  uuid(errorMessage?: string): this {
    const result = this.pattern(
      StringGuardian.patterns.uuid,
      errorMessage || 'String must be a valid UUID',
    );

    // Override pattern constraint with format for OpenAPI
    result._metaData ??= {};
    result._metaData.format = 'uuid';
    // Pattern removed for format-specific validations
    delete result._metaData.pattern;
    return result;
  }

  /**
   * Validates string is a valid UUID v1.
   *
   * @param errorMessage - Optional custom error message
   * @returns A new StringGuardian with the validation applied (the receiver is never mutated)
   */
  uuidv1(errorMessage?: string): this {
    const result = this.pattern(
      StringGuardian.patterns.uuidv1,
      errorMessage || 'String must be a valid UUIDv1',
    );

    // Override pattern constraint with format for OpenAPI
    result._metaData ??= {};
    result._metaData.format = 'uuid';
    // Pattern removed for format-specific validations
    delete result._metaData.pattern;
    return result;
  }

  /**
   * Validates string is a valid UUID v4.
   *
   * @param errorMessage - Optional custom error message
   * @returns A new StringGuardian with the validation applied (the receiver is never mutated)
   */
  uuidv4(errorMessage?: string): this {
    const result = this.pattern(
      StringGuardian.patterns.uuidv4,
      errorMessage || 'String must be a valid UUID v4',
    );

    // Override pattern constraint with format for OpenAPI
    result._metaData ??= {};
    result._metaData.format = 'uuid';
    // Pattern removed for format-specific validations
    delete result._metaData.pattern;
    return result;
  }

  /**
   * Validates string contains the specified substring.
   *
   * @param substring - The substring that must be present
   * @param errorMessage - Optional custom error message
   * @returns A new StringGuardian with the validation applied (the receiver is never mutated)
   */
  contains(substring: string, errorMessage?: string): this {
    return this.process((value: string) => {
      if (!value.includes(substring)) {
        throw new GuardianError(
          errorMessage || `String must contain "${substring}"`,
          {
            expected: `string containing "${substring}"`,
            got: value,
            comparison: 'contains',
            type: 'validation',
          },
        );
      }
      return value;
    }) as this;
  }

  /**
   * Validates string does not contain the specified substring.
   *
   * @param substring - The substring that must not be present
   * @param errorMessage - Optional custom error message
   * @returns A new StringGuardian with the validation applied (the receiver is never mutated)
   */
  notContains(substring: string, errorMessage?: string): this {
    return this.process((value: string) => {
      if (value.includes(substring)) {
        throw new GuardianError(
          errorMessage || `String must not contain "${substring}"`,
          {
            expected: `string not containing "${substring}"`,
            got: value,
            comparison: 'notContains',
            type: 'validation',
          },
        );
      }
      return value;
    }) as this;
  }

  /**
   * Validates string starts with the specified prefix.
   *
   * @param prefix - The prefix the string must start with
   * @param errorMessage - Optional custom error message
   * @returns A new StringGuardian with the validation applied (the receiver is never mutated)
   */
  startsWith(prefix: string, errorMessage?: string): this {
    return this.process((value: string) => {
      if (!value.startsWith(prefix)) {
        throw new GuardianError(
          errorMessage || `String must start with "${prefix}"`,
          {
            expected: `string starting with "${prefix}"`,
            got: value,
            comparison: 'startsWith',
            type: 'validation',
          },
        );
      }
      return value;
    }) as this;
  }

  /**
   * Validates string ends with the specified suffix.
   *
   * @param suffix - The suffix the string must end with
   * @param errorMessage - Optional custom error message
   * @returns A new StringGuardian with the validation applied (the receiver is never mutated)
   */
  endsWith(suffix: string, errorMessage?: string): this {
    return this.process((value: string) => {
      if (!value.endsWith(suffix)) {
        throw new GuardianError(
          errorMessage || `String must end with "${suffix}"`,
          {
            expected: `string ending with "${suffix}"`,
            got: value,
            comparison: 'endsWith',
            type: 'validation',
          },
        );
      }
      return value;
    }) as this;
  }

  /**
   * Validates string does not start with the specified prefix.
   *
   * @param prefix - The prefix the string must not start with
   * @param errorMessage - Optional custom error message
   * @returns A new StringGuardian with the validation applied (the receiver is never mutated)
   */
  notStartsWith(prefix: string, errorMessage?: string): this {
    return this.process((value: string) => {
      if (value.startsWith(prefix)) {
        throw new GuardianError(
          errorMessage || `String must not start with "${prefix}"`,
          {
            expected: `string not starting with "${prefix}"`,
            got: value,
            comparison: 'notStartsWith',
            type: 'validation',
          },
        );
      }
      return value;
    }) as this;
  }

  /**
   * Validates string does not end with the specified suffix.
   *
   * @param suffix - The suffix the string must not end with
   * @param errorMessage - Optional custom error message
   * @returns A new StringGuardian with the validation applied (the receiver is never mutated)
   */
  notEndsWith(suffix: string, errorMessage?: string): this {
    return this.process((value: string) => {
      if (value.endsWith(suffix)) {
        throw new GuardianError(
          errorMessage || `String must not end with "${suffix}"`,
          {
            expected: `string not ending with "${suffix}"`,
            got: value,
            comparison: 'notEndsWith',
            type: 'validation',
          },
        );
      }
      return value;
    }) as this;
  }

  /**
   * Validates string as phone number using configurable pattern.
   *
   * @param pattern - Optional custom regex pattern (defaults to US phone format)
   * @param errorMessage - Optional custom error message
   * @returns A new StringGuardian with the validation applied (the receiver is never mutated)
   */
  phone(
    pattern: RegExp = StringGuardian.patterns.phone,
    errorMessage?: string,
  ): this {
    // Neutralise stateful `g` / `y` flags so repeated parses are
    // deterministic — see `__statelessPattern`.
    const safePattern = StringGuardian.__statelessPattern(pattern);
    return this.process((value: string) => {
      if (!safePattern.test(value)) {
        throw new GuardianError(
          errorMessage || 'String must be a valid phone number',
          {
            expected: 'valid phone number',
            got: value,
            comparison: 'phone',
            type: 'validation',
          },
        );
      }
      return value;
    }) as this;
  }

  /**
   * Validates string as IP address (IPv4 or IPv6).
   *
   * @param errorMessage - Optional custom error message
   * @returns A new StringGuardian with the validation applied (the receiver is never mutated)
   */
  ipAddress(errorMessage?: string): this {
    return this.process((value: string) => {
      const isIpv4 = StringGuardian.patterns.ipv4.test(value);
      const isIpv6 = StringGuardian.patterns.ipv6.test(value);

      if (!isIpv4 && !isIpv6) {
        throw new GuardianError(
          errorMessage || 'String must be a valid IP address (IPv4 or IPv6)',
          {
            expected: 'valid IP address',
            got: value,
            comparison: 'ipAddress',
            type: 'validation',
          },
        );
      }
      return value;
    }) as this;
  }

  /**
   * Validates string as IPv4 address.
   *
   * @param errorMessage - Optional custom error message
   * @returns A new StringGuardian with the validation applied (the receiver is never mutated)
   */
  ipv4(errorMessage?: string): this {
    return this.pattern(
      StringGuardian.patterns.ipv4,
      errorMessage || 'String must be a valid IPv4 address',
    );
  }

  /**
   * Validates string as IPv6 address.
   *
   * @param errorMessage - Optional custom error message
   * @returns A new StringGuardian with the validation applied (the receiver is never mutated)
   */
  ipv6(errorMessage?: string): this {
    return this.pattern(
      StringGuardian.patterns.ipv6,
      errorMessage || 'String must be a valid IPv6 address',
    );
  }

  /**
   * Validates string as internal/private IP address.
   *
   * @param errorMessage - Optional custom error message
   * @returns A new StringGuardian with the validation applied (the receiver is never mutated)
   */
  internalIp(errorMessage?: string): this {
    return this.process((value: string) => {
      // Check if it's a valid IPv4 first
      if (!StringGuardian.patterns.ipv4.test(value)) {
        throw new GuardianError(
          errorMessage || 'String must be a valid internal IPv4 address',
          {
            expected: 'valid internal IPv4 address',
            got: value,
            comparison: 'internalIp',
            type: 'validation',
          },
        );
      }

      const parts = value.split('.').map(Number);
      const isInternal =
        // 10.0.0.0/8
        (parts[0] === 10) ||
        // 172.16.0.0/12
        (parts[0] === 172 && parts[1]! >= 16 && parts[1]! <= 31) || //NOSONAR
        // 192.168.0.0/16
        (parts[0] === 192 && parts[1] === 168) ||
        // 127.0.0.0/8 (loopback)
        (parts[0] === 127);

      if (!isInternal) {
        throw new GuardianError(
          errorMessage || 'String must be a valid internal IP address',
          {
            expected:
              'internal IP address (10.x.x.x, 172.16-31.x.x, 192.168.x.x, 127.x.x.x)',
            got: value,
            comparison: 'internalIp',
            type: 'validation',
          },
        );
      }
      return value;
    }) as this;
  }

  /**
   * Validates string as MAC address.
   *
   * @param errorMessage - Optional custom error message
   * @returns A new StringGuardian with the validation applied (the receiver is never mutated)
   */
  macAddress(errorMessage?: string): this {
    return this.pattern(
      StringGuardian.patterns.macAddress,
      errorMessage || 'String must be a valid MAC address',
    );
  }

  /**
   * Validates string as credit card number.
   *
   * @param type - Optional card type ('visa', 'mastercard', 'amex', or 'any')
   * @param errorMessage - Optional custom error message
   * @returns A new StringGuardian with the validation applied (the receiver is never mutated)
   */
  creditCard(
    type: 'visa' | 'mastercard' | 'amex' | 'any' = 'any',
    errorMessage?: string,
  ): this {
    return this.process((value: string) => {
      let pattern: RegExp;
      let typeName: string;

      switch (type) {
        case 'visa':
          pattern = StringGuardian.patterns.creditCardVisa;
          typeName = 'Visa';
          break;
        case 'mastercard':
          pattern = StringGuardian.patterns.creditCardMastercard;
          typeName = 'Mastercard';
          break;
        case 'amex':
          pattern = StringGuardian.patterns.creditCardAmex;
          typeName = 'American Express';
          break;
        default:
          pattern = StringGuardian.patterns.creditCard;
          typeName = 'credit card';
          break;
      }

      if (!pattern.test(value)) {
        throw new GuardianError(
          errorMessage || `String must be a valid ${typeName} number`,
          {
            expected: `valid ${typeName} number`,
            got: value,
            comparison: 'creditCard',
            type: 'validation',
          },
        );
      }

      // Basic Luhn algorithm check for additional validation
      const digits = value.replaceAll(/\D/g, '');
      let sum = 0;
      let alternate = false;

      for (let i = digits.length - 1; i >= 0; i--) {
        let digit = Number.parseInt(digits[i]!, 10); // NOSONAR
        if (alternate) {
          digit *= 2;
          if (digit > 9) digit -= 9;
        }
        sum += digit;
        alternate = !alternate;
      }

      if (sum % 10 !== 0) {
        throw new GuardianError(
          errorMessage || `String must be a valid ${typeName} number`,
          {
            expected: `valid ${typeName} number (failed checksum)`,
            got: value,
            comparison: 'creditCard',
            type: 'validation',
          },
        );
      }

      return value;
    }) as this;
  }

  /**
   * Validates string as URL-friendly slug.
   *
   * @param errorMessage - Optional custom error message
   * @returns A new StringGuardian with the validation applied (the receiver is never mutated)
   */
  slug(errorMessage?: string): this {
    return this.pattern(
      StringGuardian.patterns.slug,
      errorMessage ||
        'String must be a valid slug (lowercase letters, numbers, hyphens only)',
    );
  }

  /**
   * Validates string as hex color code.
   *
   * @param errorMessage - Optional custom error message
   * @returns A new StringGuardian with the validation applied (the receiver is never mutated)
   */
  hexColor(errorMessage?: string): this {
    return this.pattern(
      StringGuardian.patterns.hexColor,
      errorMessage || 'String must be a valid hex color code (#RGB or #RRGGBB)',
    );
  }

  /**
   * Validates string as domain name.
   *
   * @param errorMessage - Optional custom error message
   * @returns A new StringGuardian with the validation applied (the receiver is never mutated)
   */
  domain(errorMessage?: string): this {
    return this.pattern(
      StringGuardian.patterns.domain,
      errorMessage || 'String must be a valid domain name',
    );
  }

  /**
   * Validates that string contains no whitespace characters.
   *
   * @param errorMessage - Optional custom error message
   * @returns A new StringGuardian with the validation applied (the receiver is never mutated)
   */
  noWhitespace(errorMessage?: string): this {
    return this.pattern(
      StringGuardian.patterns.noWhitespace,
      errorMessage || 'String must not contain whitespace',
    );
  }

  /**
   * Validates that string contains only ASCII characters.
   *
   * @param errorMessage - Optional custom error message
   * @returns A new StringGuardian with the validation applied (the receiver is never mutated)
   */
  ascii(errorMessage?: string): this {
    return this.pattern(
      StringGuardian.patterns.ascii,
      errorMessage || 'String must contain only ASCII characters',
    );
  }

  /**
   * Rejects strings that look like **structured SQL injection**
   * attempts. This is a heuristic, defence-in-depth signal — **not** a
   * substitute for parameterised queries / prepared statements, which
   * are the only correct mitigation. Use it to reject blatantly
   * hostile input early (e.g. on a free-text field that should never
   * contain SQL), not as your query-safety boundary.
   *
   * It matches *combinations* that indicate SQL syntax rather than
   * blanket-rejecting punctuation, so ordinary text passes:
   *
   * - Boolean tautologies breaking out of a quote — `' OR 1=1`,
   *   `" AND 'a'='a`.
   * - UNION-based extraction — `UNION SELECT`, `UNION ALL SELECT`.
   * - Stacked statements after `;` — `; DROP TABLE users`.
   * - Full DML/DDL statement shapes (keyword *pairs*) — `SELECT … FROM`,
   *   `INSERT INTO`, `UPDATE … SET`, `DELETE FROM`, `DROP TABLE`, …
   * - SQL comment sequences — `--`, `/* … *&#47;`.
   *
   * Deliberately does **not** flag a lone apostrophe or hyphen, so
   * legitimate values like `O'Brien`, `well-known`, `2024-01-01` and
   * `please select one` validate. Because it's heuristic it can still
   * produce false positives (a sentence like `select rows from the
   * list`) and false negatives — treat any pass/fail as advisory.
   *
   * @param errorMessage - Optional custom error message
   * @returns A new StringGuardian with the validation applied (the receiver is never mutated)
   */
  noSqlInjection(errorMessage?: string): this {
    // Each pattern targets a SQL *structure*, not a single character —
    // this keeps the false-positive rate low enough to be usable on
    // names, dates, slugs and free text.
    const sqlInjectionPatterns = [
      // Boolean tautologies used to break out of a quoted literal:
      //   ' OR 1=1   " AND 5 = 5
      /['"`]\s*(?:or|and)\b\s*['"`]?\s*\d+\s*=\s*\d+/i,
      //   ' OR 'a'='a   " OR "x"="x
      /['"`]\s*(?:or|and)\b\s*['"`][^'"`]*['"`]\s*=\s*['"`]/i,
      // UNION-based extraction:  UNION SELECT / UNION ALL SELECT
      /\bunion\b\s+(?:all\s+)?\bselect\b/i,
      // Stacked / piggy-backed statements after a semicolon:
      //   ; DROP TABLE   ; DELETE FROM
      /;\s*(?:select|insert|update|delete|drop|alter|create|truncate|exec(?:ute)?|union|grant|revoke|merge)\b/i,
      // Full DML/DDL statement shapes — keyword pairs, not lone keywords:
      /\bselect\b[\s\S]*?\bfrom\b/i,
      /\binsert\b\s+into\b/i,
      /\bupdate\b[\s\S]*?\bset\b/i,
      /\bdelete\b\s+from\b/i,
      /\bdrop\b\s+(?:table|database|schema|index|view)\b/i,
      /\balter\b\s+(?:table|database)\b/i,
      /\bcreate\b\s+(?:table|database|schema|index|view)\b/i,
      // SQL comment sequences used to truncate the rest of a query:
      /--|\/\*|\*\//,
    ];

    return this.process((value: string) => {
      for (const pattern of sqlInjectionPatterns) {
        if (pattern.test(value)) {
          throw new GuardianError(
            errorMessage || 'String contains potential SQL injection patterns',
            {
              expected: 'string without SQL injection patterns',
              got: value,
              comparison: 'noSqlInjection',
              type: 'validation',
            },
          );
        }
      }
      return value;
    }) as this;
  }

  /**
   * Validates that string does not contain common XSS patterns.
   *
   * @param errorMessage - Optional custom error message
   * @returns A new StringGuardian with the validation applied (the receiver is never mutated)
   */
  noXss(errorMessage?: string): this {
    return this.process((value: string) => {
      const xssPatterns = [
        /<script[^>]*>.*?<\/script>/gi, // Script tags
        /<iframe[^>]*>.*?<\/iframe>/gi, // Iframe tags
        /on\w+\s*=\s*["'][^"']*["']/gi, // Event handlers
        /javascript:/gi, // JavaScript protocol
        /<(img|svg)[^>]*on\w+/gi, // Image/SVG with events
        /expression\s*\(/gi, // CSS expressions
        /<\s*link[^>]*>/gi, // Link tags
        /<\s*meta[^>]*>/gi, // Meta tags
      ];

      for (const pattern of xssPatterns) {
        if (pattern.test(value)) {
          throw new GuardianError(
            errorMessage || 'String contains potential XSS patterns',
            {
              expected: 'string without XSS patterns',
              got: value,
              comparison: 'noXss',
              type: 'validation',
            },
          );
        }
      }
      return value;
    }) as this;
  }

  /**
   * Validates that the string is a valid base64 (RFC 4648) encoding.
   *
   * Length must be a multiple of 4 (with optional `=` padding) and
   * only the standard alphabet `A-Z a-z 0-9 + /` is allowed. Pass
   * `{ urlSafe: true }` to accept the url-safe variant (`-` / `_` in
   * place of `+` / `/`) — used by JWT segments, signed URLs, etc.
   *
   * @example
   * ```ts
   * Guardian.string().base64().parse('aGVsbG8=');                // 'hello'
   * Guardian.string().base64({ urlSafe: true }).parse('aGVsbG8'); // 'hello' (url-safe, unpadded ok)
   * ```
   */
  base64(opts?: { urlSafe?: boolean }, errorMessage?: string): this {
    const urlSafe = opts?.urlSafe === true;
    const result = this.process((value: string) => {
      const pattern = urlSafe
        ? StringGuardian.patterns.base64Url
        : StringGuardian.patterns.base64;
      // Strip padding for the length check — url-safe variants often
      // omit padding, and the regex already allows 0–2 `=`.
      const stripped = value.replace(/=+$/, '');
      const padded = value.length;
      if (
        !pattern.test(value) ||
        (padded > 0 && padded % 4 !== 0 && stripped.length % 4 === 1)
      ) {
        throw new GuardianError(
          errorMessage ||
            `String must be valid ${urlSafe ? 'base64url' : 'base64'}`,
          {
            expected: urlSafe ? 'base64url' : 'base64',
            got: value,
            comparison: 'base64',
            type: 'string',
          },
        );
      }
      return value;
    }) as this;
    result._metaData ??= {};
    result._metaData.format = urlSafe ? 'base64url' : 'byte';
    return result;
  }

  /**
   * Validates that the string is a hex-encoded value.
   *
   * @param opts.length - If provided, require exactly this many hex
   *   characters (case-insensitive; `0x` prefix not counted).
   * @param opts.prefix - `'0x'` requires the leading `0x`; `'none'`
   *   rejects it; default permits either form.
   *
   * @example
   * ```ts
   * Guardian.string().hex().parse('deadBEEF');                       // ok
   * Guardian.string().hex({ length: 64 }).parse(sha256Hex);          // sha256
   * Guardian.string().hex({ length: 40, prefix: '0x' }).parse(addr); // eth address
   * ```
   */
  hex(
    opts?: { length?: number; prefix?: '0x' | 'none' },
    errorMessage?: string,
  ): this {
    const requiredLength = opts?.length;
    const prefixMode = opts?.prefix;
    const result = this.process((value: string) => {
      const hasPrefix = value.startsWith('0x') || value.startsWith('0X');
      if (prefixMode === '0x' && !hasPrefix) {
        throw new GuardianError(
          errorMessage || 'Hex string must start with `0x` prefix',
          {
            expected: '0x-prefixed hex',
            got: value,
            comparison: 'hex',
            type: 'string',
          },
        );
      }
      if (prefixMode === 'none' && hasPrefix) {
        throw new GuardianError(
          errorMessage || 'Hex string must not start with `0x` prefix',
          {
            expected: 'unprefixed hex',
            got: value,
            comparison: 'hex',
            type: 'string',
          },
        );
      }
      const body = hasPrefix ? value.slice(2) : value;
      if (!StringGuardian.patterns.hex.test(body)) {
        throw new GuardianError(
          errorMessage || 'String must be valid hexadecimal',
          {
            expected: 'hex',
            got: value,
            comparison: 'hex',
            type: 'string',
          },
        );
      }
      if (requiredLength !== undefined && body.length !== requiredLength) {
        throw new GuardianError(
          errorMessage ||
            `Hex string must be exactly ${requiredLength} characters (got ${body.length})`,
          {
            expected: requiredLength,
            got: body.length,
            comparison: 'length',
            type: 'string',
          },
        );
      }
      return value;
    }) as this;
    result._metaData ??= {};
    result._metaData.format = 'hex';
    return result;
  }

  /**
   * Validates the string looks like a JWT (three base64url segments
   * separated by `.`). **Does not verify the signature** — that's a
   * runtime concern handled by your auth library; this just catches
   * obviously-malformed tokens at the API boundary.
   */
  jwt(errorMessage?: string): this {
    const result = this.pattern(
      StringGuardian.patterns.jwt,
      errorMessage || 'String must be a valid JWT (three base64url segments)',
    );
    result._metaData ??= {};
    result._metaData.format = 'jwt';
    delete result._metaData.pattern;
    return result;
  }

  /**
   * Validates an ISBN. Supports ISBN-10 and ISBN-13 (default: either).
   * Hyphens and spaces are stripped before checksum validation.
   *
   * @param version - `10` or `13`; omit to accept both.
   */
  isbn(version?: 10 | 13, errorMessage?: string): this {
    const result = this.process((value: string) => {
      const clean = value.replace(/[\s-]/g, '');
      const isIsbn10 = /^\d{9}[\dXx]$/.test(clean);
      const isIsbn13 = /^\d{13}$/.test(clean);

      if (version === 10 && !isIsbn10) {
        throw new GuardianError(
          errorMessage || 'String must be a valid ISBN-10',
          {
            expected: 'ISBN-10',
            got: value,
            comparison: 'isbn',
            type: 'string',
          },
        );
      }
      if (version === 13 && !isIsbn13) {
        throw new GuardianError(
          errorMessage || 'String must be a valid ISBN-13',
          {
            expected: 'ISBN-13',
            got: value,
            comparison: 'isbn',
            type: 'string',
          },
        );
      }
      if (!isIsbn10 && !isIsbn13) {
        throw new GuardianError(errorMessage || 'String must be a valid ISBN', {
          expected: 'ISBN-10 or ISBN-13',
          got: value,
          comparison: 'isbn',
          type: 'string',
        });
      }

      // Checksum validation
      const valid = isIsbn10 ? checkIsbn10(clean) : checkIsbn13(clean);
      if (!valid) {
        throw new GuardianError(errorMessage || 'ISBN checksum is invalid', {
          expected: 'valid ISBN checksum',
          got: value,
          comparison: 'isbn',
          type: 'string',
        });
      }
      return value;
    }) as this;
    result._metaData ??= {};
    result._metaData.format = 'isbn';
    return result;
  }

  /**
   * Validates the string is a SemVer 2.0.0 version
   * (e.g. `1.2.3`, `1.0.0-beta.1`, `2.0.0+build.123`).
   *
   * @param opts.allowPrerelease - If `false`, rejects pre-release
   *   suffixes (`1.0.0-rc.1`). Default `true`.
   */
  semver(
    opts?: { allowPrerelease?: boolean },
    errorMessage?: string,
  ): this {
    const allowPrerelease = opts?.allowPrerelease !== false;
    const result = this.process((value: string) => {
      if (!StringGuardian.patterns.semver.test(value)) {
        throw new GuardianError(
          errorMessage || 'String must be a valid SemVer 2.0.0 version',
          {
            expected: 'semver',
            got: value,
            comparison: 'semver',
            type: 'string',
          },
        );
      }
      if (!allowPrerelease && value.includes('-')) {
        throw new GuardianError(
          errorMessage || 'Pre-release SemVer versions are not allowed',
          {
            expected: 'stable semver',
            got: value,
            comparison: 'semver',
            type: 'string',
          },
        );
      }
      return value;
    }) as this;
    result._metaData ??= {};
    result._metaData.format = 'semver';
    return result;
  }

  /**
   * Validates the string is a MIME type (`type/subtype` with optional
   * parameters). When `allowed` is supplied, the parsed primary type
   * (ignoring parameters) must be in the list.
   *
   * @example
   * ```ts
   * Guardian.string().mimeType().parse('application/json');
   * Guardian.string().mimeType(['image/png', 'image/jpeg']).parse('image/png');
   * ```
   */
  mimeType(
    allowed?: readonly string[],
    errorMessage?: string,
  ): this {
    const result = this.process((value: string) => {
      if (!StringGuardian.patterns.mimeType.test(value)) {
        throw new GuardianError(
          errorMessage || 'String must be a valid MIME type',
          {
            expected: 'MIME type (type/subtype)',
            got: value,
            comparison: 'mimeType',
            type: 'string',
          },
        );
      }
      if (allowed && allowed.length > 0) {
        const primary = value.split(';')[0]!.trim().toLowerCase();
        const allowList = allowed.map((m) => m.toLowerCase());
        if (!allowList.includes(primary)) {
          throw new GuardianError(
            errorMessage ||
              `MIME type must be one of: ${
                allowed.join(', ')
              } (got '${primary}')`,
            {
              expected: allowed.join(', '),
              got: primary,
              comparison: 'mimeType',
              type: 'string',
            },
          );
        }
      }
      return value;
    }) as this;
    result._metaData ??= {};
    result._metaData.format = 'mime-type';
    return result;
  }

  /**
   * Validates an ISO 3166 country code. Pass the desired form:
   *
   * - `'alpha-2'` — two-letter (`US`, `GB`, `IN`) — most common.
   * - `'alpha-3'` — three-letter (`USA`, `GBR`, `IND`).
   * - `'numeric'` — three-digit (`840`, `826`, `356`).
   *
   * Validates **format only**. To check membership against the
   * official list, chain `.isIn([...])` with your allow-list.
   */
  countryCode(
    format: 'alpha-2' | 'alpha-3' | 'numeric' = 'alpha-2',
    errorMessage?: string,
  ): this {
    const patterns = {
      'alpha-2': /^[A-Z]{2}$/,
      'alpha-3': /^[A-Z]{3}$/,
      'numeric': /^\d{3}$/,
    };
    const pattern = patterns[format];
    const result = this.pattern(
      pattern,
      errorMessage ||
        `String must be an ISO 3166 ${format} country code`,
    );
    result._metaData ??= {};
    result._metaData.format = `iso3166-${format}`;
    delete result._metaData.pattern;
    return result;
  }

  /**
   * Validates an ISO 4217 currency code (three uppercase letters,
   * e.g. `USD`, `EUR`, `JPY`). Format check only — chain `.isIn([...])`
   * for membership against your supported list.
   */
  currencyCode(errorMessage?: string): this {
    const result = this.pattern(
      /^[A-Z]{3}$/,
      errorMessage || 'String must be an ISO 4217 currency code',
    );
    result._metaData ??= {};
    result._metaData.format = 'iso4217';
    delete result._metaData.pattern;
    return result;
  }

  /**
   * Validates that the string matches the given postal-code `pattern`.
   * Pluggable by design: postal-code formats vary widely and we don't
   * ship a country table — callers provide the regex for the
   * jurisdictions they care about.
   *
   * Sets `format: 'postal-code'` on the schema metadata so codegen
   * tools can recognise the field intent even though the exact
   * pattern is caller-defined.
   *
   * @example
   * ```ts
   * const usZip = Guardian.string().postalCode(/^\d{5}(-\d{4})?$/);
   * usZip.parse('94103');       // ok
   * usZip.parse('94103-1234');  // ok
   *
   * const ukPostcode = Guardian.string().postalCode(
   *   /^[A-Z]{1,2}\d{1,2}[A-Z]? \d[A-Z]{2}$/,
   * );
   * ukPostcode.parse('SW1A 1AA');
   * ```
   */
  postalCode(pattern: RegExp, errorMessage?: string): this {
    const result = this.pattern(
      pattern,
      errorMessage || 'String must be a valid postal code',
    );
    result._metaData ??= {};
    result._metaData.format = 'postal-code';
    delete result._metaData.pattern;
    return result;
  }

  /**
   * Validates the string contains at least one emoji.
   *
   * - `opts.onlyEmoji: true` — string must be **only** emoji characters
   *   (whitespace allowed between them when `allowSpaces` is true).
   * - `opts.allowSpaces: true` — permits whitespace alongside emoji
   *   when paired with `onlyEmoji`. Default `false`.
   *
   * Uses the Unicode `\p{Extended_Pictographic}` property — runtime
   * support requires the regex `u` flag, which is universally available
   * in modern targets. `\p{Emoji}` is deliberately **not** used: it
   * also matches ASCII digits `0-9`, `#`, and `*` (they carry the
   * `Emoji` property as keycap bases), so `'123'` would pass.
   *
   * @example
   * ```ts
   * Guardian.string().emoji().parse('hi 👋');         // ok (contains emoji)
   * Guardian.string().emoji({ onlyEmoji: true }).parse('👋✨'); // ok
   * Guardian.string().emoji({ onlyEmoji: true }).parse('hi 👋'); // throws
   * Guardian.string().emoji().parse('123');            // throws
   * ```
   */
  emoji(
    opts?: { onlyEmoji?: boolean; allowSpaces?: boolean },
    errorMessage?: string,
  ): this {
    const onlyEmoji = opts?.onlyEmoji === true;
    const allowSpaces = opts?.allowSpaces === true;
    const result = this.process((value: string) => {
      // `\p{Extended_Pictographic}` matches pictographic emoji code
      // points without the false positives `\p{Emoji}` has on ASCII
      // digits / `#` / `*`. Combined with `u` flag for unicode-aware
      // matching.
      const hasEmoji = /\p{Extended_Pictographic}/u.test(value);
      if (!hasEmoji) {
        throw new GuardianError(
          errorMessage || 'String must contain at least one emoji',
          {
            expected: 'emoji',
            got: value,
            comparison: 'emoji',
            type: 'string',
          },
        );
      }
      if (onlyEmoji) {
        // After stripping emoji (and optionally whitespace), nothing
        // should remain.
        const stripped = allowSpaces
          ? value.replace(/\p{Extended_Pictographic}/gu, '').replace(
            /\s+/g,
            '',
          )
          : value.replace(/\p{Extended_Pictographic}/gu, '');
        if (stripped.length > 0) {
          throw new GuardianError(
            errorMessage || 'String must contain only emoji',
            {
              expected: 'emoji only',
              got: value,
              comparison: 'emoji',
              type: 'string',
            },
          );
        }
      }
      return value;
    }) as this;
    result._metaData ??= {};
    result._metaData.format = 'emoji';
    return result;
  }

  /**
   * Transform: encode the string via `encodeURIComponent`. Useful at
   * the boundary where you take a validated string and need a URL-
   * safe form. Pairs with {@link decodeUri}.
   *
   * @example
   * ```ts
   * Guardian.string().encodeUri().parse('hello world & friends');
   * // → 'hello%20world%20%26%20friends'
   * ```
   */
  encodeUri(): this {
    return this.process((value: string) => encodeURIComponent(value)) as this;
  }

  /**
   * Transform: decode the string via `decodeURIComponent`. Throws a
   * `GuardianError` if the input contains malformed escapes (instead
   * of letting `URIError` bubble untyped).
   *
   * @example
   * ```ts
   * Guardian.string().decodeUri().parse('hello%20world');
   * // → 'hello world'
   * ```
   */
  decodeUri(errorMessage?: string): this {
    return this.process((value: string) => {
      try {
        return decodeURIComponent(value);
      } catch (err) {
        throw new GuardianError(
          errorMessage ||
            `Cannot decode URI component: ${
              err instanceof Error ? err.message : String(err)
            }`,
          {
            expected: 'valid URI-encoded string',
            got: value,
            comparison: 'decodeUri',
            type: 'string',
          },
        );
      }
    }) as this;
  }

  /**
   * Validates a [BCP 47](https://datatracker.ietf.org/doc/html/rfc5646)
   * language tag (ISO 639-1/2 with optional script, region, and variant
   * subtags). Covers common forms:
   *
   * - `en`             — language only
   * - `en-US`          — language + region (alpha-2)
   * - `zh-Hans`        — language + script
   * - `zh-Hans-CN`     — language + script + region
   * - `de-DE-1996`     — language + region + variant
   * - `es-419`         — language + numeric region (e.g. Latin America)
   *
   * Format check only — chain `.isIn([...])` if you need membership
   * against a curated allow-list.
   */
  languageCode(errorMessage?: string): this {
    const result = this.pattern(
      StringGuardian.patterns.languageCode,
      errorMessage || 'String must be a BCP 47 language tag',
    );
    result._metaData ??= {};
    result._metaData.format = 'bcp47';
    delete result._metaData.pattern;
    return result;
  }

  /**
   * Validates a latitude/longitude pair encoded as a string
   * (`"lat,lng"`). The default separator is a comma; pass another
   * via `opts.separator` if your wire format uses something else
   * (e.g. `';'`, `'|'`). Whitespace around the separator is
   * tolerated.
   *
   * - Latitude must be in `-90..90`.
   * - Longitude must be in `-180..180`.
   *
   * Returns the canonical `"lat,lng"` form (whitespace stripped,
   * caller-supplied separator preserved). Use
   * `Number.latitude()` / `Number.longitude()` if you have already
   * parsed the components.
   *
   * @example
   * ```ts
   * Guardian.string().latLngString().parse('40.7128,-74.0060');
   * // → '40.7128,-74.0060'
   * Guardian.string().latLngString({ separator: '|' }).parse('40.7 | -74.0');
   * // → '40.7|-74.0'
   * ```
   */
  latLngString(
    opts?: { separator?: string },
    errorMessage?: string,
  ): this {
    const separator = opts?.separator ?? ',';
    const result = this.process((value: string) => {
      const parts = value.split(separator).map((p) => p.trim());
      if (parts.length !== 2 || parts[0] === '' || parts[1] === '') {
        throw new GuardianError(
          errorMessage ||
            `String must be a 'lat${separator}lng' pair`,
          {
            expected: `lat${separator}lng`,
            got: value,
            comparison: 'latLngString',
            type: 'string',
          },
        );
      }
      const lat = Number(parts[0]);
      const lng = Number(parts[1]);
      if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
        throw new GuardianError(
          errorMessage ||
            `Latitude must be a number in -90..90 (got '${parts[0]}')`,
          {
            expected: '-90..90',
            got: parts[0],
            comparison: 'latitude',
            type: 'string',
          },
        );
      }
      if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
        throw new GuardianError(
          errorMessage ||
            `Longitude must be a number in -180..180 (got '${parts[1]}')`,
          {
            expected: '-180..180',
            got: parts[1],
            comparison: 'longitude',
            type: 'string',
          },
        );
      }
      return `${parts[0]}${separator}${parts[1]}`;
    }) as this;
    result._metaData ??= {};
    result._metaData.format = 'latlng';
    return result;
  }

  /**
   * Validates a base58 string — the Bitcoin / IPFS alphabet (`1-9`,
   * `A-H`, `J-N`, `P-Z`, `a-k`, `m-z`). Omits the visually-ambiguous
   * `0`, `O`, `I`, `l`. No length / checksum check; downstream code
   * is responsible for those (e.g. Base58Check for Bitcoin addresses).
   *
   * @example
   * ```ts
   * Guardian.string().base58().parse('17Aqf7XknZRsCmWy7q9bqrtMRmTcZAhRy');
   * ```
   */
  base58(errorMessage?: string): this {
    const result = this.pattern(
      StringGuardian.patterns.base58,
      errorMessage || 'String must be valid base58',
    );
    result._metaData ??= {};
    result._metaData.format = 'base58';
    delete result._metaData.pattern;
    return result;
  }

  /**
   * Validates a base32 string per RFC 4648 standard alphabet
   * (`A-Z`, `2-7`), with optional `=` padding. Useful for OTP
   * secrets (TOTP `otpauth://` URIs), DNS-safe identifiers, and
   * other case-insensitive token formats.
   *
   * Validates the alphabet only — doesn't enforce that the length
   * is a valid base32 block boundary (which differs across
   * unpadded variants). If you need ULID-style Crockford base32,
   * use `.ulid()` instead.
   *
   * @example
   * ```ts
   * Guardian.string().base32().parse('JBSWY3DPEHPK3PXP'); // 'Hello!\xde\xad\xbe\xef'
   * ```
   */
  base32(errorMessage?: string): this {
    const result = this.pattern(
      StringGuardian.patterns.base32,
      errorMessage || 'String must be valid base32 (RFC 4648)',
    );
    result._metaData ??= {};
    result._metaData.format = 'base32';
    delete result._metaData.pattern;
    return result;
  }

  /**
   * Validates a [ULID](https://github.com/ulid/spec) — 26-character
   * Crockford base32 (excludes `I`, `L`, `O`, `U`). Case-insensitive.
   */
  ulid(errorMessage?: string): this {
    const result = this.pattern(
      StringGuardian.patterns.ulid,
      errorMessage || 'String must be a valid ULID',
    );
    result._metaData ??= {};
    result._metaData.format = 'ulid';
    delete result._metaData.pattern;
    return result;
  }

  /**
   * Validates a [cuid v1](https://github.com/paralleldrive/cuid)
   * identifier (25 chars, starts with `c`, `[a-z0-9]` body).
   */
  cuid(errorMessage?: string): this {
    const result = this.pattern(
      StringGuardian.patterns.cuid,
      errorMessage || 'String must be a valid cuid',
    );
    result._metaData ??= {};
    result._metaData.format = 'cuid';
    delete result._metaData.pattern;
    return result;
  }

  /**
   * Validates a [cuid v2](https://github.com/paralleldrive/cuid2)
   * identifier (default length 24, configurable). Starts with a
   * letter; body is `[a-z0-9]`.
   *
   * @param opts.length - Exact length to require. Defaults to ≥ 24
   *   (the cuid2 default).
   */
  cuid2(opts?: { length?: number }, errorMessage?: string): this {
    const exactLength = opts?.length;
    const result = this.process((value: string) => {
      if (!StringGuardian.patterns.cuid2.test(value)) {
        throw new GuardianError(
          errorMessage || 'String must be a valid cuid2',
          {
            expected: 'cuid2',
            got: value,
            comparison: 'cuid2',
            type: 'string',
          },
        );
      }
      if (exactLength !== undefined && value.length !== exactLength) {
        throw new GuardianError(
          errorMessage ||
            `cuid2 must be exactly ${exactLength} characters (got ${value.length})`,
          {
            expected: exactLength,
            got: value.length,
            comparison: 'length',
            type: 'string',
          },
        );
      }
      return value;
    }) as this;
    result._metaData ??= {};
    result._metaData.format = 'cuid2';
    return result;
  }

  /**
   * Validates the string is well-formed JSON (parses without throwing).
   * The input passes through unchanged — use `.process(JSON.parse)`
   * downstream if you also want the parsed value.
   *
   * @example
   * ```ts
   * Guardian.string().json().parse('{"a":1}');     // '{"a":1}'
   * Guardian.string().json().parse('not json');     // throws
   * ```
   */
  json(errorMessage?: string): this {
    const result = this.process((value: string) => {
      try {
        JSON.parse(value);
      } catch {
        throw new GuardianError(
          errorMessage || 'String must be valid JSON',
          {
            expected: 'JSON',
            got: value,
            comparison: 'json',
            type: 'string',
          },
        );
      }
      return value;
    }) as this;
    result._metaData ??= {};
    result._metaData.format = 'json';
    return result;
  }

  /**
   * Bundled password-strength policy. Each rule is independent and
   * applied in order; the **first failing rule throws** so callers
   * get a clear single-cause error rather than a wall of complaints.
   *
   * @param rules.minLength            — minimum total length (default 8)
   * @param rules.maxLength            — maximum total length (no default)
   * @param rules.requireUpper         — at least one A-Z (default true)
   * @param rules.requireLower         — at least one a-z (default true)
   * @param rules.requireDigit         — at least one 0-9 (default true)
   * @param rules.requireSymbol        — at least one non-alphanumeric char
   * @param rules.maxConsecutive       — reject N+ identical consecutive chars
   * @param rules.forbidCommonPasswords — reject a small built-in list
   *   ("password", "12345678", "qwerty", "letmein", "admin", "iloveyou")
   *
   * @example
   * ```ts
   * const PolicyA = Guardian.string().password({
   *   minLength: 12,
   *   requireSymbol: true,
   *   forbidCommonPasswords: true,
   * });
   * ```
   */
  password(
    rules?: {
      minLength?: number;
      maxLength?: number;
      requireUpper?: boolean;
      requireLower?: boolean;
      requireDigit?: boolean;
      requireSymbol?: boolean;
      maxConsecutive?: number;
      forbidCommonPasswords?: boolean;
    },
    errorMessage?: string,
  ): this {
    const cfg = {
      minLength: 8,
      requireUpper: true,
      requireLower: true,
      requireDigit: true,
      requireSymbol: false,
      forbidCommonPasswords: false,
      ...rules,
    };
    const result = this.process((value: string) => {
      const fail = (msg: string) => {
        throw new GuardianError(errorMessage || msg, {
          expected: 'password policy',
          got: value,
          comparison: 'password',
          type: 'string',
        });
      };
      if (value.length < cfg.minLength) {
        fail(`Password must be at least ${cfg.minLength} characters`);
      }
      if (cfg.maxLength !== undefined && value.length > cfg.maxLength) {
        fail(`Password must be at most ${cfg.maxLength} characters`);
      }
      if (cfg.requireUpper && !/[A-Z]/.test(value)) {
        fail('Password must contain an uppercase letter');
      }
      if (cfg.requireLower && !/[a-z]/.test(value)) {
        fail('Password must contain a lowercase letter');
      }
      if (cfg.requireDigit && !/\d/.test(value)) {
        fail('Password must contain a digit');
      }
      if (cfg.requireSymbol && !/[^A-Za-z0-9]/.test(value)) {
        fail('Password must contain a symbol');
      }
      if (cfg.maxConsecutive !== undefined && cfg.maxConsecutive > 0) {
        const max = cfg.maxConsecutive;
        const pattern = new RegExp(String.raw`(.)\1{${max},}`);
        if (pattern.test(value)) {
          fail(`Password must not repeat the same character ${max + 1}+ times`);
        }
      }
      if (cfg.forbidCommonPasswords) {
        const common = new Set([
          'password',
          '12345678',
          'qwerty',
          'letmein',
          'admin',
          'iloveyou',
        ]);
        if (common.has(value.toLowerCase())) {
          fail('Password is too common');
        }
      }
      return value;
    }) as this;
    result._metaData ??= {};
    result._metaData.format = 'password';
    return result;
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
  toUpperCase(_description?: string): this {
    const transformedGuardian = this.process((value: string) => {
      return value.toUpperCase();
    });

    return transformedGuardian as this;
  }

  /**
   * Transforms string to lowercase.
   *
   * @returns New StringGuardian that transforms to lowercase
   */
  toLowerCase(_description?: string): this {
    const transformedGuardian = this.process((value: string) => {
      return value.toLowerCase();
    });

    return transformedGuardian as this;
  }

  /**
   * Trims whitespace from both ends of the string.
   *
   * @returns New StringGuardian that trims whitespace
   */
  trim(_description?: string): this {
    return this.process((value: string) => {
      return value.trim();
    }) as this;
  }

  /**
   * Removes all whitespace characters from the string.
   *
   * @returns New StringGuardian that removes all spaces
   *
   * @example
   * ```ts
   * const schema = new StringGuardian().stripSpaces();
   * schema.parse('hello world'); // 'helloworld'
   * ```
   */
  stripSpaces(): this {
    return this.process((value: string) => {
      return value.replaceAll(/\s+/g, '');
    }) as this;
  }

  /**
   * Replaces occurrences of a string or pattern with another string.
   *
   * @param searchValue - The string or regular expression to search for
   * @param replaceValue - The string to replace matches with
   * @returns New StringGuardian with replacements applied
   *
   * @example
   * ```ts
   * const schema = new StringGuardian().replace('world', 'universe');
   * schema.parse('hello world'); // 'hello universe'
   * ```
   */
  replace(searchValue: string | RegExp, replaceValue: string): this {
    return this.process((value: string) => {
      return value.replace(searchValue, replaceValue);
    }) as this;
  }

  /**
   * Adds a prefix to the beginning of the string.
   *
   * @param prefix - The string to add at the beginning
   * @returns New StringGuardian with the prefix added
   *
   * @example
   * ```ts
   * const schema = new StringGuardian().prefix('Hello ');
   * schema.parse('world'); // 'Hello world'
   * ```
   */
  prefix(prefix: string): this {
    return this.process((value: string) => {
      return `${prefix}${value}`;
    }) as this;
  }

  /**
   * Adds a suffix to the end of the string.
   *
   * @param suffix - The string to add at the end
   * @returns New StringGuardian with the suffix added
   *
   * @example
   * ```ts
   * const schema = new StringGuardian().suffix(' world');
   * schema.parse('Hello'); // 'Hello world'
   * ```
   */
  suffix(suffix: string): this {
    return this.process((value: string) => {
      return `${value}${suffix}`;
    }) as this;
  }

  /**
   * Capitalizes the first letter of each word in the string.
   *
   * @returns A new StringGuardian with the validation applied (the receiver is never mutated)
   */
  capitalize(): this {
    return this.process(
      (value: string) =>
        value.replaceAll(/\b\w/g, (char) => char.toUpperCase()),
    ) as this;
  }

  /**
   * Converts string to camelCase.
   *
   * @returns A new StringGuardian with the validation applied (the receiver is never mutated)
   */
  camelCase(): this {
    return this.process(
      (value: string) =>
        value
          .toLowerCase()
          .replaceAll(/[^a-zA-Z0-9]+([a-zA-Z0-9])/g, (_, char) =>
            char.toUpperCase()),
    ) as this;
  }

  /**
   * Converts string to snake_case.
   *
   * @returns A new StringGuardian with the validation applied (the receiver is never mutated)
   */
  snakeCase(): this {
    return this.process(
      (value: string) =>
        value
          .replaceAll(/([A-Z])/g, '_$1')
          .toLowerCase()
          .replace(/^_/, '')
          .replaceAll(/[^a-zA-Z0-9]+/g, '_')
          .replaceAll(/_+/g, '_')
          .replaceAll(/(?:^_|_$)/g, ''),
    ) as this;
  }

  /**
   * Converts string to kebab-case.
   *
   * @returns A new StringGuardian with the validation applied (the receiver is never mutated)
   */
  kebabCase(): this {
    return this.process(
      (value: string) =>
        value
          .replaceAll(/([A-Z])/g, '-$1')
          .toLowerCase()
          .replace(/^-/, '')
          .replaceAll(/[^a-zA-Z0-9]+/g, '-')
          .replaceAll(/-+/g, '-')
          .replaceAll(/(?:^-|-$)/g, ''),
    ) as this;
  }

  /**
   * Converts string to PascalCase.
   *
   * @returns A new StringGuardian with the validation applied (the receiver is never mutated)
   */
  pascalCase(): this {
    return this.process(
      (value: string) =>
        value
          .toLowerCase()
          .replaceAll(/(?:^|[^a-zA-Z0-9])([a-zA-Z0-9])/g, (_, char) =>
            char.toUpperCase()),
    ) as this;
  }

  /**
   * Reverses the string.
   *
   * @returns A new StringGuardian with the validation applied (the receiver is never mutated)
   */
  reverse(): this {
    return this.process(
      (value: string) => value.split('').reverse().join(''),
    ) as this;
  }

  /**
   * Pads the start of the string with specified character.
   *
   * @param length - Target string length
   * @param char - Character to pad with (defaults to space)
   * @returns A new StringGuardian with the validation applied (the receiver is never mutated)
   */
  padStart(length: number, char = ' '): this {
    return this.process(
      (value: string) => value.padStart(length, char),
    ) as this;
  }

  /**
   * Pads the end of the string with specified character.
   *
   * @param length - Target string length
   * @param char - Character to pad with (defaults to space)
   * @returns A new StringGuardian with the validation applied (the receiver is never mutated)
   */
  padEnd(length: number, char = ' '): this {
    return this.process(
      (value: string) => value.padEnd(length, char),
    ) as this;
  }

  /**
   * Sanitizes the string by removing/escaping dangerous characters.
   *
   * @returns A new StringGuardian with the validation applied (the receiver is never mutated)
   */
  sanitize(): this {
    return this.process(
      (value: string) =>
        value
          // Remove script tags and their content
          .replaceAll(/<script[^>]*>.*?<\/script>/gi, '')
          // Remove iframe tags and their content
          .replaceAll(/<iframe[^>]*>.*?<\/iframe>/gi, '')
          // Remove event handlers
          .replaceAll(/on\w+\s*=\s*["'][^"']*["']/gi, '')
          // Remove javascript: protocol
          .replaceAll(/javascript:/gi, '')
          // Escape HTML entities
          .replaceAll('&', '&amp;')
          .replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;')
          .replaceAll('"', '&quot;')
          .replaceAll("'", '&#x27;'),
    ) as this;
  }

  /**
   * Normalizes whitespace by collapsing multiple spaces to single spaces.
   *
   * @returns A new StringGuardian with the validation applied (the receiver is never mutated)
   */
  normalizeSpace(): this {
    return this.process(
      (value: string) => value.replaceAll(/\s+/g, ' ').trim(),
    ) as this;
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
    return this.process(
      (value: string) => {
        const num = Number(value);
        if (Number.isNaN(num)) {
          throw new GuardianError(
            errorMessage || 'Cannot convert string to number',
            {
              expected: 'numeric string',
              got: value,
              comparison: 'conversion',
              type: 'number',
            },
          );
        }
        return num;
      },
      resolveGuardian('number'),
    ) as NumberGuardian;
  }

  /**
   * Transforms string to a number (integer).
   *
   * @param radix - The radix for parsing (default: 10)
   * @param errorMessage - Optional custom error message
   * @returns New NumberGuardian with integer transformation
   */
  toInt(radix = 10, errorMessage?: string): NumberGuardian {
    return this.process((value: string) => {
      // `parseInt` is lenient — `parseInt('12abc')` returns `12`. Reject
      // any string whose trimmed form isn't a complete integer literal
      // in the requested radix before parsing, so trailing garbage fails.
      const trimmed = value.trim();
      const body = trimmed.replace(/^[+-]/, '');
      const isValid = body.length > 0 &&
        [...body.toLowerCase()].every((ch) => {
          const digit = Number.parseInt(ch, radix);
          return Number.isInteger(digit) && digit < radix;
        });
      const num = isValid ? Number.parseInt(trimmed, radix) : Number.NaN;
      if (!isValid || Number.isNaN(num)) {
        throw new GuardianError(
          errorMessage || 'Cannot convert string to integer',
          {
            expected: 'integer string',
            got: value,
            comparison: 'conversion',
            type: 'integer',
          },
        );
      }
      return num;
    }, resolveGuardian('number')) as NumberGuardian;
  }

  /**
   * Transforms string to a Date object.
   *
   * @param errorMessage - Optional custom error message
   * @returns New DateGuardian with date transformation
   */
  toDate(errorMessage?: string): DateGuardian {
    return this.process((value: string) => {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
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
    }, resolveGuardian('date')) as DateGuardian;
  }

  /**
   * Parses the string as a `bigint`. With `{ hex: true }`, parses as
   * hex (accepts an optional `0x` prefix); otherwise decimal.
   *
   * Pairs with the existing `BigIntGuardian.toHex()` transform —
   * complete the round-trip.
   *
   * @example
   * ```ts
   * Guardian.string().toBigInt().parse('12345');                 // 12345n
   * Guardian.string().toBigInt({ hex: true }).parse('0xdeadbeef'); // 3735928559n
   * ```
   */
  toBigInt(
    opts?: { hex?: boolean },
    errorMessage?: string,
  ): BigIntGuardian {
    const asHex = opts?.hex === true;
    return this.process((value: string) => {
      try {
        if (asHex) {
          const trimmed = value.trim();
          const body = trimmed.startsWith('0x') || trimmed.startsWith('0X')
            ? trimmed
            : `0x${trimmed}`;
          return BigInt(body);
        }
        return BigInt(value.trim());
      } catch {
        throw new GuardianError(
          errorMessage ||
            `Cannot convert string to bigint${asHex ? ' (hex)' : ''}`,
          {
            expected: asHex ? 'hex bigint' : 'decimal bigint',
            got: value,
            comparison: 'conversion',
            type: 'bigint',
          },
        );
      }
    }, resolveGuardian('bigint')) as BigIntGuardian;
  }

  //#endregion
}

// Publish the constructor for siblings' transition methods
// (`number().toString()`, `date().toISOString()`, …). Runs as part of
// this module's evaluation, so the entry is in place before any
// guardian instance exists.
registerGuardian('string', StringGuardian);

/**
 * ISBN-10 checksum: digits multiplied by 10..1, sum mod 11 must be 0.
 * Last digit may be `X` (= 10). Input is the cleaned 10-character form.
 *
 * @internal
 */
function checkIsbn10(s: string): boolean {
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += Number.parseInt(s[i]!, 10) * (10 - i);
  }
  const last = s[9]!;
  sum += last === 'X' || last === 'x' ? 10 : Number.parseInt(last, 10);
  return sum % 11 === 0;
}

/**
 * ISBN-13 checksum: digits alternately multiplied by 1 and 3,
 * sum mod 10 must be 0. Input is the cleaned 13-character form.
 *
 * @internal
 */
function checkIsbn13(s: string): boolean {
  let sum = 0;
  for (let i = 0; i < 13; i++) {
    sum += Number.parseInt(s[i]!, 10) * (i % 2 === 0 ? 1 : 3);
  }
  return sum % 10 === 0;
}
