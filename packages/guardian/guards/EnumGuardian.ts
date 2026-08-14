/**
 * @fileoverview `EnumGuardian` — strict set-membership validator
 * for a fixed list of literal values. Supports `.exclude(...)` to
 * deny-list values from a wider enum and `.caseInsensitive()` to
 * match string inputs ignoring case (returning the canonical form).
 *
 * @module
 */

import { BaseGuardian } from '../BaseGuardian.ts';
import { GuardianError } from '../errors/Base.ts';
import type { GuardianMetaData, GuardianTransform } from '../types/mod.ts';

/**
 * Guardian for enum validation.
 * Provides fluent API for validating values against a set of allowed values.
 *
 * @template T - The enum type
 *
 * @example
 * ```ts
 * enum Color { Red = 'red', Green = 'green', Blue = 'blue' }
 * const schema = new EnumGuardian(Object.values(Color));
 *
 * const result = schema.parse('red'); // 'red'
 * ```
 */
export class EnumGuardian<T> extends BaseGuardian<T> {
  /**
   * Emitted schema type. Enum is its own type at the runtime /
   * markdown level; the `toOpenAPI` override infers the JSON Schema
   * `type` from the allowed values rather than using this raw name.
   */
  protected override readonly _type = 'enum';
  private readonly __allowedValues: readonly T[];

  /**
   * Creates a new EnumGuardian instance.
   *
   * @param allowedValues - Array of allowed values
   * @param metaData - Optional metadata for this guardian
   *
   * @throws {Error} When `allowedValues` is empty.
   *
   * @see {@link caseInsensitive} for its own construction-time throws.
   */
  constructor(allowedValues: readonly T[], metaData?: GuardianMetaData) {
    if (!allowedValues || allowedValues.length === 0) {
      throw new Error('EnumGuardian requires at least one allowed value');
    }

    super((input: unknown) => {
      for (const value of allowedValues) {
        if (input === value) {
          return input as T;
        }
      }

      throw new GuardianError(
        `Value must be one of: ${allowedValues.join(', ')}`,
        {
          expected: allowedValues.join(', '),
          got: input,
          comparison: 'enum',
          type: 'enum',
        },
      );
    }, metaData);

    this.__allowedValues = allowedValues;
  }

  //#region Validation Methods

  /**
   * Gets the allowed values for this enum guardian.
   *
   * @returns Array of allowed values
   */
  get allowedValues(): readonly T[] {
    return this.__allowedValues;
  }

  /**
   * Makes the enum match case-insensitively. Only valid for string-
   * typed allowed values — throws at construction time otherwise,
   * because lowercasing a number / boolean / etc. is meaningless.
   *
   * On parse:
   *   1. The input is lowercased and compared against the lowercased
   *      allowed list.
   *   2. The **canonical** (original-cased) allowed value is returned
   *      on success, not the input. Downstream code can rely on the
   *      canonical form.
   *
   * Construction-time ambiguity check: if two allowed values
   * lowercase to the same string (e.g. `['Foo', 'foo']`), the method
   * throws — case-insensitive matching would be ambiguous.
   *
   * @returns A new EnumGuardian matching case-insensitively; the
   *   receiver is never mutated.
   * @throws {TypeError} If any allowed value is not a string.
   * @throws {Error} If the lowercased allowed list has duplicates.
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * const method = Guardian.enum(['GET', 'POST', 'PUT']).caseInsensitive();
   * method.parse('get');   // 'GET'   ← canonical case returned
   * method.parse('POST');  // 'POST'
   * method.parse('Patch'); // throws (not in allowed set)
   * ```
   */
  caseInsensitive(): this {
    // Build the lowercased lookup map once. Canonical-form values live
    // on the value side so we can return them on match.
    const lookup = new Map<string, T>();
    for (const v of this.__allowedValues) {
      if (typeof v !== 'string') {
        throw new TypeError(
          `EnumGuardian.caseInsensitive() requires all allowed values to be strings; got ${typeof v}`,
        );
      }
      const key = v.toLowerCase();
      if (lookup.has(key)) {
        throw new Error(
          `EnumGuardian.caseInsensitive(): ambiguous allowed values — '${
            lookup.get(key)
          }' and '${v}' both lowercase to '${key}'`,
        );
      }
      lookup.set(key, v);
    }
    const allowed = this.__allowedValues;
    const ciTransform: GuardianTransform<unknown, T> = (input: unknown) => {
      if (typeof input === 'string') {
        const hit = lookup.get(input.toLowerCase());
        if (hit !== undefined) return hit;
      } else {
        // Non-string input — fall back to strict identity (a number
        // or boolean somehow arriving at a string enum). Almost
        // certainly throws downstream; we keep the behaviour
        // symmetric so users get the standard "must be one of"
        // message rather than a special-case quirk.
        for (const v of allowed) {
          if (input === v) return v;
        }
      }
      throw new GuardianError(
        `Value must be one of: ${allowed.join(', ')} (case-insensitive)`,
        {
          expected: allowed.join(', '),
          got: input,
          comparison: 'enum',
          type: 'enum',
        },
      );
    };
    const nextMetaData: GuardianMetaData = {
      ...this._metaData,
      caseInsensitive: true,
    };
    return this._cloneWith(ciTransform, nextMetaData);
  }

