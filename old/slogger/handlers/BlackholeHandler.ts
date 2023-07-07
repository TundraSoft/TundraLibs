import { BaseHandler } from '../BaseHandler.ts';
import { HandlerOptions } from '../types.ts';

import { Syslog } from '../../syslog/mod.ts';

/**
 * BlackholeHandler
 *
 * The greates of all loggers. Does nothing.
 */
export class BlackholeHandler extends BaseHandler<HandlerOptions> {
  protected _handleLog(_log: Syslog): void {
    return;
  }
}
