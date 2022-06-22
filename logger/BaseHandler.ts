import {
  LogFacility,
  LogFormats,
  LogHandlerConfig,
  LogLevel,
  LogObject,
} from "./types.ts";

export abstract class BaseHandler {
  // protected options: LogHandlerConfig;
  protected _logLevel: LogLevel;
  protected _facility: LogFacility = LogFacility.LOCAL0;
  protected _logFormat: string = LogFormats.SimpleLogFormat;

  constructor(options: LogHandlerConfig) {
    this._logLevel = options.level;
    if (options.facility) {
      this._facility = options.facility;
    }
    this._logFormat = options.format as string;
  }

  handle(logObject: LogObject) {
    if (logObject.level > this._logLevel) return;
    // Overload with defaults
    if (!logObject.facility) {
      logObject.facility = this._facility;
    }
    const message = this._format(logObject);
    return this._handleLog(message);
  }

  protected _format(logRecord: LogObject) {
    return this._logFormat.replaceAll(/{([^\s}]+)}/g, (match, name): string => {
      let value = logRecord[name as keyof LogObject];
      if (name === "datetime") {
        value = new Date(value as number).toISOString();
      }
      if (value == null) return match;
      return String(value);
    });
  }

  protected abstract _handleLog(message: string): void;

  async init() {}
  async cleanup() {}
}
