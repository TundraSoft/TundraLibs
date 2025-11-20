import { BaseGuardian } from "../BaseGuardian.ts";
import { GuardianError } from "../GuardianError.ts";
import type { GuardianMetaData, GuardianTransform } from "../types/mod.ts";
import { NumberGuardian } from "./NumberGuardian.ts";
import { DateGuardian } from "./DateGuardian.ts";

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
  protected override readonly _type = "string";

  /**
   * Creates a new StringGuardian instance.
   *
   * @param metaData - Optional metadata for this guardian
   * @param initialTransform - Optional composed transformation from previous guardian
   */
  constructor(metaData?: GuardianMetaData, initialTransform?: GuardianTransform<unknown, string>) {
    const defaultStringValidation = (input: unknown) => {
      if (typeof input !== "string") {
        throw new GuardianError("Expected string but got ${got}", {
          expected: "string",
          got: typeof input,
          comparison: "type",
          type: "string",
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
        throw new GuardianError(errorMessage || `String must be at least ${length} characters long`, {
          expected: length,
          got: str.length,
          comparison: "minLength",
          type: "string",
        });
      }
      return str;
    }) as StringGuardian;
    
    // Store constraint for OpenAPI generation
    result._constraints.minLength = length;
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
        throw new GuardianError(errorMessage || `String must be at most ${length} characters long`, {
          expected: length,
          got: str.length,
          comparison: "maxLength",
          type: "string",
        });
      }
      return str;
    }) as StringGuardian;
    
    // Store constraint for OpenAPI generation
    result._constraints.maxLength = length;
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
              comparison: "length",
              type: "validation",
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
              comparison: "pattern",
              type: "validation",
            },
          );
        }
        return value;
      },
    ) as StringGuardian;
    
    // Store pattern for OpenAPI generation
    result._constraints.pattern = pattern.source;
    return result;
  }

  /**
   * Validates that string is not empty (after trimming whitespace).
   *
   * @param errorMessage - Optional custom error message
   * @returns This StringGuardian (mutated) or new instance if immutable
   */
  nonEmpty(errorMessage?: string): StringGuardian {
    return this.process(
      (value: string) => {
        if (value.trim().length === 0) {
          throw new GuardianError(
            errorMessage || "String cannot be empty",
            {
              expected: "non-empty string",
              got: value,
              comparison: "nonEmpty",
              type: "validation",
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
      errorMessage || "Invalid email address format",
    );
    
    // Override pattern constraint with format for OpenAPI
    result._constraints.format = "email";
    delete result._constraints.pattern; // Remove the regex pattern
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
        throw new GuardianError(errorMessage || "Expected valid URL", {
          expected: "URL format",
          got: str,
          comparison: "format",
          type: "string",
        });
      }
    }) as StringGuardian;
    
    // Store format for OpenAPI generation
    result._constraints.format = "uri";
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
        if (isNaN(num)) {
          throw new GuardianError(
            errorMessage || "Cannot convert string to number",
            {
              expected: "numeric string",
              got: value,
              comparison: "conversion",
              type: "number",
            },
          );
        }
        return num;
      }, NumberGuardian) as NumberGuardian;
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
      const num = parseInt(value, radix);
      if (isNaN(num)) {
        throw new GuardianError(
          errorMessage || "Cannot convert string to integer",
          {
            expected: "integer string",
            got: value,
            comparison: "conversion",
            type: "integer",
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
      if (isNaN(date.getTime())) {
        throw new GuardianError(
          errorMessage || "Cannot convert string to date",
          {
            expected: "valid date string",
            got: value,
            comparison: "conversion",
            type: "date",
          },
        );
      }
      return date;
    }, DateGuardian) as DateGuardian;
  }

  //#endregion

  //#region Documentation Methods

  /**
   * @override
   */
  protected override _enrichOpenAPISchema(schema: Record<string, unknown>, funcStr: string): void {
    super._enrichOpenAPISchema(schema, funcStr);
    // String-specific constraints are now stored directly in _constraints
    // No additional processing needed here
  }

  /**
   * Infers string-specific format from function analysis.
   * @private
   */
  private _inferStringFormat(funcStr: string): string | undefined {
    // Check for specific string validation methods
    if (funcStr.includes('.email(')) return 'email';
    if (funcStr.includes('.uuid(')) return 'uuid';
    if (funcStr.includes('.url(')) return 'uri';
    if (funcStr.includes('.ipv4(')) return 'ipv4';
    if (funcStr.includes('.ipv6(')) return 'ipv6';
    return this._inferFormat(funcStr);
  }

  //#endregion
}
