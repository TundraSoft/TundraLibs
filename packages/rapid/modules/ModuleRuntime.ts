/**
 * @fileoverview `ModuleRuntime` — the module system without transports:
 * the event bus, the registry of mounted modules and their methods, and
 * the invocation cycle that `invoke` and event delivery run through.
 * `initModules()` creates one; an `Application` will own one and
 * `app.modules()` delegates to it (integration step, after the POC).
 *
 * PERFORMANCE NOTES (this is the hot path for in-process collaboration):
 * - middleware chains are composed ONCE at mount, per method;
 * - event names are qualified ONCE at mount (leaf → full, per module);
 * - the cycle is sync-through inside: a sync method + sync middleware runs
 *   without allocating a promise (the public `invoke` still resolves ONE);
 * - ONE AsyncLocalStorage frame per invocation: the in-flight context rides
 *   the ambient bag under a NON-ENUMERABLE symbol slot, so it never spreads
 *   into log records and no second store is entered;
 * - the correlation id for an emission is resolved once, not per delivery;
 * - a no-subscriber publish allocates nothing.
 *
 * @module
 */

import { ambient } from '@tundralibs/ambient';
import { Application } from '../Application.ts';
import type { DoctorContainer } from '@tundralibs/doctor';
import type { Slogger } from '@tundralibs/slogger';
import type { ConfigType } from '@tundralibs/utils';
import { RapidError } from '../errors/mod.ts';
import { middlewareOf, onEventsOf } from '../decorators/registry.ts';
import { attachContainer } from '../utils/requestContainer.ts';
import { EventContext } from './EventContext.ts';
import {
  type EventSubscriber,
  NAME_PATTERN,
  NAMESPACE_PATTERN,
  RapidEvents,
} from './events.ts';
import { InvokeContext } from './InvokeContext.ts';
import {
  _attach,
  _detach,
  RapidModule,
  type RapidModuleLifecycle,
} from './RapidModule.ts';
import { Reply } from './reply.ts';
import type {
  RapidModuleClass,
  RapidModuleContext,
  RapidModuleEventMap,
  RapidModuleInvokeMiddleware,
  RapidModuleInvokeResultOf,
  RapidModuleInvokeSeed,
  RapidModuleMethodKeys,
} from '../types/mod.ts';

// deno-lint-ignore no-explicit-any
type AnyFn = (...args: any[]) => unknown;
type AnyModule = RapidModule<RapidModuleEventMap>;
type Ctx = InvokeContext | EventContext;
type Chain = (
  ctx: InvokeContext,
  next: () => void | Promise<void>,
) => void | Promise<void>;
type MethodEntry = { fn: AnyFn; chain: Chain | undefined };
type Subscription = {
  fn: AnyFn;
  events: readonly string[];
  label: string;
  /** [event, wrapper] pairs registered at finalize — removed at dispose. */
  wired: [string, EventSubscriber][];
};
type Mounted = {
  instance: AnyModule;
  /** `namespace:Name`. */
  key: string;
  methods: Map<string, MethodEntry>;
  subscriptions: Subscription[];
  initialized: boolean;
};
/**
 * Per-invocation dispatch bookkeeping: the method's promise (when async)
 * and whether it has settled — so a middleware that forgot to `return
 * next()` cannot finish the invocation early or orphan a rejection.
 */
type Holder = { pending: Promise<void> | undefined; settled: boolean };

/** The in-flight context rides the ambient bag here — non-enumerable, never logged. */
const CURRENT: unique symbol = Symbol('rapid.modules.current');
type Bag = Record<string, unknown> & { [CURRENT]?: Ctx };

const LIFECYCLE = new Set(['init', 'dispose']);
const NOOP = (): void => {};
const NO_CONTENT: Reply<null> = Object.freeze(new Reply(204, null));

const isThenable = (v: unknown): v is Promise<unknown> =>
  v !== null && typeof v === 'object' &&
  typeof (v as { then?: unknown }).then === 'function';

/** The in-flight context, if any. */
const currentOf = (): Ctx | undefined =>
  (ambient.get() as Bag | undefined)?.[CURRENT];

