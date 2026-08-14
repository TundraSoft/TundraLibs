/**
 * @fileoverview `ObjectGuardian` — schema-driven object validator.
 * Default mode is `.strip()` (unknown keys silently dropped);
 * `.passthrough()` keeps them, `.strict()` rejects them. Supports
 * `.refine` / `.superRefine` for cross-field validation, `.pick` /
 * `.omit` / `.partial` / `.extend` for schema manipulation.
 *
 * @module
 */

import { type AsyncProbeTarget, BaseGuardian } from '../BaseGuardian.ts';
import { GuardianError } from '../errors/Base.ts';
import { gateAsyncStepResult } from '../helpers/mod.ts';
import type {
  FinishedGuardian,
  GuardianMetaData,
  GuardianTransform,
} from '../types/mod.ts';
import { EnumGuardian } from './EnumGuardian.ts';

/**
 * Keys that must never be copied verbatim onto a validated plain-object
 * result — assigning them as own properties is the classic
 * prototype-pollution vector (`__proto__` rewrites the prototype,
 * `constructor` / `prototype` shadow built-ins). They're dropped from
 * `passthrough` / `catchall` output rather than copied through.
 */
const PROTO_POLLUTION_KEYS: ReadonlySet<string> = new Set([
  '__proto__',
  'constructor',
  'prototype',
]);

/**
 * Helper type to infer the output type from any guardian-like value
 * (`BaseGuardian<U>` or the `FinishedGuardian<U>` returned by
 * `.optional()` / `.nullable()`).
 */
type InferGuardianType<T> = T extends BaseGuardian<infer U> ? U
  : T extends FinishedGuardian<infer U> ? U
  : never;

/**
 * Type utility to infer the proper object type from a schema
 * This handles optional fields correctly by checking if undefined is part of the Guardian's type
 */
type InferObjectType<T extends Record<string, FinishedGuardian<unknown>>> =
  & {
    [K in keyof T as undefined extends InferGuardianType<T[K]> ? never : K]:
      InferGuardianType<T[K]>;
  }
  & {
    [K in keyof T as undefined extends InferGuardianType<T[K]> ? K : never]?:
      Exclude<InferGuardianType<T[K]>, undefined>;
  };

/**
 * Type definition for object schema — maps property names to their
 * guardian validators. Accepts both raw `BaseGuardian` values and
 * `FinishedGuardian` results from `.optional()` / `.nullable()`.
 */
export type ObjectSchema<T = Record<string, unknown>> = {
  [K in keyof T]: FinishedGuardian<T[K]>;
};

/**
 * Validation mode for object validation
 */
export type ObjectValidationMode =
  | 'passthrough'
  | 'strict'
  | 'strip'
  | 'catchall';

/**
 * Type for refinement validation functions
 */
export type ObjectRefinement<T> = {
  validator: (data: T) => boolean | Promise<boolean>;
  message: string;
  path?: string;
};

/**
 * Guardian for object validation with flexible schema definition and validation modes.
 * Supports strict validation, passthrough mode, and shape transformation.
 *
 * @template TInput - The input object type before validation
 * @template TOutput - The output object type after validation and potential transformation
 *
 * @example
 * ```ts
 * import { Guardian } from '@tundralibs/guardian';
 *
 * // Basic object schema (strip mode by default)
 * const userSchema = Guardian.object({
 *   id: Guardian.number(),
 *   name: Guardian.string(),
 *   email: Guardian.string().optional()
 * });
 *
 * // Accepts: { id: 1, name: "John", email: "john@example.com", extra: "ignored" }
 * // Returns: { id: 1, name: "John", email: "john@example.com" }
 * //   — the unknown "extra" key is silently stripped. Use .passthrough()
 * //     to keep unknown keys, or .strict() to reject them.
 * ```
 *
 * @example
 * ```ts
 * import { Guardian } from '@tundralibs/guardian';
 *
 * // Strict mode - only defined properties allowed
 * const strictUser = Guardian.object({
 *   id: Guardian.number(),
 *   name: Guardian.string()
 * }).strict();
 *
 * // Accepts: { id: 1, name: "John" }
 * // Rejects: { id: 1, name: "John", extra: "not allowed" }
 * ```
 *
 * @example
 * ```ts
 * import { Guardian } from '@tundralibs/guardian';
 *
 * // Shape transformation
 * const transformedUser = Guardian.object({
 *   firstName: Guardian.string(),
 *   lastName: Guardian.string(),
 *   birthYear: Guardian.number()
 * }).transform((data) => ({
 *   fullName: `${data.firstName} ${data.lastName}`,
 *   age: new Date().getFullYear() - data.birthYear
 * }));
 * ```
 *
 * @example
 * ```ts
 * import { Guardian } from '@tundralibs/guardian';
 *
 * // Complex validation with refine
 * const registerSchema = Guardian.object({
 *   email: Guardian.string().email(),
 *   password: Guardian.string().minLength(8),
 *   confirmPassword: Guardian.string()
 * }).refine(
 *   (data) => data.password === data.confirmPassword,
 *   'Passwords do not match'
 * );
 * ```
 */
export class ObjectGuardian<
  TInput extends Record<string, unknown>,
  TOutput extends Record<string, unknown> = TInput,
