/**
 * LogManager module for managing handlers and formatters
 * @module
 */

import { Singleton } from '@tundralibs/utils';
import {
  AbstractHandler,
  type HandlerOptions,
} from './handlers/AbstractHandler.ts';
import {
  BlackholeHandler,
  ConsoleHandler,
  FileHandler,
  HTTPHandler,
  MemoryHandler,
  StreamHandler,
  SyslogHandler,
  TCPHandler,
} from './handlers/mod.ts';
import type { SloggerFormatter, SlogObject } from './types/mod.ts';
import {
  jsonFormatter,
  prettyJsonFormatter,
} from './formatters/jsonFormatter.ts';
import { logfmtFormatter } from './formatters/logfmt.ts';
import { otelLogFormatter } from './formatters/otel.ts';
import {
  compactFormat,
  detailedFormat,
  keyValueFormat,
  minimalistFormat,
  simpleFormatter,
  standardFormat,
} from './formatters/string.ts';
import { HandlerConfig, Slogger, SloggerOptions } from './Slogger.ts';
import type { ScopedSlogger } from './types/mod.ts';
import { SloggerConfigError } from './errors/mod.ts';
/**
 * LogManager Singleton
 *
 * Manages all available handlers and formatters in the Slogger system.
 * Provides factory methods to initialize handlers and access formatters.
 */
@Singleton
class Manager {
  /** Map of registered handler constructors */
  protected _handlers: Map<
    string,
    new (
      name: string,
      options: HandlerOptions & Record<string, unknown>,
    ) => AbstractHandler
  > = new Map();

  /** Map of registered formatters */
  protected _formatters: Map<
    string,
    SloggerFormatter
  > = new Map();

  protected _loggers: Map<string, Slogger> = new Map();

  /**
   * Config each cached Slogger was created with — used by
   * {@link createSlogger} to detect conflicting re-creation.
   */
  private __loggerConfigs: Map<string, SloggerOptions> = new Map();

  constructor() {
    // Register built-in handlers
    this.__registerDefaultHandlers();
    // Register built-in formatters
    this.__registerDefaultFormatters();
  }

  /**
   * Registers all built-in handler types
   */
  private __registerDefaultHandlers(): void {
    this.addHandler('FileHandler', FileHandler);
    this.addHandler('ConsoleHandler', ConsoleHandler);
    this.addHandler('HTTPHandler', HTTPHandler);
    this.addHandler('SyslogHandler', SyslogHandler);
    this.addHandler('TCPHandler', TCPHandler);
    this.addHandler('StreamHandler', StreamHandler);
    this.addHandler('MemoryHandler', MemoryHandler);
    this.addHandler('BlackholeHandler', BlackholeHandler);
  }

  /**
   * Registers all built-in formatters
   */
  private __registerDefaultFormatters(): void {
    this.addFormatter('json', jsonFormatter);
    this.addFormatter('prettyJson', prettyJsonFormatter);
    this.addFormatter('standard', standardFormat);
    this.addFormatter('detailed', detailedFormat);
    this.addFormatter('compact', compactFormat);
    this.addFormatter('minimalist', minimalistFormat);
    this.addFormatter('keyValue', keyValueFormat);
    this.addFormatter('logfmt', logfmtFormatter());
    this.addFormatter('otelLog', otelLogFormatter());
  }

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
    // Validate name
    if (!name || typeof name !== 'string' || name.trim() === '') {
      throw new SloggerConfigError('Handler name must be a non-empty string', {
        key: 'name',
      });
    }

    // Check for duplicates
    if (this._handlers.has(name)) {
      throw new SloggerConfigError(`Handler '${name}' is already registered`, {
        key: 'name',
      });
    }

    // Validate constructor
    if (typeof handlerConstructor !== 'function') {
      throw new SloggerConfigError(
        'Handler constructor must be a valid class constructor',
        { key: 'handlerConstructor' },
      );
    }

    // Register the handler
    this._handlers.set(
      name,
      handlerConstructor as new (
        name: string,
        options: HandlerOptions & Record<string, unknown>,
      ) => AbstractHandler,
    );
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
    // Validate name
    if (!name || typeof name !== 'string' || name.trim() === '') {
      throw new SloggerConfigError(
        'Formatter name must be a non-empty string',
        { key: 'name' },
      );
    }

    // Check for duplicates
    if (this._formatters.has(name)) {
      throw new SloggerConfigError(
        `Formatter '${name}' is already registered`,
        { key: 'name' },
      );
    }

    // Validate formatter
    if (typeof formatter !== 'function') {
      throw new SloggerConfigError('Formatter must be a valid function', {
        key: 'formatter',
      });
    }

    // Validate formatter output with a test log
    try {
      const testLog = {
        id: '1',
        appName: 'test',
        hostname: 'test',
        level: 1,
        date: new Date(),
        timestamp: Date.now(),
        isoDate: new Date().toISOString(),
        levelName: 'WARNING',
        context: {},
        message: 'test',
      } as SlogObject;

      const result = formatter(testLog);
      if (typeof result !== 'string') {
        throw new TypeError('Formatter must return a string');
      }
    } catch (e) {
      throw new SloggerConfigError(
        `Invalid formatter: ${e instanceof Error ? e.message : String(e)}`,
        { key: 'formatter' },
        e instanceof Error ? e : undefined,
      );
    }

