import { BaseError } from './BaseError.ts';

export class TundraLibError extends BaseError {
  declare public readonly library: string;

  constructor(
    message: string,
    meta: Record<string, unknown> = {},
    cause?: Error | undefined,
  ) {
    super(message, meta, cause);
  }

  toString(): string {
    return `${this.timeStamp.toISOString()} [${this.library}: ${this.name}] ${this.message}`;
  }
}

// import { BaseError } from './BaseError.ts';

// export type TundraLibErrorMetaTags =
//   & { library: string }
//   & Record<string, unknown>;

// /**
//  * BaseError class for creating custom errors with additional metadata.
//  */
// export class TundraLibError extends BaseError {
//   /**
//    * Creates a new instance of BaseError.
//    *
//    * @param message - The error message.
//    * @param meta - Optional metadata tags associated with the error.
//    */
//   constructor(
//     message: string,
//     meta: TundraLibErrorMetaTags,
//   ) {
//     super(message, meta);
//     Object.setPrototypeOf(this, new.target.prototype);
//   }

//   /**
//    * Gets the library name.
//    *
//    * @returns The library name.
//    */
//   get library(): string {
//     return this.getMeta('library') as string || 'N/A';
//   }
// }

// // Path: utils/TundraLibError.ts
