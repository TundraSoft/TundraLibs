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
import { Doctor } from '@tundralibs/doctor';
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
} from './types/mod.ts';

type ModuleCtor = new () => RapidModule<RapidModuleEventMap>;

/** A concrete (constructible) RapidModule subclass — what a namespace export must be to mount. */
const isModuleClass = (value: unknown): value is ModuleCtor =>
  typeof value === 'function' &&
  (value as { prototype?: unknown }).prototype instanceof RapidModule;

/**
 * Resolve a module class to its ONE instance: dispensed from doctor when
 * the class is registered there (so a module another module `inject()`s
 * is the same object that gets mounted), else constructed with no args.
 *
 * @throws {RapidError} RAPID_CONFIG when the class needs constructor
 *   arguments — pass an instance via `sources.instances` instead.
 */
const resolveInstance = (
  ctor: ModuleCtor,
): RapidModule<RapidModuleEventMap> => {
  if (Doctor.has(ctor)) return Doctor.dispense(ctor);
  if (ctor.length > 0) {
    throw new RapidError('RAPID_CONFIG', {
      message: `${ctor.name} needs constructor arguments — register it with ` +
        `doctor, or pass an instance via sources.instances`,
      details: { module: ctor.name, arity: ctor.length },
    });
  }
  return new ctor();
};

/**
 * Build a standalone runtime context from plain options, through the
 * SAME shape `Application` uses for its logger (appName, level by mode,
 * console handler, ambient-correlated) — so a module initialized outside
 * an app logs exactly like one inside.
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
 * plus the runtime.
 *
 * @throws {RapidError} RAPID_CONFIG for any mount/finalize validation
 *   failure (see `ModuleRuntime.mount` / `.finalize`).
 */
export async function initModules<
  const M extends readonly object[],
  I extends Record<string, RapidModule<RapidModuleEventMap>> = Record<
    never,
    RapidModule<RapidModuleEventMap>
  >,
>(
  context: RapidModuleContext | RapidModuleInitOptions,
  sources: RapidModuleSources<M, I>,
): Promise<RapidModuleInitResult<M, I>> {
  const runtime = new ModuleRuntime(
    isContext(context) ? context : buildModuleContext(context),
  );
  const record: Record<string, RapidModule<RapidModuleEventMap>> = {};
  const seen = new Map<ModuleCtor, RapidModule<RapidModuleEventMap>>();
  for (const namespace of sources.modules) {
    for (const [exportName, value] of Object.entries(namespace)) {
      if (!isModuleClass(value)) continue;
      let instance = seen.get(value);
      if (instance === undefined) {
        instance = resolveInstance(value);
        seen.set(value, instance);
        runtime.mount(instance);
      }
      record[exportName] = instance; // a re-export maps to the same instance
    }
  }
  if (sources.instances !== undefined) {
    for (const [key, instance] of Object.entries(sources.instances)) {
      runtime.mount(instance);
      record[key] = instance;
    }
  }
  await runtime.finalize();
  return { modules: record as RapidModuleInstances<M, I>, runtime };
}
