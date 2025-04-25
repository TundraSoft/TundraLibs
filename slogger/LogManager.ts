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
} from './handlers/mod.ts';
import type { SloggerFormatter, SlogObject } from './types/mod.ts';
import { jsonFormatter } from './formatters/jsonFormatter.ts';
import {
  compactFormat,
  detailedFormat,
  keyValueFormat,
  minimalistFormat,
  simpleFormatter,
  standardFormat,
} from './formatters/string.ts';
import { Slogger, SloggerHandlerOption, SloggerOptions } from './Slogger.ts';
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

  constructor() {
    // Register built-in handlers
    this.registerDefaultHandlers();
    // Register built-in formatters
    this.registerDefaultFormatters();
  }

  /**
   * Registers all built-in handler types
   */
  private registerDefaultHandlers(): void {
    this.addHandler('FileHandler', FileHandler);
    this.addHandler('ConsoleHandler', ConsoleHandler);
    this.addHandler('HTTPHandler', HTTPHandler);
    this.addHandler('BlackholeHandler', BlackholeHandler);
  }

  /**
   * Registers all built-in formatters
   */
  private registerDefaultFormatters(): void {
    this.addFormatter('json', jsonFormatter);
    this.addFormatter('standard', standardFormat);
    this.addFormatter('detailed', detailedFormat);
    this.addFormatter('compact', compactFormat);
    this.addFormatter('minimalist', minimalistFormat);
    this.addFormatter('keyValue', keyValueFormat);
  }

  /**
   * Adds a handler constructor to the registry
   *
   * @param name - Unique identifier for the handler type
   * @param handlerConstructor - Constructor for the handler type
   * @throws Error if name is invalid or handler is already registered
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
      throw new Error('Handler name must be a non-empty string');
    }

    // Check for duplicates
    if (this._handlers.has(name)) {
      throw new Error(`Handler '${name}' is already registered`);
    }

    // Validate constructor
    if (typeof handlerConstructor !== 'function') {
      throw new Error('Handler constructor must be a valid class constructor');
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
   * @throws Error if name is invalid, formatter is invalid, or formatter is already registered
   */
  public addFormatter(name: string, formatter: SloggerFormatter): void {
    // Validate name
    if (!name || typeof name !== 'string' || name.trim() === '') {
      throw new Error('Formatter name must be a non-empty string');
    }

    // Check for duplicates
    if (this._formatters.has(name)) {
      throw new Error(`Formatter '${name}' is already registered`);
    }

    // Validate formatter
    if (typeof formatter !== 'function') {
      throw new Error('Formatter must be a valid function');
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
        throw new Error('Formatter must return a string');
      }
    } catch (e) {
      throw new Error(
        `Invalid formatter: ${e instanceof Error ? e.message : String(e)}`,
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
   * @throws Error if template is invalid or formatter with name already exists
   */
  public createFormatter(name: string, template: string): SloggerFormatter {
    // Validate template
    if (!template || typeof template !== 'string') {
      throw new Error('Template must be a non-empty string');
    }

    // Check for duplicates
    if (this._formatters.has(name)) {
      throw new Error(`Formatter '${name}' is already registered`);
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
   * @throws Error if handler type is not found
   */
  public createHandler(
    type: string,
    name: string,
    options: SloggerHandlerOption,
  ): AbstractHandler {
    const handlerConstructor = this._handlers.get(type);
    if (!handlerConstructor) {
      throw new Error(`Handler type '${type}' not found`);
    }

    // If formatter is specified by name, resolve it
    if (options.formatter && typeof options.formatter === 'string') {
      const formatterName = options.formatter;
      const formatter = this.getFormatter(formatterName);
      if (!formatter) {
        throw new Error(`Formatter '${formatterName}' not found`);
      }
      options.formatter = formatter;
    }

    const handler = new handlerConstructor(name, options as HandlerOptions);
    handler.init();
    return handler;
  }

  public createSlogger(config: SloggerOptions): Slogger {
    const name = config.appName;
    if (this._loggers.has(name)) {
      return this._loggers.get(name) as Slogger;
    }
    const logger = new Slogger(config);
    this._loggers.set(name, logger);
    return logger;
  }

  public getLogger(name: string): Slogger {
    if (this._loggers.has(name)) {
      return this._loggers.get(name) as Slogger;
    } else {
      throw new Error(`Logger '${name}' not found`);
    }
  }
}

// Export the singleton instance
export const LogManager: Manager = new Manager();
