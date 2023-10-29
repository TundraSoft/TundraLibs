import type { NormMetaTags } from '../types/mod.ts';
import { NormError } from './NormError.ts';

export class NormQueryError extends NormError {
  protected _sql: string;

  constructor(message: string, sql: string, metaTags: NormMetaTags) {
    // Do not send SQL for security reasons
    super(`Error running query - ${message}`, metaTags);
    this._sql = sql;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  get sql() {
    return this._sql;
  }
}
