/**
 * LogLevel
 * Definition of different log levels
 */
export enum LogLevel {
  EMERGENCY = 0,
  ALERT = 1,
  CRITICAL = 2,
  ERROR = 3,
  WARNING = 4,
  NOTICE = 5,
  INFORMATIONAL = 6,
  DEBUG = 7,
}

/**
 * LogFacilities
 * Definition of different facilities. Used for Syslog transport
 */
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
  LOCAL7 = 23,
}

export type Handlers = "FILE" | "CONSOLE" | "STREAM";

export enum LogFormats {
  SimpleLogFormat = "[{appName}-{levelName}] {datetime} {msgid} {message}",
  SyslogLogFormat =
    "<{prival}>{version} {datetime} {host} {appName} {procid} {msgid} - {message}",
  ConsoleLogFormat = "[{appName}-{levelName}] {datetime} {msgid} {message}",
}

export type LogFormat = keyof LogFormats;
/**
 * LogHandlerConfig
 * Basic log handler config definition
 */
export type LogHandlerConfig = {
  handlerType: Handlers;
  level: LogLevel;
  facility?: LogFacility;
  format?: string;
};

/**
 * FileHandlerConfig
 * Handler configuration for File logging
 */
export type FileHandlerConfig = {
  handlerType: "FILE";
  path: string;
  buffer?: number;
  rotate?: {
    size?: number;
    date?: boolean;
  };
} & LogHandlerConfig;

/**
 * ConsoleHandlerConfig
 * Handler configuration for console
 */
export type ConsoleHandlerConfig = {
  handlerType: "CONSOLE";
  colorFormat: boolean;
  // [keyof typeof LogLevel]: string
} & LogHandlerConfig;

/**
 * StreamHandlerConfig
 * Handler configuraton for streaming the logs
 */
export type StreamHandlerConfig = {
  handlerType: "STREAM";
  baseUrl: string;
  method: "POST";
} & LogHandlerConfig;

/**
 * LoggerConfig
 * Configuration for logger
 */
export type LoggerConfig = {
  name: string;
  logLevel: LogLevel;
  handlers: Array<LogHandlerConfig>;
};

export type SyslogVersion = "1";

/**
 * LogObject
 * Standard log object
 */
export type LogObject = {
  msgid: string;
  level: LogLevel;
  facility: LogFacility;
  levelName: string;
  message: string;
  datetime: number;
  prival?: number;
  appName?: string;
  version?: SyslogVersion;
  host?: string;
  procid?: number;
};
