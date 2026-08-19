/**
 * @fileoverview {@link RapidHTTPRequestBody} — the parsed shape returned by
 * the request-body parser.
 *
 * @module
 */

/** One uploaded file, as it appears under its own form-field key. */
export type RapidUploadedFile = {
  /** The client-supplied filename (UNTRUSTED — never used on disk). */
  name: string;
  /** Absolute path of the temp file written by the parser. */
  path: string;
  /** The client-declared MIME type (untrusted; magic bytes were checked). */
  type: string;
  /** Size in bytes. */
  size: number;
};

/**
 * The parsed request body: a JSON object, form fields, a raw string,
 * or `undefined` for an empty body.
 *
 * Uploaded files appear under THEIR OWN FIELD KEY as a
 * {@link RapidUploadedFile} (or an array of them when the field
 * repeats) — there is no separate `_files` collection. The paths are
 * temp files the context deletes after the response; read them during
 * the invocation or copy them somewhere durable.
 */
export type RapidHTTPRequestBody =
  | Record<string, unknown>
  | string
  | undefined;
