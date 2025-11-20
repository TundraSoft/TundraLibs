import { BaseError } from "@tundralibs/utils";

import type { JWTHeader, JWTPayload } from "./types.ts";

/**
 * Standard JWT error codes and their corresponding messages.
 *
 * Each error code maps to a descriptive message that may contain template variables
 * for dynamic content. The ${causeMessage} template variable is commonly used to
 * include underlying error details or specific context.
 *
 * @example
 * ```typescript
 * // Using error codes directly
 * if (error instanceof JWTError && error.context.code === 'EXPIRED_TOKEN') {
 *   console.log('Token has expired, please refresh');
 * }
 *
 * // Custom error with interpolation
 * throw new JWTError('INVALID_JWT', { causeMessage: 'Malformed header' });
 * ```
 *
 * @see {@link JWTError} JWT error class implementation
 */
export const JWTErrorCodes = {
  /** JWT token has passed its expiration time */
  EXPIRED_TOKEN: "JWT token is expired",
  /** JWT token is not yet valid (nbf claim) */
  NOT_ACTIVE: "JWT token is not yet active",
  /** General JWT validation failure with specific cause */
  INVALID_JWT: "JWT token is invalid - ${causeMessage}",
  /** Secret key is invalid, empty, or malformed */
  INVALID_SECRET: "Invalid or empty secret provided - ${causeMessage}",
  /** Payload contains invalid data or structure */
  INVALID_PAYLOAD: "Invalid payload format or content - ${causeMessage}",
  /** JWT header is malformed or contains invalid data */
  INVALID_HEADER: "Invalid JWT header format - ${causeMessage}",
  /** Signature verification failed */
  INVALID_SIGNATURE: "JWT signature verification failed - ${causeMessage}",
  /** Token format doesn't match JWT structure (header.payload.signature) */
  INVALID_FORMAT: "Invalid JWT token format - ${causeMessage}",
  /** Algorithm specified in header is not supported */
  UNSUPPORTED_ALGORITHM: "Unsupported JWT algorithm - ${causeMessage}",
  /** Standard or custom claims validation failed */
  INVALID_CLAIMS: "Invalid JWT claims - ${causeMessage}",
  /** Token exceeds the maximum allowed age */
  MAX_AGE_EXCEEDED: "JWT exceeds maximum age",
  /** Unexpected error during JWT processing */
  UNKNOWN_ERROR: "Unknown JWT error - ${causeMessage}",
};

/**
 * Union type of all valid JWT error codes.
 *
 * @example
 * ```typescript
 * function handleJWTError(code: JWTErrorCode) {
 *   switch (code) {
 *     case 'EXPIRED_TOKEN':
 *       return 'Please log in again';
 *     case 'INVALID_SIGNATURE':
 *       return 'Token has been tampered with';
 *     default:
 *       return 'Authentication error';
 *   }
 * }
 * ```
 */
export type JWTErrorCode = keyof typeof JWTErrorCodes;

/**
 * Metadata structure for JWT errors.
 *
 * Provides additional context for JWT errors including the specific error code,
 * original code if mapping was applied, and optional JWT components for debugging.
 *
 * @example
 * ```typescript
 * const errorMeta: JWTErrorMeta = {
 *   code: 'INVALID_HEADER',
 *   causeMessage: 'Missing algorithm field',
 *   header: { alg: 'HS256', typ: 'JWT' }
 * };
 * ```
 */
type JWTErrorMeta = {
  /** Standardized JWT error code */
  code: JWTErrorCode;
  /** Original error code if not in JWTErrorCodes (for error mapping) */
  originalCode?: string;
  /** JWT header if available for context */
  header?: JWTHeader;
  /** JWT payload if available for context */
  payload?: JWTPayload;
  /** Dynamic content for template interpolation */
  causeMessage?: string;
} & Record<string, unknown>;

/**
 * JWT-specific error class for all JWT-related errors.
 *
 * Extends BaseError to provide structured error handling with template interpolation
 * support for dynamic error messages. Automatically maps unknown error codes to
 * 'INVALID_JWT' while preserving the original code for debugging.
 *
 * Features:
 * - Template interpolation with ${causeMessage} variable
 * - Automatic error code mapping for unknown codes
 * - Contextual information including JWT components
 * - Proper error chaining with cause support
 *
 * @template M - Error metadata type extending JWTErrorMeta
 *
 * @example
 * ```typescript
 * // Simple error
 * throw new JWTError('EXPIRED_TOKEN');
 *
 * // Error with cause message
 * throw new JWTError('INVALID_JWT', { causeMessage: 'Malformed signature' });
 *
 * // Error with full context
 * throw new JWTError('INVALID_HEADER', {
 *   causeMessage: 'Missing required field',
 *   header: invalidHeader
 * });
 *
 * // Error with cause chain
 * try {
 *   // some operation
 * } catch (originalError) {
 *   throw new JWTError('UNKNOWN_ERROR', {
 *     causeMessage: originalError.message
 *   }, originalError);
 * }
 * ```
 *
 * @see {@link BaseError} Base error class for template interpolation details
 * @see {@link JWTErrorCodes} Available error codes and messages
 */

export class JWTError<
  M extends JWTErrorMeta = JWTErrorMeta,
> extends BaseError<M> {
  /**
   * Creates a new JWT error instance.
   *
   * Automatically handles error code mapping, template interpolation, and context
   * management. Unknown error codes are mapped to 'INVALID_JWT' while preserving
   * the original code for debugging purposes.
   *
   * @param code - JWT error code (must be a key from JWTErrorCodes)
   * @param meta - Error metadata including context and template variables
   * @param cause - Optional underlying error that caused this JWT error
   *
   * @throws {JWTError} Always throws - this is the constructor for the error class
   *
   * @example
   * ```typescript
   * // Basic error
   * throw new JWTError('EXPIRED_TOKEN');
   *
   * // Error with interpolation
   * throw new JWTError('INVALID_SIGNATURE', {
   *   causeMessage: 'HMAC verification failed'
   * });
   *
   * // Error with full context
   * throw new JWTError('INVALID_HEADER', {
   *   causeMessage: 'Missing algorithm',
   *   header: malformedHeader
   * });
   * ```
   */
  constructor(code: JWTErrorCode, meta?: Omit<M, "code">, cause?: Error) {
    const context: M = { code, ...meta } as M;
    if (!JWTErrorCodes[code]) {
      context.originalCode = code;
      code = "INVALID_JWT";
    }
    context.code = code;

    // Handle template interpolation for causeMessage
    let message = JWTErrorCodes[code];
    if (message.includes("${causeMessage}") && context.causeMessage) {
      message = message.replace(
        "${causeMessage}",
        String(context.causeMessage),
      );
    }

    super(message, context, cause);
    this.name = "JWTError";
  }
}
