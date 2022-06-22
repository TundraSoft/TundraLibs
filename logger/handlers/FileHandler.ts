import { FileHandlerConfig, LogFormats, LogHandlerConfig } from "../types.ts";
import { BaseHandler } from "../BaseHandler.ts";

export class FileHandler extends BaseHandler {
  protected _logEntries: Array<string> = [];

  constructor(options: FileHandlerConfig) {
    if (!options.format) {
      options.format = LogFormats.SyslogLogFormat;
    }
    super(options as LogHandlerConfig);
    addEventListener("unload", async () => await this._writeToFile());
  }

  protected _handleLog(message: string) {
    // Colour format and display
    this._logEntries.push(message);
    // write if buffer is full
    if (this._logEntries.length > 2) {
      this._writeToFile();
    }
  }

  protected async _writeToFile() {
    console.log("Writing...");
    const encoder = new TextEncoder();
    const entries = this._logEntries;
    this._logEntries = [];
    const contents = await encoder.encode(entries.join("\n") + "\n");
    // Write
    Deno.writeFileSync("logFile.log", contents, {
      append: true,
      create: true,
      mode: 0o777,
    });
  }
}

// const a = new FileHandler();
// a.handle({
//   id: "1",
//   level: 0,
//   levelName: LogLevel[0],
//   message: "dfdsfgsdg",
//   datetime: Date.now(),
// });
// a.handle({
//   id: "2",
//   level: 0,
//   levelName: LogLevel[0],
//   message: "dfdsfgsdg",
//   datetime: Date.now(),
// });
// a.handle({
//   id: "3",
//   level: 0,
//   levelName: LogLevel[0],
//   message: "dfdsfgsdg",
//   datetime: Date.now(),
// });
// a.handle({
//   id: "4",
//   level: 0,
//   levelName: LogLevel[0],
//   message: "dfdsfgsdg",
//   datetime: Date.now(),
// });
// a.handle({
//   id: "5",
//   level: 0,
//   levelName: LogLevel[0],
//   message: "dfdsfgsdg",
//   datetime: Date.now(),
// });
