/**
 * @fileoverview `UnknownGuardian` — type-erased escape hatch.
 * Accepts any input; callers provide validation via `.process(fn)` /
 * `.test(fn)`. Used internally as the base for `Guardian.oneOf`
 * which can't know its element type statically.
 *
 * @module
 */

import { BaseGuardian } from '../BaseGuardian.ts';
import { GuardianError } from '../errors/Base.ts';
import type { GuardianMetaData, GuardianTransform } from '../types/mod.ts';
// The sibling guard is referenced ONLY as a return type here — the
// constructor handed to `process()` comes from the registry, so this
// import erases and creates no runtime cycle.
import type { StringGuardian } from './StringGuardian.ts';
import { resolveGuardian } from '../helpers/mod.ts';

/**
 * Guardian for unknown/any values - accepts any input without validation.
 *
 * This guardian is useful when you need to accept any value in your schema,
 * similar to TypeScript's `unknown` type. It performs no validation and
 * simply passes through whatever value is provided.
 *
 * @template T - The output type (defaults to unknown)
 *
 * @example
 * ```ts
 * const anyValue = Guardian.unknown();
 * anyValue.parse('hello'); // 'hello'
 * anyValue.parse(42); // 42
 * anyValue.parse({ foo: 'bar' }); // { foo: 'bar' }
 * anyValue.parse(null); // throws GuardianError
 * anyValue.parse(undefined); // throws GuardianError
 *
 * // To allow null values, use nullable() helper:
 * const nullableValue = Guardian.unknown().nullable();
 * nullableValue.parse(null); // null
 * ```
 *
 * @example With transformations
 * ```ts
 * const stringified = Guardian.unknown()
 *   .process(value => JSON.stringify(value));
 *
 * stringified.parse({ name: 'John' }); // '{"name":"John"}'
 * stringified.parse([1, 2, 3]); // '[1,2,3]'
 * ```
 */
export class UnknownGuardian<T = unknown> extends BaseGuardian<T> {
  protected override readonly _type = 'unknown';

  /**
   * Creates a new UnknownGuardian instance.
   *
   * @param metaData - Optional metadata for documentation and tooling
   */
  constructor(
    initialTransform?: GuardianTransform<unknown, T>,
    metaData?: GuardianMetaData,
  ) {
    // Transform that accepts any value except null and undefined
    const defaultTransform: GuardianTransform<unknown, T> = (
      input: unknown,
    ) => {
      if (input === null) {
        throw new GuardianError('Expected value but got null', {
          expected: 'non-null value',
          got: 'null',
          comparison: 'type',
          type: 'unknown',
        });
      }
      if (input === undefined) {
        throw new GuardianError('Expected value but got undefined', {
          expected: 'defined value',
          got: 'undefined',
          comparison: 'type',
          type: 'unknown',
        });
      }
      return input as T;
    };

    super(initialTransform || defaultTransform, metaData);
  }

  /**
   * Transforms the unknown value to a string representation.
   * Uses JSON.stringify for objects, toString() for primitives.
   *
   * @param message - Optional custom error message for transformation failures
   * @returns A new Guardian instance that outputs strings
   *
   * @example
   * ```ts
   * const stringified = Guardian.unknown().toStringValue();
   * stringified.parse(42); // '42'
   * stringified.parse({ name: 'John' }); // '{"name":"John"}'
   * stringified.parse([1, 2, 3]); // '[1,2,3]'
   * ```
   */
  toStringValue(_message?: string): StringGuardian {
    return this.process((value: T) => {
      try {
        if (value === null) return 'null';
        if (value === undefined) return 'undefined';
        if (typeof value === 'string') return value;
        if (typeof value === 'number' || typeof value === 'boolean') {
          return String(value);
        }
        if (typeof value === 'bigint') return value.toString();
        if (typeof value === 'symbol') return value.toString();
        if (typeof value === 'function') return value.toString();

        // For objects and arrays, use JSON.stringify
        return JSON.stringify(value);
      } catch {
        throw new GuardianError(
          _message || 'Failed to convert value to string',
          {
            expected: 'stringifiable value',
            got: typeof value,
            comparison: 'toString',
            type: 'conversion',
          },
        );
      }
    }, resolveGuardian('string')) as StringGuardian;
  }

  /**
   * Transforms the unknown value to a JSON string.
   *
   * @param message - Optional custom error message for JSON serialization failures
   * @returns A new Guardian with the operation applied (the receiver is never mutated)
   *
   * @example
   * ```ts
   * const jsonified = Guardian.unknown().toJSON();
   * jsonified.parse({ name: 'John' }); // '{"name":"John"}'
   * jsonified.parse([1, 2, 3]); // '[1,2,3]'
   * ```
   */
  toJSON(_message?: string): BaseGuardian<string> {
    return this.process((value: T) => {
      try {
        return JSON.stringify(value);
      } catch {
        throw new GuardianError(
          _message || 'Failed to serialize value to JSON',
          {
            expected: 'JSON serializable value',
            got: typeof value,
            comparison: 'toJSON',
            type: 'conversion',
          },
        );
      }
    });
  }

