import { SyslogSeverities } from '@tundralibs/utils';
import type { SloggerFormatter, SlogObject } from '../types/mod.ts';
import { standardFormat } from '../formatters/mod.ts';

/**
 * Configuration options for sampling behavior
 * @property sampleRate - Percentage of logs to keep (0.01 = 1%, 1.0 = 100%)
 * @property bypassSamplingForLevel - Logs at or above this level bypass sampling
 */
export type SamplingOptions = {
  sampleRate?: number;
  bypassSamplingForLevel?: number;
};

/**
 * Configuration options for logger handlers
 * @property level - The minimum severity level to process (0-7, lower is more severe)
 * @property formatter - Optional function to format log objects into strings
 * @property sampling - Optional sampling configuration
 */
export type HandlerOptions = {
  level: SyslogSeverities;
  formatter?: SloggerFormatter;
  sampling?: SamplingOptions;
};

/**
 * Abstract base class for all log handlers
 *
 * Provides common functionality for log handlers including:
 * - Log level filtering
 * - Message formatting
 * - Initialization and cleanup
 *
 * Concrete handlers must implement the _handle method and specify a mode.
 */
export abstract class AbstractHandler {
  /** Unique identifier for this handler */
  public readonly name: string;

  /** Minimum severity level to process (0-7, lower numbers are more severe) */
  public readonly level: SyslogSeverities;

  /** Function to format log objects into strings */
  public readonly formatter: SloggerFormatter;

  /** Handler type identifier (e.g., 'console', 'file', 'http') */
  public abstract readonly mode: string;

  /** Sampling rate (0.0-1.0) - default 1.0 means no sampling */
  protected _sampleRate: number = 1.0;

  /** Levels at or above this will bypass sampling - default is ERROR */
  protected _bypassSamplingLevel: number = SyslogSeverities.ERROR;

  /**
   * Creates a new handler instance
   *
   * @param name - Unique identifier for this handler (max 30 chars)
   * @param options - Configuration options for the handler
   * @throws Error if name is invalid or options are invalid
   */
  constructor(name: string, options: HandlerOptions) {
    if (typeof name !== 'string' || name.trim() === '' || name.length > 30) {
      throw new Error(
        'Handler name must be a non-empty string with max length 30',
      );
    }
    this.name = name.trim();
    if (
      typeof options.level != 'number' || options.level < 0 || options.level > 7
    ) {
      throw new Error('Invalid log level');
    }
    this.level = options.level ?? SyslogSeverities.ERROR;

    // Handle formatter - only accept formatter functions
    if (options.formatter) {
      if (typeof options.formatter === 'function') {
        this.formatter = options.formatter;
      } else {
        throw new Error('Formatter must be a function');
      }
    } else {
      this.formatter = standardFormat;
    }

    // Configure sampling if provided
    if (options.sampling) {
      if (options.sampling.sampleRate !== undefined) {
        if (
          typeof options.sampling.sampleRate !== 'number' ||
          options.sampling.sampleRate < 0 ||
          options.sampling.sampleRate > 1
        ) {
          throw new Error('Sampling rate must be a number between 0 and 1');
        }
        this._sampleRate = options.sampling.sampleRate;
      }

      if (options.sampling.bypassSamplingForLevel !== undefined) {
        if (
          typeof options.sampling.bypassSamplingForLevel !== 'number' ||
          options.sampling.bypassSamplingForLevel < 0 ||
          options.sampling.bypassSamplingForLevel > 7
        ) {
          throw new Error(
            'Bypass sampling level must be a valid log level (0-7)',
          );
        }
        this._bypassSamplingLevel = options.sampling.bypassSamplingForLevel;
      }
    }

    try {
      const test = this.formatter.call(this, {
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
      });
      if (typeof test !== 'string') {
        throw new Error('Formatter must return a string');
      }
    } catch (e) {
      throw new Error('Error running formatter: ' + e);
    }
  }

  /**
   * Initializes the handler
   * Can be overridden by concrete handlers to perform setup operations
   *
   * @returns Promise that resolves when initialization is complete
   */
  public init(): void;
  public async init(): Promise<void> {
  }

  /**
   * Processes a log entry if its level meets the handler's threshold
   * and passes sampling criteria if sampling is enabled
   *
   * @param log - The log object to process
   * @returns Promise that resolves when handling is complete
   */
  public async handle(log: SlogObject): Promise<void> {
    if (log.level <= this.level) {
      // Apply sampling logic if sample rate is less than 100%
      if (this._sampleRate < 1.0) {
        // High severity logs bypass sampling
        if (log.level > this._bypassSamplingLevel) {
          // Apply sampling rate - if random value is higher than sample rate, skip the log
          if (Math.random() > this._sampleRate) {
            return; // Log is sampled out (discarded)
          }
        }
      }

      const message = this._format(log);
      await this._handle(message);
    }
  }

  /**
   * Finalizes the handler
   * Can be overridden by concrete handlers to perform cleanup operations
   *
   * @returns Promise that resolves when finalization is complete
   */
  public finalize(): void;
  public async finalize(): Promise<void> {
  }

  /**
   * Formats a log object into a string
   * Can be overridden by concrete handlers to customize formatting behavior
   *
   * @param log - The log object to format
   * @returns Formatted log message string
   */
  protected _format(log: SlogObject): string {
    return this.formatter.call(this, log);
  }

  /**
   * Handles a formatted log message
   * Must be implemented by concrete handlers with handler-specific logic
   *
   * @param message - The formatted log message to handle
   * @returns Promise or void, depending on handler implementation
   */
  protected abstract _handle(message: string): Promise<void> | void;
}
