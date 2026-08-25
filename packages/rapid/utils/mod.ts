/**
 * @fileoverview Barrel for the internal utils — the pure, individually
 * tested functions the framework composes. Package-internal: this
 * folder is NOT a package export; consumers reach behaviour through
 * the Application/context surface.
 *
 * @module
 */

export { buildExporter } from './buildExporter.ts';
export { buildState, type StateMode } from './buildState.ts';
export { compose } from './compose.ts';
export {
  type CookieOptions,
  parseCookies,
  serializeCookie,
  signValue,
  verifySignedValue,
} from './cookies.ts';
export { negotiate } from './negotiate.ts';
export { attachContainer, currentContainer } from './requestContainer.ts';
export { validated } from './validated.ts';
export {
  hasDecorations,
  type ModuleMountTarget,
  mountModule,
} from './mountModule.ts';
export {
  parseBody,
  type ParseBodyOptions,
  type ParseBodyResult,
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
export { resolveVersion, type VersioningConfig } from './resolveVersion.ts';
export { Meter, type MeterSample } from './Meter.ts';
export {
  buildOpenApi,
  type OpenApiInfo,
  type OpenApiSecuritySchemes,
  type OpenApiServer,
} from './buildOpenApi.ts';
