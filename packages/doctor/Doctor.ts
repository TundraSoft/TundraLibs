/**
 * @fileoverview The Injector — process-wide registry for vials, plus
 * the singleton `Doctor` instance every decorator and consumer
 * talks to.
 *
 * @module
 */

// deno-lint-ignore-file no-explicit-any
import { Singleton } from '@tundralibs/utils';
import 'reflect-metadata';

import {
  CircularDependencyError,
  DuplicateVialError,
  ScopeRequiredError,
  UnregisteredVialError,
} from './errors/mod.ts';
import type {
  Prescription,
  Vial,
  VialModes,
  VialOptions,
} from './types/mod.ts';

/**
 * Internal — one registration record per registered class.
 */
type Registration = {
  mode: VialModes;
  factory?: () => unknown;
};

/**
 * Internal — the bookkeeping for one in-flight registered `factory`.
 *
 * - `scope` — the driving operation's scope. It is the fallback for the
 *   factory's **return value only** (see {@link __runFactory}); a
 *   collaborator the factory builds but does not return never sees it.
 * - `treated` — every instance an `@Inoculate` wrapper auto-treated
 *   successfully with its own scope while this factory ran, so the driving
 *   resolution can tell whether the factory's return value was already
 *   treated and avoid treating it twice.
 * - `deferred` — every auto-treat that could not run with the instance's
 *   own scope because a `@Dose` dependency is SCOPED and the class declared
 *   no scope. The verdict waits for {@link __runFactory}: the factory's
 *   return value is entitled to the operation-scope fallback and is treated
 *   under it; any **other** deferred instance is a non-returned collaborator
 *   that must fail exactly as it did before the fallback existed, so its
 *   original error is re-raised. The instance is held (with its error) only
 *   for the frame's brief lifetime.
 */
type FactoryFrame = {
  scope: string | undefined;
  treated: WeakSet<object>;
  deferred: Array<{ instance: object; error: ScopeRequiredError }>;
};

/**
 * Process-wide dependency-injection registry. Holds the registration
 * record per class, the singleton instance cache, and the per-scope
 * instance maps that back SCOPED resolution.
 *
 * Storage is keyed by the constructor identity (the class itself),
 * not by `constructor.name`, so two classes that happen to share a
 * name never collide.
 *
 * Not exported directly — consumers reach the singleton through the
 * {@link Doctor} constant below.
 */
