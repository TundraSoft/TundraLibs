/**
 * @fileoverview Standard JWT error codes and their message templates.
 *
 * Each code maps to a descriptive template — `${causeMessage}` is
 * substituted from `error.context.causeMessage` at throw time so
 * callers can attach the underlying reason without parsing strings.
 * A throw site that supplies none loses the slot and the ` - `
 * separator ahead of it rather than emitting the placeholder.
 *
 * @module
 */

/**
 * Standard JWT error codes. Each value is a message template; the
 * `${causeMessage}` placeholder is filled from `error.context` at
 * throw time, or dropped — separator and all — when the throw site
 * supplies no cause text.
 */
export const JWTErrorCodes = {
  /** JWT token has passed its expiration time. */
  EXPIRED_TOKEN: 'JWT token is expired',
  /** JWT token is not yet valid (nbf claim). */
  NOT_ACTIVE: 'JWT token is not yet active',
  /** General JWT validation failure with specific cause. */
  INVALID_JWT: 'JWT token is invalid - ${causeMessage}',
  /** Secret key is invalid, empty, or malformed. */
  INVALID_SECRET: 'Invalid or empty secret provided - ${causeMessage}',
  /** Payload contains invalid data or structure. */
  INVALID_PAYLOAD: 'Invalid payload format or content - ${causeMessage}',
  /** JWT header is malformed or contains invalid data. */
  INVALID_HEADER: 'Invalid JWT header format - ${causeMessage}',
  /** Signature verification failed. */
  INVALID_SIGNATURE: 'JWT signature verification failed - ${causeMessage}',
  /** Token format doesn't match JWT structure (header.payload.signature). */
  INVALID_FORMAT: 'Invalid JWT token format - ${causeMessage}',
  /** Algorithm specified in header is not supported. */
  UNSUPPORTED_ALGORITHM: 'Unsupported JWT algorithm - ${causeMessage}',
  /** Standard or custom claims validation failed. */
  INVALID_CLAIMS: 'Invalid JWT claims - ${causeMessage}',
  /** Token exceeds the maximum allowed age. */
  MAX_AGE_EXCEEDED: 'JWT exceeds maximum age',
  /** Unexpected error during JWT processing. */
  UNKNOWN_ERROR: 'Unknown JWT error - ${causeMessage}',
};

/** Union of every legal JWT error code. */
export type JWTErrorCode = keyof typeof JWTErrorCodes;
