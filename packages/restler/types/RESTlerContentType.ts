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
 * - `FORM` — multipart form data (`FormData`)
 * - `TEXT` — `text/plain`
 * - `BLOB` — binary data
 */
export type RESTlerContentType =
  | 'JSON'
  | 'XML'
  | 'FORM'
  | 'TEXT'
  | 'BLOB';
