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
   * MODULE-tier page layout wrapped around the fragment on a non-swap
   * HTML page (never on a fragment), nesting inside the app `core` when
   * one is configured. Resolution when absent here: the owning
   * `@Module`'s `layout`, then the app-default `layout`, then none
   * (the fragment goes straight into the core). `false` opts out of the
   * whole tier — "straight into the core" — even when a module/app
   * default exists (the print/embed page inside a chrome-heavy module).
   */
  readonly layout?: RapidTemplate<{ body: Html; title?: string }> | false;
  /**
   * The page `title` on a non-swap page — a string, or a function of
   * the handler's `content` for data-driven titles. Handed to BOTH
   * wrapper tiers (the core renders `<title>`; the module layout may
   * show it as a heading — either may ignore it), and stamped
   * URI-encoded as the `rapid-title` response header on swap replies so
   * the history module can sync `document.title`.
   */
  readonly title?: string | ((data: unknown) => string);
  /**
   * Per-page `<head>` metadata on a non-swap page — a record (or a
   * function of the handler's `content`) of `description`, `og:*`,
   * `canonical`, … — handed to the CORE only (`htmlDocument` renders
   * it). Without a core it has nowhere to land and is ignored.
   */
  readonly meta?:
    | Readonly<Record<string, string>>
    | ((data: unknown) => Readonly<Record<string, string>>);
  /**
   * What a NON-swap request gets: `'json'` (default) sends the reply
   * unchanged — an API-first route that also renders fragments;
   * `'html'` sends the layout-wrapped page — the route IS a page.
   * A `rapid-swap` request always gets the fragment regardless.
   */
  readonly prefer?: 'json' | 'html';
};
