import { DAMClientError } from './Client.ts';
import type { Query } from '../../types/mod.ts';

export class DAMClientMissingParamsError extends DAMClientError {
  declare meta: {
    dialect: string;
    configName: string;
    sql: string;
    params?: Record<string, unknown>;
  };
  constructor(
    params: string[],
    meta: {
      dialect: string;
      configName: string;
      query: Query;
    },
  ) {
    super(`Missin parameters ${params.join(', ')}`, meta);
  }

  get sql(): string {
    return this.meta.sql;
  }
}
