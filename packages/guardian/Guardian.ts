/**
 * @fileoverview Guardian — entry point for the validation library.
 * Static factories (`Guardian.string()`, `Guardian.object({...})`, …)
 * build validators; type aliases under the merged `Guardian` namespace
 * (`Guardian.infer`, `Guardian.inferInput`) extract output / input
 * types from a built schema.
 *
 * @module
 */

import {
  ArrayGuardian,
  BigIntGuardian,
  BooleanGuardian,
  DateGuardian,
  DiscriminatedUnionGuardian,
  EnumGuardian,
  LazyGuardian,
  MapGuardian,
  NumberGuardian,
  ObjectGuardian,
  RecordGuardian,
  SetGuardian,
  StringGuardian,
  TupleGuardian,
  UnknownGuardian,
} from './guards/mod.ts';
import { BaseGuardian } from './BaseGuardian.ts';
import type {
  FinishedGuardian,
  GuardianInfer,
  GuardianInferInput,
  GuardianMetaData,
} from './types/mod.ts';

// Both `BaseGuardian<U>` and the `FinishedGuardian<U>` returned by
// `.optional()` / `.nullable()` should be assignable into schema
// positions — otherwise the most common pattern
// `Guardian.object({ name: Guardian.string().optional() })` would
// stop compiling. `FinishedGuardian` is a structural supertype of
// `BaseGuardian` (BaseGuardian formally `implements` it), so we
// constrain to it everywhere and BaseGuardian values still satisfy.
// Two-step extract: try the nominal class match first (cheaper +
// preserves type parameters for concrete subclasses like
// `StringGuardian`), fall back to structural `FinishedGuardian`
// match for finishers returned by `.optional()` / `.nullable()`.
type InferGuardianType<T> = T extends BaseGuardian<infer U> ? U
  : T extends FinishedGuardian<infer U> ? U
  : never;
type InferObjectType<T extends Record<string, FinishedGuardian<unknown>>> =
  & {
    [K in keyof T as undefined extends InferGuardianType<T[K]> ? never : K]:
      InferGuardianType<T[K]>;
  }
  & {
    [K in keyof T as undefined extends InferGuardianType<T[K]> ? K : never]?:
      Exclude<InferGuardianType<T[K]>, undefined>;
  };
import { GuardianError } from './errors/Base.ts';

/**
 * Static factories for building validators. The five primitives
 * (`string`, `number`, `boolean`, `date`, `bigint`) coerce inputs to
 * their declared type — useful at API / DB / form-data boundaries
 * where everything arrives as strings. Use the composition factories
 * (`object`, `array`, `tuple`, `record`, `oneOf`, `discriminatedUnion`)
 * to build structured schemas.
 *
 * @example
 * ```ts
 * import { Guardian } from '@tundralibs/guardian';
 *
 * declare const requestBody: unknown;
 *
 * const User = Guardian.object({
 *   id:    Guardian.number().integer().positive(),
 *   name:  Guardian.string().minLength(1),
 *   email: Guardian.string().email().optional(),
 * });
 *
 * type User = Guardian.infer<typeof User>;
 * const u = User.parse(requestBody);
 * ```
 *
 * @see {@link BaseGuardian} for methods inherited by every guardian
 * @see {@link FinishedGuardian} for the type returned after `.optional()` / `.nullable()`
 */
export class Guardian {
  /**
   * Runtime utility to get the type information from a guardian.
   * Useful for debugging and runtime type introspection.
   *
   * @param guardian - Guardian instance to inspect
   * @returns Type information string
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * const schema = Guardian.string().minLength(3);
   * const typeInfo = Guardian.type(schema); // "StringGuardian"
   * ```
   */
  static type(guardian: BaseGuardian<unknown>): string {
    return guardian.constructor.name;
  }
  /**
   * Creates a string validator.
   *
   * @param metaData - Optional metadata for the validator
   * @returns New StringGuardian instance
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * const schema = Guardian.string()
   *   .minLength(3)
   *   .maxLength(50)
   *   .pattern(/^[a-zA-Z]+$/);
   *
   * const result = schema.parse('hello'); // 'hello'
   * ```
   */
  static string(metaData?: GuardianMetaData): StringGuardian {
    return new StringGuardian(undefined, metaData);
  }

  /**
   * Creates a number validator.
   *
   * @param metaData - Optional metadata for the validator
   * @returns New NumberGuardian instance
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * const schema = Guardian.number()
   *   .positive()
   *   .integer()
   *   .max(100);
   *
   * const result = schema.parse(42); // 42
   * ```
   */
  static number(metaData?: GuardianMetaData): NumberGuardian {
    return new NumberGuardian(undefined, metaData);
  }

