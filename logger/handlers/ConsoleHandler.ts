import {
  ConsoleHandlerConfig,
  LogFormats,
  LogHandlerConfig,
  LogObject,
} from "../types.ts";
import { BaseHandler } from "../BaseHandler.ts";
import {
  blue,
  bold,
  brightRed,
  green,
  magenta,
  red,
  underline,
  yellow,
} from "../../dependencies.ts";

export class ConsoleHandler extends BaseHandler {
  protected _colorFormat = false;
  constructor(options: ConsoleHandlerConfig) {
    if (!options.format) {
      options.format = LogFormats.ConsoleLogFormat;
    }
    super(options as LogHandlerConfig);
    this._colorFormat = options.colorFormat;
  }

  override _format(logRecord: LogObject): string {
    let msg = super._format(logRecord);
    if (this._colorFormat) {
      switch (logRecord.level) {
        case 0:
          msg = bold(underline(brightRed(msg)));
          break;
        case 1:
          msg = bold(brightRed(msg));
          break;
        case 2:
          msg = bold(brightRed(msg));
          break;
        case 3:
          msg = bold(red(msg));
          break;
        case 4:
          msg = yellow(msg);
          break;
        case 5:
          msg = blue(msg);
          break;
        case 6:
          msg = magenta(msg);
          break;
        case 7:
          msg = green(msg);
          break;
      }
    }
    return msg;
  }

  protected _handleLog(message: string) {
    // Colour format and display
    console.log(message);
  }
}
