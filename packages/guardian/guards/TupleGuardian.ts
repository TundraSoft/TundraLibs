/**
 * @fileoverview Tuple validation guardian — length-pinned, position-typed arrays.
 *
 * Use this when the wire shape is `[number, number]` or
 * `[string, number, boolean]` — i.e. positional meaning matters,
 * not just element-type uniformity. `Guardian.array(...)` validates
 * homogeneous element types and discards positional info; this
 * guardian preserves it.
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
  TupleOf,
} from '../types/mod.ts';

/**
 * Output type for {@link TupleGuardian}. When `R` is `never` (the
 * default — no `.rest()` chained), the result is a fixed-length
 * tuple `TupleOf<T>`. When `R` is provided, it widens to
 * `[...TupleOf<T>, ...R[]]` — variadic tail.
 *
 * Wrapping `R` in a tuple (`[R] extends [never]`) prevents TS's
 * distributive conditional from short-circuiting when callers pass
 * a union type for the rest element.
 *
 * Internal-only; not exported via `types/mod.ts` because it's a
 * helper used inside this file's class definition.
 */
type TupleResult<
  T extends readonly FinishedGuardian<unknown>[],
  R,
> = [R] extends [never] ? TupleOf<T> : [...TupleOf<T>, ...R[]];

/**
 * Guardian for length-pinned, position-typed arrays.
 *
 * @template T - Readonly tuple of element guardians.
 *
 * @example
 * ```ts
 * import { Guardian } from '@tundralibs/guardian';
 *
 * const range = Guardian.tuple([
 *   Guardian.number().integer().min(0),
 *   Guardian.number().integer().min(0),
 * ]);
 * const value: [number, number] = range.parse([10, 20]);
 * ```
 */
export class TupleGuardian<
  T extends readonly FinishedGuardian<unknown>[],
  R = never,
