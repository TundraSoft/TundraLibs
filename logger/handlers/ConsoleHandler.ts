import { LogLevel, BaseLogObject, ConsoleHandlerConfig } from "../types.ts";
import { BaseHandler } from "../BaseHandler.ts";
import { brightRed, red, blue, green, magenta, yellow, bold, underline} from "../../dependencies.ts";

export class ConsoleHander extends BaseHandler {
  protected _logFormat = '[{levelName}] - {datetime} {id} {message}'
  constructor(level: LogLevel) {
    super(level);
  }

  override _format(logRecord: BaseLogObject): string {
    let msg = super._format(logRecord);
    switch(logRecord.level) {
      case 0:
        msg = bold(underline(brightRed(msg)))
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
    return msg;
  }
  protected _handleLog(message: string) {
    // Colour format and display
    console.log(message);
  }
}
