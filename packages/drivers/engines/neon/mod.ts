/**
 * @fileoverview Public surface of the Neon SQL-over-HTTP driver.
 *
 * `NeonHttpEngine` is Postgres over Neon's HTTP query API — an edge/serverless
 * driver that reuses the Postgres OQL translator, value decoding, and SQLSTATE
 * mapping without importing the TCP wire stack. The {@link NeonHttpClient}
 * transport and {@link NeonHttpError} are re-exported for advanced users who
 * want to drive the HTTP endpoint directly.
 *
 * @module
 */

export { NeonHttpEngine } from './Engine.ts';
export { NeonHttpClient } from './NeonHttpClient.ts';
export { NeonHttpError } from './NeonHttpError.ts';
export type { NeonHttpErrorMeta } from './NeonHttpError.ts';
export type {
  NeonField,
  NeonHttpClientOptions,
  NeonHttpEngineOptions,
  NeonPostgresError,
  NeonQueryResult,
} from './types/mod.ts';