/** An explicit `reply()` passes through; `undefined` is 204; anything else is 200 content. */
const toReply = (value: unknown): Reply =>
  value instanceof Reply
    ? value
    : value === undefined
    ? NO_CONTENT
    : new Reply(200, value);

/** Minimal onion over invoke middleware (same semantics as utils/compose). */
const compose = (
  middleware: readonly RapidModuleInvokeMiddleware[],
): Chain => {
  return (ctx, next) => {
    let index = -1;
    const dispatch = (i: number): void | Promise<void> => {
      if (i <= index) {
        throw new Error('next() called multiple times');
      }
      index = i;
      return i === middleware.length
        ? next()
        : middleware[i]!(ctx, () => dispatch(i + 1));
    };
    return dispatch(0);
  };
};

export class ModuleRuntime {
  /** The host's logger (ambient-correlated at emit time). */
  public readonly log: Slogger;
  /** The host's configuration. */
  public readonly config: ConfigType;
  private readonly __events: RapidEvents;
  private readonly __mode: 'DEVELOPMENT' | 'PRODUCTION';
  private readonly __ownsLog: boolean;
  private readonly __container?: DoctorContainer;
  private readonly __mounted = new Map<object, Mounted>();
  private readonly __order: Mounted[] = [];
  private readonly __declared = new Set<string>();
  /** Fire-and-forget emissions still settling (see {@link drain}). */
  private readonly __pending = new Set<Promise<unknown>>();
  private __finalized = false;
  private __disposed = false;

  /**
   * @param context - The host context.
   * @param ownsLog - Whether the runtime BUILT `context.log` itself (the
   *   standalone path) and must `finalize()` it on dispose.
   * @param container - The app's doctor container, pinned on each invoke's
   *   ambient bag so a module method's `inject()` resolves against it.
   *   Omitted (standalone / global) → invoke-time `inject()` falls back to
   *   the global `Doctor`.
   */
  constructor(
    context: RapidModuleContext,
    ownsLog = false,
    container?: DoctorContainer,
  ) {
    this.log = context.log;
    this.config = context.config;
    this.__mode = context.mode ?? 'PRODUCTION';
    this.__ownsLog = ownsLog;
    this.__container = container;
    this.__events = new RapidEvents(context.log);
  }

  /** The invocation currently in flight, or `undefined` outside one. */
  public get current(): Ctx | undefined {
    return currentOf();
  }

  /** Mounted module instances, in mount order. */
  public get modules(): readonly AnyModule[] {
    return this.__order.map((m) => m.instance);
  }

  /** Every fully-qualified event the mounted modules declare. */
  public get declaredEvents(): readonly string[] {
    return [...this.__declared];
  }

  /** `true` after {@link dispose}. */
  public get disposed(): boolean {
    return this.__disposed;
  }

