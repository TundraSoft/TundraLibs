/**
 * @fileoverview Barrel for the shipped middleware factories — each one
 * returns a universal `RapidMiddleware` (one registration, every
 * transport). Import-light by design: nothing here pulls beyond what
 * the core already uses.
 *
 * @module
 */

export {
  type AuthBag,
  authenticate,
  type AuthenticateOptions,
  authorize,
} from './auth.ts';
export { compress, type CompressOptions } from './compress.ts';
export { cors, type CorsOptions } from './cors.ts';
export { csrf, type CsrfOptions } from './csrf.ts';
export { etag } from './etag.ts';
export { healthCheck, type HealthCheckOptions } from './healthCheck.ts';
export { rateLimit, type RateLimitOptions } from './rateLimit.ts';
export { memoryStore, type Store } from './store.ts';
export { requestId, type RequestIdOptions } from './requestId.ts';
export { requestLogger, type RequestLoggerOptions } from './requestLogger.ts';
export { responseTimer, type ResponseTimerOptions } from './responseTimer.ts';
export {
  guardHTTP,
  guardJOB,
  guardSOCKET,
  MIDDLEWARE_SCOPE,
  middlewareScope,
  onlyHTTP,
  onlyJOB,
  onlySOCKET,
} from './scope.ts';
export { secureHeaders, type SecureHeadersOptions } from './secureHeaders.ts';
export { serveStatic, type ServeStaticOptions } from './serveStatic.ts';
export {
  getSession,
  type RapidSession,
  session,
  type SessionData,
  type SessionOptions,
} from './session.ts';
export {
  markStateKeyUser,
  MIDDLEWARE_STATE_KEY,
  middlewareUsesStateKey,
} from './stateKeyGuard.ts';
export { timeout } from './timeout.ts';
