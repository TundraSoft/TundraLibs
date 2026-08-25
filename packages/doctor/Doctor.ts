/**
 * @fileoverview The Container — a registry for vials and stocked
 * labels, plus the global `Doctor` instance every decorator and
 * consumer talks to. `Doctor.createContainer()` mints child containers
 * that read the global's registrations but keep their own instances.
 *
 * @module
 */

import {
  CircularDependencyError,
  DuplicateVialError,
  ScopeRequiredError,
  UnregisteredVialError,
} from './errors/mod.ts';
import type {
  DoctorContainer,
  Label,
  StockOptions,
  Vial,
  VialModes,
  VialOptions,
} from './types/mod.ts';

/**
 * Internal — one registration record per registered class or label.
 * `factory` always exists: {@link Injector.prescribe} wraps a bare
 * `new` for classes registered without one, so the lifecycle engine
 * never has to know which kind of key it is serving.
 */
type Registration = {
  mode: VialModes;
  factory: () => unknown;
};

/**
 * Internal — what the registry is keyed by: a class (by identity) or
 * a label (by its name, so two `label()` calls with the same name
 * address the same entry).
 */
type Key = Vial | string;

const VIAL_MODES: ReadonlySet<string> = new Set([
  'SINGLETON',
  'SCOPED',
  'TRANSIENT',
]);

/**
 * Distinguish the factory form of {@link Injector.stock} from a plain
 * value: an object carrying a valid `mode` and a function `factory`.
 */
function isStockOptions(value: unknown): value is StockOptions {
  return typeof value === 'object' && value !== null &&
    'mode' in value && typeof value.mode === 'string' &&
    VIAL_MODES.has(value.mode) &&
    'factory' in value && typeof value.factory === 'function';
}

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
 * The ambient **current container** stack, the sibling of
 * {@link ambientScopes}. Every container operation pushes `this` for
 * its duration, so an `inject()` running inside a container's
 * `dispense` / `resolve` — a field initializer or constructor default
 * of whatever is being built — resolves against **that** container
 * rather than the global {@link Doctor}.
 */
const ambientContainers: DoctorContainer[] = [];

/**
 * An optional **async-context** container provider, installed by a host
 * (e.g. an HTTP framework) via {@link setContainerProvider}. The sync
 * {@link ambientContainers} stack only spans a single synchronous
 * `dispense`/`resolve`, so it cannot carry a container across an
 * `await`. A host that already owns a per-request async context
 * (`AsyncLocalStorage`) installs a provider that reads the current
 * container out of it, so `inject()` inside an async request handler —
 * even after an `await` — resolves against that request's container.
 * `undefined` (the default) means no host is integrated and `inject()`
 * falls back to the global {@link Doctor}.
 */
let containerProvider: (() => DoctorContainer | undefined) | undefined;

/**
 * Install (or clear, with `undefined`) the async-context container
 * provider consulted by `inject()` when no synchronous container
 * operation is in flight — see {@link containerProvider}. Intended for a
 * single host framework to call ONCE at module load; the provider itself
 * reads per-request state from the host's async context, so one provider
 * serves every app and request. A later call replaces the previous one.
 *
 * @param provider - Returns the container for the current async context,
 *   or `undefined` to fall through to the global `Doctor`. Pass
 *   `undefined` to uninstall.
 */
export function setContainerProvider(
  provider: (() => DoctorContainer | undefined) | undefined,
): void {
  containerProvider = provider;
}

/**
 * Read the container `inject()` should resolve against: a synchronous
 * container operation in flight (top of the {@link ambientContainers}
 * stack — a `dispense`/`resolve` constructing right now) wins, since it
 * is the tightest scope; otherwise the async-context
 * {@link containerProvider}, if a host installed one; otherwise
 * `undefined`, and `inject()` falls back to the global {@link Doctor}.
 *
 * @internal Consumed by `inject()`; not part of the public surface.
 */
export function _ambientContainer(): DoctorContainer | undefined {
  return ambientContainers.at(-1) ?? containerProvider?.();
}

