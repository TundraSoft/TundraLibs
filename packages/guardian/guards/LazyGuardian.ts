/**
 * @fileoverview `LazyGuardian` — defers resolution of the inner
 * guardian to parse time, so a schema can reference itself.
 *
 * Required for recursive types:
 *
 * ```ts
 * import { BaseGuardian, Guardian } from '@tundralibs/guardian';
 *
 * type Tree = { value: number; children: Tree[] };
 *
 * const TreeSchema: BaseGuardian<Tree> = Guardian.object({
 *   value: Guardian.number(),
 *   children: Guardian.array(Guardian.lazy(() => TreeSchema)),
 * });
 * ```
 *
 * At the point `Guardian.lazy(() => TreeSchema)` is constructed,
 * `TreeSchema` hasn't been assigned yet — the thunk closes over the
 * `const` binding and reads it at parse time, when the cycle is
 * resolved. The resolved guardian is cached after the first call.
 *
 * @module
 */

import { type AsyncProbeTarget, BaseGuardian } from '../BaseGuardian.ts';
import type {
  FinishedGuardian,
  GuardianMetaData,
  GuardianTransform,
} from '../types/mod.ts';

/**
 * Defers resolution of an inner guardian until parse time. The thunk
 * is invoked once and the result cached; subsequent parses go
 * straight through.
 *
 * Schema emit (`toOpenAPI` / `toJSONSchema`) uses a per-call cycle
 * detection set: a recursive `LazyGuardian` that emits itself emits
 * `{ $ref: '#' }` (self-reference) on the second visit, breaking the
 * recursion. Downstream codegen tools may need to rewrite this into
 * a named `$ref: '#/$defs/<name>'` form; pass `name` via metadata
 * (`.describe({ title: 'Tree' })`) to surface it as the schema title.
 *
 * @template T - The output type of the resolved inner guardian.
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
export class LazyGuardian<T> extends BaseGuardian<T> {
  /**
   * Emitted schema type. Never actually reaches output — the emit
   * overrides below delegate to the resolved inner guardian's type.
   */
  protected override readonly _type = 'lazy';
  /** Per-emit cycle detection — shared across the call tree of a single
   * `toOpenAPI` / `toJSONSchema` call. WeakSet keyed by instance. */
  private static readonly __emitStack = new WeakSet<LazyGuardian<unknown>>();

  private readonly __thunk: () => FinishedGuardian<T>;
  private __resolved: FinishedGuardian<T> | undefined = undefined;

  /**
   * Surface the resolved inner guardian's `isAsync` flag to whoever
   * asks — normally the container this lazy sits inside.
   *
   * Every container guardian (Object / Array / Tuple / Record / Set /
   * Map / DiscriminatedUnion) decides whether to run its awaiting path
   * by reading each child's `metaData.isAsync`. A `LazyGuardian`
   * resolves its thunk only when asked, so without this the parent
   * sees a lazy-wrapped async schema as synchronous, takes the sync
   * path, stores the child's pending Promise in a slot, and the async
   * validation is silently bypassed (crashing later as an unhandled
   * rejection).
   *
   * Resolving the thunk THROWS while the target binding is still
   * unassigned — exactly the forward / mutual / self reference
   * `lazy()` exists for. `BaseGuardian._refreshAsyncProbe` catches
   * that, keeps the verdict provisional (`_asyncProbePending`), and
   * retries on the next read; by parse time the binding always exists,
   * so `parse()` refuses and `parseAsync()` awaits, for a
   * forward-declared target just as for an already-defined one.
   */
  protected override _asyncProbeChildren(): ReadonlyArray<
    AsyncProbeTarget | undefined
  > {
    return [this.__resolve()];
  }

  /**
   * Creates a new LazyGuardian instance.
   *
   * @param thunk    - Function returning the guardian to delegate to.
   *                   Invoked at the first `.parse()` / `.parseAsync()`
   *                   call; result is cached.
   * @param metaData - Optional metadata. Sets `title`/`description` on
   *                   the schema-emit surface so recursive types can
   *                   surface a useful identifier in generated docs.
   */
  constructor(
    thunk: () => FinishedGuardian<T>,
    metaData?: GuardianMetaData,
  ) {
    const transform: GuardianTransform<unknown, T> = (input: unknown) => {
      const resolved = this.__resolve();
      // Same direct `_composedTransform` fast path used by
      // Object/Array/Record/Tuple/DiscriminatedUnion.
      return (resolved as unknown as {
        _composedTransform(v: unknown): T;
      })._composedTransform(input);
    };
    super(transform, metaData);
    this.__thunk = thunk;
    // Arm the deferred async probe rather than resolving now: the
    // thunk target usually doesn't exist yet at this point, and the
    // documented contract is that the thunk is invoked on first
    // access, not at construction.
    this._asyncProbePending = true;
  }

  /** Resolve + cache the inner guardian. */
  private __resolve(): FinishedGuardian<T> {
    this.__resolved ??= this.__thunk();
    return this.__resolved;
  }

  /**
   * Inline the resolved schema, with cycle detection. On a recursive
   * visit (same `LazyGuardian` already on the emit stack), returns
   * `{ $ref: '#' }` — a JSON-Schema-compatible self-reference that
   * breaks the loop. Downstream tools may need to lift this into a
   * named `$ref` (`#/$defs/Tree`); we don't auto-name because there's
   * no reliable way to derive an identifier without user input.
   */
  override toOpenAPI(): Record<string, unknown> {
    if (LazyGuardian.__emitStack.has(this)) {
      return { $ref: '#' };
    }
    LazyGuardian.__emitStack.add(this);
    try {
      return this.__resolve().toOpenAPI();
    } finally {
      LazyGuardian.__emitStack.delete(this);
    }
  }

  /**
   * Inline the resolved schema, emitting `{ $ref: '#' }` on a
   * recursive visit — see {@link toOpenAPI} for the cycle-detection
   * caveat.
   */
  override toJSONSchema(): Record<string, unknown> {
    if (LazyGuardian.__emitStack.has(this)) {
      return { $ref: '#' };
    }
    LazyGuardian.__emitStack.add(this);
    try {
      return this.__resolve().toJSONSchema();
    } finally {
      LazyGuardian.__emitStack.delete(this);
    }
  }

  /**
   * Render the resolved schema, substituting a
   * `_(recursive — see above)_` note on a recursive visit rather than
   * looping.
   */
  override toMarkdown(): string {
    if (LazyGuardian.__emitStack.has(this)) {
      return '_(recursive — see above)_';
    }
    LazyGuardian.__emitStack.add(this);
    try {
      return this.__resolve().toMarkdown();
    } finally {
      LazyGuardian.__emitStack.delete(this);
    }
  }

  /**
   * Subclass hook for immutable chain operations — preserves the
   * thunk required by the constructor signature.
   */
  protected override _cloneWith(
    transform: GuardianTransform<unknown, T>,
    metaData: GuardianMetaData | undefined,
  ): this {
    const cloned = new LazyGuardian<T>(this.__thunk, metaData);
    cloned._composedTransform = transform;
    cloned._baseTransform = this._baseTransform;
    cloned.__resolved = this.__resolved;
    return cloned as this;
  }
}
