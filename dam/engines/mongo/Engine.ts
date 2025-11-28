/// <reference types="npm:@types/node" />
import {
  type Db,
  type Document,
  MongoClient,
  type MongoClientOptions,
} from '$mongo';
import type { EventOptionKeys } from '@tundralibs/utils';
import {
  AbstractEngine,
  DAMEngineError,
  EngineCapabilities,
  EngineEvents,
  EngineQuery,
} from '../../engine/mod.ts';
import type { MongoEngineOptions } from './types/mod.ts';

/**
 * Default configuration values for MongoDB connections.
 */
const MONGO_DEFAULTS: Partial<MongoEngineOptions> = {
  port: 27017,
  authSource: 'admin',
};

/**
 * MongoDB database engine implementation using npm's mongodb driver.
 *
 * Features:
 * - Connection pooling with configurable pool size
 * - Flexible query structure using action-based operations
 * - Native MongoDB query operators and aggregation pipeline
 * - Real-time connection status tracking
 * - Automatic connection validation
 * - SSL/TLS support
 *
 * Note: Transaction support is disabled. MongoDB transactions require replica set
 * or sharded cluster configuration, which may not be available in all deployments.
 *
 * Driver: npm:mongodb (official MongoDB Node.js driver)
 *
 * Query Structure:
 * - sql: Action to perform (insert, find, update, delete, aggregate, etc.)
 * - collection: Target collection name
 * - filter/query: Query filter (for find, update, delete)
 * - data: Document(s) to insert or update operations
 * - options: MongoDB operation options
 *
 * @example
 * ```typescript
 * const engine = new MongoEngine('mydb', {
 *   host: 'localhost',
 *   port: 27017,
 *   database: 'myapp',
 *   username: 'user',
 *   password: 'pass'
 * });
 * await engine.connect();
 *
 * // Insert
 * await engine.execute({
 *   sql: 'insert',
 *   collection: 'users',
 *   data: { name: 'John', age: 30 }
 * });
 *
 * // Find
 * await engine.execute({
 *   sql: 'find',
 *   collection: 'users',
 *   filter: { age: { $gte: 18 } }
 * });
 *
 * // Update
 * await engine.execute({
 *   sql: 'update',
 *   collection: 'users',
 *   filter: { name: 'John' },
 *   data: { $set: { age: 31 } }
 * });
 * ```
 */
export class MongoEngine extends AbstractEngine<MongoEngineOptions> {
  /** Engine type identifier */
  public readonly Engine = 'MONGO';

  /** Supported capabilities of this engine */
  public readonly Capabilities: EngineCapabilities = {
    transactions: false, // Transaction support disabled - requires replica set
    pooledConnections: true,
    preparedStatements: false, // MongoDB doesn't use prepared statements
    parameterReplacement: undefined, // No parameter replacement needed
  };

  /**
   * Map of transaction IDs to their MongoDB session objects.
   * Each transaction gets an isolated session that persists until commit/rollback.
   */
  protected _clientMap: Map<string, unknown> = new Map();

  /**
   * MongoDB client instance from npm mongodb driver.
   */
  private _client: MongoClient | null = null;

  /**
   * MongoDB database instance for operations.
   */
  private _db: Db | null = null;

  /**
   * Create a new MongoDB engine instance.
   *
   * @param name - Unique name for this engine instance
   * @param options - Connection and configuration options
   * @throws {DAMEngineError} MISSING_CONFIG_VALUE if required options are missing
   */
  constructor(
    name: string,
    options: EventOptionKeys<MongoEngineOptions, EngineEvents>,
  ) {
    super(name, options, MONGO_DEFAULTS);
    // Validate required configuration
    if (this.hasOption('database') === false) {
      throw new DAMEngineError('MISSING_CONFIG_VALUE', {
        instanceId: this.instanceId,
        key: 'database',
      });
    }
  }

