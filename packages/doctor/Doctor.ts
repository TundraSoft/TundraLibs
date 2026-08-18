/**
 * @fileoverview The Injector — process-wide registry for vials, plus
 * the singleton `Doctor` instance every decorator and consumer
 * talks to.
 *
 * @module
 */

import { Singleton } from '@tundralibs/utils';

import {
  CircularDependencyError,
  DuplicateVialError,
  ScopeRequiredError,
  UnregisteredVialError,
} from './errors/mod.ts';
import type { Vial, VialModes, VialOptions } from './types/mod.ts';

/**
 * Internal — one registration record per registered class.
 */
type Registration = {
  mode: VialModes;
  factory?: () => unknown;
};

/**
 * The ambient **operation scope** stack. Every Doctor operation
 * (`dispense` / `resolve`) pushes its `scope` argument for the
 * operation's duration; an `inject()` call that carries no explicit
 * scope of its own falls back to the top entry.
 *
 * This is what threads a caller's scope into construction:
 * `Doctor.resolve(Handler, 'req-7')` pushes `'req-7'`, `new Handler()`
 * runs its field initializers and constructor default parameters
 * (`db = inject('Db')`) inside that window, and each `inject()` that
 * names no scope of its own resolves under `'req-7'`.
 *
 * A lazy hand-rolled getter (`get db() { return this.__db ??=
 * inject('Db', 'jobs'); }`) resolving at first *access* usually runs
 * OUTSIDE any operation and therefore sees no ambient scope — name
 * the scope explicitly in such getters, since "whatever operation
 * happened to be in flight when someone first touched the property"
 * would be a nondeterministic scope to bind a memoized value to.
 */
const ambientScopes: (string | undefined)[] = [];

/**
 * Read the current ambient operation scope (top of the stack), or
 * `undefined` when no Doctor operation is in flight.
 *
 * @internal Consumed by `inject()`; not part of the public surface.
 */
export function _ambientScope(): string | undefined {
  return ambientScopes.at(-1);
}

