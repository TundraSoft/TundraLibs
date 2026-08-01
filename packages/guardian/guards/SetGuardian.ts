/**
 * @fileoverview `SetGuardian` — `Set<T>` validator with per-element
 * validation. Accepts both native `Set` instances and arrays (the
 * common wire-format shape, since JSON has no `Set` type) — arrays
 * are converted to a `Set`, which naturally deduplicates.
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

/**
 * Guardian for `Set<T>` values. Coerces from `Array<T>` at the
 * boundary (the typical JSON wire format) and validates each member
 * against the element guardian if provided.
 *
 * @template T - The element type of the resulting Set.
 *
 * @example
 * ```ts
 * const Tags = Guardian.set(Guardian.string().minLength(1));
 *
 * Tags.parse(['foo', 'bar', 'foo']);
 * // → Set { 'foo', 'bar' }  — duplicate silently deduplicated
 *
 * Tags.parse(new Set(['foo', 'bar']));
 * // → Set { 'foo', 'bar' }  — Set inputs accepted directly
 *
 * Tags.parse(['foo', '']);
 * // → throws (empty string fails minLength)
 * ```
 */
export class SetGuardian<T> extends BaseGuardian<Set<T>> {
  protected override readonly _type = 'set';
  private readonly __elementGuardian: FinishedGuardian<T> | undefined;
  /**
   * True when the element guardian carries an async step. Selects the
   * awaiting validation path and flags the set `isAsync` so a nested
   * async validator can't be stored as a pending Promise and silently
   * bypass validation.
   */
  private __async: boolean = false;

  /**
   * @param elementGuardian - Optional per-element validator.
   * @param metaData        - Optional metadata.
   */
  constructor(
    elementGuardian?: FinishedGuardian<T>,
    metaData?: GuardianMetaData,
  ) {
    super((input: unknown) => {
      const iter = this.__normaliseIterable(input);

      const out = new Set<T>();
      if (!this.__elementGuardian) {
        for (const v of iter) out.add(v as T);
        return out;
      }
      // Settle a still-provisional async verdict (an unresolved
      // `lazy()` element) before choosing the path.
      if (this._asyncProbePending) this._refreshAsyncProbe();
      if (this.__async) return this.__validateElementsAsync(iter);
      // Direct `_composedTransform` call — same hot-path trick the
      // Array / Tuple / Record guards use to skip per-element
      // try/catch + isAsync overhead.
      const elementTransform = (this.__elementGuardian as unknown as {
        _composedTransform(v: unknown): T;
      })._composedTransform;
      let i = 0;
      for (const v of iter) {
        try {
          out.add(elementTransform(v));
        } catch (error) {
          if (error instanceof GuardianError) {
            error.context.type = 'set_element';
            error.context.arrayIndex = i;
            error.prependPath(i);
            error.message = `Set element at index ${i}: ${error.message}`;
          }
          throw error;
        }
        i++;
      }
      return out;
    }, metaData);
    this.__elementGuardian = elementGuardian;
    // A not-yet-resolvable `lazy()` element keeps the verdict
    // provisional and is re-probed before the first parse.
    this._initAsyncProbe();
  }

  /** The element guardian, for the deferred async probe. @internal */
  protected override _asyncProbeChildren(): ReadonlyArray<
    AsyncProbeTarget | undefined
  > {
    return [this.__elementGuardian];
  }

  /** @internal */
  protected override _markAsync(): void {
    this.__async = true;
    super._markAsync();
  }

  /**
   * Accept both native `Set` and array inputs (arrays are the common
   * wire format — JSON has no `Set`). Throws for anything else.
   */
  private __normaliseIterable(input: unknown): Iterable<unknown> {
    if (input instanceof Set) return input;
    if (Array.isArray(input)) return input;
    throw new GuardianError(
      `Expected Set or array but got ${input === null ? 'null' : typeof input}`,
      {
        expected: 'Set or array',
        got: input === null ? 'null' : typeof input,
        comparison: 'type',
        type: 'set',
      },
    );
  }

  /**
   * Async sibling of the constructor's element loop. Awaits each
   * element's (possibly Promise-returning) transform before adding it
   * to the set, applying the same per-index error enrichment.
   */
  private async __validateElementsAsync(
    iter: Iterable<unknown>,
  ): Promise<Set<T>> {
    const out = new Set<T>();
    const elementTransform = (this.__elementGuardian as unknown as {
      _composedTransform(v: unknown): T | Promise<T>;
    })._composedTransform;
    let i = 0;
    for (const v of iter) {
      try {
        const el = elementTransform(v);
        // Only a real Promise is a leaked async step to await; a
        // non-Promise thenable-shaped element VALUE would be ADOPTED and
        // silently destroyed by `await`, so refuse it loudly here.
        out.add(el instanceof Promise ? await el : gateAsyncStepResult(el));
      } catch (error) {
        if (error instanceof GuardianError) {
          error.context.type = 'set_element';
          error.context.arrayIndex = i;
          error.prependPath(i);
          error.message = `Set element at index ${i}: ${error.message}`;
        }
        throw error;
      }
      i++;
    }
    // Gate the result before this native `async` method returns it, at
    // the same choke point (`gateAsyncStepResult`) every async step
    // boundary uses. A validated Set never carries a callable `then`, so
    // this passes through unchanged today; it keeps the composite
    // native-async transform contract uniform and adoption-proof.
    return gateAsyncStepResult(out);
  }

  /**
   * Emit `type: 'array'` with `uniqueItems: true` — JSON Schema's
   * closest analog for a Set. Wire format is array-with-unique;
   * runtime is `Set`. Document this in your API spec if the
   * distinction matters to consumers.
   */
  override toOpenAPI(): Record<string, unknown> {
    const base = super.toOpenAPI();
    return {
      ...base,
      type: 'array',
      uniqueItems: true,
      ...(this.__elementGuardian
        ? { items: this.__elementGuardian.toOpenAPI() }
        : {}),
    };
  }

  /**
   * Subclass hook for immutable chain operations — preserves the
   * `__elementGuardian` reference required by the constructor
   * signature.
   */
  protected override _cloneWith(
    transform: GuardianTransform<unknown, Set<T>>,
    metaData: GuardianMetaData | undefined,
  ): this {
    const cloned = new SetGuardian<T>(this.__elementGuardian, metaData);
    cloned._composedTransform = transform;
    return cloned as this;
  }
}
