import { OptionKeys } from '../../options/mod.ts';
import { AbstractClient } from '../AbstractConnection.ts';
import type { MariaConnectionOptions, NormEvents } from '../types/mod.ts';

export class MariaClient extends AbstractClient<MariaConnectionOptions> {
  constructor(
    name: string,
    options: OptionKeys<MariaConnectionOptions, NormEvents>,
    defaults: Partial<MariaConnectionOptions>,
  ) {
    super(name, options, defaults);
  }

  protected async _connect(): Promise<void> {
    throw new Error('Method not implemented.');
  }

  protected async _close(): Promise<void> {
    throw new Error('Method not implemented.');
  }

  protected async _execute(sql: string): Promise<void> {
    throw new Error('Method not implemented.');
  }

  protected async _query<
    R extends Record<string, unknown> = Record<string, unknown>,
  >(query: string): Promise<R[]> {
    throw new Error('Method not implemented.');
  }
}
