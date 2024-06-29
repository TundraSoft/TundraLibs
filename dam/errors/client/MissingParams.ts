import { DAMClientError } from './Client.ts';
import type { Query } from '../../types/mod.ts';

export class DAMClientMissingParamsError extends DAMClientError {
  declare meta: {
    dialect: string;
    configName: string;
    query: Query;
  };
  constructor(
    public readonly missingParams: string[],
    meta: {
      dialect: string;
      configName: string;
      query: Query;
    },
  ) {
    super(`Missin parameters ${missingParams.join(', ')}`, meta);
  }

  get sql(): string {
    return this.meta.query.sql;
  }

  get params(): Record<string, unknown> | undefined {
    return this.meta.query.params;
  }
}