  /**
   * Creates a validator that accepts values matching any of the provided guardians.
   * Tries each guardian in order and returns the result from the first successful validation.
   * The error message is mandatory to clearly communicate what types are expected.
   *
   * @template T - Readonly array of guardian types for union validation
   * @param guardians - Array of guardians to try in order
   * @param errorMessage - Mandatory error message describing what types are expected
   * @param metaData - Optional metadata for the validator
   * @returns New UnknownGuardian with oneOf validation logic
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * const userIdOrEmail = Guardian.oneOf([
   *   Guardian.number().positive().integer(),
   *   Guardian.string().pattern(/^[^@]+@[^@]+$/)
   * ], 'UserId or Email is required');
   *
   * userIdOrEmail.parse(123); // 123
   * userIdOrEmail.parse('user@example.com'); // 'user@example.com'
   * userIdOrEmail.parse('invalid'); // throws GuardianError: UserId or Email is required
   * ```
   */
  static oneOf<T extends readonly FinishedGuardian<unknown>[]>(
    guardians: T,
    errorMessage: string,
    metaData?: GuardianMetaData,
  ): UnknownGuardian<InferGuardianType<T[number]>> {
    if (!guardians || guardians.length === 0) {
      throw new Error('oneOf requires at least one guardian');
    }
    if (!errorMessage || errorMessage.trim().length === 0) {
      throw new Error('oneOf requires a non-empty error message');
    }

    // Detect async members up front. A member whose chain contains an
    // async step throws "Cannot use parse()..." from sync `parse()`,
    // which would otherwise be swallowed as a failed option — so the
    // async branch could never match. When any member is async we build
    // an async-function process callback; `process()` detects the
    // `AsyncFunction` and flips the whole chain to async-aware, making
    // `parseAsync` the (mandatory) entry point.
    const hasAsyncMember = guardians.some((g) => g?.metaData?.isAsync === true);

    const buildFailure = (
      input: unknown,
      errors: GuardianError[],
    ): GuardianError =>
      new GuardianError(errorMessage, {
        got: input,
        expected: 'value matching one of the oneOf types',
        comparison: 'oneOf',
        type: 'oneOf_validation',
        cause: errors.reduce((acc, error, index) => {
          acc[`option_${index}`] = error;
          return acc;
        }, {} as Record<string, GuardianError>),
      });

    const toGuardianError = (
      error: unknown,
      index: number,
      input: unknown,
    ): GuardianError =>
      error instanceof GuardianError ? error : new GuardianError(
        `Guardian ${index} threw unexpected error`,
        {
          got: input,
          expected: 'valid input for one of the oneOf members',
          comparison: 'oneOf',
          type: 'oneOf_validation',
        },
      );

    if (hasAsyncMember) {
      // Identity base transform (NOT the default, which rejects
      // null/undefined) so the try-each-member loop sees the raw input:
      // a nullable/optional member must get a chance to match null /
      // undefined, and the caller's mandatory error message must be the
      // one that surfaces when nothing matches.
      return new UnknownGuardian((input: unknown) => input, metaData).process(
        // Async so `process()` marks the chain async; sync members take
        // `parseAsync`'s fast path, async members are genuinely awaited.
        async (input: unknown) => {
          const errors: GuardianError[] = [];
          for (let i = 0; i < guardians.length; i++) {
            const guardian = guardians[i];
            if (!guardian) continue;
            try {
              return await guardian.parseAsync(input);
            } catch (error) {
              errors.push(toGuardianError(error, i, input));
            }
          }
          throw buildFailure(input, errors);
        },
      ) as UnknownGuardian<InferGuardianType<T[number]>>;
    }

    // Identity base transform (NOT the default, which rejects
    // null/undefined) so the try-each-member loop sees the raw input —
    // a nullable/optional member can then match null / undefined, and
    // the caller's mandatory error message surfaces when nothing does.
    return new UnknownGuardian((input: unknown) => input, metaData).process(
      (input: unknown) => {
        const errors: GuardianError[] = [];

        // Try each guardian in order
        for (let i = 0; i < guardians.length; i++) {
          const guardian = guardians[i];
          if (!guardian) continue;

          try {
            return guardian.parse(input);
          } catch (error) {
            errors.push(toGuardianError(error, i, input));
          }
        }

        // If we get here, none of the guardians succeeded
        throw buildFailure(input, errors);
      },
    ) as UnknownGuardian<InferGuardianType<T[number]>>;
  }

  /**
   * Creates an array validator with optional element validation.
   *
   * @template T - The element type of the array (defaults to unknown)
   * @param elementGuardian - Optional guardian to validate each array element
   * @param metaData - Optional metadata for the validator
   * @returns New ArrayGuardian instance
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * // Array of unknown elements
   * const anyArray = Guardian.array().minLength(1);
   * anyArray.parse([1, 'hello', true]); // [1, 'hello', true]
   *
   * // Array with typed elements
   * const stringArray = Guardian.array(Guardian.string().minLength(3))
   *   .minLength(1)
   *   .maxLength(10);
   * stringArray.parse(['hello', 'world']); // ['hello', 'world']
   * ```
   */
  static array<T = unknown>(
    elementGuardian?: FinishedGuardian<T>,
    metaData?: GuardianMetaData,
  ): ArrayGuardian<T> {
    return new ArrayGuardian<T>(
      elementGuardian as BaseGuardian<T> | undefined,
      metaData,
    );
  }