  /**
   * Register a module instance: validate its identity, qualify its
   * events, attach the host context, index its invokable methods
   * (composing each `@Use` chain once) and collect its `@On`
   * subscriptions. Subscriptions are wired — and validated against every
   * mounted declaration — at {@link finalize}.
   *
   * @throws {RapidError} RAPID_CONFIG when the instance is not a
   *   `RapidModule`, its `name`/`namespace`/`events` are missing or
   *   malformed (an abstract base exported from the barrel looks exactly
   *   like this), a `@Use` sits on an `@On` handler, the class or
   *   `namespace:Name` is already mounted, or the runtime is finalized or
   *   disposed.
   */
  public mount(instance: AnyModule): void {
    if (this.__disposed) throw this.__disposedError('mount');
    if (this.__finalized) {
      throw new RapidError('RAPID_CONFIG', {
        message:
          'ModuleRuntime is finalized — mount every module before finalize()',
      });
    }
    if (!(instance instanceof RapidModule)) {
      throw new RapidError('RAPID_CONFIG', {
        message: 'Only RapidModule instances can be mounted',
      });
    }
    const ctor = instance.constructor;
    const ctorName = ctor.name || '(anonymous)';
    if (this.__mounted.has(ctor)) {
      throw new RapidError('RAPID_CONFIG', {
        message: `${ctorName} is already mounted`,
        details: { module: ctorName },
      });
    }
    const { name, namespace } = instance;
    // `events` is protected on the base — the runtime is its one reader.
    const events = (instance as unknown as { events: unknown }).events;
    if (typeof name !== 'string' || !NAME_PATTERN.test(name)) {
      throw new RapidError('RAPID_CONFIG', {
        message: `${ctorName}.name must be PascalCase (got ${
          JSON.stringify(name)
        }) — if ${ctorName} is an abstract base, don't export it from the modules barrel`,
        details: { module: ctorName, name },
      });
    }
    if (typeof namespace !== 'string' || !NAMESPACE_PATTERN.test(namespace)) {
      throw new RapidError('RAPID_CONFIG', {
        message: `${ctorName}.namespace must be kebab-case (got ${
          JSON.stringify(namespace)
        })`,
        details: { module: ctorName, namespace },
      });
    }
    if (events === null || typeof events !== 'object') {
      throw new RapidError('RAPID_CONFIG', {
        message: `${ctorName}.events must be an object of event() markers`,
        details: { module: ctorName },
      });
    }
    const key = `${namespace}:${name}`;
    for (const other of this.__order) {
      if (other.key === key) {
        throw new RapidError('RAPID_CONFIG', {
          message:
            `Two modules identify as '${key}' (${other.instance.constructor.name} and ${ctorName})`,
          details: { key },
        });
      }
    }
    const qualified: Record<string, string> = {};
    for (const leaf of Object.keys(events)) {
      if (!NAME_PATTERN.test(leaf)) {
        throw new RapidError('RAPID_CONFIG', {
          message:
            `${ctorName} declares event '${leaf}' — event names must be PascalCase`,
          details: { module: ctorName, event: leaf },
        });
      }
      qualified[leaf] = `${key}:${leaf}`;
    }

    // Index public prototype methods up the chain (most-derived wins),
    // stopping at RapidModule itself. Skipped: lifecycle hooks,
    // `_`-prefixed members, accessors (descriptor read, no getter call),
    // and `@On` handlers (subscribers are not invoke targets).
    const methods = new Map<string, MethodEntry>();
    const subscriptions: Subscription[] = [];
    const seen = new Set<string>();
    let proto: object | null = Object.getPrototypeOf(instance);
    while (
      proto !== null && proto !== RapidModule.prototype &&
      proto !== Object.prototype
    ) {
      for (const methodName of Object.getOwnPropertyNames(proto)) {
        if (
          methodName === 'constructor' || LIFECYCLE.has(methodName) ||
          methodName.startsWith('_') || seen.has(methodName)
        ) continue;
        const descriptor = Object.getOwnPropertyDescriptor(proto, methodName);
        if (
          descriptor === undefined || typeof descriptor.value !== 'function'
        ) {
          continue;
        }
        seen.add(methodName);
        const fn = descriptor.value as AnyFn;
        // @On/@Use are keyed by CLASS + NAME (registry.ts), so they are
        // found even when a wrapping decorator replaced the function.
        const level = Object.getOwnPropertyDescriptor(proto, 'constructor')
          ?.value as object | undefined;
        const middleware = level === undefined
          ? undefined
          : middlewareOf(level, methodName);
        const on = level === undefined
          ? undefined
          : onEventsOf(level, methodName);
        if (on !== undefined) {
          if (middleware !== undefined) {
            throw new RapidError('RAPID_CONFIG', {
              message:
                `${ctorName}.${methodName} has @Use on an @On handler — ` +
                `events carry no state, so a guard there can never apply; ` +
                `put the guard on an invoked method instead`,
              details: { module: ctorName, method: methodName },
            });
          }
          subscriptions.push({
            fn,
            events: on,
            label: `${ctorName}.${methodName}`,
            wired: [],
          });
          continue;
        }
        methods.set(methodName, {
          fn,
          chain: middleware === undefined ? undefined : compose(middleware),
        });
      }
      proto = Object.getPrototypeOf(proto);
    }

    // Everything validated — now commit (declarations + attachment).
    for (const full of Object.values(qualified)) this.__declared.add(full);
    _attach(instance, {
      // A scoped VIEW of the host logger: every line this module emits
      // carries `module: 'namespace:Name'`; correlation still arrives via
      // the host's contextProvider. One closure per module, not per call.
      log: this.log.scope({ module: key }),
      config: this.config,
      runtime: this,
      qualified: Object.freeze(qualified),
    });
    const mounted: Mounted = {
      instance,
      key,
      methods,
      subscriptions,
      initialized: false,
    };
    this.__mounted.set(ctor, mounted);
    this.__order.push(mounted);
  }

