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
 * - the cycle is sync-through: a sync method + sync middleware finishes
 *   without allocating a promise (thenable checks, no async/await);
 * - contexts are lean classes; a no-subscriber publish allocates nothing.
 *
 * @module
 */

import { ambient, createContext } from '@tundralibs/ambient';
import { ulid } from '@tundralibs/id';
import type { Slogger } from '@tundralibs/slogger';
import type { ConfigType } from '@tundralibs/utils';
import { RapidError } from '../errors/mod.ts';
import { EventContext, InvokeContext } from './contexts.ts';
import { middlewareOf, onEventsOf } from './decorators.ts';
import {
  type EventSubscriber,
  NAME_PATTERN,
  NAMESPACE_PATTERN,
  RapidEvents,
} from './events.ts';
import {
  _attach,
  type ModuleClass,
  type ModuleMethodKeys,
  RapidModule,
  type RapidModuleLifecycle,
} from './RapidModule.ts';
import type {
  RapidModuleContext,
  RapidModuleEventMap,
  RapidModuleInvokeMiddleware,
  RapidModuleInvokeResult,
  RapidModuleInvokeSeed,
} from './types/mod.ts';

// deno-lint-ignore no-explicit-any
type AnyFn = (...args: any[]) => unknown;
type Chain = (
  ctx: InvokeContext,
  next: () => void | Promise<void>,
) => void | Promise<void>;
type MethodEntry = { fn: AnyFn; chain: Chain | undefined };
type Subscription = { fn: AnyFn; events: readonly string[]; label: string };
type Mounted = {
  instance: RapidModule<RapidModuleEventMap>;
  /** `namespace:Name`. */
  key: string;
  methods: Map<string, MethodEntry>;
  subscriptions: Subscription[];
};

/** Lifecycle hooks are not invokable methods. */
const LIFECYCLE = new Set(['init', 'dispose']);
const NOOP = (): void => {};
const NO_CONTENT: RapidModuleInvokeResult = Object.freeze({
  status: 204,
  content: null,
});
const ENVELOPE_KEYS = new Set(['status', 'content', 'headers']);

const isThenable = (v: unknown): v is Promise<unknown> =>
  v !== null && typeof v === 'object' &&
  typeof (v as { then?: unknown }).then === 'function';

/** A returned `{ status?, content, headers? }` is an envelope; anything else is content. */
const toEnvelope = (value: unknown): RapidModuleInvokeResult => {
  if (value !== null && typeof value === 'object' && 'content' in value) {
    let envelope = true;
    for (const key of Object.keys(value)) {
      if (!ENVELOPE_KEYS.has(key)) {
        envelope = false;
        break;
      }
    }
    if (envelope) {
      const { status, content } = value as Partial<RapidModuleInvokeResult>;
      return { status: status ?? 200, content };
    }
  }
  return { status: 200, content: value };
};

/** Minimal onion over invoke middleware (same semantics as utils/compose). */
const compose = (middleware: readonly RapidModuleInvokeMiddleware[]): Chain => {
  return (ctx, next) => {
    let index = -1;
    const dispatch = (i: number): void | Promise<void> => {
      if (i <= index) {
        throw new Error('next() called multiple times');
      }
      index = i;
      const fn = i === middleware.length ? next : middleware[i]!;
      return i === middleware.length
        ? (fn as () => void | Promise<void>)()
        : (fn as RapidModuleInvokeMiddleware)(ctx, () => dispatch(i + 1));
    };
    return dispatch(0);
  };
};

export class ModuleRuntime {
  public readonly log: Slogger;
  public readonly config: ConfigType;
  public readonly events: RapidEvents;
  private readonly __mode: 'DEVELOPMENT' | 'PRODUCTION';
  private readonly __mounted = new Map<object, Mounted>();
  private readonly __order: Mounted[] = [];
  private readonly __declared = new Set<string>();
  /** The invocation in flight — how `invoke`/`emit` inherit state and correlation. */
  private readonly __current = createContext<InvokeContext | EventContext>();
  /** Fire-and-forget emissions still settling (see {@link drain}). */
  private readonly __pending = new Set<Promise<unknown>>();
  private __finalized = false;

  constructor(context: RapidModuleContext) {
    this.log = context.log;
    this.config = context.config;
    this.__mode = context.mode ?? 'PRODUCTION';
    this.events = new RapidEvents(context.log);
  }

