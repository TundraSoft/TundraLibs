import { LogFacilities, LogSeverities, Syslog } from '/root/syslog/mod.ts';
import { alphaNumeric, nanoid } from '/root/nanoid/mod.ts';
import { Sysinfo } from '/root/sysinfo/mod.ts';

import type { HandlerOptions, LogConfig } from './types.ts';
import { BaseHandler } from './BaseHandler.ts';
import { ConsoleHandler } from './handlers/ConsoleHandler.ts';
import { FileHandler } from './handlers/FileHandler.ts';
import { POSTHandler } from './handlers/POSTHandler.ts';
import { SyslogHandler } from './handlers/SyslogHandler.ts';
import { BlackholeHandler } from './handlers/BlackholeHandler.ts';
import { CustomHandler } from './handlers/CustomHandler.ts';

export class Slogger {
  protected static _handlers: Array<BaseHandler<HandlerOptions>> = [];
  protected static _config: LogConfig;

  public static async init(
    config: Partial<LogConfig>,
    handlers: Array<Partial<HandlerOptions>>,
  ) {
    const defaults: Partial<LogConfig> = {
      hostName: await Sysinfo.getHostname(),
      pid: Sysinfo.getPid(),
      facility: LogFacilities.LOCAL4,
      severity: LogSeverities.ERROR,
    };
    Slogger._config = { ...defaults, ...config } as LogConfig;
    // Ok, now set handlers
    // await handlers.forEach(async (value: Partial<HandlerOptions>) => await Slogger.registerHandler(value));
    for (const handler of handlers) {
      await Slogger.registerHandler(handler);
    }
    // Add event to cleanup all handers
    addEventListener('unload', async () => await Slogger.unloadHandlers());
  }

  public static async registerHandler(
    handlerConfig: Partial<HandlerOptions>,
  ): Promise<void> {
    let handle: BaseHandler<HandlerOptions>;
    const defaults: Partial<HandlerOptions> = {
      appName: this._config.appName,
      hostName: this._config.hostName,
      severity: this._config.severity,
    };
    handlerConfig = { ...defaults, ...handlerConfig };
    switch (handlerConfig.type) {
      case 'CONSOLE':
        handle = new ConsoleHandler(handlerConfig);
        break;
      case 'FILE':
        handle = new FileHandler(handlerConfig);
        break;
      case 'POST':
        handle = new POSTHandler(handlerConfig);
        break;
      case 'SYSLOG':
        handle = new SyslogHandler(handlerConfig);
        break;
      case 'BLACKHOLE':
        handle = new BlackholeHandler(handlerConfig);
        break;
      case 'CUSTOM':
        handle = new CustomHandler(handlerConfig);
        break;
      default:
        throw new Error(
          `[module='slogger'] Unknown handler type ${handlerConfig.type}`,
        );
    }
    Slogger._handlers.push(handle);
    await handle.init();
  }

  public static async unloadHandlers() {
    await Slogger._handlers.map(async (handler) => await handler.cleanup());
  }

  public static log(
    severity: LogSeverities,
    message: string,
    ...args: unknown[]
  ) {
    if (severity > Slogger._config.severity) {
      return;
    }
    // Process message
    args.forEach((value, index) => {
      const val = String(value),
        rep = `\$\{${index}\}`;
      message = message.replaceAll(rep, val);
    });
    const obj = new Syslog(message, severity, Slogger._config.facility);
    // set log id
    obj.msgId = nanoid(12, alphaNumeric);
    obj.hostName = this._config.hostName;
    obj.appName = this._config.appName;
    obj.procId = this._config.pid;
    obj.facility = this._config.facility;
    // pass on to handlers
    Slogger._handlers.map((handler) => handler.handle(obj));
  }

  /**
   * emerg
   * Log a message with severity as emergency
   *
   * @param message string The message to log
   * @param args Array<unknown> The arguments to replace in message
   */
  public static emerg(message: string, ...args: unknown[]) {
    Slogger.log(LogSeverities.EMERGENCY, message, ...args);
  }

  /**
   * emergency
   * Log a message with severity as emergency
   *
   * @param message string The message to log
   * @param args Array<unknown> The arguments to replace in message
   */
  public static emergency(message: string, ...args: unknown[]) {
    Slogger.log(LogSeverities.EMERGENCY, message, ...args);
  }

  /**
   * alert
   * Log a message with severity as alert
   *
   * @param message string The message to log
   * @param args Array<unknown> The arguments to replace in message
   */
  public static alert(message: string, ...args: unknown[]) {
    Slogger.log(LogSeverities.ALERT, message, ...args);
  }

  /**
   * critical
   * Log a message with severity as critical
   *
   * @param message string The message to log
   * @param args Array<unknown> The arguments to replace in message
   */
  public static critical(message: string, ...args: unknown[]) {
    Slogger.log(LogSeverities.CRITICAL, message, ...args);
  }

  /**
   * error
   * Log a message with severity as error
   *
   * @param message string The message to log
   * @param args Array<unknown> The arguments to replace in message
   */
  public static error(message: string, ...args: unknown[]) {
    Slogger.log(LogSeverities.ERROR, message, ...args);
  }

  /**
   * warning
   * Log a message with severity as warning
   *
   * @param message string The message to log
   * @param args Array<unknown> The arguments to replace in message
   */
  public static warning(message: string, ...args: unknown[]) {
    Slogger.log(LogSeverities.WARNING, message, ...args);
  }

  /**
   * warn
   * Log a message with severity as warning
   *
   * @param message string The message to log
   * @param args Array<unknown> The arguments to replace in message
   */
  public static warn(message: string, ...args: unknown[]) {
    Slogger.log(LogSeverities.WARNING, message, ...args);
  }

  /**
   * notice
   * Log a message with severity as notice
   *
   * @param message string The message to log
   * @param args Array<unknown> The arguments to replace in message
   */
  public static notice(message: string, ...args: unknown[]) {
    Slogger.log(LogSeverities.NOTICE, message, ...args);
  }

  /**
   * info
   * Log a message with severity as informational
   *
   * @param message string The message to log
   * @param args Array<unknown> The arguments to replace in message
   */
  public static info(message: string, ...args: unknown[]) {
    Slogger.log(LogSeverities.INFORMATIONAL, message, ...args);
  }

  /**
   * informational
   * Log a message with severity as informational
   *
   * @param message string The message to log
   * @param args Array<unknown> The arguments to replace in message
   */
  public static informational(message: string, ...args: unknown[]) {
    Slogger.log(LogSeverities.INFORMATIONAL, message, ...args);
  }

  /**
   * debug
   * Log a message with severity as debug
   *
   * @param message string The message to log
   * @param args Array<unknown> The arguments to replace in message
   */
  public static debug(message: string, ...args: unknown[]) {
    Slogger.log(LogSeverities.DEBUG, message, ...args);
  }
}

// const logs: Array<Syslog> = [];
// await Slogger.init({
//   appName: 'testApp',
//   hostName: 'someHost',
//   severity: LogSeverities.ERROR,
//   facility: LogFacilities.LOCAL0
//   }, [{
//     type: "FILE",
//     severity: LogSeverities.CRITICAL,
//   }, {
//     type: "CONSOLE",
//   }
//   ]);

//   console.log('Starting')

//   for(let i = 0; i < 100; i++) {
//     Slogger.critical('This is log number ${0}', i);
//   }