  /**
   * Wire every `@On` subscription — ALL validated against the union of
   * declared events first, so an unknown name fails HERE, at boot, with
   * nothing half-wired — then run each module's `init()` in mount order.
   * If an `init()` throws, the modules already initialized are disposed
   * (reverse order) before the error propagates. Call once, after every
   * `mount`.
   *
   * @throws {RapidError} RAPID_CONFIG when a subscription names an event
   *   no mounted module declares, or the runtime is disposed. Rethrows a
   *   failing `init()` after rollback.
   */
  public async finalize(): Promise<void> {
    if (this.__disposed) throw this.__disposedError('finalize');
    if (this.__finalized) return;
    for (const mounted of this.__order) {
      for (const subscription of mounted.subscriptions) {
        for (const event of subscription.events) {
          if (!this.__declared.has(event)) {
            throw new RapidError('RAPID_CONFIG', {
              message:
                `${subscription.label} subscribes to '${event}', which no ` +
                `mounted module declares — check the name, or mount the module that emits it`,
              details: {
                subscriber: subscription.label,
                event,
                declared: [...this.__declared],
              },
            });
          }
        }
      }
    }
    for (const mounted of this.__order) {
      for (const subscription of mounted.subscriptions) {
        for (const event of subscription.events) {
          const wrapper = this.__subscriber(
            mounted.instance,
            subscription.fn,
            event,
          );
          this.__events.subscribe(event, wrapper);
          subscription.wired.push([event, wrapper]);
        }
      }
    }
    this.__finalized = true;
    try {
      for (const mounted of this.__order) {
        await (mounted.instance as RapidModuleLifecycle).init?.();
        mounted.initialized = true;
      }
    } catch (error) {
      await this.__disposeModules();
      throw error;
    }
  }

  /**
   * Invoke a mounted module's method THROUGH the cycle. Inside an
   * in-flight invocation the caller's `requestId` is inherited and its
   * `state` is shallow-copied in; at top level pass a `seed` (tests,
   * scripts). The target's `@Use` chain runs; the outcome is always an
   * envelope — a throw inside the invocation is disclosed, never
   * propagated.
   *
   * @returns Rejects with RAPID_CONFIG only for a programming error
   *   (target not mounted here, no such invokable method, runtime
   *   disposed).
   */
  public invoke<
    T extends RapidModule<RapidModuleEventMap>,
    K extends RapidModuleMethodKeys<T>,
  >(
    target: RapidModuleClass<T>,
    method: K,
    args: Parameters<Extract<T[K], AnyFn>>,
    seed?: RapidModuleInvokeSeed,
  ): Promise<RapidModuleInvokeResultOf<ReturnType<Extract<T[K], AnyFn>>>> {
    type Result = RapidModuleInvokeResultOf<ReturnType<Extract<T[K], AnyFn>>>;
    if (this.__disposed) return Promise.reject(this.__disposedError('invoke'));
    const mounted = this.__mounted.get(target);
    if (mounted === undefined) {
      return Promise.reject(
        new RapidError('RAPID_CONFIG', {
          message: `${
            (target as { name?: string }).name ?? 'module'
          } is not mounted in this runtime`,
        }),
      );
    }
    const entry = mounted.methods.get(method);
    if (entry === undefined) {
      return Promise.reject(
        new RapidError('RAPID_CONFIG', {
          message: `${mounted.key} has no invokable method '${method}'`,
          details: { target: mounted.key, method },
        }),
      );
    }
    const parent = currentOf();
    const bag = ambient.get();
    const ctx = new InvokeContext({
      requestId: seed?.requestId ?? parent?.requestId ??
        (bag?.requestId as string | undefined) ??
        Application.requestIdGenerator(),
      action: `invoke ${mounted.key}.${method}`,
      // A shallow copy: the callee may add keys for ITS invocation without
      // rewriting the caller's bag. An EVENT parent contributes nothing.
      state: {
        ...(seed?.state ??
          (parent?.type === 'INVOKE' ? parent.state : undefined)),
      },
      target: mounted.key,
      method,
      args,
      // The identity flows down: an explicit seed wins, else inherit the
      // caller's (an EVENT parent carries none).
      auth: seed?.auth ??
        (parent?.type === 'INVOKE' ? parent.auth : undefined),
    });
    const holder: Holder = { pending: undefined, settled: false };
    const dispatch = (): void | Promise<void> => {
      const out = entry.fn.apply(mounted.instance, args);
      if (isThenable(out)) {
        holder.pending = out.then(
          (value) => {
            holder.settled = true;
            ctx.response = toReply(value);
          },
          (error) => {
            holder.settled = true;
            throw error;
          },
        );
        // Mark handled: if a middleware detaches this promise (no
        // `return next()`), the cycle still awaits it via the holder and
        // its rejection can never surface as an unhandled one.
        holder.pending.catch(NOOP);
        return holder.pending;
      }
      ctx.response = toReply(out);
    };
    const result = this.__run(
      ctx,
      entry.chain,
      dispatch,
      holder,
      () => (ctx.response ?? NO_CONTENT) as Result,
    );
    return isThenable(result) ? result : Promise.resolve(result);
  }

