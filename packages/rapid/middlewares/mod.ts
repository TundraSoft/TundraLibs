/**
 * @fileoverview Barrel for the shipped middleware factories — each one
 * returns a universal `RapidMiddleware` (one registration, every
 * transport). Import-light by design: nothing here pulls beyond what
 * the core already uses.
 *
 * @module
 */

export { compress, type CompressOptions } from './compress.ts';
export { cors, type CorsOptions } from './cors.ts';
export {
  markOpenApi,
  MIDDLEWARE_OPENAPI,
  middlewareOpenApi,
  type RapidMiddlewareOpenApi,
} from './openapiMeta.ts';
export { csrf, type CsrfOptions } from './csrf.ts';
export { etag } from './etag.ts';
export {
  idempotency,
  type IdempotencyHooks,
  type IdempotencyOptions,
  type IdempotencyRecord,
  type IdempotentReply,
  memoryIdempotencyHooks,
} from './idempotency.ts';
export {
  memoryRateLimitHooks,
  rateLimit,
  type RateLimitHooks,
  type RateLimitOptions,
  type RateLimitWindow,
} from './rateLimit.ts';
export {
  guardHTTP,
  guardJOB,
  guardSOCKET,
  MIDDLEWARE_SCOPE,
  middlewareScope,
  onlyApi,
  onlyHTTP,
  onlyJOB,
  onlySOCKET,
  onlyUi,
} from './scope.ts';
export { secureHeaders, type SecureHeadersOptions } from './secureHeaders.ts';
export {
  getSession,
  memorySessionHooks,
  type RapidSession,
  session,
  type SessionData,
  type SessionHooks,
  type SessionOptions,
  type SessionRecord,
} from './session.ts';
export {
  markStateKeyUser,
  MIDDLEWARE_STATE_KEY,
  middlewareUsesStateKey,
} from './stateKeyGuard.ts';
export { timeout } from './timeout.ts';
