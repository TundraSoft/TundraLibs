/**
 * @fileoverview {@link RapidUiConfigOptions} — the DATA half of the UI
 * configuration: every field is serializable, so a config-driven app
 * sets them in `Application.yaml` under `ui:` (per replica). The CODE
 * half (templates and functions) is `RapidUiTemplateOptions` — YAML can
 * never name code (see the exporter doctrine).
 *
 * @module
 */

/** The serializable UI options — `ui:` in Application options / YAML. */
export type RapidUiConfigOptions = {
  /**
   * The replica-level UI gate. `false` turns this replica API-only:
   * templated routes serve JSON unconditionally (`prefer` and the swap
   * header are ignored), the client runtime / live bridge / history
   * module routes are not registered, and errors fall back to the
   * JSON envelope. NOTE: with the UI on, a `prefer: 'html'` route's
   * template acts as a de-facto field filter — flipping `enabled` off
   * ships the handler's FULL content as JSON, so handlers must only
   * ever return what may serialize (the representer never filters).
   * @default true
   */
  enabled?: boolean;
  /**
   * Where the client runtime is served. @default '/__rapid/ui.js'
   */
  runtimePath?: string;
  /**
   * Serve the OPT-IN live bridge at `/__rapid/live.js` — `rapid.live.
   * connect(channels)` over the app's `/ws` socket, dispatching
   * `rapid:push` / `rapid:live` DOM events. Declare the channels
   * server-side with `app.channel()`. @default false
   */
  live?: boolean;
  /**
   * Serve the OPT-IN history module at `/__rapid/history.js` —
   * push-state navigation for swaps flagged `data-push` (or
   * `rapid.swap(..., { push: true })`), popstate re-fetch, and
   * `document.title` sync from the `rapid-title` header. @default false
   */
  history?: boolean;
  /**
   * App-wide `prefer` default for templated routes (`'json'` when never
   * set); a route's own `prefer` wins. Set `'html'` in a pages-first app
   * so routes need no annotation; an API route inside it overrides back.
   */
  prefer?: 'json' | 'html';
  /**
   * The cookie the view bag's `csrfToken` is read from — set this when
   * `csrf()` was configured with a renamed cookie. @default 'csrf'
   */
  csrfCookie?: string;
  /**
   * The request header whose PRESENCE selects the fragment
   * representation. Renaming it lets another client drive the same
   * routes — htmx: `swapHeader: 'hx-request'` (with `swapUnless`).
   * The bundled runtime follows a rename via `data-swap-header` on
   * `<body>`. @default 'rapid-swap'
   */
  swapHeader?: string;
  /**
   * Header names whose presence CANCELS the swap even when `swapHeader`
   * is present — for clients that send their marker on full-page
   * navigations too (htmx: `['hx-boosted',
   * 'hx-history-restore-request']`). All names join `Vary`.
   * @default []
   */
  swapUnless?: readonly string[];
  /**
   * The response header carrying the swap-side redirect target. htmx
   * honours its own `redirectHeader: 'HX-Redirect'` natively; the
   * bundled runtime follows a rename via `data-redirect-header` on
   * `<body>`. @default 'rapid-redirect'
   */
  redirectHeader?: string;
};
