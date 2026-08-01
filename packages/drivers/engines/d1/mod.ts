/**
 * @fileoverview Public surface of the Cloudflare D1 SQLite-over-HTTP (REST)
 * driver.
 *
 * `D1Engine` is SQLite over Cloudflare D1's REST query API — an edge/serverless
 * driver that reuses the SQLite OQL translator and the SQLite error helpers
 * without importing any native SQLite binding. The {@link D1HttpClient}
 * transport and {@link D1HttpError} are re-exported for advanced users who want
 * to drive the HTTP endpoint directly.
 *
 * @module
 */

export { D1Engine } from './Engine.ts';
export { D1HttpClient } from './D1HttpClient.ts';
export { D1HttpError } from './D1HttpError.ts';
export type { D1HttpErrorMeta } from './D1HttpError.ts';
export type {
  D1EngineOptions,
  D1HttpClientOptions,
  D1QueryResult,
  D1ResultMeta,
} from './types/mod.ts';
