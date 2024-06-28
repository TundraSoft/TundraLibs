import {
  type MariaDBClientConfig,
  MariaDBError,
  type MariaDBPool,
  type MariaDBPoolConnection,
  MariaDBPoolConnector,
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
  private _client: MariaDBPool | undefined = undefined;

  constructor(name: string, options: OptionKeys<MariaOptions, ClientEvents>) {
    const def: Partial<MariaOptions> = {
      port: 3306,
      connectionTimeout: 30,
      idleTimeout: 600,
      poolSize: 5,
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

  protected _makeConfig(): MariaDBClientConfig {
    const conf: MariaDBClientConfig = {
      host: this._getOption('host'),
      user: this._getOption('username'),
      password: this._getOption('password'),
      database: this._getOption('database'),
      port: this._getOption('port'),
      connectTimeout: (this._getOption('connectionTimeout') || 1) * 1000,
      connectionLimit: this._getOption('poolSize'),
      idleTimeout: this._getOption('idleTimeout'),
      namedPlaceholders: true,
      // ssl: false,
    };
    const tls = this._getOption('tls');
    if (tls) {
      if (tls.enabled === true) {
        if (!tls.certificates && tls.verify) {
          conf.ssl = true;
        } else if (tls.certificates) {
          conf.ssl = {
            cert: tls.certificates,
            rejectUnauthorized: tls.verify,
          };
        }
      }
    }
    return conf;
  }

  protected _standardizeQuery(
    query: Query,
  ): Query {
    const sQuery = super._standardizeQuery(query);
    return {
      sql: sQuery.sql.replace(
        /:(\w+):/g,
        (_, word) => `:${word}`,
      ),
      params: sQuery.params,
    };
  }

  //#region Abstract Methods
  protected async _connect(): Promise<void> {
    if (this._client !== undefined) {
      return;
    }
    this._client = MariaDBPoolConnector(this._makeConfig());
    let c: MariaDBPoolConnection | undefined = undefined;
    try {
      c = await this._client.getConnection();
    } catch (e) {
      this._client = undefined;
      if (e instanceof MariaDBError) {
        throw new DAMClientConnectionError({
          dialect: this.dialect,
          configName: this.name,
          errorCode: e.code?.toString(),
        }, e);
      }
      throw new DAMClientConnectionError({
        dialect: this.dialect,
        configName: this.name,
      }, e);
    } finally {
      c?.release();
    }
  }

  protected async _close(): Promise<void> {
    if (this._client !== undefined) {
      await this._client?.end();
      this._client = undefined;
    }
  }

  protected async _execute<R extends Record<string, unknown>>(
    sql: Query,
  ): Promise<{ count: number; rows: R[] }> {
    const query = this._standardizeQuery(sql);
    const client = await this._client!.getConnection();
    try {
      let res = await client.query<Array<R>>(query.sql, query.params);
      let rowCount = 0;
      if (Array.isArray(res)) {
        rowCount = res.length;
      } else if (Object.keys(res).includes('affectedRows')) {
        rowCount = res['affectedRows'] as number;
        res = [];
      }
      return {
        count: rowCount,
        rows: res,
      };
    } catch (e) {
      if (e instanceof MariaDBError) {
        throw new DAMClientQueryError({
          dialect: this.dialect,
          configName: this.name,
          errorCode: e.code?.toString(),
          query,
        }, e);
      }
      throw new DAMClientQueryError({
        dialect: this.dialect,
        configName: this.name,
        query,
      }, e);
    } finally {
      await client.release();
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
