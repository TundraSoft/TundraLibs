/**
 * JSON Formatter for slogger
 *
 * Provides functionality to format log objects as pretty-printed JSON with
 * proper handling of special types like Date and BigInt.
 */
import type { SloggerFormatter, SlogObject } from '../types/mod.ts';

/**
 * Custom JSON stringify replacer function
 * Handles special cases during JSON serialization:
 * - Converts Date objects to ISO strings
 * - Converts BigInt values to strings
 * - Handles null/undefined values
 * - Passes objects through for recursive processing
 *
 * @param _key Property key (unused but required by JSON.stringify)
 * @param value The value to process
 * @returns Processed value ready for JSON serialization
 */
const stringify = (_key: string, value: unknown) => {
  if (value instanceof Date) {
    return value.toISOString();
  } else if (typeof value === 'bigint') {
    return value.toString();
  } else if (value === null || value === undefined) {
    return null;
  } else if (typeof value === 'object') {
    // Return object as is to let JSON.stringify handle it
    return value;
  }
  return value;
};

/**
 * Formats a log object as pretty-printed JSON
 * Uses custom replacer function to handle special data types
 *
 * @param log The log object to format
 * @returns Formatted JSON string with 2-space indentation
 */
export const jsonFormatter: SloggerFormatter = (log: SlogObject): string => {
  return JSON.stringify(log, stringify, 2);
};
