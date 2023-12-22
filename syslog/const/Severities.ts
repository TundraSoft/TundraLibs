/**
 * LogSeverities
 *
 * Definition of different log severities
 */
export enum Severities {
  EMERGENCY = 0,
  ALERT = 1,
  CRITICAL = 2,
  ERROR = 3,
  WARNING = 4,
  NOTICE = 5,
  INFORMATIONAL = 6,
  DEBUG = 7,
}

export type Severity = keyof typeof Severities;
