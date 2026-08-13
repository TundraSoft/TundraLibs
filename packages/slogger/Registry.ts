/**
 * @fileoverview The handler/formatter registry that sits **underneath**
 * both {@link Slogger} and `LogManager`.
 *
 * This module is a deliberate leaf: it imports handlers, formatters,
 * types, and errors, and imports nothing that imports it back. `Slogger`
 * needs the registry to resolve `type` / `formatter` strings in its
 * handler configs; `LogManager` needs it to expose `addHandler` /
 * `addFormatter` / … to consumers *and* needs `Slogger` as a value to
 * construct cached loggers. Before this module existed those two needs
 * met in a `Slogger.ts` ⇄ `LogManager.ts` value-import cycle.
 *
 * That cycle was legal ESM and worked natively, but it is fragile under
 * bundlers: one top-level `await` anywhere in a consumer's module graph
 * makes esbuild (wrangler) and Rollup (Vite) lower *every* module
 * initializer in that graph to an async function, at which point a
 * two-way import edge deadlocks — `await init_Slogger()` awaits
 * `await init_LogManager()` which awaits `init_Slogger()`. Routing both
 * through this leaf turns the cycle into two one-way edges, so the
 * package stays importable no matter what a consumer's graph contains.
 *
 * The exported {@link registry} binding is a module-scope singleton:
 * every importer within the package — `Slogger.ts`, `LogManager.ts` —
 * shares the one instance, so a handler or formatter registered through
 * `LogManager` is visible to every `Slogger` that resolves a config by
 * name.
 *
 * @module
 */

import {
  AbstractHandler,
  BlackholeHandler,
  ConsoleHandler,
  FileHandler,
  type HandlerOptions,
  HTTPHandler,
  MemoryHandler,
  StreamHandler,
  SyslogHandler,
  TCPHandler,
} from './handlers/mod.ts';
import {
  compactFormat,
  detailedFormat,
  jsonFormatter,
  keyValueFormat,
  logfmtFormatter,
  minimalistFormat,
  otelLogFormatter,
  prettyJsonFormatter,
  simpleFormatter,
  standardFormat,
} from './formatters/mod.ts';
import type { SloggerFormatter, SlogObject } from './types/mod.ts';
import { SloggerConfigError } from './errors/mod.ts';
// Type-only back-edge: erased at compile time, so it cannot create a
// runtime cycle back into `Slogger.ts`. See the module note above.
import type { HandlerConfig } from './Slogger.ts';

/**
 * Registry of handler constructors and formatters, plus the factory that
 * turns a declarative handler config into a live {@link AbstractHandler}.
 *
 * Not exported — the package shares the single {@link registry} instance
 * created at the bottom of this module. `LogManager` re-exposes this
 * surface verbatim as the consumer-facing API.
 */
class Registry {
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
   * Creates a custom formatter using the {@link simpleFormatter} factory
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
}

/**
 * The one registry shared by the whole package.
 *
 * A module-scope binding is the singleton: `Slogger.ts` and
 * `LogManager.ts` both import *this* value, so `LogManager.addFormatter`
 * and a `Slogger` resolving `formatter: 'name'` read and write the same
 * two maps. Creating a second {@link Registry} anywhere would silently
 * split handler/formatter lookup between the two.
 */
export const registry: Registry = new Registry();
