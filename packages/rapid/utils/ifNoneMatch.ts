/**
 * @fileoverview `ifNoneMatch` — RFC 7232 `If-None-Match` evaluation
 * (weak comparison), shared by `etag()`, static serving, and the served
 * UI scripts so all three answer conditionals identically.
 *
 * @module
 */

/** Strip a weak-validator prefix for RFC 7232 weak comparison. */
const stripWeak = (tag: string): string => tag.trim().replace(/^W\//, '');

/**
 * Whether an `If-None-Match` header covers `etag` — handles `*`, comma
 * lists, and `W/` prefixes on either side (weak comparison).
 */
export const ifNoneMatch = (header: string, etag: string): boolean => {
  if (header.trim() === '*') return true;
  const target = stripWeak(etag);
  return header.split(',').some((t) => stripWeak(t) === target);
};
