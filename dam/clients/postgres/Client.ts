import { type OptionKeys } from '../../../options/mod.ts';

import { AbstractClient } from '../../Client.ts';
import { PostgresTranslator } from './Translator.ts';

import {
  DAMClientError,
  DAMConfigError,
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
    // Check the config
    if (options.dialect !== 'POSTGRES') {
      throw new DAMConfigError(
        `Invalid/incorrect dialect '${options.dialect}'.`,
        { name: name, dialect: options.dialect, item: 'dialect' },
      );
    }
    if (options.host === undefined) {
      throw new DAMConfigError(`Hostname is required`, {
        name: name,
        dialect: options.dialect,
        item: 'host',
      });
    }
    if (options.port && (options.port < 1024 || options.port > 65535)) {
      throw new DAMConfigError(`Port value must be between 1024 and 65535`, {
        name: name,
        dialect: options.dialect,
        item: 'port',
      });
    }
    if (options.username === undefined || options.username === '') {
      throw new DAMConfigError(`Username is required`, {
        name: name,
        dialect: options.dialect,
        item: 'user',
      });
    }
    if (options.password === undefined || options.password === '') {
      throw new DAMConfigError(`Password is required`, {
        name: name,
        dialect: options.dialect,
        item: 'password',
      });
    }
    if (options.database === undefined || options.database === '') {
      throw new DAMConfigError(`Database name is required`, {
        name: name,
        dialect: options.dialect,
        item: 'database',
      });
    }
    if (options.poolSize && options.poolSize < 1) {
      throw new DAMConfigError(`Postgres pool size must be greater than 0`, {
        name: name,
        dialect: options.dialect,
        item: 'poolSize',
      });
    }
    super(name, { ...options, ...def });
  }

  protected _standardizeQuery(query: Query): Query {
    query = super._standardizeQuery(query);
    return {
      sql: query.sql.replace(
        /:([a-zA-Z0-9\_]+):/g,
        (_, word) => `$${word}`,
      ),
      params: query.params,
    };
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
    const opt: PGClientOptions = {
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
      opt.tls = {};
      if (tls.enabled) {
        opt.tls.enabled = tls.enabled;
      }
      if (tls.certificates) {
        opt.tls.caCertificates = tls.certificates;
      }
      if (tls.verify) {
        opt.tls.enforce = tls.verify;
      }
    }
    this._client = new PGClient(opt, this._getOption('poolSize') || 10, true);
    let client: PGPoolClient | undefined = undefined;
    // Test connection
    try {
      client = await this._client.connect();
    } catch (err) {
      if (err instanceof PostgresError) {
        // 28P01: invalid password or user
        // 3D000: database does not exist
        //
        // console.log(err.fields.code);
        throw new DAMClientError(
          'Unable to connect to database. Please check config',
          {
            dialect: this.dialect,
            name: this.name,
            code: err.fields.code,
            message: err.fields.message,
          },
          err,
        );
      }
      // console.log(err.name);
      throw new DAMClientError(
        'Unable to connect to database. Please check config',
        {
          dialect: this.dialect,
          name: this.name,
          message: err.message,
          src: err.name,
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
    const client = await this._client.connect();
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
      if (err instanceof PostgresError) {
        throw new DAMQueryError(err.message, {
          dialect: this.dialect,
          name: this.name,
          query: rawQuery.sql,
          params: rawQuery.params,
          fields: err.fields,
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
