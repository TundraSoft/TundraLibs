import { AbstractClient } from '../AbstractClient.ts';
import { QueryTypes } from '../types/mod.ts';
import type {
  CountQuery,
  MariaConfig,
  QueryOption,
  QueryType,
  SelectQuery,
} from '../types/mod.ts';
import { MySQL } from '/root/dependencies.ts';
import type { MySQLClientConfig } from '/root/dependencies.ts';

import { NormError, QueryError } from '../errors/mod.ts';

export class MariaClient<O extends MariaConfig = MariaConfig>
  extends AbstractClient<O> {
  declare protected _client: MySQL;
  constructor(name: string, options: NonNullable<O> | O) {
    const defaults: Partial<MariaConfig> = {
      dialect: 'MARIADB',
      port: 3306,
      poolSize: 10,
      idleTimeout: 5,
      connectionTimeout: 30,
    };
    super(name, { ...defaults, ...options });
  }

  protected async _connect(): Promise<void> {
    const mysqlConfig: MySQLClientConfig = {
      hostname: this._options.host,
      port: this._options.port,
      username: this._options.userName,
      password: this._options.password,
      db: this._options.database,
      timeout: this._options.connectionTimeout,
      poolSize: this._options.poolSize,
      idleTimeout: this._options.idleTimeout,
    };
    this._client = await new MySQL().connect(mysqlConfig);
    // Hack to test the connection, if there is something wrong it will throw immediately
    this._state = 'CONNECTED';
  }

  protected async _disconnect(): Promise<void> {
    await this._client.close();
  }

  protected async _ping(): Promise<boolean> {
    const sql = `SELECT 1+1 AS result`,
      result = (await this._client.execute(sql)).rows;
    return (result && result.length > 0 && result[0].result === 2)
      ? true
      : false;
  }

  protected async _query<
    Entity extends Record<string, unknown> = Record<string, unknown>,
  >(
    query: QueryOption<Entity>,
  ): Promise<{ type: QueryType; data?: Entity[]; count?: number }> {
    try {
      const sql = this._queryTranslator.translate(query),
        countQuery = this._queryTranslator.translate({
          ...query as CountQuery<Entity>,
          type: QueryTypes.COUNT,
        }),
        retVal: { type: QueryType; data?: Entity[]; count?: number } = {
          type: this._queryType(sql),
        };
      let actualRows = -1;

      // Get count output if and only if it is select with pagination or if it is a delete query
      if (
        (query.type === QueryTypes.SELECT &&
          (query as SelectQuery).pagination) || query.type === QueryTypes.DELETE
      ) {
        const result = (await this._client.query(countQuery)).rows[0];
        actualRows = result.TotalRows;
      }

      // Run the actual query
      // console.log(sql);
      const result = (await this._client.execute(sql));
      // console.log(result);
      retVal.data = result.rows;
      retVal.count = (result.rows) ? result.rows.length : result.affectedRows;
      if (actualRows > -1) {
        retVal.count = actualRows;
      }

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
