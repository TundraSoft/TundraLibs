import { AbstractClient } from '../AbstractClient.ts';
import { QueryTypes } from '../types/mod.ts';
import type { PostgresConfig, QueryOption, QueryType } from '../types/mod.ts';
import { PGPool } from '../../dependencies.ts';
import type { PGClientOptions } from '../../dependencies.ts';

import { NormError, QueryError } from '../errors/mod.ts';

export class PostgresPoolClient<O extends PostgresConfig = PostgresConfig>
  extends AbstractClient<O> {
  declare protected _client: PGPool;
  private _lastActivityTime: number = 0;
  private _idleCheckInterval: number | null = null;
  private _idleTimeout: number = 60; // Default 60 seconds

  override get poolInfo(): { size: number; available: number; inUse: number } {
    return {
      size: this._client.size,
      available: this._client.available,
      inUse: this._client.size - this._client.available,
    };
  }

  constructor(name: string, options: NonNullable<O> | O) {
    const defaults: Partial<PostgresConfig> = {
      dialect: 'POSTGRES',
      port: 5432,
      poolSize: 10,
      idleTimeout: 60, // 60 seconds default
      connectionTimeout: 30,
      lazyConnect: true,
    };
    super(name, { ...defaults, ...options });

    // Set the idle timeout from options
    if (
      this._hasOption('idleTimeout') &&
      (this._getOption('idleTimeout') as number) > 0
    ) {
      this._idleTimeout = this._getOption('idleTimeout') as number;
    }
  }

  /**
   * Updates the last activity timestamp and resets the idle timer
   */
  private _updateActivity(): void {
    this._lastActivityTime = Date.now();
  }

  /**
   * Starts the idle connection monitor
   */
  private _startIdleTimer(): void {
    // Clear any existing timer
    this._stopIdleTimer();

    // Initialize last activity time
    this._updateActivity();

    // Check for idle connection every 10 seconds
    const checkInterval = Math.min(10000, this._idleTimeout * 500);
    this._idleCheckInterval = setInterval(() => {
      this._checkIdleConnection();
    }, checkInterval);
  }

  /**
   * Stops the idle connection monitor
   */
  private _stopIdleTimer(): void {
    if (this._idleCheckInterval !== null) {
      clearInterval(this._idleCheckInterval);
      this._idleCheckInterval = null;
    }
  }

  /**
   * Checks if the connection has been idle for too long and disconnects if needed
   */
  private async _checkIdleConnection(): Promise<void> {
    if (this.status !== 'CONNECTED') return;

    const idleTime = (Date.now() - this._lastActivityTime) / 1000; // in seconds

    if (idleTime >= this._idleTimeout) {
      await this.disconnect();
    }
  }

  protected async _connect(): Promise<void> {
    // Suffix the hostname
    const name = `${this._name}-${Deno.hostname()}`;
    const pgConfig: PGClientOptions = {
        applicationName: name,
        hostname: this._options.host,
        port: this._options.port,
        user: this._options.userName,
        password: this._options.password,
        database: this._options.database,
        connection: {
          attempts: 1,
        },
      },
      poolSize = this._getOption('poolSize') as number || 10;
    this._client = await new PGPool(
      pgConfig,
      poolSize,
      this._options.lazyConnect,
    );
    // Hack to test the connection, if there is something wrong it will throw immediately
    await (await this._client.connect()).release();

    // Start idle monitoring
    this._startIdleTimer();
    this._updateActivity();
  }

  protected async _disconnect(): Promise<void> {
    // Stop the idle timer
    this._stopIdleTimer();

    // Disconnect pool
    if (this._client) {
      await this._client.end();
    }
  }

  protected async _ping(): Promise<boolean> {
    const sql = `SELECT 1+1 AS result`,
      client = await this._client.connect();
    try {
      this._updateActivity(); // Count ping as activity
      const { result } =
        (await client.queryObject<{ result: number }>(sql)).rows[0];
      return result === 2;
    } catch (e) {
      return false;
    } finally {
      await client.release();
    }
  }

  protected async _query<
    Entity extends Record<string, unknown> = Record<string, unknown>,
  >(
    query: QueryOption<Entity>,
  ): Promise<{ type: QueryType; data?: Entity[]; count?: number }> {
    const client = await this._client.connect();
    try {
      // Update activity timestamp
      this._updateActivity();

      const sql = this._queryTranslator.translate(query),
        queryType = this._queryType(sql),
        retVal: { type: QueryType; data?: Entity[]; count?: number } = {
          type: queryType,
        };

      // Run the actual query
      const result = await client.queryObject<Entity>(sql);

      // Update activity timestamp again after query completes
      this._updateActivity();

      if (query.type === QueryTypes.COUNT) {
        const dt: { totalrows: number } = result.rows[0] as unknown as {
          totalrows: number;
        };
        retVal.count = dt.totalrows;
      } else {
        retVal.data = result.rows;
        retVal.count = result.rowCount;
      }
      return retVal;
    } catch (error) {
      if (error instanceof NormError) {
        throw error;
      } else {
        throw new QueryError(
          (error as Error).message,
          query,
          this.name,
          this.dialect,
        );
      }
    } finally {
      await client.release();
    }
  }
}
