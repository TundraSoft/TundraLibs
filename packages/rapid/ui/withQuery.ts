/**
 * @fileoverview `withQuery` — build a same-page URL from the view bag's
 * query plus overrides. The pagination/filter primitive: a "Load more"
 * button's next-page URL is `withQuery(view.path, view.query, { page:
 * n + 1 })` rendered into `data-action` — data over code, no runtime
 * involvement.
 *
 * @module
 */

/**
 * `path` + the merge of `base` (typically `view.query`) and `patch`,
 * URL-encoded. A `patch` value of `undefined` REMOVES the key; numbers
 * stringify. Returns just `path` when the merged query is empty. A
 * `path` already carrying `?its=own` query contributes those params as
 * the LOWEST layer (below `base`), never a second literal `?`.
 *
 * @example
 * ```ts
 * import { withQuery } from '@tundralibs/rapid/ui';
 *
 * withQuery('/posts', { tag: 'news', page: '2' }, { page: 3 });
 * // '/posts?tag=news&page=3'
 * withQuery('/posts', { tag: 'news' }, { tag: undefined });
 * // '/posts'
 * ```
 */
export function withQuery(
  path: string,
  base: Readonly<Record<string, string>>,
  patch: Readonly<Record<string, string | number | undefined>> = {},
): string {
  const cut = path.indexOf('?');
  const params = new URLSearchParams(
    cut === -1 ? undefined : path.slice(cut + 1),
  );
  for (const [key, value] of Object.entries(base)) params.set(key, value);
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) params.delete(key);
    else params.set(key, String(value));
  }
  const qs = params.toString();
  const bare = cut === -1 ? path : path.slice(0, cut);
  return qs === '' ? bare : `${bare}?${qs}`;
}
