import { LogLevel, BaseLogObject } from "./types.ts";

export abstract class BaseHandler {
  protected _level: LogLevel = LogLevel.ERROR;
  protected _logFormat: string = '{id} {datetime} {levelName} {message}';
  constructor(level: LogLevel = LogLevel.ERROR) {
    this._level = level;
  }
  
  handle(logObject: BaseLogObject) {
    if (logObject.level > this._level) return;
    // Ok we can write it
    const message = this._format(logObject)
    return this._handleLog(message);
  }

  protected _format(logRecord: BaseLogObject): string {
    // if(this._format instanceof Function) {
    //   return this._format(logRecord);
    // }
    return this._logFormat.replaceAll(/{([^\s}]+)}/g, (match, name): string => {
      const value = logRecord[name as keyof BaseLogObject];
      if(value == null) return match;
      return String(value);
    })
  }
  
  protected abstract _handleLog(message: string): void;

  async init() {}
  async cleanup() {}
}