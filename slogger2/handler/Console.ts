import { AbstractHandler } from '../AbstractHandler.ts';
import type { ConsoleHandlerOptions, LogObject } from '../types/mod.ts';

export class ConsoleHandler extends AbstractHandler<ConsoleHandlerOptions> {
  protected _handle(log: LogObject): void {
    const message = this._format(log);
    const colorize = this._getOption('colorize');
    if (colorize === true) {
      switch (log.severity) {
        case 0:
          console.log(`\x1b[32m${message}\x1b[0m`);
          break;
        case 1:
          console.log(`\x1b[33m${message}\x1b[0m`);
          break;
        case 2:
          console.log(`\x1b[31m${message}\x1b[0m`);
          break;
        case 3:
          console.log(`\x1b[31m${message}\x1b[0m`);
          break;
        case 4:
          console.log(`\x1b[31m${message}\x1b[0m`);
          break;
        case 5:
          console.log(`\x1b[31m${message}\x1b[0m`);
          break;
        case 6:
          console.log(`\x1b[31m${message}\x1b[0m`);
          break;
        case 7:
          console.log(`\x1b[31m${message}\x1b[0m`);
          break;
      }
    } else {
      console.log(message);
    }
  }
}