/**
 * A dependency-injection registry. Holds the registration record per
 * class or label, the singleton instance cache, and the per-scope
 * instance maps that back SCOPED resolution.
 *
 * Classes are keyed by constructor identity (the class itself), not by
 * `constructor.name`, so two classes that happen to share a name never
 * collide. Labels ({@link stock}) are keyed by **name** — that is what
 * makes `stock(label<Db>('Db'), db)` and `inject('Db')` meet.
 *
 * Injection happens **during construction**: `inject()` field
 * initializers and constructor default parameters pull their own
 * dependencies while `new` runs, so by the time `dispense` /
 * `resolve` hand an instance back it is fully wired. There is no
 * post-construction injection step.
 *
 * The global {@link Doctor} is a parentless container. A container from
 * {@link createContainer} holds a reference to its parent and reads
 * **registrations** through to it, while keeping its own singleton
 * instances, scope maps, and stocked values — so a child resolves a
 * parent's `@Vial` class as a distinct instance and can override any
 * dependency with {@link stock} without touching the parent or its
 * siblings.
 *
 * Not exported directly — consumers reach the global through the
 * {@link Doctor} constant below and children through
 * {@link createContainer}, both typed as {@link DoctorContainer}.
 */
class Container implements DoctorContainer {
  /**
   * The parent to read registrations through to, or `undefined` for the
   * global {@link Doctor}. Only registration lookups traverse it;
   * instances, scopes, and stock stay local.
   */
  private readonly __parent?: Container;

  /** Registrations — classes keyed by identity, labels by name. */
  private readonly __services = new Map<Key, Registration>();
  /**
   * Name → key, the index behind {@link dispenseByName}. A class is
   * indexed under its class name, a label under its own name, so
   * {@link inject} can resolve either by token without importing
   * anything. Among classes the last registration of a given name
   * wins; a label holds its name exclusively (see {@link stock}).
   */
  private readonly __byName = new Map<string, Key>();
  /** Cached SINGLETON instances. */
  private readonly __singletonInstances = new Map<Key, unknown>();
  /** Scope-name → (key → instance). */
  private readonly __scopes = new Map<string, Map<Key, unknown>>();
  /**
   * Keys whose resolution is currently in flight. Re-entering
   * {@link dispense} for a key already present here means the
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
  private readonly __resolving = new Set<Key>();

  /**
   * @param parent - The container to read registrations through to.
   *   Omitted for the global {@link Doctor}; set by {@link createContainer}
   *   for children.
   */
  constructor(parent?: Container) {
    this.__parent = parent;
  }