  /**
   * Validates that the value is not one of the excluded values.
   *
   * @param excludedValues - Values to exclude
   * @param errorMessage - Optional custom error message
   * @returns A new EnumGuardian with the validation applied (the receiver is never mutated)
   * @throws {GuardianError} If value is in the excluded values list
   */
  exclude(excludedValues: T[], errorMessage?: string): this {
    return this.process((value: T) => {
      if (excludedValues.includes(value)) {
        throw new GuardianError(
          errorMessage ||
            `Value must not be one of: ${excludedValues.join(', ')}`,
          {
            expected: 'excluded value',
            got: value,
            comparison: 'exclude',
            type: 'validation',
          },
        );
      }
      return value;
    }) as this;
  }

  //#endregion

  //#region Transformation Methods

  /**
   * Transforms enum value to string.
   *
   * @returns New BaseGuardian<string> with string transformation
   */
  override toString(__description?: string): BaseGuardian<string> {
    return this.process(String);
  }

  /**
   * Maps enum value to another value using a mapping function.
   *
   * @template U - The output type
   * @param mapper - Function to map the enum value
   * @returns New BaseGuardian with mapped value
   *
   * @example
   * ```ts
   * enum Status { Active = 'active', Inactive = 'inactive' }
   * const schema = new EnumGuardian(['active', 'inactive'] as const);
   * const mapped = schema.map(v => v.toUpperCase());
   * ```
   */
  map<U>(mapper: (value: T) => U): BaseGuardian<U> {
    return this.process(mapper);
  }

  //#endregion

  //#region OpenAPI Generation

  /**
   * Generates OpenAPI schema for enum with allowed values and inferred type.
   *
   * @returns OpenAPI schema with enum values and type
   */
  override toOpenAPI(): Record<string, unknown> {
    const schema = super.toOpenAPI();

    // Add enum values
    schema.enum = [...this.__allowedValues];

    // Infer type from values
    const types = new Set(this.__allowedValues.map((v) => typeof v));
    if (types.size === 1) {
      const singleType = types.values().next().value;
      if (
        singleType === 'string' || singleType === 'number' ||
        singleType === 'boolean'
      ) {
        schema.type = singleType;
      }
    } else {
      // For mixed types, remove the default type (OpenAPI 3.0 standard)
      delete schema.type;
    }

    return schema;
  }

  //#endregion

  /**
   * Subclass hook for immutable chain operations — preserves
   * `__allowedValues` (required by the constructor signature)
   * alongside the new transform and metadata.
   */
  protected override _cloneWith(
    transform: GuardianTransform<unknown, T>,
    metaData: GuardianMetaData | undefined,
  ): this {
    const cloned = new EnumGuardian<T>(this.__allowedValues, metaData);
    cloned._composedTransform = transform;
    return cloned as this;
  }
}
