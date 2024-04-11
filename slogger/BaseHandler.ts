import { Severities } from '../syslog/mod.ts';
import type { LogObject } from './types/mod.ts';

export abstract class BaseHandler {
  declare protected _formatter: ((log: LogObject) => string) | undefined;
  declare protected _severity: Severities;

  constructor(options: Record<string, unknown> = {}) {
  }

  public handle(log: LogObject): void {
    if (log.severity >= this._severity) {
      this._handle(log);
    }
  }

  public init(): void | Promise<void>;
  public init(): void {
    return;
  }

  public cleanup(): void | Promise<void>;
  public cleanup(): void {
    return;
  }

  protected _format(log: LogObject): string {
    if (this._formatter === undefined) {
      return `${log.appName}: [${log.severity} ${log.timestamp.toISOString()}] - ${log.message} ${
        log.params ? JSON.stringify(log.params) : ''
      }`;
    } else {
      return this._formatter(log);
    }
  }

  protected abstract _handle(log: LogObject): void;
}
