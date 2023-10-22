import { NormBaseError } from './BaseError.ts';

export class NormConnectionError extends NormBaseError {
  constructor(message: string, metaTags: { name: string; dialect: string }) {
    super(message, metaTags);
    Object.setPrototypeOf(this, NormConnectionError.prototype);
  }
}

export class NormClientInvalidHost extends NormBaseError {
  constructor(metaTags: { name: string; dialect: string }) {
    const message =
      'Could not establish connection to the host. Check hostname and port.';
    super(message, metaTags);
    Object.setPrototypeOf(this, NormClientInvalidHost.prototype);
  }
}

export class NormClientIncorrectPassword extends NormBaseError {
  constructor(metaTags: { name: string; dialect: string }) {
    const message =
      'Could not authenticate connection to database due to incorrect password. Check username and password.';
    super(message, metaTags);
    Object.setPrototypeOf(this, NormClientIncorrectPassword.prototype);
  }
}

export class NormClientDatabaseNotFound extends NormBaseError {
  constructor(metaTags: { name: string; dialect: string }) {
    const message =
      'Could not find the database specified. Check default database or database name.';
    super(message, metaTags);
    Object.setPrototypeOf(this, NormClientDatabaseNotFound.prototype);
  }
}

export class NormClientQueryError extends NormBaseError {
  constructor(
    sqlErr: string,
    metaTags: { name: string; dialect: string; sql: string },
  ) {
    const message = `There was an error running the query: ${sqlErr}`;
    super(message, metaTags);
    Object.setPrototypeOf(this, NormClientQueryError.prototype);
  }
}

export class NormClientMissingEncryptionKey extends NormBaseError {
  constructor(metaTags: { name: string; dialect: string }) {
    const message =
      'Encryption key is not present! Cannot perform encryption/decryption.';
    super(message, metaTags);
    Object.setPrototypeOf(this, NormClientMissingEncryptionKey.prototype);
  }
}
