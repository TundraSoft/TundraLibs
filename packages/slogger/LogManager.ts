/**
 * LogManager module for managing handlers and formatters
 * @module
 */

import { Singleton } from '@tundralibs/utils';
import type { AbstractHandler, HandlerOptions } from './handlers/mod.ts';
import type { SloggerFormatter } from './types/mod.ts';
import { type HandlerConfig, Slogger, type SloggerOptions } from './Slogger.ts';
import { registry } from './Registry.ts';
import { SloggerConfigError } from './errors/mod.ts';
/**
 * LogManager Singleton
 *
 * Manages all available handlers and formatters in the Slogger system.
 * Provides factory methods to initialize handlers and access formatters.
 *
 * The handler/formatter half of this surface is stored in the shared
 * {@link registry} leaf module rather than on this class, so `Slogger`
 * can resolve `type` / `formatter` strings without importing back into
 * this module. Every method below forwards to that one instance — a
 * formatter added here is immediately visible to every `Slogger`. The
 * logger cache (`_loggers`) stays here because it constructs `Slogger`
 * instances, which the registry deliberately knows nothing about.
 */
@Singleton
class Manager {
  protected _loggers: Map<string, Slogger> = new Map();

  /**
   * Config each cached Slogger was created with — used by
   * {@link createSlogger} to detect conflicting re-creation.
   */
  private __loggerConfigs: Map<string, SloggerOptions> = new Map();

  /**
   * Adds a handler constructor to the registry
   *
   * @param name - Unique identifier for the handler type
   * @param handlerConstructor - Constructor for the handler type
   * @throws {SloggerConfigError} When `name` is invalid, the handler
   *   type is already registered, or `handlerConstructor` is not a
   *   constructor.
   */
  public addHandler<
    T extends HandlerOptions & Record<string, unknown> =
      & HandlerOptions
      & Record<string, unknown>,
  >(
    name: string,
    handlerConstructor: new (
      name: string,
      options: T,
    ) => AbstractHandler,
  ): void {
    registry.addHandler(name, handlerConstructor);
  }

  /**
   * Adds a formatter to the registry
   *
   * @param name - Unique identifier for the formatter
   * @param formatter - The formatter function
   * @throws {SloggerConfigError} When `name` is invalid, the
   *   formatter is already registered, or `formatter` is not a
   *   function returning a string.
   */
  public addFormatter(name: string, formatter: SloggerFormatter): void {
    registry.addFormatter(name, formatter);
  }

  /**
   * Creates a custom formatter using the simpleFormatter factory
   *
   * @param name - Unique identifier for the formatter
   * @param template - Template string for the formatter
   * @returns The created formatter function
   * @throws {SloggerConfigError} When `template` is not a non-empty
   *   string or a formatter with `name` already exists.
   */
  public createFormatter(name: string, template: string): SloggerFormatter {
    return registry.createFormatter(name, template);
  }

  /**
   * Gets a formatter by name
   *
   * @param name - Name of the formatter to retrieve
   * @returns The formatter function or undefined if not found
   */
  public getFormatter(name: string): SloggerFormatter | undefined {
    return registry.getFormatter(name);
  }

  /**
   * Gets all registered formatter names
   *
   * @returns Array of formatter names
   */
  public getFormatterNames(): string[] {
    return registry.getFormatterNames();
  }

  /**
   * Gets all registered handler type names
   *
   * @returns Array of handler type names
   */
  public getHandlerTypes(): string[] {
    return registry.getHandlerTypes();
  }

  /**
   * Creates and initializes a handler of the specified type
   *
   * @param type - Type of handler to create (e.g., 'console', 'file')
   * @param name - Unique name for this handler instance
   * @param options - Configuration options for the handler
   * @returns Initialized handler instance
   * @throws {SloggerConfigError} When the handler `type` or a
   *   formatter referenced by name is not registered (or when the
   *   handler constructor rejects the options).
   */
  public createHandler(
    type: string,
    name: string,
    options: Omit<HandlerConfig, 'name' | 'type'>,
  ): AbstractHandler {
    return registry.createHandler(type, name, options);
  }

