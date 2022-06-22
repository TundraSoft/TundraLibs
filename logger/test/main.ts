import { Logger } from "../Logger.ts";
import { ConsoleHandlerConfig, LogFormats } from "../types.ts";
import func from "./sub.ts";

import { LogLevel } from "../types.ts";
Logger.init("test", LogLevel.DEBUG);
await Logger.registerHandler({
  handlerType: "CONSOLE",
  level: LogLevel.DEBUG,
  colorFormat: true,
  format: LogFormats.SyslogLogFormat,
} as ConsoleHandlerConfig);

Logger.debug("adfjsdkfjb ${0} ${1} ${0}", 'abhinav', 'is');
Logger.info("adfjsdkfjb");
Logger.alert("adfjsdkfjb");

func();