/**
 * Process-wide dependency-injection registry. Holds the registration
 * record per class, the singleton instance cache, and the per-scope
 * instance maps that back SCOPED resolution.
 *
 * Storage is keyed by the constructor identity (the class itself),
 * not by `constructor.name`, so two classes that happen to share a
 * name never collide.
 *
 * Injection happens **during construction**: `inject()` field
 * initializers and constructor default parameters pull their own
 * dependencies while `new` runs, so by the time `dispense` /
 * `resolve` hand an instance back it is fully wired. There is no
 * post-construction injection step.
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
   * until the stack overflows.
   *
   * Because injection happens during construction, a cycle between
   * eager `inject()` initializers always trips this guard — the
   * second resolution re-enters before the first instance finished
   * constructing (and therefore before it was cached). Break such a
   * cycle by making at least one side a **lazy getter**
   * (`get b() { return this.__b ??= inject('B'); }`), which defers
   * its resolution until first access, after both instances exist.
   */
  private readonly __resolving = new Set<Vial>();

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
   */
  public revoke(type: Vial): boolean {
    const removed = this.__services.delete(type);
    this.__singletonInstances.delete(type);
    for (const scopeMap of this.__scopes.values()) scopeMap.delete(type);
    // Only drop the name entry if it still points at this class — a
    // later same-named registration may have overwritten it.
    if (this.__byName.get(type.name) === type) this.__byName.delete(type.name);
    return removed;
  }

  /**
   * Hand out an instance of a registered vial, honouring its mode.
   *
   * The instance wires itself while constructing: its `inject()`
   * field initializers and constructor default parameters resolve
   * against this registry, inheriting this call's `scope` as the
   * ambient fallback whenever they name no scope of their own.
   *
   * Instances cache only on **successful** construction. A failed
   * construction (a missing dependency, a throwing factory) caches
   * nothing, so a later dispense — say, after the missing dependency
   * has been registered — simply retries. When the whole operation
   * fails and it had created a brand-new scope map to serve this
   * resolution, that map — empty or still holding healthy SCOPED
   * siblings built before the failure — is dropped from the scope
   * store (see {@link __run}), so a persistently failing SCOPED
   * dependency under unique per-request scope names does not leak one
   * scope per failed request.
   *
   * @param type - The vial class to resolve.
   * @param scope - Scope name. Required for SCOPED vials; ignored
   *   for SINGLETON; becomes the ambient fallback for the
   *   dependencies of whatever this call constructs.
   *
   * @throws {@link UnregisteredVialError} When `type` was never
   *   registered.
   * @throws {@link ScopeRequiredError} When `type` is SCOPED and
   *   no `scope` was provided.
   * @throws {@link CircularDependencyError} When resolving `type`
   *   re-enters its own (still-in-flight) resolution — e.g. two
   *   eager `inject()` initializers that point at each other, or a
   *   TRANSIENT vial that depends on itself, directly or
   *   transitively.
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
    const reg = this.__services.get(type);
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
        if (this.__singletonInstances.has(type)) {
          return this.__singletonInstances.get(type) as T;
        }
        this.__guardCycle(type);
        this.__resolving.add(type);
        try {
          // Construction IS injection: by the time this returns, the
          // instance's eager doses have resolved. Cache only on
          // success, so a failed construction retries next time.
          const instance = this.__instantiate<T>(type, reg);
          this.__singletonInstances.set(type, instance);
          return instance;
        } finally {
          this.__resolving.delete(type);
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
        // The map has to be reachable from `__scopes` before
        // construction so the {@link __run} frame that created this
        // scope can drop it on failure — including this map, whether
        // it is left empty or still holds healthy SCOPED siblings —
        // no matter how deeply that frame is nested inside other
        // operations.
        if (!scopeMap) {
          scopeMap = new Map();
          this.__scopes.set(scope, scopeMap);
        }
        // `has`, not `!== undefined` — see the SINGLETON case.
        if (scopeMap.has(type)) return scopeMap.get(type) as T;
        this.__guardCycle(type);
        this.__resolving.add(type);
        try {
          const instance = this.__instantiate<T>(type, reg);
          scopeMap.set(type, instance);
          return instance;
        } finally {
          this.__resolving.delete(type);
        }
      }
      case 'TRANSIENT': {
        // TRANSIENT instances are never cached, so a cycle through
        // one can never terminate — detect it and throw rather than
        // overflowing the stack.
        this.__guardCycle(type);
        this.__resolving.add(type);
        try {
          return this.__instantiate<T>(type, reg);
        } finally {
          this.__resolving.delete(type);
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
   * Construct an instance of `type` with the given `scope` as the
   * ambient fallback for its dependencies. Honours a registered
   * `factory` when one exists — parity with {@link dispense} —
   * otherwise a bare `new` is used.
   *
   * Use this when you need an **unregistered** class wired under a
   * specific scope — typically per-request handlers:
   *
   * ```typescript
   * const handler = Doctor.resolve(UserHandler, `req-${id}`);
   * ```
   *
   * The handler's `inject()` field initializers and constructor
   * default parameters that name no scope of their own resolve under
   * `req-${id}` while it constructs.
   *
   * For registered vials prefer {@link dispense}, which honours the
   * registered lifecycle and cache — `resolve` always constructs a
   * fresh instance, even for SINGLETON registrations.
   *
   * @throws {@link UnregisteredVialError} / {@link ScopeRequiredError}
   *   when a dependency cannot be resolved.
   */
  public resolve<T>(type: Vial<T>, scope?: string): T {
    return this.__run(scope, () => {
      const reg = this.__services.get(type);
      return reg?.factory
        ? reg.factory() as T
        : Reflect.construct(type, []) as T;
    });
  }

  /**
   * Boot-time preflight: eagerly dispense every registered SINGLETON
   * so that a missing dependency or a throwing factory fails **now**,
   * loudly, instead of on first use deep inside a request. The
   * intended counterweight to lazy `inject()` getters, whose
   * failures otherwise surface only at first access.
   *
   * SCOPED and TRANSIENT vials cannot be preflighted — the one has no
   * scope to resolve under yet, the other has no cache for the check
   * to warm — so they are skipped.
   *
   * @returns The number of SINGLETON vials dispensed.
   *
   * @throws Whatever the first failing dispense throws
   *   ({@link UnregisteredVialError}, {@link CircularDependencyError},
   *   a factory's own error, …).
   */
  public checkup(): number {
    let checked = 0;
    for (const [type, reg] of this.__services) {
      if (reg.mode !== 'SINGLETON') continue;
      this.dispense(type);
      checked++;
    }
    return checked;
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
    // Balanced push/pop keeps this empty in normal operation; clear
    // defensively anyway so a test that threw mid-operation cannot
    // leak an ambient scope into the next case.
    ambientScopes.length = 0;
  }

  /** Whether a vial is currently registered for `type`. */
  public knows(type: Vial): boolean {
    return this.__services.has(type);
  }

  /**
   * Run one Doctor operation ({@link dispense} / {@link resolve})
   * inside its ambient-scope window, with the scope-lifecycle
   * rollback every entry point needs.
   *
   * The operation's `scope` is pushed onto the ambient stack for the
   * duration, so `inject()` calls resolving during the operation
   * inherit it as their fallback.
   *
   * Each frame decides on entry whether it **owns** `scope`: it does
   * when `scope` is given and its map was absent when this frame
   * began. On failure the owning frame — and only it — drops that
   * map. Ownership is per frame and depth-independent, so it lands on
   * whichever frame first observed the scope absent:
   *
   * - A **nested** operation into a *different* scope (e.g. a factory
   *   pulling a sub-resource under its own scope name) owns and rolls
   *   back the scope it created, even though an outer operation is
   *   still in flight — no scope leaks under unique per-request
   *   nested names.
   * - A nested operation into a scope an **outer** frame already
   *   created sees it present, does not own it, and leaves rollback
   *   to that outer frame.
   * - A **pre-existing** scope (a prior successful resolution's) is
   *   never owned here and so is never touched, whatever fails later.
   *
   * @internal
   */
  private __run<T>(scope: string | undefined, op: () => T): T {
    // We own `scope` iff it was absent when this frame began.
    const owned = scope !== undefined && !this.__scopes.has(scope);
    ambientScopes.push(scope);
    try {
      return op();
    } catch (err) {
      if (owned) this.__scopes.delete(scope);
      throw err;
    } finally {
      ambientScopes.pop();
    }
  }

  /**
   * Construct a bare instance of `type`, honouring its `factory` if
   * one was registered. The instance injects itself while
   * constructing (`inject()` field initializers and constructor
   * default parameters); there is no separate injection step.
   *
   * @internal
   */
  private __instantiate<T>(type: Vial<T>, reg: Registration): T {
    return reg.factory ? reg.factory() as T : Reflect.construct(type, []) as T;
  }

  /**
   * Throw if `type` is already being resolved further up the call
   * stack — for SINGLETON / SCOPED that can only happen while the
   * instance is still constructing (it caches immediately after),
   * and for TRANSIENT it always means an unbreakable cycle.
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
 * The process-wide `Injector` instance — the `@Vial` decorator and
 * every `inject()` call route through this object.
 */
export const Doctor: Injector = new Injector();
