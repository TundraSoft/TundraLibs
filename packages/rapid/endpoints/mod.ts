/**
 * @fileoverview Ready-made mountable endpoint handlers — mount where you
 * like (`app.get('/metrics', metrics())`). They read the app through the
 * context and convert per their options. `docs()` is the one that mounts
 * itself (it registers a page plus its script).
 *
 * @module
 */
export {
  docs,
  DocsAuth,
  type DocsDocument,
  DocsOperation,
  type DocsOperationObject,
  type DocsOptions,
  type DocsPageData,
  type DocsPartOptions,
  DocsReference,
  DocsSchemas,
  type DocsViewerConfig,
} from './docs.ts';
export { health, type HealthOptions } from './health.ts';
export { metrics, type MetricsOptions } from './metrics.ts';
export {
  openapi,
  type OpenApiDocumentOptions,
  type OpenApiOptions,
} from './openapi.ts';
export { ready, type ReadyOptions } from './ready.ts';
export type {
  OpenApiInfo,
  OpenApiOAuthFlow,
  OpenApiOAuthFlows,
  OpenApiSecurityScheme,
  OpenApiSecuritySchemes,
  OpenApiServer,
} from '../utils/buildOpenApi.ts';
