import { NormConnectionError } from './ConnectionError.ts';
import type { NormErrorMetaTags } from '../BaseError.ts';

export class NormSQLiteWritePermissionError extends NormConnectionError {
  public name = 'NormSQLiteWritePermissionError';

  constructor(metaTags: NormErrorMetaTags) {
    super(`Need write permission to the SQLite DB`, metaTags);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