@Singleton
class Injector {
  /** Registered vials keyed by class identity. */
  private readonly __services = new Map<Vial, Registration>();
  /**
   * Class name → class, the index behind {@link dispenseByName}. Lets
   * {@link inject} resolve a vial by its token (the class name) without
   * importing the class. Last registration of a given name wins.
   */
  private readonly __byName = new Map<string, Vial>();
  /** Cached SINGLETON instances keyed by class identity. */
  private readonly __singletonInstances = new Map<Vial, unknown>();
  /** Scope-name → (class → instance). */
  private readonly __scopes = new Map<string, Map<Vial, unknown>>();
  /**
   * Vials whose resolution is currently in flight. Re-entering
   * {@link dispense} for a type already present here means the
   * dependency graph has a cycle that resolution cannot break, so a
   * {@link CircularDependencyError} is thrown instead of recursing
   * until the stack overflows. SINGLETON / SCOPED vials are cached
   * before their properties are injected, so a re-entrant dispense
   * for them hits the cache and never reaches this guard; only a
   * cycle that must construct a fresh instance (TRANSIENT, or the
   * brief window before a cached instance exists) trips it.
   */
  private readonly __resolving = new Set<Vial>();
  /**
   * The class Doctor is right now building via `Reflect.construct`
   * (`undefined` when it is not constructing). Set only for the tight
   * span of {@link __construct} — the bare-`new` an
   * {@link instantiate}/{@link resolve} performs — and restored to its
   * previous value afterwards, so nested constructions stack correctly.
   *
   * An `@Inoculate` wrapper reached via `super()` consults
   * {@link constructing} to skip its own `new`-time auto-treat **only
   * when it is running as the `super()` of this exact class** — the
   * driving `resolve`/`dispense` treats it once, afterwards, with the
   * caller's scope, so treating here too would double-inject. Matching by
   * identity (not by a global "an operation is in flight" flag) means an
   * unrelated `new SomeInoculated()` performed transitively during the
   * operation — inside a `@Vial` factory, or another constructor body —
   * is left to auto-treat normally.
   */
  private __constructing: unknown = undefined;
  /**
   * The factory frame currently executing on Doctor's behalf, or
   * `undefined` when no registered `factory` is running. A registered
   * `@Vial({ factory })` is Doctor's construction mechanism for that vial
   * exactly like the bare-`new` {@link __construct} path — but the factory
   * body is arbitrary user code, so unlike `__construct` it cannot be
   * bracketed by the {@link __constructing} identity marker (which class it
   * will `new`, and which of those it will *return*, is unknown up front).
   *
   * The frame carries the driving operation's `scope` and the bookkeeping
   * that keeps the factory path's **one-treat, return-value-scoped**
   * guarantee symmetric with the bare-`new` path:
   *
   * - **scope** — the operation-scope fallback, reserved for the factory's
   *   *return value*. {@link autoTreat} treats every instance with its own
   *   decoration scope; only when that fails for want of a scope does the
   *   instance become a *candidate* for the fallback, and {@link
   *   __runFactory} applies it after the factory returns — to the return
   *   value alone. A factory returning an `@Inoculate()` instance whose
   *   `@Dose` is SCOPED therefore resolves under the caller's scope, while a
   *   collaborator the factory does not return never inherits it.
   * - **treated** — every instance auto-treated during the factory is
   *   recorded here; {@link __runFactory} reports whether the factory's
   *   *return value* is one of them, and the driving `dispense`/`resolve`
   *   then skips its own `treat` on it — no double injection.
   *
   * Saved and restored around each factory so nested factories (a factory
   * whose body dispenses another factory-backed vial) stack correctly, the
   * same way {@link __construct} stacks `__constructing`.
   */
  private __factory: FactoryFrame | undefined = undefined;

  /**
   * Register a class with the given lifecycle. Short form takes the
   * mode literal; long form takes a {@link VialOptions} object with
   * an optional `factory` for classes that need constructor args.
   *
   * Singletons are constructed lazily on first {@link dispense} and
   * cached, so registration is cheap and free of side effects.
   *
   * @param type - The class to register.
   * @param modeOrOptions - Either a mode literal or a {@link VialOptions}.
   *
   * @throws {@link DuplicateVialError} When `type` is already
   *   registered.
   */
  public prescribe(type: Vial, mode: VialModes): void;
  public prescribe(type: Vial, options: VialOptions): void;
  public prescribe(
    type: Vial,
    modeOrOptions: VialModes | VialOptions,
  ): void {
    if (this.__services.has(type)) {
      throw new DuplicateVialError(
        `Vial '${type.name}' is already registered`,
        { vialName: type.name },
      );
    }
    const reg: Registration = typeof modeOrOptions === 'string'
      ? { mode: modeOrOptions }
      : { mode: modeOrOptions.mode, factory: modeOrOptions.factory };
    this.__services.set(type, reg);
    this.__byName.set(type.name, type);
  }

  /**
   * Revoke the registration for `type`, also dropping any cached
   * SINGLETON instance and per-scope entries. Returns `true` when
   * a registration was actually removed.
   *
   * Normalises `type` to the registered identity first — the same
   * `__unwrap` every other entry point uses — so a caller holding an
   * `@Inoculate` wrapper (the reverse `@Inoculate() @Vial()` order
   * registers the unwrapped original yet exports the wrapper) revokes
   * the vial it actually registered instead of silently missing every
   * map and returning `false`.
   */
  public revoke(type: Vial): boolean {
    const key = this.__services.has(type) ? type : this.__unwrap(type);
    const removed = this.__services.delete(key);
    this.__singletonInstances.delete(key);
    for (const scopeMap of this.__scopes.values()) scopeMap.delete(key);
    // Only drop the name entry if it still points at this class — a
    // later same-named registration may have overwritten it.
    if (this.__byName.get(key.name) === key) this.__byName.delete(key.name);
    return removed;
  }

