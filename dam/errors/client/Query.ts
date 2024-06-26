import { DAMClientError } from './Client.ts';
import type { Query } from '../../types/mod.ts';

export class DAMClientQueryError extends DAMClientError {
  declare meta: {
    dialect: string;
    configName: string;
    query: Query;
    errorCode?: string;
  };
  constructor(
    meta: {
      dialect: string;
      configName: string;
      query: Query;
      errorCode?: string;
    },
    cause?: Error,
  ) {
    super('Error running sql query', meta, cause);
  }

  get sql(): string {
    return this.meta.query.sql;
  }

  get params(): Record<string, unknown> | undefined {
    return this.meta.query.params;
  }

  get errorCode(): string | undefined {
    return this.meta.errorCode;
  }
}
