import { NormBaseError } from './BaseError.ts';

export class NormConnectionError extends NormBaseError {
  constructor(message: string, metaTags: { name: string; dialect: string }) {
    super(message, metaTags);
    Object.setPrototypeOf(this, NormConnectionError.prototype);
  }
}

export class NormNoEncryptionKey extends NormBaseError {
  constructor(metaTags: { name: string; dialect: string }) {
    const message = 'Encryption key is not present! Cannot perform encryption/decryption.';
    super(message, metaTags);
    Object.setPrototypeOf(this, NormNoEncryptionKey.prototype);
  }
}
