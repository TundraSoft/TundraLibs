/**
 * @fileoverview `RapidModule` — the opt-in abstract base a module extends.
 * It ENFORCES the module's identity (`name`, `namespace`, `events`) as
 * abstract members, and gives the module its host-provided `log` and
 * `config` plus the two communication channels, `emit` and `invoke`.
 *
 * Nothing is stored ON the instance: the host context lives in a
 * WeakMap side table (like the decoration registry), so the module
 * object stays clean and there is no framework handle to reach into.
 *
 * @module
 */

import type { Slogger } from '@tundralibs/slogger';
import type { ConfigType } from '@tundralibs/utils';
import { RapidError } from '../errors/mod.ts';
import type { ModuleRuntime } from './ModuleRuntime.ts';
import type {
  RapidModuleEventMap,
  RapidModuleInvokeResult,
  RapidModulePayloadOf,
} from './types/mod.ts';

/** What the runtime attaches to a mounted module. @internal */
export type ModuleAttachment = {
  log: Slogger;
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
 *   misroute its logs and events).
 */
export function _attach(instance: object, attachment: ModuleAttachment): void {
  const prior = ATTACHED.get(instance);
  if (prior !== undefined && prior.runtime !== attachment.runtime) {
    throw new RapidError('RAPID_CONFIG', {
      message: `${instance.constructor.name} is already initialized by ` +
        `another runtime — a module instance belongs to ONE host`,
      details: { module: instance.constructor.name },
    });
  }
  ATTACHED.set(instance, attachment);
}

/** @internal */
export const _attachmentOf = (instance: object): ModuleAttachment | undefined =>
  ATTACHED.get(instance);

/**
 * The attachment, or a loud RAPID_CONFIG when the module was never
 * initialized (constructed with `new` and never mounted).
 */
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

/** The public method names of `T` (what `invoke` accepts). */
export type ModuleMethodKeys<T> =
  & {
    [K in keyof T]: T[K] extends AnyFn ? K : never;
  }[keyof T]
  & string;

/** A module class reference (abstract bases allowed as a TYPE target). */
export type ModuleClass<T> = abstract new (...args: never[]) => T;

export abstract class RapidModule {
  /** `PascalCase` identity, unique within its namespace: `Posts`. */
  public abstract readonly name: string;
  /** `kebab-case` grouping: `posts`. Events qualify as `namespace:Name:Event`. */
  public abstract readonly namespace: string;
  /**
   * The events this module EMITS, declared with {@link payload}:
   * `{ PostCreated: payload<{ id: string }>() }`. The runtime validates
   * every `@On` subscriber against the union of mounted declarations.
   */
  public abstract readonly events: RapidModuleEventMap;

  /** The host's logger — request-correlated inside an invocation, plain outside. */
  protected get log(): Slogger {
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
  protected emit<E extends RapidModuleEventMap, K extends keyof E & string>(
    this: RapidModule & { readonly events: E },
    event: K,
    payload: RapidModulePayloadOf<E[K]>,
  ): Promise<void> {
    // `this` is typed via the parameter (that is what lets `E` infer from
    // the subclass's declared `events`), so the attachment is read through
    // the module-level helper rather than a private member.
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
   * Call another module's method THROUGH the cycle: this invocation's
   * state flows to it, its `@Use` middleware runs, and the outcome comes
   * back as an envelope (a denied guard is a 403 envelope, not a throw).
   * For plain collaboration, inject a service and call it directly.
   *
   * @throws {RapidError} RAPID_CONFIG when the target is not mounted in
   *   this runtime or has no such method, or this module is not initialized.
   */
  protected invoke<T extends RapidModule, K extends ModuleMethodKeys<T>>(
    target: ModuleClass<T>,
    method: K,
    args: Parameters<Extract<T[K], AnyFn>>,
  ): Promise<RapidModuleInvokeResult> {
    return attachmentOf(this, 'invoke').runtime.invoke(target, method, args);
  }
}