  /**
   * Creates an unknown guardian that accepts any value without validation.
   *
   * @template T - The expected type (defaults to unknown)
   * @param metaData - Optional metadata for the guardian
   * @returns A new UnknownGuardian instance
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * const anyValue = Guardian.unknown();
   * anyValue.parse('hello'); // 'hello'
   * anyValue.parse(42); // 42
   * anyValue.parse(null); // null
   * anyValue.parse({ foo: 'bar' }); // { foo: 'bar' }
   *
   * // With transformations
   * const stringified = Guardian.unknown().toStringValue();
   * stringified.parse({ name: 'John' }); // '{"name":"John"}'
   * ```
   */
  static unknown<T = unknown>(metaData?: GuardianMetaData): UnknownGuardian<T> {
    return new UnknownGuardian<T>(undefined, metaData);
  }

  /**
   * Creates a boolean validator.
   *
   * @param metaData - Optional metadata for the validator
   * @returns New BooleanGuardian instance
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * const schema = Guardian.boolean().true();
   * const result = schema.parse(true); // true
   * ```
   */
  static boolean(metaData?: GuardianMetaData): BooleanGuardian {
    return new BooleanGuardian(undefined, metaData);
  }

  /**
   * Creates a date validator.
   *
   * @param metaData - Optional metadata for the validator
   * @returns New DateGuardian instance
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * const schema = Guardian.date()
   *   .min(new Date('2020-01-01'))
   *   .max(new Date('2030-12-31'));
   * const result = schema.parse(new Date()); // current date
   * ```
   */
  static date(metaData?: GuardianMetaData): DateGuardian {
    return new DateGuardian(undefined, metaData);
  }

  /**
   * Creates a BigInt validator.
   *
   * @param metaData - Optional metadata for the validator
   * @returns New BigIntGuardian instance
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * const schema = Guardian.bigint().positive().min(0n);
   * const result = schema.parse(42n); // 42n
   * ```
   */
  static bigint(metaData?: GuardianMetaData): BigIntGuardian {
    return new BigIntGuardian(undefined, metaData);
  }

  /**
   * Creates an enum validator that accepts only values from the provided list.
   * This is the preferred way to handle literal values and enums.
   *
   * @template T - The enum/literal value type
   * @param allowedValues - Readonly array of allowed enum values or literals
   * @param metaData - Optional metadata for the validator
   * @returns New EnumGuardian instance
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * // TypeScript enum
   * enum Color { Red = 'red', Green = 'green', Blue = 'blue' }
   * const colorSchema = Guardian.enum(Object.values(Color));
   * colorSchema.parse('red'); // 'red'
   *
   * // String literals
   * const statusSchema = Guardian.enum(['pending', 'approved', 'rejected'] as const);
   * statusSchema.parse('pending'); // 'pending'
   *
   * // Number literals
   * const prioritySchema = Guardian.enum([1, 2, 3, 4, 5] as const);
   * prioritySchema.parse(3); // 3
   * ```
   */
  static enum<T>(
    allowedValues: readonly T[],
    metaData?: GuardianMetaData,
  ): EnumGuardian<T> {
    return new EnumGuardian(allowedValues, metaData);
  }

  /**
   * Creates a guardian that accepts exactly one literal value. Sugar
   * for `Guardian.enum([value])` — narrower to write and read for the
   * single-value case (API version markers, discriminator tags, etc.).
   *
   * @template T - The literal value type (string, number, boolean, etc.)
   * @param value - The single allowed value.
   * @param metaData - Optional metadata for the validator.
   * @returns New EnumGuardian instance permitting only `value`.
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * const v1 = Guardian.literal('v1');
   * v1.parse('v1');   // 'v1'
   * v1.parse('v2');   // throws
   *
   * // The standard discriminated-union pattern:
   * const circle = Guardian.object({
   *   kind: Guardian.literal('circle'),
   *   radius: Guardian.number(),
   * });
   * ```
   */
  static literal<const T>(
    value: T,
    metaData?: GuardianMetaData,
  ): EnumGuardian<T> {
    return new EnumGuardian([value] as const, metaData);
  }

