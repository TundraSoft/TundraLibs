/**
 * String Formatter for slogger
 *
 * Provides functionality to format log objects as strings using templates
 * with variable replacements. This allows for customizable log formats.
 */
import type { SloggerFormatter, SlogObject } from '../types/mod.ts';
import { variableReplacer } from '@tundralibs/utils';

/**
 * Creates a formatter function that uses a template string to format log objects
 * Variables in the template are replaced with corresponding values from the log object
 *
 * Template variables use the format ${variableName} and will be replaced with
 * the corresponding property from the log object.
 *
 * @param template The template string with variables to replace
 * @returns A formatter function that converts log objects to formatted strings
 */
export const simpleFormatter = (template: string): SloggerFormatter => {
  return (log: SlogObject): string => {
    return variableReplacer(template, log);
  };
};

/**
 * Sample string format templates
 */

/**
 * Standard log format with timestamp, level and message
 * Example: [2023-04-21T15:20:30.123Z] [INFO] User logged in successfully
 */
export const standardFormat: SloggerFormatter = simpleFormatter(
  '[${isoDate}] [${levelName}] ${message}',
);

/**
 * Detailed log format with additional context
 * Example: 2023-04-21 15:20:30.123 [INFO] [myApp v1.0.0] [server123] [pid:1234] User logged in successfully
 */
export const detailedFormat: SloggerFormatter = simpleFormatter(
  '${isoDate} [${levelName}] [${appName}] [${hostname}] ${message}',
);

/**
 * Compact log format
 * Example: INFO [15:20:30] User logged in successfully
 */
export const compactFormat: SloggerFormatter = simpleFormatter(
  '${levelName} [${date.toLocaleTimeString()}] ${message}',
);

/**
 * Simple format with just level and message
 * Example: INFO: User logged in successfully
 */
export const minimalistFormat: SloggerFormatter = simpleFormatter(
  '${levelName}: ${message}',
);

/**
 * DevOps-friendly format with key-value pairs
 * Example: ts=2023-04-21T15:20:30.123Z level=INFO app=myApp version=1.0.0 msg="User logged in successfully"
 */
export const keyValueFormat: SloggerFormatter = simpleFormatter(
  'ts=${isoDate} level=${levelName} app=${appName} msg="${message}"',
);
