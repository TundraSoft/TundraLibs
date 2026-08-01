/**
 * @fileoverview Error raised when Slogger is given an invalid or
 * conflicting configuration value.
 *
 * @module
 */

import { SloggerError } from './Base.ts';

/**
 * Thrown when an option fails validation or a registration/lookup is
 * invalid — bad `appName`/`level` on a `Slogger`, malformed handler
 * options (`url`, `batchSize`, `directory`, `transport`, …),
 * duplicate or unknown handler/formatter names on `LogManager`, and
 * `LogManager.createSlogger` configuration conflicts.
 *
 * These are setup-time programming mistakes: they are thrown
 * synchronously from constructors and registration methods, never
 * from the log dispatch path.
 *
 * @typeParam M - Shape of structured `context` attached to the error
 *   (throw sites attach the offending key/value where it helps).
 */
export class SloggerConfigError<
  M extends Record<string, unknown> = Record<string, unknown>,
> extends SloggerError<M> {}
