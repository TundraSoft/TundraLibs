import { AbstractClient } from '../AbstractClient.ts';
import { QueryTypes } from '../types/mod.ts';
import type {
  CountQuery,
  PostgresConfig,
  QueryOption,
  QueryType,
  SelectQuery,
} from '../types/mod.ts';
import { PGClient, PGPool } from '../../dependencies.ts';
import type { PGClientOptions } from '../../dependencies.ts';

import { NormError, QueryError } from '../errors/mod.ts';

export class PostgresClient<O extends PostgresConfig = PostgresConfig>
  extends AbstractClient<O> {
  declare protected _client: PGPool;
  // declare protected _client: PGClient;

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
      poolSize: 10, // Lets default to 1
      idleTimeout: 1800, // 5 seconds
      connectionTimeout: 30, // 30 seconds
      lazyConnect: true,
    };
    super(name, { ...defaults, ...options });
  }

  protected async _connect(): Promise<void> {
    try {
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
          options: {
            connect_timeout: '30', 
          }, 
        },
        poolSize = this._getOption('poolSize') as number || 10;
      console.log(`Connecting to Postgres with pool size: ${poolSize} and Lazy: ${this._options.lazyConnect === true}`);
      this._client = await new PGPool(
        pgConfig,
        poolSize,
        this._options.lazyConnect === true,
      );
      // Hack to test the connection, if there is something wrong it will throw immediately
      await (await this._client.connect()).release();

      // this._client = new PGClient(pgConfig);
      // await this._client.connect();
    } catch (error) {
      console.log(`----------------------CONNECT RES: ${error}`);
      throw error;
    }
  }

  protected async _disconnect(): Promise<void> {
    await this._client.end();
  }

  protected async _ping(): Promise<boolean> {
    const sql = `SELECT 1+1 AS result`,
      client = await this._client.connect(); // Acquire a connection from the pool
    try {
      const { result } =
        (await client.queryObject<{ result: number }>(sql)).rows[0]; // Execute the query and get the result
      return result === 2; // Check if the result is 2
    } catch (e) {
      console.log(`----------------------PING RES: ${e}`);
      return false;
    } finally {
      await client.release(); // Release the connection back to the pool
    }
  }

  protected async _query<
    Entity extends Record<string, unknown> = Record<string, unknown>,
  >(
    query: QueryOption<Entity>,
  ): Promise<{ type: QueryType; data?: Entity[]; count?: number }> {
    const client = await this._client.connect();
    try {
      const sql = this._queryTranslator.translate(query),
        queryType = this._queryType(sql),
        countQuery = this._queryTranslator.translate({
          ...query as CountQuery<Entity>,
          type: QueryTypes.COUNT,
        }),
        retVal: { type: QueryType; data?: Entity[]; count?: number } = {
          type: queryType,
        };
      let actualRows = -1;

      // Get count output if and only if it is select with pagination or if it is a delete query
      if (
        (query.type === QueryTypes.SELECT &&
          (query as SelectQuery).pagination) || query.type === QueryTypes.DELETE
      ) {
        const result =
          (await client.queryObject<{ TotalRows: number }>(countQuery)).rows[0];
        actualRows = result.TotalRows;
      }

      // Run the actual query
      const result = await client.queryObject<Entity>(sql);
      if (query.type === QueryTypes.COUNT) {
        const dt: { totalrows: number } = result.rows[0] as unknown as {
          totalrows: number;
        };
        retVal.count = dt.totalrows;
      } else {
        retVal.data = result.rows;
        retVal.count = result.rowCount;
      }
      if (actualRows > -1) {
        retVal.count = actualRows;
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
