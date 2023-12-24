/**
 * LogFacilities
 *
 * Definition of different facilities (sources). Used for Syslog transport
 */
export enum Facilities {
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

export type Facility = keyof typeof Facilities;
