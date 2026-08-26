/**
 * @fileoverview {@link RapidRouteTemplate} — a route's normalized template
 * configuration, stored on the route entry and read by the representer.
 *
 * @module
 */

import type { Html } from '../ui/html.ts';
import type { RapidTemplate } from './Template.ts';

/**
 * A route's template configuration — the object form of the `template`
 * route option, and the normalized shape stored on `RapidRouteEntry`
 * (a bare `RapidTemplate` option normalizes to `{ render }`).
 */
export type RapidRouteTemplate = {
  /** The fragment template — renders the handler's `content`. */
  readonly render: RapidTemplate<unknown>;
  /**
   * Page layout wrapped around the fragment on a non-swap HTML page
   * (never on a fragment). Resolution when absent here: the owning
   * `@Module`'s `layout`, then `app.ui({ layout })`, then none (the
   * fragment is served as the page).
   */
  readonly layout?: RapidTemplate<{ body: Html; title?: string }>;
  /**
   * The page `title` handed to the layout (its `{ body, title? }`
   * data) on a non-swap page — a string, or a function of the
   * handler's `content` for data-driven titles. Absent → the layout's
   * `title` is `undefined` (render your default there).
   */
  readonly title?: string | ((data: unknown) => string);
  /**
   * What a NON-swap request gets: `'json'` (default) sends the reply
   * unchanged — an API-first route that also renders fragments;
   * `'html'` sends the layout-wrapped page — the route IS a page.
   * A `rapid-swap` request always gets the fragment regardless.
   */
  readonly prefer?: 'json' | 'html';
};
