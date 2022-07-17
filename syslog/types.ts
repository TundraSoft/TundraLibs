/**
 * LogLevel
 * Definition of different log levels
 */
export enum LogSeverities {
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
export enum LogFacilities {
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

export const patterns = {
  // "RFC3164":
  //   /^<(\d+)?>([Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec]+\s\d{1,2}\s\d+:\d+:\d+)\s*([^\s]+)\s*(([a-z0-9]+)?(\[\d+\])?)\:\s*(.+)$/i,
  // "RFC3164": /(<(\d+)?>)(([Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec]+)\s*(\d{1,2})?\s*(\d{4}\s*)?(\d+:\d+:\d+)?\s)?\s*([^\s\:]+)?\s*(([^\s\:\[]+)?(\[(\d+)\])?)?:(.+)/i,
  "RFC3164":
    /(<(\d+)?>)(([Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec]+)?\s*(\d{1,2})\s*(\d{4})?\s*(\d{1,2}:\d{1,2}:\d{1,2}))?\s*([^\s\:]+)?\s*(([^\s\:\[]+)?(\[(\d+)\])?)?:(.+)/i,
  "RFC5424":
    /^<(\d+)?>\d (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\S+)\s*([^\s]+)\s*([^\s]+)\s*([^\s]+)\s*([^\s]+)\s*/i,
  "STRUCT": /\[[^\]]+\]\s*/g,
  "STRUCTID": /\[((\w+)@(\d+))\s*/,
  "STRUCTKEYS": /([\w.-]+)\s*=\s*(["'])((?:(?=(\\?))\3.)*?)\2/,
};

export const enum SyslogFormat {
  RFC5424 =
    "<{prival}>1 {dateTimeISO} {host} {appName} {procId} {msgId} - {message}",
  RFC3164 = "<{prival}>{dateTimeBSD} {host} {appName}[{procId}]: {message}",
  SIMPLE = "[{severityName}-{msgId}] {dateTimeISO} {message}",
}

export type StructuredData = {
  [key: string]: string;
};

export type SyslogObject = {
  version: "1";
  pri: number;
  dateTime: Date;
  severity: LogSeverities;
  facility: LogFacilities;
  msgId?: string;
  hostName?: string;
  appName?: string;
  procId?: number;
  structuredData?: Map<string, StructuredData>;
  message: string;
};
