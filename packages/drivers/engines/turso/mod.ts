/**
 * @fileoverview Public surface of the Turso / libSQL SQLite-over-HTTP driver.
 *
 * `TursoEngine` is SQLite over Turso / libSQL's Hrana-v3 HTTP query API — an
 * edge/serverless driver that reuses the SQLite OQL translator and the SQLite
 * error-code map without importing any native SQLite binding. The
 * {@link TursoHttpClient} transport and {@link TursoHttpError} are re-exported
 * for advanced users who want to drive the HTTP endpoint directly.
 *
 * @module
 */

export { TursoEngine } from './Engine.ts';
export { TursoHttpClient } from './TursoHttpClient.ts';
export { TursoHttpError } from './TursoHttpError.ts';
export type { TursoHttpErrorMeta } from './TursoHttpError.ts';
export type {
  HranaCol,
  HranaExecuteResult,
  HranaNamedArg,
  HranaValue,
  TursoEngineOptions,
  TursoHttpClientOptions,
} from './types/mod.ts';
