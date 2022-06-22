import { LogFormats, LogHandlerConfig, StreamHandlerConfig } from "../types.ts";
import { BaseHandler } from "../BaseHandler.ts";

export class StreamHandler extends BaseHandler {
  constructor(options: StreamHandlerConfig) {
    if (!options.format) {
      options.format = LogFormats.SyslogLogFormat;
    }
    super(options as LogHandlerConfig);
    // addEventListener("unload", async () => await this._writeToFile());
  }

  protected _handleLog(message: string) {
    // Colour format and display
    console.log(message);
  }
}
