import {
  MySQLClient,
  type MySQLClientConfig,
  MySQLTLSMode,
} from '../../../dependencies.ts';

import { OptionKeys } from '../../../options/mod.ts';
import { Client } from '../../Client.ts';
import { assertMariaOptions } from '../../asserts/Options.ts';
import type { ClientEvents, MariaOptions, Query } from '../../types/mod.ts';

import {
  DAMClientConfigError,
  DAMClientConnectionError,
  DAMClientQueryError,
} from '../../errors/mod.ts';

export class MariaClient extends Client<MariaOptions> {
  declare readonly dialect = 'MARIA';
  private _client: MySQLClient | undefined = undefined;

  constructor(name: string, options: OptionKeys<MariaOptions, ClientEvents>) {
    const def: Partial<MariaOptions> = {
      port: 3306,
      connectionTimeout: 30,
      idleTimeout: 30 * 60 * 1000,
      poolSize: 50,
    };
    options = { ...def, ...options };
    if (!assertMariaOptions(options)) {
      throw new DAMClientConfigError({ dialect: 'MARIA', configName: name });
    }
    super(name, options);
  }

  public async ping(): Promise<boolean> {
    try {
      await this.query({ sql: 'SELECT 1;' });
      return true;
    } catch (_e) {
      return false;
    }
  }

  protected _makeConfig(): MySQLClientConfig {
    const conf: MySQLClientConfig = {
      hostname: this._getOption('host'),
      username: this._getOption('username'),
      password: this._getOption('password'),
      db: this._getOption('database'),
      port: this._getOption('port'),
      timeout: (this._getOption('connectionTimeout') || 1) * 1000,
      idleTimeout: this._getOption('idleTimeout'),
      poolSize: this._getOption('poolSize') || 10,
    };
    const tls = this._getOption('tls');
    if (tls) {
      if (tls.enabled === true) {
        conf.tls = {
          mode:
            (tls.verify ? MySQLTLSMode.VERIFY_IDENTITY : MySQLTLSMode.DISABLED),
        };
        if (tls.certificates) {
          conf.tls.caCerts = tls.certificates;
        }
      }
    }
    return conf;
  }

  protected _processParams(query: Query): { sql: string; params: unknown[] } {
    // Regular expression to match named parameters in the SQL string
    if (!query.params) {
      return { sql: query.sql, params: [] };
    }
    const paramRegex = /:(\w+):/g;
    let match;
    const paramsArray: unknown[] = [];
    let processedSql = query.sql;

    // Find all matches and replace them with '?', while building the params array
    while ((match = paramRegex.exec(query.sql)) !== null) {
      // Extract the parameter name from the match
      const paramName = match[1];
      // Replace the first occurrence of the named parameter in the SQL string with '?'
      processedSql = processedSql.replace(`:${paramName}:`, '?');
      // Add the parameter value to the paramsArray, handling multiple occurrences
      if (query.params[paramName]) {
        paramsArray.push(query.params[paramName]);
      }
    }

    return {
      sql: processedSql,
      params: paramsArray,
    };
  }

  //#region Abstract Methods
  protected async _connect(): Promise<void> {
    if (this._client !== undefined) {
      return;
    }
    this._client = new MySQLClient();
    try {
      await this._client.connect(this._makeConfig());
      await this._client.execute('SELECT 1;');
    } catch (e) {
      this._client = undefined;
      throw new DAMClientConnectionError({
        dialect: this.dialect,
        configName: this.name,
      }, e);
    }
  }

  protected async _close(): Promise<void> {
    if (this._client !== undefined) {
      await this._client.close();
      this._client = undefined;
    }
  }

  protected async _execute<R extends Record<string, unknown>>(
    sql: Query,
  ): Promise<{ count: number; rows: R[] }> {
    const query = this._standardizeQuery(sql);
    const std = this._processParams(query);
    // Convert named params to positional params
    try {
      // let res = await client.query<Array<R>>(query.sql, query.params);
      const res = await this._client!.execute(std.sql, std.params);
      return {
        count: res.affectedRows || res.rows?.length || 0,
        rows: res.rows as R[],
      };
    } catch (e) {
      throw new DAMClientQueryError({
        dialect: this.dialect,
        configName: this.name,
        query,
      }, e);
    }
  }

  protected async _getVersion(): Promise<string> {
    const res = await this.query<{ Version: string }>({
      sql: 'SELECT VERSION() as `Version`;',
    });
    return (/^(\d+\.\d+(\.\d+)?)/.exec(res.data[0].Version)?.[1] || 'UNKNOWN')
      .trim();
  }
  //#endregion Abstract Methods
}