  /**
   * Hand out an instance of a registered vial, honouring its mode.
   *
   * Every freshly-constructed instance is treated before being
   * returned, so dependency resolution cascades through the graph.
   *
   * When property injection fails, the freshly-cached SINGLETON /
   * SCOPED instance is evicted before the error propagates — a later
   * dispense (say, after the missing dependency has been registered)
   * constructs and treats a fresh instance instead of serving the
   * half-built one. When the whole operation fails and it had created a
   * brand-new scope map to serve this resolution, that map — empty or
   * still holding healthy SCOPED siblings built before the failure — is
   * dropped from `__scopes` (see {@link __run}), so a persistently
   * failing SCOPED dependency under unique per-request scope names does
   * not leak one scope per failed request.
   *
   * @param type - The vial class to resolve.
   * @param scope - Scope name. Required for SCOPED vials; ignored
   *   for SINGLETON; threaded to dependencies for TRANSIENT so
   *   that nested SCOPED dependencies see it.
   *
   * @throws {@link UnregisteredVialError} When `type` was never
   *   registered.
   * @throws {@link ScopeRequiredError} When `type` is SCOPED and
   *   no `scope` was provided.
   * @throws {@link CircularDependencyError} When resolving `type`
   *   re-enters its own (still-in-flight) resolution and the cycle
   *   cannot be broken by caching — e.g. a TRANSIENT vial that
   *   depends on itself, directly or transitively.
   */
  public dispense<T = unknown>(
    type: Vial<T>,
    scope?: string,
  ): T {
    return this.__run(scope, () => this.__dispense<T>(type, scope));
  }

  private __dispense<T = unknown>(
    type: Vial<T>,
    scope?: string,
  ): T {
    // A registration may be keyed by the binding the caller holds (the
    // wrapper, when `@Vial` sits above `@Inoculate`) or by the
    // unwrapped original (when the order is reversed — `@Inoculate`
    // above `@Vial`). Normalise to whichever identity the registry
    // actually knows so every cache and guard below — and every
    // resolution entry point (dispense, dispenseByName, resolve,
    // knows) — agrees on one key and never double-registers or
    // double-caches the same vial.
    const key = this.__services.has(type) ? type : this.__unwrap(type);
    const reg = this.__services.get(key);
    if (!reg) {
      throw new UnregisteredVialError(
        `No service registered for ${type.name}`,
        { vialName: type.name },
      );
    }

    switch (reg.mode) {
      case 'SINGLETON': {
        // `has`, not `!== undefined`: a factory may legitimately
        // produce a falsy instance, and that result must still cache.
        if (this.__singletonInstances.has(key)) {
          return this.__singletonInstances.get(key) as T;
        }
        this.__guardCycle(key);
        this.__resolving.add(key);
        try {
          // Cache the bare instance *before* property injection so a
          // SINGLETON ↔ SINGLETON cycle resolves: the re-entrant
          // dispense hits the cache above instead of recursing.
          const { instance, autoTreated } = this.__instantiate(key, reg, scope);
          this.__singletonInstances.set(key, instance);
          // A factory that returned a directly-`@Inoculate`d instance
          // already treated it once (under this operation's scope); treating
          // again would double-inject. `autoTreated` is false for every
          // other shape, so they still treat here exactly as before.
          if (!autoTreated) {
            try {
              this.treat(instance, scope);
            } catch (error) {
              // Injection failed — evict the half-built instance so the
              // next dispense retries treat() instead of serving it.
              this.__singletonInstances.delete(key);
              throw error;
            }
          }
          return instance as T;
        } finally {
          this.__resolving.delete(key);
        }
      }
      case 'SCOPED': {
        if (!scope) {
          throw new ScopeRequiredError(
            `Vial '${type.name}' is SCOPED and requires a scope name`,
            { vialName: type.name },
          );
        }
        let scopeMap = this.__scopes.get(scope);
        // The map has to be reachable from `__scopes` *before* injection
        // so a SCOPED ↔ SCOPED cycle can resolve against it. If the
        // operation then fails, the {@link __run} frame that created this
        // scope drops it — including this map, whether it is left empty or
        // still holds healthy SCOPED siblings — no matter how deeply that
        // frame is nested inside other operations.
        if (!scopeMap) {
          scopeMap = new Map();
          this.__scopes.set(scope, scopeMap);
        }
        // `has`, not `!== undefined` — see the SINGLETON case.
        if (scopeMap.has(key)) return scopeMap.get(key) as T;
        this.__guardCycle(key);
        this.__resolving.add(key);
        try {
          // Cache before injection, same reasoning as SINGLETON.
          const { instance, autoTreated } = this.__instantiate(key, reg, scope);
          scopeMap.set(key, instance);
          // Skip the second treat when the factory already treated its
          // returned `@Inoculate`d instance — same reasoning as SINGLETON.
          if (!autoTreated) {
            try {
              this.treat(instance, scope);
            } catch (error) {
              // Evict on injection failure — same reasoning as SINGLETON.
              scopeMap.delete(key);
              throw error;
            }
          }
          return instance as T;
        } finally {
          this.__resolving.delete(key);
        }
      }
      case 'TRANSIENT': {
        // TRANSIENT instances are never cached, so a cycle through
        // one can never terminate — detect it and throw rather than
        // overflowing the stack.
        this.__guardCycle(key);
        this.__resolving.add(key);
        try {
          const { instance, autoTreated } = this.__instantiate(key, reg, scope);
          // Skip the second treat when the factory already treated its
          // returned `@Inoculate`d instance under this operation's scope.
          if (!autoTreated) this.treat(instance, scope);
          return instance as T;
        } finally {
          this.__resolving.delete(key);
        }
      }
    }
  }

