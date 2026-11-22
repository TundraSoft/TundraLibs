import type { SlogObject } from '../../types/SlogObject.ts';
import { AbstractHandler, type HandlerOptions } from '../AbstractHandler.ts';
import { blue, bold, brightYellow, red, yellow } from '@std/fmt/colors';
import { writeStdout } from '@tundralibs/compat/cli';
import {
  isBun,
  isDeno,
  isNode,
  onError,
  onExit,
  onUnhandledRejection,
} from '@tundralibs/compat/runtime';
import { SyslogSeverities } from '@tundralibs/utils';

/** Pending output past this many characters is written at once. */
const MAX_PENDING_CHARS = 65_536;

/**
 * Configuration options for Console handler
 * @property useColor - Whether to apply colors to log messages based on level
 * @property buffered - Collect lines and write them to stdout together on
 *   the next turn of the event loop, instead of one `console.log` per line.
 *   A record at `ERROR` or more severe writes everything pending at once,
 *   and so does `finalize()`; pending lines are also written when the
 *   process exits or dies of an uncaught error. Default `true`. Ignored on Cloudflare Workers
 *   and the browser, which always use `console.log`.
 */
export type ConsoleHandlerOptions = HandlerOptions & {
  useColor?: boolean;
  buffered?: boolean;
};

/**
 * Console Handler for outputting log messages to the console
 *
 * This handler outputs formatted log messages to the console with optional
 * colorization based on log level.
 *
 * On Deno, Bun and Node.js lines are buffered by default (see
 * {@link ConsoleHandlerOptions.buffered}): a `console.log` made by your own
 * code in the meantime appears before the buffered log lines.
 */
export class ConsoleHandler extends AbstractHandler {
  /** Runtime discriminator for this handler kind. */
  public readonly mode = 'console';

  /**
   * Whether {@link _format} wraps output in ANSI colour codes. Off by
   * default — the escape sequences are noise once output is piped or
   * redirected to a file.
   */
  protected _useColor: boolean;

  /** Whether lines are collected and written once per event-loop turn. */
  protected _buffered: boolean;

  private __pending = '';
  private __flushQueued = false;

  /** Handlers holding unwritten lines, flushed when the process ends. */
  private static readonly __withPending = new Set<ConsoleHandler>();
  private static __exitHooked = false;

  /**
   * Creates a new Console handler instance
   *
   * @param options - Configuration options for the handler
   */
  constructor(name: string, options: ConsoleHandlerOptions) {
    super(name, options);
    this._useColor = options.useColor ?? false;
    this._buffered = (options.buffered ?? true) && (isDeno || isBun || isNode);
  }

  /**
   * Handles a record; a record at `ERROR` or more severe also writes
   * everything pending, so the lines before a crash are not lost.
   *
   * @param log - The log object to process
   * @returns Promise that resolves when handling is complete
   */
  public override handle(log: SlogObject): Promise<void> {
    const done = super.handle(log);
    if (log.level <= SyslogSeverities.ERROR) this.__flush();
    return done;
  }

  /**
   * Writes everything pending.
   *
   * @returns Promise that resolves when finalization is complete
   */
  public override finalize(): Promise<void> {
    this.__flush();
    return super.finalize();
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
    if (!this._buffered) {
      console.log(message);
      return;
    }
    if (this.__pending === '') ConsoleHandler.__track(this);
    this.__pending += message + '\n';
    if (this.__pending.length >= MAX_PENDING_CHARS) {
      this.__flush();
    } else if (!this.__flushQueued) {
      this.__flushQueued = true;
      setTimeout(() => this.__flush(), 0);
    }
  }

  /**
   * Remembers `handler` until its lines are written, and on first use
   * hooks process exit — plus, on Deno, an uncaught error or rejection,
   * which end the process without an exit event. Those Deno listeners only
   * write; the process still dies. Node and Bun are not hooked that way:
   * their listeners would stop the crash, and their exit event fires
   * after one anyway.
   */
  private static __track(handler: ConsoleHandler): void {
    ConsoleHandler.__withPending.add(handler);
    if (ConsoleHandler.__exitHooked) return;
    ConsoleHandler.__exitHooked = true;
    const flushAll = () => {
      for (const h of ConsoleHandler.__withPending) h.__flush();
    };
    onExit(flushAll);
    if (isDeno) {
      onError(flushAll);
      onUnhandledRejection(flushAll);
    }
  }

  private __flush(): void {
    this.__flushQueued = false;
    if (this.__pending === '') return;
    ConsoleHandler.__withPending.delete(this);
    const text = this.__pending;
    this.__pending = '';
    try {
      writeStdout(text);
    } catch {
      // stdout is gone (e.g. a closed pipe); the lines are dropped, as
      // they would be with console.log.
    }
  }
}