  /** The invocation currently in flight, or `undefined` outside one. */
  public get current(): InvokeContext | EventContext | undefined {
    return this.__current.get();
  }

  /** Mounted module instances, in mount order. */
  public get modules(): readonly RapidModule<RapidModuleEventMap>[] {
    return this.__order.map((m) => m.instance);
  }

  /** Every fully-qualified event the mounted modules declare. */
  public get declaredEvents(): readonly string[] {
    return [...this.__declared];
  }

  /**
   * Register a module instance: validate its identity, qualify its
   * events, attach the host context, index its methods (composing each
   * `@Use` chain once) and collect its `@On` subscriptions. Subscriptions
   * are wired — and validated against every mounted declaration — at
   * {@link finalize}.
   *
   * @throws {RapidError} RAPID_CONFIG when the instance is not a
   *   `RapidModule`, its `name`/`namespace`/`events` are missing or
   *   malformed (an abstract base exported from the barrel looks exactly
   *   like this), the class or `namespace:Name` is already mounted, or
   *   the runtime is already finalized.
   */
  public mount(instance: RapidModule<RapidModuleEventMap>): void {
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
        message: `${ctorName}.events must be an object of payload() markers`,
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
      const full = `${key}:${leaf}`;
      qualified[leaf] = full;
      this.__declared.add(full);
    }
    _attach(instance, {
      log: this.log,
      config: this.config,
      runtime: this,
      qualified: Object.freeze(qualified),
    });

