export enum LogLevel {
  EMERGENCY = 0, 
  ALERT = 1, 
  CRITICAL = 2, 
  ERROR = 3, 
  WARNING = 4, 
  NOTICE = 5, 
  INFORMATIONAL = 6, 
  DEBUG = 7
}

export enum LogFacility {
  KERNEL = 0, 
  USER = 1, 
  MAIL = 2, 
  SYSTEM = 3, 
  AUTHORIZATION = 4, 
  SYSLOGD = 5, 
  PRINT = 6, 
  NEWS = 7, 
  UUCP = 8, 
  CLOCK = 9, 
  SECURITY = 10, 
  FTP = 11, 
  NTP = 12, 
  AUDIT = 13, 
  ALERT = 14, 
  DAEMON = 15, 
  LOCAL0 = 16, 
  LOCAL1 = 17, 
  LOCAL2 = 18, 
  LOCAL3 = 19, 
  LOCAL4 = 20, 
  LOCAL5 = 21, 
  LOCAL6 = 22, 
  LOCAL7 = 23
}

export type BaseLogObject = {
  id: string, 
  level: LogLevel, 
  levelName: string, 
  message: string, 
  datetime: number, 
}

export type SyslogVersion = "1";

export type SyslogObject = {
  prival: number, 
  version: SyslogVersion, 
  datetime: Date, 
  host: string, 
  appName: string, 
  procid: number, 
  msgid: string, 
  msg: string, 
}

export type HandlerConfig = {
  level: LogLevel, 
  facility: LogFacility
}

export type ConsoleHandlerConfig = {
  colorFmt: boolean
} & HandlerConfig;

export type FileHandlerConfig = {
  path: string, 
  name: string, 
  buffer?: number, 
  rotate?: {
    maxSize: number, 
  }
} & HandlerConfig;

// @TODO - Add stream handler later
// export type StreamHandlerConfig = {
//   url: string, 
//   headers?: Map<string, string>
// } & HandlerConfig;
