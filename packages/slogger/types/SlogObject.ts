/**
 * Log object type definitions
 * @module
 */

import { SyslogSeverities, SyslogSeverity } from '@tundralibs/utils';

/**
 * One log record, as handed to every handler and formatter.
 *
 * `date` / `timestamp` / `isoDate` are three views of the same instant,
 * and `level` / `levelName` two views of the same severity — pick
 * whichever your output format wants. On records minted by
 * {@link Slogger.log}, `id` and `isoDate` are lazy: reading them mints a
 * ULID or formats the date on first access, so a formatter that ignores
 * them pays nothing.
 */
export type SlogObject = {
  id: string;
  appName: string;
  hostname: string;
  level: SyslogSeverities;
  levelName: SyslogSeverity;
  date: Date;
  timestamp: number;
  isoDate: string;
  message: string;
  context?: Record<string, unknown>;
};