  /**
   * Get-or-create a Slogger by `config.appName`, optionally wrapped
   * with pre-bound context fields. When `scopes` is provided the
   * returned instance is a {@link Slogger.scope}-wrapped view; the
   * underlying singleton is cached unscoped so subsequent calls (with
   * different scopes) reuse the same handlers, level, and state.
   *
   * A repeat call for a cached `appName` returns the cached instance
   * only when `config` is structurally identical to the one the
   * instance was created with. Function values (e.g. formatters) are
   * compared by REFERENCE IDENTITY, not source text — a fresh inline
   * `maskingFormatter({...})` per call is a *different* config and
   * throws; reuse the cached instance by hoisting the formatter to a
   * shared `const` and passing that same reference on every call (a
   * source-text comparison couldn't see the security-relevant options
   * the closure captured, so it would silently hand back a weaker cached
   * logger — see {@link LogManager.__sameConfig}). A
   * *different* config for the same `appName` throws instead of being
   * silently ignored — the cached instance's level/handlers/formatters
   * would not match what the caller asked for. Use {@link getLogger} to
   * retrieve an existing instance without restating its config.
   *
   * @throws {SloggerConfigError} When a Slogger with `config.appName`
   *   already exists and `config` differs from the configuration it
   *   was created with.
   *
   * @example
   * ```typescript
   * const root  = LogManager.createSlogger({ appName: 'app', level, handlers: [...] });
   * const req   = LogManager.createSlogger({ appName: 'app', ... }, { reqId, userId });
   * req.info('hi');  // context: { reqId, userId }
   * ```
   */
  public createSlogger(
    config: SloggerOptions,
    scopes?: Record<string, unknown>,
  ): Slogger {
    const name = config.appName;
    let log = this._loggers.get(name);
    if (!log) {
      log = new Slogger(config);
      this._loggers.set(name, log);
      this.__loggerConfigs.set(name, config);
    } else if (!this.__sameConfig(this.__loggerConfigs.get(name), config)) {
      throw new SloggerConfigError(
        `A Slogger named '${name}' already exists with a different ` +
          `configuration — the new level/handlers would be silently ` +
          `ignored. Use LogManager.getLogger('${name}') to retrieve the ` +
          `existing instance, or pick a different appName.`,
        { key: 'appName', value: name },
      );
    }
    return scopes ? log.scope(scopes) : log;
  }

  /**
   * Structural equality for {@link createSlogger} configs: primitives
   * by value, arrays element-wise, plain objects key-wise; every
   * function-valued member (formatters, context thunks) and every other
   * object type (class instances, streams, …) by REFERENCE IDENTITY.
   *
   * Function members are compared by reference — never by `.toString()`
   * source — because a function's behavior depends on the options it
   * closed over, which are invisible to source text. Factories such as
   * `maskingFormatter({...})` return a fresh closure per call whose
   * `.toString()` is byte-identical regardless of the (security-relevant)
   * options passed, so a source comparison treats a masking-`ssn` logger
   * and a masking-`ssn`+`password` logger as the SAME config and silently
   * hands the second caller the first (weaker) cached logger. Reference
   * identity is the only sound test: two configs are "same" only when
   * they reuse the identical formatter reference (e.g. a hoisted
   * `const fmt = maskingFormatter({...})` passed to both calls). A
   * distinct formatter instance — even from the same factory with the
   * same options — is a DIFFERENT config, so `createSlogger` raises the
   * config-conflict error rather than ever returning a stale (possibly
   * unmasked) logger.
   */
  private __sameConfig(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    // Function-valued members (formatters, context thunks) are compared
    // by reference identity ONLY. The `a === b` fast-path above already
    // returned true for the identical reference, so any two distinct
    // function references — and a function paired with a non-function —
    // are a difference. Comparing distinct closures by `.toString()` is
    // unsound: the source is blind to the closed-over options that
    // decide a formatter's behavior (which fields it masks), so a second
    // `createSlogger` that strengthens masking would otherwise inherit
    // the weaker cached logger. Distinct instance ⇒ distinct config.
    if (typeof a === 'function' || typeof b === 'function') {
      return false;
    }
    if (
      typeof a !== 'object' || typeof b !== 'object' ||
      a === null || b === null
    ) {
      return false;
    }
    if (Array.isArray(a) || Array.isArray(b)) {
      if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
        return false;
      }
      return a.every((value, i) => this.__sameConfig(value, b[i]));
    }
    // Compare only plain-object bags key-wise; any other object type
    // (class instances, streams, …) is compared by reference above.
    const protoA = Object.getPrototypeOf(a);
    const protoB = Object.getPrototypeOf(b);
    if (
      (protoA !== Object.prototype && protoA !== null) ||
      (protoB !== Object.prototype && protoB !== null)
    ) {
      return false;
    }
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((key) =>
      Object.hasOwn(b, key) &&
      this.__sameConfig(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key],
      )
    );
  }

  /**
   * Look up a previously-created Slogger by `name`, optionally wrapped
   * with pre-bound context fields. When `scopes` is provided the
   * returned instance is a {@link Slogger.scope}-wrapped view.
   *
   * @throws {SloggerConfigError} When no logger has been registered
   *   under `name`.
   *
   * @example
   * ```typescript
   * const reqLog = LogManager.getLogger('app', { reqId, userId });
   * reqLog.info('handled request');  // context: { reqId, userId }
   * ```
   */
  public getLogger(
    name: string,
    scopes?: Record<string, unknown>,
  ): Slogger {
    const log = this._loggers.get(name);
    if (!log) {
      throw new SloggerConfigError(`Logger '${name}' not found`, {
        key: 'name',
        value: name,
      });
    }
    return scopes ? log.scope(scopes) : log;
  }
}

// Export the singleton instance
/** */
export const LogManager: Manager = new Manager();
