/**
 * @fileoverview `BaseGuardian` — abstract parent of every guardian.
 * Composes a transform chain via `.process(fn)`; offers `parse` /
 * `safeParse` / async siblings; carries metadata used by the
 * documentation emitters (`toOpenAPI` / `toJSONSchema` / `toMarkdown`).
 *
 * @module
 */

import { GuardianError } from './errors/Base.ts';
import {
  equals,
  gateAsyncStepResult,
  isAdoptableThenable,
  isIn,
  isNotIn,
  notEquals,
  test,
  thenableResultError,
} from './helpers/mod.ts';
import type {
  FinishedGuardian,
  GuardianMetaData,
  GuardianSafeParseResult,
  GuardianTransform,
} from './types/mod.ts';

/**
 * Implementation return type for {@link BaseGuardian.optional}.
 * The two public overloads narrow this down — callers don't see
 * this shape directly. Extracted to silence S4323 (union-as-alias).
 *
 * @internal
 */
type _OptionalImplReturn<T, D> =
  | FinishedGuardian<T | D | undefined>
  | FinishedGuardian<T | D | undefined | null>;

/**
 * Minimal structural shape a guardian must expose to take part in the
 * deferred async probe (see {@link BaseGuardian._asyncProbeChildren}).
 * Structural rather than `BaseGuardian<unknown>` so containers can
 * hand back their children whatever their concrete generic parameter
 * is, without a cast.
 */
export type AsyncProbeTarget = {
  readonly metaData: GuardianMetaData | undefined;
};

/**
 * Metadata keys that should NOT be forwarded to emitted OpenAPI /
 * JSON Schema output. Some are handled explicitly upstream
 * (`title` / `description` / `format` / `examples` / `deprecated`
 * are routed to dedicated schema fields and shouldn't be duplicated
 * in the constraint loop). The rest are Guardian-internal
 * (`isAsync` / `isNullable` / `isOptional` flags, the structured
 * `path` field carried by errors, the `caseInsensitive` marker
 * EnumGuardian uses, the `validatorTypes` book-keeping). Anything
 * NOT in this set is forwarded so subclasses can attach
 * standard constraint keys (`minLength`, `multipleOf`, `pattern`,
 * `uniqueItems`, …) and have them flow through automatically.
 *
 * @internal
 */
const INTERNAL_METADATA_KEYS = new Set([
  // Already routed to dedicated fields by `toOpenAPI`:
  'title',
  'description',
  'examples',
  'deprecated',
  'format',
  // Protected finisher / parse-mode flags:
  'isAsync',
  'isNullable',
  'isOptional',
  // Guardian-internal book-keeping:
  'path',
  'caseInsensitive',
  'validatorTypes',
  'asyncPending',
  // Custom schema-emit override functions (intersection / instanceof /
  // never / preprocess) — consumed by UnknownGuardian's emit methods,
  // never forwarded as a schema constraint.
  'schemaEmit',
]);

/**
 * Nominal brand. Attaches a phantom tag `B` to a base type `T` so the
 * compiler treats two structurally-identical types as distinct.
 *
 * Used by {@link BaseGuardian.brand} to produce types like
 * `Brand<string, 'UserId'>` — assignment-incompatible with a raw
 * `string` or with `Brand<string, 'OrderId'>` even though all three
 * are `string` at runtime.
 *
 * `__brand` is a unique-symbol-keyed property, so brand metadata
 * never collides with a real field on the underlying value and never
 * shows up at runtime.
 *
 * @example
 * ```ts ignore
 * type UserId  = Brand<string, 'UserId'>;
 * type OrderId = Brand<string, 'OrderId'>;
 *
 * const a: UserId  = 'u_1' as UserId;
 * const b: OrderId = a; // ❌ compile error
 * ```
 */
declare const __guardianBrand: unique symbol;
export type Brand<T, B extends string | symbol> = T & {
  readonly [__guardianBrand]: B;
};

/**
 * Abstract parent of every guardian. Holds the composed transform
 * chain (`_composedTransform`) and the metadata bag (`_metaData`)
 * used by the doc emitters. Subclasses extend it with type-specific
 * validators (e.g. `StringGuardian.minLength`,
 * `NumberGuardian.integer`).
 *
 * **Chain methods are immutable.** Every method that extends the chain
 * (`.process()`, `.test()`, `.equals()`, `.minLength()`, etc.) returns
 * a fresh guardian instance — the receiving instance is never mutated.
 * This matches Zod / Yup / Valibot convention and lets shared base
 * schemas be safely composed: `const NonEmpty = Guardian.string()
 * .minLength(1); const Email = NonEmpty.email();` leaves `NonEmpty`
 * untouched.
 *
 * **Throw contract.** Every chain-extension method (validators,
 * transforms, refinements — anything that ultimately funnels through
 * {@link process} or {@link test}) throws a {@link GuardianError} at
 * construction time if called after a finisher (`.optional()` /
 * `.nullable()`). Subclass validators (e.g. `.email()`,
 * `.minLength(3)`, `.integer()`) inherit this contract uniformly —
 * the per-method JSDoc doesn't repeat it. The complementary throw —
 * validation failure on the parsed input — is documented on
 * {@link parse} and {@link parseAsync}.
 *
 * @template T - The output type returned by `.parse()`. Initial
 *   guardians have `T` set by their constructor; `.process(fn)` can
 *   change it via the second constructor argument.
 *
 * @example
 * ```ts
 * import { Guardian } from '@tundralibs/guardian';
 *
 * const Trimmed = Guardian.string()
 *   .process((s) => s.trim())
 *   .minLength(1);
 *
 * Trimmed.parse('  hi  '); // 'hi'
 * ```
 */
export abstract class BaseGuardian<T> {
  protected _composedTransform: GuardianTransform<unknown, T>;
  /**
   * The transform this guardian was CONSTRUCTED with — the bottom of
   * the composed chain. Every chain step (`.refine()` /
   * `.superRefine()` / `.transform()` / `.process()`) wraps a new
   * function on top of it, so `_composedTransform !== _baseTransform`
   * is the tell that a step was chained. Methods that rebuild the
   * guardian from its parts (object mode setters + schema
   * manipulation, tuple `rest()` / `labels()`) cannot carry those
   * steps over and refuse loudly rather than dropping them — see
   * {@link _assertNoChainedSteps}.
   */
  protected _baseTransform: GuardianTransform<unknown, T>;
  protected _metaData: GuardianMetaData | undefined = undefined;
  protected readonly _type: string = 'unknown';
  /**
   * `true` while this guardian's async verdict is **provisional**: a
   * `lazy()` thunk somewhere in its subtree wasn't resolvable when the
   * probe last ran (the forward / mutual / self reference `lazy()`
   * exists for). While set, {@link metaData} re-probes the children
   * instead of trusting the construction-time verdict, so the async
   * flag lands before the first parse. Composite guardians read it to
   * decide whether their parse-time path needs a refresh.
   *
   * @internal
   */
  protected _asyncProbePending: boolean = false;
  /** Re-entrancy guard — a cyclic (recursive) schema probes itself. */
  private __asyncProbing: boolean = false;

