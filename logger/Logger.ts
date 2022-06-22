import { alphaNumeric, nanoid } from "../nanoid/mod.ts";
import {
  ConsoleHandlerConfig,
  FileHandlerConfig,
  LogFacility,
  LogHandlerConfig,
  LogLevel,
  LogObject,
  StreamHandlerConfig,
} from "./types.ts";
import { BaseHandler } from "./BaseHandler.ts";
import { ConsoleHandler } from "./handlers/ConsoleHandler.ts";
import { FileHandler } from "./handlers/FileHandler.ts";
import { StreamHandler } from "./handlers/StreamHandler.ts";

export class Logger {
  protected static _appName: string;
  protected static _level: LogLevel = LogLevel.ERROR;
  protected static _facility: LogFacility = LogFacility.LOCAL0;
  protected static _handlers: Array<BaseHandler> = [];
  protected static _pid: number = Deno.pid;
  protected static _host: string;

  /**
   * init
   * Initialize the logging object. Any log messages sent before initialization
   * will be ignored
   *
   * @param appName string The application name
   * @param level LogLevel The "level" above which to log
   * @param handlers
   */
  public static init(
    appName: string,
    level: LogLevel,
    handlers?: Array<LogHandlerConfig>,
  ) {
    // Ignore if already initialized
    if (!Logger._appName) {
      Logger._appName = appName.trim();
      Logger._level = level;
      Logger._pid = Deno.pid;
      
      if (handlers && handlers.length > 0) {
        handlers.forEach((handlerConfig) =>
          this.registerHandler(handlerConfig)
        );
      }
    }
  }

  /**
   * registerHandler
   * Register a log handler which will actually "process" the logs
   *
   * @param handler
   * @returns
   */
  public static async registerHandler(
    handlerConfig: LogHandlerConfig,
  ): Promise<void> {
    let handler: BaseHandler;
    switch (handlerConfig.handlerType) {
      case "CONSOLE":
        handler = new ConsoleHandler(handlerConfig as ConsoleHandlerConfig);
        break;
      case "FILE":
        handler = new FileHandler(handlerConfig as FileHandlerConfig);
        break;
      case "STREAM":
        handler = new StreamHandler(handlerConfig as StreamHandlerConfig);
        break;
      default:
        throw new Error("Unknown Handler specified");
    }
    await handler.init();
    Logger._handlers.push(handler);
  }

  /**
   * log
   * Function to call when message/stack trace etc is to be logged
   *
   * @param level
   * @param message
   * @param args
   * @returns
   */
  public static log(level: LogLevel, message: string, ...args: unknown[]) {
    if (level > Logger._level) return;
    // Suppliment the args
    // args.forEach((value, index) => {
    //   // we support both ? and ${0} replacement
    //   message = message.replaceAll(`\$\{index\}`, String(value));
    // });
    const logObj: LogObject = {
      msgid: nanoid(10, alphaNumeric),
      level: level,
      levelName: LogLevel[level],
      message: message,
      datetime: Date.now(),
      appName: Logger._appName,
      facility: Logger._facility,
    };
    Logger._handlers.map((handler) => handler.handle(logObj));
  }

  //#region Helpers for logging
  /**
   * emerg
   * Log a message with type as emergency
   *
   * @param message string The message to log
   * @param args Array<unknown> The arguments to replace in message
   */
  public static emerg(message: string, ...args: unknown[]) {
    Logger.log(LogLevel.EMERGENCY, message, ...args);
  }

  /**
   * emergency
   * Log a message with type as emergency
   *
   * @param message string The message to log
   * @param args Array<unknown> The arguments to replace in message
   */
  public static emergency(message: string, ...args: unknown[]) {
    Logger.log(LogLevel.EMERGENCY, message, ...args);
  }

  /**
   * alert
   * Log a message with type as alert
   *
   * @param message string The message to log
   * @param args Array<unknown> The arguments to replace in message
   */
  public static alert(message: string, ...args: unknown[]) {
    Logger.log(LogLevel.ALERT, message, ...args);
  }

  /**
   * critical
   * Log a message with type as critical
   *
   * @param message string The message to log
   * @param args Array<unknown> The arguments to replace in message
   */
  public static crit(message: string, ...args: unknown[]) {
    Logger.log(LogLevel.CRITICAL, message, ...args);
  }

  /**
   * critical
   * Log a message with type as critical
   *
   * @param message string The message to log
   * @param args Array<unknown> The arguments to replace in message
   */
  public static critical(message: string, ...args: unknown[]) {
    Logger.log(LogLevel.CRITICAL, message, ...args);
  }

  /**
   * error
   * Log a message with type as critical
   *
   * @param message string The message to log
   * @param args Array<unknown> The arguments to replace in message
   */
  public static error(message: string, ...args: unknown[]) {
    Logger.log(LogLevel.ERROR, message, ...args);
  }

  /**
   * warn
   * Log a message with type as warning
   *
   * @param message string The message to log
   * @param args Array<unknown> The arguments to replace in message
   */
  public static warn(message: string, ...args: unknown[]) {
    Logger.log(LogLevel.WARNING, message, ...args);
  }

  /**
   * warn
   * Log a message with type as warning
   *
   * @param message string The message to log
   * @param args Array<unknown> The arguments to replace in message
   */
  public static warning(message: string, ...args: unknown[]) {
    Logger.log(LogLevel.WARNING, message, ...args);
  }

  /**
   * notice
   * Log a message with type as Notice
   *
   * @param message string The message to log
   * @param args Array<unknown> The arguments to replace in message
   */
  public static notice(message: string, ...args: unknown[]) {
    Logger.log(LogLevel.NOTICE, message, ...args);
  }

  /**
   * info
   * Log a message with type as information
   *
   * @param message string The message to log
   * @param args Array<unknown> The arguments to replace in message
   */
  public static info(message: string, ...args: unknown[]) {
    Logger.log(LogLevel.INFORMATIONAL, message, ...args);
  }

  /**
   * informational
   * Log a message with type as information (alias of info)
   *
   * @param message string The message to log
   * @param args Array<unknown> The arguments to replace in message
   */
  public static informational(message: string, ...args: unknown[]) {
    Logger.log(LogLevel.INFORMATIONAL, message, ...args);
  }

  /**
   * debug
   * Log a message with type as debug
   *
   * @param message string The message to log
   * @param args Array<unknown> The arguments to replace in message
   */
  public static debug(message: string, ...args: unknown[]) {
    Logger.log(LogLevel.DEBUG, message, ...args);
  }
  //#endregion Helpers for logging
}
