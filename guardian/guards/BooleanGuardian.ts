import { BaseGuardian } from '../BaseGuardian.ts';
import { GuardianError } from '../GuardianError.ts';
import type { GuardianMetaData } from '../types/mod.ts';

/**
 * Guardian for boolean validation and transformation.
 * Provides fluent API for building boolean validation pipelines.
 *
 * @example
 * ```ts
 * const schema = new BooleanGuardian()
 *   .true('Must be true');
 *
 * const result = schema.parse(true); // true
 * ```
 *
 * @since 1.0.0
 */
export class BooleanGuardian extends BaseGuardian<boolean> {
  /**
   * Creates a new BooleanGuardian instance.
   *
   * @param metaData - Optional metadata for this guardian
   */
  constructor(metaData?: GuardianMetaData) {
    super((input: unknown) => {
      if (typeof input !== 'boolean') {
        throw new GuardianError('Expected boolean but got ${got}', {
          expected: 'boolean',
          got: typeof input,
          comparison: 'type',
          type: 'boolean',
        });
      }
      return input;
    }, metaData);
  }

  //#region Validation Methods

  /**
   * Validates that the boolean value is true.
   *
   * @param errorMessage - Optional custom error message
   * @returns This BooleanGuardian (mutated) or new instance if immutable
   *
   * @example
   * ```ts
   * const schema = new BooleanGuardian().true();
   * schema.parse(false); // throws GuardianError
   * schema.parse(true); // true
   * ```
   */
  true(errorMessage?: string): BooleanGuardian {
    return this.step(
      (value: boolean) => {
        if (value !== true) {
          throw new Error(); // Just throw any error, step will wrap it
        }
        return value;
      },
      errorMessage || 'Expected true but got false',
      'equals',
    ) as BooleanGuardian;
  }

  /**
   * Validates that the boolean value is false.
   *
   * @param errorMessage - Optional custom error message
   * @returns This BooleanGuardian (mutated) or new instance if immutable
   */
  false(errorMessage?: string): BooleanGuardian {
    return this.step(
      (value: boolean) => {
        if (value !== false) {
          throw new Error(); // Just throw any error, step will wrap it
        }
        return value;
      },
      errorMessage || 'Expected false but got true',
      'equals',
    ) as BooleanGuardian;
  }

  //#endregion

  //#region Transformation Methods

  /**
   * Transforms boolean to string ('true' or 'false').
   *
   * @returns New BaseGuardian<string> with string transformation
   */
  override toString(description?: string): BaseGuardian<string> {
    return this.mutate(
      (value: boolean) => value.toString(),
      description || 'Convert boolean to string',
    );
  }

  /**
   * Transforms boolean to number (1 for true, 0 for false).
   *
   * @returns New BaseGuardian<number> with number transformation
   *
   * @example
   * ```ts
   * const schema = new BooleanGuardian().toNumber();
   * schema.parse(true); // 1
   * schema.parse(false); // 0
   * ```
   */
  toNumber(): BaseGuardian<number> {
    return this.mutate(
      (value: boolean) => value ? 1 : 0,
      'Boolean to number transformation',
    );
  }

  //#endregion
}
