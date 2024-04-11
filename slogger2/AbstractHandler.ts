import { type OptionKeys, Options } from '../options/mod.ts';
import type { HandlerOptions, LogObject } from './types/mod.ts';

export abstract class AbstractHandler<O extends HandlerOptions = HandlerOptions>
  extends Options<O> {
  constructor(options: OptionKeys<O>) {
    super(options);
  }

  public handle(log: LogObject): void {
    if (log.severity >= this._getOption('severity')) {
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
    if (this._getOption('formatter') === undefined) {
      return `${log.appName}: [${log.severity} ${log.timestamp.toISOString()}] - ${log.message} ${
        log.params ? JSON.stringify(log.params) : ''
      }`;
    } else {
      return this._getOption('formatter')(log);
    }
  }

  protected abstract _handle(log: LogObject): void;
}

// function test() {
//   console.log('In test');
//   const error = new Error();
//   const stack = Deno.inspect(error.stack);
//   console.log(Deno.mainModule);
//   console.log(error.stack?.split('\n')[2].trim());
// }

// test();
