/**
 * MongoDB Engine Configuration Options
 *
 * Extends the base EngineOptions with MongoDB-specific connection and operational settings.
 * Supports both MongoDB Atlas cloud connections and local MongoDB instances.
 *
 * @example Basic local MongoDB configuration
 * ```typescript
 * const options: MongoDBEngineOptions = {
 *   uri: 'mongodb://localhost:27017',
 *   database: 'myapp',
 *   queryTimeout: 30
 * };
 * ```
 *
 * @example MongoDB Atlas configuration
 * ```typescript
 * const options: MongoDBEngineOptions = {
 *   uri: 'mongodb+srv://user:pass@cluster.mongodb.net',
 *   database: 'production',
 *   ssl: true,
 *   retryWrites: true,
 *   w: 'majority'
 * };
 * ```
 */

import type {
  EngineAdvancedOptions,
  EngineDatabaseOptions,
  EngineOptions,
  EnginePoolOptions,
  EngineSecurityOptions,
} from '../../../engine/types/mod.ts';

/**
 * MongoDB engine configuration options
 * Combines base engine options with database connection and security options
 */
export type MongoDBEngineOptions =
  & EngineOptions
  & Omit<EngineDatabaseOptions, 'username' | 'password'>
  & EngineSecurityOptions
  & EngineAdvancedOptions
  & {
    /** Database username (optional - for authenticated connections) */
    username?: string;
    /** Database password (optional - for authenticated connections) */
    password?: string;
    /** Connection pool options */
    pool?: EnginePoolOptions;
    /** Authentication source database (optional - defaults to target database) */
    authSource?: string;
    /** MongoDB replica set name */
    replicaSet?: string;
    /** Read preference */
    readPreference?:
      | 'primary'
      | 'primaryPreferred'
      | 'secondary'
      | 'secondaryPreferred'
      | 'nearest';
  };
