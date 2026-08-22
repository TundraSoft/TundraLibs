/**
 * @fileoverview `initModules` — THE bootstrap for modules, used by tests,
 * scripts and (on integration) `app.modules()` alike, so initialization
 * has one path. Takes STATIC namespaces (the `modules/mod.ts` barrel) and
 * ready instances; constructs every concrete module class (zero-arg, or
 * dispensed from doctor when registered there — the single-instance
 * rule), mounts them on a fresh `ModuleRuntime`, and finalizes it.
 *
 * No path strings, no directory walking: that is a build-time (CLI)
 * concern, which is what keeps this identical on Workers.
 *
 * @module
 */

import { ambient } from '@tundralibs/ambient';
import { Doctor, type DoctorContainer } from '@tundralibs/doctor';
import { Slogger, SyslogSeverities } from '@tundralibs/slogger';
import { Config } from '@tundralibs/utils';
import { RapidError } from '../errors/mod.ts';
import { ModuleRuntime } from './ModuleRuntime.ts';
import { RapidModule } from './RapidModule.ts';
import type {
  RapidModuleContext,
  RapidModuleEventMap,
  RapidModuleInitOptions,
  RapidModuleInitResult,
  RapidModuleInstances,
  RapidModuleSources,
} from '../types/mod.ts';

type AnyModule = RapidModule<RapidModuleEventMap>;
type ModuleCtor = new () => AnyModule;

const reasonOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

/** A concrete (constructible) RapidModule subclass — what a namespace export must be to mount. */
const isModuleClass = (value: unknown): value is ModuleCtor =>
  typeof value === 'function' &&
  (value as { prototype?: unknown }).prototype instanceof RapidModule;

/**
 * Resolve a module class to its ONE instance: dispensed from the given
 * `registry` (the app's container, else the global `Doctor`) when the
 * class is registered there — so a module another module `inject()`s is
 * the same object that gets mounted (register modules as SINGLETON), and
 * an app's container yields its own instance — else constructed with no
 * arguments.
 *
 * @throws {RapidError} RAPID_CONFIG when doctor cannot dispense it, or
 *   construction throws (a class needing constructor arguments — pass an
 *   instance via `sources.instances` — or an abstract base exported from
 *   the barrel whose field initializers fail).
 */
const resolveInstance = (
  ctor: ModuleCtor,
  registry: DoctorContainer,
): AnyModule => {
  if (registry.has(ctor)) {
    try {
      return registry.dispense(ctor);
    } catch (cause) {
      throw new RapidError('RAPID_CONFIG', {
        message: `${ctor.name} is registered with doctor but could not be ` +
          `dispensed (${reasonOf(cause)}) — register modules as SINGLETON, ` +
          `or leave them unregistered and let initModules construct them`,
        details: { module: ctor.name },
        cause: cause instanceof Error ? cause : undefined,
      });
    }
  }
  try {
    // resolve() constructs with no args (Reflect.construct) but does so
    // with `registry` as the ambient container, so an `inject()` field
    // initializer in an UNREGISTERED module resolves against the app's
    // container (e.g. a harness stub) rather than the global Doctor.
    return registry.resolve(ctor);
  } catch (cause) {
    throw new RapidError('RAPID_CONFIG', {
      message: `${ctor.name} could not be constructed (${reasonOf(cause)}) — ` +
        `modules are constructed with NO arguments (pass an instance via ` +
        `sources.instances); an abstract base exported from the barrel ` +
        `fails here too`,
      details: { module: ctor.name },
      cause: cause instanceof Error ? cause : undefined,
    });
  }
};

/**
 * Build a standalone runtime context from plain options, through the
 * SAME shape `Application` uses for its logger (appName, level by mode,
 * console handler, ambient-correlated) — so a module initialized outside
 * an app logs exactly like one inside. The runtime that receives it owns
 * the logger and finalizes it on dispose.
 */
export function buildModuleContext(
  options: RapidModuleInitOptions,
): Required<RapidModuleContext> {
  const mode = options.mode ?? 'PRODUCTION';
  const logger = options.logger;
  const level = logger?.level ??
    (mode === 'DEVELOPMENT' ? SyslogSeverities.DEBUG : SyslogSeverities.INFO);
  return {
    mode,
    config: Config({}),
    log: new Slogger({
      ...logger,
      appName: options.name,
      level,
      handlers: logger?.handlers ??
        [{ name: 'console', type: 'ConsoleHandler', level }],
      contextProvider: () => ({ ...ambient.get() }),
    }),
  };
}

const isContext = (
  value: RapidModuleContext | RapidModuleInitOptions,
): value is RapidModuleContext => 'log' in value;

/**
 * Bootstrap modules: `context` is either a ready `{ log, config }` (what
 * an app passes) or plain options (`{ name, mode?, logger? }`) for
 * standalone use. Returns the instances, keyed by EXPORT name and typed,
 * plus the runtime. On any failure the partially-built runtime is
 * disposed before the error propagates.
 *
 * @param container - The app's doctor container. Module instances are
 *   dispensed from it (read-through to the global registrations, own
 *   instances) and it is pinned on each invoke's ambient bag so a module
 *   method's `inject()` resolves against it. Omitted → the global
 *   `Doctor`, the standalone default.
 * @throws {RapidError} RAPID_CONFIG for any resolve/mount/finalize
 *   validation failure, including an `instances` key that collides with a
 *   namespace export.
 */
export async function initModules<
  const M extends readonly object[],
  I extends Record<string, AnyModule> = Record<never, AnyModule>,
>(
  context: RapidModuleContext | RapidModuleInitOptions,
  sources: RapidModuleSources<M, I>,
  container?: DoctorContainer,
): Promise<RapidModuleInitResult<M, I>> {
  const registry = container ?? Doctor;
  const ownsLog = !isContext(context);
  const runtime = new ModuleRuntime(
    ownsLog ? buildModuleContext(context) : context,
    ownsLog,
    container,
  );
  try {
    const record: Record<string, AnyModule> = {};
    const seen = new Map<ModuleCtor, AnyModule>();
    const claim = (key: string, instance: AnyModule): void => {
      const prior = record[key];
      if (prior !== undefined && prior !== instance) {
        throw new RapidError('RAPID_CONFIG', {
          message: `Two different modules would be keyed '${key}' ` +
            `(${prior.constructor.name} and ${instance.constructor.name})`,
          details: { key },
        });
      }
      record[key] = instance;
    };
    for (const namespace of sources.modules) {
      for (const [exportName, value] of Object.entries(namespace)) {
        if (!isModuleClass(value)) continue;
        let instance = seen.get(value);
        if (instance === undefined) {
          instance = resolveInstance(value, registry);
          seen.set(value, instance);
          runtime.mount(instance);
        }
        claim(exportName, instance); // a re-export maps to the same instance
      }
    }
    if (sources.instances !== undefined) {
      for (const [key, instance] of Object.entries(sources.instances)) {
        runtime.mount(instance);
        claim(key, instance);
      }
    }
    await runtime.finalize();
    return { modules: record as RapidModuleInstances<M, I>, runtime };
  } catch (error) {
    await runtime.dispose();
    throw error;
  }
}