  /**
   * Establish connection to MongoDB database.
   *
   * Creates a MongoClient with the configured options and validates
   * connectivity by pinging the database.
   *
   * Connection Configuration:
   * - maxPoolSize: Maximum pool size (default: 10)
   * - minPoolSize: Minimum pool size (default: 2)
   * - serverSelectionTimeoutMS: Server selection timeout (default: 10 seconds)
   * - socketTimeoutMS: Socket timeout based on idleTimeoutSeconds option
   *
   * SSL/TLS Support (npm mongodb):
   * - tls: boolean true enables TLS with default verification
   * - tlsCAFile, tlsCertificateKeyFile: Certificate file paths
   * - tlsAllowInvalidCertificates: Disable certificate validation (not recommended)
   *
   * Authentication:
   * - Supports username/password authentication
   * - Connection string format: mongodb://username:password@host:port/database
   *
   * @throws {DAMEngineError} CONNECTION_FAILED if unable to connect
   * @protected
   */
  protected async _connect(): Promise<void> {
    try {
      const uri = new URL('mongodb://localhost');
      uri.host = this.getOption('host') || 'localhost';
      uri.port = (
        this.getOption('port') || 27017
      ).toString();
      uri.pathname = `/${this.getOption('database')}`;
      uri.username = this.getOption('username') || '';
      uri.password = this.getOption('password') || '';
      uri.pathname = `/${this.getOption('database')}`;
      const sp = new URLSearchParams();
      sp.append(
        'authSource',
        this.getOption('authSource') || this.getOption('database')!,
      );
      uri.search = sp.toString();

      // Build client options
      const clientOptions: MongoClientOptions = {
        maxPoolSize: this.getOption('pool')?.max || 10,
        minPoolSize: this.getOption('pool')?.min || 2,
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: ((this.getOption('idleTimeoutSeconds') as number) ||
          30) * 1000,
      };

      // Configure SSL/TLS if enabled
      const ssl = this.getOption('ssl');
      if (ssl) {
        if (typeof ssl === 'boolean' && ssl === true) {
          // Simple TLS mode - enable with default verification
          clientOptions.tls = true;
        } else if (typeof ssl === 'object') {
          // Advanced TLS configuration with loaded certificates
          clientOptions.tls = true;
          clientOptions.tlsAllowInvalidCertificates = ssl.rejectUnauthorized ===
            false;
          // Note: MongoDB driver expects file paths for certificates, not content
          // We'll use the loaded certificate content if available
          if (this._sslCaCertificate) {
            // MongoDB driver doesn't directly accept certificate content
            // This would need to be written to temp files in production
            // For now, document this limitation
            this.emit(
              'warn',
              this.instanceId,
              'MongoDB driver requires certificate file paths, not content. Consider using tlsCAFile option directly.',
            );
          }
        }
      }

      // Create MongoDB client
      this._client = new MongoClient(uri.toString(), clientOptions);

      // Connect to database
      await this._client.connect();

      // Get database instance
      this._db = this._client.db(this.getOption('database') as string);

      // Validate connection by pinging
      await this._db.admin().ping();
    } catch (error) {
      this._client = null;
      this._db = null;
      throw new DAMEngineError('CONNECTION_FAILED', {
        instanceId: this.instanceId,
        reason: error instanceof Error ? error.message : String(error),
      }, error as Error);
    }
  }

  /**
   * Close MongoDB client connection and cleanup resources.
   *
   * Terminates all active connections in the pool.
   * Safe to call multiple times (idempotent).
   *
   * @protected
   */
  protected async _disconnect(): Promise<void> {
    if (this._client) {
      await this._client.close();
      this._client = null;
      this._db = null;
    }
  }

  /**
   * Override standardizeQuery to skip SQL validation for MongoDB.
   *
   * MongoDB uses action-based queries with flexible structure,
   * so we don't need parameter validation or SQL transformation.
   *
   * @param query - The query to standardize (passed through unchanged)
   * @returns The original query without modification
   * @protected
   */
  protected override _standardizeQuery(query: EngineQuery): EngineQuery {
    return query;
  }

