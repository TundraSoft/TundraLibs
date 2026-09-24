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
 * - `STREAM` — a `ReadableStream<Uint8Array>` sent without buffering, for a
 *   body too large to hold in memory. The stream is consumed ONCE, so such a
 *   request can never be replayed; `Content-Type` defaults to
 *   `application/octet-stream`. Requires `duplex: 'half'` on Node, which
 *   RESTler sets for you.
 */
export type RESTlerContentType =
  | 'JSON'
  | 'XML'
  | 'FORM'
  | 'TEXT'
  | 'BLOB'
  | 'STREAM';
