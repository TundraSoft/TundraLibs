import type { NormMetaTags } from '../types/mod.ts';
import { NormError } from './NormError.ts';

export class NormNoActiveConnectionError extends NormError {
  constructor(metaTags: NormMetaTags) {
    super(
      `Unable to find any active connections to database! Please ensure connection is established.`,
      metaTags,
    );
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
