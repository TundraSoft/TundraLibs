/**
 * @fileoverview Error raised when a handler fails at runtime while
 * delivering or persisting log records.
 *
 * @module
 */

import { SloggerError } from './Base.ts';

/**
 * Structured context for {@link SloggerHandlerError}.
 *
 * `handler` is the name of the handler instance that failed; extra
 * fields (`url`, `status`, `file`, …) are scenario-specific.
 */
export type SloggerHandlerErrorContext = {
  /** Name of the handler instance that failed. */
  handler: string;
} & Record<string, unknown>;

/**
 * Thrown when a handler fails at runtime — an HTTP batch request gets
 * a non-2xx response or a network error, a file write fails, or a
 * handler is used before `init()`. The originating error (if any) is
 * preserved as `cause`.
 *
 * Note that `Slogger.log()` dispatches handlers fire-and-forget and
 * swallows their rejections; these errors surface to callers via
 * direct `handler.handle()` / `handler.finalize()` calls and via
 * `Slogger.finalize()` (wrapped in a `SloggerFinalizeError`).
 */
export class SloggerHandlerError
  extends SloggerError<SloggerHandlerErrorContext> {
  /**
   * Builds the error verbatim from `message` — throw sites are expected
   * to name the handler and the failing operation.
   *
   * @param message - Human-readable description of the failure.
   * @param context - Structured context carrying at least the failing
   *   handler's `handler` name.
   * @param cause - Underlying error that triggered this one, if any.
   */
  constructor(
    message: string,
    context: SloggerHandlerErrorContext,
    cause?: Error,
  ) {
    super(message, context, cause);
  }
}
