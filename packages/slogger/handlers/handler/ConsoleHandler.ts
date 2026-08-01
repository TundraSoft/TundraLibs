import type { SlogObject } from '../../types/SlogObject.ts';
import { AbstractHandler, type HandlerOptions } from '../AbstractHandler.ts';
import { blue, bold, brightYellow, red, yellow } from '@std/fmt/colors';

/**
 * Configuration options for Console handler
 * @property useColor - Whether to apply colors to log messages based on level
 */
export type ConsoleHandlerOptions = HandlerOptions & {
  useColor?: boolean;
};

/**
 * Console Handler for outputting log messages to the console
 *
 * This handler outputs formatted log messages to the console with optional
 * colorization based on log level.
 */
export class ConsoleHandler extends AbstractHandler {
  public readonly mode = 'console';

  protected _useColor: boolean;

  /**
   * Creates a new Console handler instance
   *
   * @param options - Configuration options for the handler
   */
  constructor(name: string, options: ConsoleHandlerOptions) {
    super(name, options);
    this._useColor = options.useColor ?? false;
  }

  /**
   * Formats a log object into a string and applies colorization if enabled
   *
   * Color scheme (syslog severity order — 0 is most severe):
   * - Level 0-1 (EMERGENCY/ALERT): Red
   * - Level 2-3 (CRITICAL/ERROR): Yellow
   * - Level 4-5 (WARNING/NOTICE): Bright Yellow
   * - Level 6-7 (INFO/DEBUG): Blue
   * - Bold for even levels (0,2,4,6)
   *
   * @param log - The log object to format
   * @returns Formatted and potentially colorized log message
   */
  protected override _format(log: SlogObject): string {
    const message = this.formatter(log);
    if (this._useColor === true) {
      // Apply colorization logic here
      switch (log.level) {
        case 0:
          return red(bold(message));
        case 1:
          return red(message);
        case 2:
          return yellow(bold(message));
        case 3:
          return yellow(message);
        case 4:
          return brightYellow(bold(message));
        case 5:
          return brightYellow(message);
        case 6:
          return blue(bold(message));
        case 7:
          return blue(message);
        /* c8 ignore next 2 -- log level is validated in AbstractHandler constructor */
        default:
          return message;
      }
    }
    return message;
  }

  /**
   * Handles a log message by outputting it to the console
   *
   * @param message - The formatted log message
   */
  protected _handle(message: string): void {
    // Log to console
    console.log(message);
  }
}
