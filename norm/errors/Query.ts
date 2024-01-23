import { NormBaseError } from './Base.ts';
import type { NormBaseErrorMetaTags } from './Base.ts';

export class NormQueryError extends NormBaseError {
  public name = 'NormQueryError';
  protected _query: { sql: string; params?: Record<string, unknown> };
  constructor(
    message: string,
    query: { sql: string; params?: Record<string, unknown> },
    metaTags: NormBaseErrorMetaTags & { code?: string },
  ) {
    metaTags.code = metaTags.code ?? 'N/A';
    // Message needs to be updated correctly
    message = `${message}\n[query] ${query.sql}\n[params] ${
      JSON.stringify(query.params)
    }]`;
    super(message, metaTags);
    this._query = query;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  get query(): { sql: string; params?: Record<string, unknown> } {
    return this._query;
  }

  get sql(): string {
    return this._query.sql;
  }

  get params(): Record<string, unknown> | undefined {
    return this._query.params;
  }
}