  /**
   * Doc + validation metadata bag attached to this guardian.
   *
   * Reading it also settles a **deferred async probe**: when a child
   * `lazy()` thunk couldn't be resolved at construction time, the
   * probe is retried here (and is a single boolean test otherwise).
   * That is what makes `isAsync` correct for forward-referenced and
   * recursive schemas, whose thunk target only exists after the
   * container was built.
   */
  get metaData(): GuardianMetaData | undefined {
    if (this._asyncProbePending) this._refreshAsyncProbe();
    return this._metaData;
  }

  constructor(
    initialTransform: GuardianTransform<unknown, T>,
    metaData?: GuardianMetaData,
  ) {
    this._composedTransform = initialTransform;
    this._baseTransform = initialTransform;

    // Spread the caller-supplied bag so each instance owns its own
    // metadata object. Subclass constructors (e.g. DateGuardian
    // defaulting `format: 'date-time'`) — and constraint setters
    // like `result._metaData.format = '...'` — would otherwise
    // mutate a shared reference and leak into the caller's variable.
    if (metaData) {
      this._metaData = { ...metaData };
      // A clone of a guardian whose async verdict was still
      // provisional inherits the marker; re-arm the probe so the
      // copy settles it too instead of trusting a stale `false`.
      if (metaData.asyncPending === true) this._asyncProbePending = true;
    }
  }

  /**
   * Guardians whose async-ness this one inherits — a container's
   * children. Composite guardians (Object / Array / Tuple / Record /
   * Set / Map / DiscriminatedUnion) and {@link LazyGuardian} override
   * it; everything else has no children and the probe is a no-op.
   *
   * May THROW: a `lazy()` override resolves its thunk here, which
   * raises a TDZ `ReferenceError` while the target binding is still
   * unassigned. {@link _refreshAsyncProbe} catches that and keeps the
   * verdict provisional.
   *
   * @internal
   */
  protected _asyncProbeChildren(): ReadonlyArray<
    AsyncProbeTarget | undefined
  > {
    return [];
  }

  /**
   * Record that this guardian carries an async step. Subclasses that
   * also cache the verdict in a private field consulted by their
   * parse-time transform (`__async`) override this and flip it too.
   *
   * @internal
   */
  protected _markAsync(): void {
    this._metaData = { ...(this._metaData ?? {}), isAsync: true };
  }

  /**
   * Construction-time async probe, called by every composite guardian
   * once its children are assigned. Marks the guardian async when a
   * child already reports `isAsync`, and arms the deferred re-probe
   * when a child's verdict isn't available yet.
   *
   * @internal
   */
  protected _initAsyncProbe(): void {
    // An inherited flag (clone / explicit metadata) still has to reach
    // the subclass's parse-time cache.
    if (this._metaData?.isAsync === true) this._markAsync();
    this._asyncProbePending = true;
    this._refreshAsyncProbe();
  }

  /**
   * Re-run the child async probe while the verdict is provisional.
   *
   * Containers used to read `child.metaData?.isAsync` exactly once, at
   * their own construction. That is too early for `lazy()`: a
   * forward-referenced thunk target doesn't exist yet, so the parent
   * latched "sync" forever and a nested async step was silently
   * bypassed (its pending Promise was stored straight into the field
   * slot). Keeping the probe provisional until every `lazy()` in the
   * subtree resolves fixes that without costing anything on ordinary
   * schemas — `_asyncProbePending` is `false` for them from the start.
   *
   * The pending marker is published on `_metaData.asyncPending` so a
   * grandparent inherits it and keeps re-probing too. It is cleared
   * for the duration of the probe so a cyclic schema (which re-enters
   * through its own `lazy()`) doesn't see itself as pending and stay
   * provisional forever.
   *
   * @internal
   */
  protected _refreshAsyncProbe(): void {
    if (!this._asyncProbePending || this.__asyncProbing) return;
    this.__asyncProbing = true;
    this.__setAsyncPending(false);
    let pending = false;
    let hasAsyncChild = false;
    try {
      for (const child of this._asyncProbeChildren()) {
        const md = child?.metaData;
        if (md?.isAsync === true) hasAsyncChild = true;
        else if (md?.asyncPending === true) pending = true;
      }
    } catch {
      // A `lazy()` thunk in the child list isn't resolvable yet
      // (forward / mutual / self reference — the TDZ read throws).
      // Stay provisional; by parse time the binding is assigned.
      pending = true;
    } finally {
      this.__asyncProbing = false;
      // NOT an early return on the first async child: a container can
      // be async AND still hold an unresolved `lazy()` elsewhere in its
      // schema, and its parent needs both facts.
      if (hasAsyncChild) this._markAsync();
      this.__setAsyncPending(pending);
    }
  }

  /** Publish / clear the provisional marker. @internal */
  private __setAsyncPending(pending: boolean): void {
    this._asyncProbePending = pending;
    if (pending) {
      this._metaData = { ...(this._metaData ?? {}), asyncPending: true };
    } else if (this._metaData?.asyncPending !== undefined) {
      const { asyncPending: _dropped, ...rest } = this._metaData;
      // Collapse back to `undefined` when the marker was the only key,
      // so a guardian that never carried metadata keeps reporting
      // `metaData === undefined` once the probe settles.
      this._metaData = Object.keys(rest).length === 0 ? undefined : rest;
    }
  }

  /**
   * Refuse a rebuild-from-parts operation that would silently drop
   * previously chained steps.
   *
   * Object mode setters (`strict` / `strip` / `passthrough` /
   * `catchall`), object schema manipulation (`extend` / `pick` /
   * `omit` / `partial` / `required` / `property` / `merge` /
   * `deepPartial` / `renameField`) and tuple `rest()` / `labels()` all
   * construct a fresh guardian from the schema alone — the new
   * instance's transform closure has to bind to the NEW instance, so
   * the old `_composedTransform` cannot be carried over. Any
   * `.refine()` / `.superRefine()` / `.transform()` / `.process()`
   * step added first would vanish, quietly weakening validation (e.g.
   * `object({...}).refine(passwordsMatch).partial()` would accept data
   * violating the refinement). Throw instead; the idiomatic fix is to
   * derive first and chain afterwards.
   *
   * @param method - Name of the refusing method, for the message.
   * @param rebuiltFrom - What the fresh guardian is rebuilt from.
   * @internal
   */
  protected _assertNoChainedSteps(
    method: string,
    rebuiltFrom: string,
  ): void {
    if (this._composedTransform === this._baseTransform) return;
    throw new GuardianError(
      `Cannot call ${method}() after refinements or transforms have been ` +
        `chained — ${method}() rebuilds the guardian from its ` +
        `${rebuiltFrom} and would silently drop them. Call ${method}() ` +
        `BEFORE adding .refine()/.superRefine()/.transform()/.process() ` +
        `steps.`,
      {
        expected: `${method}() before refinements/transforms`,
        got: `${method}() after chained steps`,
        comparison: 'method_order',
        type: 'validation',
      },
    );
  }

