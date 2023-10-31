import { BaseError } from './BaseError.ts';
import type { ErrorMetaTags } from './BaseError.ts';

export type TundraLibErrorMetaTags = ErrorMetaTags & { library: string };
/**
 * BaseError class for creating custom errors with additional metadata.
 */
export class TundraLibError extends BaseError {
  /**
   * Creates a new instance of BaseError.
   *
   * @param message - The error message.
   * @param _metaTags - Optional metadata tags associated with the error.
   */
  constructor(
    message: string,
    protected _metaTags?: TundraLibErrorMetaTags,
  ) {
    super(BaseError._makeMessage(message, _metaTags));
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /**
   * Gets the library name.
   *
   * @returns The library name.
   */
  get library(): string {
    return this._metaTags?.library ?? 'N/A';
  }
}

// Path: utils/TundraLibError.ts
