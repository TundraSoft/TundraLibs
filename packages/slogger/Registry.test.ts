import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { SyslogSeverities } from '@tundralibs/utils';
import { registry } from './Registry.ts';
import { LogManager } from './LogManager.ts';
import { Slogger } from './Slogger.ts';
import { LogManager as LogManagerFromRoot } from './mod.ts';
import { AbstractHandler, type HandlerOptions } from './handlers/mod.ts';
import type { SlogObject } from './types/mod.ts';

/** Records every formatted line so a test can prove it ran. */
class ProbeHandler extends AbstractHandler {
  public readonly mode = 'probe';
  public lines: string[] = [];

  constructor(name: string, options: HandlerOptions) {
    super(name, options);
  }

  protected _handle(message: string): void {
    this.lines.push(message);
  }
}

// -----------------------------------------------------------------------------
// One registry, three doors
// -----------------------------------------------------------------------------
// `Slogger.ts` and `LogManager.ts` used to import each other; the handler /
// formatter registry now lives in the `Registry.ts` leaf that both import
// instead. That refactor's one plausible regression is a SPLIT registry —
// two `Registry` instances, so a formatter registered through `LogManager`
// is invisible to a `Slogger` resolving `formatter: 'name'`, and vice versa.
// Every test below crosses the seam: it writes through one import path and
// reads through a different one.
// -----------------------------------------------------------------------------

describe('slogger.registry', () => {
  it('LogManager writes land in the shared registry leaf', () => {
    const formatter = (log: SlogObject): string => `via-manager:${log.message}`;
    LogManager.addFormatter('registryProbeViaManager', formatter);

    // Written through LogManager, read through the leaf module directly.
    asserts.assertStrictEquals(
      registry.getFormatter('registryProbeViaManager'),
      formatter,
      'a formatter added via LogManager must land in the shared registry',
    );
    asserts.assert(
      registry.getFormatterNames().includes('registryProbeViaManager'),
    );
  });

  it('registry writes are visible through LogManager', () => {
    const formatter = (log: SlogObject): string => `via-leaf:${log.message}`;
    registry.addFormatter('registryProbeViaLeaf', formatter);

    // Written through the leaf module, read through the public LogManager.
    asserts.assertStrictEquals(
      LogManager.getFormatter('registryProbeViaLeaf'),
      formatter,
      'a formatter added via the registry must be visible on LogManager',
    );
    asserts.assert(
      LogManager.getFormatterNames().includes('registryProbeViaLeaf'),
    );
  });

  it('the built-ins are registered exactly once', () => {
    // A second Registry instance would either duplicate the built-in names
    // or give LogManager and the leaf divergent lists.
    asserts.assertEquals(
      LogManager.getHandlerTypes(),
      registry.getHandlerTypes(),
    );
    asserts.assertEquals(
      LogManager.getFormatterNames(),
      registry.getFormatterNames(),
    );

    const handlerTypes = registry.getHandlerTypes();
    asserts.assertEquals(
      new Set(handlerTypes).size,
      handlerTypes.length,
      'built-in handlers must not be registered twice',
    );
    const formatterNames = registry.getFormatterNames();
    asserts.assertEquals(
      new Set(formatterNames).size,
      formatterNames.length,
      'built-in formatters must not be registered twice',
    );
    asserts.assert(handlerTypes.includes('ConsoleHandler'));
    asserts.assert(formatterNames.includes('json'));
  });

  it('the root mod.ts export is the same LogManager instance', () => {
    asserts.assertStrictEquals(LogManagerFromRoot, LogManager);
  });

  it('a Slogger resolves handler types registered via LogManager', async () => {
    // The end-to-end seam crossing: register through LogManager, then let a
    // plain `new Slogger(...)` resolve BOTH the handler type and the
    // formatter by name. Slogger never imports LogManager — if the two saw
    // different registries this construction would throw
    // "Handler type 'RegistryProbeHandler' not found".
    LogManager.addHandler('RegistryProbeHandler', ProbeHandler);
    const formatter = (log: SlogObject): string => `probe|${log.message}`;
    LogManager.addFormatter('registryProbeFormat', formatter);

    const log = new Slogger({
      appName: 'RegistryProbeApp',
      level: SyslogSeverities.DEBUG,
      handlers: [{
        name: 'probe',
        type: 'RegistryProbeHandler',
        level: SyslogSeverities.DEBUG,
        formatter: 'registryProbeFormat',
      }],
    });

    try {
      log.info('hello');
      // Give the handler's async `handle()` a turn to run.
      await new Promise((resolve) => setTimeout(resolve, 0));

      const handler = LogManager.createHandler(
        'RegistryProbeHandler',
        'probe-direct',
        { level: SyslogSeverities.DEBUG, formatter: 'registryProbeFormat' },
      ) as ProbeHandler;
      asserts.assertStrictEquals(
        handler.formatter,
        formatter,
        'LogManager.createHandler must resolve the same formatter reference',
      );
      await handler.finalize();
    } finally {
      await log.finalize();
    }
  });

  it('a Slogger sees a formatter added after the logger type was registered', () => {
    // Registration order must not matter: the registry is one live map, not
    // a snapshot copied into either module at import time.
    const formatter = (log: SlogObject): string => `late|${log.message}`;
    registry.addFormatter('registryProbeLateFormat', formatter);

    const log = new Slogger({
      appName: 'RegistryProbeLateApp',
      level: SyslogSeverities.DEBUG,
      handlers: [{
        name: 'probe-late',
        type: 'RegistryProbeHandler',
        level: SyslogSeverities.DEBUG,
        formatter: 'registryProbeLateFormat',
      }],
    });

    asserts.assertStrictEquals(
      LogManager.getFormatter('registryProbeLateFormat'),
      formatter,
    );
    return log.finalize();
  });
});
