/**
 * Auth configuration
 * Can be a bearer token (string) or an object with username and password.
 * Used in RESTlerOptions and RESTlerEndpoint.
 *
 * @example
 * // Bearer token
 * const auth: RESTlerAuth = 'my-bearer-token';
 *
 * @example
 * // Basic Auth
 * const auth: RESTlerAuth = {
 *   username: 'my-username',
 *   password: 'my-password'
 * };
 */
export type RESTlerAuth = string | {
  username: string;
  password: string;
};
