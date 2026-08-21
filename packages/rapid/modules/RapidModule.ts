/**
 * @fileoverview `RapidModule` — the opt-in abstract base a module extends.
 * It ENFORCES the module's identity (`name`, `namespace`, `events`) as
 * abstract members, and gives the module its host-provided `log` and
 * `config` plus the two communication channels, `emit` and `invoke`.
 *
 * Nothing is stored ON the instance: the host context lives in a WeakMap
 * side table (like the decoration registry), so the module object stays
 * clean and there is no framework handle to reach into.
 *
 * @module
 */

import type { ScopedSlogger } from '@tundralibs/slogger';
import type { ConfigType } from '@tundralibs/utils';
import { RapidError } from '../errors/mod.ts';
import type { ModuleRuntime } from './ModuleRuntime.ts';
import type {
  RapidModuleClass,
  RapidModuleEventMap,
  RapidModuleInvokeResultOf,
  RapidModuleMethodKeys,
  RapidModulePayloadOf,
} from '../types/mod.ts';

/** What the runtime attaches to a mounted module. @internal */
export type ModuleAttachment = {
  log: ScopedSlogger;
  config: ConfigType;
  runtime: ModuleRuntime;
  /** leaf event name → fully-qualified name, resolved once at mount. */
  qualified: Readonly<Record<string, string>>;
};

const ATTACHED = new WeakMap<object, ModuleAttachment>();

/**
 * Bind a module instance to its runtime. One runtime per instance.
 * @internal Called by `ModuleRuntime.mount`.
 * @throws {RapidError} RAPID_CONFIG when the instance is already bound to
 *   a DIFFERENT runtime (one instance, one host — silent last-wins would
 *   misroute its logs and events). `dispose()` unbinds.
 */
export function _attach(instance: object, attachment: ModuleAttachment): void {
  const prior = ATTACHED.get(instance);
  if (prior !== undefined && prior.runtime !== attachment.runtime) {
    throw new RapidError('RAPID_CONFIG', {
      message: `${instance.constructor.name} is already initialized by ` +
        `another runtime — a module instance belongs to ONE host (dispose ` +
        `that runtime first)`,
      details: { module: instance.constructor.name },
    });
  }
  ATTACHED.set(instance, attachment);
}

/** Unbind on dispose, so the instance can be hosted again. @internal */
export function _detach(instance: object): void {
  ATTACHED.delete(instance);
}

/** The attachment, or a loud RAPID_CONFIG for a never-initialized module. */
const attachmentOf = (instance: object, member: string): ModuleAttachment => {
  const attachment = ATTACHED.get(instance);
  if (attachment === undefined) {
    throw new RapidError('RAPID_CONFIG', {
      message:
        `${instance.constructor.name}.${member} used before the module ` +
        `was initialized — construct modules through initModules() / ` +
        `app.modules(), or mount this instance with runtime.mount()`,
      details: { module: instance.constructor.name, member },
    });
  }
  return attachment;
};

/**
 * Optional lifecycle hooks a module MAY implement (duck-typed by the
 * runtime, so no `override` keyword is needed): `init` runs once after
 * every module is mounted, in mount order; `dispose` runs on
 * `runtime.dispose()`, in reverse.
 */
export interface RapidModuleLifecycle {
  init?(): void | Promise<void>;
  dispose?(): void | Promise<void>;
}

// deno-lint-ignore no-explicit-any
type AnyFn = (...args: any[]) => unknown;

/**
 * @typeParam E - The module's event map. Declare it once as a const and
 *   pass `typeof`: `const EVENTS = { PostCreated: event<{ id: string }>() };`
 *   `class Posts extends RapidModule<typeof EVENTS> { protected readonly
 *   events = EVENTS; … }`. Modules that emit nothing omit it — and a
 *   non-empty `events` WITHOUT the generic is a compile error at the field
 *   (the default forbids keys), not a mystery at the first `emit`.
 */
export abstract class RapidModule<
  E extends RapidModuleEventMap = Record<string, never>,
> {
  /** `PascalCase` identity, unique within its namespace: `Posts`. */
  public abstract readonly name: string;
  /** `kebab-case` grouping: `posts`. Events qualify as `namespace:Name:Event`. */
  public abstract readonly namespace: string;
  /**
   * The events this module EMITS, declared with {@link payload}. Protected:
   * it is the module's own declaration, not API. The runtime reads it at
   * mount and validates every `@On` subscriber against the union of
   * mounted declarations.
   */
  protected abstract readonly events: E;

  /** The host's logger — request-correlated inside an invocation, plain outside. */
  protected get log(): ScopedSlogger {
    return attachmentOf(this, 'log').log;
  }

  /** The host's configuration. */
  protected get config(): ConfigType {
    return attachmentOf(this, 'config').config;
  }

  /**
   * Publish one of THIS module's declared events. Resolves when every
   * subscriber has settled — `await` it for in-request consistency, or
   * don't (fire-and-forget; the runtime tracks it for `drain()`).
   * Subscribers never see this invocation's state — correlation only.
   *
   * @throws {RapidError} RAPID_CONFIG when `event` is not declared in
   *   this module's `events`, or the module is not initialized.
   */
  protected emit<K extends keyof E & string>(
    event: K,
    payload: RapidModulePayloadOf<E[K]>,
  ): Promise<void> {
    const attachment = attachmentOf(this, 'emit');
    const qualified = attachment.qualified[event];
    if (qualified === undefined) {
      throw new RapidError('RAPID_CONFIG', {
        message: `${this.constructor.name} emits undeclared event ` +
          `'${event}' — add it to the module's \`events\``,
        details: { module: this.constructor.name, event },
      });
    }
    return attachment.runtime.emit(qualified, payload);
  }

  /**
   * Call another module's method THROUGH the cycle: a copy of this
   * invocation's state flows to it, its `@Use` middleware runs, and the
   * outcome comes back as an envelope (a denied guard is a 403 envelope,
   * not a throw). For plain collaboration, inject a service and call it.
   *
   * @returns Rejects with RAPID_CONFIG when the target is not mounted in
   *   this runtime or has no such method; failures INSIDE the invocation
   *   never reject — they are the envelope.
   * @throws {RapidError} RAPID_CONFIG when this module is not initialized.
   */
  protected invoke<
    T extends RapidModule<RapidModuleEventMap>,
    K extends RapidModuleMethodKeys<T>,
  >(
    target: RapidModuleClass<T>,
    method: K,
    args: Parameters<Extract<T[K], AnyFn>>,
  ): Promise<RapidModuleInvokeResultOf<ReturnType<Extract<T[K], AnyFn>>>> {
    return attachmentOf(this, 'invoke').runtime.invoke(target, method, args);
  }
}
