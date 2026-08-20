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
export { extractPathname } from './extractPathname.ts';
export { type ModuleMountTarget, mountModule } from './mountModule.ts';
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
export { type SocketErrorEnvelope, socketOutcome } from './socketOutcome.ts';