  /**
   * Applies a type guard function to narrow the type.
   * Useful for runtime type checking when you know more about the expected structure.
   *
   * @template U - The narrowed type
   * @param guard - Type guard function that returns true if value is of type U
   * @param message - Optional custom error message
   * @returns A new Guardian with the operation applied (the receiver is never mutated)
   *
   * @example
   * ```ts
   * const isString = (value: unknown): value is string => typeof value === 'string';
   * const stringGuard = Guardian.unknown().narrow(isString);
   * stringGuard.parse('hello'); // 'hello' (typed as string)
   * stringGuard.parse(42); // throws error
   * ```
   */
  narrow<U>(
    guard: (value: unknown) => value is U,
    _message?: string,
  ): BaseGuardian<U> {
    return this.process((value: T) => {
      if (!guard(value)) {
        throw new GuardianError(
          _message || 'Value failed type guard validation',
          {
            expected: 'type guard match',
            got: typeof value,
            comparison: 'narrow',
            type: 'validation',
          },
        );
      }
      return value as U;
    });
  }

  /**
   * Applies a type guard assertion to cast the value to a specific type.
   * This is useful when you know the value should be of a certain type at runtime.
   *
   * @template U - The target type
   * @param typeGuard - Type guard function that returns true if value is of type U
   * @param description - Optional description of the type assertion
   * @returns A new Guardian with the operation applied (the receiver is never mutated)
   *
   * @example
   * ```ts
   * const isString = (value: unknown): value is string => typeof value === 'string';
   * const stringGuard = Guardian.unknown().as(isString);
   * stringGuard.parse('hello'); // 'hello' (typed as string)
   * stringGuard.parse(42); // throws error
   * ```
   */
  as<U>(
    typeGuard: (value: unknown) => value is U,
    __description?: string,
  ): BaseGuardian<U> {
    return this.process((value: T) => {
      if (!typeGuard(value)) {
        throw new GuardianError('Type assertion failed', {
          expected: 'type guard match',
          got: typeof value,
          comparison: 'as',
          type: 'validation',
        });
      }
      return value;
    }) as BaseGuardian<U>;
  }

  /**
   * Checks if the value is null or undefined.
   *
   * @returns A new Guardian with the operation applied (the receiver is never mutated)
   *
   * @example
   * ```ts
   * const nullish = Guardian.unknown().nullish();
   * nullish.parse(null); // null
   * nullish.parse(undefined); // undefined
   * nullish.parse('hello'); // throws error
   * ```
   */
  nullish(): BaseGuardian<null | undefined> {
    const nullishTransform: GuardianTransform<unknown, null | undefined> = (
      input: unknown,
    ) => {
      if (input === null || input === undefined) {
        return input;
      }
      throw new GuardianError('Expected null or undefined', {
        expected: 'null or undefined',
        got: typeof input === 'object' ? 'object' : typeof input,
        comparison: 'nullish',
        type: 'unknown',
      });
    };

    return new UnknownGuardian(nullishTransform, this.metaData);
  }

  /**
   * Checks if the value is not null and not undefined.
   *
   * @returns A new Guardian with the operation applied (the receiver is never mutated)
   *
   * @example
   * ```ts
   * const nonNullish = Guardian.unknown().nonNullish();
   * nonNullish.parse('hello'); // 'hello'
   * nonNullish.parse(42); // 42
   * nonNullish.parse(null); // throws error
   * ```
   */
  nonNullish(): BaseGuardian<NonNullable<T>> {
    return this.process((value: T) => {
      if (value == null) {
        throw new GuardianError('Value cannot be null or undefined', {
          expected: 'non-nullish value',
          got: value,
          comparison: 'nonNullish',
          type: 'validation',
        });
      }
      return value;
    });
  }

  //#region OpenAPI Generation

  /**
   * Generates OpenAPI schema for unknown type.
   * Returns empty schema {} to allow any value type.
   *
   * @returns Empty OpenAPI schema
   */
  override toOpenAPI(): Record<string, unknown> {
    // A guardian built by `Guardian.intersection` / `.instanceof` /
    // `.never` / `.preprocess` carries its structural emit in metadata
    // (so it survives `_cloneWith`); use it and layer the current doc
    // metadata (title / description set via `.describe()`) on top.
    const emit = this._metaData?.schemaEmit?.openAPI;
    if (emit) return { ...emit(), ...this.__docMetaSchema() };

    // Unknown type - return empty schema to allow anything
    // Don't call super.toOpenAPI() as we don't want type: 'unknown'
    const schema: Record<string, unknown> = {};

    // Still include metadata if available
    if (this._metaData) {
      if (this._metaData.title) schema.title = this._metaData.title;
      if (this._metaData.description) {
        schema.description = this._metaData.description;
      }
      if (this._metaData.deprecated) {
        schema.deprecated = this._metaData.deprecated;
      }
      if (this._metaData.examples) schema.examples = this._metaData.examples;
    }

    return schema;
  }

  override toJSONSchema(): Record<string, unknown> {
    const emit = this._metaData?.schemaEmit?.jsonSchema;
    if (emit) return { ...emit(), ...this.__docMetaSchema() };
    return super.toJSONSchema();
  }

  override toMarkdown(): string {
    const emit = this._metaData?.schemaEmit?.markdown;
    if (emit) return emit();
    return super.toMarkdown();
  }

  /**
   * Doc-metadata fragment (title / description / deprecated / examples)
   * layered onto a custom `schemaEmit` result so `.describe({ title })`
   * after `intersection()` / `instanceof()` / … still names the schema
   * without discarding the structural emit.
   *
   * @internal
   */
  private __docMetaSchema(): Record<string, unknown> {
    const m = this._metaData;
    if (!m) return {};
    const out: Record<string, unknown> = {};
    if (m.title) out.title = m.title;
    if (m.description) out.description = m.description;
    if (m.deprecated) out.deprecated = m.deprecated;
    if (m.examples) out.examples = m.examples;
    return out;
  }

  //#endregion
}
