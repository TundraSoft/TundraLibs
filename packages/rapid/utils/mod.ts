/**
 * @fileoverview Barrel for the internal utils — the pure, individually
 * tested functions the framework composes. Package-internal: this
 * folder is NOT a package export; consumers reach behaviour through
 * the Application/context surface.
 *
 * @module
 */

export {
  type ApiSurface,
  normalizeApiSurface,
  normalizeHostname,
  requestHostname,
  resolveSurface,
  stripApiPrefix,
} from './apiSurface.ts';
export { buildExporter } from './buildExporter.ts';
export { buildState, type StateMode } from './buildState.ts';
export { isSwap, type SwapOptions } from './isSwap.ts';
export { CSRF_TOKEN, mark, markOf, SESSION_ISSUED } from './requestMarks.ts';
export { isTemplate, normalizeRouteTemplate } from './routeTemplate.ts';
export { compose } from './compose.ts';
export {
  assertCookieConfig,
  type CookieOptions,
  isToken,
  parseCookies,
  serializeCookie,
  signValue,
  verifySignedValue,
} from './cookies.ts';
export { djb2 } from './hash.ts';
export { ifNoneMatch } from './ifNoneMatch.ts';
export { isThenable } from './isThenable.ts';
export { negotiate } from './negotiate.ts';
export { attachContainer, currentContainer } from './requestContainer.ts';
export {
  normalizeStaticConfig,
  serveStaticFile,
  type StaticMount,
} from './staticFiles.ts';
export { validated } from './validated.ts';
export {
  hasDecorations,
  type ModuleMountTarget,
  mountModule,
} from './mountModule.ts';
export {
  bodyCapFor,
  parseBody,
  type ParseBodyOptions,
  type ParseBodyResult,
  readCapped,
} from './parseBody.ts';
export {
  type PagingCandidates,
  pagingFromHeaders,
  pagingFromQuery,
  pagingFromRecord,
  parsePaging,
  type ParsePagingOptions,
} from './parsePaging.ts';
export {
  parseQueryFilters,
  type ParseQueryOptions,
} from './parseQueryFilters.ts';
export {
  resolveClientAddress,
  type ResolvedClientAddress,
} from './resolveClientAddress.ts';
export { serializeResponse } from './serializeResponse.ts';
export {
  frameSseEvent,
  isStreamBody,
  type SseEvent,
  sseStream,
  type StreamBody,
  toReadableStream,
} from './streams.ts';
export { type SocketErrorEnvelope, socketOutcome } from './socketOutcome.ts';
export {
  escapeRegExp,
  resolveVersion,
  type VersioningConfig,
} from './resolveVersion.ts';
export { Meter, type MeterSample } from './Meter.ts';
export {
  buildOpenApi,
  type OpenApiInfo,
  type OpenApiSecuritySchemes,
  type OpenApiServer,
} from './buildOpenApi.ts';
export { pinHidden } from './hiddenSlot.ts';
export { pickEncoding } from './pickEncoding.ts';
export { assertRedirectTarget } from './redirectTarget.ts';
export { isSocketOriginAllowed } from './socketOrigin.ts';
