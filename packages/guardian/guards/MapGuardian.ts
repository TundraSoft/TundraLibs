/**
 * @fileoverview `MapGuardian` — `Map<K, V>` validator. Distinct from
 * `RecordGuardian` (which is `Record<string, V>`) because `Map`
 * preserves insertion order and allows non-string keys.
 *
 * Accepts three input shapes at the boundary, since JSON has no
 * `Map` type:
 *
 * 1. Native `Map` instance — passed through with key/value validation.
 * 2. `Array<[K, V]>` — the canonical wire format for ordered maps
 *    (matches `Object.fromEntries` semantics).
 * 3. Plain object — converted via `Object.entries()`. Limited to
 *    **string keys only**; use array-of-pairs for non-string keys.
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
 * Guardian for `Map<K, V>` values.
 *
 * @template K - Key type.
 * @template V - Value type.
 *
 * @example
 * ```ts
 * import { Guardian } from '@tundralibs/guardian';
 *
 * const Headers = Guardian.map(
 *   Guardian.string(),
 *   Guardian.string(),
 * );
 *
 * Headers.parse(new Map([['content-type', 'application/json']]));
 * Headers.parse([['content-type', 'application/json']]);
 * Headers.parse({ 'content-type': 'application/json' });
 * // All three produce: Map { 'content-type' => 'application/json' }
 * ```
 */
export class MapGuardian<K, V> extends BaseGuardian<Map<K, V>> {
  protected override readonly _type = 'map';
  private readonly __keyGuardian: FinishedGuardian<K>;
  private readonly __valueGuardian: FinishedGuardian<V>;
  /**
   * True when the key or value guardian carries an async step. Selects
   * the awaiting validation path and flags the map `isAsync` so a
   * nested async validator can't be stored as a pending Promise and
   * silently bypass validation.
   */
  private __async: boolean = false;

  /**
   * @param keyGuardian   - Validator for each key.
   * @param valueGuardian - Validator for each value.
   * @param metaData      - Optional metadata.
   */
  constructor(
    keyGuardian: FinishedGuardian<K>,
    valueGuardian: FinishedGuardian<V>,
    metaData?: GuardianMetaData,
  ) {
    super((input: unknown) => {
      const entries = this.__normaliseEntries(input);
      // Settle a still-provisional async verdict (an unresolved
      // `lazy()` key / value guardian) before choosing the path.
      if (this._asyncProbePending) this._refreshAsyncProbe();
      if (this.__async) return this.__validateEntriesAsync(entries);

      const out = new Map<K, V>();
      const keyTransform = (this.__keyGuardian as unknown as {
        _composedTransform(v: unknown): K;
      })._composedTransform;
      const valueTransform = (this.__valueGuardian as unknown as {
        _composedTransform(v: unknown): V;
      })._composedTransform;
      let i = 0;
      for (const entry of entries) {
        this.__assertPair(entry, i);
        const [rawKey, rawValue] = entry;
        try {
          out.set(keyTransform(rawKey), valueTransform(rawValue));
        } catch (error) {
          if (error instanceof GuardianError) {
            error.context.type = 'map_entry';
            error.context.arrayIndex = i;
            error.prependPath(i);
            error.message = `Map entry at index ${i}: ${error.message}`;
          }
          throw error;
        }
        i++;
      }
      return out;
    }, metaData);
    this.__keyGuardian = keyGuardian;
    this.__valueGuardian = valueGuardian;
    // A not-yet-resolvable `lazy()` key / value guardian keeps the
    // verdict provisional and is re-probed before the first parse.
    this._initAsyncProbe();
  }

  /** Key + value guardians, for the deferred async probe. @internal */
  protected override _asyncProbeChildren(): ReadonlyArray<
    AsyncProbeTarget | undefined
  > {
    return [this.__keyGuardian, this.__valueGuardian];
  }

  /** @internal */
  protected override _markAsync(): void {
    this.__async = true;
    super._markAsync();
  }

  /**
   * Normalise the three accepted input shapes (native `Map`,
   * `Array<[K, V]>`, plain object) to a common `[unknown, unknown]`
   * iterable. Throws for anything else.
   */
  private __normaliseEntries(
    input: unknown,
  ): Iterable<readonly [unknown, unknown]> {
    if (input instanceof Map) return input.entries();
    if (Array.isArray(input)) {
      return input as Array<readonly [unknown, unknown]>;
    }
    if (typeof input === 'object' && input !== null) {
      return Object.entries(input);
    }
    throw new GuardianError(
      `Expected Map, array of pairs, or plain object but got ${
        input === null ? 'null' : typeof input
      }`,
      {
        expected: 'Map | Array<[K, V]> | object',
        got: input === null ? 'null' : typeof input,
        comparison: 'type',
        type: 'map',
      },
    );
  }

