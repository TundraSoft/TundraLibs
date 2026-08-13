/**
 * @fileoverview `@Dose()` — property decorator that marks a field
 * as injectable. The injection itself happens later, either via
 * `@Inoculate` on the owning class or a manual `Doctor.treat()`
 * call.
 *
 * @module
 */

import { MissingDesignTypeError, MissingMetadataError } from '../errors/mod.ts';
import type { Prescription } from '../types/mod.ts';

/**
 * Mark a property as a dependency the Doctor will fill in.
 *
 * Reads the property's runtime type from `reflect-metadata`'s
 * `design:type` slot (which TypeScript emits only when
 * `emitDecoratorMetadata: true`) and appends an entry to the
 * class's `design:injectable` array. {@link Doctor.treat} walks
 * that array to fill each property.
 *
 * Inherited entries are walked into the subclass automatically;
 * if the subclass redeclares a property by the same name, the
 * subclass entry replaces the parent's so only one resolution
 * happens per property.
 *
 * @returns A property decorator.
 *
 * @throws {@link MissingMetadataError} When `Reflect.getMetadata`
 *   is unavailable — the consumer has not imported
 *   `reflect-metadata`.
 * @throws {@link MissingDesignTypeError} When no runtime type was
 *   emitted for the property —
 *   `emitDecoratorMetadata: true` is missing from the consumer's
 *   TypeScript config.
 *
 * @example
 * ```typescript
 * class Logger {}
 *
 * class Handler {
 *   @Dose() public logger!: Logger;
 * }
 * ```
 */
export function Dose(): PropertyDecorator {
  // deno-lint-ignore no-explicit-any
  return function (target: any, key: string | symbol) {
    if (
      typeof Reflect === 'undefined' ||
      typeof Reflect.getMetadata !== 'function'
    ) {
      throw new MissingMetadataError(
        'Reflect metadata is not available. Make sure you have imported the reflect-metadata library.',
      );
    }

    const type = Reflect.getMetadata('design:type', target, key);
    if (!type) {
      throw new MissingDesignTypeError(
        `Type information is missing for property ${
          String(key)
        }. Make sure emitDecoratorMetadata is enabled.`,
        { property: String(key) },
      );
    }

    // Copy any inherited entries so the subclass owns its own
    // array (otherwise we'd mutate the parent's metadata in place).
    const inherited: Prescription[] =
      Reflect.getMetadata('design:injectable', target.constructor) ?? [];
    const injectables = inherited.filter((p) => p.key !== key);
    injectables.push({ key, type });

    Reflect.defineMetadata(
      'design:injectable',
      injectables,
      target.constructor,
    );
  };
}
