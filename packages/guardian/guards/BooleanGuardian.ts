/**
 * @fileoverview `BooleanGuardian` — coerce-by-default boolean
 * validator. Accepts a strict allow-list of strings (`'true' / 'yes'
 * / 'y' / 'on' / '1'` ↔ `'false' / 'no' / 'n' / 'off' / '0' / ''`)
 * and numeric `0` / `1`; rejects ambiguous strings and arbitrary
 * truthy values (no `Boolean('false') === true` footgun).
 *
 * @module
 */

import { BaseGuardian } from '../BaseGuardian.ts';
import { GuardianError } from '../errors/Base.ts';
import { coerceBoolean } from '../helpers/coerce.ts';
import type { GuardianMetaData, GuardianTransform } from '../types/mod.ts';
// Sibling guards are referenced ONLY as return types here — the
// constructors the transitions hand to `process()` come from the
// registry, so these imports erase and create no runtime cycle.
import type { NumberGuardian } from './NumberGuardian.ts';
import type { StringGuardian } from './StringGuardian.ts';
import { resolveGuardian } from './registry.ts';

/**
 * Boolean validator with strict-list coercion. See
 * {@link Guardian.boolean} for the standard factory.
 *
 * @example
 * ```ts
 * const Accepted = Guardian.boolean().true('Terms must be accepted');
 * Accepted.parse(true);   // true
 * Accepted.parse('yes');  // true   ← coerced
 * Accepted.parse('maybe'); // throws
 * ```
 *
 * @see {@link Guardian.boolean}
 */
export class BooleanGuardian extends BaseGuardian<boolean> {
  protected override readonly _type = 'boolean';
  /**
   * Creates a new BooleanGuardian instance.
   *
   * @param metaData - Optional metadata for this guardian
   */
  constructor(
    initialTransform?: GuardianTransform<unknown, boolean>,
    metaData?: GuardianMetaData,
  ) {
    // Coerce-by-default. Strict string list — `'false'` → false,
    // `'true'` → true; arbitrary truthy strings throw rather than
    // silently producing true (the well-known JS footgun).
    const defaultTransform = coerceBoolean;

    super(initialTransform || defaultTransform, metaData);
  }

  //#region Validation Methods

  /**
   * Validates that the boolean value is true.
   *
   * @param errorMessage - Optional custom error message
   * @returns A new BooleanGuardian with the validation applied (the receiver is never mutated)
   * @throws {GuardianError} If value is false
   *
   * @example
   * ```ts
   * const schema = new BooleanGuardian().true();
   * schema.parse(false); // throws GuardianError
   * schema.parse(true); // true
   * ```
   */
  true(errorMessage?: string): this {
    return this.process(
      (value: boolean) => {
        if (value !== true) {
          throw new GuardianError(
            errorMessage || 'Expected true but got false',
            {
              expected: true,
              got: value,
              comparison: 'equals',
              type: 'validation',
            },
          );
        }
        return value;
      },
    ) as this;
  }

  /**
   * Validates that the boolean value is false.
   *
   * @param errorMessage - Optional custom error message
   * @returns A new BooleanGuardian with the validation applied (the receiver is never mutated)
   * @throws {GuardianError} If value is true
   */
  false(errorMessage?: string): this {
    return this.process(
      (value: boolean) => {
        if (value !== false) {
          throw new GuardianError(
            errorMessage || 'Expected false but got true',
            {
              expected: false,
              got: value,
              comparison: 'equals',
              type: 'validation',
            },
          );
        }
        return value;
      },
    ) as this;
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
      resolveGuardian('string'),
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
      resolveGuardian('number'),
    ) as NumberGuardian;
  }

  //#endregion
}
