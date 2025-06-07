import {
  SyslogSeverities,
  SyslogSeverity,
  variableReplacer,
} from '@tundralibs/utils';
import { ulid } from '@tundralibs/id';
import { AbstractHandler, type HandlerOptions } from './handlers/mod.ts';
import type { SloggerFormatter, SlogObject } from './types/mod.ts';
import { LogManager } from './LogManager.ts';
import { SamplingOptions } from './handlers/AbstractHandler.ts';

export type SloggerHandlerOption = Omit<HandlerOptions, 'formatter'> & {
  formatter?: string | SloggerFormatter;
};

// New simplified handler configuration
export type HandlerConfig = {
  name: string;
  type: string;
  level?: SyslogSeverities;
  formatter?: string | SloggerFormatter;
  [key: string]: unknown; // Allow other handler-specific options
};

export type SloggerOptions = {
  /** Application name for logging context */
  appName: string;
  level: SyslogSeverities;
  handlers: HandlerConfig[];
  /** Optional global sampling configuration to apply to all handlers */
  sampling?: SamplingOptions;
};

export class Slogger {
  public readonly appName: string;
  public readonly hostname: string;
  public readonly level: SyslogSeverities;

  protected _handlers: Array<AbstractHandler> = [];

  constructor(options: SloggerOptions) {
    // Validate basic options
    if (
      !options.appName || typeof options.appName !== 'string' ||
      options.appName.length > 30
    ) {
      throw new Error('appName must be a non-empty string with max length 30');
    }
    this.appName = options.appName;
    this.hostname = Deno.hostname() || 'localhost';

    // Validate log level with more descriptive error
    if (
      typeof options.level !== 'number' || options.level < 0 ||
      options.level > 7
    ) {
      throw new Error(
        `Invalid log level: ${options.level}. Must be a number between 0-7`,
      );
    }
    this.level = options.level ?? SyslogSeverities.ERROR;

    // Initialize handlers if provided
    if (options.handlers) {
      this._initializeHandlers(options.handlers, options.sampling);
    }

    // Register cleanup on process exit
    addEventListener('unload', this._unload.bind(this));
  }

  /**
   * Initialize handlers from configuration
   * @private
   */
  private _initializeHandlers(
    handlers: SloggerOptions['handlers'],
    sampling?: SamplingOptions,
  ): void {
    // Handle both array (new) and object (legacy) formats
    if (Array.isArray(handlers)) {
      // New simplified format
      for (const handlerConfig of handlers) {
        try {
          const { name, type, ...options } = handlerConfig;

          // Validate handler options
          if (!name || typeof name !== 'string') {
            throw new Error('Handler requires a valid name string');
          }

          if (!type || typeof type !== 'string') {
            throw new Error(`Handler '${name}' requires a valid type string`);
          }

          if (typeof options.level !== 'number') {
            throw new Error(`Handler '${name}' requires a valid log level`);
          }

          // Resolve formatter if provided as string
          if (options.formatter) {
            if (typeof options.formatter === 'string') {
              const formatter = LogManager.getFormatter(options.formatter);
              if (!formatter) {
                throw new Error(`Formatter '${options.formatter}' not found`);
              }
              options.formatter = formatter;
            } else if (typeof options.formatter !== 'function') {
              throw new Error(
                `Formatter for handler '${name}' must be a string or function`,
              );
            }
          }

          // Apply global sampling configuration if provided and not overridden at handler level
          if (sampling && !options.sampling) {
            options.sampling = sampling;
          }

          // Create and register the handler
          const handler = LogManager.createHandler(
            type,
            name,
            options as HandlerOptions,
          );
          this.registerHandler(handler);
        } catch (error) {
          throw new Error(
            `Failed to initialize handler '${handlerConfig.name}': ${
              (error as Error).message
            }`,
          );
        }
      }
    }
  }

  /**
   * Register a handler with this logger instance
   *
   * @param handler - The handler to register
   * @throws Error if handler is not a valid AbstractHandler instance
   */
  public registerHandler(handler: AbstractHandler): void {
    if (!(handler instanceof AbstractHandler)) {
      throw new Error('Handler must be an instance of AbstractHandler');
    }
    this._handlers.push(handler);
  }

  public async log(
    level: SyslogSeverities,
    message: string,
    context: Record<string, unknown> = {},
  ): Promise<void> {
    if (level > this.level) {
      return;
    }
    const logObject: SlogObject = {
      id: ulid(),
      appName: this.appName,
      hostname: this.hostname,
      levelName: SyslogSeverities[level] as SyslogSeverity,
      level,
      context,
      message: variableReplacer(message, context),
      date: new Date(),
      isoDate: new Date().toISOString(),
      timestamp: new Date().getTime(),
    };
    for (const handler of this._handlers) {
      await handler.handle(logObject);
    }
  }

  public debug(
    message: string,
    context: Record<string, unknown> = {},
  ): void {
    this.log(SyslogSeverities.DEBUG, message, context);
  }

  public info(
    message: string,
    context: Record<string, unknown> = {},
  ): void {
    this.log(SyslogSeverities.INFO, message, context);
  }

  public information = this.info;

  public notice(
    message: string,
    context: Record<string, unknown> = {},
  ): void {
    this.log(SyslogSeverities.NOTICE, message, context);
  }

  public warn(
    message: string,
    context: Record<string, unknown> = {},
  ): void {
    this.log(SyslogSeverities.WARNING, message, context);
  }

  public warning = this.warn;

  public err(
    message: string,
    context: Record<string, unknown> = {},
  ): void {
    this.log(SyslogSeverities.ERROR, message, context);
  }

  public error = this.err;

  public crit(
    message: string,
    context: Record<string, unknown> = {},
  ): void {
    this.log(SyslogSeverities.CRITICAL, message, context);
  }

  public critical = this.crit;

  public alert(
    message: string,
    context: Record<string, unknown> = {},
  ): void {
    this.log(SyslogSeverities.ALERT, message, context);
  }

  public emerg(
    message: string,
    context: Record<string, unknown> = {},
  ): void {
    this.log(SyslogSeverities.EMERGENCY, message, context);
  }

  public emergency = this.emerg;

  protected async _unload(): Promise<void> {
    for (const handler of this._handlers) {
      await handler.finalize();
    }
  }
}