  /**
   * Execute a MongoDB operation.
   *
   * Supports various MongoDB operations through action-based routing:
   * - insert: Insert document(s) into collection
   * - find: Query documents from collection
   * - update: Update document(s) in collection
   * - delete: Delete document(s) from collection
   * - aggregate: Run aggregation pipeline
   * - count: Count documents matching filter
   *
   * Query Structure:
   * - sql: Action name (insert, find, update, delete, etc.)
   * - collection: Target collection name
   * - filter/query: Query filter for find/update/delete operations
   * - data: Document(s) for insert or update operations ($set, $inc, etc.)
   * - options: MongoDB operation options (limit, sort, projection, etc.)
   * - pipeline: Aggregation pipeline stages (for aggregate action)
   *
   * Smart Array Detection:
   * - insert: Automatically uses insertMany if data is an array
   * - update: Uses updateMany if multiple: true in options
   * - delete: Uses deleteMany if multiple: true in options
   *
   * @template R - The expected document structure
   * @param query - The query to execute with action and parameters
   * @returns Object containing result documents and count
   * @throws {DAMEngineError} QUERY_EXECUTION_FAILED on execution error
   * @protected
   */
  protected async _execute<
    R extends Record<string, unknown> = Record<string, unknown>,
  >(
    query: EngineQuery,
  ): Promise<{ data: R[]; count: number }> {
    try {
      const action = query.sql.toLowerCase();
      const collectionName = query.collection as string | undefined;

      if (!collectionName) {
        throw new Error(
          'Collection name is required. Specify "collection" field in query.',
        );
      }

      const collection = this._db!.collection<R>(collectionName);
      const filter = (query.filter || query.query || {}) as Document;
      const data = query.data as Document | Document[] | undefined;
      const options = (query.options || {}) as Document;
      const session = query.transactionId
        ? this._clientMap.get(query.transactionId)
        : undefined;

      // Route to appropriate MongoDB operation
      switch (action) {
        case 'insert': {
          // Smart detection: insertMany if data is array, insertOne otherwise
          if (Array.isArray(data)) {
            const result = await collection.insertMany(
              // deno-lint-ignore no-explicit-any
              data as any,
              { ...options, session } as Document,
            );
            return {
              data: Object.values(result.insertedIds).map((id) => ({
                _id: id,
              })) as unknown as R[],
              count: result.insertedCount,
            };
          } else {
            const result = await collection.insertOne(
              // deno-lint-ignore no-explicit-any
              data as any,
              { ...options, session } as Document,
            );
            return {
              data: [{ _id: result.insertedId }] as unknown as R[],
              count: result.acknowledged ? 1 : 0,
            };
          }
        }

        case 'find': {
          // Check if findOne or find().toArray()
          if (options.findOne === true) {
            // deno-lint-ignore no-explicit-any
            const doc = await collection.findOne(filter as any, {
              ...options,
              session,
            } as Document);
            return {
              data: doc ? [doc as R] : [],
              count: doc ? 1 : 0,
            };
          } else {
            // deno-lint-ignore no-explicit-any
            const cursor = collection.find(filter as any, {
              ...options,
              session,
            } as Document);
            const docs = await cursor.toArray();
            return {
              data: docs as R[],
              count: docs.length,
            };
          }
        }

        case 'update': {
          // Smart detection: updateMany if multiple: true, updateOne otherwise
          if (options.multiple === true || options.multi === true) {
            const result = await collection.updateMany(
              // deno-lint-ignore no-explicit-any
              filter as any,
              // deno-lint-ignore no-explicit-any
              data as any,
              { ...options, session } as Document,
            );
            return {
              data: [],
              count: result.modifiedCount,
            };
          } else {
            const result = await collection.updateOne(
              // deno-lint-ignore no-explicit-any
              filter as any,
              // deno-lint-ignore no-explicit-any
              data as any,
              { ...options, session } as Document,
            );
            return {
              data: [],
              count: result.modifiedCount,
            };
          }
        }

        case 'delete':
        case 'remove': {
          // Smart detection: deleteMany if multiple: true, deleteOne otherwise
          if (options.multiple === true || options.multi === true) {
            // deno-lint-ignore no-explicit-any
            const result = await collection.deleteMany(filter as any, {
              ...options,
              session,
            } as Document);
            return {
              data: [],
              count: result.deletedCount,
            };
          } else {
            // deno-lint-ignore no-explicit-any
            const result = await collection.deleteOne(filter as any, {
              ...options,
              session,
            } as Document);
            return {
              data: [],
              count: result.deletedCount,
            };
          }
        }

        case 'aggregate': {
          const pipeline = query.pipeline as Document[] | undefined;
          if (!pipeline) {
            throw new Error(
              'Pipeline is required for aggregate operation. Specify "pipeline" field in query.',
            );
          }
          const cursor = collection.aggregate(pipeline, {
            ...options,
            session,
          } as Document);
          const docs = await cursor.toArray();
          return {
            data: docs as R[],
            count: docs.length,
          };
        }

        case 'count': {
          // deno-lint-ignore no-explicit-any
          const count = await collection.countDocuments(filter as any, {
            ...options,
            session,
          } as Document);
          return {
            data: [],
            count,
          };
        }

        case 'distinct': {
          const field = query.field as string | undefined;
          if (!field) {
            throw new Error(
              'Field is required for distinct operation. Specify "field" field in query.',
            );
          }
          // deno-lint-ignore no-explicit-any
          const values = await collection.distinct(field, filter as any, {
            ...options,
            session,
          } as Document);
          return {
            data: values.map((v) => ({ value: v })) as unknown as R[],
            count: values.length,
          };
        }

        default:
          throw new Error(
            `Unsupported MongoDB action: ${action}. Supported actions: insert, find, update, delete, aggregate, count, distinct`,
          );
      }
    } catch (e) {
      throw new DAMEngineError('QUERY_EXECUTION_FAILED', {
        engine: this.Engine,
        instanceId: this.instanceId,
        query: query,
      }, e as Error);
    }
  }

