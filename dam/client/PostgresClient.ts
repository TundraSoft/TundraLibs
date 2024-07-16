import {
  PGClient,
  type PGClientOptions,
  PGPoolClient,
  PostgresError,
} from '../../dependencies.ts';

import { OptionKeys } from '../../options/mod.ts';
import { Client } from '../Client.ts';
import { assertPostgresOptions } from '../asserts/Options.ts';
import type { ClientEvents, PostgresOptions, Query } from '../types/mod.ts';

import {
  DAMClientConfigError,
  DAMClientConnectionError,
} from '../errors/mod.ts';
export class PostgresClient extends Client<PostgresOptions> {
  declare readonly dialect = 'POSTGRES';
  private _client: PGClient | undefined = undefined;

  constructor(
    name: string,
    options: OptionKeys<PostgresOptions, ClientEvents>,
  ) {
    const def: Partial<PostgresOptions> = {
      port: 5432,
      poolSize: 10,
      lazy: true,
    };
    options = { ...def, ...options };
    if (!assertPostgresOptions(options)) {
      throw new DAMClientConfigError({ dialect: 'POSTGRES', configName: name });
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

  protected _standardizeQuery(query: Query): Query {
    const sQuery = super._standardizeQuery(query);
    return {
      sql: sQuery.sql.replace(
        /:(\w+):/g,
        (_, word) => `$${word}`,
      ),
      params: sQuery.params,
    };
  }

  //#region Abstract Methods
  protected async _connect(): Promise<void> {
    if (this._client !== undefined) {
      return;
    }
    this._client = new PGClient(
      this._makeConfig(),
      this._getOption('poolSize') || 10,
      this._getOption('lazy'),
    );
    let client: PGPoolClient | undefined = undefined;
    try {
      client = await this._client.connect();
    } catch (err) {
      this._client = undefined;
      if (err instanceof PostgresError) {
        // 28P01: invalid password or user
        // 3D000: database does not exist
        //
        throw new DAMClientConnectionError(
          {
            dialect: this.dialect,
            configName: this.name,
            errorCode: err.fields.code,
          },
          err,
        );
      }
      throw new DAMClientConnectionError(
        {
          dialect: this.dialect,
          configName: this.name,
        },
        err,
      );
    } finally {
      if (client) {
        client.release();
      }
    }
  }

  protected async _close(): Promise<void> {
    if (this._client === undefined) return;
    await this._client.end();
    this._client = undefined;
  }

  protected async _execute<R extends Record<string, unknown>>(
    query: Query,
  ): Promise<{ count: number; rows: R[] }> {
    const sQuery = this._standardizeQuery(query);
    using client = await this._client!.connect();
    console.log(
      this._client?.available,
      this._client?.size,
      await this._client?.initialized(),
    );
    const res = await client.queryObject<R>(
      sQuery.sql,
      sQuery.params,
    );
    return {
      count: res.rowCount || res.rows.length || 0,
      rows: res.rows,
    };
  }

  protected async _getVersion(): Promise<string> {
    const res = await this.query<{ Version: string }>({
      sql: 'SELECT version() as "Version";',
    });
    return (/PostgreSQL (\d+\.\d+(\.\d+)?)/.exec(res.data[0].Version)?.[1] ||
      'UNKNOWN').trim();
  }
  //#endregion Abstract Methods
}
