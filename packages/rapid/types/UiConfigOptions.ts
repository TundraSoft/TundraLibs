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
   * The app-level UI gate. `false` means this app never emits HTML —
   * every request is the `'api'` surface: page routes (`prefer:
   * 'html'`) respond 404, API-first templated routes serve JSON
   * (`prefer` and the swap header are ignored), errors are the JSON
   * envelope, static files and the client runtime / live bridge /
   * history module routes are not served. To serve BOTH faces from one
   * app and pick per request by host or path, use `server.api` instead.
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
   * push-state navigation for swaps flagged `data-push` (or via
   * `rapid.history.push(url, target, opts?)`), popstate re-fetch, and
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