  /**
   * Append a transform step to the chain. The workhorse method —
   * `.test`, `.equals`, `.minLength`, `.refine`, etc. all dispatch
   * through here.
   *
   * If `fn` is an `async function`, the chain flips to async-aware
   * composition; `parseAsync` becomes mandatory afterwards. Sync
   * functions that hand-roll a `Promise` return aren't detected
   * (use an `async` keyword if you need detection).
   *
   * @template U - Output type after this step.
   * @template V - Resulting guardian class.
   * @param fn - Receives the current chain output; returns the next.
   * @param constructor - Optional. Pass a guardian constructor (e.g.
   *   `NumberGuardian`) to change the runtime class of the result —
   *   useful when transforming string → number or similar. When
   *   omitted, the new instance is constructed from `this.constructor`
   *   so the runtime class is preserved.
   * @returns A fresh guardian carrying the extended chain. The
   *   receiving instance is never mutated.
   * @throws {GuardianError} If called after `.optional()` / `.nullable()`.
   *
   * @example
   * ```ts
   * import { Guardian, NumberGuardian } from '@tundralibs/guardian';
   *
   * // Stay in StringGuardian
   * Guardian.string().process((s) => s.trim());
   *
   * // Cross into NumberGuardian
   * Guardian.string().process((s) => parseInt(s, 10), NumberGuardian);
   * ```
   */
  process<U, V extends BaseGuardian<U> = BaseGuardian<U>>(
    fn: GuardianTransform<T, U>,
    constructor?: new (
      initialTransform?: GuardianTransform<unknown, U>,
      metaData?: GuardianMetaData,
    ) => V,
  ): V | BaseGuardian<U> {
    // Prevent further processing after nullable() or optional()
    if (this._metaData?.isNullable) {
      throw new GuardianError(
        'Cannot call process() after nullable(). nullable() is a finisher method.',
        {
          expected: 'process() before nullable()',
          got: 'process() after nullable()',
          comparison: 'method_order',
          type: 'validation',
        },
      );
    }
    if (this._metaData?.isOptional) {
      throw new GuardianError(
        'Cannot call process() after optional(). optional() is a finisher method.',
        {
          expected: 'process() before optional()',
          got: 'process() after optional()',
          comparison: 'method_order',
          type: 'validation',
        },
      );
    }

    const currentTransform = this._composedTransform;

    // Track async-ness at build time. The chain is async if any prior
    // step was async OR if the new `fn` is an async function.
    // `AsyncFunction` is detected by `constructor.name` — reliable for
    // `async function` and `async () => …`. Sync functions that hand-
    // roll a Promise return are not detected; users with that pattern
    // pay the same cost they did before (the `instanceof Promise` guard
    // on the async-aware branch still awaits a genuine leaked Promise).
    // Read through the getter so a deferred `lazy()` probe settles
    // first — otherwise a forward-referenced async child would still
    // read as sync here and compose the non-awaiting branch.
    const wasAsync = this.metaData?.isAsync === true;
    const newFnAsync = (fn as { constructor?: { name?: string } })
      .constructor?.name === 'AsyncFunction';
    const willBeAsync = wasAsync || newFnAsync;
    // Verdict still provisional (an unresolved `lazy()` in the
    // subtree)? Compose the awaiting branch defensively — it is
    // correct for sync values too, just marginally slower.
    const mayBecomeAsync = willBeAsync || this._asyncProbePending;

    // When the chain is purely sync, build a flat composition with no
    // per-call promise/thenable guard. Saves a branch + property read
    // per step per parse. Across a chain of 5-10 validators this is a
    // meaningful win on the hot path.
    const composedTransform: GuardianTransform<unknown, U> = mayBecomeAsync
      ? (input: unknown) => {
        const intermediateResult = currentTransform(input);
        // A genuine leaked async step is a real `Promise` — await it,
        // then apply `fn` to the resolution and gate the step's result
        // so a thenable-shaped VALUE is refused rather than adopted
        // (see `gateAsyncStepResult`). A non-`Promise` thenable HERE is
        // a value handed back by a prior sync step; threading it
        // through `.then` would let promise adoption destroy it, so
        // refuse it up front too. This keeps parseAsync's thenable
        // refusal uniform across every step boundary, not just the top.
        if (intermediateResult instanceof Promise) {
          return intermediateResult.then((resolved) =>
            gateAsyncStepResult(fn(resolved))
          );
        }
        if (isAdoptableThenable(intermediateResult)) {
          throw thenableResultError(intermediateResult);
        }
        return fn(intermediateResult);
      }
      // Sync branch: the chain is purely sync, so `currentTransform`
      // returns `T` not `T | Promise<T>` — cast helps TS narrow it.
      : (input: unknown) => fn(currentTransform(input) as T); //NOSONAR — load-bearing in sync branch

    // Clone the metadata so the caller can attach constraint flags
    // (e.g. minLength) without leaking into the parent.
    const nextMetaData: GuardianMetaData = {
      ...this._metaData,
      ...(willBeAsync ? { isAsync: true } : {}),
    };

    // Caller-supplied constructor (e.g. crossing string → number via
    // `.process(..., NumberGuardian)`) overrides the default
    // subclass-aware seam.
    if (constructor) {
      return new constructor(composedTransform, nextMetaData);
    }
    // Cross-generic cast: `composedTransform` is typed `<U>` but
    // `_cloneWith` parameterises on `<T>`. The cast through `unknown`
    // is required — the parameterisations are unrelated as far as TS
    // is concerned, even though the new instance's output type
    // genuinely IS `U`.
    return this._cloneWith(
      composedTransform as unknown as GuardianTransform<unknown, T>,
      nextMetaData,
    ) as unknown as BaseGuardian<U>;
  }

  /**
   * Hook subclasses override when they carry constructor-determined
   * invariants beyond `(initialTransform, metaData)` — e.g.
   * `ObjectGuardian` needs its `_schema` preserved and its `_mode`
   * carried over to the copy.
   *
   * Called by every immutable chain operation
   * (`process`, `nullable`, `optional`, `describe`). The default
   * implementation constructs a fresh instance via `this.constructor`
   * with **no initial transform** — some subclass constructors
   * (e.g. `StringGuardian`) wrap their `initialTransform` argument
   * with coercion logic, which would double-wrap the already-composed
   * transform passed here. We bypass that by assigning
   * `_composedTransform` directly after construction.
   *
   * @internal
   */
  protected _cloneWith(
    transform: GuardianTransform<unknown, T>,
    metaData: GuardianMetaData | undefined,
  ): this {
    const Ctor = this.constructor as new (
      initialTransform?: GuardianTransform<unknown, T>,
      metaData?: GuardianMetaData,
    ) => this;
    const cloned = new Ctor(undefined, metaData);
    cloned._composedTransform = transform;
    return cloned;
  }