    // Index public methods up the prototype chain (most-derived wins),
    // stopping at RapidModule itself. Accessors are skipped (descriptor
    // read, no getter invocation).
    const methods = new Map<string, MethodEntry>();
    const subscriptions: Subscription[] = [];
    let proto: object | null = Object.getPrototypeOf(instance);
    while (
      proto !== null && proto !== RapidModule.prototype &&
      proto !== Object.prototype
    ) {
      for (const methodName of Object.getOwnPropertyNames(proto)) {
        if (
          methodName === 'constructor' || LIFECYCLE.has(methodName) ||
          methods.has(methodName)
        ) continue;
        const descriptor = Object.getOwnPropertyDescriptor(proto, methodName);
        if (
          descriptor === undefined || typeof descriptor.value !== 'function'
        ) {
          continue;
        }
        const fn = descriptor.value as AnyFn;
        const middleware = middlewareOf(fn);
        methods.set(methodName, {
          fn,
          chain: middleware === undefined ? undefined : compose(middleware),
        });
        const on = onEventsOf(fn);
        if (on !== undefined) {
          subscriptions.push({
            fn,
            events: on,
            label: `${ctorName}.${methodName}`,
          });
        }
      }
      proto = Object.getPrototypeOf(proto);
    }
    const mounted: Mounted = { instance, key, methods, subscriptions };
    this.__mounted.set(ctor, mounted);
    this.__order.push(mounted);
  }

  /**
   * Wire every `@On` subscription (validated against the union of
   * declared events — an unknown name fails HERE, at boot) and run each
   * module's `init()` in mount order. Call once, after every `mount`.
   *
   * @throws {RapidError} RAPID_CONFIG when a subscription names an event
   *   no mounted module declares.
   */
  public async finalize(): Promise<void> {
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
          this.events.subscribe(
            event,
            this.__subscriber(mounted.instance, subscription.fn, event),
          );
        }
      }
    }
    this.__finalized = true;
    for (const mounted of this.__order) {
      await (mounted.instance as RapidModuleLifecycle).init?.();
    }
  }

  /**
   * Invoke a mounted module's method THROUGH the cycle. Inside an
   * in-flight invocation the caller's `requestId` and `state` are
   * inherited; at top level pass a `seed` (tests, scripts). The target's
   * `@Use` chain runs; the outcome is always an envelope.
   *
   * @throws {RapidError} RAPID_CONFIG when `target` is not mounted here or
   *   has no method `method`. (Failures INSIDE the invocation never throw —
   *   they are disclosed as the envelope.)
   */
  public invoke<
    T extends RapidModule<RapidModuleEventMap>,
    K extends ModuleMethodKeys<T>,
  >(
    target: ModuleClass<T>,
    method: K,
    args: Parameters<Extract<T[K], AnyFn>>,
    seed?: RapidModuleInvokeSeed,
  ): Promise<RapidModuleInvokeResult> {
    const mounted = this.__mounted.get(target);
    if (mounted === undefined) {
      throw new RapidError('RAPID_CONFIG', {
        message: `${
          (target as { name?: string }).name ?? 'module'
        } is not mounted in this runtime`,
      });
    }
    const entry = mounted.methods.get(method);
    if (entry === undefined) {
      throw new RapidError('RAPID_CONFIG', {
        message: `${mounted.key} has no invokable method '${method}'`,
        details: { target: mounted.key, method },
      });
    }
    const parent = this.__current.get();
    const ctx = new InvokeContext({
      requestId: seed?.requestId ?? parent?.requestId ??
        ambient.get()?.requestId as string | undefined ?? ulid(),
      action: `invoke ${mounted.key}.${method}`,
      state: seed?.state ?? parent?.state ?? {},
      target: mounted.key,
      method,
      args,
    });
    const dispatch = (): void | Promise<void> => {
      const out = entry.fn.apply(mounted.instance, args);
      if (isThenable(out)) {
        return out.then((value) => {
          ctx.response = toEnvelope(value);
        });
      }
      ctx.response = toEnvelope(out);
    };
    const result = this.__run(
      ctx,
      entry.chain,
      dispatch,
      () => ctx.response ?? NO_CONTENT,
    );
    return isThenable(result) ? result : Promise.resolve(result);
  }

  /**
   * Publish a fully-qualified event (modules use `this.emit(leaf, …)`,
   * which qualifies and validates). Resolves when all subscribers have
   * settled; un-awaited emissions are tracked for {@link drain}.
   */
  public emit(event: string, payload: unknown): Promise<void> {
    const settled = this.events.publish(event, payload);
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

  /** Drain, then run each module's `dispose()` in REVERSE mount order. */
  public async dispose(): Promise<void> {
    await this.drain();
    for (let i = this.__order.length - 1; i >= 0; i--) {
      await (this.__order[i]!.instance as RapidModuleLifecycle).dispose?.();
    }
  }

  /** One subscriber's delivery wrapper: a fresh EventContext through the cycle. */
  private __subscriber(
    instance: RapidModule<RapidModuleEventMap>,
    fn: AnyFn,
    event: string,
  ): EventSubscriber {
    return (payload, tracker) => {
      const parent = this.__current.get();
      const ctx = new EventContext({
        // correlation only — never the state. Inherits the in-flight
        // invocation, else an ambient-only scope (a rapid transport
        // request), else a fresh id.
        requestId: parent?.requestId ??
          ambient.get()?.requestId as string | undefined ?? ulid(),
        action: `event ${event}`,
        event,
      });
      const dispatch = (): void | Promise<void> => {
        const out = fn.call(instance, payload, ctx);
        return isThenable(out) ? out.then(NOOP) : undefined;
      };
      const result = this.__run(ctx, undefined, dispatch, NOOP);
      if (isThenable(result)) tracker.push(result);
    };
  }

  /**
   * The cycle: ambient scope (log correlation) → current-invocation scope
   * → onion → dispatch → finish; any throw is disclosed, never escapes.
   * Sync-through: returns the plain value when nothing was async.
   */
  private __run<R>(
    ctx: InvokeContext | EventContext,
    chain: Chain | undefined,
    dispatch: () => void | Promise<void>,
    finish: () => R,
  ): R | Promise<R> {
    return ambient.run(
      { requestId: ctx.requestId, action: ctx.action },
      () =>
        this.__current.run(ctx, () => {
          try {
            const ran = chain !== undefined
              ? chain(ctx as InvokeContext, dispatch)
              : dispatch();
            if (isThenable(ran)) {
              return ran.then(finish, (error) => {
                this.__disclose(ctx, error);
                return finish();
              });
            }
          } catch (error) {
            this.__disclose(ctx, error);
          }
          return finish();
        }),
    );
  }

  /** Log the failure; on INVOKE, turn it into the mode-aware envelope. */
  private __disclose(ctx: InvokeContext | EventContext, error: unknown): void {
    const err = RapidError.from(error);
    // Log what actually broke — the original message — not the generic
    // disclosure text the envelope carries.
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
      ctx.response = {
        status: err.status,
        content: typeof payload === 'object' && payload !== null
          ? { ...payload, requestId: ctx.requestId }
          : payload,
      };
    }
  }
}