  /**
   * Creates an object validator with optional schema definition.
   * Supports strict validation, passthrough mode, and shape transformation.
   *
   * @template T - The object type defined by the schema (defaults to Record<string, unknown>)
   * @param schema - Optional object schema defining property validators
   * @param metaData - Optional metadata for the validator
   * @returns New ObjectGuardian instance
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * // Defined schema (strip mode by default — unknown keys are dropped)
   * const userSchema = Guardian.object({
   *   id: Guardian.number(),
   *   name: Guardian.string(),
   *   email: Guardian.string().optional()
   * });
   *
   * // Strict mode - only defined properties allowed
   * const strictUser = Guardian.object({
   *   id: Guardian.number(),
   *   name: Guardian.string()
   * }).strict();
   *
   * // Anonymous object - accepts any object, but strips every key
   * // unless .passthrough() / .catchall() is chained
   * const anyObject = Guardian.object();
   * ```
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * // Shape transformation
   * const transformedUser = Guardian.object({
   *   firstName: Guardian.string(),
   *   lastName: Guardian.string()
   * }).transform((data) => ({
   *   fullName: `${data.firstName} ${data.lastName}`
   * }));
   * ```
   */
  static object<T extends Record<string, FinishedGuardian<unknown>>>(
    schema: T,
    metaData?: GuardianMetaData,
  ): ObjectGuardian<InferObjectType<T>>;
  /**
   * Creates an anonymous object validator: any object passes the type
   * gate (arrays, `null` and non-objects are rejected), typed
   * `Record<string, unknown>`.
   *
   * **It strips every key.** With no schema to describe them, the
   * default `strip` mode drops all properties and yields `{}`. Chain
   * `.passthrough()` to keep them, or `.catchall(guard)` to keep and
   * validate them.
   *
   * @param metaData - Optional metadata for the validator.
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * Guardian.object().parse({ a: 1 });                 // {}
   * Guardian.object().passthrough().parse({ a: 1 });   // { a: 1 }
   * ```
   */
  static object(
    schema?: undefined,
    metaData?: GuardianMetaData,
  ): ObjectGuardian<Record<string, unknown>>;
  static object<T extends Record<string, FinishedGuardian<unknown>>>(
    schema?: T,
    metaData?: GuardianMetaData,
  ) {
    return new ObjectGuardian(schema, metaData);
  }

  /**
   * Creates a record validator for objects with arbitrary key-value pairs.
   *
   * **One-arg form** — `Record<string, V>`. The 99% case.
   * **Two-arg form** — pass an explicit key guardian for pattern-
   * validated or numeric keys (`Record<NumberLike, V>` etc.).
   *
   * @template K - The type of the keys (string or number)
   * @template V - The type of the values
   * @param keyOrValue - Either the value guardian (1-arg) or the key
   *   guardian (2-arg).
   * @param valueValidator - Value guardian when using the 2-arg form.
   * @param metaData - Optional metadata for the validator
   * @returns New RecordGuardian instance
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * // 1-arg form — Record<string, number>
   * const metrics = Guardian.record(Guardian.number());
   * metrics.parse({ uptimeSec: 60, errorCount: 0 }); // ✅
   *
   * // 2-arg form — pattern-validated keys
   * const envVars = Guardian.record(
   *   Guardian.string().pattern(/^[A-Z_]+$/),
   *   Guardian.string(),
   * );
   * envVars.parse({ API_KEY: 'abc', DB_HOST: 'localhost' }); // ✅
   * ```
   */
  static record<V>(
    valueValidator: BaseGuardian<V>,
    metaData?: GuardianMetaData,
  ): RecordGuardian<string, V>;
  /**
   * Creates a record validator with an explicit key guardian — for
   * pattern-constrained or numeric keys. See the one-argument overload
   * for the plain `Record<string, V>` case.
   *
   * @template K - Key type, taken from the key guardian's output.
   * @template V - Value type.
   * @param keyValidator - Runs against every key. Keys always arrive as
   *   strings, so a numeric key type relies on the guardian's coercion.
   * @param valueValidator - Runs against every value.
   * @param metaData - Optional metadata for the validator.
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * const envVars = Guardian.record(
   *   Guardian.string().pattern(/^[A-Z_]+$/),
   *   Guardian.string(),
   * );
   * envVars.parse({ API_KEY: 'abc' }); // { API_KEY: 'abc' }
   * ```
   */
  static record<K extends string | number, V>(
    keyValidator: BaseGuardian<K>,
    valueValidator: BaseGuardian<V>,
    metaData?: GuardianMetaData,
  ): RecordGuardian<K, V>;
  static record<K extends string | number, V>(
    keyOrValue: BaseGuardian<K> | BaseGuardian<V>,
    valueOrMeta?: BaseGuardian<V> | GuardianMetaData,
    maybeMeta?: GuardianMetaData,
  ): RecordGuardian<K, V> | RecordGuardian<string, V> {
    // 1-arg form: `keyOrValue` is the value guardian; default the key
    // to `Guardian.string()`. 2-arg form: pass through unchanged.
    if (
      valueOrMeta === undefined ||
      !(valueOrMeta instanceof BaseGuardian)
    ) {
      const defaultKey = new StringGuardian();
      return new RecordGuardian(
        defaultKey,
        keyOrValue as BaseGuardian<V>,
        valueOrMeta,
      );
    }
    return new RecordGuardian(
      keyOrValue as BaseGuardian<K>,
      valueOrMeta,
      maybeMeta,
    );
  }

