export class BaseError extends Error {
  public readonly name: string;
  protected readonly _meta: Record<string, unknown>;

  /**
   * BaseError constructor.
   * @param message - The error message.
   * @param meta - Additional metadata for the error.
   */
  constructor(message: string, meta?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
    Object.setPrototypeOf(this, new.target.prototype);
    this._meta = meta || {};
    this.message = this._makeMessage(message, meta);
  }

  /**
   * Gets the meta tags associated with the error.
   * @returns {Record<string, unknown>} The meta tags.
   */
  get metaTags(): Record<string, unknown> {
    return this._meta ?? {};
  }

  /**
   * Retrieves the value associated with the specified key from the metadata object.
   * @param key - The key of the value to retrieve.
   * @returns The value associated with the specified key, or undefined if the key does not exist.
   */
  getMeta(key: string): unknown | undefined {
    return this._meta[key];
  }

  /**
   * Replaces placeholders in the given message with corresponding values from the meta object.
   *
   * @param message - The message string with placeholders.
   * @param meta - An optional object containing values to replace the placeholders.
   * @returns The updated message string with replaced placeholders.
   */
  protected _makeMessage(message: string, meta?: Record<string, unknown>) {
    if (meta) {
      message = message.replace(/\${meta\.([^}]+)}/g, (match, key) => {
        const value = meta[key];
        if (
          typeof value === 'bigint' || typeof value === 'boolean' ||
          typeof value === 'number' || typeof value === 'string'
        ) {
          return value.toString();
        } else if (value instanceof Date) {
          return value.toISOString();
        } else if (typeof value === 'object') {
          return JSON.stringify(value);
        }
        return match;
      });
    }
    return message;
  }
}

// export type ErrorMetaTags = Record<string, unknown>;

// /**
//  * BaseError class for creating custom errors with additional metadata.
//  */
// export class BaseError extends Error {
//   name = 'BaseError';
//   declare protected _metaTags?: ErrorMetaTags;
//   /**
//    * Creates a new instance of BaseError.
//    *
//    * @param message - The error message.
//    * @param _metaTags - Optional metadata tags associated with the error.
//    */
//   constructor(
//     message: string,
//     metaTags?: ErrorMetaTags,
//   ) {
//     super(BaseError._makeMessage(message, metaTags));
//     this._metaTags = metaTags;
//     Object.setPrototypeOf(this, new.target.prototype);
//   }

//   /**
//    * Gets the metadata tags associated with the error.
//    */
//   get metaTags(): ErrorMetaTags {
//     return this._metaTags ?? {};
//   }

//   /**
//    * Generates the message for the error.
//    *
//    * @param message - The error message.
//    * @param metaTags - Optional metadata tags associated with the error.
//    * @static
//    */
//   protected static _makeMessage(
//     message: string,
//     metaTags?: ErrorMetaTags,
//   ): string {
//     const meta = metaTags
//       ? Object.entries(metaTags)
//         .map(([key, value]) =>
//           `${key}=${value !== undefined ? `'${value}'` : `'N/A'`}`
//         )
//         .join(' ')
//       : '';
//     return `${(meta.length > 0) ? `[${meta}] ` : ''}${message}`;
//   }
// }

// // Path: utils/BaseError.ts

// class CustomError extends Error {
//   public readonly name: string;
//   public readonly meta: Record<string, unknown>;

//   constructor(message: string, meta?: Record<string, unknown>) {
//     console.log(message, '~~~~~');
//     super(message);
//     this.name = this.constructor.name;
//     if(Error.captureStackTrace) {
//       Error.captureStackTrace(this, this.constructor);
//     }
//     this.meta = meta || {};
//     this.message = this.makeMessage(message, meta);
//   }

//   protected makeMessage(message: string, meta?: Record<string, unknown>) {
//     const metaString = meta ? Object.entries(meta).map(([key, value]) => `${key}=${value}`).join(' ') : '';
//     return metaString ? `[${metaString}] ${message}` : message;
//   }
// }

// class SubClass extends CustomError {
//   constructor(message: string, meta?: Record<string, unknown>) {
//     super(message, meta);
//   }

//   protected override makeMessage(message: string, _meta?: Record<string, unknown>) {
//     return `[nolib]: ${message}`;
//   }
// }

// try {
//   throw new CustomError('Boo ya', { foo: 'bar' })
// } catch (e) {
//   console.log(e);
//   console.log(e.stack)
// }