  /**
   * Resolve a registered vial by its **name** (the class name), the
   * token {@link inject} uses. Backs `inject('ClassName')` so consumers
   * can resolve a dependency without importing its class.
   *
   * @param name - The registered class's name.
   * @param scope - Scope name, forwarded to {@link dispense}.
   *
   * @throws {@link UnregisteredVialError} When no vial is registered
   *   under `name`.
   */
  public dispenseByName<T = unknown>(name: string, scope?: string): T {
    const type = this.__byName.get(name);
    if (!type) {
      throw new UnregisteredVialError(
        `No service registered under the name '${name}'`,
        { vialName: name },
      );
    }
    return this.dispense(type, scope) as T;
  }

  /**
   * Walk the `design:injectable` metadata on `instance.constructor`
   * and fill each declared dependency. Optional dependencies (whose
   * {@link Prescription.optional} is `true`) silently stay
   * `undefined` if their vial isn't registered. A nullish `instance`
   * (e.g. from a factory that returns `null`/`undefined`) is a no-op.
   *
   * @param instance - Patient to treat.
   * @param scope - Scope threaded to dependent resolutions.
   *
   * @throws {@link UnregisteredVialError} When a **required**
   *   dependency has no registered vial. An optional dependency that
   *   isn't registered is skipped, not thrown.
   * @throws {@link ScopeRequiredError} When a dependency being
   *   constructed is SCOPED and no `scope` was provided — including a
   *   registered *optional* dependency, not only required ones.
   */
  public treat(instance: any, scope?: string): void {
    this.__run(scope, () => this.__treat(instance, scope));
  }

