/**
 * @fileoverview Shapes a parsed response body can take.
 *
 * @module
 */

/**
 * Shapes a parsed response body can take
 */
export type ResponseBody =
  | Record<string, unknown> // JSON/XML parsed to an object
  | Array<unknown> // JSON/XML parsed to an array (of objects or scalars)
  | string // Text or unparsable content
  | Blob // Binary body read via `responseType: 'BLOB'`
  | ArrayBuffer // Binary body read via `responseType: 'ARRAY_BUFFER'`
  | undefined; // No content
