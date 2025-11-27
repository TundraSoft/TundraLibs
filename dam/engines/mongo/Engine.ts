/**
 * @fileoverview MongoDB Engine Implementation for DAM (Database Access Manager)
 *
 * Provides MongoDB database operations through the DAM framework using the official
 * MongoDB Node.js driver. Supports document-oriented operations, connection pooling,
 * and comprehensive error handling.
 *
 * @example Basic Usage
 * ```typescript
 * import { MongoDBEngine } from './Engine.ts';
 *
 * const engine = new MongoDBEngine('mongo-main', {
 *   host: 'localhost',
 *   port: 27017,
 *   database: 'myapp',
 *   username: 'user', // Optional
 *   password: 'pass'  // Optional
 * });
 *
 * await engine.connect();
 *
 * const result = await engine.execute({
 *   sql: 'find',
 *   collection: 'users',
 *   data: { active: true }
 * });
 * ```
 *
 * @module DAM/Engines/MongoDB
 * @version 1.0.0
 */

import { type Db, MongoClient, type MongoClientOptions } from '$mongo';
import { AbstractEngine } from '../../engine/AbstractEngine.ts';
import { DAMEngineError } from '../../engine/errors/mod.ts';
import type {
  EngineQuery,
  EngineTransactionOptions,
} from '../../engine/types/mod.ts';
import type { MongoDBEngineOptions } from './types/Options.ts';

/**
 * MongoDB database engine implementation
 *
 * Provides comprehensive MongoDB operations through the DAM framework including
 * document CRUD operations, aggregation, and connection management. Uses the
 * official MongoDB Node.js driver for reliable database communication.
 *
 * Note: MongoDB transactions require replica sets or sharded clusters and are
 * not supported in standalone installations. Transaction methods will throw
 * OPERATION_NOT_SUPPORTED errors.
 *
 * @example
 * ```typescript
 * const engine = new MongoDBEngine('users-db', {
 *   host: 'localhost',
 *   port: 27017,
 *   database: 'myapp',
 *   username: 'dbuser',  // Optional
 *   password: 'dbpass',  // Optional
 *   authSource: 'admin', // Optional, defaults to database
 *   pool: { max: 20, min: 2 }
 * });
 *
 * await engine.connect();
 *
 * // Insert document
 * await engine.execute({
 *   sql: 'insertOne',
 *   collection: 'users',
 *   data: { name: 'John', email: 'john@example.com' }
 * });
 *
 * // Query documents
 * const users = await engine.execute({
 *   sql: 'find',
 *   collection: 'users',
 *   data: { active: true },
 *   options: { limit: 10, sort: { name: 1 } }
 * });
 * ```
 */
export class MongoDBEngine extends AbstractEngine<MongoDBEngineOptions> {
  public readonly Engine = 'MongoDB';

  private _client?: MongoClient;
  private _db?: Db;

  /**
   * Creates a new MongoDB engine instance
   *
   * @param id - Engine identifier in format 'name::instanceId' or just 'name'
   * @param options - MongoDB connection and configuration options
   *
   * @throws {Error} When required connection parameters are missing
   */
  constructor(id: string, options: MongoDBEngineOptions) {
    // Validate required options - only host and database are required
    if (!options.host || !options.database) {
      throw new Error('MongoDB host and database are required');
    }

    super(id, options, {
      connectionTimeout: 10,
      queryTimeout: 30,
      port: 27017,
    });
  }

