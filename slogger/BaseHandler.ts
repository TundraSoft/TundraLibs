import { Syslog } from '/root/syslog/mod.ts';
import type { HandlerOptions } from './types.ts';

export abstract class BaseHandler<T extends HandlerOptions> {
  protected _options: T;

  constructor(option: Partial<T>, defaults?: Partial<T>) {
    this._options = { ...defaults, ...option } as T;
  }

  public handle(log: Syslog): void {
    if (log.severity > this._options.severity) {
      return;
    }
    // Pass it to actual handler
    this._handleLog(log);
  }

  protected _format(log: Syslog): string {
    return log.toString(this._options.format);
  }

  protected abstract _handleLog(log: Syslog): void;

  async init(): Promise<void> {}

  async cleanup(): Promise<void> {}
}
