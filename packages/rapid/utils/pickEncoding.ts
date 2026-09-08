/**
 * @fileoverview `pickEncoding` — `Accept-Encoding` negotiation for the
 * two codings `CompressionStream` offers everywhere (gzip, deflate), per
 * RFC 9110 §12.5.3. Kept beside the other negotiation helpers so it can
 * move to `@tundralibs/compat/http` with `negotiate` when a second
 * consumer appears.
 * @module
 */

/**
 * How `Accept-Encoding` rates one coding: `'yes'` when listed with a
 * non-zero q, `'no'` when listed with `q=0`, `'unlisted'` otherwise. The
 * `q=0` test matches ONLY a true zero (`q=0`, `q=0.0`), not a high
 * priority like `q=0.9` — `(?![.\d])` stops `q=0` matching the `0` prefix.
 */
const rating = (
  accept: string,
  coding: string,
): 'yes' | 'no' | 'unlisted' => {
  const token = coding === '*' ? '\\*' : `\\b${coding}\\b`;
  if (!new RegExp(token).test(accept)) return 'unlisted';
  return new RegExp(`${token}\\s*;\\s*q=0(?:\\.0+)?(?![.\\d])`).test(accept)
    ? 'no'
    : 'yes';
};

/**
 * Pick gzip (preferred) or deflate from an `Accept-Encoding` value, else
 * `null`. A coding named with a non-zero q wins; an unnamed one is
 * acceptable only through a `*` that is not `q=0`.
 */
export function pickEncoding(accept: string): 'gzip' | 'deflate' | null {
  const a = accept.toLowerCase();
  const gzip = rating(a, 'gzip');
  const deflate = rating(a, 'deflate');
  if (gzip === 'yes') return 'gzip';
  if (deflate === 'yes') return 'deflate';
  if (rating(a, '*') !== 'yes') return null;
  if (gzip === 'unlisted') return 'gzip';
  return deflate === 'unlisted' ? 'deflate' : null;
}