  /** Assert an entry is a `[key, value]` pair; throws otherwise. */
  private __assertPair(
    entry: readonly [unknown, unknown],
    index: number,
  ): asserts entry is readonly [unknown, unknown] {
    if (!Array.isArray(entry) || entry.length !== 2) {
      throw new GuardianError(
        `Map entry at index ${index} must be a [key, value] pair`,
        {
          expected: '[K, V] tuple',
          got: entry,
          comparison: 'shape',
          type: 'map_entry',
        },
      );
    }
  }

  /**
   * Async sibling of the constructor's entry loop. Awaits each key/value
   * transform so async key or value guardians are enforced rather than
   * stored pending.
   */
  private async __validateEntriesAsync(
    entries: Iterable<readonly [unknown, unknown]>,
  ): Promise<Map<K, V>> {
    const out = new Map<K, V>();
    const keyTransform = (this.__keyGuardian as unknown as {
      _composedTransform(v: unknown): K | Promise<K>;
    })._composedTransform;
    const valueTransform = (this.__valueGuardian as unknown as {
      _composedTransform(v: unknown): V | Promise<V>;
    })._composedTransform;
    let i = 0;
    for (const entry of entries) {
      this.__assertPair(entry, i);
      const [rawKey, rawValue] = entry;
      try {
        const k = keyTransform(rawKey);
        const v = valueTransform(rawValue);
        // Only a real Promise is a leaked async step to await; a
        // non-Promise thenable-shaped key/value VALUE would be ADOPTED
        // and silently destroyed by `await`, so refuse it loudly at each
        // per-key / per-value adoption point.
        out.set(
          k instanceof Promise ? await k : gateAsyncStepResult(k),
          v instanceof Promise ? await v : gateAsyncStepResult(v),
        );
      } catch (error) {
        if (error instanceof GuardianError) {
          error.context.type = 'map_entry';
          error.context.arrayIndex = i;
          error.prependPath(i);
          error.message = `Map entry at index ${i}: ${error.message}`;
        }
        throw error;
      }
      i++;
    }
    // Gate the result before this native `async` method returns it, at
    // the same choke point (`gateAsyncStepResult`) every async step
    // boundary uses. A validated Map never carries a callable `then`, so
    // this passes through unchanged today; it keeps the composite
    // native-async transform contract uniform and adoption-proof.
    return gateAsyncStepResult(out);
  }

  /**
   * Emit `Array<[K, V]>` shape — closest faithful JSON Schema for a
   * `Map`. Specifically: an array of fixed-length-2 tuples.
   *
   * Object-shaped wire format isn't emitted as the primary schema
   * because it'd limit keys to strings and lose ordering. Document
   * accordingly if your wire protocol uses object form.
   */
  override toOpenAPI(): Record<string, unknown> {
    const base = super.toOpenAPI();
    return {
      ...base,
      type: 'array',
      items: {
        type: 'array',
        items: [
          this.__keyGuardian.toOpenAPI(),
          this.__valueGuardian.toOpenAPI(),
        ],
        additionalItems: false,
        minItems: 2,
        maxItems: 2,
      },
    };
  }

  override toJSONSchema(): Record<string, unknown> {
    return {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'array',
      items: {
        type: 'array',
        prefixItems: [
          (() => {
            const { $schema: _drop, ...rest } = this.__keyGuardian
              .toJSONSchema();
            return rest;
          })(),
          (() => {
            const { $schema: _drop, ...rest } = this.__valueGuardian
              .toJSONSchema();
            return rest;
          })(),
        ],
        items: false,
        minItems: 2,
        maxItems: 2,
      },
      ...(this._metaData?.title && { title: this._metaData.title }),
      ...(this._metaData?.description &&
        { description: this._metaData.description }),
    };
  }

  /**
   * Subclass hook for immutable chain operations — preserves the
   * `__keyGuardian` / `__valueGuardian` references required by the
   * constructor signature.
   */
  protected override _cloneWith(
    transform: GuardianTransform<unknown, Map<K, V>>,
    metaData: GuardianMetaData | undefined,
  ): this {
    const cloned = new MapGuardian<K, V>(
      this.__keyGuardian,
      this.__valueGuardian,
      metaData,
    );
    cloned._composedTransform = transform;
    return cloned as this;
  }
}
