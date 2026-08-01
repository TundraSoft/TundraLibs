/**
 * @fileoverview Error raised when RESTler is given an invalid configuration value.
 *
 * @module
 */

import { RESTlerError, RESTlerErrorMeta } from './Base.ts';

/**
 * Thrown when a client option or endpoint setting fails validation
 *
 * Raised at construction time for a missing or invalid `baseURL`, or a bad
 * `version`, `port`, `timeout`, or `contentType` option, and per-request for an
 * invalid endpoint `baseURL`, `port`,
 * `version`, `contentType`, `timeout`, or `auth` — endpoint overrides are held to
 * the same contract as their instance-level counterparts. The metadata's `key`
 * names the offending field and `value` carries the rejected input.
 */
export class RESTlerConfigError
  extends RESTlerError<RESTlerErrorMeta & { key: string; value?: unknown }> {
  /**
   * Build the error, recording the offending config `key` and rejected `value`
   *
   * @param message - Description of why the configuration is invalid
   * @param meta - Metadata carrying `vendor`, the offending `key`, and its rejected `value`
   * @param cause - Underlying error that triggered this one, if any
   */
  constructor(
    message: string,
    meta: RESTlerErrorMeta & { key: string; value?: unknown },
    cause?: Error,
  ) {
    super(message, meta, cause);
  }
}