  /**
   * Publish a fully-qualified, DECLARED event (modules use
   * `this.emit(leaf, …)`, which qualifies it). The correlation id is
   * resolved once for the emission — every subscriber delivery carries the
   * same one. Resolves when all subscribers have settled; un-awaited
   * emissions are tracked for {@link drain}.
   *
   * @throws {RapidError} RAPID_CONFIG when `event` is not declared by a
   *   mounted module, or the runtime is disposed.
   */
  public emit(event: string, payload: unknown): Promise<void> {
    if (this.__disposed) throw this.__disposedError('emit');
    if (!this.__declared.has(event)) {
      throw new RapidError('RAPID_CONFIG', {
        message: `'${event}' is not declared by any mounted module`,
        details: { event, declared: [...this.__declared] },
      });
    }
    const requestId = currentOf()?.requestId ??
      (ambient.get()?.requestId as string | undefined) ??
      Application.requestIdGenerator();
    const settled = this.__events.publish(event, payload, requestId);
    if (settled !== RapidEvents.RESOLVED) {
      this.__pending.add(settled);
      settled.then(() => this.__pending.delete(settled));
    }
    return settled;
  }

  /** Wait for every in-flight fire-and-forget emission (including ones they trigger). */
  public async drain(): Promise<void> {
    while (this.__pending.size > 0) {
      await Promise.all(this.__pending);
    }
  }

  /**
   * Tear down, idempotently: drain, unsubscribe every `@On` wrapper, run
   * each module's `dispose()` in REVERSE mount order (a throwing hook is
   * logged and the rest still run), unbind the instances so they can be
   * hosted again, and finalize the logger if this runtime built it.
   * Afterwards `mount`/`invoke`/`emit` fail with RAPID_CONFIG.
   */
  public async dispose(): Promise<void> {
    if (this.__disposed) return;
    this.__disposed = true;
    await this.drain();
    for (const mounted of this.__order) {
      for (const subscription of mounted.subscriptions) {
        for (const [event, wrapper] of subscription.wired) {
          this.__events.unsubscribe(event, wrapper);
        }
        subscription.wired.length = 0;
      }
    }
    await this.__disposeModules();
    for (const mounted of this.__order) _detach(mounted.instance);
    this.__order.length = 0;
    this.__mounted.clear();
    this.__declared.clear();
    if (this.__ownsLog) await this.log.finalize();
  }