  /**
   * Creates a length-pinned, position-typed array validator.
   *
   * Unlike `Guardian.array(...)` (which validates homogeneous element
   * types and infers `T[]`), `Guardian.tuple([...])` preserves
   * positions and infers `[T1, T2, ...]`. Use this for wire shapes
   * where position carries meaning — coordinate pairs, ranges,
   * fixed-arity records.
   *
   * @template T - Readonly tuple of element guardians.
   * @param guardians - Tuple of element guardians.
   * @param metaData - Optional metadata for the validator.
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * const missedSeqRange = Guardian.tuple([
   *   Guardian.number().integer().min(0),
   *   Guardian.number().integer().min(0),
   * ]);
   * // Type: [number, number]
   * const v = missedSeqRange.parse([10, 20]);
   * ```
   */
  static tuple<T extends readonly FinishedGuardian<unknown>[]>(
    // `readonly [...T]` (spread form) forces TS to infer `T` as a
    // tuple type instead of widening to `BaseGuardian<U>[]`, which
    // is what makes `[number, number]` come out at the call site
    // instead of `(number | number)[]`.
    guardians: readonly [...T],
    metaData?: GuardianMetaData,
  ): TupleGuardian<T> {
    return new TupleGuardian(guardians, metaData);
  }

  /**
   * Creates a discriminated-union validator: a tagged union of
   * object schemas where one field (the discriminator) selects the
   * variant. Unlike {@link oneOf}, dispatch is O(1) — a lookup map
   * is built at construction.
   *
   * Each branch must be an `ObjectGuardian` whose discriminator
   * field is an `EnumGuardian` (typically `Guardian.literal(value)`).
   * Branches may match multiple discriminator values by using
   * multi-value enums; two branches sharing the same discriminator
   * value is a construction-time error.
   *
   * @template K - The discriminator field name.
   * @template T - Tuple of branch object guardians.
   * @param discriminator - The name of the field whose value selects the variant.
   * @param members - The branches of the union.
   * @param errorMessage - Optional override for the "not an object" /
   *   "unknown discriminator" errors.
   * @param metaData - Optional metadata for the validator.
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * const Shape = Guardian.discriminatedUnion('kind', [
   *   Guardian.object({
   *     kind: Guardian.literal('circle'),
   *     radius: Guardian.number(),
   *   }),
   *   Guardian.object({
   *     kind: Guardian.literal('square'),
   *     side: Guardian.number(),
   *   }),
   * ]);
   *
   * const out = Shape.parse({ kind: 'circle', radius: 5 });
   * if (out.kind === 'circle') out.radius;  // narrows correctly
   * ```
   *
   * @example Multi-value discriminator (aliases route to the same branch)
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * const Rect = Guardian.object({
   *   kind: Guardian.enum(['square', 'rect'] as const),
   *   side: Guardian.number(),
   * });
   * const Shape = Guardian.discriminatedUnion('kind', [Rect]);
   * Shape.parse({ kind: 'square', side: 1 }); // OK
   * Shape.parse({ kind: 'rect',   side: 1 }); // OK — same branch
   * ```
   */
  static discriminatedUnion<
    K extends string,
    // deno-lint-ignore no-explicit-any
    T extends readonly ObjectGuardian<any>[],
  >(
    discriminator: K,
    members: readonly [...T],
    errorMessage?: string,
    metaData?: GuardianMetaData,
  ): DiscriminatedUnionGuardian<K, T> {
    return new DiscriminatedUnionGuardian(
      discriminator,
      members,
      errorMessage,
      metaData,
    );
  }

  /**
   * Defer schema resolution to parse time, so a schema can reference
   * itself. The canonical use case is **recursive types**: trees,
   * linked lists, JSON-like nested values.
   *
   * The `thunk` is invoked once, cached, and reused on subsequent
   * parses. It closes over the surrounding `const` binding, so it
   * sees the final schema value even though the binding wasn't
   * assigned yet at the moment `lazy(() => ...)` was constructed.
   *
   * Schema emit handles self-recursion by inlining a JSON-Schema
   * `{ $ref: '#' }` placeholder on the second visit — see
   * {@link LazyGuardian.toJSONSchema}. Set a title via `.describe(...)`
   * if you want a more readable identifier in generated docs.
   *
   * @template T - The output type of the resolved guardian.
   *
   * @example
   * ```ts
   * import { BaseGuardian, Guardian } from '@tundralibs/guardian';
   *
   * type Node = { value: number; next: Node | null };
   *
   * const NodeSchema: BaseGuardian<Node> = Guardian.object({
   *   value: Guardian.number(),
   *   next: Guardian.lazy(() => NodeSchema).nullable(),
   * });
   *
   * NodeSchema.parse({ value: 1, next: { value: 2, next: null } });
   * ```
   */
  static lazy<T>(
    thunk: () => FinishedGuardian<T>,
    metaData?: GuardianMetaData,
  ): LazyGuardian<T> {
    return new LazyGuardian(thunk, metaData);
  }

