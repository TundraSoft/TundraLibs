import { Options } from '../options/mod.ts';
import type { OptionKeys } from '../options/mod.ts';
import {
  NormBaseError,
  NormClientIncorrectPassword,
  NormClientInvalidHost,
  NormClientMissingEncryptionKey,
  NormClientQueryError,
  NormConnectionError,
} from './errors/mod.ts';
import { base64, openpgp } from '../dependencies.ts';
import { DataTypes } from './types/mod.ts';

import type {
  ClientEvents,
  ClientOptions,
  DeleteQueryOptions,
  InsertQueryOptions,
  QueryFilter,
  QueryResults,
  SelectQueryOptions,
  UpdateQueryOptions,
} from './types/mod.ts';

export abstract class AbstractClient<
  O extends ClientOptions,
> extends Options<O, ClientEvents> {
  protected _name: string;
  protected _status: 'CONNECTED' | 'CLOSED' = 'CLOSED';
  protected _columnQuote = '"';
  protected _valueQuote = '\'';
  declare protected _dataTypeMap: {
    [Property in keyof typeof DataTypes]: string;
  };

  constructor(name: string, config: OptionKeys<O, ClientEvents>) {
    const def: Partial<O> = {
      longQuery: 10,
    } as Partial<O>;
    super(config, def);
    this._name = name.trim().toLowerCase();
  }

  get name(): string {
    return this._name;
  }

  get dialect(): string {
    return this._getOption('dialect') as string;
  }

  get status(): 'CONNECTED' | 'CLOSED' {
    return this._status;
  }

  //#region Connection functions
  public async connect(): Promise<void> {
    try {
      if (this._status === 'CLOSED') {
        await this._connect();
        // Test if it is actually connected
        this._status = 'CONNECTED';
        this.emit('connect', this.name);
      }
    } catch (e) {
      this._status = 'CLOSED';
      if (e instanceof NormBaseError) {
        this.emit('error', this.name, this.dialect, 'Connection', e.message);
        throw e;
      } else {
        this.emit('error', this.name, this.dialect, 'Connection', e.message);
        throw new NormConnectionError(e.message, {
          name: this.name,
          dialect: this.dialect,
        });
      }
    }
  }

  public async close(): Promise<void> {
    try {
      if (this._status === 'CONNECTED') {
        await this._close();
        this._status = 'CLOSED';
        this.emit('close', this.name);
      }
    } catch (_e) {
      this._status = 'CLOSED';
      // Do nothing
    }
  }

  public async ping(): Promise<boolean> {
    try {
      await this.connect();
      return this._ping();
    } catch (e) {
      return false;
    }
  }
  //#endregion Connection functions

  //#region Actual DB Functions
  public async query<
    Entity extends Record<string, unknown> = Record<string, unknown>,
  >(sql: string): Promise<QueryResults<Entity>> {
    try {
      await this.connect();
      // Execute the query
      const res: QueryResults<Entity> = {
        sql: sql,
        time: 0,
        count: 0,
        data: [] as Entity[],
      };
      let slowTimer;
      if (
        this._getOption('longQuery') !== undefined &&
        (this._getOption('longQuery') || 0) > 0
      ) {
        const longQuery = (this._getOption('longQuery') || 0) * 1000;
        console.log(longQuery);
        // slowTimer = setTimeout(this._t }, this._getOption('longQuery'))
        slowTimer = setTimeout(
          this._triggerLongQuery.bind(this, sql),
          longQuery,
        );
      }
      const st = performance.now();
      const result = await this._executeQuery<Entity>(sql);
      const et = performance.now();
      if (slowTimer) {
        clearTimeout(slowTimer);
      }
      res.time = et - st;
      res.count = result.length;
      res.data = result;
      return res;
    } catch (e) {
      if (e instanceof NormBaseError) {
        this.emit('error', this.name, this.dialect, sql, e.message);
        throw e;
      } else {
        this.emit('error', this.name, this.dialect, sql, e.message);
        throw new NormClientQueryError(e.message, {
          name: this.name,
          dialect: this.dialect,
          sql,
        });
      }
    }
  }

  //#region DML
  public async select(): Promise<void> {}

  public insert<
    Entity extends Record<string, unknown> = Record<string, unknown>,
  >(options: InsertQueryOptions): Promise<QueryResults<Entity>> {
    return this.query(this.insertQuery(options));
    // try {
    //   const sql = this.insertQuery(options);
    //   return this.query(sql);
    // } catch (e) {
    //   if (e instanceof NormBaseError) {
    //     this.emit('error', this.name, this.dialect, 'Connection', e.message);
    //     throw e;
    //   } else {
    //     this.emit('error', this.name, this.dialect, 'Connection', e.message);
    //     throw new NormConnectionError(e.message, {
    //       name: this.name,
    //       dialect: this.dialect,
    //     });
    //   }
    // }
  }

  // public insertAsSelect(): Promise<void> {}

  public update<
    Entity extends Record<string, unknown> = Record<string, unknown>,
  >(options: UpdateQueryOptions): Promise<QueryResults<Entity>> {
    return this.query(this.updateQuery(options));
  }

  // public bulkUpdate(): Promise<void> {}

  public delete<
    Entity extends Record<string, unknown> = Record<string, unknown>,
  >(options: UpdateQueryOptions): Promise<QueryResults<Entity>> {
    return this.query(this.deleteQuery(options));
  }
  //#endregion DML

  //#region DDL
  public async createDatabase(name: string): Promise<void> {
    await this.query(this.createDatabaseQuery(name));
  }

  public async dropDatabase(name: string, cascade = true): Promise<void> {
    await this.query(this.dropDatabaseQuery(name, cascade));
  }

  public async createSchema(name: string): Promise<void> {
    await this.query(this.createSchemaQuery(name));
  }

  public async dropSchema(name: string, cascade = true): Promise<void> {
    await this.query(this.dropSchemaQuery(name, cascade));
  }

  public async truncate(table: string, schema?: string): Promise<void> {
    await this.query(this.truncateQuery(table, schema));
  }
  //#endregion DDL

  //#region Query Generators
  // These methods are to be overridden by the dialect if need be

  public createDatabaseQuery(name: string): string {
    return `CREATE DATABASE IF NOT EXISTS ${this._quoteColumn(name)};`;
  }

  public dropDatabaseQuery(name: string, cascade = true): string {
    return `DROP DATABASE IF EXISTS ${this._quoteColumn(name)}${
      cascade === true ? ' CASCADE' : ''
    };`;
  }

  public createSchemaQuery(name: string): string {
    return `CREATE SCHEMA IF NOT EXISTS ${this._quoteColumn(name)};`;
  }

  public dropSchemaQuery(name: string, cascade = true): string {
    return `DROP SCHEMA IF EXISTS ${this._quoteColumn(name)}${
      cascade === true ? ' CASCADE' : ''
    };`;
  }

  // public abstract createTableQuery(name: string, columns: Record<string, unknown>): string;
  // public abstract dropTableQuery(name: string): string;

  public selectQuery(options: SelectQueryOptions): string {
    const columnNames = Object.keys(options.columns),
      tableName = options.schema
        ? this._quoteColumn(options.schema, options.table)
        : this._quoteColumn(options.table),
      limit = options.limit ? ` LIMIT ${options.limit}` : '',
      offset = options.page
          ? ` OFFSET ${(options.page - 1) * (options.limit || 0)}`
          : '', 
      select = columnNames.map((c) =>
        `${this._quoteColumn(options.columns[c])} AS ${this._quoteColumn(c)}`
      ),
      filter = options.filter
        ? ` WHERE ${this._processFilters(options.columns, options.filter)}`
        : '',
      sort = options.sort ? this._processSorting(options.columns, options.sort) : '', 
      group: string[] = [];
      
    return `SELECT ${select} FROM ${tableName}${filter}${sort}${limit}${offset};`;
  }

  public insertQuery(options: InsertQueryOptions): string {
    const columnNames = Object.keys(options.columns),
      tableName = options.schema
        ? this._quoteColumn(options.schema, options.table)
        : this._quoteColumn(options.table),
      returning = columnNames.map((c) =>
        `${this._quoteColumn(options.columns[c])} AS ${this._quoteColumn(c)}`
      ).join(', ');
    let insertData: string[] = [];

    // Loop through data, set null for missing keys
    if (options.values instanceof Array) {
      insertData = options.values.map((v) => {
        const keys = Object.keys(v);
        return columnNames.map((c) => {
          return this._quoteValue(v[c] || undefined);
        }).join(', ');
      });
    } else {
      const t: Record<string, unknown> = options.values;
      insertData.push(
        columnNames.map((c) => {
          return this._quoteValue(t[c] || undefined);
        }).join(', '),
      );
    }
    // Now generate the query
    return `INSERT INTO ${tableName} (${
      Object.values(options.columns).map((c) => this._quoteColumn(c)).join(', ')
    }) VALUES (${insertData.join('), (')}) RETURNING ${returning};`;
  }

  public updateQuery(options: UpdateQueryOptions): string {
    const tableName = options.schema
        ? this._quoteColumn(options.schema, options.table)
        : this._quoteColumn(options.table),
      set = Object.keys(options.values).map((c) =>
        `${this._quoteColumn(options.columns[c])} = ${
          this._quoteValue(options.values[c])
        }`
      ).join(', '),
      filter = options.filter
        ? ` WHERE ${this._processFilters(options.columns, options.filter)}`
        : '',
      returning = Object.keys(options.columns).map((c) =>
        `${this._quoteColumn(options.columns[c])} AS ${this._quoteColumn(c)}`
      ).join(', ');
    return `UPDATE ${tableName} SET ${set}${filter} RETURNING ${returning};`;
  }

  public deleteQuery(options: DeleteQueryOptions): string {
    const tableName = options.schema
        ? this._quoteColumn(options.schema, options.table)
        : this._quoteColumn(options.table),
      filter = options.filter
        ? ` WHERE ${this._processFilters(options.columns, options.filter)}`
        : '';
    return `DELETE FROM ${tableName}}${filter};`;
  }

  public truncateQuery(table: string, schema?: string) {
    const tableName = schema
      ? this._quoteColumn(schema, table)
      : this._quoteColumn(table);
    return `TRUNCATE TABLE ${tableName};`;
  }
  //#endregion Query Generators

  //#endregion Actual DB Functions

  //#region Helper functions
  public encrypt(data: unknown): Promise<string> {
    if (this._getOption('encryptionKey') === undefined) {
      throw new NormClientMissingEncryptionKey({
        name: this.name,
        dialect: this.dialect,
      });
    }
    return AbstractClient.encryptValue(
      data,
      this._getOption('encryptionKey') as string,
    );
  }

  public decrypt(data: string): Promise<string> {
    if (this._getOption('encryptionKey') === undefined) {
      throw new NormClientMissingEncryptionKey({
        name: this.name,
        dialect: this.dialect,
      });
    }
    return AbstractClient.decryptValue(
      data,
      this._getOption('encryptionKey') as string,
    );
  }

  public hash(data: unknown): Promise<string> {
    return AbstractClient.hashValue(data);
  }

  public static async encryptValue(
    data: unknown,
    key: string,
  ): Promise<string> {
    const message = await openpgp.createMessage({
        text: JSON.stringify(data),
      }),
      encryptedBinary = await openpgp.encrypt({
        message,
        passwords: key,
        format: 'binary',
        config: {
          preferredSymmetricAlgorithm: openpgp.enums.symmetric.aes256,
          preferredCompressionAlgorithm: openpgp.enums.compression.zip,
        },
      });
    return base64.encode(encryptedBinary);
  }

  public static async decryptValue(data: string, key: string): Promise<string> {
    const dataBinary = new Uint8Array(base64.decode(data)),
      decrypted = await openpgp.decrypt({
        message: await openpgp.readMessage({ binaryMessage: dataBinary }),
        passwords: key,
      });
    return decrypted.data;
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

  protected _triggerLongQuery(sql: string) {
    const longQuery: number = this._getOption('longQuery') || 0;
    console.log(sql);
    this.emit('slowQuery', this.name, sql, longQuery);
  }

  protected _quoteColumn(...column: string[]): string {
    if (column.length > 1) {
      return column.map((c) => this._quoteColumn(c)).join('.');
    }
    const value = column[0].trim();
    if (value === '*') return value;
    if (value.startsWith('${')) return value.substring(2, value.length - 1);
    return `${this._columnQuote}${value}${this._columnQuote}`;
  }

  protected _quoteValue(value: unknown, forFilter = false): string {
    if (
      typeof value === undefined || value === undefined || value === null ||
      typeof value === null
    ) return 'NULL';
    if (value === true) return 'TRUE';
    if (value === false) return 'FALSE';
    if (typeof value === 'number' || typeof value === 'bigint') {
      return value + '';
    }
    if (value instanceof Date) {
      return `${this._valueQuote}${value.toISOString()}${this._valueQuote}`;
    }
    if (value instanceof Array || Array.isArray(value)) {
      if (forFilter) {
        return '(' + value.map((v) => this._quoteValue(v)).join(',') + ')';
      } else {
        return 'ARRAY [' + value.map((v) => this._quoteValue(v)).join(',') +
          ']';
      }
    }
    if (typeof value === 'object') {
      value = JSON.stringify(value);
    } else {
      value += '';
    }
    // This handles DB Function calls
    // Treat it as string
    const strVal = String(value);
    if (strVal.substr(0, 2) === '${') {
      return strVal.substr(2, strVal.length - 3);
    }
    // Escape quotes already present
    const findRegEx = new RegExp(this._valueQuote, 'g'),
      replace = this._valueQuote + this._valueQuote;
    // return `'${value.replace(/'/g, "''")}'`;
    return `${this._valueQuote}${
      strVal.replace(findRegEx, replace)
    }${this._valueQuote}`;
  }

  public _processSorting(
    columns: Record<string, string>,
    sort: Record<string, 'ASC' | 'DESC'>,
  ): string {
    const retVal: string[] = [];
    for (const [name, mode] of Object.entries(sort)) {
      if (columns[name] !== undefined) {
        retVal.push(`${this._quoteColumn(columns[name])} ${mode}`);
      } else {
        throw new Error('Unknown column specified for sortin');
      }
    }
    return retVal.join(', ');
  }

  protected _processFilters(
    columns: Record<string, string>,
    filter: QueryFilter<Record<string, unknown>> | QueryFilter<
      Record<string, unknown>
    >[],
    joiner = 'AND',
  ): string {
    const ret: Array<string> = [];
    if (Array.isArray(filter)) {
      filter.forEach((value) => {
        ret.push(this._processFilters(columns, value, 'AND'));
      });
    } else if (typeof filter === 'object') {
      // Parse through the object
      for (const [columnName, operation] of Object.entries(filter)) {
        if (columnName === '$and' || columnName === '$or') {
          ret.push(
            this._processFilters(
              columns,
              operation as QueryFilter<Record<string, unknown>>,
              (columnName === '$or') ? 'OR' : 'AND',
            ),
          );
        } else if (!columns[columnName]) {
          // TODO(@abhai2k): Handle this error correctly
          throw new Error(
            `[module=norm] Column ${columnName} is not part of column list for filtering`,
          );
          // throw new QueryError(`Column ${columnName} is not part of column list for filtering`);
        } else {
          // No its a variable
          if (typeof operation === 'object') {
            // Parse the operator
            for (
              const [operator, operatorValue] of Object.entries(
                operation as QueryFilter<Record<string, unknown>>,
              )
            ) {
              // Hack for boolean
              switch (operator) {
                case '$eq':
                  ret.push(
                    `${this._quoteColumn(columns[columnName])} = ${
                      this._quoteValue(operatorValue)
                    }`,
                  );
                  break;
                case '$neq':
                  ret.push(
                    `${this._quoteColumn(columns[columnName])} != ${
                      this._quoteValue(operatorValue)
                    }`,
                  );
                  break;
                case '$in':
                  ret.push(
                    `${this._quoteColumn(columns[columnName])} IN ${
                      this._quoteValue(operatorValue)
                    }`,
                  );
                  break;
                case '$nin':
                  ret.push(
                    `${this._quoteColumn(columns[columnName])} NOT IN ${
                      this._quoteValue(operatorValue)
                    }`,
                  );
                  break;
                case '$lt':
                  ret.push(
                    `${this._quoteColumn(columns[columnName])} < ${
                      this._quoteValue(operatorValue)
                    }`,
                  );
                  break;
                case '$lte':
                  ret.push(
                    `${this._quoteColumn(columns[columnName])} <= ${
                      this._quoteValue(operatorValue)
                    }`,
                  );
                  break;
                case '$gt':
                  ret.push(
                    `${this._quoteColumn(columns[columnName])} > ${
                      this._quoteValue(operatorValue)
                    }`,
                  );
                  break;
                case '$gte':
                  ret.push(
                    `${this._quoteColumn(columns[columnName])} >= ${
                      this._quoteValue(operatorValue)
                    }`,
                  );
                  break;
                // deno-lint-ignore no-case-declarations
                case '$between':
                  const opval = operatorValue as {
                    $from: unknown;
                    $to: unknown;
                  };
                  ret.push(
                    `${this._quoteColumn(columns[columnName])} BETWEEN '${
                      this._quoteValue(opval.$from)
                    }' AND '${this._quoteValue(opval.$to)}'`,
                  );
                  break;
                case '$null':
                  if (operatorValue === true) {
                    ret.push(
                      `${this._quoteColumn(columns[columnName])} IS NULL`,
                    );
                  } else {
                    ret.push(
                      `${this._quoteColumn(columns[columnName])} IS NOT NULL`,
                    );
                  }
                  break;
                case '$like':
                  ret.push(
                    `${this._quoteColumn(columns[columnName])} LIKE ${
                      this._quoteValue(operatorValue)
                    }`,
                  );
                  break;
                case '$nlike':
                  ret.push(
                    `${this._quoteColumn(columns[columnName])} NOT LIKE ${
                      this._quoteValue(operatorValue)
                    }`,
                  );
                  break;
                case '$ilike':
                  ret.push(
                    `${this._quoteColumn(columns[columnName])} ILIKE ${
                      this._quoteValue(operatorValue)
                    }`,
                  );
                  break;
                case '$nilike':
                  ret.push(
                    `${this._quoteColumn(columns[columnName])} NOT ILIKE ${
                      this._quoteValue(operatorValue)
                    }`,
                  );
                  break;
                default:
                  // TODO(@abhinav) - Handle this
                  throw new Error(`Unknown operator ${operator}`);
              }
            }
          } else {
            // No operator means it is equal to
            // @TODO, even this will be an argument.
            ret.push(
              `${this._quoteColumn(columns[columnName])} = ${
                this._quoteValue(operation)
              }`,
            );
          }
        }
      }
    }
    // return "(" + ret.join(` ${joiner} `) + ")";
    // Ensure we have processed a filter
    if (ret.length === 0) {
      return '';
    }
    let retVal = `( `;
    retVal += ret.reduce((prev, curr, index) => {
      if (index === 0) {
        return curr;
      } else {
        prev += ` ${joiner} ` + curr;
        return prev;
      }
    });
    retVal += ` )`;
    return retVal;
  }

  //#endregion Helper functions

  protected abstract _connect(): Promise<void>;
  protected abstract _close(): Promise<void>;
  protected abstract _ping(): Promise<boolean>;
  protected abstract _executeQuery<
    Entity extends Record<string, unknown> = Record<string, unknown>,
  >(sql: string): Promise<Entity[]>;
}
