export type ErrorMetaTags = Record<string, unknown>;

/**
 * BaseError class for creating custom errors with additional metadata.
 */
export class BaseError extends Error {
  /**
   * Creates a new instance of BaseError.
   *
   * @param message - The error message.
   * @param _library - The library name.
   * @param _metaTags - Optional metadata tags associated with the error.
   */
  constructor(
    message: string,
    private _library: string,
    protected _metaTags?: ErrorMetaTags,
  ) {
    super(BaseError._makeMessage(message, _library, _metaTags));
    Object.setPrototypeOf(this, new.target.prototype);
  }

  protected static _makeMessage(
    message: string,
    library: string,
    metaTags?: ErrorMetaTags,
  ): string {
    const meta = metaTags
      ? Object.entries(metaTags)
        .map(([key, value]) =>
          `${key}=${value !== undefined ? `'${value}'` : `'N/A'`}`
        )
        .join(' ')
      : '';
    return `[library='${library}'${
      (meta.length > 0) ? ` ${meta}` : ''
    }] ${message}`;
  }

  /**
   * Gets the library name.
   *
   * @returns The library name.
   */
  get library(): string {
    return this._library;
  }
}

// Path: utils/BaseError.ts