  /**
   * Compose two guardians into one that requires the input to satisfy
   * **both** — TypeScript's `A & B`. Useful for combining independent
   * schemas (e.g. "must be a valid `User` AND a valid `Auditable`")
   * without restructuring either source.
   *
   * Semantics: `a` runs first, then `b`. When **both** produce plain
   * objects (not arrays / null), the results are merged via spread
   * with `b`'s keys winning on conflict — matches `extend()` /
   * `merge()` semantics for objects. For non-object intersections,
   * `b`'s output is returned (the second schema's transforms are the
   * final word). Use `.refine(...)` if you need a custom merge rule.
   *
   * Schema emit produces `allOf: [a, b]`, the standard JSON Schema /
   * OpenAPI keyword for intersection.
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * const Identified = Guardian.object({ id: Guardian.string() });
   * const Named = Guardian.object({ name: Guardian.string() });
   * const Person = Guardian.intersection(Identified, Named);
   *
   * Person.parse({ id: 'u1', name: 'Ada' }); // { id: 'u1', name: 'Ada' }
   * ```
   */
  static intersection<A, B>(
    a: FinishedGuardian<A>,
    b: FinishedGuardian<B>,
    metaData?: GuardianMetaData,
  ): BaseGuardian<A & B> {
    const aTransform = (a as unknown as {
      _composedTransform(v: unknown): A | Promise<A>;
    })._composedTransform;
    const bTransform = (b as unknown as {
      _composedTransform(v: unknown): B | Promise<B>;
    })._composedTransform;
    // Merge both operand outputs: spread-merge when both are plain
    // objects (b wins on key conflict), otherwise return b's output.
    const merge = (aResult: A, bResult: B): A & B => {
      if (
        typeof aResult === 'object' && aResult !== null &&
        !Array.isArray(aResult) &&
        typeof bResult === 'object' && bResult !== null &&
        !Array.isArray(bResult)
      ) {
        return { ...aResult, ...bResult };
      }
      // Non-object intersection: return `b`'s output. Meaningful
      // intersection of two unrelated primitives doesn't exist; for
      // refinement-style "must satisfy both string predicates" use
      // a chained `.process()` instead.
      return bResult as unknown as A & B;
    };
    // If either operand carries an async step, run both transforms on
    // the awaiting path — otherwise `aTransform` / `bTransform` return
    // Promises and spreading them yields `{}` (or a raw pending Promise
    // for the non-object branch), silently bypassing validation.
    const isAsync = a.metaData?.isAsync === true ||
      b.metaData?.isAsync === true;
    const transform: (input: unknown) => (A & B) | Promise<A & B> = isAsync
      ? async (input: unknown) =>
        merge(await aTransform(input), await bTransform(input))
      : (input: unknown) =>
        merge(aTransform(input) as A, bTransform(input) as B);
    const nextMetaData: GuardianMetaData = {
      ...metaData,
      ...(isAsync ? { isAsync: true } : {}),
    };
    // Tag schema emit with allOf for downstream codegen. Stored in
    // metadata (not patched onto the instance) so the override survives
    // `.describe()` / `.optional()` / `.clone()` — every chain op
    // reconstructs the instance and would drop an own-property patch,
    // collapsing the emitted `allOf`. The current doc metadata
    // (title / description) is layered on by UnknownGuardian's emit.
    const guard = new UnknownGuardian<A & B>(transform, {
      ...nextMetaData,
      schemaEmit: {
        openAPI: () => ({ allOf: [a.toOpenAPI(), b.toOpenAPI()] }),
        jsonSchema: () => ({
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          allOf: [
            // Strip the inner `$schema` headers — only the outermost has one.
            (() => {
              const { $schema: _drop, ...rest } = a.toJSONSchema();
              return rest;
            })(),
            (() => {
              const { $schema: _drop, ...rest } = b.toJSONSchema();
              return rest;
            })(),
          ],
        }),
      },
    });
    return guard;
  }