  /**
   * Mint a fresh **child** container whose parent is this one. The child
   * reads this container's registrations — a `@Vial` class or stocked
   * label resolvable here is resolvable in the child — but keeps its own
   * singleton instances, scope maps, and stocked overrides, so two
   * children get distinct instances of the same class and a child's
   * {@link stock} never touches this container or its siblings.
   */
  public createContainer(): DoctorContainer {
    return new Container(this);
  }

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
   *   registered, or a label is already stocked under its class name.
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
    if (typeof this.__byName.get(type.name) === 'string') {
      throw new DuplicateVialError(
        `Vial '${type.name}' collides with the label stocked under that name`,
        { vialName: type.name },
      );
    }
    const mode = typeof modeOrOptions === 'string'
      ? modeOrOptions
      : modeOrOptions.mode;
    const factory = typeof modeOrOptions === 'string'
      ? undefined
      : modeOrOptions.factory;
    this.__services.set(type, {
      mode,
      factory: factory ?? (() => Reflect.construct(type, [])),
    });
    this.__byName.set(type.name, type);
  }

  /**
   * Stock something ready-made — a value under a {@link Label} or bare
   * name, a ready instance under its class, or a labelled factory with
   * a lifecycle — so `inject(label)`, `inject(Class)` and
   * `inject('name')` can hand it out. A vial is made to order from a
   * class; a stocked item arrives already built.
   *
   * **Value form** — `stock(label, value)` hands out that very value on
   * every dispense: SINGLETON by nature. A function is a value here
   * too — it is returned as-is, never called.
   *
   * **Class form** — `stock(Class, instance)` puts a ready instance under
   * the class itself, as if `Class` had been prescribed SINGLETON and
   * already built: `inject(Class)`, `inject('Class')` and
   * {@link dispense} all hand out that instance. Value only — a class
   * that needs a factory is `prescribe(Class, { mode, factory })`. This
   * is how a test replaces a `@Vial` singleton with a fake:
   * `Doctor.revoke(Db); Doctor.stock(Db, fakeDb);`.
   *
   * **Factory form** — `stock(label, { mode, factory })` runs `factory`
   * through the same lifecycle engine as classes: once and cached for
   * SINGLETON, once per scope name for SCOPED (dropped by
   * {@link discharge}), on every dispense for TRANSIENT. A value whose
   * own shape is `{ mode, factory }` — a valid mode and a function — is
   * taken as this form.
   *
   * Stocked entries are keyed by **name**: `stock(label<Db>('Db'), db)`,
   * `inject('Db')` and {@link dispenseByName} all address the same
   * entry, and a name is held exclusively — the class form refuses a
   * name another class or label holds, where `prescribe` would let the
   * last class win. Factories are synchronous by design (injection runs
   * inside field initializers): `await` asynchronous setup first, then
   * stock the result.
   *
   * @param target - The class, the label, or its bare name, to stock
   *   under.
   * @param valueOrOptions - The value itself, or {@link StockOptions}.
   *
   * @throws {@link DuplicateVialError} When the name is already taken —
   *   by an earlier `stock`, or by a prescribed class of that name — or,
   *   in the class form, when the class itself is already registered.
   */
  public stock<T>(type: Vial<T>, value: NoInfer<T>): void;
  public stock<T>(labelOrName: Label<T> | string, value: NoInfer<T>): void;
  public stock<T>(
    labelOrName: Label<T> | string,
    options: StockOptions<NoInfer<T>>,
  ): void;
  public stock<T>(
    target: Vial<T> | Label<T> | string,
    valueOrOptions: T | StockOptions<T>,
  ): void {
    if (typeof target === 'function') {
      if (this.__services.has(target)) {
        throw new DuplicateVialError(
          `Vial '${target.name}' is already registered — revoke it first`,
          { vialName: target.name },
        );
      }
      if (this.__byName.has(target.name)) {
        throw new DuplicateVialError(
          `Vial '${target.name}' collides with the entry registered under that name`,
          { vialName: target.name },
        );
      }
      this.__services.set(target, {
        mode: 'SINGLETON',
        factory: () => valueOrOptions,
      });
      this.__byName.set(target.name, target);
      return;
    }
    const name = this.__nameOf(target);
    const holder = this.__byName.get(name);
    if (holder !== undefined) {
      throw new DuplicateVialError(
        typeof holder === 'string'
          ? `Label '${name}' is already stocked`
          : `Label '${name}' collides with the vial prescribed under that name`,
        { vialName: name },
      );
    }
    const reg: Registration = isStockOptions(valueOrOptions)
      ? { mode: valueOrOptions.mode, factory: valueOrOptions.factory }
      : { mode: 'SINGLETON', factory: () => valueOrOptions };
    this.__services.set(name, reg);
    this.__byName.set(name, name);
  }

  /**
   * Revoke the registration behind `target` — a class (by identity),
   * a label, or a bare name (whatever {@link dispenseByName} would
   * resolve it to) — also dropping any cached SINGLETON instance and
   * per-scope entries. Returns `true` when a registration was actually
   * removed.
   *
   * This is how a test swaps in a fake without {@link reset}, which
   * would wipe the whole process-wide registry:
   * `Doctor.revoke(Db); Doctor.stock(Db, fakeDb);` — `Db` a label or
   * a class.
   */
  public revoke(target: Vial | Label | string): boolean {
    const key = typeof target === 'function'
      ? target
      : this.__byName.get(this.__nameOf(target));
    if (key === undefined) return false;
    const removed = this.__services.delete(key);
    this.__singletonInstances.delete(key);
    for (const scopeMap of this.__scopes.values()) scopeMap.delete(key);
    // Only drop the name entry if it still points at this key — a
    // later same-named class registration may have overwritten it.
    const name = this.__nameOf(key);
    if (this.__byName.get(name) === key) this.__byName.delete(name);
    return removed;
  }

  /**
   * Hand out an instance of a registered vial — or whatever is stocked
   * under a label — honouring its mode. A label is a **typed name**: it
   * resolves exactly what {@link dispenseByName} would for that name.
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
   * @param vialOrLabel - The vial class, or the {@link Label}, to
   *   resolve.
   * @param scope - Scope name. Required for SCOPED entries; ignored
   *   for SINGLETON; becomes the ambient fallback for the
   *   dependencies of whatever this call constructs.
   *
   * @throws {@link UnregisteredVialError} When the class was never
   *   registered, or nothing is registered under the label's name.
   * @throws {@link ScopeRequiredError} When the entry is SCOPED and
   *   no `scope` was provided.
   * @throws {@link CircularDependencyError} When resolving the entry
   *   re-enters its own (still-in-flight) resolution — e.g. two
   *   eager `inject()` initializers that point at each other, or a
   *   TRANSIENT vial that depends on itself, directly or
   *   transitively.
   */
  public dispense<T = unknown>(
    vialOrLabel: Vial<T> | Label<T>,
    scope?: string,
  ): T {
    if (typeof vialOrLabel === 'function') {
      return this.__dispenseKey<T>(vialOrLabel, scope);
    }
    const key = this.__findKey(vialOrLabel.name);
    if (key === undefined) {
      throw new UnregisteredVialError(
        `Nothing stocked under label '${vialOrLabel.name}'`,
        { vialName: vialOrLabel.name },
      );
    }
    return this.__dispenseKey<T>(key, scope);
  }

  /**
   * Resolve a registered entry by its **name** — a class name, or a
   * label's name — the token {@link inject} uses. Backs
   * `inject('Token')` so consumers can resolve a dependency without
   * importing its class or label.
   *
   * @param name - The registered class's name, or the label's name.
   * @param scope - Scope name, forwarded to {@link dispense}.
   *
   * @throws {@link UnregisteredVialError} When nothing is registered
   *   under `name`.
   */
  public dispenseByName<T = unknown>(name: string, scope?: string): T {
    const key = this.__findKey(name);
    if (key === undefined) {
      throw new UnregisteredVialError(
        `No service registered under the name '${name}'`,
        { vialName: name },
      );
    }
    return this.__dispenseKey<T>(key, scope);
  }

  /**
   * Construct an instance of `type` with the given `scope` as the
   * ambient fallback for its dependencies. Honours a registered
   * `factory` when one exists — found via this container then its
   * parent, the same read-through {@link dispense} uses — otherwise a
   * bare `new` is used.
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
      const reg = this.__findRegistration(type);
      return reg ? reg.factory() as T : Reflect.construct(type, []) as T;
    });
  }

  /**
   * Boot-time preflight: eagerly dispense every registered SINGLETON —
   * prescribed classes and stocked labels alike — so that a missing
   * dependency or a throwing factory fails **now**, loudly, instead of
   * on first use deep inside a request. The intended counterweight to
   * lazy `inject()` getters, whose failures otherwise surface only at
   * first access.
   *
   * SCOPED and TRANSIENT entries cannot be preflighted — the one has
   * no scope to resolve under yet, the other has no cache for the
   * check to warm — so they are skipped.
   *
   * @returns The number of SINGLETON entries dispensed.
   *
   * @throws Whatever the first failing dispense throws
   *   ({@link UnregisteredVialError}, {@link CircularDependencyError},
   *   a factory's own error, …).
   */
  public checkup(): number {
    let checked = 0;
    for (const [key, reg] of this.__services) {
      if (reg.mode !== 'SINGLETON') continue;
      this.__dispenseKey(key);
      checked++;
    }
    return checked;
  }

  /**
   * Drop every instance stored under `scope`. Returns `true` when a
   * scope was actually removed. Registrations are untouched.
   */
  public discharge(scope: string): boolean {
    return this.__scopes.delete(scope);
  }

  /** Drop every scope — registrations are untouched. */
  public dischargeAll(): void {
    this.__scopes.clear();
  }

  /**
   * Drop every registration (classes and labels), every singleton
   * instance, and every scope. Intended for test isolation between
   * unrelated cases.
   */
  public reset(): void {
    this.__services.clear();
    this.__byName.clear();
    this.__singletonInstances.clear();
    this.__scopes.clear();
    // Balanced push/pop keeps these empty in normal operation; clear
    // defensively anyway so a test that threw mid-operation cannot
    // leak an ambient scope or container into the next case.
    ambientScopes.length = 0;
    ambientContainers.length = 0;
  }

  /** Whether a vial is currently registered for `type`. */
  public knows(type: Vial): boolean {
    return this.__services.has(type);
  }

  /**
   * Whether something can be dispensed for `target` — a class
   * registered by identity, or a label / bare name present in the
   * name index — checked in this container and, failing that, its
   * parent. The existence check for optional services:
   * `Doctor.has(Db) ? inject(Db) : undefined`.
   */
  public has(target: Vial | Label | string): boolean {
    const here = typeof target === 'function'
      ? this.__services.has(target)
      : this.__byName.has(this.__nameOf(target));
    return here || (this.__parent?.has(target) ?? false);
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
    // Push `this` too, so an `inject()` running during construction
    // resolves against this container rather than the global Doctor.
    ambientContainers.push(this);
    ambientScopes.push(scope);
    try {
      return op();
    } catch (err) {
      if (owned) this.__scopes.delete(scope);
      throw err;
    } finally {
      ambientScopes.pop();
      ambientContainers.pop();
    }
  }

  /**
   * {@link dispense} over an internal key — the one entry point
   * {@link dispense}, {@link dispenseByName} and {@link checkup} share.
   *
   * @internal
   */
  private __dispenseKey<T>(key: Key, scope?: string): T {
    return this.__run(scope, () => this.__dispense<T>(key, scope));
  }

  private __dispense<T>(key: Key, scope?: string): T {
    // Registration is read through to the parent, but every instance
    // this switch builds caches into THIS container's maps.
    const reg = this.__findRegistration(key);
    const name = this.__nameOf(key);
    // Only a class key can miss here: string keys always arrive via
    // the name index, which is kept in sync with the registrations.
    if (!reg) {
      throw new UnregisteredVialError(
        `No service registered for ${name}`,
        { vialName: name },
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
          // Construction IS injection: by the time this returns, the
          // instance's eager doses have resolved. Cache only on
          // success, so a failed construction retries next time.
          const instance = reg.factory() as T;
          this.__singletonInstances.set(key, instance);
          return instance;
        } finally {
          this.__resolving.delete(key);
        }
      }
      case 'SCOPED': {
        if (!scope) {
          throw new ScopeRequiredError(
            `${this.__describe(key)} is SCOPED and requires a scope name`,
            { vialName: name },
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
        if (scopeMap.has(key)) return scopeMap.get(key) as T;
        this.__guardCycle(key);
        this.__resolving.add(key);
        try {
          const instance = reg.factory() as T;
          scopeMap.set(key, instance);
          return instance;
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
          return reg.factory() as T;
        } finally {
          this.__resolving.delete(key);
        }
      }
    }
  }

  /**
   * Throw if `key` is already being resolved further up the call
   * stack — for SINGLETON / SCOPED that can only happen while the
   * instance is still constructing (it caches immediately after),
   * and for TRANSIENT it always means an unbreakable cycle.
   *
   * @internal
   *
   * @throws {@link CircularDependencyError} When `key` is currently
   *   in flight.
   */
  private __guardCycle(key: Key): void {
    if (this.__resolving.has(key)) {
      const name = this.__nameOf(key);
      throw new CircularDependencyError(
        `Circular dependency detected while resolving '${name}'`,
        { vialName: name },
      );
    }
  }

  /**
   * Find the registration for `key` in this container, then walk up to
   * the parent — the read-through that lets a child dispense a `@Vial`
   * class registered into the global. `undefined` when no ancestor
   * holds it.
   *
   * @internal
   */
  private __findRegistration(key: Key): Registration | undefined {
    return this.__services.get(key) ?? this.__parent?.__findRegistration(key);
  }

  /**
   * Resolve a name to its key via this container's name index, then the
   * parent's — so a label or bare name registered into the global
   * resolves from a child. `undefined` when no ancestor holds it.
   *
   * @internal
   */
  private __findKey(name: string): Key | undefined {
    return this.__byName.get(name) ?? this.__parent?.__findKey(name);
  }

  /** The display / index name of a key or label. */
  private __nameOf(keyOrLabel: Key | Label): string {
    return typeof keyOrLabel === 'string' ? keyOrLabel : keyOrLabel.name;
  }

  /** `Vial 'X'` or `Label 'X'`, for error messages. */
  private __describe(key: Key): string {
    return typeof key === 'string' ? `Label '${key}'` : `Vial '${key.name}'`;
  }
}

/**
 * The global container — the `@Vial` decorator and every `inject()`
 * call route through this object. It has no parent, so read-through is
 * a no-op and its behavior is exactly a plain registry;
 * {@link DoctorContainer.createContainer} mints children that read its
 * registrations but hold their own instances.
 */
export const Doctor: DoctorContainer = new Container();
