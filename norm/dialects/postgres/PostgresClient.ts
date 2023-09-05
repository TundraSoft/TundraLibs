import { OptionKeys } from '../../../options/mod.ts';
import { PGPool } from '../../../dependencies.ts';
import type { PGClientOptions } from '../../../dependencies.ts';
import { AbstractClient } from '../../AbstractClient.ts';
import type { PostgresClientOptions, ClientEvents } from '../../types/mod.ts';

export class PostgresClient extends AbstractClient<PostgresClientOptions> {
  declare protected _client: PGPool;

  constructor(name: string, config: OptionKeys<PostgresClientOptions, ClientEvents>) {
    const def: Partial<PostgresClientOptions> = {
      longQuery: 10,
      port: 5432
    } as Partial<PostgresClientOptions>;
    super(name, config);
  }

  protected async _connect(): Promise<void> {
    if(this._client) {
      if (await this._client.initialized() !== 0 && this._client.size > 0) {
        return;
      }
    }
    const pgConfig: PGClientOptions = {
      applicationName: this._name,
      hostname: this._getOption('host'),
      port: this._getOption('port'),
      user: this._getOption('user'),
      password: this._getOption('password'),
      database: this._getOption('database'),
      connection: {
        attempts: 3,
      },
    },
    poolSize = this._getOption('poolSize') as number || 1;
    // Add TLS Options
    if (this._hasOption('tls')) {
      pgConfig['tls'] = this._getOption('tls');
    }
    this._client = await new PGPool(pgConfig, poolSize, true);
    // Hack to test the connection, if there is something wrong it will throw immediately
    await (await this._client.connect()).release();
  }

  protected async _close(): Promise<void> {
    await this._client.end();
  }
  protected async _ping(): Promise<boolean> {
    const sql = `SELECT 1+1 AS result`,
      client = await this._client.connect(),
      { result } = (await client.queryObject<{ result: number }>(sql)).rows[0];
    await client.release();
    return result === 2;
  }
  protected async _executeQuery<Entity extends Record<string, unknown> = Record<string, unknown>>(sql: string): Promise<Entity[]> {
    const client = await this._client.connect();
    try {
      const result = await client.queryObject<Entity>(sql);
      client.release();
      return result.rows;
    } catch (e) {
      client.release();
      throw e;
    }
  }
}

const pg = new PostgresClient('PGClient', {
  dialect: 'POSTGRESQL', 
  host: 'localhost', 
  port: 5432, 
  user: 'postgres', 
  password: 'postgrespw', 
  database: 'postgresf', 
});

pg.on('slowQuery', (name: string, sql: string, time: number) => {
  console.log(`Detected slow running query in ${name}. SQL: ${sql}`)
})
console.log(pg);
console.log(await pg.query('SELECT 1 AS AN'));