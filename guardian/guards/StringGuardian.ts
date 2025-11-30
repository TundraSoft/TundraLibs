import { BaseGuardian } from '../BaseGuardian.ts';
import { GuardianError } from '../GuardianError.ts';
import type { GuardianMetaData, GuardianTransform } from '../types/mod.ts';
import { NumberGuardian } from './NumberGuardian.ts';
import { DateGuardian } from './DateGuardian.ts';

/**
 * Guardian for string validation and transformation.
 * Provides fluent API for building string validation pipelines.
 *
 * @example
 * ```ts
 * const schema = new StringGuardian()
 *   .minLength(3)
 *   .maxLength(10)
 *   .pattern(/^[a-zA-Z]+$/, 'Only letters allowed');
 *
 * const result = schema.parse('hello'); // 'hello'
 * ```
 *
 * @since 1.0.0
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
    numeric: /^[0-9.]+$/,
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
  };

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
    const defaultStringValidation = (input: unknown) => {
      if (typeof input !== 'string') {
        throw new GuardianError(`Expected string but got ${typeof input}`, {
          expected: 'string',
          got: typeof input,
          comparison: 'type',
          type: 'string',
        });
      }
      return input;
    };

    let finalTransform: GuardianTransform<unknown, string>;
    if (initialTransform) {
      // Chain the provided transform with default validation
      finalTransform = (input: unknown) => {
        const transformedValue = initialTransform(input);
        return defaultStringValidation(transformedValue);
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
   * @returns This StringGuardian (mutated) or new instance if immutable
   *
   * @example
   * ```ts
   * const schema = new StringGuardian().minLength(3);
   * schema.parse('hi'); // throws GuardianError
   * schema.parse('hello'); // 'hello'
   * ```
   */
  minLength(length: number, errorMessage?: string): StringGuardian {
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
    }) as StringGuardian;

    // Store constraint for OpenAPI generation
    if (!result._metaData) result._metaData = {};
    result._metaData.minLength = length;
    return result;
  }

  /**
   * Validates maximum string length.
   *
   * @param length - Maximum allowed length
   * @param errorMessage - Optional custom error message
   * @returns This StringGuardian (mutated) or new instance if immutable
   *
   * @example
   * ```ts
   * const schema = new StringGuardian().maxLength(10);
   * schema.parse('hello world!'); // throws GuardianError
   * schema.parse('hello'); // 'hello'
   * ```
   */
  maxLength(length: number, errorMessage?: string): StringGuardian {
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
    }) as StringGuardian;

    if (!result._metaData) result._metaData = {};
    result._metaData.maxLength = length;
    return result;
  }

  /**
   * Validates exact string length.
   *
   * @param length - Exact required length
   * @param errorMessage - Optional custom error message
   * @returns This StringGuardian (mutated) or new instance if immutable
   */
  length(length: number, errorMessage?: string): StringGuardian {
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
    ) as StringGuardian;
  }

  /**
   * Validates string against a regular expression.
   *
   * @param pattern - Regular expression pattern to match
   * @param errorMessage - Optional custom error message
   * @returns This StringGuardian (mutated) or new instance if immutable
   *
   * @example
   * ```ts
   * const schema = new StringGuardian().pattern(/^[a-zA-Z]+$/, 'Letters only');
   * schema.parse('hello123'); // throws GuardianError
   * schema.parse('hello'); // 'hello'
   * ```
   */
  pattern(pattern: RegExp, errorMessage?: string): StringGuardian {
    const result = this.process(
      (value: string) => {
        if (!pattern.test(value)) {
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
    ) as StringGuardian;

    // Store pattern for OpenAPI generation
    if (!result._metaData) result._metaData = {};
    result._metaData.pattern = pattern.source;
    return result;
  }

  /**
   * Validates that string is not empty (after trimming whitespace).
   *
   * @param errorMessage - Optional custom error message
   * @returns This StringGuardian (mutated) or new instance if immutable
   */
  notEmpty(errorMessage?: string): StringGuardian {
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
    ) as StringGuardian;
  }

  /**
   * Validates string is a valid email address.
   *
   * @param errorMessage - Optional custom error message
   * @returns This StringGuardian (mutated) or new instance if immutable mode
   */
  email(errorMessage?: string): StringGuardian {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    const result = this.pattern(
      emailRegex,
      errorMessage || 'Invalid email address format',
    );

    // Override pattern constraint with format for OpenAPI
    if (!result._metaData) result._metaData = {};
    result._metaData.format = 'email';
    // Pattern removed for format-specific validations
    delete result._metaData.pattern; // Remove the regex pattern
    return result;
  }

  /**
   * Validates string is a valid URL.
   *
   * @param errorMessage - Optional custom error message
   * @returns This StringGuardian (mutated) or new instance if immutable
   */
  url(errorMessage?: string): StringGuardian {
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
    }) as StringGuardian;

    // Store format for OpenAPI generation
    if (!result._metaData) result._metaData = {};
    result._metaData.format = 'uri';
    return result;
  }

  /**
   * Validates string contains only alphabetic characters (a-z, A-Z).
   *
   * @param errorMessage - Optional custom error message
   * @returns This StringGuardian (mutated) or new instance if immutable
   */
  alpha(errorMessage?: string): StringGuardian {
    const result = this.pattern(
      StringGuardian.patterns.alpha,
      errorMessage || 'String must contain only alphabetic characters',
    );

    // Override pattern constraint with format for OpenAPI
    if (!result._metaData) result._metaData = {};
    result._metaData.format = 'alpha';
    // Pattern removed for format-specific validations
    delete result._metaData.pattern;
    return result;
  }

  /**
   * Validates string contains only alphanumeric characters (a-z, A-Z, 0-9).
   *
   * @param errorMessage - Optional custom error message
   * @returns This StringGuardian (mutated) or new instance if immutable
   */
  alphanumeric(errorMessage?: string): StringGuardian {
    const result = this.pattern(
      StringGuardian.patterns.alphanumeric,
      errorMessage || 'String must contain only alphanumeric characters',
    );

    // Override pattern constraint with format for OpenAPI
    if (!result._metaData) result._metaData = {};
    result._metaData.format = 'alphanumeric';
    // Pattern removed for format-specific validations
    delete result._metaData.pattern;
    return result;
  }

  /**
   * Validates string is a valid UUID (any version).
   *
   * @param errorMessage - Optional custom error message
   * @returns This StringGuardian (mutated) or new instance if immutable
   */
  uuid(errorMessage?: string): StringGuardian {
    const result = this.pattern(
      StringGuardian.patterns.uuid,
      errorMessage || 'String must be a valid UUID',
    );

    // Override pattern constraint with format for OpenAPI
    if (!result._metaData) result._metaData = {};
    result._metaData.format = 'uuid';
    // Pattern removed for format-specific validations
    delete result._metaData.pattern;
    return result;
  }

  /**
   * Validates string is a valid UUID v1.
   *
   * @param errorMessage - Optional custom error message
   * @returns This StringGuardian (mutated) or new instance if immutable
   */
  uuidv1(errorMessage?: string): StringGuardian {
    const result = this.pattern(
      StringGuardian.patterns.uuidv1,
      errorMessage || 'String must be a valid UUIDv1',
    );

    // Override pattern constraint with format for OpenAPI
    if (!result._metaData) result._metaData = {};
    result._metaData.format = 'uuid';
    // Pattern removed for format-specific validations
    delete result._metaData.pattern;
    return result;
  }

  /**
   * Validates string is a valid UUID v4.
   *
   * @param errorMessage - Optional custom error message
   * @returns This StringGuardian (mutated) or new instance if immutable
   */
  uuidv4(errorMessage?: string): StringGuardian {
    const result = this.pattern(
      StringGuardian.patterns.uuidv4,
      errorMessage || 'String must be a valid UUID v4',
    );

    // Override pattern constraint with format for OpenAPI
    if (!result._metaData) result._metaData = {};
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
   * @returns This StringGuardian (mutated) or new instance if immutable
   */
  contains(substring: string, errorMessage?: string): StringGuardian {
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
    }) as StringGuardian;
  }

  /**
   * Validates string does not contain the specified substring.
   *
   * @param substring - The substring that must not be present
   * @param errorMessage - Optional custom error message
   * @returns This StringGuardian (mutated) or new instance if immutable
   */
  notContains(substring: string, errorMessage?: string): StringGuardian {
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
    }) as StringGuardian;
  }

  /**
   * Validates string starts with the specified prefix.
   *
   * @param prefix - The prefix the string must start with
   * @param errorMessage - Optional custom error message
   * @returns This StringGuardian (mutated) or new instance if immutable
   */
  startsWith(prefix: string, errorMessage?: string): StringGuardian {
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
    }) as StringGuardian;
  }

  /**
   * Validates string ends with the specified suffix.
   *
   * @param suffix - The suffix the string must end with
   * @param errorMessage - Optional custom error message
   * @returns This StringGuardian (mutated) or new instance if immutable
   */
  endsWith(suffix: string, errorMessage?: string): StringGuardian {
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
    }) as StringGuardian;
  }

  /**
   * Validates string does not start with the specified prefix.
   *
   * @param prefix - The prefix the string must not start with
   * @param errorMessage - Optional custom error message
   * @returns This StringGuardian (mutated) or new instance if immutable
   */
  notStartsWith(prefix: string, errorMessage?: string): StringGuardian {
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
    }) as StringGuardian;
  }

  /**
   * Validates string does not end with the specified suffix.
   *
   * @param suffix - The suffix the string must not end with
   * @param errorMessage - Optional custom error message
   * @returns This StringGuardian (mutated) or new instance if immutable
   */
  notEndsWith(suffix: string, errorMessage?: string): StringGuardian {
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
    }) as StringGuardian;
  }

  /**
   * Validates string as phone number using configurable pattern.
   *
   * @param pattern - Optional custom regex pattern (defaults to US phone format)
   * @param errorMessage - Optional custom error message
   * @returns This StringGuardian (mutated) or new instance if immutable
   */
  phone(
    pattern: RegExp = StringGuardian.patterns.phone,
    errorMessage?: string,
  ): StringGuardian {
    return this.process((value: string) => {
      if (!pattern.test(value)) {
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
    }) as StringGuardian;
  }

  /**
   * Validates string as IP address (IPv4 or IPv6).
   *
   * @param errorMessage - Optional custom error message
   * @returns This StringGuardian (mutated) or new instance if immutable
   */
  ipAddress(errorMessage?: string): StringGuardian {
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
    }) as StringGuardian;
  }

  /**
   * Validates string as IPv4 address.
   *
   * @param errorMessage - Optional custom error message
   * @returns This StringGuardian (mutated) or new instance if immutable
   */
  ipv4(errorMessage?: string): StringGuardian {
    return this.pattern(
      StringGuardian.patterns.ipv4,
      errorMessage || 'String must be a valid IPv4 address',
    );
  }

  /**
   * Validates string as IPv6 address.
   *
   * @param errorMessage - Optional custom error message
   * @returns This StringGuardian (mutated) or new instance if immutable
   */
  ipv6(errorMessage?: string): StringGuardian {
    return this.pattern(
      StringGuardian.patterns.ipv6,
      errorMessage || 'String must be a valid IPv6 address',
    );
  }

  /**
   * Validates string as internal/private IP address.
   *
   * @param errorMessage - Optional custom error message
   * @returns This StringGuardian (mutated) or new instance if immutable
   */
  internalIp(errorMessage?: string): StringGuardian {
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
        (parts[0] === 172 && parts[1]! >= 16 && parts[1]! <= 31) ||
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
    }) as StringGuardian;
  }

  /**
   * Validates string as MAC address.
   *
   * @param errorMessage - Optional custom error message
   * @returns This StringGuardian (mutated) or new instance if immutable
   */
  macAddress(errorMessage?: string): StringGuardian {
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
   * @returns This StringGuardian (mutated) or new instance if immutable
   */
  creditCard(
    type: 'visa' | 'mastercard' | 'amex' | 'any' = 'any',
    errorMessage?: string,
  ): StringGuardian {
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
        let digit = Number.parseInt(digits[i]!, 10);
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
    }) as StringGuardian;
  }

  /**
   * Validates string as URL-friendly slug.
   *
   * @param errorMessage - Optional custom error message
   * @returns This StringGuardian (mutated) or new instance if immutable
   */
  slug(errorMessage?: string): StringGuardian {
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
   * @returns This StringGuardian (mutated) or new instance if immutable
   */
  hexColor(errorMessage?: string): StringGuardian {
    return this.pattern(
      StringGuardian.patterns.hexColor,
      errorMessage || 'String must be a valid hex color code (#RGB or #RRGGBB)',
    );
  }

  /**
   * Validates string as domain name.
   *
   * @param errorMessage - Optional custom error message
   * @returns This StringGuardian (mutated) or new instance if immutable
   */
  domain(errorMessage?: string): StringGuardian {
    return this.pattern(
      StringGuardian.patterns.domain,
      errorMessage || 'String must be a valid domain name',
    );
  }

  /**
   * Validates that string contains no whitespace characters.
   *
   * @param errorMessage - Optional custom error message
   * @returns This StringGuardian (mutated) or new instance if immutable
   */
  noWhitespace(errorMessage?: string): StringGuardian {
    return this.pattern(
      StringGuardian.patterns.noWhitespace,
      errorMessage || 'String must not contain whitespace',
    );
  }

  /**
   * Validates that string contains only ASCII characters.
   *
   * @param errorMessage - Optional custom error message
   * @returns This StringGuardian (mutated) or new instance if immutable
   */
  ascii(errorMessage?: string): StringGuardian {
    return this.pattern(
      StringGuardian.patterns.ascii,
      errorMessage || 'String must contain only ASCII characters',
    );
  }

  /**
   * Validates that string does not contain common SQL injection patterns.
   *
   * @param errorMessage - Optional custom error message
   * @returns This StringGuardian (mutated) or new instance if immutable
   */
  noSqlInjection(errorMessage?: string): StringGuardian {
    return this.process((value: string) => {
      const sqlPatterns = [
        /('|(\x27)|(\x2D)|(-)|(%27)|(%2D))/i, // Single quotes and dashes
        /(union|select|insert|delete|update|drop|create|alter|exec|execute)/i, // SQL keywords
        /(or|and)\s+"?\d+"?=\s*"?\d+/i, // OR/AND injection patterns
        /"\s*(or|and)\s*"?\d+/i, // Quote-based OR/AND patterns
        /;\s*(drop|delete|truncate|update)/i, // Semicolon-based injections
      ];

      for (const pattern of sqlPatterns) {
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
    }) as StringGuardian;
  }

  /**
   * Validates that string does not contain common XSS patterns.
   *
   * @param errorMessage - Optional custom error message
   * @returns This StringGuardian (mutated) or new instance if immutable
   */
  noXss(errorMessage?: string): StringGuardian {
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
    }) as StringGuardian;
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
  toUpperCase(_description?: string): StringGuardian {
    const transformedGuardian = this.process((value: string) => {
      return value.toUpperCase();
    });

    return transformedGuardian as StringGuardian;
  }

  /**
   * Transforms string to lowercase.
   *
   * @returns New StringGuardian that transforms to lowercase
   */
  toLowerCase(_description?: string): StringGuardian {
    const transformedGuardian = this.process((value: string) => {
      return value.toLowerCase();
    });

    return transformedGuardian as StringGuardian;
  }

  /**
   * Trims whitespace from both ends of the string.
   *
   * @returns New StringGuardian that trims whitespace
   */
  trim(_description?: string): StringGuardian {
    return this.process((value: string) => {
      return value.trim();
    }) as StringGuardian;
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
  stripSpaces(): StringGuardian {
    return this.process((value: string) => {
      return value.replaceAll(/\s+/g, '');
    }) as StringGuardian;
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
  replace(searchValue: string | RegExp, replaceValue: string): StringGuardian {
    return this.process((value: string) => {
      return value.replace(searchValue, replaceValue);
    }) as StringGuardian;
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
  prefix(prefix: string): StringGuardian {
    return this.process((value: string) => {
      return `${prefix}${value}`;
    }) as StringGuardian;
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
  suffix(suffix: string): StringGuardian {
    return this.process((value: string) => {
      return `${value}${suffix}`;
    }) as StringGuardian;
  }

  /**
   * Capitalizes the first letter of each word in the string.
   *
   * @returns This StringGuardian (mutated) or new instance if immutable
   */
  capitalize(): StringGuardian {
    return this.process(
      (value: string) =>
        value.replaceAll(/\b\w/g, (char) => char.toUpperCase()),
    ) as StringGuardian;
  }

  /**
   * Converts string to camelCase.
   *
   * @returns This StringGuardian (mutated) or new instance if immutable
   */
  camelCase(): StringGuardian {
    return this.process(
      (value: string) =>
        value
          .toLowerCase()
          .replaceAll(/[^a-zA-Z0-9]+([a-zA-Z0-9])/g, (_, char) =>
            char.toUpperCase()),
    ) as StringGuardian;
  }

  /**
   * Converts string to snake_case.
   *
   * @returns This StringGuardian (mutated) or new instance if immutable
   */
  snakeCase(): StringGuardian {
    return this.process(
      (value: string) =>
        value
          .replaceAll(/([A-Z])/g, '_$1')
          .toLowerCase()
          .replace(/^_/, '')
          .replaceAll(/[^a-zA-Z0-9]+/g, '_')
          .replaceAll(/_+/g, '_')
          .replaceAll(/(?:^_|_$)/g, ''),
    ) as StringGuardian;
  }

  /**
   * Converts string to kebab-case.
   *
   * @returns This StringGuardian (mutated) or new instance if immutable
   */
  kebabCase(): StringGuardian {
    return this.process(
      (value: string) =>
        value
          .replaceAll(/([A-Z])/g, '-$1')
          .toLowerCase()
          .replace(/^-/, '')
          .replaceAll(/[^a-zA-Z0-9]+/g, '-')
          .replaceAll(/-+/g, '-')
          .replaceAll(/(?:^-|-$)/g, ''),
    ) as StringGuardian;
  }

  /**
   * Converts string to PascalCase.
   *
   * @returns This StringGuardian (mutated) or new instance if immutable
   */
  pascalCase(): StringGuardian {
    return this.process(
      (value: string) =>
        value
          .toLowerCase()
          .replaceAll(/(?:^|[^a-zA-Z0-9])([a-zA-Z0-9])/g, (_, char) =>
            char.toUpperCase()),
    ) as StringGuardian;
  }

  /**
   * Reverses the string.
   *
   * @returns This StringGuardian (mutated) or new instance if immutable
   */
  reverse(): StringGuardian {
    return this.process(
      (value: string) => value.split('').reverse().join(''),
    ) as StringGuardian;
  }

  /**
   * Pads the start of the string with specified character.
   *
   * @param length - Target string length
   * @param char - Character to pad with (defaults to space)
   * @returns This StringGuardian (mutated) or new instance if immutable
   */
  padStart(length: number, char = ' '): StringGuardian {
    return this.process(
      (value: string) => value.padStart(length, char),
    ) as StringGuardian;
  }

  /**
   * Pads the end of the string with specified character.
   *
   * @param length - Target string length
   * @param char - Character to pad with (defaults to space)
   * @returns This StringGuardian (mutated) or new instance if immutable
   */
  padEnd(length: number, char = ' '): StringGuardian {
    return this.process(
      (value: string) => value.padEnd(length, char),
    ) as StringGuardian;
  }

  /**
   * Sanitizes the string by removing/escaping dangerous characters.
   *
   * @returns This StringGuardian (mutated) or new instance if immutable
   */
  sanitize(): StringGuardian {
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
    ) as StringGuardian;
  }

  /**
   * Normalizes whitespace by collapsing multiple spaces to single spaces.
   *
   * @returns This StringGuardian (mutated) or new instance if immutable
   */
  normalizeSpace(): StringGuardian {
    return this.process(
      (value: string) => value.replaceAll(/\s+/g, ' ').trim(),
    ) as StringGuardian;
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
      NumberGuardian,
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
      const num = Number.parseInt(value, radix);
      if (Number.isNaN(num)) {
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
    }, NumberGuardian) as NumberGuardian;
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
    }, DateGuardian) as DateGuardian;
  }

  //#endregion
}
