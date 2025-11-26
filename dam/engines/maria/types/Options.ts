import type {
  EngineAdvancedOptions,
  EngineDatabaseOptions,
  EngineOptions,
  EnginePoolOptions,
  EngineSecurityOptions,
} from '../../../engine/types/mod.ts';

/**
 * MariaDB engine configuration options
 * Combines base engine options with database connection, security, and pool options
 */
export type MariaDBEngineOptions =
  & EngineOptions
  & EngineDatabaseOptions
  & EngineSecurityOptions
  & EngineAdvancedOptions
  & {
    /** Connection pool options */
    pool?: EnginePoolOptions;
  };
