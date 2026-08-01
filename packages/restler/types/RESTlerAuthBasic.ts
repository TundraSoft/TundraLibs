/**
 * @fileoverview Credentials for HTTP Basic authentication.
 *
 * @module
 */

/**
 * Credentials for HTTP Basic authentication
 *
 * The base class base64-encodes `username:password` into an
 * `Authorization: Basic ...` header.
 */
export type RESTlerAuthBasic = {
  username: string;
  password: string;
};
