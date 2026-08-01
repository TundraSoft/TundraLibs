/**
 * String Formatter for slogger
 *
 * Provides functionality to format log objects as strings using templates
 * with variable replacements. Backed by {@link templatize} from
 * `@tundralibs/utils` — the project's canonical template engine.
 * Uses `onMissing: 'literal'` so an unbound `${var}` survives in the
 * log line rather than vanishing, which is what humans tailing logs
 * expect.
 *
 * @module
 */
import { templatize } from '@tundralibs/utils';
import type { SloggerFormatter, SlogObject } from '../types/mod.ts';

/**
 * `templatize` templates do dot-path property lookup only — they
 * cannot invoke methods, so a template like
 * `${date.toLocaleTimeString()}` would emit its own source text
 * verbatim. Formats that need a derived value (e.g. a time-only
 * stamp) are therefore written as plain function formatters below.
 */

/**
 * Compile a `${var}` template into a fast renderer for `SlogObject`.
 *
 * Backed by {@link templatize} with `onMissing: 'literal'` (unknown
 * variables keep their `${name}` placeholder rather than disappearing
 * — preserves the legacy `variableReplacer` contract). Templates are
 * compiled once at construction time; rendering is then a loop of
 * literal-append + dot-path lookup per call (no regex per log).
 */
export const simpleFormatter = (template: string): SloggerFormatter => {
  const renderer = templatize(template, { onMissing: 'literal' });
  // `SlogObject` has more keys than any single template references,
  // so cast away templatize's strict value-type narrowing.
  return renderer as unknown as (log: SlogObject) => string;
};

/**
 * Standard log format with timestamp, level and message.
 * Example: `[2023-04-21T15:20:30.123Z] [INFO] User logged in successfully`
 */
export const standardFormat: SloggerFormatter = simpleFormatter(
  '[${isoDate}] [${levelName}] ${message}',
);

/**
 * Detailed log format with appName and hostname.
 * Example: `2023-04-21T15:20:30.123Z [INFO] [myApp] [server123] User logged in successfully`
 */
export const detailedFormat: SloggerFormatter = simpleFormatter(
  '${isoDate} [${levelName}] [${appName}] [${hostname}] ${message}',
);

/**
 * Compact log format with a UTC time-only stamp (`HH:mm:ss`, sliced
 * from the record's ISO timestamp).
 * Example: `INFO [15:20:30] User logged in successfully`
 *
 * Implemented as a function formatter (not a template) because the
 * time-only stamp is derived from `isoDate` — see the note on
 * {@link templatize} method-call limitations above.
 */
export const compactFormat: SloggerFormatter = (log: SlogObject): string =>
  `${log.levelName} [${log.isoDate.slice(11, 19)}] ${log.message}`;

/**
 * Simple format with just level and message.
 * Example: `INFO: User logged in successfully`
 */
export const minimalistFormat: SloggerFormatter = simpleFormatter(
  '${levelName}: ${message}',
);

/**
 * DevOps-friendly format with key=value pairs.
 * Example: `ts=2023-04-21T15:20:30.123Z level=INFO app=myApp msg="User logged in successfully"`
 */
export const keyValueFormat: SloggerFormatter = simpleFormatter(
  'ts=${isoDate} level=${levelName} app=${appName} msg="${message}"',
);