> extends BaseGuardian<TupleResult<T, R>> {
  protected override readonly _type = 'array';
  private readonly __guardians: readonly [...T];
  /** Variadic tail guardian; `undefined` means a fixed-length tuple. */
  private __rest: FinishedGuardian<R> | undefined = undefined;
  /** Per-position human labels (set via {@link labels}). */
  private __labels: readonly string[] | undefined = undefined;
  /**
   * True when any positional (or the variadic rest) guardian carries an
   * async step. Selects the awaiting validation path and flags the
   * tuple `isAsync` so a nested async validator can't be stored as a
   * pending Promise and silently bypass validation.
   */
  private __async: boolean = false;

  /**
   * Creates a new TupleGuardian instance.
   *
   * @param guardians - Tuple of element guardians. The resulting
   *   schema requires the input array to have exactly this many
   *   elements (or more, if `.rest()` is chained), in this order.
   * @param metaData - Optional metadata.
   */
  constructor(guardians: readonly [...T], metaData?: GuardianMetaData) {
    super((input: unknown) => {
      if (!Array.isArray(input)) {
        throw new GuardianError(`Expected array but got ${typeof input}`, {
          expected: 'array',
          got: typeof input,
          comparison: 'type',
          type: 'tuple',
        });
      }
      const minLen = this.__guardians.length;
      const hasRest = this.__rest !== undefined;
      if (!hasRest && input.length !== minLen) {
        throw new GuardianError(
          `Tuple must have exactly ${minLen} elements (got ${input.length})`,
          {
            expected: minLen,
            got: input.length,
            comparison: 'length',
            type: 'tuple',
          },
        );
      }
      if (hasRest && input.length < minLen) {
        throw new GuardianError(
          `Tuple must have at least ${minLen} elements (got ${input.length})`,
          {
            expected: `>= ${minLen}`,
            got: input.length,
            comparison: 'length',
            type: 'tuple',
          },
        );
      }
      // Settle a still-provisional async verdict (an unresolved
      // `lazy()` position) before choosing the path.
      if (this._asyncProbePending) this._refreshAsyncProbe();
      // Async positional / rest guardian → await each position so a
      // rejecting async validator surfaces rather than being stored
      // pending.
      if (this.__async) return this.__validatePositionsAsync(input, minLen);
      // Validate each position against its dedicated guardian. Errors
      // get array-element-style context enrichment so failures pin
      // the offending index. Calls `_composedTransform` directly (vs
      // `g.parse(...)`) to skip the per-position try/catch + isAsync
      // check that `parse()` adds — same trick the Object/Array
      // guards use for their element validation hot path.
      const out: unknown[] = new Array(input.length);
      for (let i = 0; i < minLen; i++) {
        // TS-strict (`noUncheckedIndexedAccess`) needs the `!`; the
        // length guard above proves the index is in range.
        const g = this.__guardians[i]!; // NOSONAR
        try {
          out[i] = (g as unknown as { _composedTransform(v: unknown): unknown })
            ._composedTransform(input[i]);
        } catch (error) {
          if (error instanceof GuardianError) {
            error.context.type = 'tuple_element';
            error.context.arrayIndex = i;
            // Prefer the label when present — labeled tuples produce
            // friendlier paths (`['x']` vs `[0]`).
            error.prependPath(this.__labels?.[i] ?? i);
            error.message = this.__labels?.[i]
              ? `Tuple element '${
                this.__labels[i]
              }' (index ${i}): ${error.message}`
              : `Tuple element at index ${i}: ${error.message}`;
          }
          throw error;
        }
      }
      // Variadic tail — validate trailing items against `__rest`.
      if (hasRest) {
        const restTransform = (this.__rest as unknown as {
          _composedTransform(v: unknown): R;
        })._composedTransform;
        for (let i = minLen; i < input.length; i++) {
          try {
            out[i] = restTransform(input[i]);
          } catch (error) {
            if (error instanceof GuardianError) {
              error.context.type = 'tuple_rest_element';
              error.context.arrayIndex = i;
              error.prependPath(i);
              error.message =
                `Tuple rest element at index ${i}: ${error.message}`;
            }
            throw error;
          }
        }
      }
      return out as TupleResult<T, R>;
    }, metaData);
    this.__guardians = guardians;
    // A `.rest()` guardian is attached post-construction (see `rest()`),
    // which re-probes there. Here we cover the fixed positions plus an
    // inherited `isAsync` carried through immutable clones. A
    // not-yet-resolvable `lazy()` position keeps the verdict
    // provisional and is re-probed before the first parse.
    this._initAsyncProbe();
  }

  /**
   * Fixed positions plus the variadic `rest()` guardian, for the
   * deferred async probe.
   *
   * @internal
   */
  protected override _asyncProbeChildren(): ReadonlyArray<
    AsyncProbeTarget | undefined
  > {
    return this.__rest === undefined
      ? this.__guardians
      : [...this.__guardians, this.__rest];
  }

  /** @internal */
  protected override _markAsync(): void {
    this.__async = true;
    super._markAsync();
  }

  /**
   * Async sibling of the constructor's positional + rest loops. Awaits
   * each position's (possibly Promise-returning) transform, applying
   * the same per-index error enrichment and label handling.
   */
  private async __validatePositionsAsync(
    input: unknown[],
    minLen: number,
  ): Promise<TupleResult<T, R>> {
    const out: unknown[] = new Array(input.length);
    for (let i = 0; i < minLen; i++) {
      const g = this.__guardians[i]!; // NOSONAR — length guard proves in-range
      try {
        const el = (g as unknown as {
          _composedTransform(v: unknown): unknown;
        })._composedTransform(input[i]);
        // Only a real Promise is a leaked async step to await; a
        // non-Promise thenable-shaped position VALUE would be ADOPTED
        // and silently destroyed by `await`, so refuse it loudly here.
        out[i] = el instanceof Promise ? await el : gateAsyncStepResult(el);
      } catch (error) {
        if (error instanceof GuardianError) {
          error.context.type = 'tuple_element';
          error.context.arrayIndex = i;
          error.prependPath(this.__labels?.[i] ?? i);
          error.message = this.__labels?.[i]
            ? `Tuple element '${
              this.__labels[i]
            }' (index ${i}): ${error.message}`
            : `Tuple element at index ${i}: ${error.message}`;
        }
        throw error;
      }
    }
    if (this.__rest !== undefined) {
      const restTransform = (this.__rest as unknown as {
        _composedTransform(v: unknown): R | Promise<R>;
      })._composedTransform;
      for (let i = minLen; i < input.length; i++) {
        try {
          const el = restTransform(input[i]);
          // Only a real Promise is a leaked async step to await; a
          // non-Promise thenable-shaped rest VALUE would be ADOPTED and
          // silently destroyed by `await`, so refuse it loudly here.
          out[i] = el instanceof Promise ? await el : gateAsyncStepResult(el);
        } catch (error) {
          if (error instanceof GuardianError) {
            error.context.type = 'tuple_rest_element';
            error.context.arrayIndex = i;
            error.prependPath(i);
            error.message =
              `Tuple rest element at index ${i}: ${error.message}`;
          }
          throw error;
        }
      }
    }
    // Gate the result before this native `async` method returns it, at
    // the same choke point (`gateAsyncStepResult`) every async step
    // boundary uses. A validated tuple never carries a callable `then`,
    // so this passes through unchanged today; it keeps the composite
    // native-async transform contract uniform and adoption-proof.
    return gateAsyncStepResult(out) as TupleResult<T, R>;
  }

  /**
   * Allow trailing variadic of type `U` after the fixed positional
   * tuple. The resulting type is `[...T, ...U[]]` — common for varargs-
   * style payloads.
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * const cmd = Guardian.tuple([
   *   Guardian.literal('move'),
   *   Guardian.number().integer(),
   *   Guardian.number().integer(),
   * ]).rest(Guardian.string());
   * cmd.parse(['move', 1, 2, 'fast', 'silent']);
   * // type: ['move', number, number, ...string[]]
   * ```
   */
  rest<U>(g: FinishedGuardian<U>): TupleGuardian<T, U> {
    // Rebuilt from `__guardians`, so a previously chained
    // `.refine()` / `.transform()` / `.process()` step cannot be
    // carried over — refuse rather than drop it silently.
    this._assertNoChainedSteps('rest', 'positional guardians');
    const cloned = new TupleGuardian<T, U>(this.__guardians, this._metaData);
    cloned.__rest = g;
    cloned.__labels = this.__labels;
    // An async rest guardian makes the whole tuple async — validate the
    // variadic tail on the awaiting path. Re-probe now that the rest
    // guardian is attached.
    cloned._initAsyncProbe();
    return cloned;
  }

  /**
   * Attach human-readable labels to positions for richer error
   * messages and documentation emit. Labels are positional — the
   * first label maps to position 0, etc.
   *
   * @throws {Error} When `names.length` doesn't match the tuple's
   *   fixed-prefix length.
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * const xy = Guardian.tuple([Guardian.number(), Guardian.number()])
   *   .labels(['x', 'y']);
   *
   * xy.parse([1, 'oops']);
   * // throws: Tuple element 'y' (index 1): ...
   * ```
   */
  labels(names: readonly string[]): this {
    // Same rebuild-from-parts hazard as `rest()`.
    this._assertNoChainedSteps('labels', 'positional guardians');
    if (names.length !== this.__guardians.length) {
      throw new Error(
        `labels(): expected ${this.__guardians.length} names (got ${names.length})`,
      );
    }
    // Use `new TupleGuardian` (not `_cloneWith`) so the constructor's
    // fresh `objectTransform` closure binds to the new instance and
    // reads its `__labels` at parse time. `_cloneWith` would copy the
    // source's transform, whose closure reads the source's `__labels`
    // — same closure-binding gotcha ObjectGuardian's mode methods
    // had to work around.
    const cloned = new TupleGuardian<T, R>(this.__guardians, this._metaData);
    cloned.__labels = [...names];
    cloned.__rest = this.__rest;
    return cloned as this;
  }

  /**
   * OpenAPI 3 / JSON Schema Draft 7 tuple form: `items` is an array
   * of per-position schemas, with `additionalItems: false` to pin
   * the length. Used by the OpenAPI emit path; the JSON Schema
   * 2020-12 path overrides this to `prefixItems` instead.
   */
  override toOpenAPI(): Record<string, unknown> {
    const base = super.toOpenAPI();
    const hasRest = this.__rest !== undefined;
    return {
      ...base,
      type: 'array',
      items: this.__guardians.map((g) => g.toOpenAPI()),
      // With variadic rest, trailing items follow `__rest`'s schema;
      // otherwise the tuple is length-pinned.
      additionalItems: hasRest ? this.__rest!.toOpenAPI() : false,
      minItems: this.__guardians.length,
      ...(hasRest ? {} : { maxItems: this.__guardians.length }),
    };
  }

  /**
   * JSON Schema 2020-12 tuple form: `prefixItems` for the positional
   * schemas + `items: false` to forbid trailing elements. This is
   * the modern keyword; Draft 7's `items: [array]` overload is
   * deprecated in 2020-12 in favour of separating the two cases.
   */
  override toJSONSchema(): Record<string, unknown> {
    const base = super.toJSONSchema();
    // Strip the Draft 7-shaped tuple keywords that `toOpenAPI()`
    // produced — we replace them with the 2020-12 equivalents.
    const { items: _items, additionalItems: _addl, ...rest } = base;
    const hasRest = this.__rest !== undefined;
    return {
      ...rest,
      type: 'array',
      prefixItems: this.__guardians.map((g) => g.toJSONSchema()),
      // 2020-12 `items` describes the variadic tail (or `false` for
      // a fixed-length tuple).
      items: hasRest ? this.__rest!.toJSONSchema() : false,
      minItems: this.__guardians.length,
      ...(hasRest ? {} : { maxItems: this.__guardians.length }),
    };
  }

  /**
   * Subclass hook for immutable chain operations — preserves the
   * `__guardians` tuple required by the constructor signature, plus
   * the optional `__rest` element guardian and `__labels` carried by
   * derived instances.
   */
  protected override _cloneWith(
    transform: GuardianTransform<unknown, TupleResult<T, R>>,
    metaData: GuardianMetaData | undefined,
  ): this {
    const cloned = new TupleGuardian<T, R>(this.__guardians, metaData);
    cloned._composedTransform = transform;
    // Carry the base-transform reference so `describe()` / `clone()`
    // aren't mistaken for chained steps by `rest()` / `labels()`.
    cloned._baseTransform = this._baseTransform;
    cloned.__rest = this.__rest;
    cloned.__labels = this.__labels;
    return cloned as this;
  }
}
