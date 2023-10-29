import type { OptionKeys } from '../../../options/mod.ts';
import { AbstractClient } from '../../AbstractClient.ts';
import { MongoDBClient } from '../../../dependencies.ts';
import type { MongoDBClientConfig } from '../../../dependencies.ts';

import type { ClientEvents, MongoClientOptions } from '../../types/mod.ts';

export class MongoClient extends AbstractClient<MongoClientOptions> {
  constructor(
    name: string,
    options: OptionKeys<MongoClientOptions, ClientEvents>,
  ) {
    const opt = { ...{ port: 5432, ssl: false }, ...options };
    super(name, opt);
  }

  protected _connect(): Promise<void> {
    throw new Error('Method not implemented.');
  }
  protected _disconnect(): Promise<void> {
    throw new Error('Method not implemented.');
  }
  protected _version(): Promise<string> {
    throw new Error('Method not implemented.');
  }
  protected _query<T>(sql: string): Promise<T[]> {
    throw new Error('Method not implemented.');
  }
}