  /**
   * Establishes connection to MongoDB server
   * Builds connection URI from individual parameters and connects with pooling
   */
  protected async _connect(): Promise<void> {
    try {
      // Build MongoDB URI from connection parameters
      const host = this.getOption('host')!;
      const port = this.getOption('port') || 27017;
      const username = this.getOption('username');
      const password = this.getOption('password');
      const database = this.getOption('database')!;
      const authSource = this.getOption('authSource') || database;

      let uri: string;

      // Build URI with or without authentication
      if (username && password) {
        uri = `mongodb://${encodeURIComponent(username)}:${
          encodeURIComponent(password)
        }@${host}:${port}`;
      } else if (username) {
        // Username without password (some auth mechanisms)
        uri = `mongodb://${encodeURIComponent(username)}@${host}:${port}`;
      } else {
        // No authentication
        uri = `mongodb://${host}:${port}`;
      }

      // Add auth source and other query parameters
      const params = new URLSearchParams();

      // Only add authSource if we have authentication credentials
      if ((username || password) && authSource) {
        params.append('authSource', authSource);
      }

      const replicaSet = this.getOption('replicaSet');
      if (replicaSet) {
        params.append('replicaSet', replicaSet);
      }

      const readPreference = this.getOption('readPreference');
      if (readPreference) {
        params.append('readPreference', readPreference);
      }

      if (params.toString()) {
        uri += `/?${params.toString()}`;
      }

      const connectionOptions: Partial<MongoClientOptions> = {
        connectTimeoutMS: (this.getOption('connectionTimeout') || 10) * 1000,
        socketTimeoutMS: (this.getOption('queryTimeout') || 30) * 1000,
        maxPoolSize: this.getOption('pool')?.max ||
          this.getOption('maxConnections') || 10,
        minPoolSize: this.getOption('pool')?.min ||
          this.getOption('minConnections') || 1,
        maxIdleTimeMS: (this.getOption('pool')?.idleTimeoutSeconds ||
          this.getOption('idleTimeout') || 300) * 1000,
      };

      // Add SSL configuration if provided
      const ssl = this.getOption('ssl');
      if (ssl === true) {
        connectionOptions.tls = true;
      } else if (typeof ssl === 'object') {
        connectionOptions.tls = true;
        if (ssl.rejectUnauthorized === false) {
          connectionOptions.tlsAllowInvalidCertificates = true;
        }
        if (ssl.ca) {
          connectionOptions.tlsCAFile = ssl.ca;
        }
        if (ssl.cert) {
          connectionOptions.tlsCertificateKeyFile = ssl.cert;
        }
      }

      this._client = new MongoClient(
        uri,
        connectionOptions as MongoClientOptions,
      );
      await this._client.connect();
      this._db = this._client.db(database);
    } catch (error) {
      throw new DAMEngineError(
        'CONNECTION_FAILED',
        {
          engine: this.Engine,
          name: this.name,
          instanceId: this.instanceId,
          host: this.getOption('host'),
          port: this.getOption('port'),
          database: this.getOption('database'),
          reason: error instanceof Error ? error.message : String(error),
        },
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Closes connection to MongoDB server and cleans up resources
   */
  protected async _close(): Promise<void> {
    if (this._client) {
      try {
        // Force close the MongoDB client which should clean up all connection pools and timers
        await this._client.close(true); // Force close
      } catch {
        // Ignore errors during forced close
      }
      this._client = undefined;
      this._db = undefined;
    }
  }

  /**
   * Override the standardizeQuery method to preserve MongoDB-specific properties
   * like collection, data, and options that are stripped by the parent class
   */
  protected override _standardizeQuery(query: EngineQuery): EngineQuery {
    // Call parent method to get standardized sql, params, and transactionId
    const standardized = super._standardizeQuery(query);

    // Preserve all additional properties that MongoDB needs
    return {
      ...standardized,
      ...Object.fromEntries(
        Object.entries(query).filter(([key]) =>
          !['sql', 'params', 'transactionId'].includes(key)
        ),
      ),
    };
  }

  /**
   * Performs health check by pinging the MongoDB server
   */
  protected async _healthCheck(): Promise<void> {
    if (!this._db) {
      throw new DAMEngineError(
        'ENGINE_NOT_CONNECTED',
        {
          engine: this.Engine,
          name: this.name,
          instanceId: this.instanceId,
        },
      );
    }

    try {
      await this._db.admin().ping();
    } catch (error) {
      throw new DAMEngineError(
        'HEALTH_CHECK_FAILED',
        {
          engine: this.Engine,
          name: this.name,
          instanceId: this.instanceId,
          reason: error instanceof Error ? error.message : String(error),
        },
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Executes MongoDB operations (find, insert, update, delete, etc.)
   */
  protected async _executeQuery<R extends Record<string, unknown>>(
    query: EngineQuery,
  ): Promise<{ data: R[]; count: number }> {
    if (!this._db) {
      throw new DAMEngineError(
        'ENGINE_NOT_CONNECTED',
        {
          engine: this.Engine,
          name: this.name,
          instanceId: this.instanceId,
        },
      );
    }

    // MongoDB-specific query structure
    const mongoQuery = query as EngineQuery & {
      collection: string;
      options?: Record<string, unknown>;
    };
    // Clean operation name by removing semicolon if present
    const cleanOperation = mongoQuery.sql.replace(/;$/, '');
    const collection = this._db.collection(mongoQuery.collection);

    try {
      switch (cleanOperation) {
        case 'find': {
          const options = mongoQuery.options || {};
          const cursor = collection.find(mongoQuery.data || {}, options);
          const data = await cursor.toArray() as unknown as R[];
          return { data, count: data.length };
        }

        case 'findOne': {
          const options = mongoQuery.options || {};
          const result = await collection.findOne(
            mongoQuery.data || {},
            options,
          );
          return {
            data: result ? [result as unknown as R] : [],
            count: result ? 1 : 0,
          };
        }

        case 'insertOne': {
          if (!mongoQuery.data) {
            throw new DAMEngineError(
              'QUERY_MISSING_PARAMETERS',
              {
                engine: this.Engine,
                name: this.name,
                instanceId: this.instanceId,
                missing: 'Insert operation requires data',
              },
            );
          }
          const result = await collection.insertOne(mongoQuery.data);
          return {
            data: [{ insertedId: result.insertedId } as unknown as R],
            count: 1,
          };
        }

        case 'insertMany': {
          if (!Array.isArray(mongoQuery.data) || mongoQuery.data.length === 0) {
            throw new DAMEngineError(
              'QUERY_MISSING_PARAMETERS',
              {
                engine: this.Engine,
                name: this.name,
                instanceId: this.instanceId,
                missing: 'Insert operation requires data',
              },
            );
          }
          const result = await collection.insertMany(mongoQuery.data);
          return {
            data: [{ insertedIds: result.insertedIds } as unknown as R],
            count: Object.keys(result.insertedIds).length,
          };
        }

        case 'updateOne': {
          if (!mongoQuery.data) {
            throw new DAMEngineError(
              'QUERY_MISSING_PARAMETERS',
              {
                engine: this.Engine,
                name: this.name,
                instanceId: this.instanceId,
                missing: 'Update operation requires data',
              },
            );
          }
          const filter = mongoQuery.options?.filter || {};
          const result = await collection.updateOne(filter, mongoQuery.data);
          return {
            data: [{
              matchedCount: result.matchedCount,
              modifiedCount: result.modifiedCount,
            } as unknown as R],
            count: result.modifiedCount,
          };
        }

        case 'updateMany': {
          if (!mongoQuery.data) {
            throw new DAMEngineError(
              'QUERY_MISSING_PARAMETERS',
              {
                engine: this.Engine,
                name: this.name,
                instanceId: this.instanceId,
                missing: 'Update operation requires data',
              },
            );
          }
          const filter = mongoQuery.options?.filter || {};
          const result = await collection.updateMany(filter, mongoQuery.data);
          return {
            data: [{
              matchedCount: result.matchedCount,
              modifiedCount: result.modifiedCount,
            } as unknown as R],
            count: result.modifiedCount,
          };
        }

        case 'deleteOne': {
          const result = await collection.deleteOne(mongoQuery.data || {});
          return {
            data: [{ deletedCount: result.deletedCount } as unknown as R],
            count: result.deletedCount,
          };
        }

        case 'deleteMany': {
          const result = await collection.deleteMany(mongoQuery.data || {});
          return {
            data: [{ deletedCount: result.deletedCount } as unknown as R],
            count: result.deletedCount,
          };
        }

        case 'countDocuments': {
          const count = await collection.countDocuments(mongoQuery.data || {});
          return { data: [{ count } as unknown as R], count: 1 };
        }

        case 'aggregate': {
          if (!Array.isArray(mongoQuery.data)) {
            throw new DAMEngineError(
              'QUERY_MISSING_PARAMETERS',
              {
                engine: this.Engine,
                name: this.name,
                instanceId: this.instanceId,
                missing: 'pipeline array for aggregate operation',
              },
            );
          }
          const cursor = collection.aggregate(mongoQuery.data);
          const data = await cursor.toArray() as R[];
          return { data, count: data.length };
        }

        default:
          throw new DAMEngineError(
            'MONGODB_OPERATION_FAILED',
            {
              engine: this.Engine,
              name: this.name,
              instanceId: this.instanceId,
              operation: String(cleanOperation),
              reason: `Unsupported MongoDB operation: ${cleanOperation}`,
            },
          );
      }
    } catch (error) {
      if (error instanceof DAMEngineError) {
        throw error;
      }

      throw new DAMEngineError(
        'MONGODB_OPERATION_FAILED',
        {
          engine: this.Engine,
          name: this.name,
          instanceId: this.instanceId,
          operation: cleanOperation,
          reason: error instanceof Error ? error.message : String(error),
        },
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Checks if there are any active transactions
   * Always returns false for MongoDB since transactions are not supported
   */
  protected _hasActiveTransactions(): boolean {
    return false;
  }

  // Transaction methods - MongoDB requires replica sets
  protected _beginTransaction(
    _options?: EngineTransactionOptions,
  ): Promise<void> {
    return Promise.reject(
      new DAMEngineError(
        'OPERATION_NOT_SUPPORTED',
        {
          engine: this.Engine,
          name: this.name,
          instanceId: this.instanceId,
          operation: 'transactions',
          reason:
            'MongoDB transactions require a replica set or sharded cluster configuration',
        },
      ),
    );
  }

  protected _commitTransaction(_transactionId: string): Promise<void> {
    return Promise.reject(
      new DAMEngineError(
        'OPERATION_NOT_SUPPORTED',
        {
          engine: this.Engine,
          name: this.name,
          instanceId: this.instanceId,
          operation: 'transactions',
          reason:
            'MongoDB transactions require a replica set or sharded cluster configuration',
        },
      ),
    );
  }

  protected _rollbackTransaction(_transactionId: string): Promise<void> {
    return Promise.reject(
      new DAMEngineError(
        'OPERATION_NOT_SUPPORTED',
        {
          engine: this.Engine,
          name: this.name,
          instanceId: this.instanceId,
          operation: 'transactions',
          reason:
            'MongoDB transactions require a replica set or sharded cluster configuration',
        },
      ),
    );
  }

  protected _rollbackAllTransactions(): Promise<void> {
    return Promise.reject(
      new DAMEngineError(
        'OPERATION_NOT_SUPPORTED',
        {
          engine: this.Engine,
          name: this.name,
          instanceId: this.instanceId,
          operation: 'transactions',
          reason:
            'MongoDB transactions require a replica set or sharded cluster configuration',
        },
      ),
    );
  }
}
