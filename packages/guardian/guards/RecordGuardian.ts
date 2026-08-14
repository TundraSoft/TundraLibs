/**
 * @fileoverview `RecordGuardian` — `Record<K, V>` validator. Every
 * key is validated against the key guardian (optional, defaults to
 * `Guardian.string()`); every value against the value guardian.
 * Use this for shape-free maps with uniform value types; for
 * fixed-key shapes use `ObjectGuardian`.
 *
 * @module
 */

import { type AsyncProbeTarget, BaseGuardian } from '../BaseGuardian.ts';
import { GuardianError } from '../errors/Base.ts';
import { gateAsyncStepResult } from '../helpers/mod.ts';
import type { GuardianMetaData, GuardianTransform } from '../types/mod.ts';

/**
 * Keys never copied onto a validated record output — assigning them as
 * own properties is the classic prototype-pollution vector
 * (`__proto__` rewrites the prototype, `constructor` / `prototype`
 * shadow built-ins). Dropped from the result rather than copied through.
 */
const PROTO_POLLUTION_KEYS: ReadonlySet<string> = new Set([
  '__proto__',
  'constructor',
  'prototype',
]);

/**
 * Type for refinement validation functions
 */
export type RecordRefinement<K extends string | number, V> = {
  validator: (data: Record<K, V>) => boolean | Promise<boolean>;
  message: string;
  path?: string;
};

/**
 * Guardian for validating objects with arbitrary key-value pairs.
 * All keys and values must match the specified validators.
 *
 * @template K - The type of the keys (string or number)
 * @template V - The type of the values
 *
 * @example
 * ```ts
 * import { Guardian } from '@tundralibs/guardian';
 *
 * // Basic record with string keys and number values
 * const scores = Guardian.record(
 *   Guardian.string(),
 *   Guardian.number().min(0).max(100)
 * );
 *
 * scores.parse({ math: 95, science: 87 }); // ✅ Valid
 * scores.parse({ math: 95, science: 'A' }); // ❌ Invalid value type
 * ```
 *
 * @example
 * ```ts
 * import { Guardian } from '@tundralibs/guardian';
 *
 * // Record with key pattern validation
 * const config = Guardian.record(
 *   Guardian.string().pattern(/^[A-Z_]+$/),
 *   Guardian.string()
 * );
 *
 * config.parse({ API_KEY: 'abc', DB_HOST: 'localhost' }); // ✅ Valid
 * config.parse({ apiKey: 'abc' }); // ❌ Key doesn't match pattern
 * ```
 *
 * @example
 * ```ts
 * import { Guardian } from '@tundralibs/guardian';
 *
 * // Record with complex value validation
 * const userProfiles = Guardian.record(
 *   Guardian.string().uuid(),
 *   Guardian.object({
 *     name: Guardian.string(),
 *     age: Guardian.number()
 *   })
 * );
 * ```
 */
export class RecordGuardian<
  K extends string | number,
  V,
