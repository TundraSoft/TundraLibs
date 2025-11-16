import { BaseGuardian } from '../BaseGuardian.ts';
import { GuardianError } from '../GuardianError.ts';
import type { GuardianMetaData } from '../types/mod.ts';

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
 *
 * @since 1.0.0
 */
export class EnumGuardian<T> extends BaseGuardian<T> {
  private readonly _allowedValues: readonly T[];

  /**
   * Creates a new EnumGuardian instance.
   *
   * @param allowedValues - Array of allowed values
   * @param metaData - Optional metadata for this guardian
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

      throw new GuardianError('Value must be one of: ${expected}', {
        expected: allowedValues.join(', '),
        got: input,
        comparison: 'enum',
        type: 'enum',
      });
    }, metaData);

    this._allowedValues = allowedValues;
  }

  //#region Validation Methods

  /**
   * Gets the allowed values for this enum guardian.
   *
   * @returns Array of allowed values
   */
  get allowedValues(): readonly T[] {
    return this._allowedValues;
  }

  /**
   * Validates that the value is not one of the excluded values.
   *
   * @param excludedValues - Values to exclude
   * @param errorMessage - Optional custom error message
   * @returns New EnumGuardian with exclusion validation
   */
  exclude(excludedValues: T[], errorMessage?: string): EnumGuardian<T> {
    return this.step(
      (value: T) => {
        if (excludedValues.includes(value)) {
          throw new Error(); // Just throw any error, step will wrap it
        }
        return value;
      },
      errorMessage || `Value must not be one of: ${excludedValues.join(', ')}`,
      'notIn',
    ) as EnumGuardian<T>;
  }

  //#endregion

  //#region Transformation Methods

  /**
   * Transforms enum value to string.
   *
   * @returns New BaseGuardian<string> with string transformation
   */
  override toString(description?: string): BaseGuardian<string> {
    return this.mutate(
      (value: T) => String(value),
      description || 'Convert enum to string',
    );
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
   * const schema = new EnumGuardian(Object.values(Status))
   *   .map(status => status === 'active' ? 1 : 0);
   * ```
   */
  map<U>(mapper: (value: T) => U): BaseGuardian<U> {
    return this.mutate(mapper, 'Enum mapping transformation');
  }

  //#endregion
}
