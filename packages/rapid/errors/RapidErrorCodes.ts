/**
 * The framework-reserved error codes. SCREAMING_SNAKE with the `RAPID_`
 * prefix — the prefix is RESERVED: an app registering a `RAPID_*` code is
 * a boot error (enforced when the app-side registry lands). Each code
 * carries its HTTP status mapping and a client-safe default message.
 *
 * App codes extend this via their own typed registry (as-const, so the
 * union of valid codes is derived) — extension mechanism lands with the
 * registration core.
 */
import type { StatusCode } from '@tundralibs/compat/http';

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
  /** No/invalid principal — could not establish who is calling. */
  RAPID_UNAUTHENTICATED: { status: 401, message: 'Authentication required' },
  /** Valid principal, insufficient grants (distinct from 401 by design). */
  RAPID_ACCESS_DENIED: { status: 403, message: 'Access denied' },
  /** No route/handler matched. */
  RAPID_NOT_FOUND: { status: 404, message: 'Not found' },
  /** Request body over the configured limit. */
  RAPID_PAYLOAD_TOO_LARGE: { status: 413, message: 'Payload too large' },
  /** Content type (or file type) not accepted. */
  RAPID_UNSUPPORTED_MEDIA: { status: 415, message: 'Unsupported media type' },
  /** Handler exceeded its deadline. */
  RAPID_TIMEOUT: { status: 504, message: 'Request timed out' },
  /** Transport-layer rate limit tripped. */
  RAPID_RATE_LIMITED: { status: 429, message: 'Too many requests' },
} as const satisfies Record<
  string,
  { status: StatusCode; message: string }
>;

/** The union of framework error codes — derived, never hand-maintained. */
export type RapidErrorCode = keyof typeof RAPID_ERROR_CODES;