  /**
   * Add a predicate step. Throws `GuardianError(error)` if `fn`
   * returns a falsy value; passes the input through unchanged
   * otherwise. Doesn't reshape data — use {@link process} if you
   * need to transform.
   *
   * @param fn - Predicate; truthy = pass, falsy = fail.
   * @param error - Custom message for the thrown `GuardianError`.
   * @param expected - Tooling hint stored on the error's `context.expected`.
   * @returns The guardian with the test applied.
   * @throws {GuardianError} If called after `.optional()` / `.nullable()`.
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * Guardian.string().test(
   *   (s) => s.length >= 5,
   *   'must be at least 5 characters',
   * );
   * ```
   */
  test(
    fn: (value: T) => unknown,
    error?: string,
    expected?: unknown,
  ): BaseGuardian<T> {
    // Prevent validation after nullable() or optional()
    if (this._metaData?.isNullable) {
      throw new GuardianError(
        'Cannot call test() after nullable(). nullable() is a finisher method.',
        {
          expected: 'test() before nullable()',
          got: 'test() after nullable()',
          comparison: 'method_order',
          type: 'validation',
        },
      );
    }
    if (this._metaData?.isOptional) {
      throw new GuardianError(
        'Cannot call test() after optional(). optional() is a finisher method.',
        {
          expected: 'test() before optional()',
          got: 'test() after optional()',
          comparison: 'method_order',
          type: 'validation',
        },
      );
    }

    // Detect an async predicate up front. The `test()` helper wraps
    // `fn` in a plain (sync) arrow that merely *returns* a Promise for
    // async predicates, so `process()`'s `AsyncFunction.name` check
    // can't see through the wrapper. Flip the async flag manually,
    // exactly as `refine()` does — otherwise a failing async predicate
    // would silently pass on the sync `parse()` path (which returns the
    // pending Promise, never awaiting the rejection).
    const isAsyncFn =
      (fn as { constructor?: { name?: string } }).constructor?.name ===
        'AsyncFunction';
    const result = this.process(test(fn, error, expected));
    if (isAsyncFn) {
      result._metaData ??= {};
      result._metaData.isAsync = true;
    }
    return result;
  }

  /**
   * Validates that the result equals the expected value.
   * Strict-equality check against `expected`. Throws on inequality.
   *
   * @throws {GuardianError} If called after `.optional()` /
   *   `.nullable()` (propagated from {@link process}).
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * Guardian.string().equals('admin', 'Only admin allowed');
   * ```
   */
  equals(expected: T, error?: string): this {
    return this.process(equals(expected, error)) as this;
  }

  /**
   * Strict-inequality check — input must NOT equal `expected`.
   *
   * @throws {GuardianError} If called after `.optional()` /
   *   `.nullable()` (propagated from {@link process}).
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * Guardian.string().notEquals('forbidden');
   * ```
   */
  notEquals(expected: T, error?: string): this {
    return this.process(notEquals(expected, error)) as this;
  }

  /**
   * Input must be present in `allowedValues`. Use this for small
   * allow-lists on already-typed values; for typed enums prefer
   * {@link Guardian.enum}.
   *
   * @throws {GuardianError} If called after `.optional()` /
   *   `.nullable()` (propagated from {@link process}).
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * Guardian.string().isIn(['draft', 'published', 'archived']);
   * ```
   */
  isIn(allowedValues: T[], error?: string): this {
    return this.process(isIn(allowedValues, error)) as this;
  }

  /**
   * Input must NOT be present in `forbiddenValues`.
   *
   * @throws {GuardianError} If called after `.optional()` /
   *   `.nullable()` (propagated from {@link process}).
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * Guardian.string().isNotIn(['admin', 'root', 'system']);
   * ```
   */
  isNotIn(forbiddenValues: T[], error?: string): this {
    return this.process(isNotIn(forbiddenValues, error)) as this;
  }

