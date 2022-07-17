import { BaseHandler } from "../BaseHandler.ts";
import { Syslog } from "../../syslog/mod.ts";
import type { POSTHandlerOptions } from "../types.ts";

/**
 * POSTHandler
 *
 * Sends the Log messages to remote server as a POST method call
 */
export class POSTHandler extends BaseHandler<POSTHandlerOptions> {
  constructor(option: Partial<POSTHandlerOptions>) {
    super(option);
  }

  protected async _handleLog(log: Syslog): Promise<void> {
    const logObj = log.toJSON();
    let formData: FormData;
    let header: Headers;
    if (this._options.headers) {
      if (typeof this._options.headers === "function") {
        header = await this._options.headers();
      } else {
        header = this._options.headers;
      }
    } else {
      header = new Headers();
    }
    if (this._options.body) {
      formData = await this._options.body(logObj);
    } else {
      formData = new FormData();
      for (const [key, value] of Object.entries(logObj)) {
        formData.set(key, value.toString());
      }
    }
    // Headers
    await fetch(this._options.url, {
      method: "POST",
      headers: header,
      body: formData,
    });
    // @TODO - Process output
  }
}