> extends BaseGuardian<Record<K, V>> {
  /** Emitted schema type. */
  protected override readonly _type = 'record';
  private readonly __keyValidator: BaseGuardian<K>;
  private readonly __valueValidator: BaseGuardian<V>;
  /**
   * True when the key or value guardian carries an async step. Selects
   * the awaiting validation path and flags the record `isAsync` so a
   * nested async validator can't resolve to a pending Promise stored in
   * a value slot and silently bypass validation.
   */
  private __async: boolean = false;

  /**
   * Creates a new RecordGuardian instance.
   *
   * @param keyValidator - Guardian for validating keys
   * @param valueValidator - Guardian for validating values
   * @param metaData - Optional metadata for this guardian
   */
  constructor(
    keyValidator: BaseGuardian<K>,
    valueValidator: BaseGuardian<V>,
    metaData?: GuardianMetaData,
  ) {
    // Use an arrow function to capture the proper 'this' context
    const recordTransform: GuardianTransform<unknown, Record<K, V>> = (
      input: unknown,
    ) => {
      // Settle a still-provisional async verdict (an unresolved
      // `lazy()` key / value guardian) before choosing the path.
      if (this._asyncProbePending) this._refreshAsyncProbe();
      return this.__async
        ? this.__validateRecordAsync(input)
        : this.__validateRecordWithoutRefinements(input);
    };

    super(recordTransform, metaData);
    this.__keyValidator = keyValidator;
    this.__valueValidator = valueValidator;
    // A not-yet-resolvable `lazy()` key / value guardian keeps the
    // verdict provisional and is re-probed before the first parse.
    this._initAsyncProbe();
  }

  /** Key + value guardians, for the deferred async probe. @internal */
  protected override _asyncProbeChildren(): ReadonlyArray<
    AsyncProbeTarget | undefined
  > {
    return [this.__keyValidator, this.__valueValidator];
  }

  /** @internal */
  protected override _markAsync(): void {
    this.__async = true;
    super._markAsync();
  }

  // `.refine` is inherited from `BaseGuardian`. The old override
  // stored refinements in a separate `_refinements` array and applied
  // them in a `parse()` override after `super.parse()`. The new
  // inherited implementation weaves refinements into
  // `_composedTransform` at their declaration position (same as
  // ObjectGuardian) — simpler, and aligns the call-order semantics
  // across guards.

  //#region Refinement

  /**
   * Adds multiple refinements at once using superRefine.
   * This is useful when you need to apply multiple complex validations.
   *
   * @param refinements - Array of refinement objects
   * @returns New RecordGuardian with all refinements added
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * const validatedRecord = Guardian.record(
   *   Guardian.string(),
   *   Guardian.number()
   * ).superRefine([
   *   {
   *     validator: (data) => Object.keys(data).length > 0,
   *     message: 'Record must not be empty'
   *   },
   *   {
   *     validator: (data) => Object.keys(data).length <= 10,
   *     message: 'Record must not have more than 10 keys'
   *   }
   * ]);
   * ```
   */
  superRefine(
    refinements: Array<RecordRefinement<K, V>>,
  ): this {
    // The reducer accumulator is typed `RecordGuardian<K, V>` to keep
    // TypeScript happy across the iteration; narrow back to `this`
    // at the return so subclass types flow through.
    return refinements.reduce(
      (guardian: RecordGuardian<K, V>, refinement) =>
        guardian.refine(
          refinement.validator,
          refinement.message,
          refinement.path,
        ),
      this as RecordGuardian<K, V>,
    ) as this;
  }

  //#endregion

  //#region Helper Validations

  /**
   * Validates that the record is not empty (has at least one property).
   *
   * @param message - Optional custom error message
   * @returns A new RecordGuardian with the validation applied (the receiver is never mutated)
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * const scores = Guardian.record(
   *   Guardian.string(),
   *   Guardian.number()
   * ).notEmpty();
   *
   * scores.parse({ math: 95 }); // ✅ Valid
   * scores.parse({}); // ❌ Empty record not allowed
   * ```
   */
  notEmpty(message?: string): this {
    return this.refine(
      (data) => Object.keys(data).length > 0,
      message ?? 'Record must not be empty',
    );
  }

  /**
   * Validates that the record has at least the specified number of properties.
   *
   * @param min - Minimum number of properties required
   * @param message - Optional custom error message
   * @returns A new RecordGuardian with the validation applied (the receiver is never mutated)
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * const config = Guardian.record(
   *   Guardian.string(),
   *   Guardian.string()
   * ).minSize(2);
   *
   * config.parse({ key1: 'val1', key2: 'val2' }); // ✅ Valid
   * config.parse({ key1: 'val1' }); // ❌ Too few properties
   * ```
   */
  minSize(min: number, message?: string): this {
    return this.refine(
      (data) => Object.keys(data).length >= min,
      message ??
        `Record must have at least ${min} ${
          min === 1 ? 'property' : 'properties'
        }`,
    );
  }

  /**
   * Validates that the record has at most the specified number of properties.
   *
   * @param max - Maximum number of properties allowed
   * @param message - Optional custom error message
   * @returns A new RecordGuardian with the validation applied (the receiver is never mutated)
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * const limitedConfig = Guardian.record(
   *   Guardian.string(),
   *   Guardian.string()
   * ).maxSize(5);
   *
   * limitedConfig.parse({ key1: 'val1', key2: 'val2' }); // ✅ Valid
   * limitedConfig.parse({ k1: 'v1', k2: 'v2', k3: 'v3', k4: 'v4', k5: 'v5', k6: 'v6' }); // ❌ Too many
   * ```
   */
  maxSize(max: number, message?: string): this {
    return this.refine(
      (data) => Object.keys(data).length <= max,
      message ??
        `Record must have at most ${max} ${
          max === 1 ? 'property' : 'properties'
        }`,
    );
  }

  /**
   * Validates that the record has exactly the specified number of properties.
   *
   * @param count - Exact number of properties required
   * @param message - Optional custom error message
   * @returns A new RecordGuardian with the validation applied (the receiver is never mutated)
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * const exactConfig = Guardian.record(
   *   Guardian.string(),
   *   Guardian.number()
   * ).size(3);
   *
   * exactConfig.parse({ a: 1, b: 2, c: 3 }); // ✅ Valid
   * exactConfig.parse({ a: 1, b: 2 }); // ❌ Wrong number of properties
   * ```
   */
  size(count: number, message?: string): this {
    return this.refine(
      (data) => Object.keys(data).length === count,
      message ??
        `Record must have exactly ${count} ${
          count === 1 ? 'property' : 'properties'
        }`,
    );
  }

  /**
   * Validates that the record contains all the specified keys.
   *
   * @param keys - Array of keys that must be present in the record
   * @param message - Optional custom error message
   * @returns A new RecordGuardian with the validation applied (the receiver is never mutated)
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * const requiredConfig = Guardian.record(
   *   Guardian.string(),
   *   Guardian.string()
   * ).hasKeys(['API_KEY', 'DB_HOST']);
   *
   * requiredConfig.parse({ API_KEY: 'abc', DB_HOST: 'localhost', PORT: '5432' }); // ✅ Valid
   * requiredConfig.parse({ API_KEY: 'abc' }); // ❌ Missing DB_HOST
   * ```
   */
  hasKeys(keys: Array<string>, message?: string): this {
    return this.refine(
      (data) => {
        const recordKeys = Object.keys(data);
        return keys.every((key) => recordKeys.includes(key));
      },
      message ?? `Record must contain keys: ${keys.join(', ')}`,
    );
  }

  /**
   * Validates that the record does not contain any of the specified keys.
   *
   * @param keys - Array of keys that must not be present in the record
   * @param message - Optional custom error message
   * @returns A new RecordGuardian with the validation applied (the receiver is never mutated)
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * const safeConfig = Guardian.record(
   *   Guardian.string(),
   *   Guardian.string()
   * ).forbiddenKeys(['password', 'secret']);
   *
   * safeConfig.parse({ username: 'user', email: 'user@test.com' }); // ✅ Valid
   * safeConfig.parse({ username: 'user', password: 'secret123' }); // ❌ Forbidden key
   * ```
   */
  forbiddenKeys(keys: Array<string>, message?: string): this {
    return this.refine(
      (data) => {
        const recordKeys = Object.keys(data);
        return !keys.some((key) => recordKeys.includes(key));
      },
      message ?? `Record must not contain forbidden keys: ${keys.join(', ')}`,
    );
  }

  /**
   * Validates no key matches the given regex pattern. Mirror of
   * {@link forbiddenKeys} for pattern-matched keys.
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * Guardian.record(Guardian.string(), Guardian.string())
   *   .forbiddenKeyPattern(/^_internal_/);  // reject any key starting with `_internal_`
   * ```
   */
  forbiddenKeyPattern(
    pattern: RegExp,
    message?: string,
  ): this {
    return this.refine(
      (data) => !Object.keys(data).some((k) => pattern.test(k)),
      message ?? `Record contains a key matching forbidden pattern ${pattern}`,
    );
  }

  /**
   * Sugar over {@link refine} that runs `fn` on **each value**
   * individually rather than the whole record. Throws on the first
   * value that fails. Pairs well with cross-cutting checks like
   * "every URL must be HTTPS" / "every count must be even".
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * Guardian.record(Guardian.string(), Guardian.string())
   *   .valueRefinement((v) => v.startsWith('https://'), 'all values must be HTTPS');
   * ```
   */
  valueRefinement(
    fn: (value: V, key: K) => boolean,
    message: string,
  ): this {
    return this.refine(
      (data) => {
        for (const [k, v] of Object.entries(data) as Array<[K, V]>) {
          if (!fn(v, k)) return false;
        }
        return true;
      },
      message,
    );
  }

  //#endregion

  //#region Private Methods

  /**
   * Validates that the input is an object type.
   */
  private __validateObjectType(input: unknown): Record<string, unknown> {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      let got: string;
      if (typeof input === 'object') {
        got = input === null ? 'null' : 'array';
      } else {
        got = typeof input;
      }
      throw new GuardianError(`Expected record but got ${got}`, {
        expected: 'record',
        got,
        comparison: 'type',
        type: 'record',
      });
    }
    return input as Record<string, unknown>;
  }

  /**
   * Core record validation logic without refinements.
   * Validates all key-value pairs against the specified validators.
   */
  private __validateRecordWithoutRefinements(
    input: unknown,
  ): Record<K, V> {
    // Type validation
    const inputObj = this.__validateObjectType(input);

    const result: Record<string, unknown> = {};
    const errors: Record<string, GuardianError> = {};

    // Cache the inner transforms once per call to bypass `parse()`'s
    // per-entry try/catch + isAsync check. Same hot-path trick the
    // Object/Array/Tuple guards use.
    const keyTransform = (this.__keyValidator as unknown as {
      _composedTransform(v: unknown): K;
    })._composedTransform;
    const valueTransform = (this.__valueValidator as unknown as {
      _composedTransform(v: unknown): V;
    })._composedTransform;
    for (const [key, value] of Object.entries(inputObj)) {
      // Never copy prototype-pollution keys onto the result — see
      // PROTO_POLLUTION_KEYS.
      if (PROTO_POLLUTION_KEYS.has(key)) continue;
      try {
        const validatedKey = keyTransform(key);
        const validatedValue = valueTransform(value);
        if (PROTO_POLLUTION_KEYS.has(String(validatedKey))) continue;
        result[String(validatedKey)] = validatedValue;
      } catch (error) {
        if (error instanceof GuardianError) {
          error.prependPath(key);
          errors[key] = error;
        } else {
          errors[key] = new GuardianError(
            `Record validation failed for key '${key}': ${error}`,
            {
              expected: 'valid key-value pair',
              got: { key, value },
              comparison: 'record_validation',
              type: 'record_pair',
              path: [key],
            },
          );
        }
      }
    }

    // Throw validation errors if any
    this.__throwIfErrors(errors, input);

    return result as Record<K, V>;
  }

  /**
   * Async sibling of {@link __validateRecordWithoutRefinements}. Awaits
   * each key/value transform so async key or value guardians are
   * enforced instead of leaving pending Promises in value slots.
   */
  private async __validateRecordAsync(input: unknown): Promise<Record<K, V>> {
    const inputObj = this.__validateObjectType(input);

    const result: Record<string, unknown> = {};
    const errors: Record<string, GuardianError> = {};

    const keyTransform = (this.__keyValidator as unknown as {
      _composedTransform(v: unknown): K | Promise<K>;
    })._composedTransform;
    const valueTransform = (this.__valueValidator as unknown as {
      _composedTransform(v: unknown): V | Promise<V>;
    })._composedTransform;
    for (const [key, value] of Object.entries(inputObj)) {
      if (PROTO_POLLUTION_KEYS.has(key)) continue;
      try {
        // Only a real Promise is a leaked async step to await; a
        // non-Promise thenable-shaped VALUE would be ADOPTED and
        // silently destroyed by `await`, so refuse it loudly at each
        // per-key / per-value adoption point.
        const rawKey = keyTransform(key);
        const validatedKey = rawKey instanceof Promise
          ? await rawKey
          : gateAsyncStepResult(rawKey);
        const rawValue = valueTransform(value);
        const validatedValue = rawValue instanceof Promise
          ? await rawValue
          : gateAsyncStepResult(rawValue);
        if (PROTO_POLLUTION_KEYS.has(String(validatedKey))) continue;
        result[String(validatedKey)] = validatedValue;
      } catch (error) {
        if (error instanceof GuardianError) {
          error.prependPath(key);
          errors[key] = error;
        } else {
          errors[key] = new GuardianError(
            `Record validation failed for key '${key}': ${error}`,
            {
              expected: 'valid key-value pair',
              got: { key, value },
              comparison: 'record_validation',
              type: 'record_pair',
              path: [key],
            },
          );
        }
      }
    }

    this.__throwIfErrors(errors, input);

    // Gate the result before this native `async` method returns it: the
    // keys of `result` come from the input, so a validated `then` key
    // makes it thenable-shaped. Returning a thenable out of a native
    // async function lets the ECMAScript promise resolution procedure
    // ADOPT (and silently destroy) it BEFORE parseAsync's top-level guard
    // runs — refuse it at the shared choke point (`gateAsyncStepResult`).
    return gateAsyncStepResult(result) as Record<K, V>;
  }

  /**
   * Throws a GuardianError if there are any validation errors.
   */
  private __throwIfErrors(
    errors: Record<string, GuardianError>,
    input: unknown,
  ): void {
    if (Object.keys(errors).length === 0) return;

    const errorCount = Object.keys(errors).length;
    const mainError = new GuardianError(
      `Record validation failed with ${errorCount} error(s)`,
      {
        expected: 'valid record',
        got: input,
        comparison: 'record_validation',
        type: 'record',
        cause: errors,
      },
    );

    // Add individual property errors as causes
    for (const [key, error] of Object.entries(errors)) {
      mainError.addCause(key, error);
    }

    throw mainError;
  }

  /**
   * Subclass hook for immutable chain operations — preserves
   * `__keyValidator` and `__valueValidator` alongside the new transform
   * and metadata. Refinements live on `_composedTransform` (woven in
   * by the inherited `BaseGuardian.refine`), so the cloned transform
   * already carries them.
   */
  protected override _cloneWith(
    transform: GuardianTransform<unknown, Record<K, V>>,
    metaData: GuardianMetaData | undefined,
  ): this {
    const cloned = new RecordGuardian<K, V>(
      this.__keyValidator,
      this.__valueValidator,
      metaData,
    );
    cloned._composedTransform = transform;
    return cloned as this;
  }

  //#endregion

  //#region OpenAPI Generation

  /**
   * Generates OpenAPI schema for record with additionalProperties pattern.
   *
   * @returns OpenAPI schema object
   */
  override toOpenAPI(): Record<string, unknown> {
    const schema = super.toOpenAPI();

    // Records ARE objects on the wire (OpenAPI / JSON Schema have no
    // dedicated `record` type — the convention is
    // `type: 'object'` + `additionalProperties` describing the value
    // shape). Override the internal `_type` here so consumers don't
    // see the non-standard `'record'` string.
    schema.type = 'object';

    // Records use additionalProperties to define the value schema
    schema.additionalProperties = this.__valueValidator.toOpenAPI();

    // If key validator has constraints (like pattern), add them
    const keySchema = this.__keyValidator.toOpenAPI();
    if (keySchema.pattern) {
      schema.propertyNames = { pattern: keySchema.pattern };
    }

    return schema;
  }

  //#endregion
}
