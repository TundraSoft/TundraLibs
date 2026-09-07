/**
 * @fileoverview {@link RapidApplicationUploadOptions} — upload handling configuration group.
 *
 * @module
 */

/**
 * Upload handling configuration. Defaults are filled by the rAPId
 * constructor — the group is ALWAYS present at runtime.
 */
export type RapidApplicationUploadOptions = {
  /**
   * Where uploaded files land - defaults to a temp dir (created by the
   * rAPId constructor when absent — always present at runtime).
   */
  path?: string;
  /**
   * Per-file size cap in bytes. A multipart REQUEST is read up to
   * `max(server.maxBodySize, maxSize)` in total when uploads are accepted
   * (`allowedExtensions` non-empty), else only `server.maxBodySize`.
   * @default 10485760 (10 MB)
   */
  maxSize?: number;
  /**
   * Maximum file parts one multipart request may carry — each accepted
   * part is written to disk before the handler runs, so this bounds the
   * per-request write work an unauthenticated client can cause.
   * @default 20
   */
  maxFiles?: number;
  /**
   * Allowed file extensions (lowercase, dot-prefixed). FAIL-SAFE
   * default: `[]` — every upload is rejected until the app declares
   * what it accepts.
   * @default []
   */
  allowedExtensions?: string[];
};
