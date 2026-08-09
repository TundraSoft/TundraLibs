/**
 * @fileoverview `@tundralibs/restler` — cross-runtime REST API client.
 *
 * Exports the abstract {@link RESTler} base class (extend it once per API
 * vendor), plus the public type (`./types`) and error (`./errors`)
 * surfaces. Requests run over compat's runtime-aware `fetch`, so the same
 * client works on Deno, Bun, and Node.
 *
 * @module
 */

export { RESTler } from './RESTler.ts';
export type {
  ResponseBody,
  RESTlerAuth,
  RESTlerAuthBasic,
  RESTlerAuthBearer,
  RESTlerAuthTypes,
  RESTlerContentType,
  RESTlerContentTypePayload,
  RESTlerEndpoint,
  RESTlerEvents,
  RESTlerHeaderProvider,
  RESTlerHooks,
  RESTlerMethod,
  RESTlerMethodPayload,
  RESTlerOptions,
  RESTlerRequest,
  RESTlerResponse,
  RESTlerResponseHandler,
  Witness,
  WitnessInfo,
} from './types/mod.ts';
export {
  RESTlerConfigError,
  RESTlerError,
  type RESTlerErrorMeta,
  RESTlerRequestError,
  RESTlerTimeoutError,
} from './errors/mod.ts';
// Re-exported from `@tundralibs/compat/http` (the net-free subpath, not the
// barrel) because `StatusCode` appears in the public response type.
export type { StatusCode } from '@tundralibs/compat/http';
