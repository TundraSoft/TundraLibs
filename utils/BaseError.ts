export type ErrorMetaTags = Record<string, unknown>;

/**
 * BaseError class for creating custom errors with additional metadata.
 */
export class BaseError extends Error {
  name = 'BaseError';
  /**
   * Creates a new instance of BaseError.
   *
   * @param message - The error message.
   * @param _metaTags - Optional metadata tags associated with the error.
   */
  constructor(
    message: string,
    protected _metaTags?: ErrorMetaTags,
  ) {
    super(BaseError._makeMessage(message, _metaTags));
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /**
   * Gets the metadata tags associated with the error.
   */
  get metaTags(): ErrorMetaTags {
    return this._metaTags ?? {};
  }

  /**
   * Generates the message for the error.
   *
   * @param message - The error message.
   * @param metaTags - Optional metadata tags associated with the error.
   * @static
   */
  protected static _makeMessage(
    message: string,
    metaTags?: ErrorMetaTags,
  ): string {
    const meta = metaTags
      ? Object.entries(metaTags)
        .map(([key, value]) =>
          `${key}=${value !== undefined ? `'${value}'` : `'N/A'`}`
        )
        .join(' ')
      : '';
    return `${(meta.length > 0) ? `[${meta}] ` : ''}${message}`;
  }
}

// Path: utils/BaseError.ts