  /**
   * Pre-validation transform. Runs `fn(input)` first, then feeds the
   * result into `schema`. The **only** way to reshape raw wire input
   * before the schema's type check / coercion runs.
   *
   * Distinct from `.process(fn)`, which extends the chain **after**
   * the schema validates. Use `preprocess` when you need to:
   *
   * - Normalise raw input (trim strings, lowercase emails, parse JSON
   *   embedded in a wire string).
   * - Bridge across types (Buffer → base64 string; `'null'` sentinel
   *   → real `null`).
   * - Apply custom coercion the built-in coercers don't cover.
   *
   * Async `fn` is detected via `AsyncFunction.name` (matches the
   * existing `.process()` detection) and marks the chain async — use
   * `parseAsync` from then on. Errors thrown by `fn` are wrapped as
   * `GuardianError` with `comparison: 'preprocess'`; errors from the
   * inner schema bubble through unchanged.
   *
   * `.optional()` / `.nullable()` chained on the result short-circuit
   * on `undefined`/`null` **before** preprocess runs — they wrap the
   * combined transform, matching existing finisher semantics.
   * Sentinel-to-undefined sentinel translation is therefore not
   * supported in this position; do it explicitly upstream if needed.
   *
   * Schema emit (`toOpenAPI` / `toJSONSchema` / `toMarkdown`)
   * delegates to the inner schema — preprocess is runtime-only.
   *
   * @template T - Output type of `schema`.
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * const Trimmed = Guardian.preprocess(
   *   (v) => typeof v === 'string' ? v.trim() : v,
   *   Guardian.string().minLength(1),
   * );
   *
   * Trimmed.parse('  hello  '); // 'hello'
   * Trimmed.parse('     ');     // throws — trim → '', fails minLength
   * ```
   */
  static preprocess<T>(
    fn: (input: unknown) => unknown,
    schema: FinishedGuardian<T>,
    metaData?: GuardianMetaData,
  ): BaseGuardian<T> {
    const schemaTransform = (schema as unknown as {
      _composedTransform(v: unknown): T | Promise<T>;
    })._composedTransform;
    const fnIsAsync = (fn as { constructor?: { name?: string } })
      .constructor?.name === 'AsyncFunction';
    const schemaIsAsync = schema.metaData?.isAsync === true;
    const isAsync = fnIsAsync || schemaIsAsync;

    // Wrap a non-`GuardianError` raised by `fn` so the failure source
    // is identifiable. Existing `GuardianError`s pass through
    // unchanged (they may have come from the schema during a thrown
    // preprocess return — though more typically they originate in
    // `fn` itself).
    const wrapFnError = (error: unknown, input: unknown): never => {
      if (error instanceof GuardianError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      throw new GuardianError(`Preprocess failed: ${message}`, {
        expected: 'preprocess function to complete',
        got: input,
        comparison: 'preprocess',
        type: 'preprocess',
      });
    };

    const transform: (input: unknown) => T | Promise<T> = isAsync
      ? async (input: unknown) => {
        let pre: unknown;
        try {
          pre = await fn(input);
        } catch (error) {
          wrapFnError(error, input);
        }
        return await schemaTransform(pre);
      }
      : (input: unknown) => {
        let pre: unknown;
        try {
          pre = fn(input);
        } catch (error) {
          wrapFnError(error, input);
        }
        return schemaTransform(pre);
      };

    const nextMetaData: GuardianMetaData = {
      ...metaData,
      ...(isAsync ? { isAsync: true } : {}),
    };
    // Schema emit delegates to the inner schema — preprocess is a
    // runtime concern and isn't expressible in JSON Schema / OpenAPI.
    // The emitted schema describes the post-preprocess shape — what
    // `.parse()` ultimately validates against. Stored in metadata so
    // the delegation survives `_cloneWith` (describe / optional / …).
    const guard = new UnknownGuardian<T>(transform, {
      ...nextMetaData,
      schemaEmit: {
        openAPI: () => schema.toOpenAPI(),
        jsonSchema: () => schema.toJSONSchema(),
        markdown: () => schema.toMarkdown(),
      },
    });
    return guard;
  }

  /**
   * Validate a `Set<T>`. Accepts both native `Set` instances and
   * arrays at the boundary (JSON has no `Set` type — wire format is
   * almost always an array). Arrays are converted to a `Set`, which
   * naturally deduplicates.
   *
   * Schema emit: `type: 'array'` with `uniqueItems: true` — the
   * closest JSON Schema analog.
   *
   * @template T - Element type.
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * const Tags = Guardian.set(Guardian.string().minLength(1));
   *
   * Tags.parse(['foo', 'bar', 'foo']);  // Set { 'foo', 'bar' }
   * Tags.parse(new Set(['foo']));        // Set { 'foo' }
   * ```
   */
  static set<T>(
    element?: FinishedGuardian<T>,
    metaData?: GuardianMetaData,
  ): SetGuardian<T> {
    return new SetGuardian<T>(element, metaData);
  }

  /**
   * Validate a `Map<K, V>`. Accepts three boundary shapes:
   *
   * 1. Native `Map` — passed through with key/value validation.
   * 2. `Array<[K, V]>` — canonical wire format for ordered maps.
   * 3. Plain object — converted via `Object.entries()`; string keys
   *    only.
   *
   * Distinct from {@link record} (which is `Record<string, V>`):
   * `Map` preserves insertion order and supports non-string keys.
   *
   * Schema emit: array of fixed `[K, V]` tuples (faithful to the
   * native Map shape; doesn't restrict keys to strings).
   *
   * @template K - Key type.
   * @template V - Value type.
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * const Headers = Guardian.map(Guardian.string(), Guardian.string());
   *
   * Headers.parse(new Map([['x-trace', 'abc']]));         // Map { ... }
   * Headers.parse([['x-trace', 'abc']]);                  // Map { ... }
   * Headers.parse({ 'x-trace': 'abc' });                  // Map { ... }
   * ```
   */
  static map<K, V>(
    keyGuardian: FinishedGuardian<K>,
    valueGuardian: FinishedGuardian<V>,
    metaData?: GuardianMetaData,
  ): MapGuardian<K, V> {
    return new MapGuardian<K, V>(keyGuardian, valueGuardian, metaData);
  }

  /**
   * Validate that the input is an instance of `Ctor`. Returns the
   * instance unchanged. Useful for browser globals (`URL`, `File`,
   * `Blob`, `FormData`), custom class instances, and `Error`
   * subclasses.
   *
   * Schema emit is `{ type: 'object' }` with a `className` annotation
   * — `instanceof` checks aren't expressible in JSON Schema, so
   * downstream codegen tools will see an opaque object.
   *
   * @template C - Constructor type.
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * const Url = Guardian.instanceof(URL);
   * Url.parse(new URL('https://example.com'));  // URL { … }
   * Url.parse('https://example.com');           // throws
   * ```
   */
  static instanceof<
    // deno-lint-ignore no-explicit-any
    C extends new (...args: any[]) => any,
  >(
    ctor: C,
    metaData?: GuardianMetaData,
  ): BaseGuardian<InstanceType<C>> {
    const className = ctor.name || 'instance';
    const transform = (input: unknown): InstanceType<C> => {
      if (!(input instanceof ctor)) {
        throw new GuardianError(
          `Expected instance of ${className} but got ${
            input === null ? 'null' : typeof input
          }`,
          {
            expected: className,
            got: input === null ? 'null' : typeof input,
            comparison: 'instanceof',
            type: 'instanceof',
          },
        );
      }
      return input as InstanceType<C>;
    };
    // Schema emit: best-effort placeholder. `instanceof` isn't
    // expressible in JSON Schema; the `className` annotation gives
    // codegen tools a hint they can act on. Stored in metadata so the
    // override survives `_cloneWith` (describe / optional / clone).
    const guard = new UnknownGuardian<InstanceType<C>>(transform, {
      ...metaData,
      schemaEmit: {
        openAPI: () => ({ type: 'object', className }),
        jsonSchema: () => ({
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          type: 'object',
          className,
        }),
      },
    });
    return guard;
  }

  /**
   * Always-fails guardian. Useful as:
   *
   * - The default branch in a conditional / discriminated-union
   *   schema where a position should never receive data.
   * - A compile-time exhaustiveness marker.
   * - The "unreachable" half of a refinement.
   *
   * Schema emit: `{ not: {} }` — JSON Schema's "matches nothing"
   * keyword.
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * declare const anything: unknown;
   *
   * const Forbidden = Guardian.never();
   * Forbidden.parse(anything);  // always throws
   * ```
   */
  static never(metaData?: GuardianMetaData): BaseGuardian<never> {
    const transform = (input: unknown): never => {
      throw new GuardianError(
        `Guardian.never() always rejects`,
        {
          expected: 'no value',
          got: input,
          comparison: 'never',
          type: 'never',
        },
      );
    };
    // Emit `{ not: {} }` (JSON Schema "matches nothing"). Stored in
    // metadata so the override survives `_cloneWith` (describe /
    // optional / clone).
    const guard = new UnknownGuardian<never>(transform, {
      ...metaData,
      schemaEmit: {
        openAPI: () => ({ not: {} }),
        jsonSchema: () => ({
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          not: {},
        }),
      },
    });
    return guard;
  }
}

/**
 * Type-only companion to the {@link Guardian} factory class. A
 * declaration merge, so these aliases live in the type namespace and
 * coexist with the value-position statics (`Guardian.string()`, …).
 * Earlier runtime stubs of the same names always threw; these are pure
 * aliases with no runtime hazard.
 */
// deno-lint-ignore no-namespace
export namespace Guardian {
  /**
   * The type a schema's `parse()` **returns** — after coercion,
   * transforms and refinements. Alias of {@link GuardianInfer}.
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * const Schema = Guardian.object({ name: Guardian.string() });
   * type User = Guardian.infer<typeof Schema>; // { name: string }
   * ```
   */
  export type infer<T extends FinishedGuardian<unknown>> = GuardianInfer<T>;
  /**
   * The type a schema **accepts** — the shape before any `.transform()`
   * rewrites it. Diverges from {@link infer} only when the chain
   * changes the type. Alias of {@link GuardianInferInput}.
   */
  export type inferInput<T extends FinishedGuardian<unknown>> =
    GuardianInferInput<T>;
}