  /** Reverse-order `dispose()` hooks for initialized modules; each failure logged, none fatal. */
  private async __disposeModules(): Promise<void> {
    for (let i = this.__order.length - 1; i >= 0; i--) {
      const mounted = this.__order[i]!;
      if (!mounted.initialized) continue;
      mounted.initialized = false;
      try {
        await (mounted.instance as RapidModuleLifecycle).dispose?.();
      } catch (error) {
        this.log.error('module dispose failed', {
          module: mounted.key,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private __disposedError(what: string): RapidError {
    return new RapidError('RAPID_CONFIG', {
      message: `ModuleRuntime is disposed — ${what}() is no longer available`,
      details: { operation: what },
    });
  }

  /** One subscriber's delivery wrapper: a fresh EventContext through the cycle. */
  private __subscriber(
    instance: AnyModule,
    fn: AnyFn,
    event: string,
  ): EventSubscriber {
    return (payload, requestId, tracker) => {
      const ctx = new EventContext({
        requestId, // the emission's id — correlation only, never the state
        action: `event ${event}`,
        event,
      });
      const holder: Holder = { pending: undefined, settled: false };
      const dispatch = (): void | Promise<void> => {
        const out = fn.call(instance, payload, ctx);
        if (isThenable(out)) {
          holder.pending = out.then(
            () => {
              holder.settled = true;
            },
            (error) => {
              holder.settled = true;
              throw error;
            },
          );
          holder.pending.catch(NOOP);
          return holder.pending;
        }
      };
      const result = this.__run(ctx, undefined, dispatch, holder, NOOP);
      if (isThenable(result)) tracker.push(result);
    };
  }

  /**
   * The cycle: ONE ambient frame (joining the caller's scope when the
   * requestId is inherited, so app-added bag keys like a tenant survive;
   * a fresh scope otherwise) with the context in the non-enumerable
   * {@link CURRENT} slot → onion → dispatch → finish. Any throw is
   * disclosed, never escapes. A dispatch promise a middleware detached is
   * still awaited before finishing. Sync-through when nothing was async.
   */
  private __run<R>(
    ctx: Ctx,
    chain: Chain | undefined,
    dispatch: () => void | Promise<void>,
    holder: Holder,
    finish: () => R,
  ): R | Promise<R> {
    const body = (): R | Promise<R> => {
      Object.defineProperty(ambient.get() as Bag, CURRENT, {
        value: ctx,
        enumerable: false,
        configurable: true,
        writable: true,
      });
      // Pin the app container so a module method's inject() resolves
      // against it (ambient.child spreads only enumerable keys, so each
      // invoke scope re-pins its own).
      if (this.__container !== undefined) attachContainer(this.__container);
      const complete = (): R | Promise<R> => {
        const pending = holder.pending;
        if (pending !== undefined && !holder.settled) {
          return pending.then(finish, (error) => {
            this.__disclose(ctx, error);
            return finish();
          });
        }
        return finish();
      };
      try {
        const ran = chain !== undefined
          ? chain(ctx as InvokeContext, dispatch)
          : dispatch();
        if (isThenable(ran)) {
          return ran.then(complete, (error) => {
            this.__disclose(ctx, error);
            return complete();
          });
        }
      } catch (error) {
        this.__disclose(ctx, error);
      }
      return complete();
    };
    const bag = ambient.get();
    return bag !== undefined && bag.requestId === ctx.requestId
      ? ambient.child({ action: ctx.action }, body)
      : ambient.run({ requestId: ctx.requestId, action: ctx.action }, body);
  }

  /** Log what actually broke; on INVOKE, turn it into the mode-aware envelope. */
  private __disclose(ctx: Ctx, error: unknown): void {
    const err = RapidError.from(error);
    const message = error instanceof Error ? error.message : err.message;
    this.log.error(message, {
      code: err.code,
      requestId: ctx.requestId,
      action: ctx.action,
      stack: err.stack,
      ...err.context.debug,
    });
    if (ctx.type === 'INVOKE') {
      const payload = err.payload(this.__mode);
      ctx.response = new Reply(
        err.status,
        typeof payload === 'object' && payload !== null
          ? { ...payload, requestId: ctx.requestId }
          : payload,
      );
    }
  }
}