  private __treat(instance: any, scope?: string): void {
    // A factory may hand back a nullish value (or a bare primitive);
    // there is no constructor to read injectable metadata from and
    // nothing to inject into, so treating it is a no-op.
    if (instance === null || instance === undefined) return;

    const deps: Prescription[] =
      Reflect.getMetadata('design:injectable', instance.constructor) ?? [];

    for (const dep of deps) {
      const { key, type, optional = false } = dep;
      // An optional dependency stays `undefined` only when its vial
      // isn't registered — that is the whole of the contract. A
      // *registered* optional dep is dispensed like any other, so a
      // genuine construction failure (a SCOPED dep resolved with no
      // scope, a throwing factory, a missing nested *required* dep)
      // surfaces instead of being silently swallowed.
      if (optional && !this.knows(type)) continue;
      instance[key] = this.dispense(type, scope);
    }
  }

  /**
   * The single injection site an `@Inoculate` wrapper uses at `new` time.
   * Outside any Doctor operation this is exactly {@link treat} with the
   * class's decoration-time scope — the pre-existing behaviour of a direct
   * `new Wrapped()`.
   *
   * Inside a registered `factory` Doctor is running on its behalf (see
   * {@link __runFactory}) it additionally makes the **factory's return
   * value** a first-class citizen of the one-treat guarantee — and *only*
   * the return value:
   *
   * - **Own scope, always.** Every instance is treated with its own
   *   `decorationScope` — never the operation-scope fallback. A collaborator
   *   the factory builds with plain `new` but does not return therefore
   *   behaves exactly as it does outside a factory: it resolves under its
   *   own decoration scope, and throws {@link ScopeRequiredError} if a
   *   `@Dose` dependency is SCOPED and it declared no scope. It can never
   *   silently inherit the operation scope.
   * - **Fallback candidacy, not fallback.** When that own-scope treat fails
   *   purely for want of a scope, the instance *might* be the value the
   *   factory returns — the one instance entitled to the operation-scope
   *   fallback. Rather than decide here (the factory has not returned yet),
   *   the instance and its error are recorded on the active frame's
   *   `deferred` list and the verdict is left to {@link __runFactory}: the
   *   return value is treated under the fallback there; any other deferred
   *   instance has its error re-raised. Candidacy applies only when a
   *   fallback scope actually exists and the class declared none of its own;
   *   every other failure propagates immediately, unchanged.
   * - **One-treat record.** An instance treated successfully under its own
   *   scope is registered on the active frame, so if the factory *returns*
   *   it the driving `dispense`/`resolve` recognises it as already treated
   *   and does not treat it a second time (which would double-build its
   *   dependencies).
   *
   * @param instance - The freshly built instance to inject.
   * @param decorationScope - The scope captured on the `@Inoculate`
   *   decorator, if any.
   *
   * @internal
   */
  public autoTreat(instance: any, decorationScope?: string): void {
    const frame = this.__factory;
    const isObject = (typeof instance === 'object' ||
      typeof instance === 'function') && instance !== null;
    try {
      // Own decoration scope only — never the operation-scope fallback. The
      // fallback belongs to the factory's RETURN VALUE and is applied once,
      // post-return, by __runFactory. Treating with the fallback here would
      // leak the operation scope into every collaborator the factory builds.
      this.treat(instance, decorationScope);
    } catch (error) {
      // Inside a factory, an own-scope treat that failed only because a
      // dependency is SCOPED and this class declared no scope MIGHT be the
      // factory's return value, which alone may fall back to the operation
      // scope. Defer the verdict to __runFactory instead of deciding now.
      // Only when a fallback scope exists and the class carries none of its
      // own; every other failure is the pre-existing behaviour — rethrow.
      if (
        frame !== undefined &&
        frame.scope !== undefined &&
        decorationScope === undefined &&
        isObject &&
        error instanceof ScopeRequiredError
      ) {
        frame.deferred.push({ instance, error });
        return;
      }
      throw error;
    }
    if (frame !== undefined && isObject) {
      frame.treated.add(instance);
    }
  }

