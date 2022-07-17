import { BaseHandler } from "../BaseHandler.ts";
import type { CustomHandlerOptions } from "../types.ts";
import { Syslog } from "../../syslog/mod.ts";

/**
 * CustomHandler
 *
 * Calls a custom function to handle the logs
 */
export class CustomHandler extends BaseHandler<CustomHandlerOptions> {
  constructor(option: Partial<CustomHandlerOptions>) {
    super(option);
    if (!this._options.callback) {
      throw new Error(
        `[module='slogger'] Callback function must be provided for CustomHandler`,
      );
    }
  }

  protected _handleLog(log: Syslog) {
    // Ok, set colours then console it
    const message = this._format(log);
    this._options.callback(message);
  }
}
