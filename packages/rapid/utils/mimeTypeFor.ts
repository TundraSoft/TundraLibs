/**
 * @fileoverview `mimeTypeFor` — a minimal, dependency-free extension →
 * content-type map for serving files. Covers the common web types; falls
 * back to `application/octet-stream`. The comprehensive resolver (reusing
 * `@std/media-types` cross-runtime) is a separate ROADMAP item — this is
 * the small built-in that unblocks `HTTPContext.file()`.
 *
 * @module
 */

/** extension (no dot, lowercased) → content-type. */
const MIME_TYPES: Readonly<Record<string, string>> = {
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8',
  map: 'application/json; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  xml: 'application/xml; charset=utf-8',
  webmanifest: 'application/manifest+json',
  wasm: 'application/wasm',
  pdf: 'application/pdf',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  ico: 'image/x-icon',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
};

/**
 * The content-type for a file path/name, by its extension. Unknown or
 * extension-less names get `application/octet-stream`.
 */
export const mimeTypeFor = (path: string): string => {
  const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  const name = slash < 0 ? path : path.slice(slash + 1);
  const dot = name.lastIndexOf('.');
  const ext = dot <= 0 ? '' : name.slice(dot + 1).toLowerCase();
  return MIME_TYPES[ext] ?? 'application/octet-stream';
};