  /**
   * Construct an instance of `type` with the given `scope` and
   * treat it before returning. Bypasses any `@Inoculate` wrapper
   * on `type` (it would otherwise treat with the decoration-time
   * scope, leading to double injection). When `type` is registered
   * with a `factory`, the factory constructs the instance — parity
   * with {@link dispense} — otherwise a bare `new` is used.
   *
   * Works for a subclass of an `@Inoculate`d base too: the wrapper runs
   * as the subclass's `super()` while this method builds the instance,
   * but its auto-treat is suppressed for that exact construction (see
   * {@link constructing} / {@link __construct}), so this method's own
   * `treat` (with the caller's `scope`) is the single injection site — no
   * decoration-time treat, no double injection. The suppression is keyed
   * to this construction only, so a subclass field initializer or the
   * base constructor that itself `new`s an unrelated `@Inoculate`d class
   * still auto-treats it.
   *
   * Use this when you need an unregistered class injected with a
   * specific scope — typically per-request handlers:
   *
   * ```typescript
   * class UserHandler {}
   * declare const id: string;
   *
   * const handler = Doctor.resolve(UserHandler, `req-${id}`);
   * ```
   *
   * For registered vials prefer {@link dispense}, which honours the
   * registered lifecycle and cache — `resolve` always constructs a
   * fresh instance, even for SINGLETON registrations.
   *
   * @throws {@link UnregisteredVialError} / {@link ScopeRequiredError}
   *   when a dependency cannot be resolved.
   */
  public resolve<T>(type: Vial<T>, scope?: string): T {
    return this.__run(scope, () => this.__resolve<T>(type, scope));
  }

  private __resolve<T>(type: Vial<T>, scope?: string): T {
    const target = this.__unwrap(type);
    // A registration may be keyed by either the binding the caller
    // holds (the wrapper, when `@Vial` sits above `@Inoculate`) or
    // the unwrapped original (when the order is reversed).
    const reg = this.__services.get(type) ?? this.__services.get(target);
    // A registered `factory` is user code: it may `new` arbitrary
    // collaborators, which must auto-treat normally, so it runs *outside*
    // the `__constructing` marker (through `__runFactory`). The bare-`new`
    // path runs inside it, so an `@Inoculate` wrapper reached as `target`'s
    // `super()` skips its own auto-treat and this method's `treat` is the
    // single injection. When the factory instead *returns* a directly
    // `@Inoculate`d instance it already treated once, `autoTreated` is true
    // and this method skips its own treat rather than double-injecting.
    const { instance, autoTreated } = reg?.factory
      ? this.__runFactory<T>(reg.factory, scope)
      : { instance: this.__construct<T>(target), autoTreated: false };
    if (!autoTreated) this.treat(instance, scope);
    return instance;
  }

  /**
   * Drop every instance stored under `scope`. Returns `true` when a
   * scope was actually removed. Vial registrations are untouched.
   */
  public discharge(scope: string): boolean {
    return this.__scopes.delete(scope);
  }

  /** Drop every scope — vial registrations are untouched. */
  public dischargeAll(): void {
    this.__scopes.clear();
  }

  /**
   * Drop every registration, every singleton instance, and every
   * scope. Intended for test isolation between unrelated cases.
   */
  public reset(): void {
    this.__services.clear();
    this.__byName.clear();
    this.__singletonInstances.clear();
    this.__scopes.clear();
  }

  /**
   * Whether a vial is currently registered for `type`. Mirrors
   * {@link dispense}: a vial decorated `@Inoculate` over `@Vial`
   * registers the unwrapped original yet exports the wrapper, so a
   * caller holding the wrapper is still told the vial is known.
   */
  public knows(type: Vial): boolean {
    return this.__services.has(type) ||
      this.__services.has(this.__unwrap(type));
  }

