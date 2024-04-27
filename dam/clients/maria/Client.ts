import { type OptionKeys } from '../../../options/mod.ts';
import { AbstractClient } from '../../Client.ts';
import { MariaTranslator } from './Translator.ts';
import type { ClientEvents, MariaOptions, Query } from '../../types/mod.ts';
import {
  DAMClientError,
  DAMConfigError,
  DAMConnectionError,
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
  declare readonly dialect = 'MONGO';
  public translator = new MariaTranslator();

  private _client: MariaDBPool | undefined = undefined;

  constructor(name: string, options: OptionKeys<MariaOptions, ClientEvents>) {
    const def: Partial<MariaOptions> = {
      poolSize: 50,
      port: 3306,
      connectionTimeout: 30 * 1000,
      idleTimeout: 30 * 60 * 1000,
    };
    super(name, { ...def, ...options });
  }

  protected _standardizeQuery(query: Query): Query {
    query = super._standardizeQuery(query);
    return {
      sql: query.sql.replace(
        /:(\w+):/g,
        (_, word) => `:${word}`,
      ),
      params: query.params,
    };
  }

  protected _validateConfig(options: MariaOptions): void {
    // Call super
    super._validateConfig(options);
    // Validate per this dialect
    if (options.dialect !== 'MARIA') {
      throw new DAMConfigError(
        'Invalid dialect provided for ${dialect} Client',
        {
          dialect: this.dialect,
          config: this.name,
          item: 'dialect',
          value: options.dialect,
        },
      );
    }
    if (options.host === undefined || options.host.trim() === '') {
      throw new DAMConfigError('Hostname of ${dialect} server is required', {
        config: this.name,
        dialect: this.dialect,
        item: 'host',
      });
    }
    if (options.port && (options.port < 1024 || options.port > 65535)) {
      throw new DAMConfigError(
        'Port of ${dialect} server is required and must be between 1024 and 65535',
        {
          config: this.name,
          dialect: this.dialect,
          item: 'port',
        },
      );
    }
    if (options.username === undefined || options.username.trim() === '') {
      throw new DAMConfigError(
        'Username for authenticating with ${dialect} server is required',
        {
          config: this.name,
          dialect: this.dialect,
          item: 'username',
        },
      );
    }
    if (options.password === undefined || options.password.trim() === '') {
      throw new DAMConfigError(
        'Password for authenticating with ${dialect} server is required',
        {
          config: this.name,
          dialect: this.dialect,
          item: 'password',
        },
      );
    }
    if (options.database === undefined || options.database.trim() === '') {
      throw new DAMConfigError(
        'Database name in ${dialect} server is required',
        {
          config: this.name,
          dialect: this.dialect,
          item: 'database',
        },
      );
    }
    if (options.poolSize && options.poolSize < 1) {
      throw new DAMConfigError('Pool size must be greater than 0', {
        config: this.name,
        dialect: this.dialect,
        item: 'poolSize',
      });
    }
  }

  protected _makeConfig(): MariaDBClientConfig {
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

    return conf;
  }

  //#region Abstract methods
  protected async _connect(): Promise<void> {
    if (this._status === 'CONNECTED' && this._client !== undefined) {
      return;
    }

    this._client = await MariaDBPoolConnector(this._makeConfig());
    let c: MariaDBPoolConnection | undefined = undefined;
    try {
      c = await this._client.getConnection();
    } catch (e) {
      if (e instanceof MariaDBError) {
        throw new DAMConnectionError(
          {
            dialect: this.dialect,
            config: this.name,
            errorCode: e.code?.toString() ?? '',
            errorMessage: e.message,
          },
          e,
        );
      }
      throw new DAMConnectionError(
        {
          dialect: this.dialect,
          config: this.name,
        },
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
      throw new DAMClientError('Client not connected', {
        dialect: this.dialect,
        config: this.name,
      });
    }
    // Ok lets first build the queries if they are not raw query
    const rawQuery: Query = this._standardizeQuery(
      query,
    );
    const client = await this._client.getConnection();
    try {
      let res = await client.query<Array<R>>(rawQuery.sql, rawQuery.params);
      let rowCount = 0;
      if (Array.isArray(res)) {
        rowCount = res.length;
      } else if (Object.keys(res).includes('affectedRows')) {
        rowCount = res['affectedRows'] as number;
        res = [];
      }
      // console.log(await client.execute(rawQuery.sql, rawQuery.params))
      return {
        count: rowCount,
        rows: res,
      };
    } catch (err) {
      if (err instanceof MariaDBError) {
        throw new DAMQueryError({
          dialect: this.dialect,
          config: this.name,
          sql: rawQuery.sql,
          params: rawQuery.params,
        }, err);
      }
      throw new DAMQueryError({
        dialect: this.dialect,
        config: this.name,
        sql: rawQuery.sql,
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
