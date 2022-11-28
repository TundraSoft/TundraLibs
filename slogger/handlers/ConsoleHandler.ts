import { BaseHandler } from '../BaseHandler.ts';
import type { ConsoleHandlerOptions } from '../types.ts';
import { Syslog } from '/root/syslog/mod.ts';

import {
  blue,
  bold,
  brightRed,
  green,
  magenta,
  red,
  underline,
  yellow,
} from '/root/dependencies.ts';

/**
 * ConsoleHandler
 *
 * Routes the logs to the console. Typically usefull for development or monitoring.
 * The logs are not stored anywhere.
 */
export class ConsoleHandler extends BaseHandler<ConsoleHandlerOptions> {
  constructor(option: Partial<ConsoleHandlerOptions>) {
    const defaults = {
      colorFormat: true,
    };
    super(option, defaults);
  }

  protected _handleLog(log: Syslog) {
    // Ok, set colours then console it
    const message = this._format(log);
    console.log(message);
  }

  override _format(log: Syslog): string {
    let message = log.toString(this._options.format);
    if (this._options.colorFormat) {
      switch (log.severity) {
        case 0:
          message = bold(underline(brightRed(message)));
          break;
        case 1:
          message = bold(brightRed(message));
          break;
        case 2:
          message = bold(brightRed(message));
          break;
        case 3:
          message = bold(red(message));
          break;
        case 4:
          message = yellow(message);
          break;
        case 5:
          message = blue(message);
          break;
        case 6:
          message = magenta(message);
          break;
        case 7:
          message = green(message);
          break;
      }
    }
    return message;
  }
}
