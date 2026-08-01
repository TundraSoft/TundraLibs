/**
 * @fileoverview Token for HTTP Bearer authentication.
 *
 * @module
 */

/**
 * Token for HTTP Bearer authentication
 *
 * The base class emits `Authorization: <prefix> <token>`. `prefix` defaults
 * to `"BEARER"` when omitted.
 */
export type RESTlerAuthBearer = {
  token: string;
  prefix?: string;
};
