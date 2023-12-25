import { base64, openpgp } from '../dependencies.ts';

import { Options } from '../options/mod.ts';
import type { OptionKeys } from '../options/mod.ts';

import type {
  ConnectionOptions,
  ConnectionStatus,
  Dialects,
  NormEvents,
  QueryExecute,
  QueryResults,
  QueryTypes,
} from './types/mod.ts';
import {
  NormBaseError,
  NormConfigError,
  NormQueryError,
} from './errors/mod.ts';

export abstract class AbstractClient<O extends ConnectionOptions>
  extends Options<O, NormEvents> {
  protected _name: string;
  protected _status: ConnectionStatus = 'PENDING';

  constructor(
    name: string,
    options: OptionKeys<O, NormEvents>,
    defaults?: Partial<O>,
  ) {
    if (
      options.dialect === undefined ||
      !['POSTGRES', 'MONGO', 'MARIA', 'SQLITE'].includes(options.dialect)
    ) {
      throw new NormConfigError('Missing or invalid value for dialect', {
        name: name,
        target: 'dialect',
        value: options.dialect || 'N/A',
      });
    }
    // Anyother config validation

    super(options, defaults);
    this._name = name;
  }

  get name(): string {
    return this._name;
  }

  get dialect(): Dialects {
    return this._getOption('dialect') as Dialects;
  }

  get status(): ConnectionStatus {
    return this._status;
  }

  //#region Connection
  public async connect(): Promise<void> {
    if (this.status === 'CONNECTED') {
      return;
    }
    try {
      await this._connect();
      this._status = 'CONNECTED';
      this.emit('connect', this.name, this.dialect);
    } catch (err) {
      this._status = 'ERROR';

      if (!(err instanceof NormBaseError)) {
        // Create instance of NORM error
      }
      this.emit('error', this.name, this.dialect, err);
    }
  }

  public async close(): Promise<void> {
    if (this.status !== 'CONNECTED') {
      return;
    }
    try {
      await this._close();
      this._status = 'DISCONNECTED';
      this.emit('close', this.name, this.dialect);
    } catch (err) {
      this._status = 'ERROR';

      if (!(err instanceof NormBaseError)) {
        // Create instance of NORM error
      }
      this.emit('error', this.name, this.dialect, err);
    }
  }
  //#endregion Connection

  //#region Query
  public async query<
    R extends Record<string, unknown> = Record<string, unknown>,
  >(sql: string, params?: Record<string, unknown>): Promise<QueryResults<R>> {
    await this.connect();
    try {
      const st = performance.now();
      const res: QueryResults<R> = {
        time: 0,
        count: 0,
        type: this._detectQuery(sql),
        sql: sql,
        data: await this._query(sql, params),
      };
      const et = performance.now();
      res.count = res.data.length;
      res.time = et - st;
      this.emit('query', this.name, this.dialect, sql);
      return res;
    } catch (err) {
      // Handle error
      let e: NormQueryError;
      if (err instanceof NormQueryError) {
        e = err;
      } else {
        e = new NormQueryError(err.message, {
          name: this.name,
          dialect: this.dialect,
          sql: sql,
        });
      }
      this.emit('error', this.name, this.dialect, e, sql);
      throw e;
    }
  }

  public async execute(
    sql: string,
    params?: Record<string, unknown>,
  ): Promise<QueryExecute> {
    await this.connect();
    try {
      const st = performance.now();
      const res: QueryExecute = {
        time: 0,
        type: this._detectQuery(sql),
        sql: sql,
      };
      await this._execute(sql, params);
      const et = performance.now();
      res.time = et - st;
      this.emit('query', this.name, this.dialect, sql);
      return res;
    } catch (err) {
      // Handle error
      let e: NormQueryError;
      if (err instanceof NormQueryError) {
        e = err;
      } else {
        e = new NormQueryError(err.message, {
          name: this.name,
          dialect: this.dialect,
          sql: sql,
        });
      }
      this.emit('error', this.name, this.dialect, e, sql);
      throw e;
    }
  }
  //#endregion Query
  //#region Helper functions
  public encrypt(data: unknown): Promise<string> {
    if (this._getOption('encryptionKey') === undefined) {
      throw new NormConfigError('Missing encryption key for encryption', {
        name: this.name, 
        target: 'encryptionKey',
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
      throw new NormConfigError('Missing encryption key for decryption', {
        name: this.name, 
        target: 'encryptionKey',
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
  //#endregion Helper functions

  //#region Protected Methods
  protected _detectQuery(sql: string): QueryTypes {
    // const regex = /^(SELECT|INSERT|UPDATE|DELETE|CREATE\s*TABLE|ALTER\s*TABLE|DROP\s*TABLE|CREATE\s*VIEW|CREATE\s*MATERIALIZED|ALTER\s*VIEW|DROP\s*VIEW|TRUNCATE|BEGIN|COMMIT|ROLLBACK|SAVEPOINT)\s*/i;
    const regex =
      /^(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|BEGIN|COMMIT|ROLLBACK|SAVEPOINT)\s*/i;
    const matchedValue = sql.match(regex)?.[0].trim();
    return matchedValue?.toUpperCase() as QueryTypes;
  }
  //#endregion Protected Methods

  //#region Abstract Methods
  protected abstract _connect(): void | Promise<void>;
  protected abstract _close(): void | Promise<void>;
  protected abstract _query<
    R extends Record<string, unknown> = Record<string, unknown>,
  >(query: string, params?: Record<string, unknown>): R[] | Promise<R[]>;
  protected abstract _execute(
    sql: string,
    params?: Record<string, unknown>,
  ): void | Promise<void>;
  //#endregion Abstract Methods
}
