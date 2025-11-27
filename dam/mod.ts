// Export main DAM manager
export { DAM } from './DAM.ts';

// Export all engines
export {
  MariaDBEngine,
  MongoDBEngine,
  PostgreSQLEngine,
  SQLiteEngine,
} from './engines/mod.ts';

// Export engine types
export type {
  MariaDBEngineOptions,
  MongoDBEngineOptions,
  PostgreSQLEngineOptions,
  SQLiteEngineOptions,
} from './engines/mod.ts';

// Export base engine functionality
export {
  AbstractEngine,
  DAMEngineError,
  DAMEngineErrorCodes,
} from './engine/mod.ts';

// Export base engine types
export type {
  DAMEngineErrorCode,
  DAMEngineErrorMeta,
  EngineEvents,
  EngineOptions,
  EnginePoolStats,
  EngineQuery,
  EngineQueryResult,
  EngineStatus,
  EngineTransactionContext,
  EngineTransactionOptions,
} from './engine/mod.ts';

// Export DAM errors
export { DAMError } from './errors/mod.ts';