    this._formatters.set(name, formatter);
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
    // Validate template
    if (!template || typeof template !== 'string') {
      throw new SloggerConfigError('Template must be a non-empty string', {
        key: 'template',
      });
    }

    // Check for duplicates
    if (this._formatters.has(name)) {
      throw new SloggerConfigError(
        `Formatter '${name}' is already registered`,
        { key: 'name' },
      );
    }

    const formatter = simpleFormatter(template);
    this.addFormatter(name, formatter);
    return formatter;
  }

  /**
   * Gets a formatter by name
   *
   * @param name - Name of the formatter to retrieve
   * @returns The formatter function or undefined if not found
   */
  public getFormatter(name: string): SloggerFormatter | undefined {
    return this._formatters.get(name);
  }

  /**
   * Gets all registered formatter names
   *
   * @returns Array of formatter names
   */
  public getFormatterNames(): string[] {
    return Array.from(this._formatters.keys());
  }

  /**
   * Gets all registered handler type names
   *
   * @returns Array of handler type names
   */
  public getHandlerTypes(): string[] {
    return Array.from(this._handlers.keys());
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
    const handlerConstructor = this._handlers.get(type);
    if (!handlerConstructor) {
      throw new SloggerConfigError(`Handler type '${type}' not found`, {
        key: 'type',
      });
    }

    // If formatter is specified by name, resolve it
    if (options.formatter && typeof options.formatter === 'string') {
      const formatterName = options.formatter;
      const formatter = this.getFormatter(formatterName);
      if (!formatter) {
        throw new SloggerConfigError(`Formatter '${formatterName}' not found`, {
          key: 'formatter',
        });
      }
      options.formatter = formatter;
    }

    const handler = new handlerConstructor(name, options as HandlerOptions);
    // Kick off async initialization (e.g. FileHandler opening its file)
    // eagerly, but never leave the promise unhandled: an init failure
    // (bad directory, permission denied) would otherwise surface as an
    // uncaught rejection that terminates the process. `handle()` and
    // `finalize()` await the same cached promise, so early records wait
    // for setup instead of racing ahead and being dropped, and the
    // error is re-surfaced there (swallowed by Slogger.log(), or raised
    // by Slogger.finalize()) rather than crashing.
    handler.ensureInitialized().catch(() => {});
    return handler;
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
   * import { LogManager, SyslogSeverities } from '@tundralibs/slogger';
   *
   * declare const reqId: string;
   * declare const userId: string;
   *
   * // Same config object on both calls — see the reference-identity rule.
   * const config = { appName: 'app', level: SyslogSeverities.INFO };
   * const root = LogManager.createSlogger(config);
   * const req = LogManager.createSlogger(config, { reqId, userId });
   * req.info('hi');  // context: { reqId, userId }
   * ```
   */
  public createSlogger(config: SloggerOptions): Slogger;
  /**
   * Scoped overload — see the unscoped signature for the caching and
   * config-conflict rules.
   *
   * Passing `scopes` returns a {@link Slogger.scope} view, typed as
   * {@link ScopedSlogger}: the full logging surface **without**
   * `finalize()` / `registerHandler()`, which the wrapper does not have
   * at runtime either. The cached root owns the handlers — reach it via
   * `getLogger(config.appName)` to finalize.
   *
   * @param config - Config for the underlying (cached) root logger.
   * @param scopes - Context fields pre-bound to every record emitted
   *   through the returned view.
   * @throws {SloggerConfigError} When a Slogger with `config.appName`
   *   already exists and `config` differs from the configuration it
   *   was created with.
   */
  public createSlogger(
    config: SloggerOptions,
    scopes: Record<string, unknown> | undefined,
  ): ScopedSlogger;
  public createSlogger(
    config: SloggerOptions,
    scopes?: Record<string, unknown>,
  ): Slogger | ScopedSlogger {
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
   * import { LogManager } from '@tundralibs/slogger';
   *
   * declare const reqId: string;
   * declare const userId: string;
   *
   * const reqLog = LogManager.getLogger('app', { reqId, userId });
   * reqLog.info('handled request');  // context: { reqId, userId }
   * ```
   */
  public getLogger(name: string): Slogger;
  /**
   * Scoped overload — see the unscoped signature.
   *
   * Passing `scopes` returns a {@link Slogger.scope} view, typed as
   * {@link ScopedSlogger}: no `finalize()` / `registerHandler()`, since
   * the registered root logger owns the handlers. Call
   * `getLogger(name)` without `scopes` to get that root.
   *
   * @param name - `appName` the logger was registered under.
   * @param scopes - Context fields pre-bound to every record emitted
   *   through the returned view.
   * @throws {SloggerConfigError} When no logger has been registered
   *   under `name`.
   */
  public getLogger(
    name: string,
    scopes: Record<string, unknown> | undefined,
  ): ScopedSlogger;
  public getLogger(
    name: string,
    scopes?: Record<string, unknown>,
  ): Slogger | ScopedSlogger {
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
/**
 * Process-wide registry of handler types and named formatters, and the
 * get-or-create cache of {@link Slogger} instances behind
 * `createSlogger()` / `getLogger()`.
 *
 * A singleton — every import site gets the same instance, so a handler
 * or formatter registered once is visible to every logger in the
 * process. The eight built-in handler types and nine built-in formatters
 * are registered at module load; `addHandler()` / `addFormatter()` reject
 * a name that is already taken.
 */
export const LogManager: Manager = new Manager();
