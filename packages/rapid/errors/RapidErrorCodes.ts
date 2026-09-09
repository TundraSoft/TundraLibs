/**
 * The framework-reserved error codes. SCREAMING_SNAKE with the `RAPID_`
 * prefix (reserved). Each code carries its HTTP status mapping and a
 * client-safe default message; `RapidError` accepts these codes only —
 * an app's own failures ride `details` on the closest code.
 */
import type { StatusCode } from '@tundralibs/compat/http';

/** The framework's error registry — code → status, PRODUCTION message, and whether the code is `specific` (never derived from a bare status). */
export const RAPID_ERROR_CODES = {
  /** Uncaught / unregistered error. Always opaque to clients. */
  RAPID_UNHANDLED: { status: 500, message: 'Internal server error' },
  /** Invalid application configuration — thrown loudly at boot. */
  RAPID_CONFIG: { status: 500, message: 'Invalid configuration' },
  /** Contract input validation failed; issues render into `details`. */
  RAPID_VALIDATION_FAILED: {
    status: 400,
    message: 'Request validation failed',
  },
  /** Query string exceeded a structural cap (filters/sorts/lengths). */
  RAPID_QUERY_INVALID: { status: 400, message: 'Invalid query' },
  /** Outbound response failed its declared shape — a server bug. */
  RAPID_RESPONSE_INVALID: { status: 500, message: 'Internal server error' },
  /** A UI template/layout threw while rendering — a server bug. */
  RAPID_TEMPLATE_RENDER: { status: 500, message: 'Internal server error' },
  /** No/invalid principal — could not establish who is calling. */
  RAPID_UNAUTHENTICATED: { status: 401, message: 'Authentication required' },
  /** Valid principal, insufficient grants (distinct from 401 by design). */
  RAPID_ACCESS_DENIED: { status: 403, message: 'Access denied' },
  /** CSRF token missing, mismatched, or unsigned on a state-changing request. */
  RAPID_CSRF_INVALID: { status: 403, message: 'CSRF token invalid' },
  /** No route/handler matched. */
  RAPID_NOT_FOUND: { status: 404, message: 'Not found' },
  /** The path matched but not for this method (see `server.methodNotAllowed`). */
  RAPID_METHOD_NOT_ALLOWED: { status: 405, message: 'Method not allowed' },
  /** The request conflicts with in-flight state. */
  RAPID_CONFLICT: { status: 409, message: 'Conflict' },
  /**
   * An `Idempotency-Key` that is not an opaque token (over 255
   * characters). `specific`: never derived from a bare status — a
   * handler's own 400 is not an idempotency failure.
   */
  RAPID_IDEMPOTENCY_KEY_INVALID: {
    status: 400,
    message: 'Idempotency key invalid',
    specific: true,
  },
  /** The key's first attempt is still running — retry after it settles. */
  RAPID_IDEMPOTENCY_IN_FLIGHT: {
    status: 409,
    message: 'A request with this idempotency key is already in flight',
    specific: true,
  },
  /** The key was first used for a different request (method, path or body). */
  RAPID_IDEMPOTENCY_MISMATCH: {
    status: 422,
    message: 'Idempotency key reused with a different request',
    specific: true,
  },
  /** Request body over the configured limit. */
  RAPID_PAYLOAD_TOO_LARGE: { status: 413, message: 'Payload too large' },
  /** Content type (or file type) not accepted. */
  RAPID_UNSUPPORTED_MEDIA: { status: 415, message: 'Unsupported media type' },
  /** Handler exceeded its deadline. */
  RAPID_TIMEOUT: { status: 504, message: 'Request timed out' },
  /** Transport-layer rate limit tripped. */
  RAPID_RATE_LIMITED: { status: 429, message: 'Too many requests' },
  /** A file upload arrived on a runtime with no filesystem (Workers, browser). */
  RAPID_UPLOADS_UNAVAILABLE: {
    status: 501,
    message: 'File uploads are not available in this runtime',
  },
} as const satisfies Record<
  string,
  {
    status: StatusCode;
    message: string;
    /**
     * A purpose-specific code: never chosen when a code is DERIVED from a
     * bare status (a socket envelope for a handler-authored 422), only
     * when thrown by name.
     */
    specific?: true;
  }
>;

/** The union of framework error codes — derived, never hand-maintained. */
export type RapidErrorCode = keyof typeof RAPID_ERROR_CODES;