  /**
   * Run one Doctor operation ({@link resolve} / {@link dispense} /
   * {@link treat}) with the scope-lifecycle rollback every entry point
   * needs.
   *
   * Each frame decides on entry whether it **owns** `scope`: it does when
   * `scope` is given and its map was absent when this frame began. On
   * failure the owning frame — and only it — drops that map. Ownership is
   * per frame and depth-independent, so it lands on whichever frame first
   * observed the scope absent:
   *
   * - A **nested** operation into a *different* scope (e.g. a factory
   *   pulling a sub-resource under its own scope name) owns and rolls back
   *   the scope it created, even though an outer operation is still in
   *   flight — no scope leaks under unique per-request nested names.
   * - A nested operation into a scope an **outer** frame already created
   *   sees it present, does not own it, and leaves rollback to that outer
   *   frame — so a SCOPED↔SCOPED cycle within one scope is cleaned exactly
   *   once, taking any healthy siblings built before the failure with it.
   * - A **pre-existing** scope (a prior successful resolution's) is never
   *   owned here and so is never touched, whatever fails later.
   *
   * @internal
   */
  private __run<T>(scope: string | undefined, op: () => T): T {
    // We own `scope` iff it was absent when this frame began. Whichever
    // frame first observes it absent owns its rollback; nested frames on
    // the same scope see it already present and leave it to the owner.
    const owned = scope !== undefined && !this.__scopes.has(scope);
    try {
      return op();
    } catch (err) {
      if (owned) this.__scopes.delete(scope);
      throw err;
    }
  }

  /**
   * Whether Doctor is right now building `target` via `Reflect.construct`
   * — i.e. this exact class's `super()` chain is executing on Doctor's
   * behalf. An `@Inoculate` wrapper reached via that `super()` consults
   * this to skip its `new`-time auto-treat, which would otherwise
   * double-inject an instance the driving `resolve`/`dispense` treats
   * once afterwards. Matching by identity (not a global in-flight flag)
   * keeps an unrelated `new` performed during the operation auto-treating
   * normally.
   *
   * @internal
   */
  public constructing(target: unknown): boolean {
    return target !== undefined && this.__constructing === target;
  }

  /**
   * Construct a bare instance of `type`, honouring its `factory` if
   * one was registered. Does *not* run {@link treat} — the caller
   * caches the instance (for SINGLETON / SCOPED) before injecting
   * properties, so a dependency cycle can resolve against the cached
   * reference instead of recursing forever.
   *
   * The bare-`new` path constructs through {@link __construct} on
   * {@link __unwrap}: `@Vial('...') @Inoculate()` registers the Inoculate
   * *wrapper*, whose constructor treats with the decoration-time scope
   * before this method's caller can cache the instance. Building the
   * unwrapped original keeps dispense the single injection site (no
   * double injection) and keeps the cache-before-treat cycle-breaking
   * intact. A registered `factory` is user code and runs *outside* the
   * {@link __constructing} marker (through {@link __runFactory}), so any
   * `@Inoculate`d collaborator it builds with plain `new` still
   * auto-treats — and if it *returns* such an instance, `autoTreated` is
   * `true` so the caller skips its own treat rather than double-injecting.
   *
   * @returns The instance and whether the factory already auto-treated it
   *   (always `false` for the bare-`new` path, whose auto-treat is
   *   suppressed by the {@link __constructing} marker).
   *
   * @internal
   */
  private __instantiate<T>(
    type: Vial<T>,
    reg: Registration,
    scope: string | undefined,
  ): { instance: T; autoTreated: boolean } {
    return reg.factory ? this.__runFactory<T>(reg.factory, scope) : {
      instance: this.__construct<T>(this.__unwrap(type)),
      autoTreated: false,
    };
  }

