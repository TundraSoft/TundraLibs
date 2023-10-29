import type { NormMetaTags } from '../types/mod.ts';
import { NormError } from './NormError.ts';

export class NormConnectionError extends NormError {
  constructor(message: string, metaTags: NormMetaTags) {
    super(message, metaTags);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}