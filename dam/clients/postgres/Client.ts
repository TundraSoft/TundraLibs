import { type OptionKeys } from '../../../options/mod.ts';

import { AbstractClient } from '../../Client.ts';
import { PostgresTranslator } from './Translator.ts';

import {
  DAMClientError,
  DAMConfigError,
  DAMConnectionError,
  DAMQueryError,
} from '../../errors/mod.ts';
import type { ClientEvents, PostgresOptions, Query } from '../../types/mod.ts';

import {
  PGClient,
  type PGClientOptions,
  PGPoolClient,
  PostgresError,
} from '../../../dependencies.ts';

export class PostgresClient extends AbstractClient<PostgresOptions> {
  declare readonly dialect = 'POSTGRES';
  public translator = new PostgresTranslator();
  private _client: PGClient | undefined = undefined;

  /**
   * Creates an instance of the SQLiteClient class.
   * @param name - The name of the client.
   * @param options - The options for the SQLite client.
   * @throws {DAMConfigError} If the options are invalid.
   */
  constructor(
    name: string,
    options: OptionKeys<PostgresOptions, ClientEvents>,
  ) {
    // Validate options
    const def: Partial<PostgresOptions> = {
      port: 5432,
      poolSize: 50,
    };
    super(name, { ...def, ...options });
  }

  protected _standardizeQuery(query: Query): Query {
    query = super._standardizeQuery(query);
    return {
      sql: query.sql.replace(
        /:(\w+):/g,
        (_, word) => `$${word}`,
      ),
      params: query.params,
    };
  }

  protected _validateConfig(options: PostgresOptions): void {
    // Call super
    super._validateConfig(options);
    // Validate per this dialect
    if (options.dialect !== 'POSTGRES') {
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

  protected _makeConfig(): PGClientOptions {
    const conf: PGClientOptions = {
      applicationName: this.name,
      connection: {
        attempts: 1,
        interval: 500,
      },
      hostname: this._getOption('host'),
      port: this._getOption('port'),
      user: this._getOption('username'),
      password: this._getOption('password'),
      database: this._getOption('database'),
      host_type: 'tcp',
    };

    const tls = this._getOption('tls');
    if (tls) {
      conf.tls = {};
      if (tls.enabled) {
        conf.tls.enabled = tls.enabled;
      }
      if (tls.certificates) {
        conf.tls.caCertificates = tls.certificates;
      }
      if (tls.verify) {
        conf.tls.enforce = tls.verify;
      }
    }

    return conf;
  }

  //#region Abstract methods
  /**
   * Connects to the SQLite database.
   * If the client is already connected, this method does nothing.
   */
  protected async _connect() {
    if (this._status === 'CONNECTED' && this._client !== undefined) {
      return;
    }
    // Ok lets connect
    this._client = new PGClient(
      this._makeConfig(),
      this._getOption('poolSize') || 10,
      true,
    );
    let client: PGPoolClient | undefined = undefined;
    // Test connection
    try {
      client = await this._client.connect();
    } catch (err) {
      if (err instanceof PostgresError) {
        // 28P01: invalid password or user
        // 3D000: database does not exist
        //
        throw new DAMConnectionError(
          {
            dialect: this.dialect,
            config: this.name,
            errorCode: err.fields.code,
            errorMessage: err.fields.message,
          },
          err,
        );
      }
      throw new DAMConnectionError(
        {
          dialect: this.dialect,
          config: this.name,
        },
        err,
      );
    } finally {
      if (client) {
        client.release();
      }
    }
  }

  /**
   * Closes the connection to the SQLite database.
   * If the client is not connected or the connection is already closed, this method does nothing.
   */
  protected async _close() {
    if (this._status !== 'CONNECTED' || this._client === undefined) {
      return;
    }
    await this._client.end();
    this._client = undefined;
  }

  protected async _execute<
    R extends Record<string, unknown> = Record<string, unknown>,
  >(query: Query): Promise<{ count: number; rows: R[] }> {
    // Below is not needed, but kept for safety
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
    const client: PGPoolClient = await this._client.connect();
    try {
      const res = await client.queryObject<R>(
        rawQuery.sql,
        rawQuery.params,
      );
      return {
        count: res.rowCount || res.rows.length || 0,
        rows: res.rows,
      };
    } catch (err) {
      throw new DAMQueryError({
        dialect: this.dialect,
        config: this.name,
        sql: rawQuery.sql,
        params: rawQuery.params,
      }, err);
    } finally {
      client.release();
    }
  }

  protected _isReallyConnected(): boolean {
    return (this.status === 'CONNECTED' && this._client !== undefined);
  }

  protected async _getVersion(): Promise<string> {
    const res = await this.execute<{ Version: string }>({
      sql: 'SELECT sqlite_version() as "Version";',
    });
    return res.data[0].Version;
  }
  //#endregion Abstract methods
}