  /**
   * Run a registered `factory` as Doctor's construction mechanism, with the
   * factory-frame bookkeeping the one-treat guarantee needs. For the frame's
   * lifetime {@link autoTreat} treats each `@Inoculate` instance with its own
   * decoration scope, recording the ones that succeed and *deferring* the
   * ones that fail purely for want of a scope. Once the factory has returned
   * this method settles those deferrals, applying the operation-scope
   * fallback to **only** the return value:
   *
   * - A deferred instance that is **not** the return value is a non-returned
   *   collaborator whose own scope was insufficient; the operation-scope
   *   fallback is not its to take, so its original {@link ScopeRequiredError}
   *   is re-raised — exactly what happened before the fallback existed.
   * - The **return value**, if deferred, is treated now under the operation
   *   scope (the fallback), so a factory returning an `@Inoculate()` instance
   *   whose `@Dose` is SCOPED resolves under the caller's scope. Because that
   *   treat happens after the factory returns, the return value's
   *   fallback-injected `@Dose` fields are not populated while the factory
   *   body still runs.
   *
   * The returned `autoTreated` flag says whether the factory's return value
   * was already treated (successfully under its own scope, or here under the
   * fallback) so the driving `dispense`/`resolve` does NOT treat it again.
   *
   * The previous frame is saved and restored, so a factory that dispenses
   * another factory-backed vial nests cleanly.
   *
   * @internal
   */
  private __runFactory<T>(
    factory: () => unknown,
    scope: string | undefined,
  ): { instance: T; autoTreated: boolean } {
    const previous = this.__factory;
    const frame: FactoryFrame = { scope, treated: new WeakSet(), deferred: [] };
    this.__factory = frame;
    let instance: T;
    try {
      instance = factory() as T;
    } finally {
      this.__factory = previous;
    }
    const isObject = (typeof instance === 'object' ||
      typeof instance === 'function') && instance !== null;
    // A deferred instance that is not the factory's return value is a
    // non-returned collaborator: the operation-scope fallback is reserved for
    // the return value, so restore its pre-fallback behaviour by re-raising
    // its own-scope failure. It never inherits the operation scope.
    for (const { instance: deferred, error } of frame.deferred) {
      if (!isObject || deferred !== (instance as unknown as object)) {
        throw error;
      }
    }
    // Only the return value can still be deferred here (the loop above threw
    // for any other), so it is the sole instance that falls back to the
    // operation scope — treated now, once, under it.
    if (isObject && frame.deferred.length > 0) {
      this.treat(instance, scope);
      return { instance, autoTreated: true };
    }
    const autoTreated = isObject &&
      frame.treated.has(instance as unknown as object);
    return { instance, autoTreated };
  }

  /**
   * Perform the bare `Reflect.construct(target)` that backs
   * {@link __instantiate} and {@link __resolve}, marking `target` as the
   * class under construction for its duration so an `@Inoculate` wrapper
   * reached as `target`'s `super()` skips its own auto-treat (the driving
   * operation treats once, afterwards). The previous marker is saved and
   * restored, so a construction nested inside another — a field
   * initializer that itself resolves — leaves the outer marker intact.
   *
   * @internal
   */
  private __construct<T>(target: Vial<T>): T {
    const previous = this.__constructing;
    this.__constructing = target;
    try {
      return Reflect.construct(target, []) as T;
    } finally {
      this.__constructing = previous;
    }
  }

  /**
   * Peel the `@Inoculate` wrapper off `type`, returning the original
   * class it wraps — or `type` itself when it isn't wrapped. The
   * marker is checked as an *own* property so a subclass of a wrapped
   * class (which inherits the marker through the static prototype
   * chain) is never unwrapped past itself.
   *
   * @internal
   */
  private __unwrap<T>(type: Vial<T>): Vial<T> {
    return Object.hasOwn(type, '__doctorOriginal')
      ? (type as any).__doctorOriginal as Vial<T>
      : type;
  }

  /**
   * Throw if `type` is already being resolved further up the call
   * stack — the only way that happens for SINGLETON / SCOPED is
   * before their instance is cached, and for TRANSIENT it always
   * means an unbreakable cycle.
   *
   * @internal
   *
   * @throws {@link CircularDependencyError} When `type` is currently
   *   in flight.
   */
  private __guardCycle(type: Vial): void {
    if (this.__resolving.has(type)) {
      throw new CircularDependencyError(
        `Circular dependency detected while resolving '${type.name}'`,
        { vialName: type.name },
      );
    }
  }
}

/**
 * The process-wide `Injector` instance — every `@Vial`, `@Dose`,
 * and `@Inoculate` decorator routes through this object.
 */
export const Doctor: Injector = new Injector();