  /**
   * Begin transaction - NOT SUPPORTED.
   *
   * MongoDB transactions require replica set or sharded cluster configuration.
   * This implementation is disabled to avoid runtime errors on standalone instances.
   *
   * @param transactionId - Unused
   * @throws Error Always throws - transactions not supported
   * @protected
   */
  protected _beginTransaction(_transactionId: string): void {
    throw new DAMEngineError('UNSUPPORTED_OPERATION', {
      instanceId: this.instanceId,
      operation: 'transaction',
    });
  }

  /**
   * Commit transaction - NOT SUPPORTED.
   *
   * @param _transactionId - Unused
   * @throws Error Always throws - transactions not supported
   * @protected
   */
  protected _commitTransaction(_transactionId: string): void {
    throw new DAMEngineError('UNSUPPORTED_OPERATION', {
      instanceId: this.instanceId,
      operation: 'transaction',
    });
  }

  /**
   * Rollback transaction - NOT SUPPORTED.
   *
   * @param _transactionId - Unused
   * @throws Error Always throws - transactions not supported
   * @protected
   */
  protected _rollbackTransaction(_transactionId: string): void {
    throw new DAMEngineError('UNSUPPORTED_OPERATION', {
      instanceId: this.instanceId,
      operation: 'transaction',
    });
  }

  /**
   * Check if the MongoDB connection is alive.
   *
   * Executes a ping command to verify connectivity.
   * Used by AbstractEngine for health checks and reconnection logic.
   *
   * @returns true if connection is alive, false otherwise
   * @protected
   */
  protected async _ping(): Promise<boolean> {
    try {
      if (!this._db) return false;
      await this._db.admin().ping();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Update engine status based on connection state.
   *
   * MongoDB Connection States:
   * - connected: Client is connected and ready
   * - disconnected: Client is disconnected
   * - connecting: Client is in the process of connecting
   *
   * For MongoDB, we don't have direct access to pool statistics like SQL databases.
   * Status is determined by client topology state.
   *
   * Status Transitions:
   * - READY: When client is connected
   * - CLOSED: When client is disconnected
   *
   * Note: MongoDB handles connection pooling internally, so we can't track
   * individual connection states. All connections are managed by the driver.
   *
   * Called automatically by AbstractEngine after each operation.
   *
   * @protected
   */
  protected override _updatePoolStatus(): void {
    // Skip if client not initialized or in transitional state
    if (
      !this._client || this._status === 'CLOSED' ||
      this._status === 'CONNECTING'
    ) {
      return;
    }

    // MongoDB driver doesn't expose pool statistics directly
    // We can only determine if we're connected or not
    // Set status to READY if client exists and is connected
    if (this._client) {
      this._status = 'READY';
    }
  }
}