  /**
   * Add a refinement step — a predicate with a required message and
   * optional structured `path`. Sister method to {@link test} with
   * three differences:
   *
   *  1. The message is mandatory, encouraging human-readable failures.
   *  2. An optional `path` segment lands in `GuardianError.path` so
   *     form / API consumers can locate the failing value
   *     programmatically via {@link GuardianError.leafErrors}.
   *  3. Async validators (declared `async function`) are detected at
   *     build time and the chain flips to async-aware composition;
   *     `parseAsync` becomes mandatory.
   *
   * Errors thrown by the validator itself (rather than returned as
   * `false`) get wrapped with a `Refinement validation failed:` prefix
   * so they're distinguishable from predicate-returned-false failures.
   * Pre-existing `GuardianError`s pass through unchanged.
   *
   * @param validator - Predicate. Truthy result passes; falsy throws.
   * @param message   - Error message used when the predicate fails.
   * @param path      - Optional path segment (string key or number
   *   index) attached to the resulting error.
   *
   * @throws {GuardianError} If called after `.optional()` /
   *   `.nullable()` (propagated from {@link process}).
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * declare function emailExists(email: string): Promise<boolean>;
   *
   * // Cross-DB uniqueness check on a string
   * const UniqueEmail = Guardian.string()
   *   .email()
   *   .refine(
   *     async (v) => !(await emailExists(v)),
   *     'email is already taken',
   *   );
   *
   * // Cross-field invariant on an object (subclass uses this same API)
   * const Register = Guardian.object({
   *   password: Guardian.string().minLength(8),
   *   confirmPassword: Guardian.string(),
   * }).refine(
   *   (d) => d.password === d.confirmPassword,
   *   'passwords must match',
   *   'confirmPassword',
   * );
   * ```
   */
  refine(
    validator: (value: T) => boolean | Promise<boolean>,
    message: string,
    path?: string | number,
  ): this {
    const isAsyncFn =
      (validator as { constructor?: { name?: string } }).constructor?.name ===
        'AsyncFunction';

    const makeRefineError = (value: T): GuardianError =>
      new GuardianError(message, {
        expected: 'refinement validation to pass',
        got: value,
        comparison: 'refinement',
        type: 'refinement_failure',
        ...(path !== undefined ? { path: [path] } : {}),
      });

    const wrapThrow = (err: unknown, value: T): GuardianError => {
      if (err instanceof GuardianError) return err;
      return new GuardianError(
        `Refinement validation failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
        {
          expected: 'refinement validation to complete',
          got: value,
          comparison: 'refinement_validation',
          type: 'refinement_error',
          ...(path !== undefined ? { path: [path] } : {}),
        },
      );
    };

    const wrapped = (value: T): T | Promise<T> => {
      let isValid: boolean | Promise<boolean>;
      try {
        isValid = validator(value);
      } catch (err) {
        throw wrapThrow(err, value);
      }
      if (isValid instanceof Promise) {
        return isValid.then(
          (ok) => {
            if (!ok) throw makeRefineError(value);
            // The async predicate passed, so `value` flows on unchanged.
            // Returning it straight out of this native `.then` would let
            // promise adoption destroy a thenable-shaped `value`; gate it
            // so such a value is refused instead of silently adopted.
            return gateAsyncStepResult(value);
          },
          (err) => {
            throw wrapThrow(err, value);
          },
        );
      }
      if (isValid) return value;
      throw makeRefineError(value);
    };

    const result = this.process(wrapped) as this;
    // `wrapped` is a sync function that may return a Promise (the
    // async validator path) — `process()`'s `AsyncFunction.name`
    // check doesn't catch that, so flip the flag manually.
    if (isAsyncFn) {
      result._metaData ??= {};
      result._metaData.isAsync = true;
    }
    return result;
  }

  /**
   * Makes this guardian accept `null` (but **not** `undefined` — call
   * `.optional()` for that, or chain both for `T | null | undefined`).
   *
   * Deliberately does **not** accept a default value: `null` is a
   * caller-chosen value that means "explicitly empty", which is
   * semantically distinct from `undefined` ("absent"). Replacing it
   * with a default would silently lose information that the caller
   * went to the trouble of sending. `.nullable()` is a finisher, so
   * it seals the chain — you cannot `.process()` after it. If you
   * genuinely need to map `null` to a fallback, wrap the schema in
   * `Guardian.preprocess((x) => x ?? fallback, inner)`, which runs the
   * transform *before* the check and makes it explicit at the call site.
   *
   * Idempotent: calling `.nullable()` twice returns the same instance
   * without throwing, matching the semantics most fluent validation
   * libraries (Zod, Yup) follow.
   *
   * @returns This guardian narrowed to {@link FinishedGuardian}.
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * const nullableString = Guardian.string().nullable();
   * nullableString.parse('hello'); // 'hello'
   * nullableString.parse(null);    // null
   * nullableString.parse(undefined); // throws — undefined isn't accepted
   *
   * // For both null AND undefined, chain optional() too:
   * Guardian.string().nullable().optional().parse(undefined); // undefined
   * ```
   */
  nullable(): FinishedGuardian<T | null> {
    // Idempotent: already nullable → return this. Repeat-calls are
    // common in generic helpers that don't know the schema's state.
    if (this._metaData?.isNullable) {
      return this;
    }
    // The nullable wrapper short-circuits on `null` and delegates
    // everything else (including `undefined`) to the existing
    // transform — so `undefined` still throws via the inner type
    // validator unless `.optional()` is also chained.
    const currentTransform = this._composedTransform;
    const nullableTransform: GuardianTransform<unknown, T | null> = (
      value: unknown,
    ) => {
      if (value === null) return null;
      // `.optional()` is handled by its own wrapper (which runs
      // earlier or later in the chain depending on call order); the
      // common path here just delegates to the existing transform.
      return currentTransform(value);
    };
    const nextMetaData: GuardianMetaData = {
      ...this._metaData,
      isNullable: true,
    };
    return this._cloneWith(
      nullableTransform as GuardianTransform<unknown, T>,
      nextMetaData,
    );
  }

  /**
   * Makes this guardian accept `undefined`. With a `defaultValue`,
   * substitutes the default whenever the input is `undefined`;
   * without one, passes `undefined` through unchanged.
   *
   * Idempotent: calling `.optional()` twice returns the same
   * instance. A second call's default (if any) is **not** applied
   * — the schema is sealed on first call. Friendly to generic
   * helper code that doesn't know whether the schema is already
   * optional.
   *
   * @param defaultValue - Default value or function returning one.
   * @returns This guardian narrowed to {@link FinishedGuardian}.
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * Guardian.string().optional().parse(undefined);        // undefined
   * Guardian.string().optional('x').parse(undefined);     // 'x'
   * Guardian.string().optional().parse('hi');             // 'hi'
   * ```
   */
  optional(): FinishedGuardian<T | undefined>;
  optional<D>(defaultValue: D | (() => D)): FinishedGuardian<T | D>;
  optional<D>(
    _defaultValue?: D | (() => D),
  ): _OptionalImplReturn<T, D> {
    // Idempotent: already optional → return this. A second call
    // with a new default is intentionally ignored — the schema
    // shape is already sealed.
    if (this._metaData?.isOptional) {
      return this;
    }
    // Store the current transform before setting finisher flags
    // This allows us to use it in the optionalTransform even after finisher protection is enabled
    const currentTransform = this._composedTransform;

    const optionalTransform: GuardianTransform<
      unknown,
      T | D | undefined | null
    > = (
      value: unknown,
    ) => {
      // Handle undefined by returning default or undefined
      if (value === undefined) {
        if (_defaultValue === undefined) {
          return undefined;
        }

        if (typeof _defaultValue === 'function') {
          const result = (_defaultValue as () => D | Promise<D>)();
          // Route on `instanceof Promise` — a GENUINE async default —
          // not on the mere PRESENCE of a `then` property. A plain value
          // whose `then` is non-callable (e.g. `{ then: 'later' }`) is
          // data, not a promise; threading it through this native `.then`
          // would throw. This is the same callability-based decision
          // every other round-7 async-step boundary makes (a real
          // `Promise` is an async step; any other value — including a
          // non-Promise thenable — is validated as data, exactly like the
          // direct-value default path below; see `gateAsyncStepResult`).
          if (result instanceof Promise) {
            // Gate the validated default: if the transform yields a
            // thenable-shaped VALUE, returning it out of this native
            // `.then` would adopt (destroy) it, so refuse it uniformly
            // with every other async step boundary.
            return result.then((resolvedValue) =>
              gateAsyncStepResult(currentTransform(resolvedValue))
            );
          }
          // If the default is a computed value, validate it through the transform
          return currentTransform(result);
        }

        // If the default is a direct value, validate it through the transform
        return currentTransform(_defaultValue);
      }

      // If this guardian is also nullable, null should remain null
      // Otherwise, apply normal transformation which may reject null
      if (value === null && this._metaData?.isNullable) {
        return null;
      }

      // For all other values, call the current composed transform
      return currentTransform(value);
    };

    const newMetaData: GuardianMetaData = {
      ...this._metaData,
      isOptional: true,
      // Record default presence so container guardians (ObjectGuardian)
      // can route ABSENT keys through the optional handler — without
      // this flag a missing key is dropped and the default never fires.
      ...(_defaultValue !== undefined ? { hasDefault: true } : {}),
    };
    const returnInstance = this._cloneWith(
      optionalTransform as GuardianTransform<unknown, T>,
      newMetaData,
    );

    // The static return type widens via the overload signature — see
    // the two overloads above. At runtime there's only one shape;
    // `.nullable()` is what carries the `| null` widening, not this
    // method.
    return returnInstance;
  }

  /**
   * Validate `input` synchronously. Returns the transformed output;
   * throws `GuardianError` on validation failure.
   *
   * Throws if the chain contains any async step (use {@link parseAsync}
   * instead). The async-ness is tracked at build time — calling
   * `parse()` on an async chain throws before any user code runs.
   *
   * @throws {GuardianError} On validation failure, or when called on
   *   an async chain.
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * Guardian.string().minLength(3).parse('hello'); // 'hello'
   * ```
   */
  parse(input: unknown): T {
    // Read through the getter, not the field: it settles a deferred
    // `lazy()` probe first, so a forward-referenced / recursive async
    // schema is refused HERE rather than running the transform and
    // abandoning the rejected Promise it produces.
    if (this.metaData?.isAsync) {
      throw new GuardianError(
        'Cannot use parse() with async validation steps. Use parseAsync() instead.',
        {
          expected: 'synchronous guardian',
          got: 'guardian with async steps',
          comparison: 'sync',
          type: 'usage',
        },
      );
    }

    // Optional and nullable logic is now handled in the transform chain

    try {
      const result = this._composedTransform(input);
      // Guard the sync contract. A transform can still hand back a
      // Promise even when `isAsync` wasn't flagged at build time — e.g.
      // a hand-rolled promise-returning `.process()` fn, or an
      // `.optional(() => Promise…)` default whose thenable-ness can't
      // be known until it's actually computed. Returning that pending
      // Promise as if it were `T` silently bypasses validation, so
      // reject the sync call and point the caller at `parseAsync()`.
      //
      // Check for a genuine `Promise` (what an async step leaks), NOT
      // any thenable: a validated VALUE that merely happens to carry a
      // callable `.then` (`Guardian.unknown()` passthrough, a fluent
      // builder, an ORM query object) is legitimate data, not a leaked
      // async step, and must pass through rather than be rejected here.
      if (result instanceof Promise) {
        throw new GuardianError(
          'Cannot use parse() with async validation steps. Use parseAsync() instead.',
          {
            expected: 'synchronous guardian',
            got: 'guardian with async steps',
            comparison: 'sync',
            type: 'usage',
          },
        );
      }
      return result as T;
    } catch (error) {
      if (error instanceof GuardianError) {
        throw error;
      } else {
        throw new GuardianError(
          'Validation failed',
          {
            expected: 'valid value',
            got: input,
            comparison: 'custom',
            type: 'validation',
          },
        );
      }
    }
  }

  /**
   * Validate `input` asynchronously. Works on any chain — sync chains
   * take a fast path that skips the async-function overhead. Required
   * when any step in the chain is async (e.g. a refinement that does
   * a database lookup).
   *
   * **Thenable-shaped values cannot travel through this entry point —
   * on sync AND async chains alike.** Its return type is `Promise<T>`,
   * and the ECMAScript promise resolution procedure ADOPTS any thenable
   * it is handed — a validated value carrying a callable `then` would be
   * replaced by its resolution (and a non-settling thenable would hang
   * the caller forever). Rather than substitute data silently,
   * `parseAsync` refuses such a result and points at {@link parse} /
   * {@link safeParse}, which return it untouched.
   *
   * The sync fast path checks the final result directly. On an async
   * chain the value is destroyed by promise adoption BEFORE the final
   * result is observable, so the refusal is enforced at EVERY
   * value-adoption site instead (via `gateAsyncStepResult`) — not only
   * the top-level result, but each individual point where a validated
   * value is taken out of an async step. Concretely: only a real
   * `Promise` is ever `await`ed as a leaked async step; a non-`Promise`
   * value that merely LOOKS thenable (carries a callable `then`) is
   * refused rather than adopted. This gate runs on the fast path, the
   * slow path, `refine()`/`test()`'s async predicate paths, the
   * `process()` async composition wrapper, `optional()`'s async default,
   * `ObjectGuardian`'s async `superRefine()` accumulator, and — the case
   * that made this recur — every PER-CHILD adoption inside a composite
   * guardian's native-async transform: each object field and catchall
   * property (`ObjectGuardian`), each record key and value
   * (`RecordGuardian`), each array element (`ArrayGuardian`), each tuple
   * position and rest element (`TupleGuardian`), each map key and value
   * (`MapGuardian`), and each set element (`SetGuardian`), as well as
   * each composite's final aggregated result. A sync child whose value
   * is thenable-shaped is therefore refused at the point it would be
   * adopted, never silently replaced by its resolution — closing the
   * passthrough/catchall case where a validated object or record carries
   * a user-supplied `then` key.
   *
   * @throws {GuardianError} On validation failure (rejected Promise),
   *   or when the validated result is a thenable-shaped value (on
   *   either a sync or an async chain).
   *
   * @example
   * ```ts
   * import type { BaseGuardian } from '@tundralibs/guardian';
   *
   * declare const Schema: BaseGuardian<string>;
   * declare const input: unknown;
   *
   * const result = await Schema.parseAsync(input);
   * ```
   */
  parseAsync(input: unknown): Promise<T> {
    // Fast path for schemas with no async steps: avoid wrapping the
    // sync result in the async-function microtask. `async` would
    // force a Promise allocation + scheduling even when the
    // underlying transform is purely synchronous.
    // Read through the getter so a deferred `lazy()` probe settles
    // before the path is chosen.
    if (!this.metaData?.isAsync) {
      try {
        const result = this._composedTransform(input) as T;
        // `result` could still be a genuine Promise if a sync function
        // hand-rolled a Promise return (no AsyncFunction detection
        // catches that) — hand it straight back as the returned
        // promise. Anything else has to survive `Promise.resolve`,
        // which ADOPTS thenables: refuse those instead of silently
        // returning their resolution (see `thenableResultError`).
        if (result instanceof Promise) {
          return result as unknown as Promise<T>;
        }
        if (isAdoptableThenable(result)) {
          return Promise.reject(thenableResultError(result));
        }
        return Promise.resolve(result);
      } catch (error) {
        return Promise.reject(this.__wrapValidationError(error, input));
      }
    }
    // Async path: at least one step in the chain is genuinely async,
    // so the transform may return a Promise — await it.
    return this.__parseAsyncSlow(input);
  }

  private async __parseAsyncSlow(input: unknown): Promise<T> {
    try {
      const result = this._composedTransform(input);
      // Only a real `Promise` is a leaked async step worth awaiting. Its
      // resolution can no longer be a thenable-shaped VALUE: every async
      // step boundary in the chain gates its result through
      // `gateAsyncStepResult`, so a thenable is refused BEFORE promise
      // adoption can destroy it (awaiting here is therefore safe). This
      // remaining guard covers the case where an async-flagged chain's
      // transform returns a thenable VALUE synchronously (e.g. a sync
      // step under an unresolved `lazy()` probe) — refuse it loudly.
      if (result instanceof Promise) return await result;
      if (isAdoptableThenable(result)) {
        throw thenableResultError(result);
      }
      return result;
    } catch (error) {
      throw this.__wrapValidationError(error, input);
    }
  }

  private __wrapValidationError(error: unknown, input: unknown): Error {
    if (error instanceof GuardianError) return error;
    return new GuardianError('Validation failed', {
      expected: 'valid value',
      got: input,
      comparison: 'custom',
      type: 'validation',
    });
  }

  /**
   * Non-throwing parse. Returns `[error, data]` — `error` is `null`
   * on success (with `data` typed `T`), or a `GuardianError` on
   * failure (with `data === undefined`).
   *
   * The Go-style tuple makes branching cheap: `if (err) { … } else
   * { … data … }` without destructuring a result object.
   *
   * @example
   * ```ts ignore
   * const [err, user] = User.safeParse(req.body);
   * if (err) return badRequest(err);
   * // `user` is User here
   * ```
   */
  safeParse(input: unknown): GuardianSafeParseResult<T> {
    // Inlines `parse()`'s logic instead of delegating, so failures
    // pass through only ONE catch block, not two. (Earlier reverted
    // because `RecordGuardian` overrode `parse()` to apply
    // refinements post-transform — that override is gone now; the
    // base implementation weaves refinements into `_composedTransform`
    // for every guard, so this is safe again.) Cuts safeParse-on-
    // failure cost by ~30% on the bench.
    // Same getter read as `parse()` — settles a deferred `lazy()`
    // probe before deciding.
    if (this.metaData?.isAsync) {
      return [
        new GuardianError(
          'Cannot use parse() with async validation steps. Use parseAsync() instead.',
          {
            expected: 'synchronous guardian',
            got: 'guardian with async steps',
            comparison: 'sync',
            type: 'usage',
          },
        ),
        undefined,
      ];
    }
    try {
      const result = this._composedTransform(input);
      // Same sync-contract guard as `parse()` — a transform that hands
      // back a genuine Promise (hand-rolled async `.process()` fn, or an
      // async `.optional()` default) would otherwise be reported as a
      // successful `[null, <pending Promise>]`, silently bypassing
      // validation. Surface it as a usage error instead. A thenable-
      // shaped VALUE (callable `.then` on legitimate data) is NOT a
      // leaked async step and passes through — only a real `Promise` is
      // rejected here.
      if (result instanceof Promise) {
        throw new GuardianError(
          'Cannot use parse() with async validation steps. Use parseAsync() instead.',
          {
            expected: 'synchronous guardian',
            got: 'guardian with async steps',
            comparison: 'sync',
            type: 'usage',
          },
        );
      }
      return [null, result as T];
    } catch (error) {
      if (error instanceof GuardianError) return [error, undefined];
      // Mirror `parse()`'s wrapping behaviour for non-GuardianError
      // throws — same message, same context shape — so the contract
      // is identical regardless of which entry point you go through.
      return [
        new GuardianError(
          'Validation failed',
          {
            expected: 'valid value',
            got: input,
            comparison: 'custom',
            type: 'validation',
          },
        ),
        undefined,
      ];
    }
  }

  /**
   * Async sibling of {@link safeParse}. Same `[error, data]` contract;
   * use on chains that contain async steps.
   *
   * Inherits {@link parseAsync}'s thenable restriction — a validated
   * value carrying a callable `then` is reported as an error here
   * rather than silently replaced by its resolution. Use
   * {@link safeParse} for thenable-shaped data.
   */
  async safeParseAsync(
    input: unknown,
  ): Promise<GuardianSafeParseResult<T>> {
    try {
      const data = await this.parseAsync(input);
      return [null, data];
    } catch (error) {
      if (error instanceof GuardianError) {
        return [error, undefined];
      } else {
        return [
          new GuardianError(
            'Unexpected error during validation',
            {
              expected: 'valid input',
              got: input,
              comparison: 'unknown',
              type: 'unexpected',
            },
          ),
          undefined,
        ];
      }
    }
  }

  /**
   * Attaches documentation metadata to a fresh guardian (title,
   * description, examples, deprecated, format, …). Returns a new
   * instance — the original is not mutated, matching every other
   * chain method.
   *
   * Protected flags (`isNullable`, `isOptional`, `isAsync`) cannot be
   * set via this method.
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * const schema = Guardian.string()
   *   .minLength(3)
   *   .describe({
   *     title: 'Username',
   *     description: 'User account identifier',
   *     examples: ['john_doe', 'alice123'],
   *   });
   * schema.toOpenAPI();
   * // Includes title, description, and examples in OpenAPI schema
   * ```
   */
  describe(
    metadata: Omit<
      GuardianMetaData,
      'isNullable' | 'isOptional' | 'isAsync'
    >,
  ): this {
    return this._cloneWith(this._composedTransform, {
      ...this._metaData,
      ...metadata,
    });
  }

  /**
   * Explicit copy. Returns a structurally-equivalent fresh guardian.
   * Useful when reading code aloud — `const copy = schema.clone();
   * const variant = copy.something();` — even though every chain
   * method is immutable, so the parent is never at risk of mutation.
   */
  clone(): this {
    return this._cloneWith(
      this._composedTransform,
      this._metaData ? { ...this._metaData } : undefined,
    );
  }

  /**
   * Attach a **nominal brand** to the guardian's output type. Pure
   * compile-time machinery — the runtime value is unchanged, and the
   * validator chain is unmodified. The compiler sees the parsed value
   * as `T & { readonly __brand: B }`, so two structurally-identical
   * brands (`Brand<string, 'UserId'>` vs `Brand<string, 'OrderId'>`)
   * become assignment-incompatible.
   *
   * @template B - The brand tag — usually a string literal naming the
   *   semantic type (`'UserId'`, `'Email'`, `'SerialisedDate'`, etc.).
   *
   * @example
   * ```ts ignore
   * import { Guardian } from '@tundralibs/guardian';
   *
   * const UserId  = Guardian.string().uuid().brand<'UserId'>();
   * const OrderId = Guardian.string().uuid().brand<'OrderId'>();
   *
   * type UserId  = Guardian.infer<typeof UserId>;
   * type OrderId = Guardian.infer<typeof OrderId>;
   *
   * declare function deleteUser(id: UserId): void;
   *
   * deleteUser(UserId.parse('550e8400-e29b-41d4-a716-446655440000')); // OK
   * deleteUser(OrderId.parse('550e8400-e29b-41d4-a716-446655440000')); // ❌ compile error
   * ```
   */
  brand<B extends string | symbol>(): BaseGuardian<Brand<T, B>> {
    // Runtime no-op; brand lives entirely in the type signature. The
    // cast IS load-bearing — we're widening the static return type
    // without changing the value.
    return this as unknown as BaseGuardian<Brand<T, B>>; //NOSONAR
  }

  //#region Documentation Methods

  /**
   * Emit an OpenAPI 3.0 schema fragment. Carries type, constraints,
   * and the doc metadata set via {@link describe}. Use
   * {@link toJSONSchema} for JSON Schema 2020-12 instead — most
   * codegen pipelines (datamodel-codegen, json-schema-to-typescript)
   * speak that dialect.
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * Guardian.string().minLength(3).toOpenAPI();
   * // { type: 'string', minLength: 3 }
   * ```
   */
  toOpenAPI(): Record<string, unknown> { //NOSONAR
    const schema: Record<string, unknown> = {
      type: this._type,
    };

    // Add metadata if available
    if (this._metaData) {
      if (this._metaData.title) schema.title = this._metaData.title;
      if (this._metaData.description) {
        schema.description = this._metaData.description;
      }
      if (this._metaData.deprecated) {
        schema.deprecated = this._metaData.deprecated;
      }
      if (this._metaData.examples) schema.examples = this._metaData.examples;
      if (this._metaData.format) schema.format = this._metaData.format;

      // Handle nullable
      if (this._metaData.isNullable) {
        schema.nullable = true;
      }

      // Forward any remaining metadata as constraint keys —
      // standard JSON Schema / OpenAPI keywords like `minLength`,
      // `multipleOf`, etc. are routed straight through. Keys that
      // are Guardian-internal (`path`, `caseInsensitive`, the
      // protected finisher flags) are filtered so they don't leak
      // into the emitted schema.
      const internal = INTERNAL_METADATA_KEYS;
      for (const [key, value] of Object.entries(this._metaData)) {
        if (!internal.has(key)) {
          schema[key] = value;
        }
      }
    }

    return schema;
  }

  /**
   * Emit Markdown documentation for this guardian — title (heading),
   * description, type, examples, and a deprecation banner if set.
   * Useful for auto-generated reference docs.
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * Guardian.string().describe({ title: 'Username', examples: ['ada'] }).toMarkdown();
   * ```
   */
  toMarkdown(): string {
    let markdown = '';

    // Title
    if (this._metaData?.title) {
      markdown += `### ${this._metaData.title}\n\n`;
    }

    // Description
    if (this._metaData?.description) {
      markdown += `${this._metaData.description}\n\n`;
    }

    // Type and format info
    let typeInfo = `**Type:** ${this._type}`;
    if (this._metaData?.format) {
      typeInfo += ` (${this._metaData.format})`;
    }
    if (this._metaData?.isNullable) typeInfo += ', nullable';
    if (this._metaData?.isOptional) typeInfo += ', optional';
    markdown += `${typeInfo}\n\n`;

    // Examples
    if (this._metaData?.examples && this._metaData.examples.length > 0) {
      markdown += `**Examples:** `;
      markdown += this._metaData.examples.map((ex) =>
        `\`${JSON.stringify(ex)}\``
      ).join(', ');
      markdown += '\n\n';
    }

    // Deprecation warning
    if (this._metaData?.deprecated) {
      markdown += `> ⚠️ **Deprecated**\n\n`;
    }

    return markdown.trim();
  }

  /**
   * Emit a JSON Schema (Draft 2020-12) describing the **output** shape
   * of this guardian. Adapter over {@link toOpenAPI} that converts
   * OpenAPI-isms to JSON Schema vocabulary and adds the `$schema`
   * header.
   *
   * Note on what carries over:
   * - Static constraints (`minLength`, `pattern`, `minimum`,
   *   `enum`, `format`, `additionalProperties`, etc.) are emitted
   *   faithfully — downstream validators (AJV, Pydantic, rjsf)
   *   enforce them the same way Guardian does.
   * - **Procedural validation** (`.refine()`, `.test()`, custom
   *   predicates) is NOT expressible in JSON Schema and is omitted.
   *   The runtime Guardian remains stricter than the emitted schema.
   * - **Transforms** (`.process()`, `.transform()`) describe shape
   *   changes, not validation. We emit the post-transform shape
   *   (the type that `.parse()` returns).
   * - **Coerce-by-default semantics** (e.g. `Guardian.number()`
   *   accepting `'42'`) are NOT expressed — the schema's `type` is
   *   strict, so downstream tools will reject inputs the runtime
   *   would accept. Consumers wanting coerce-friendly schemas
   *   should run their inputs through Guardian first.
   * - **Custom error messages** are runtime-only; JSON Schema has
   *   no standard error-message vocabulary, so messages don't
   *   survive the conversion.
   *
   * @returns A self-contained JSON Schema 2020-12 object.
   *
   * @example
   * ```typescript
   * import { Guardian } from '@tundralibs/guardian';
   *
   * const userSchema = Guardian.object({
   *   id: Guardian.number().integer().positive(),
   *   name: Guardian.string().minLength(1),
   * });
   *
   * userSchema.toJSONSchema();
   * // {
   * //   $schema: 'https://json-schema.org/draft/2020-12/schema',
   * //   type: 'object',
   * //   properties: {
   * //     id:   { type: 'integer', minimum: 1 },
   * //     name: { type: 'string', minLength: 1 },
   * //   },
   * //   required: ['id', 'name'],
   * //   additionalProperties: false,
   * // }
   * ```
   */
  toJSONSchema(): Record<string, unknown> {
    const schema = this.toOpenAPI();
    const adapted = adaptOpenAPIToJSONSchema2020(schema) as Record<
      string,
      unknown
    >;
    return {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      ...adapted,
    };
  }

  //#endregion
}

/**
 * Recursively rewrites an OpenAPI 3.0 schema fragment into JSON Schema
 * 2020-12 vocabulary. Walks the object tree, fixing up the small set
 * of incompatibilities — see the JSDoc on `toJSONSchema` for the
 * carryover contract.
 *
 * @internal
 */
function adaptOpenAPIToJSONSchema2020(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map(adaptOpenAPIToJSONSchema2020);
  }
  if (node === null || typeof node !== 'object') return node;

  const src = node as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(src)) {
    if (!_jsonSchemaKeepsKey(key, src)) continue;
    if (key === 'example' && src.examples === undefined) {
      out.examples = [value];
      continue;
    }
    out[key] = adaptOpenAPIToJSONSchema2020(value);
  }

  _applyIntegerFix(src, out);
  _applyNullableFix(src, out);
  _applyConstFix(src, out);

  return out;
}

/**
 * Promote `enum: [v]` (single allowed value) to `const: v`. This is
 * the idiomatic 2020-12 form for literals and produces nicer codegen
 * (`Literal['x']` in Pydantic, `'x'` literal types in TypeScript)
 * vs a one-member enum. Runs at every depth so nested fields (e.g.
 * the discriminator field of a discriminated-union branch) also get
 * the promotion.
 *
 * @internal
 */
function _applyConstFix(
  src: Record<string, unknown>,
  out: Record<string, unknown>,
): void {
  if (Array.isArray(src.enum) && src.enum.length === 1) {
    out.const = src.enum[0];
    delete out.enum;
  }
}

/**
 * Decide whether an OpenAPI key carries over to the JSON Schema
 * 2020-12 output. `nullable` is handled separately by
 * {@link _applyNullableFix}; `example` is rewritten to `examples`;
 * OpenAPI-only annotation fields (`xml`, `externalDocs`) and the
 * OpenAPI-shape `discriminator` (DiscriminatedUnionGuardian emits
 * its own version) are dropped.
 *
 * @internal
 */
function _jsonSchemaKeepsKey(
  key: string,
  src: Record<string, unknown>,
): boolean {
  if (key === 'nullable') return false;
  if (key === 'example' && src.examples === undefined) return false;
  if (key === 'xml' || key === 'externalDocs') return false;
  if (key === 'discriminator') return false;
  return true;
}

/**
 * JSON Schema convention: integers use `type: 'integer'` rather than
 * `type: 'number'` + `format: 'integer'`. Guardian's `.integer()`
 * validator records it as a format; the rewrite happens here.
 *
 * @internal
 */
function _applyIntegerFix(
  src: Record<string, unknown>,
  out: Record<string, unknown>,
): void {
  const looksLikeInteger = src.format === 'integer' &&
    (src.type === 'number' || src.type === undefined);
  if (!looksLikeInteger) return;
  out.type = 'integer';
  delete out.format;
}

/**
 * Rewrite OpenAPI 3.0's `nullable: true` into JSON Schema's
 * `type: [originalType, 'null']` union. If `type` is already a
 * union (an array), append `'null'`.
 *
 * @internal
 */
function _applyNullableFix(
  src: Record<string, unknown>,
  out: Record<string, unknown>,
): void {
  if (src.nullable !== true) return;
  const t = out.type ?? src.type;
  if (typeof t === 'string') {
    out.type = [t, 'null'];
  } else if (Array.isArray(t)) {
    out.type = [...t as string[], 'null'];
  }
}
