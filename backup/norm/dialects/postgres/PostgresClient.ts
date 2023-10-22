import { OptionKeys } from '../../../options/mod.ts';
import {
  ConnectionError,
  PGPool,
  PostgresError,
} from '../../../dependencies.ts';
import type { PGClientOptions } from '../../../dependencies.ts';
import { AbstractClient } from '../../AbstractClient.ts';
import type {
  ClientEvents,
  DeleteQueryOptions,
  InsertQueryOptions,
  PostgresClientOptions,
  UpdateQueryOptions,
} from '../../types/mod.ts';
import { PostGresDataTypeMap } from './PostgresDataTypeMapping.ts';
import {
  NormBaseError,
  NormClientDatabaseNotFound,
  NormClientIncorrectPassword,
  NormClientInvalidHost,
  NormClientQueryError,
  NormConnectionError,
} from '../../errors/mod.ts';

export class PostgresClient extends AbstractClient<PostgresClientOptions> {
  declare protected _client: PGPool;
  protected _columnQuote = '"';
  protected _valueQuote = '\'';
  protected _dataTypeMap = PostGresDataTypeMap;

  constructor(
    name: string,
    config: OptionKeys<PostgresClientOptions, ClientEvents>,
  ) {
    const def: Partial<PostgresClientOptions> = {
      longQuery: 10,
      port: 5432,
    } as Partial<PostgresClientOptions>;
    super(name, config);
  }

  protected async _connect(): Promise<void> {
    try {
      if (this._client) {
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
    } catch (e) {
      if (
        (e.code && e.code === 'ENOENT') ||
        e.message.trim().toLowerCase().startsWith(
          'could not translate host name',
        )
      ) {
        throw new NormClientInvalidHost({
          name: this.name,
          dialect: this.dialect,
        });
      } else if (
        (e.code && e.code === 'ECONNREFUSED') ||
        e.message.trim().toLowerCase().startsWith('connectionrefused')
      ) {
        throw new NormClientInvalidHost({
          name: this.name,
          dialect: this.dialect,
        });
      } else if (
        (e instanceof PostgresError && e.fields.code === '28P01') ||
        e.message.trim().toLowerCase().startsWith('password authentication')
      ) {
        throw new NormClientIncorrectPassword({
          name: this.name,
          dialect: this.dialect,
        });
      } else if (
        (e instanceof PostgresError && e.fields.code === '3D000') ||
        e.message.trim().toLowerCase().startsWith(
          `database "${
            this._getOption('database').toLowerCase()
          }" does not exist`,
        )
      ) {
        throw new NormClientDatabaseNotFound({
          name: this.name,
          dialect: this.dialect,
        });
      } else {
        throw new NormConnectionError(e.message, {
          name: this.name,
          dialect: this.dialect,
        });
      }
    }
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

  protected async _executeQuery<
    Entity extends Record<string, unknown> = Record<string, unknown>,
  >(sql: string): Promise<Entity[]> {
    const client = await this._client.connect();
    try {
      const result = await client.queryObject<Entity>(sql);
      client.release();
      return result.rows;
    } catch (e) {
      // if (e instanceof PostgresError) {
      //   console.log(e);
      // }
      client.release();
      throw new NormClientQueryError(e.message, {
        name: this.name,
        dialect: this.dialect,
        sql,
      });
    }
  }
}

const pg = new PostgresClient('PGClient', {
  dialect: 'POSTGRESQL',
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'postgrespw',
  database: 'postgres',
});

console.log(
  pg._processSorting({ a: 'AA', b: 'dasf' }, { a: 'ASC', b: 'DESC' }),
);

pg.on('slowQuery', (name: string, sql: string, time: number) => {
  console.log(`Detected slow running query in ${name}. SQL: ${sql}`);
});
// console.log(pg);
console.log(await pg.query('SELECT 1 AS AN'));
console.log(
  await pg.insertQuery({
    table: 'test',
    columns: {
      id: 'id',
      name: 'name',
      age: 'age',
      ts: 'timestamp',
    },
    values: [
      {
        id: 1,
        name: 'John',
        age: 20,
        ts: '${CREATED_DATE}',
      },
      {
        id: 2,
        name: 'Jane',
        age: 21,
      },
    ],
  }),
);
