/**
 * @fileoverview Supported content-type tokens for request and response bodies.
 *
 * @module
 */

/**
 * Supported content types for RESTler request and response bodies
 *
 * - `JSON` — `application/json`
 * - `XML` — `application/xml`
 * - `FORM` — payload SHAPE decides the wire format: a `FormData` payload
 *   sends `multipart/form-data` (fetch sets the boundary); a
 *   `URLSearchParams` or plain object payload sends
 *   `application/x-www-form-urlencoded` instead.
 * - `TEXT` — `text/plain`
 * - `BLOB` — binary data
 */
export type RESTlerContentType =
  | 'JSON'
  | 'XML'
  | 'FORM'
  | 'TEXT'
  | 'BLOB';
