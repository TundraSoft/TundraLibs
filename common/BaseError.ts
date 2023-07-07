export type ErrorMetaTags = {
  [key: string]: string | number | boolean | Date | undefined;
};

export class BaseError extends Error {
  protected _library: string;
  protected _metaTags: ErrorMetaTags | undefined = undefined;

  constructor(message: string, library: string, metaTags?: ErrorMetaTags) {
    super(message);
    this._library = library;
    this._metaTags = metaTags;
    super.message = this._makeMessage(message);
    Object.setPrototypeOf(this, BaseError.prototype);
  }

  protected _makeMessage(message: string): string {
    const meta: string[] = [];
    meta.push(`library='${this._library}'`);
    if (this._metaTags !== undefined) {
      Object.entries(this._metaTags).every(([key, value]) => {
        meta.push(`${key}=${(value === undefined) ? 'N/A' : `'${value}'`}`);
      });
    }
    return `[${meta.join(' ')}] ${message}`;
  }
}

// Path: common/BaseError.ts