> extends BaseGuardian<TOutput> {
  /** Emitted schema type. */
  protected override readonly _type = 'object';
  private readonly __schema: ObjectSchema<TInput>;

  /**
   * Returns the field-validator map (`{ fieldName: guardian }`) that
   * was passed at construction. Exposed for higher-order schema
   * utilities like {@link DiscriminatedUnionGuardian}, which needs to
   * read each branch's discriminator field at build time.
   *
   * The returned object is the live schema reference — do not mutate.
   */
  get schema(): Readonly<ObjectSchema<TInput>> {
    return this.__schema;
  }
  // `'strip'` is the default: properties not described by the schema
  // are silently dropped from the parsed output. This matches what
  // most callers expect when validating API request bodies — extra
  // keys from the client never leak onto the domain object. Use
  // `.passthrough()` if you need forward-compat wire protocols where
  // unknown fields should flow through, or `.strict()` to reject
  // them outright.
  private __mode: ObjectValidationMode = 'strip';
  /**
   * Guardian for unknown-key values when `__mode === 'catchall'`.
   * `undefined` for the other three modes. The mode setters
   * (`strict`/`strip`/`passthrough`) clear this; `catchall(g)` sets
   * both `__mode` and this in one go.
   */
  private __catchallGuard: FinishedGuardian<unknown> | undefined = undefined;
  /**
   * Precomputed cache of `Object.entries(this.__schema)`. Schemas are
   * effectively immutable per instance (every schema-manipulation
   * method — `extend`, `pick`, `omit`, `partial`, `required`,
   * `property` — returns a new `ObjectGuardian`), so we pay this
   * `Object.entries` cost once at construction instead of on every
   * parse. Walking the cached array is ~3-5× faster than
   * re-allocating + filling the entries on every call.
   */
  private readonly __schemaEntries: Array<[string, FinishedGuardian<unknown>]>;
  /**
   * Precomputed `new Set(Object.keys(this.__schema))` for strict-mode /
   * passthrough lookups. Same immutability story as `__schemaEntries`.
   */
  private readonly __schemaKeys: Set<string>;
  /**
   * True when any field guardian (or the catchall guardian) carries
   * an async step. When set, the object transform runs the
   * promise-awaiting validation path and the guardian flags itself
   * `isAsync` so `parse()` rejects and `parseAsync()` is required —
   * mirroring the top-level async contract. Without this, a nested
   * async validator would resolve to a pending Promise stored in the
   * field slot and silently bypass validation.
   */
  private __async: boolean = false;

  /**
   * Creates a new ObjectGuardian instance.
   *
   * @param schema - Object schema defining property validators (optional for anonymous objects)
   * @param metaData - Optional metadata for this guardian
   */
  constructor(schema?: ObjectSchema<TInput>, metaData?: GuardianMetaData) {
    // Use an arrow function to capture the proper 'this' context
    const objectTransform: GuardianTransform<unknown, TOutput> = (
      input: unknown,
    ) => {
      // Settle a still-provisional async verdict (an unresolved
      // `lazy()` field) before choosing the path — cheap boolean test
      // on every ordinary schema.
      if (this._asyncProbePending) this._refreshAsyncProbe();
      // Branch to the awaiting path when a child is async — otherwise
      // the sync path would store pending Promises in field slots.
      return (this.__async
        ? this.__validateObjectAsync(input)
        : this.__validateObjectWithoutRefinements(input)) as
          | TOutput
          | Promise<TOutput>;
    };

    super(objectTransform, metaData);
    this.__schema = schema || {} as ObjectSchema<TInput>;
    // Cache the entries and keys once. Subsequent parses skip the
    // `Object.entries` / `Object.keys` allocations entirely.
    this.__schemaEntries = Object.entries(this.__schema) as Array<
      [string, FinishedGuardian<unknown>]
    >;
    this.__schemaKeys = new Set(this.__schemaEntries.map(([k]) => k));
    // Detect async field guardians up front so nested async validation
    // is enforced rather than silently bypassed. Also honours an
    // inherited `isAsync` (e.g. copied from a source guardian by
    // `extend()` / `merge()` / `catchall()`) so the awaiting path stays
    // selected across schema-manipulation clones, and leaves the
    // verdict provisional when a field is a not-yet-resolvable
    // `lazy()` thunk. (A fresh async catchall is flagged
    // post-construction by `catchall()`.)
    this._initAsyncProbe();
  }

  /**
   * Fields (plus the catchall guardian) whose async-ness this object
   * inherits. Re-read whenever the verdict is provisional, so a
   * forward-referenced `lazy()` field settles before the first parse.
   *
   * @internal
   */
  protected override _asyncProbeChildren(): ReadonlyArray<
    AsyncProbeTarget | undefined
  > {
    const children: Array<AsyncProbeTarget | undefined> = this.__schemaEntries
      .map(([, g]) => g);
    if (this.__catchallGuard) children.push(this.__catchallGuard);
    return children;
  }

  /**
   * Flag this guardian (and its transform chain) as async. Sets the
   * `isAsync` metadata so `parse()` throws the standard "use
   * parseAsync()" error, `parseAsync()` takes the awaiting path, and
   * any subsequently chained `.refine()` / `.process()` composes
   * async-aware.
   *
   * @internal
   */
  protected override _markAsync(): void {
    this.__async = true;
    super._markAsync();
  }

  /**
   * Guard for every method that rebuilds this guardian from
   * `__schema` — the four mode setters (`strict` / `strip` /
   * `passthrough` / `catchall`) AND the schema-manipulation family
   * (`extend` / `pick` / `omit` / `partial` / `required` / `property` /
   * `merge` / `deepPartial` / `renameField`). All of them construct a
   * fresh transform from the schema alone and cannot carry
   * `_composedTransform` over, so any `.refine()` / `.superRefine()` /
   * `.transform()` / `.process()` step added BEFORE the call would be
   * silently dropped — quietly weakening validation (e.g.
   * `object({...}).refine(passwordsMatch).partial()` would accept data
   * violating the refinement). Refuse loudly instead; the idiomatic
   * fix is to derive / set the mode first, then chain.
   *
   * A step is present when the composed transform is no longer the base
   * schema transform (every chain step wraps a new function on top).
   *
   * @internal
   */
  private __assertModeBeforeChain(method: string): void {
    this._assertNoChainedSteps(method, 'schema');
  }

  // No `parse` / `parseAsync` overrides — refinements are now woven
  // into `_composedTransform` at their declaration position (via
  // `.refine()` → `process()`), so the base implementation runs the
  // entire chain in the right order without further coordination.

  //#region Validation Modes

  /**
   * Sets the validation mode to strict - allows only properties defined in the schema.
   * Extra properties in the input will cause validation to fail.
   *
   * @returns A new ObjectGuardian with the validation applied (the receiver is never mutated)
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * const strictUser = Guardian.object({
   *   id: Guardian.number(),
   *   name: Guardian.string()
   * }).strict();
   *
   * strictUser.parse({ id: 1, name: "John" }); // ✅ Valid
   * strictUser.parse({ id: 1, name: "John", age: 30 }); // ❌ Extra property 'age'
   * ```
   */
  strict(): this {
    return this.__withMode('strict');
  }

  /**
   * Sets the validation mode to strip - removes properties not defined in the schema.
   * Only validated properties will be present in the output.
   *
   * @returns A new ObjectGuardian with the validation applied (the receiver is never mutated)
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * const strippedUser = Guardian.object({
   *   id: Guardian.number(),
   *   name: Guardian.string()
   * }).strip();
   *
   * strippedUser.parse({ id: 1, name: "John", age: 30 });
   * // Returns: { id: 1, name: "John" } (age stripped)
   * ```
   */
  strip(): this {
    return this.__withMode('strip');
  }

  /**
   * Sets the validation mode to passthrough — properties not defined
   * in the schema are kept on the parsed output unchanged. This is
   * the opt-in for forward-compatible wire protocols where unknown
   * fields should flow through without validation.
   *
   * Default mode is `strip` (extra keys dropped). Use this method
   * when you explicitly want to preserve unknown fields.
   *
   * @returns A new ObjectGuardian with the validation applied (the receiver is never mutated)
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * const frame = Guardian.object({
   *   v: Guardian.number(),
   *   event: Guardian.string(),
   * }).passthrough();
   *
   * frame.parse({ v: 1, event: 'hi', extra: 'field' });
   * // Returns: { v: 1, event: 'hi', extra: 'field' }
   * ```
   */
  passthrough(): this {
    return this.__withMode('passthrough');
  }

  /**
   * Validate unknown keys against `guard` and keep the validated
   * values on the parsed output. The "fourth mode" — between `strip`
   * (drop extras) and `passthrough` (keep extras unvalidated):
   * extras are kept, but only if `guard` accepts them.
   *
   * Like the other mode setters, this clears any prior mode. Mode is
   * last-call-wins: `.passthrough().catchall(g)` ends in catchall,
   * `.catchall(g).strict()` ends in strict (and the guard is dropped).
   *
   * The output type widens to `TOutput & Record<string, U>` so known
   * fields keep their precise types while unknowns are typed by the
   * catchall guardian.
   *
   * @template U - The value type accepted by `guard`.
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * const Tagged = Guardian.object({
   *   v: Guardian.number(),
   *   event: Guardian.string(),
   * }).catchall(Guardian.string());
   *
   * Tagged.parse({ v: 1, event: 'hi', tag: 'foo' });
   * // → { v: 1, event: 'hi', tag: 'foo' }
   *
   * Tagged.parse({ v: 1, event: 'hi', tag: 42 });
   * // → throws — 'tag' is 42 (number), fails string check
   * ```
   */
  catchall<U>(
    guard: FinishedGuardian<U>,
  ): ObjectGuardian<TInput, TOutput & Record<string, U>> {
    this.__assertModeBeforeChain('catchall');
    const cloned = new ObjectGuardian<TInput, TOutput & Record<string, U>>(
      this.__schema,
      this._metaData ? { ...this._metaData } : undefined,
    );
    cloned.__mode = 'catchall';
    cloned.__catchallGuard = guard;
    // An async catchall guardian makes the whole object async — the
    // unknown-key values are validated through it on the awaiting
    // path. Re-run the probe now that the guard is attached so a
    // `lazy()` catchall is covered as well.
    cloned._initAsyncProbe();
    return cloned;
  }

  /**
   * Produce a fresh `ObjectGuardian` with the requested mode set.
   * Internal helper for the three mode-setters above; also clears
   * any prior catchall guardian (the fourth mode owns its setter).
   *
   * Deliberately does **not** copy `this._composedTransform`. The
   * constructor builds an `objectTransform` closure that captures the
   * new instance's `this` lexically; copying the parent's transform
   * would carry over a closure bound to the parent and therefore read
   * the parent's `__mode` at parse time — defeating the mode flip.
   *
   * Chain steps added via `.refine()` / `.process()` etc. before a
   * mode change are therefore not preserved across the mode flip.
   * Idiomatic usage sets the mode first, then chains, so this rarely
   * matters in practice.
   *
   * @internal
   */
  private __withMode(
    mode: 'strict' | 'strip' | 'passthrough',
  ): this {
    this.__assertModeBeforeChain(mode);
    const cloned = new ObjectGuardian<TInput, TOutput>(
      this.__schema,
      this._metaData ? { ...this._metaData } : undefined,
    );
    cloned.__mode = mode;
    // `__catchallGuard` is intentionally left undefined — flipping into
    // strict/strip/passthrough clears the catchall.
    return cloned as this;
  }

  //#endregion

  //#region Key Validations

  /**
   * Validates that the object contains all the specified keys with defined values.
   * This validation runs after successful schema validation and checks
   * that all specified keys are present and have non-undefined values.
   *
   * @param keys - Array of keys that must be present in the object
   * @param message - Optional custom error message
   * @returns A new ObjectGuardian with the validation applied (the receiver is never mutated)
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * const requiredFieldsUser = Guardian.object({
   *   id: Guardian.number().optional(),
   *   name: Guardian.string().optional(),
   *   email: Guardian.string().optional()
   * }).hasKeys(['id', 'name']);
   *
   * // Accepts: { id: 1, name: "John", email: "john@example.com" }
   * // Accepts: { id: 1, name: "John" }
   * // Rejects: { id: 1 } - missing 'name'
   * ```
   */
  hasKeys(
    keys: Array<string>,
    message?: string,
  ): this {
    return this.refine(
      (data) => {
        // Check if keys have defined values (not just undefined)
        const missingKeys = keys.filter((key) => {
          return !(key in data) || data[key] === undefined;
        });

        return missingKeys.length === 0;
      },
      message ?? `Object must contain all required keys: ${keys.join(', ')}`,
    );
  }

  /**
   * Validates that the object does not contain any of the specified keys.
   *
   * @param keys - Array of keys that must not be present in the object
   * @param message - Optional custom error message
   * @returns A new ObjectGuardian with the validation applied (the receiver is never mutated)
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * const safeUser = Guardian.object({
   *   id: Guardian.number(),
   *   name: Guardian.string(),
   *   email: Guardian.string()
   * }).forbiddenKeys(['password', 'secret']);
   *
   * // Accepts: { id: 1, name: "John", email: "john@example.com" }
   * // Rejects: { id: 1, name: "John", password: "secret123" }
   * ```
   */
  forbiddenKeys(
    keys: Array<string>,
    message?: string,
  ): this {
    return this.refine(
      (data) => {
        const objectKeys = Object.keys(data);
        return !keys.some((key) => objectKeys.includes(key));
      },
      message ??
        `Object must not contain forbidden keys: ${keys.join(', ')}`,
    );
  }

  //#endregion

  //#region Schema Manipulation

  /**
   * Extends the current schema with additional properties.
   *
   * @template U - Type of the properties to add
   * @param schema - Additional schema properties
   * @returns New ObjectGuardian with extended schema
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * const baseUser = Guardian.object({
   *   id: Guardian.number(),
   *   name: Guardian.string()
   * });
   *
   * const extendedUser = baseUser.extend({
   *   email: Guardian.string().email(),
   *   age: Guardian.number().optional()
   * });
   * ```
   */
  extend<U extends Record<string, unknown>>(
    schema: ObjectSchema<U>,
  ): ObjectGuardian<TInput & U, TInput & U> {
    this.__assertModeBeforeChain('extend');
    const extendedSchema = { ...this.__schema, ...schema } as ObjectSchema<
      TInput & U
    >;

    const newGuardian = new ObjectGuardian<TInput & U, TInput & U>(
      extendedSchema,
      this._metaData,
    );

    // Copy ObjectGuardian-specific properties
    newGuardian.__mode = this.__mode;
    newGuardian.__catchallGuard = this.__catchallGuard;

    // Don't copy _composedTransform - the constructor creates the correct one
    // that references the new extendedSchema

    return newGuardian;
  }

  /**
   * Creates a new ObjectGuardian with only the specified properties.
   *
   * @template K - Keys to pick from the schema
   * @param keys - Property names to include
   * @returns New ObjectGuardian with picked properties
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * const fullUser = Guardian.object({
   *   id: Guardian.number(),
   *   name: Guardian.string(),
   *   email: Guardian.string(),
   *   password: Guardian.string()
   * });
   *
   * const publicUser = fullUser.pick('id', 'name', 'email');
   * ```
   */
  pick<K extends keyof TInput>(
    ...keys: K[]
  ): ObjectGuardian<Pick<TInput, K>, Pick<TInput, K>> {
    this.__assertModeBeforeChain('pick');
    const pickedSchema = {} as ObjectSchema<Pick<TInput, K>>;

    for (const key of keys) {
      if (key in this.__schema) {
        pickedSchema[key] = this.__schema[key];
      }
    }

    const newGuardian = new ObjectGuardian<Pick<TInput, K>, Pick<TInput, K>>(
      pickedSchema,
      this._metaData,
    );

    // Copy ObjectGuardian-specific properties
    newGuardian.__mode = this.__mode;
    newGuardian.__catchallGuard = this.__catchallGuard;

    // Don't copy _composedTransform - the constructor creates the correct one
    // that references the new pickedSchema

    return newGuardian;
  }

  /**
   * Creates a new ObjectGuardian without the specified properties.
   *
   * @template K - Keys to omit from the schema
   * @param keys - Property names to exclude
   * @returns New ObjectGuardian without omitted properties
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * const fullUser = Guardian.object({
   *   id: Guardian.number(),
   *   name: Guardian.string(),
   *   email: Guardian.string(),
   *   password: Guardian.string()
   * });
   *
   * const safeUser = fullUser.omit('password');
   * ```
   */
  omit<K extends keyof TInput>(
    ...keys: K[]
  ): ObjectGuardian<Omit<TInput, K>, Omit<TInput, K>> {
    this.__assertModeBeforeChain('omit');
    const omittedSchema = { ...this.__schema } as ObjectSchema<Omit<TInput, K>>;

    for (const key of keys) {
      delete (omittedSchema as Record<string, unknown>)[key as string];
    }

    const newGuardian = new ObjectGuardian<Omit<TInput, K>, Omit<TInput, K>>(
      omittedSchema,
      this._metaData,
    );

    // Copy ObjectGuardian-specific properties
    newGuardian.__mode = this.__mode;
    newGuardian.__catchallGuard = this.__catchallGuard;

    // Don't copy _composedTransform - the constructor creates the correct one
    // that references the new omittedSchema

    return newGuardian;
  }

  /**
   * Makes all properties in the schema optional.
   *
   * @returns New ObjectGuardian with all properties optional
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * const user = Guardian.object({
   *   id: Guardian.number(),
   *   name: Guardian.string(),
   *   email: Guardian.string()
   * });
   *
   * const partialUser = user.partial();
   * // All properties become optional
   * ```
   */
  partial(): ObjectGuardian<Partial<TInput>, Partial<TInput>> {
    this.__assertModeBeforeChain('partial');
    const partialSchema = {} as ObjectSchema<Partial<TInput>>;

    for (const [key, guard] of Object.entries(this.__schema)) {
      // Clone the guard first to avoid mutating the original schema
      (partialSchema as Record<string, FinishedGuardian<unknown>>)[key] = guard
        .clone()
        .optional();
    }

    const newGuardian = new ObjectGuardian<Partial<TInput>, Partial<TInput>>(
      partialSchema,
      this._metaData,
    );

    // Copy ObjectGuardian-specific properties
    newGuardian.__mode = this.__mode;
    newGuardian.__catchallGuard = this.__catchallGuard;

    // Don't copy _composedTransform - the constructor creates the correct one
    // that references the new partialSchema

    return newGuardian;
  }

  /**
   * Makes all properties in the schema required (removes optional).
   *
   * @returns New ObjectGuardian with all properties required
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * const user = Guardian.object({
   *   id: Guardian.number().optional(),
   *   name: Guardian.string().optional(),
   *   email: Guardian.string()
   * });
   *
   * const requiredUser = user.required();
   * // All properties become required
   * ```
   */
  required(): ObjectGuardian<Required<TInput>, Required<TInput>> {
    this.__assertModeBeforeChain('required');
    const requiredSchema = {} as ObjectSchema<Required<TInput>>;

    for (const [key, guard] of Object.entries(this.__schema)) {
      // Clone the guard first to avoid mutating the original schema
      const requiredGuard = guard.clone();
      // Remove optional flag from the cloned guard to make it required
      if (requiredGuard._metaData) {
        requiredGuard._metaData.isOptional = false;
      }
      (requiredSchema as Record<string, FinishedGuardian<unknown>>)[key] =
        requiredGuard;
    }

    const newGuardian = new ObjectGuardian<Required<TInput>, Required<TInput>>(
      requiredSchema,
      this._metaData,
    );

    // Copy ObjectGuardian-specific properties
    newGuardian.__mode = this.__mode;
    newGuardian.__catchallGuard = this.__catchallGuard;

    // Don't copy _composedTransform - the constructor creates the correct one
    // that references the new requiredSchema

    return newGuardian;
  }

  /**
   * Adds a new property to the schema.
   *
   * @template K - Key name for the new property
   * @template V - Type of the new property value
   * @param key - Property name
   * @param guard - Guardian for validating the property
   * @returns New ObjectGuardian with added property
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * const baseUser = Guardian.object({
   *   id: Guardian.number(),
   *   name: Guardian.string()
   * });
   *
   * const userWithEmail = baseUser.property('email', Guardian.string().email());
   * ```
   */
  property<K extends string, V>(
    key: K,
    guard: FinishedGuardian<V>,
  ): ObjectGuardian<TInput & Record<K, V>, TInput & Record<K, V>> {
    this.__assertModeBeforeChain('property');
    const newSchema = { ...this.__schema, [key]: guard } as ObjectSchema<
      TInput & Record<K, V>
    >;

    const newGuardian = new ObjectGuardian<
      TInput & Record<K, V>,
      TInput & Record<K, V>
    >(
      newSchema,
      this._metaData,
    );

    // Copy ObjectGuardian-specific properties
    newGuardian.__mode = this.__mode;
    newGuardian.__catchallGuard = this.__catchallGuard;

    // Don't copy _composedTransform - the constructor creates the correct one
    // that references the new schema

    return newGuardian;
  }

  /**
   * Read-only access to the field-validator map. Mirrors Zod's
   * `.shape` accessor — `UserSchema.shape.email` reads naturally and
   * is convenient when composing schemas. Equivalent to {@link schema}.
   */
  get shape(): Readonly<ObjectSchema<TInput>> {
    return this.__schema;
  }

  /**
   * Merge another `ObjectGuardian`'s schema on top of this one,
   * preferring the **other**'s field guardian when both define the
   * same key. Compare with {@link extend}, which keeps the second
   * operand's value on key collisions but is meant for adding
   * brand-new fields; `merge` advertises overwrite-on-conflict in its
   * name.
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * const BaseUser  = Guardian.object({ id: Guardian.string(), name: Guardian.string() });
   * const Audited   = Guardian.object({ createdAt: Guardian.date(), updatedAt: Guardian.date() });
   * const AuditedUser = BaseUser.merge(Audited);
   * // type AuditedUser = { id, name, createdAt, updatedAt }
   * ```
   */
  merge<U extends Record<string, unknown>>(
    other: ObjectGuardian<U>,
  ): ObjectGuardian<TInput & U, TInput & U> {
    this.__assertModeBeforeChain('merge');
    const mergedSchema = {
      ...this.__schema,
      ...other.schema,
    } as ObjectSchema<TInput & U>;
    const newGuardian = new ObjectGuardian<TInput & U, TInput & U>(
      mergedSchema,
      this._metaData,
    );
    newGuardian.__mode = this.__mode;
    newGuardian.__catchallGuard = this.__catchallGuard;
    return newGuardian;
  }

  /**
   * Recursive {@link partial}: every nested `ObjectGuardian` also has
   * its fields turned optional. Useful for `PATCH` payload schemas
   * where nested objects are themselves partial updates.
   *
   * Only `ObjectGuardian` children recurse — `ArrayGuardian` /
   * primitive / enum fields just become `optional()` (same as `partial`).
   */
  deepPartial(): ObjectGuardian<Partial<TInput>, Partial<TInput>> {
    this.__assertModeBeforeChain('deepPartial');
    const partialSchema = {} as ObjectSchema<Partial<TInput>>;
    for (const [key, guard] of Object.entries(this.__schema)) {
      const inner = guard instanceof ObjectGuardian
        ? guard.deepPartial()
        : guard.clone();
      (partialSchema as Record<string, FinishedGuardian<unknown>>)[key] = inner
        .optional();
    }
    const newGuardian = new ObjectGuardian<Partial<TInput>, Partial<TInput>>(
      partialSchema,
      this._metaData,
    );
    newGuardian.__mode = this.__mode;
    newGuardian.__catchallGuard = this.__catchallGuard;
    return newGuardian;
  }

  /**
   * Returns an `EnumGuardian` over the schema's key names — mirrors
   * TypeScript's `keyof`. Convenient for fields whose value must be
   * one of another schema's keys (e.g. discriminator strings, sort
   * columns, permission tags).
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * const User = Guardian.object({ id: Guardian.string(), email: Guardian.string() });
   * const SortBy = User.keyOf();
   * SortBy.parse('email');  // ok
   * SortBy.parse('age');    // throws
   * ```
   */
  keyOf(): EnumGuardian<keyof TInput & string> {
    const keys = Object.keys(this.__schema) as Array<keyof TInput & string>;
    return new EnumGuardian<keyof TInput & string>(keys);
  }

  /**
   * Inverse of {@link extend} — strips fields from this schema that
   * are present in `other`. Useful for "everything in `Audit` minus
   * what `Public` already has" patterns.
   */
  exclude<K extends keyof TInput>(
    other: ObjectGuardian<Pick<TInput, K>>,
  ): ObjectGuardian<Omit<TInput, K>, Omit<TInput, K>> {
    const keysToExclude = Object.keys(other.schema) as K[];
    return this.omit(...keysToExclude);
  }

  /**
   * Rename a single field. Returns a new ObjectGuardian whose schema
   * has `from` removed and `to` added (validated by the original
   * `from` guard), and whose parsed output remaps the value
   * accordingly.
   */
  renameField<F extends keyof TInput, To extends string>(
    from: F,
    to: To,
  ): ObjectGuardian<
    Omit<TInput, F> & Record<To, TInput[F]>,
    Omit<TInput, F> & Record<To, TInput[F]>
  > {
    this.__assertModeBeforeChain('renameField');
    if (!(from in this.__schema)) {
      throw new Error(`renameField: '${String(from)}' is not in the schema`);
    }
    type Out = Omit<TInput, F> & Record<To, TInput[F]>;
    const sourceGuard = this.__schema[from];
    const { [from]: _omitted, ...rest } = this.__schema;
    const newSchema = {
      ...rest,
      [to]: sourceGuard,
    } as unknown as ObjectSchema<Out>;
    const newGuardian = new ObjectGuardian<Out, Out>(newSchema, this._metaData);
    newGuardian.__mode = this.__mode;
    newGuardian.__catchallGuard = this.__catchallGuard;
    // Pre-parse step: the input still arrives keyed on `from`, but the
    // new schema is keyed on `to`. Remap the key BEFORE the schema runs
    // — validating first (against `to`) would strip/reject the `from`
    // value and the rename would never take effect. Renaming is
    // unconditional: the source value lands in the destination slot,
    // replacing any value that already occupied `to` (a `from`/`to`
    // collision is a caller error). When `from` is absent from the
    // input (e.g. an optional field left out) the input passes through
    // untouched so the `to` guard sees the same absence.
    const fromKey = from as string;
    const validate = newGuardian._composedTransform;
    newGuardian._composedTransform = (input: unknown) => {
      if (
        input !== null && typeof input === 'object' && !Array.isArray(input) &&
        Object.prototype.hasOwnProperty.call(input, fromKey)
      ) {
        const remapped = { ...(input as Record<string, unknown>) };
        if (to !== fromKey) {
          remapped[to] = remapped[fromKey];
          delete remapped[fromKey];
        }
        return validate(remapped);
      }
      return validate(input);
    };
    return newGuardian;
  }

  //#endregion

  //#region Transformation

  /**
   * Applies a transformation to the validated data.
   *
   * @template TNewOutput - The type after transformation
   * @param transformer - Function to transform the validated data
   * @param description - Optional description of the transformation
   * @returns New ObjectGuardian with transformation applied
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * const userTransform = Guardian.object({
   *   firstName: Guardian.string(),
   *   lastName: Guardian.string(),
   *   birthYear: Guardian.number()
   * }).transform((data) => ({
   *   fullName: `${data.firstName} ${data.lastName}`,
   *   age: new Date().getFullYear() - data.birthYear
   * }));
   * ```
   */
  transform<TNewOutput extends Record<string, unknown>>(
    transformer: (data: TOutput) => TNewOutput,
    __description?: string,
  ): ObjectGuardian<TInput, TNewOutput> {
    // Use the standard BaseGuardian.process method for transformation
    const transformedGuardian = this.process(transformer);

    // The result is already a BaseGuardian with TNewOutput type,
    // but we need to return it as an ObjectGuardian with schema intact
    const result = new ObjectGuardian<TInput, TNewOutput>(
      this.__schema,
      transformedGuardian.metaData,
    );

    // Copy ObjectGuardian-specific properties. The catchall guardian
    // must travel with the mode — copying `__mode = 'catchall'` while
    // leaving `__catchallGuard` undefined leaves the result in an
    // inconsistent state (introspection like `toOpenAPI()` then emits
    // `additionalProperties: false` instead of the catchall schema, and
    // any later re-chaining loses the guard entirely).
    result.__mode = this.__mode;
    result.__catchallGuard = this.__catchallGuard;

    // Copy the composed transform from the transformed guardian
    (result as unknown as {
      _composedTransform: GuardianTransform<unknown, TNewOutput>;
    })._composedTransform = (transformedGuardian as unknown as {
      _composedTransform: GuardianTransform<unknown, TNewOutput>;
    })._composedTransform;

    return result;
  }

  //#endregion

  //#region Refinement

  // `.refine` is inherited from `BaseGuardian` — the implementation
  // there does the same thing this override used to do (wrap the
  // predicate, weave into `_composedTransform`, propagate async-ness).

  /**
   * Adds multiple refinements at once using superRefine.
   * This is useful when you need to apply multiple complex validations.
   *
   * @param refinements - Array of refinement objects
   * @returns New ObjectGuardian with all refinements added
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * const complexSchema = Guardian.object({
   *   email: Guardian.string().email(),
   *   password: Guardian.string(),
   *   confirmPassword: Guardian.string(),
   *   age: Guardian.number()
   * }).superRefine([
   *   {
   *     validator: (data) => data.password === data.confirmPassword,
   *     message: 'Passwords must match',
   *     path: 'confirmPassword'
   *   },
   *   {
   *     validator: (data) => data.age >= 13,
   *     message: 'Must be at least 13 years old',
   *     path: 'age'
   *   }
   * ]);
   * ```
   */

  superRefine(
    refinements: Array<ObjectRefinement<TOutput>>,
  ): this {
    // Single chain step that runs all refinements and accumulates
    // failures, vs `.refine()` which adds N sequential throw-on-fail
    // steps. Use `superRefine` when you want every failing refinement
    // surfaced in one error (e.g. forms where you want to flag all
    // the bad fields at once). The step runs at its declaration
    // position in the chain.
    const checks = refinements.map((r) => ({ ...r }));
    const hasAsync = checks.some((r) =>
      (r.validator as { constructor?: { name?: string } }).constructor
        ?.name === 'AsyncFunction'
    );

    const accumulator = (data: TOutput): TOutput | Promise<TOutput> => {
      if (!hasAsync) {
        const failures = this.__collectRefinementFailuresSync(checks, data);
        return this.__aggregateRefinementFailures(failures, data);
      }
      return this.__collectRefinementFailuresAsync(checks, data).then((f) =>
        // `__aggregateRefinementFailures` returns `data` unchanged when
        // every async predicate passes. Returning it straight out of this
        // native `.then` would let promise adoption destroy a thenable-
        // shaped object (a passthrough/catchall result carrying a `then`
        // key), so gate it at the shared choke point instead.
        gateAsyncStepResult(this.__aggregateRefinementFailures(f, data))
      );
    };

    const result = this.process(accumulator) as ObjectGuardian<TInput, TOutput>;
    if (hasAsync) {
      result._metaData ??= {};
      result._metaData.isAsync = true;
    }
    return result as this;
  }

  //#endregion

  //#region Private Methods

  /**
   * Core object validation logic without refinements.
   * This is used by the base transform and handles only schema validation.
   */
  private __validateObjectType(input: unknown): Record<string, unknown> {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      let got: string;
      if (typeof input === 'object') {
        got = input === null ? 'null' : 'array';
      } else {
        got = typeof input;
      }
      throw new GuardianError(`Expected object but got ${got}`, {
        expected: 'object',
        got,
        comparison: 'type',
        type: 'object',
      });
    }
    return input as Record<string, unknown>;
  }

  /**
   * Strict-mode gate: reject the input outright when it carries keys
   * the schema doesn't describe. A no-op in every other mode, and it
   * runs before per-field validation, so an unknown key wins over a
   * field-level failure.
   *
   * @throws {GuardianError} When extra keys are present in strict mode.
   *
   * @internal
   */
  private __validateStrictMode(
    inputObj: Record<string, unknown>,
    schemaKeys: Set<string>,
  ): void {
    if (this.__mode !== 'strict') return;

    const extraKeys = Object.keys(inputObj).filter((key) =>
      !schemaKeys.has(key)
    );
    if (extraKeys.length > 0) {
      throw new GuardianError(
        `Unknown ${extraKeys.length === 1 ? 'property' : 'properties'} '${
          extraKeys.join(', ')
        }' ${extraKeys.length === 1 ? 'is' : 'are'} not allowed in strict mode`,
        {
          expected: 'no extra properties',
          got: extraKeys,
          comparison: 'strict_validation',
          type: 'unknown_property',
        },
      );
    }
  }

  /**
   * Decide what to do with a field whose input value is `undefined`,
   * based on the guard's `isOptional` metadata. Returns `'skip'` to
   * drop the field from the output, `'parse'` to fall through to the
   * normal `guard.parse(undefined)` path (the field's own type
   * validator handles the rejection), or throws an explicit error
   * when the field was explicitly marked required (`isOptional: false`
   * via `required()` after `optional()`).
   */
  private __handleUndefinedField(
    key: string,
    guard: FinishedGuardian<unknown>,
    keyPresent: boolean,
  ): 'skip' | 'parse' {
    const isOptional = guard.metaData?.isOptional;
    if (isOptional === true) {
      // Optional WITH a declared default: a missing key must still
      // run the optional handler so the default fills — otherwise
      // `.optional('x')` would silently never fire for absent keys
      // (the common case; nobody passes explicit undefined). Optional
      // WITHOUT a default keeps the historical behavior: missing →
      // drop from output; explicit undefined → handler returns
      // undefined.
      if (guard.metaData?.hasDefault === true) return 'parse';
      return keyPresent ? 'parse' : 'skip';
    }
    if (isOptional === false) {
      // Explicit required (e.g. `.optional()` followed by `required()`)
      // — the underlying transform still has the optional wrapper baked
      // in and would silently return undefined, so reject here.
      throw new GuardianError(
        `Required field '${key}' is missing or undefined`,
        {
          expected: 'defined value',
          got: undefined,
          comparison: 'required',
          type: 'missing_property',
        },
      );
    }
    // `isOptional === undefined` (never made optional) — fall through
    // and let the field's own type validator reject undefined.
    return 'parse';
  }

  /**
   * Run every declared field's guardian. Failures are **collected**,
   * not thrown, so one parse reports every bad field at once.
   *
   * @returns `[validatedFields, errorsByKey]`. Each error already has
   *   its key prepended to the path.
   *
   * @internal
   */
  private __validateSchemaProperties(
    inputObj: Record<string, unknown>,
  ): [Record<string, unknown>, Record<string, GuardianError>] {
    const result: Record<string, unknown> = {};
    const errors: Record<string, GuardianError> = {};

    // Walk the cached entries — see `__schemaEntries` declaration for why.
    // We call `guard._composedTransform(value)` directly rather than
    // `guard.parse(value)` to skip parse()'s per-field
    // try/catch + isAsync check on the hot path. The outer try/catch
    // here already wraps thrown `GuardianError`s, and async fields are
    // caught at chain-build time on the parent.
    for (const [key, guard] of this.__schemaEntries) {
      try {
        const value = inputObj[key];
        if (value === undefined) {
          const action = this.__handleUndefinedField(
            key,
            guard,
            key in inputObj,
          );
          if (action === 'skip') continue;
        }
        result[key] =
          (guard as unknown as { _composedTransform(v: unknown): unknown })
            ._composedTransform(value);
      } catch (error) {
        if (error instanceof GuardianError) {
          error.prependPath(key);
          errors[key] = error;
        } else {
          errors[key] = new GuardianError(
            `Validation failed for property '${key}': ${error}`,
            {
              expected: 'valid value',
              got: inputObj[key],
              comparison: 'property_validation',
              type: 'object_property',
              path: [key],
            },
          );
        }
      }
    }

    return [result, errors];
  }

  /**
   * Passthrough mode: copy unknown keys onto the result unvalidated.
   * A no-op in every other mode. Prototype-pollution keys are dropped
   * rather than copied — see `PROTO_POLLUTION_KEYS`.
   *
   * @internal
   */
  private __addPassthroughProperties(
    result: Record<string, unknown>,
    inputObj: Record<string, unknown>,
    schemaKeys: Set<string>,
  ): void {
    if (this.__mode !== 'passthrough') return;

    for (const [key, value] of Object.entries(inputObj)) {
      // Never pass prototype-pollution keys through verbatim — see
      // PROTO_POLLUTION_KEYS.
      if (PROTO_POLLUTION_KEYS.has(key)) continue;
      if (!schemaKeys.has(key)) {
        result[key] = value;
      }
    }
  }

  /**
   * Catchall mode: validate each unknown key against `__catchallGuard`
   * and copy the validated value into the result. Failures aggregate
   * into the same per-key `errors` map used by the known-field loop,
   * so the final `__throwIfErrors` envelope surfaces both kinds of
   * failure in one shot.
   *
   * Uses the direct `_composedTransform` call (same fast-path trick
   * as the schema loop) to skip per-key try/catch + isAsync overhead.
   */
  private __validateCatchallProperties(
    result: Record<string, unknown>,
    inputObj: Record<string, unknown>,
    schemaKeys: Set<string>,
    errors: Record<string, GuardianError>,
  ): void {
    if (this.__mode !== 'catchall' || !this.__catchallGuard) return;

    const catchallTransform = (this.__catchallGuard as unknown as {
      _composedTransform(v: unknown): unknown;
    })._composedTransform;
    for (const [key, value] of Object.entries(inputObj)) {
      if (schemaKeys.has(key)) continue;
      // Never copy prototype-pollution keys onto the result, even if
      // they'd validate — see PROTO_POLLUTION_KEYS.
      if (PROTO_POLLUTION_KEYS.has(key)) continue;
      try {
        result[key] = catchallTransform(value);
      } catch (error) {
        if (error instanceof GuardianError) {
          error.prependPath(key);
          errors[key] = error;
        } else {
          errors[key] = new GuardianError(
            `Catchall validation failed for property '${key}': ${error}`,
            {
              expected: 'valid catchall value',
              got: value,
              comparison: 'catchall_validation',
              type: 'object_property',
              path: [key],
            },
          );
        }
      }
    }
  }

  /**
   * Wrap the collected per-key failures in one envelope error whose
   * `cause` map holds them all, and throw it. Returns quietly when
   * `errors` is empty.
   *
   * @throws {GuardianError} When `errors` is non-empty.
   *
   * @internal
   */
  private __throwIfErrors(
    errors: Record<string, GuardianError>,
    input: unknown,
  ): void {
    if (Object.keys(errors).length === 0) return;

    const errorCount = Object.keys(errors).length;
    const mainError = new GuardianError(
      `Object validation failed with ${errorCount} error(s)`,
      {
        expected: 'valid object',
        got: input,
        comparison: 'object_validation',
        type: 'object',
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
   * The synchronous object pipeline in call order: type check, strict
   * gate, declared fields, passthrough / catchall keys, then throw the
   * aggregated envelope. Refinements run after this, on the composed
   * chain.
   *
   * @throws {GuardianError} When the input is not a plain object, when
   *   strict mode sees an unknown key, or when any field failed.
   *
   * @internal
   */
  private __validateObjectWithoutRefinements(
    input: unknown,
  ): TInput | (TInput & Record<string, unknown>) {
    // Type validation
    const inputObj = this.__validateObjectType(input);

    // Strict mode validation against the precomputed key set.
    this.__validateStrictMode(inputObj, this.__schemaKeys);

    // Validate schema properties
    const [result, errors] = this.__validateSchemaProperties(inputObj);

    // Handle passthrough properties (mode === 'passthrough')
    this.__addPassthroughProperties(result, inputObj, this.__schemaKeys);

    // Handle catchall properties (mode === 'catchall'). Failures
    // accumulate into the same `errors` map so `__throwIfErrors`
    // surfaces known-field and catchall failures in one envelope.
    this.__validateCatchallProperties(
      result,
      inputObj,
      this.__schemaKeys,
      errors,
    );

    // Throw validation errors if any
    this.__throwIfErrors(errors, input);

    return result as TInput | (TInput & Record<string, unknown>);
  }

  /**
   * Async sibling of {@link __validateObjectWithoutRefinements}. Used
   * when a field (or the catchall) guardian carries an async step: each
   * field's transform may return a Promise, which is awaited here so
   * the field slot holds the resolved value — and a rejecting async
   * validator surfaces as that field's error rather than a silently
   * stored pending Promise. Semantics (strict/passthrough/catchall,
   * per-field error aggregation, path prefixing) mirror the sync path.
   */
  private async __validateObjectAsync(
    input: unknown,
  ): Promise<TInput | (TInput & Record<string, unknown>)> {
    const inputObj = this.__validateObjectType(input);
    this.__validateStrictMode(inputObj, this.__schemaKeys);

    const result: Record<string, unknown> = {};
    const errors: Record<string, GuardianError> = {};

    for (const [key, guard] of this.__schemaEntries) {
      try {
        const value = inputObj[key];
        if (value === undefined) {
          const action = this.__handleUndefinedField(
            key,
            guard,
            key in inputObj,
          );
          if (action === 'skip') continue;
        }
        const out =
          (guard as unknown as { _composedTransform(v: unknown): unknown })
            ._composedTransform(value);
        // Only a real Promise is a leaked async step to await; a
        // non-Promise thenable-shaped VALUE (e.g. a field whose value
        // carries a callable `then`) would be ADOPTED and silently
        // destroyed by `await`, so refuse it loudly at this per-field
        // adoption point rather than letting promise resolution eat it.
        result[key] = out instanceof Promise
          ? await out
          : gateAsyncStepResult(out);
      } catch (error) {
        if (error instanceof GuardianError) {
          error.prependPath(key);
          errors[key] = error;
        } else {
          errors[key] = new GuardianError(
            `Validation failed for property '${key}': ${error}`,
            {
              expected: 'valid value',
              got: inputObj[key],
              comparison: 'property_validation',
              type: 'object_property',
              path: [key],
            },
          );
        }
      }
    }

    this.__addPassthroughProperties(result, inputObj, this.__schemaKeys);
    await this.__validateCatchallPropertiesAsync(
      result,
      inputObj,
      this.__schemaKeys,
      errors,
    );

    this.__throwIfErrors(errors, input);

    // Gate the result before this native `async` method returns it: in
    // passthrough/catchall mode `result` carries user-supplied keys, and
    // a `then` key makes it thenable-shaped. Returning a thenable out of
    // a native async function lets the ECMAScript promise resolution
    // procedure ADOPT (and silently destroy) it BEFORE parseAsync's
    // top-level guard runs — so refuse it here, at the same choke point
    // (`gateAsyncStepResult`) every other async step boundary uses.
    return gateAsyncStepResult(result) as
      | TInput
      | (TInput & Record<string, unknown>);
  }

  /**
   * Async sibling of {@link __validateCatchallProperties}. Awaits each
   * unknown-key value validated through the (async) catchall guardian.
   */
  private async __validateCatchallPropertiesAsync(
    result: Record<string, unknown>,
    inputObj: Record<string, unknown>,
    schemaKeys: Set<string>,
    errors: Record<string, GuardianError>,
  ): Promise<void> {
    if (this.__mode !== 'catchall' || !this.__catchallGuard) return;

    const catchallTransform = (this.__catchallGuard as unknown as {
      _composedTransform(v: unknown): unknown;
    })._composedTransform;
    for (const [key, value] of Object.entries(inputObj)) {
      if (schemaKeys.has(key)) continue;
      if (PROTO_POLLUTION_KEYS.has(key)) continue;
      try {
        const out = catchallTransform(value);
        // Only a real Promise is a leaked async step to await; a
        // non-Promise thenable-shaped VALUE (e.g. a field whose value
        // carries a callable `then`) would be ADOPTED and silently
        // destroyed by `await`, so refuse it loudly at this per-field
        // adoption point rather than letting promise resolution eat it.
        result[key] = out instanceof Promise
          ? await out
          : gateAsyncStepResult(out);
      } catch (error) {
        if (error instanceof GuardianError) {
          error.prependPath(key);
          errors[key] = error;
        } else {
          errors[key] = new GuardianError(
            `Catchall validation failed for property '${key}': ${error}`,
            {
              expected: 'valid catchall value',
              got: value,
              comparison: 'catchall_validation',
              type: 'object_property',
              path: [key],
            },
          );
        }
      }
    }
  }

  /**
   * Build a refinement-failure record for a single failed predicate.
   * Kept as a method (not inlined in the accumulators) so the Sonar-
   * flagged cognitive complexity of the loop stays bounded.
   */
  private __makeRefinementFailure(
    refinement: ObjectRefinement<TOutput>,
    data: TOutput,
  ): { path: string | undefined; error: GuardianError } {
    return {
      path: refinement.path,
      error: new GuardianError(refinement.message, {
        expected: 'refinement validation to pass',
        got: data,
        comparison: 'refinement_validation',
        type: 'refinement_failure',
        // Carry the declared path on the leaf itself so `leafErrors()`
        // reports the failing field, mirroring `refine()`'s
        // `makeRefineError`. The aggregate keys its cause map by the
        // same path.
        ...(refinement.path !== undefined ? { path: [refinement.path] } : {}),
      }),
    };
  }

  /**
   * Wrap a non-`GuardianError` thrown by a user-supplied validator
   * into one. These are programmer errors (validator threw rather
   * than returned false) and bubble immediately rather than
   * accumulate.
   */
  private __wrapValidatorThrow(err: unknown, data: TOutput): GuardianError {
    if (err instanceof GuardianError) return err;
    return new GuardianError(`Refinement validation failed: ${err}`, {
      expected: 'refinement validation to complete',
      got: data,
      comparison: 'refinement_validation',
      type: 'refinement_error',
    });
  }

  /**
   * Run a list of refinement checks synchronously and collect every
   * predicate that returned `false`. Throws on a programmer error
   * (validator threw, or an async validator slipped into the sync
   * path).
   */
  private __collectRefinementFailuresSync(
    checks: ReadonlyArray<ObjectRefinement<TOutput>>,
    data: TOutput,
  ): Array<{ path: string | undefined; error: GuardianError }> {
    const failures: Array<{ path: string | undefined; error: GuardianError }> =
      [];
    for (const r of checks) {
      let isValid: boolean | Promise<boolean>;
      try {
        isValid = r.validator(data);
      } catch (err) {
        throw this.__wrapValidatorThrow(err, data);
      }
      if (isValid instanceof Promise) {
        throw new GuardianError(
          'Cannot use parse() with async refinement. Use parseAsync().',
          {
            expected: 'synchronous validation',
            got: 'async refinement',
            comparison: 'refinement_validation',
            type: 'async_validation',
          },
        );
      }
      if (!isValid) failures.push(this.__makeRefinementFailure(r, data));
    }
    return failures;
  }

  /**
   * Async sibling of {@link __collectRefinementFailuresSync}. Awaits
   * each predicate and otherwise applies the same semantics.
   */
  private async __collectRefinementFailuresAsync(
    checks: ReadonlyArray<ObjectRefinement<TOutput>>,
    data: TOutput,
  ): Promise<Array<{ path: string | undefined; error: GuardianError }>> {
    const failures: Array<{ path: string | undefined; error: GuardianError }> =
      [];
    for (const r of checks) {
      try {
        const isValid = await r.validator(data);
        if (!isValid) failures.push(this.__makeRefinementFailure(r, data));
      } catch (err) {
        throw this.__wrapValidatorThrow(err, data);
      }
    }
    return failures;
  }

  /**
   * Shared aggregator used by `.superRefine([...])`. Given the list
   * of failures collected by the accumulator step, return `data`
   * unchanged when there are none, throw the only error directly
   * when there's one, or throw an aggregate `GuardianError` carrying
   * each failure as a path-keyed cause when there are several.
   *
   * The aggregate's `.message` joins the per-refinement messages so
   * substring matching keeps working; `.context.cause` holds them
   * keyed by their declared path (or `refinement_N` if no path).
   */
  private __aggregateRefinementFailures(
    failures: Array<{ path: string | undefined; error: GuardianError }>,
    data: TOutput,
  ): TOutput {
    if (failures.length === 0) return data;
    if (failures.length === 1) {
      const only = failures[0]!;
      // No declared path: nothing to key a cause on — throw the failure
      // as-is (its message is the refinement message).
      if (!only.path) throw only.error;
      // Declared path: mirror the multi-failure branch — throw a
      // DISTINCT parent that carries the failure as a child cause keyed
      // by its path. The previous code did `only.error.addCause(path,
      // only.error)`, making the error its OWN cause; `leafErrors()`
      // then hit the cycle guard and yielded nothing.
      const parent = new GuardianError(only.error.message, {
        expected: 'all refinements to pass',
        got: data,
        comparison: 'refinement_validation',
        type: 'refinement_failure',
      });
      parent.addCause(only.path, only.error);
      throw parent;
    }
    const joined = failures.map((f) => f.error.message).join('; ');
    const aggregate = new GuardianError(
      `${failures.length} refinement error(s): ${joined}`,
      {
        expected: 'all refinements to pass',
        got: data,
        comparison: 'refinement_validation',
        type: 'refinement_failure',
      },
    );
    for (let i = 0; i < failures.length; i++) {
      const f = failures[i]!;
      aggregate.addCause(f.path ?? `refinement_${i}`, f.error);
    }
    throw aggregate;
  }

  /**
   * Clone with a fresh schema-only transform. We intentionally do
   * NOT preserve the live `_composedTransform` here — that transform
   * is a closure over the original instance's `this`, so mode flips
   * applied after cloning (`.strict()` / `.passthrough()`) would
   * read the original's mode through the captured closure rather
   * than the clone's.
   *
   * This means `.refine().clone()` returns an unrefined clone — the
   * refinement is baked into `_composedTransform` and is lost
   * along with it. Existing chained-step paths (`.refine()` /
   * `.process()` / etc.) on an immutable guardian go through
   * `this.process(fn)`, which calls `clone()` and then *immediately*
   * overwrites the clone's transform with a freshly composed one —
   * so those flows are unaffected. Only direct `.clone()` calls
   * after `.refine()` drop the refinement.
   */
  protected override _cloneWith(
    transform: GuardianTransform<unknown, TOutput>,
    metaData: GuardianMetaData | undefined,
  ): this {
    const cloned = new ObjectGuardian<TInput, TOutput>(this.__schema, metaData);
    cloned._composedTransform = transform;
    cloned.__mode = this.__mode;
    cloned.__catchallGuard = this.__catchallGuard;
    // Carry the base-transform reference so the "was a step chained on
    // top?" tell survives cloning: `describe()` / `clone()` copy the
    // parent's (possibly already-wrapped) `_composedTransform` onto a
    // fresh instance whose own base differs, which would otherwise read
    // as chained. Comparing against the ORIGINAL base keeps a mode
    // change after `.refine().describe()` refused, and after a plain
    // `.describe()` allowed.
    cloned._baseTransform = this._baseTransform;
    return cloned as this;
  }

  //#endregion

  //#region OpenAPI Generation

  /**
   * Generates OpenAPI schema for object with properties, required fields, and validation mode.
   *
   * @returns OpenAPI schema object
   */
  override toOpenAPI(): Record<string, unknown> {
    const schema = super.toOpenAPI();

    // If schema is defined, generate properties
    if (this.__schema && Object.keys(this.__schema).length > 0) {
      const properties: Record<string, unknown> = {};
      const required: string[] = [];

      for (const [key, guardian] of Object.entries(this.__schema)) {
        properties[key] = guardian.toOpenAPI();

        // Check if property is required (not optional)
        if (!guardian.metaData?.isOptional) {
          required.push(key);
        }
      }

      schema.properties = properties;

      if (required.length > 0) {
        schema.required = required;
      }

      // `additionalProperties` carries the mode-specific contract:
      //   - strict / strip → `false` (no extras allowed / extras dropped)
      //   - passthrough    → `true`  (extras kept, unvalidated)
      //   - catchall       → the catchall guardian's own schema
      //     (extras kept, validated against that schema). This is the
      //     idiomatic JSON Schema / OpenAPI usage of the field.
      if (this.__mode === 'catchall' && this.__catchallGuard) {
        schema.additionalProperties = this.__catchallGuard.toOpenAPI();
      } else {
        schema.additionalProperties = this.__mode === 'passthrough';
      }
    } else if (this.__mode === 'catchall' && this.__catchallGuard) {
      // No schema defined — extras go through the catchall guardian.
      schema.additionalProperties = this.__catchallGuard.toOpenAPI();
    } else {
      // No schema defined and no catchall — allow any properties.
      schema.additionalProperties = true;
    }

    return schema;
  }

  //#endregion
}
