import type { StatusCode } from '@tundralibs/compat/http';
import { BaseError } from '@tundralibs/utils';
import { RAPID_ERROR_CODES, type RapidErrorCode } from './RapidErrorCodes.ts';

/** Context carried by every {@link RapidError}. */
export type RapidErrorMeta = {
  /** The registered code — drives status mapping and default message. */
  code: RapidErrorCode;
  /** CLIENT-SAFE details, always rendered (e.g. which field failed). */
  details?: Record<string, unknown>;
  /**
   * Debug data — rendered only in DEVELOPMENT, always available to
   * logging. Never reaches a client in PRODUCTION.
   */
  debug?: Record<string, unknown>;
};

/**
 * The standardized framework error: code-first, transport-agnostic.
 * Modules never throw "HTTP" errors — they throw codes; what a code
 * renders AS is the transport layer's business (see {@link payload}).
 *
 * Extends the suite's `BaseError`, so `${var}` message templating,
 * cause chains, and JSON serialization come along.
 */
export class RapidError extends BaseError<RapidErrorMeta> {
  constructor(
    code: RapidErrorCode,
    options: {
      /** Override the registry's default message. */
      message?: string;
      details?: Record<string, unknown>;
      debug?: Record<string, unknown>;
      cause?: Error;
    } = {},
  ) {
    super(
      options.message ?? RAPID_ERROR_CODES[code].message,
      { code, details: options.details, debug: options.debug },
      options.cause,
    );
  }

  /** The registered error code. */
  public get code(): RapidErrorCode {
    return this.context.code;
  }

  /** The HTTP status the code maps to (non-HTTP transports ignore it). */
  public get status(): StatusCode {
    return RAPID_ERROR_CODES[this.context.code].status;
  }

  /**
   * The client-facing body under the app's disclosure mode:
   * - DEVELOPMENT — true message, `details`, and `debug`.
   * - PRODUCTION — 5xx collapse to the registry's opaque default and drop
   *   `details`; 4xx keep message + `details`; `debug` NEVER renders.
   */
  public payload(
    mode: 'DEVELOPMENT' | 'PRODUCTION',
  ): Record<string, unknown> {
    const { code, details, debug } = this.context;
    if (mode === 'DEVELOPMENT') {
      return {
        code,
        message: this.message,
        ...(details !== undefined ? { details } : {}),
        ...(debug !== undefined ? { debug } : {}),
      };
    }
    if (this.status >= 500) {
      return { code, message: RAPID_ERROR_CODES[code].message };
    }
    return {
      code,
      message: this.message,
      ...(details !== undefined ? { details } : {}),
    };
  }

  /**
   * Normalize anything thrown into an {@link RapidError}. Duck-types on
   * `context.code` rather than `instanceof` — both prior implementations
   * proved instanceof unreliable across realm/re-import boundaries.
   */
  public static from(error: unknown): RapidError {
    if (error instanceof RapidError) return error;
    const maybe = error as { context?: { code?: string } };
    const code = maybe?.context?.code;
    if (
      typeof code === 'string' && Object.hasOwn(RAPID_ERROR_CODES, code) &&
      error instanceof Error
    ) {
      const meta = (error as unknown as { context: RapidErrorMeta }).context;
      return new RapidError(code as RapidErrorCode, {
        message: error.message,
        details: meta.details,
        debug: meta.debug,
        cause: error,
      });
    }
    return new RapidError('RAPID_UNHANDLED', {
      debug: {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      cause: error instanceof Error ? error : undefined,
    });
  }
}
