import { Options } from '../options/mod.ts';
import type { OptionKeys } from '../options/mod.ts';
import { NormBaseError, NormConnectionError, NormNoEncryptionKey } from './errors/mod.ts';
import { base64, openpgp } from '../dependencies.ts';

import type { ClientOptions, ClientEvents, QueryResults } from './types/mod.ts';

export abstract class AbstractClient<
  O extends ClientOptions,
> extends Options<O, ClientEvents> {
  protected _name: string;
  protected _status: 'CONNECTED' | 'CLOSED' = 'CLOSED';
  protected _columnQuote = '"';
  protected _valueQuote = "'";

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
      this._status = "CLOSED";
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
  public async query<Entity extends Record<string, unknown> = Record<string, unknown>>(sql: string): Promise<QueryResults<Entity>> {
    try {
      await this.connect();
      // Execute the query
      const res: QueryResults<Entity> = {
          sql: sql, 
          count: 0, 
          data: [] as Entity[]
        };
      let slowTimer;
      if (this._getOption('longQuery') !== undefined && (this._getOption('longQuery') || 0) > 0) {
        const longQuery = (this._getOption('longQuery') || 0) * 1000
        console.log(longQuery)
        // slowTimer = setTimeout(this._t }, this._getOption('longQuery'))
        slowTimer = setTimeout(this._triggerLongQuery.bind(this, sql), longQuery)
      }
      const result = await this._executeQuery<Entity>(sql);
      if(slowTimer) {
        clearTimeout(slowTimer);
      }
      res.count = result.length;
      res.data = result;
      return res;
    } catch(e) {
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

  //#region DML
  public async select(): Promise<void> {}

  public async insert(): Promise<void> {}

  public async bulkInsert(): Promise<void> {}

  public async insertAsSelect(): Promise<void> {}

  public async update(): Promise<void> {}

  public async bulkUpdate(): Promise<void> {}

  public async delete(): Promise<void> {}

  public async truncate(): Promise<void> {}
  //#endregion DML

  //#region DDL
  public async create(): Promise<void> {}

  public async drop(): Promise<void> {}
  //#endregion DDL

  //#endregion Actual DB Functions
  
  //#region Helper functions
  public encrypt(data: unknown): Promise<string> {
    if(this._getOption('encryptionKey') === undefined) throw new NormNoEncryptionKey({ name: this.name, dialect: this.dialect });
    return AbstractClient.encryptValue(data, this._getOption('encryptionKey') as string);
  }

  public decrypt(data: string): Promise<string> {
    if(this._getOption('encryptionKey') === undefined) throw new NormNoEncryptionKey({ name: this.name, dialect: this.dialect });
    return AbstractClient.decryptValue(data, this._getOption('encryptionKey') as string);
  }

  public hash(data: unknown): Promise<string> {
    return AbstractClient.hashValue(data);
  }
  
  public static async encryptValue(data: unknown, key: string): Promise<string> {
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
    const longQuery: number = this._getOption('longQuery') || 0
    console.log(sql);
    this.emit('slowQuery', this.name, sql, longQuery);
  }

  protected _quoteColumn(value: string): string {
    const split = value.split('.');
    return `${this._columnQuote}${
      split.join(this._config.quote.column + '.' + this._config.quote.column)
    }${this._config.quote.column}`;
    return `${this._columnQuote}${value}${this._columnQuote}`
  }

  protected _quoteValue(value: unknown): string {

    return '';
  }
  //#endregion Helper functions

  protected abstract _connect(): Promise<void>;
  protected abstract _close(): Promise<void>;
  protected abstract _ping(): Promise<boolean>;
  protected abstract _executeQuery<Entity extends Record<string, unknown> = Record<string, unknown>>(sql: string): Promise<Entity[]>;
}
