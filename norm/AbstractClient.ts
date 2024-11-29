import { Options } from '../options/mod.ts';
import { QueryTranslator } from './QueryTranslator.ts';
import {
  // decode as b64Decode,
  base64,
} from '../dependencies.ts';

import type {
  ClientConfig,
  ClientEvents,
  CountQuery,
  CreateSchemaQuery,
  CreateTableQuery,
  DeleteQuery,
  Dialects,
  DropSchemaQuery,
  DropTableQuery,
  GeneratorOutput,
  InsertQuery,
  QueryOption,
  QueryResult,
  QueryType,
  SelectQuery,
  TruncateTableQuery,
  UpdateQuery,
} from './types/mod.ts';

import { Generator, QueryTypes } from './types/mod.ts';

import { ConnectionError, NormError, QueryError } from './errors/mod.ts';

export abstract class AbstractClient<
  O extends ClientConfig = ClientConfig,
> extends Options<O, ClientEvents> {
  protected _dialect: Dialects;
  protected _name: string;
  protected _state: 'CONNECTED' | 'CLOSED' = 'CLOSED';
  protected _encryptionKey!: string;

  declare protected _client: unknown;
  protected _queryTranslator: QueryTranslator;
  protected _longQueryTime: number = 500;
  protected _stats: { total: number; slow: number; time: number } = {
    total: 0,
    slow: 0,
    time: 0,
  };

  constructor(name: string, config: NonNullable<O> | O) {
    super(config);
    this._name = name.trim();
    this._dialect = config.dialect;
    if (this._hasOption('encryptionKey')) {
      this._encryptionKey = this._getOption('encryptionKey') as string;
    }
    if (
      this._hasOption('longQueryWarningTime') &&
      this._getOption('longQueryWarningTime') as number > 0
    ) {
      this._longQueryTime = this._getOption('longQueryWarningTime') as number;
    }
    this._queryTranslator = new QueryTranslator(this._dialect);
  }

  get name(): string {
    return this._name;
  }

  get status(): 'CONNECTED' | 'CLOSED' {
    return this._state;
  }

  get dialect(): Dialects {
    return this._dialect;
  }

  get encryptionKey(): string | undefined {
    return this._encryptionKey;
  }

  get dbStats(): {
    pool: { size: number; available: number; inUse: number };
    total: number;
    slow: number;
    time: number;
  } {
    return {
      pool: this.poolInfo,
      total: this._stats.total,
      slow: this._stats.slow,
      time: this._stats.time,
    };
  }

  abstract get poolInfo(): { size: number; available: number; inUse: number };

  public async connect(): Promise<void> {
    try {
      if (this._state === 'CLOSED') {
        await this._connect();
        // Test if it is actually connected
        this._state = 'CONNECTED';
      }
    } catch (e) {
      this._state = 'CLOSED';
      // console.log(e);
      // Handle all errors
      throw new ConnectionError((e as Error).message, this.name, this.dialect);
    }
  }

  public async disconnect(): Promise<void> {
    try {
      if (this._state === 'CONNECTED') {
        await this._disconnect();
        this._state = 'CLOSED';
      }
    } catch (_e) {
      // Nothing to do
    }
  }

  public async ping(): Promise<boolean> {
    try {
      await this.connect();
      return this._ping();
    } catch (_e) {
      console.log(`-----------------PING ERROR: ${_e}`);
      return false;
    }
  }

  public async query<
    Entity extends Record<string, unknown> = Record<string, unknown>,
  >(sql: QueryOption<Entity>): Promise<QueryResult<Entity>> {
    const retVal: QueryResult<Entity> = {
      type: sql.type,
      time: 0,
      count: 0,
    };
    let err: NormError | undefined;
    try {
      await this.connect();
      const start = performance.now();
      // Ensure projection has same column names as columns
      if (sql.type === QueryTypes.INSERT) {
        if ((sql as InsertQuery<Entity>).data.length === 0) {
          throw new QueryError(
            'No data to insert',
            sql,
            this.name,
            this.dialect,
          );
        }
      } else if (sql.type === QueryTypes.UPDATE) {
        if ((sql as UpdateQuery<Entity>).data.length === 0) {
          throw new QueryError(
            'No data to update',
            sql,
            this.name,
            this.dialect,
          );
        }
      }
      // console.log(sql);
      const result = await this._query(sql);
      if (result) {
        // console.log(result);
        retVal.type = result.type;
        retVal.data = result.data;
        retVal.count = result.count || 0;
      }
      retVal.time = performance.now() - start;
      if (retVal.time > this._longQueryTime) {
        this.emit(
          'longQuery',
          this.name,
          sql,
          retVal.time,
          retVal.data?.length || 0,
        );
      }
      // console.log('Done')
      return retVal;
    } catch (e) {
      if (e instanceof NormError) {
        err = e;
      } else {
        err = new QueryError(
          (e as Error).message,
          sql,
          this.name,
          this.dialect,
        );
      }
      throw err;
    } finally {
      this._stats.total++;
      if (retVal.time > this._longQueryTime) {
        this._stats.slow++;
      }
      // Calculate average time
      this._stats.time =
        (this._stats.time * (this._stats.total - 1) + retVal.time) /
        this._stats.total;
      this.emit(
        'query',
        this.name,
        sql,
        retVal.data?.length || 0,
        retVal.time,
        err,
      );
    }
  }

  public async select<
    Entity extends Record<string, unknown> = Record<string, unknown>,
  >(sql: SelectQuery<Entity>): Promise<QueryResult<Entity>> {
    const retVal = await this.query<Entity>(sql);
    return retVal;
  }

  public async count<
    Entity extends Record<string, unknown> = Record<string, unknown>,
  >(sql: CountQuery<Entity>): Promise<QueryResult<Entity>> {
    const retVal = await this.query<Entity>(sql);
    return retVal;
  }

  public async insert<
    Entity extends Record<string, unknown> = Record<string, unknown>,
  >(sql: InsertQuery<Entity>): Promise<QueryResult<Entity>> {
    sql.type = QueryTypes.INSERT;
    // pre-checks
    if (sql.data.length === 0) {
      throw new Error('No data to insert');
    }
    return await this.query<Entity>(sql);
  }

  public async update<
    Entity extends Record<string, unknown> = Record<string, unknown>,
  >(sql: UpdateQuery<Entity>): Promise<QueryResult<Entity>> {
    sql.type = QueryTypes.UPDATE;
    // Pre-checks
    if (sql.data.length === 0) {
      throw new Error('No data to Update');
    }
    return await this.query<Entity>(sql);
  }

  public async delete<
    Entity extends Record<string, unknown> = Record<string, unknown>,
  >(sql: DeleteQuery<Entity>): Promise<QueryResult<Entity>> {
    sql.type = QueryTypes.DELETE;
    // Pre-checks
    return await this.query<Entity>(sql);
  }

  public async createSchema(sql: CreateSchemaQuery): Promise<void> {
    sql.type = QueryTypes.CREATE_SCHEMA;
    await this._query(sql);
  }

  public async dropSchema(sql: DropSchemaQuery) {
    sql.type = QueryTypes.DROP_SCHEMA;
    await this._query(sql);
  }

  public async createTable<
    Entity extends Record<string, unknown> = Record<string, unknown>,
  >(sql: CreateTableQuery<Entity>) {
    sql.type = QueryTypes.CREATE_TABLE;
    await this._query(sql);
  }

  public async dropTable(sql: DropTableQuery) {
    sql.type = QueryTypes.DROP_TABLE;
    await this._query(sql);
  }

  public async truncateTable(sql: TruncateTableQuery) {
    sql.type = QueryTypes.TRUNCATE;
    await this._query(sql);
  }

  public generateQuery<
    Entity extends Record<string, unknown> = Record<string, unknown>,
  >(
    sql: QueryOption<Entity>,
  ): string {
    return this._queryTranslator.translate(sql);
  }

  // DB Generators
  public hasGenerator(name: string): boolean {
    return this._queryTranslator.hasGenerator(name);
  }

  public async isDBGenerator(name: keyof typeof Generator): Promise<boolean> {
    const ret = await this._queryTranslator.getGenerator(name),
      match = /^\$\{(.*)\}$/.exec(String(ret));
    return (match && match.length > 0) || false;
  }

  public async getGenerator(
    name: keyof typeof Generator,
  ): Promise<GeneratorOutput> {
    return await this._queryTranslator.getGenerator(name);
  }

  protected _queryType(sql: string): QueryType {
    const regEx = new RegExp(
        /^(CREATE|ALTER|DROP|TRUNCATE|SHOW|SELECT\s+COUNT|SELECT|INSERT|UPDATE|DELETE|DESC|DESCRIBE|EXPLAIN|BEGIN|COMMIT|ROLLBACK)?/i,
      ),
      match = sql.match(regEx);
    let qt: QueryType = 'UNKNOWN';
    if (match && match.length > 0) {
      if (match[0].trim().toUpperCase() === 'SELECT COUNT') {
        qt = 'COUNT';
      } else {
        qt = match[0].trim().toUpperCase() as QueryType;
      }
    }
    return qt;
  }

  // deno-lint-ignore no-explicit-any
  public async encrypt(data: any): Promise<string> {
    return await AbstractClient.encryptValue(data, this._encryptionKey);
  }

  public async decrypt<T = string | number | bigint | boolean | Date>(
    data: string,
  ): Promise<T> {
    return await AbstractClient.decryptValue(data, this._encryptionKey);
  }

  // deno-lint-ignore no-explicit-any
  public async hash(data: any): Promise<string> {
    return await AbstractClient.hashValue(data);
  }

  // deno-lint-ignore no-explicit-any
  public static async encryptValue(data: any, key: string): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(16)),
      encoder = new TextEncoder(),
      encoded = encoder.encode(JSON.stringify(data)),
      cryptKey = await crypto.subtle.importKey(
        'raw',
        encoder.encode(key),
        'AES-CBC',
        false,
        ['encrypt'],
      ),
      ecncrypted = await crypto.subtle.encrypt(
        { name: 'AES-CBC', iv },
        cryptKey,
        encoded,
      );

    return base64.encode(new Uint8Array(ecncrypted)) + ':' + base64.encode(iv);
  }

  public static async decryptValue(data: string, key: string) {
    const [encrypted, iv] = data.split(':').map((d) => base64.decode(d)),
      decoder = new TextDecoder(),
      encoder = new TextEncoder(),
      cryptKey = await crypto.subtle.importKey(
        'raw',
        encoder.encode(key),
        'AES-CBC',
        false,
        ['decrypt'],
      ),
      decrypted = await crypto.subtle.decrypt(
        { name: 'AES-CBC', iv },
        cryptKey,
        encrypted,
      );

    return JSON.parse(decoder.decode(decrypted));
  }

  public static async hashValue(data: unknown): Promise<string> {
    if (typeof data === 'string' && data.startsWith('HASH:')) {
      return data;
    }
    const encoder = new TextEncoder(),
      encoded = encoder.encode(JSON.stringify(data)),
      hashAlgo = 'SHA-256',
      hash = await crypto.subtle.digest(hashAlgo, encoded);
    // return new TextDecoder().decode(hexEncode(new Uint8Array(hash)));
    // return base64.encode(new Uint8Array(hash));
    return `HASH:${base64.encode(new Uint8Array(hash))}`;
  }

  //#region Abstract Methods
  protected abstract _connect(): Promise<void>;
  protected abstract _disconnect(): Promise<void>;
  protected abstract _ping(): Promise<boolean>;
  protected abstract _query<
    Entity extends Record<string, unknown> = Record<string, unknown>,
  >(
    query: QueryOption<Entity>,
  ): Promise<{ type: QueryType; data?: Entity[]; count?: number }>;
  //#endregion Abstract Methods
}
