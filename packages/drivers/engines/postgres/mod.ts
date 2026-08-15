/**
 * PostgreSQL engine for `@tundralibs/drivers` — {@link PostgresEngine},
 * the Postgres-wire-compatible aliases (CockroachDB, YugabyteDB, and
 * more), the {@link PgConnection} wrapper, and {@link PgServerError}.
 *
 * @module
 */
export { PostgresEngine } from './Engine.ts';
// Alias engines for Postgres-wire-compatible distributed SQL (CockroachDB,
// YugabyteDB — advisory locks off); Aurora/AlloyDB/Supabase/Timescale use
// PostgresEngine as-is.
export {
  AlloyDBEngine,
  CitusEngine,
  CockroachEngine,
  YugabyteEngine,
} from './aliases.ts';
export type { PostgresEngineOptions } from './types/mod.ts';
// Connection wrapper + server-error class are exposed for advanced
// users who want to manage a PG connection outside the engine pool.
export { PgConnection } from './PgConnection.ts';
export { PgServerError } from './PgServerError.ts';
// Binary parameter encoder is exposed for users who want to bind
// pre-encoded values (e.g. when integrating with a query builder).
export { type EncodedParam, encodeParam, OID } from './binary.ts';
