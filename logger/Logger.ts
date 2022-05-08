import { LogLevel, BaseLogObject } from "./types.ts"
import { BaseHandler } from "./BaseHandler.ts"
import { nanoid, alphaNumeric } from "../nanoid/mod.ts"

export class Logger {
  protected static _appName: string;
  protected static _level: LogLevel = LogLevel.ERROR;
  protected static _handlers: Map<string, BaseHandler> = new Map();

  public static init(appName: string, level: LogLevel, handlers: unknown) {
    // Ignore if already initialized
    if(!Logger._appName) {
      Logger._appName = appName.trim();
      Logger._level = level;
    }
  }

  public static registerHandler(handler: unknown): boolean {
    return false;
  }

  public static log(level: LogLevel, message: string, ...args: unknown[]) {
    if(level > Logger._level) return;
    // Suppliment the args
    args.forEach((value, index) => {
      // we support both ? and ${0} replacement
      
    });
    const logObj: BaseLogObject = {
      id: nanoid(32, alphaNumeric), 
      level: level, 
      levelName: LogLevel[level], 
      message: message, 
      datetime: Date.now()
    }
    console.log(logObj);
    // now pass it on to handlers
  }

  public static emergency(message: string, ...args: unknown[]) {
    Logger.log(LogLevel.EMERGENCY, message, args);
  }
  public static alert(message: string, ...args: unknown[]) {
    Logger.log(LogLevel.ALERT, message, args);
  }
  public static critical(message: string, ...args: unknown[]) {
    Logger.log(LogLevel.CRITICAL, message, args);
  }
  public static error(message: string, ...args: unknown[]) {
    Logger.log(LogLevel.ERROR, message, args);
  }
  public static warn(message: string, ...args: unknown[]) {
    Logger.log(LogLevel.WARNING, message, args);
  }
  public static notice(message: string, ...args: unknown[]) {
    Logger.log(LogLevel.NOTICE, message, args);
  }
  public static info(message: string, ...args: unknown[]) {
    Logger.log(LogLevel.INFORMATIONAL, message, args);
  }
  public static informational(message: string, ...args: unknown[]) {
    Logger.log(LogLevel.INFORMATIONAL, message, args);
  }
  public static debug(message: string, ...args: unknown[]) {
    Logger.log(LogLevel.DEBUG, message, args);
  }
}

Logger.log(LogLevel.ALERT, "sdfsdf")