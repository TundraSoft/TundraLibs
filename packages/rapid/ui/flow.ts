/**
 * @fileoverview `when` / `each` — the two control-flow helpers for
 * templates. Expression-form branching (`cond && html\`…\``) has one
 * trap: a falsy-but-renderable value (`0`, `''`) leaks into the markup
 * as text. `when` branches on truthiness and renders NOTHING otherwise;
 * `each` maps a list to rows with the empty state as a first-class
 * argument.
 *
 * @module
 */

import { type Html, html } from './html.ts';

const EMPTY: Html = html``;

/**
 * `then(value)` when `value` is truthy, else `otherwise()` (or nothing).
 * Branches are callbacks, so only the taken one is evaluated, and `then`
 * receives the narrowed value — `when(user, (u) => …)` needs no `!`.
 * Unlike `value && html\`…\``, a `0` or `''` never renders.
 *
 * @example
 * ```ts
 * import { html, render, when } from '@tundralibs/rapid/ui';
 *
 * const count = 0;
 * render(html`<p>${when(count, (n) => html`<b>${n}</b>`, () => html`none`)}</p>`);
 * // '<p>none</p>' — `count && html\`…\`` would have rendered '0'
 * ```
 */
export function when<T>(
  value: T,
  then: (value: Exclude<T, false | 0 | 0n | '' | null | undefined>) => Html,
  otherwise?: () => Html,
): Html {
  return value
    ? then(value as Exclude<T, false | 0 | 0n | '' | null | undefined>)
    : (otherwise?.() ?? EMPTY);
}

/**
 * One `row(item, index)` per item, joined; `empty()` (or nothing) for an
 * empty list — the empty state as an argument instead of a `length ?`
 * ternary wrapped around a `.map`. Any iterable works.
 *
 * @example
 * ```ts
 * import { each, html, render } from '@tundralibs/rapid/ui';
 *
 * render(html`<ul>${each(['a<b'], (t) => html`<li>${t}</li>`)}</ul>`);
 * // '<ul><li>a&lt;b</li></ul>'
 * render(each([], () => html`<li></li>`, () => html`<p>No items</p>`));
 * // '<p>No items</p>'
 * ```
 */
export function each<T>(
  items: Iterable<T>,
  row: (item: T, index: number) => Html,
  empty?: () => Html,
): Html {
  const rows: Html[] = [];
  let index = 0;
  for (const item of items) rows.push(row(item, index++));
  if (rows.length === 0) return empty?.() ?? EMPTY;
  return html`${rows}`;
}
