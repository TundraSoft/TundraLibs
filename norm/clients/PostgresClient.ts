import { AbstractClient } from '../AbstractClient.ts';
import { QueryTypes } from '../types/mod.ts';
import type {
  CountQuery,
  PostgresConfig,
  QueryOption,
  QueryType,
  SelectQuery,
} from '../types/mod.ts';
import { PGPool } from '../../dependencies.ts';
import type { PGClientOptions } from '../../dependencies.ts';

import { NormError, QueryError } from '../errors/mod.ts';

export class PostgresClient<O extends PostgresConfig = PostgresConfig>
  extends AbstractClient<O> {
  declare protected _client: PGPool;

  constructor(name: string, options: NonNullable<O> | O) {
    const defaults: Partial<PostgresConfig> = {
      dialect: 'POSTGRES',
      port: 5432,
      poolSize: 1, // Lets default to 1
      idleTimeout: 5, // 5 seconds
      connectionTimeout: 30, // 30 seconds
    };
    super(name, { ...defaults, ...options });
  }

  protected async _connect(): Promise<void> {
    const pgConfig: PGClientOptions = {
        applicationName: this._name,
        hostname: this._options.host,
        port: this._options.port,
        user: this._options.userName,
        password: this._options.password,
        database: this._options.database,
      },
      poolSize = this._getOption('poolSize') as number || 1;
    this._client = new PGPool(pgConfig, poolSize, true);
    // Hack to test the connection, if there is something wrong it will throw immediately
    await (await this._client.connect()).release();
  }

  protected async _disconnect(): Promise<void> {
    await this._client.end();
  }

  protected async _ping(): Promise<boolean> {
    const sql = `SELECT 1+1 AS result`,
      client = await this._client.connect(),
      { result } = (await client.queryObject<{ result: number }>(sql)).rows[0];
    await client.release();
    return result === 2;
  }

  protected async _query<
    Entity extends Record<string, unknown> = Record<string, unknown>,
  >(
    query: QueryOption<Entity>,
  ): Promise<{ type: QueryType; data?: Entity[]; count?: number }> {
    try {
      // first get the client
      const client = await this._client.connect(),
        sql = this._queryTranslator.translate(query),
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
      // console.log(sql);
      const result = await client.queryObject<Entity>(sql);
      // console.log(result);
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

      client.release();
      return retVal;
    } catch (error) {
      if (error instanceof NormError) {
        throw error;
      } else {
        throw new QueryError(error.message, query, this.name, this.dialect);
      }
    }
  }
}
