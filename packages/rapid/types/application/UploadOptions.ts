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
   * Per-file size cap in bytes.
   * @default 10485760 (10 MB)
   */
  maxSize?: number;
  /**
   * Allowed file extensions (lowercase, dot-prefixed). FAIL-SAFE
   * default: `[]` — every upload is rejected until the app declares
   * what it accepts.
   * @default []
   */
  allowedExtensions?: string[];
};
