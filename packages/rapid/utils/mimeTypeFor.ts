/**
 * @fileoverview `mimeTypeFor` — content-type for a file path, by
 * extension, via `@std/media-types` (comprehensive and maintained — no
 * hand-rolled table). Unknown or extension-less names fall back to
 * `application/octet-stream`. Used by `HTTPContext.serve()` and the
 * upload path, so both agree on how a file's type is resolved.
 *
 * @module
 */

import { contentType } from '@std/media-types';

/**
 * The content-type for a file path/name, by its extension (charset
 * included for text types, e.g. `text/html; charset=UTF-8`). Unknown or
 * extension-less names get `application/octet-stream`.
 */
export const mimeTypeFor = (path: string): string => {
  const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  const name = slash < 0 ? path : path.slice(slash + 1);
  const dot = name.lastIndexOf('.');
  // A leading-dot name (`.env`) is a dotfile, not an extension.
  const ext = dot <= 0 ? '' : name.slice(dot).toLowerCase();
  return (ext ? contentType(ext) : undefined) ?? 'application/octet-stream';
};
