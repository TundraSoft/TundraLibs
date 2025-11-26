import type {
  EngineAdvancedOptions,
  EngineDatabaseOptions,
  EngineOptions,
  EnginePoolOptions,
  EngineSecurityOptions,
} from '../../../engine/types/mod.ts';

/**
 * PostgreSQL engine configuration options
 * Combines base engine options with database connection, security, and pool options
 */
export type PostgreSQLEngineOptions =
  & EngineOptions
  & EngineDatabaseOptions
  & EngineSecurityOptions
  & EngineAdvancedOptions
  & {
    /** Connection pool options */
    pool?: EnginePoolOptions;
  };
