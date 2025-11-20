import { BaseGuardian } from "../BaseGuardian.ts";
import { GuardianError } from "../GuardianError.ts";
import type { GuardianMetaData } from "../types/mod.ts";
import { NumberGuardian } from "./NumberGuardian.ts";
import { StringGuardian } from "./StringGuardian.ts";

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
  protected override readonly _type = "boolean";
  /**
   * Creates a new BooleanGuardian instance.
   *
   * @param metaData - Optional metadata for this guardian
   */
  constructor(metaData?: GuardianMetaData) {
    super((input: unknown) => {
      if (typeof input !== "boolean") {
        throw new GuardianError("Expected boolean but got ${got}", {
          expected: "boolean",
          got: typeof input,
          comparison: "type",
          type: "boolean",
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
    return this.process(
      (value: boolean) => {
        if (value !== true) {
          throw new GuardianError(
            errorMessage || "Expected true but got false",
            {
              expected: true,
              got: value,
              comparison: "equals",
              type: "validation",
            },
          );
        }
        return value;
      },
    ) as BooleanGuardian;
  }

  /**
   * Validates that the boolean value is false.
   *
   * @param errorMessage - Optional custom error message
   * @returns This BooleanGuardian (mutated) or new instance if immutable mode
   */
  false(errorMessage?: string): BooleanGuardian {
    return this.process(
      (value: boolean) => {
        if (value !== false) {
          throw new GuardianError(
            errorMessage || "Expected false but got true",
            {
              expected: false,
              got: value,
              comparison: "equals",
              type: "validation",
            },
          );
        }
        return value;
      },
    ) as BooleanGuardian;
  }

  //#endregion

  //#region Transformation Methods

  /**
   * Transforms boolean to string ('true' or 'false').
   *
   * @returns New BaseGuardian<string> with string transformation
   */
  override toString(_description?: string): StringGuardian {
    return this.process(
      (value: boolean) => value.toString(),
      StringGuardian
    ) as StringGuardian;
  }

  /**
   * Transforms boolean to number (true = 1, false = 0).
   *
   * @returns New NumberGuardian with number transformation
   *
   * @example
   * ```ts
   * const schema = new BooleanGuardian().toNumber();
   * schema.parse(true); // 1
   * schema.parse(false); // 0
   * ```
   */
  toNumber(): NumberGuardian {
    return this.process(
      (value: boolean): number => value ? 1 : 0,
      NumberGuardian
    ) as NumberGuardian;
  }

  //#endregion
}
