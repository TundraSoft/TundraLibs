import { type OptionKeys } from '../../../options/mod.ts';
import { AbstractClient } from '../../Client.ts';
import { MariaTranslator } from './Translator.ts';
import type { ClientEvents, MariaOptions, Query } from '../../types/mod.ts';
import {
  DAMClientError,
  DAMConfigError,
  DAMQueryError,
} from '../../errors/mod.ts';

import {
  type MariaDBClientConfig,
  MariaDBError,
  type MariaDBPool,
  type MariaDBPoolConnection,
  MariaDBPoolConnector,
} from '../../../dependencies.ts';

export class MariaClient extends AbstractClient<MariaOptions> {
  public translator = new MariaTranslator();

  private _client: MariaDBPool | undefined = undefined;

  constructor(name: string, options: OptionKeys<MariaOptions, ClientEvents>) {
    const defaults: Partial<MariaOptions> = {
      poolSize: 50,
      port: 3306,
      connectionTimeout: 30 * 1000,
      idleTimeout: 30 * 60 * 1000,
    };
    if (options.dialect !== 'MARIA') {
      throw new DAMConfigError('Invalid value for dialect passed', {
        name: name,
        dialect: options.dialect,
        item: 'dialect',
      });
    }
    if (options.port && (options.port < 0 || options.port > 65535)) {
      throw new DAMConfigError('Port value must be between 0 to 65535', {
        name: name,
        dialect: options.dialect,
        item: 'port',
      });
    }
    if (options.poolSize && (options.poolSize < 0 || options.poolSize > 100)) {
      throw new DAMConfigError('PoolSize must be between 0 to 100', {
        name: name,
        dialect: options.dialect,
        item: 'poolSize',
      });
    }
    if (options.database === undefined || options.database.trim() === '') {
      throw new DAMConfigError('Invalid value for database', {
        name: name,
        dialect: options.dialect,
        item: 'database',
      });
    }
    // Must be valid host?
    if (options.host === undefined || options.host.trim() === '') {
      throw new DAMConfigError('Invalid value for host', {
        name: name,
        dialect: options.dialect,
        item: 'host',
      });
    }
    super(name, { ...defaults, ...options });
  }

  protected _standardizeQuery(query: Query): Query {
    query = super._standardizeQuery(query);
    return {
      sql: query.sql.replace(
        /:([a-zA-Z0-9\_]+):/g,
        (_, word) => `:${word}`,
      ),
      params: query.params,
    };
  }

  //#region Abstract methods
  protected async _connect(): Promise<void> {
    if (this._status === 'CONNECTED' && this._client !== undefined) {
      return;
    }
    const conf: MariaDBClientConfig = {
      host: this._getOption('host'),
      user: this._getOption('username'),
      password: this._getOption('password'),
      database: this._getOption('database'),
      port: this._getOption('port'),
      // timeout: this._getOption('connectionTimeout'),
      connectTimeout: this._getOption('connectionTimeout'),
      connectionLimit: this._getOption('poolSize'),
      idleTimeout: this._getOption('idleTimeout'),
      // tls: this._getOption('tls') ? {} : undefined,
      namedPlaceholders: true,
      ssl: false,
    };
    const tls = this._getOption('tls');
    if (tls) {
      if (tls.enabled === true) {
        if (!tls.certificates && tls.verify) {
          conf.ssl = true;
        } else if (tls.certificates) {
          conf.ssl.cert = tls.certificates;
        }
        if (tls.verify !== undefined && tls.verify === false) {
          conf.ssl.rejectUnauthorized = false;
        }
      }
    }
    this._client = await MariaDBPoolConnector(conf);
    let c: MariaDBPoolConnection | undefined = undefined;
    try {
      c = await this._client.getConnection();
    } catch (e) {
      if (e instanceof MariaDBError) {
        throw new DAMClientError(
          'Unable to connect to database. Please check config',
          {
            dialect: this.dialect,
            name: this.name,
            code: e.code,
            message: e.message,
          },
          e,
        );
      }
      throw new DAMClientError(
        'Unable to connect to database. Please check config',
        { dialect: this.dialect, name: this.name, message: e.message },
        e,
      );
    } finally {
      c?.release();
    }
  }

  protected async _close(): Promise<void> {
    if (this._status !== 'CONNECTED' || this._client === undefined) {
      return;
    }
    await this._client.end();
    this._client = undefined;
  }

  protected async _execute<
    R extends Record<string, unknown> = Record<string, unknown>,
  >(query: Query): Promise<{ count: number; rows: R[] }> {
    if (this._status !== 'CONNECTED' || this._client === undefined) {
      throw new DAMQueryError('Client not connected', {
        dialect: this.dialect,
        name: this.name,
        query: query.sql,
        params: query.params,
      });
    }
    // Ok lets first build the queries if they are not raw query
    const rawQuery: Query = this._standardizeQuery(
      query,
    );
    // console.log(rawQuery.sql, rawQuery.params);
    const client = await this._client.getConnection();
    try {
      await client.query;
      let res = await client.query<Array<R>>(rawQuery.sql, rawQuery.params);
      let rowCount = 0;
      if (Array.isArray(res)) {
        rowCount = res.length;
      } else {
        if (Object.keys(res).includes('affectedRows')) {
          rowCount = res['affectedRows'] as number;
          res = [];
        }
      }
      // console.log(await client.execute(rawQuery.sql, rawQuery.params))
      return {
        count: rowCount,
        rows: res,
      };
    } catch (err) {
      if (err instanceof MariaDBError) {
        throw new DAMQueryError(err.message, {
          dialect: this.dialect,
          name: this.name,
          query: rawQuery.sql,
          params: rawQuery.params,
          code: err.code,
        }, err);
      }
      throw new DAMQueryError(err.message, {
        dialect: this.dialect,
        name: this.name,
        query: rawQuery.sql,
        params: rawQuery.params,
      }, err);
    } finally {
      await client.release();
    }
  }

  protected _isReallyConnected(): boolean {
    return (this.status === 'CONNECTED' && !this._client?.closed);
  }

  protected async _getVersion(): Promise<string> {
    const res = await this.execute<{ Version: string }>({
      sql: 'SELECT VERSION() as `Version`;',
    });
    return res.data[0].Version;
  }
  //#endregion Abstract methods
}
