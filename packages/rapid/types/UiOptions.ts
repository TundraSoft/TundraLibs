/**
 * @fileoverview {@link RapidUiOptions} — the `app.ui()` configuration:
 * app-wide layout/`prefer` defaults, the view projection, the HTML error
 * template, and where the client runtime is served.
 *
 * @module
 */

import type { Html } from '../ui/html.ts';
import type { RapidContext } from './Context.ts';
import type { RapidTemplate } from './Template.ts';

/** Options for `app.ui()` — every field optional. */
export type RapidUiOptions = {
  /** App-default page layout; a route's or `@Module`'s own wins. */
  layout?: RapidTemplate<{ body: Html; title?: string }>;
  /**
   * App-wide `prefer` default for templated routes (`'json'` when never
   * set); a route's own `prefer` wins. Set `'html'` in a pages-first app
   * so routes need no annotation; an API route inside it overrides back.
   */
  prefer?: 'json' | 'html';
  /**
   * The OPT-IN identity projection: whatever this returns is merged over
   * the default view bag (`requestId`/`path`/`query`/`csrfToken?`) and
   * handed frozen to every template. Without it, NOTHING from `ctx.auth`
   * is reachable from templates — name exactly the fields that may
   * cross.
   */
  view?: (ctx: RapidContext) => Record<string, unknown> | undefined;
  /**
   * HTML error page/fragment — receives the SAME disclosure payload the
   * JSON envelope carries (PRODUCTION collapses 5xx, never `debug`) plus
   * `requestId`. Rendered only when the representation resolves to HTML
   * (a swap, or a route/app `prefer` of `'html'`); otherwise the JSON
   * envelope is sent as always.
   */
  errorTemplate?: RapidTemplate<Record<string, unknown>>;
  /**
   * Where the client runtime is served. @default '/__rapid/ui.js'
   */
  runtimePath?: string;
  /**
   * Serve the OPT-IN live bridge at `/__rapid/live.js` — `rapid.live.
   * connect(channels)` over the app's `/ws` socket, dispatching
   * `rapid:push` / `rapid:live` DOM events (see `UI_LIVE`). Declare the
   * channels server-side with `app.channel()`. @default false
   */
  live?: boolean;
  /**
   * The cookie the view bag's `csrfToken` is read from — set this when
   * `csrf()` was configured with a renamed cookie, or the bag's token
   * is silently empty. @default 'csrf'
   */
  csrfCookie?: string;
  /**
   * The request header whose PRESENCE selects the fragment
   * representation. Renaming it lets another client drive the same
   * routes — htmx: `swapHeader: 'hx-request'` (with `swapUnless` below).
   * The bundled runtime follows a rename via `data-swap-header` on
   * `<body>`. @default 'rapid-swap'
   */
  swapHeader?: string;
  /**
   * Header names whose presence CANCELS the swap even when
   * `swapHeader` is present — for clients that send their marker on
   * full-page navigations too. htmx: `['hx-boosted',
   * 'hx-history-restore-request']` (boosted / history-restore requests
   * expect the PAGE, not a fragment). All names join `Vary`.
   * @default []
   */
  swapUnless?: readonly string[];
  /**
   * The response header carrying the swap-side redirect target (D8).
   * htmx honours its own `redirectHeader: 'HX-Redirect'` natively; the
   * bundled runtime follows a rename via `data-redirect-header` on
   * `<body>`. @default 'rapid-redirect'
   */
  redirectHeader?: string;
};
