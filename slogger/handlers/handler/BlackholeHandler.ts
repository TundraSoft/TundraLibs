import { AbstractHandler, type HandlerOptions } from '../AbstractHandler.ts';

/**
 * Blackhole Handler that discards all log messages
 *
 * This handler simply drops all log messages without processing them.
 * It's useful for:
 * - Silencing logs in production environments
 * - Performance testing without logging overhead
 * - Disabling specific log channels temporarily
 */
export class BlackholeHandler extends AbstractHandler {
  public readonly mode = 'blackhole';

  /**
   * Creates a new Blackhole handler instance
   *
   * @param options - Base handler options
   */
  constructor(name: string, options: HandlerOptions) {
    super(name, options);
  }

  /**
   * Handles a log message by discarding it (no-op)
   *
   * @param _message - The log message to discard
   */
  protected _handle(_message: string): void {
    // No operation - message is discarded
  }
}
