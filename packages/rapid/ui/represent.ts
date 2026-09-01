/**
 * @fileoverview The representer — the innermost-onion step that turns a
 * templated route's data reply into HTML when the request asks for it.
 * Two deterministic signals decide (never `Accept`): the `rapid-swap`
 * request header (our client runtime) → the FRAGMENT, always; otherwise
 * the route's `prefer` → JSON unchanged (default) or the layout-wrapped
 * page. (One deliberate exception: `representError` consults `Accept`
 * for UNMATCHED requests when `errorTemplates` are configured — see
 * its doc.) Runs before every middleware's post-`next()` view, so
 * `etag`/`compress`/loggers see the final HTML, not the data object.
 *
 * @module
 */

import { RapidError } from '../errors/mod.ts';
import type { HTTPContext } from '../context/HTTPContext.ts';
import type {
  RapidContextResponse,
  RapidContextState,
  RapidRouteOptions,
  RapidRouteTemplate,
  RapidTemplate,
  RapidView,
} from '../types/mod.ts';
import { escapeRegExp, negotiate } from '../utils/mod.ts';
import { isStreamBody, toReadableStream } from '../utils/streams.ts';
import { type Html, isHtml, render } from './html.ts';
import { DefaultErrorPage } from './errorPage.ts';

/** Structurally a `RapidTemplate` — `{ name: string, render: fn }`. */
export const isTemplate = (value: unknown): value is RapidTemplate<unknown> =>
  typeof value === 'object' && value !== null &&
  typeof (value as { render?: unknown }).render === 'function' &&
  typeof (value as { name?: unknown }).name === 'string';

/**
 * Normalize a route's `template`/`layout` options into the stored
 * {@link RapidRouteTemplate} — mount/registration time, fail-fast: a
 * wrong import or a typo'd shape throws NOW, never at first request.
 *
 * @throws {RapidError} RAPID_CONFIG on a non-template `template`/
 *   `layout`, or a `prefer` outside `'json' | 'html'`.
 */
export function normalizeRouteTemplate(
  template: NonNullable<RapidRouteOptions['template']>,
  layout: RapidRouteOptions['layout'],
  label: string,
): RapidRouteTemplate {
  const bare = isTemplate(template);
  const given = bare ? undefined : template as RapidRouteTemplate;
  const config: RapidRouteTemplate = {
    render: bare ? template as RapidTemplate<unknown> : given!.render,
    // `false` survives ?? — a route's explicit tier-2 opt-out must not
    // be resurrected by the module/app default.
    ...(given?.layout ?? layout) !== undefined
      ? { layout: given?.layout ?? layout }
      : {},
    ...(given?.title !== undefined ? { title: given.title } : {}),
    ...(given?.meta !== undefined ? { meta: given.meta } : {}),
    ...(given?.prefer !== undefined ? { prefer: given.prefer } : {}),
  };
  if (
    config.title !== undefined && typeof config.title !== 'string' &&
    typeof config.title !== 'function'
  ) {
    throw new RapidError('RAPID_CONFIG', {
      message: `route '${label}': title must be a string or (data) => string`,
    });
  }
  if (!isTemplate(config.render)) {
    throw new RapidError('RAPID_CONFIG', {
      message:
        `route '${label}': template is not a RapidTemplate (declare it via template() from @tundralibs/rapid/ui)`,
    });
  }
  if (
    config.layout !== undefined && config.layout !== false &&
    !isTemplate(config.layout)
  ) {
    throw new RapidError('RAPID_CONFIG', {
      message:
        `route '${label}': layout is not a RapidTemplate (or false to opt out)`,
    });
  }
  if (
    config.meta !== undefined && typeof config.meta !== 'function' &&
    (typeof config.meta !== 'object' || config.meta === null)
  ) {
    throw new RapidError('RAPID_CONFIG', {
      message: `route '${label}': meta must be a record or (data) => record`,
    });
  }
  if (
    config.prefer !== undefined && config.prefer !== 'json' &&
    config.prefer !== 'html'
  ) {
    throw new RapidError('RAPID_CONFIG', {
      message:
        `route '${label}': prefer must be 'json' or 'html' (got ${config.prefer})`,
    });
  }
  // FROZEN: this object is shared by every request via ctx.routeTemplate
  // — a handler mutating it must throw, not retarget the route.
  return Object.freeze(config);
}

/**
 * The frozen per-request view bag (D1): `requestId`, `path`, raw `query`
 * (last value wins), and the `csrf` cookie's token when present. Nothing
 * from the auth bag — identity reaches templates only through the
 * `ui.view` projection configured at `Application.initialize`.
 */
export function buildView<S extends RapidContextState>(
  ctx: HTTPContext<S>,
): RapidView {
  const url = new URL(ctx.url);
  const csrfToken = ctx.cookies[ctx.app.uiOptions?.csrfCookie ?? 'csrf'];
  // The opt-in identity projection (`ui.view` at initialize) merges OVER
  // the defaults — its fields, and only its fields, cross from ctx into
  // template reach.
  const extra = ctx.app.uiOptions?.view?.(ctx as never);
  const assets = ctx.app.uiOptions?.assets;
  const app = ctx.app;
  return Object.freeze({
    requestId: ctx.requestId,
    runtimePath: ctx.app.uiOptions?.runtimePath ?? '/__rapid/ui.js',
    // Resolution: the explicit manifest map (bundler/Workers path) wins,
    // then the LAZY content hash from a fingerprint-enabled
    // `server.static` mount, then passthrough — so templates never
    // branch and an unmapped path is simply itself.
    asset: (p: string): string => {
      const version = assets?.[p] ?? app.assetVersion(p);
      return version === undefined ? p : `${p}?v=${version}`;
    },
    path: url.pathname,
    query: Object.freeze(
      Object.fromEntries(url.searchParams),
    ) as Readonly<Record<string, string>>,
    ...(csrfToken !== undefined ? { csrfToken } : {}),
    ...extra,
  });
}

/**
 * Whether this request asked for the FRAGMENT: the swap header is
 * present AND none of the `swapUnless` headers are — the escape needed
 * by clients (htmx) that send their marker on full-page navigations
 * too (`HX-Boosted`, history restores).
 */
export function isSwap<S extends RapidContextState>(
  ctx: HTTPContext<S>,
  appUi: ReturnType<typeof uiOf> = ctx.app.uiOptions,
): boolean {
  if (ctx.headers.get(appUi?.swapHeader ?? 'rapid-swap') === null) {
    return false;
  }
  for (const name of appUi?.swapUnless ?? []) {
    if (ctx.headers.get(name) !== null) return false;
  }
  return true;
}

/** `ctx.app.uiOptions`, typed once (the accessor the helpers share). */
const uiOf = <S extends RapidContextState>(ctx: HTTPContext<S>) =>
  ctx.app.uiOptions;

/** Read one header from a reply's `headers` value (Headers or record). */
const replyHeader = (
  headers: RapidContextResponse['headers'],
  name: string,
): string | null => {
  if (headers === undefined) return null;
  if (headers instanceof Headers) return headers.get(name);
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === name) return value;
  }
  return null;
};

/**
 * Compiled member-tests for {@link mergeVary}, cached by name — the
 * names come from app CONFIG (plus the fixed `Cookie`/`Accept` stamps),
 * so the map is small and bounded; without it every templated request
 * would recompile one RegExp per configured name.
 */
const VARY_NAME_PATTERNS = new Map<string, RegExp>();

/** Merge one name into a `Vary` value (comma-set, case-insensitive). */
const mergeVary = (vary: string | null, name: string): string => {
  if (vary === null) return name;
  let pattern = VARY_NAME_PATTERNS.get(name);
  if (pattern === undefined) {
    pattern = new RegExp(`(^|,)\\s*${escapeRegExp(name)}\\s*(,|$)`, 'i');
    VARY_NAME_PATTERNS.set(name, pattern);
  }
  return pattern.test(vary) ? vary : `${vary}, ${name}`;
};

/**
 * Merge the swap header + every `swapUnless` name into `Vary`, seeded
 * from BOTH the accumulated ctx headers and the reply's own `vary` (the
 * reply's headers are applied AFTER ctx's at finalize, so a handler-set
 * `vary` would otherwise clobber this stamp — the cache-poisoning
 * hazard it exists to prevent). Sets the merged value on ctx and
 * returns it for callers that must also carry it on reply headers.
 */
function stampVary<S extends RapidContextState>(
  ctx: HTTPContext<S>,
  appUi: ReturnType<typeof uiOf>,
  reply?: RapidContextResponse,
): string {
  let vary = replyHeader(reply?.headers, 'vary') ??
    ctx.responseHeaders.get('vary');
  for (
    const name of [
      appUi?.swapHeader ?? 'rapid-swap',
      ...appUi?.swapUnless ?? [],
    ]
  ) {
    vary = mergeVary(vary, name);
  }
  ctx.setHeader('vary', vary!);
  return vary!;
}

/** A template/layout render result must be `Html` — reject loudly. */
function assertHtml(value: unknown, what: string): Html {
  if (!isHtml(value)) {
    throw new RapidError('RAPID_RESPONSE_INVALID', {
      message:
        `${what} returned a non-Html value — build markup with html\`…\` or raw()`,
    });
  }
  return value;
}

/**
 * Run one template's render under the diagnostics wrapper: a throw
 * becomes `RAPID_TEMPLATE_RENDER` carrying the template's name
 * (`details`) and the underlying throw (`debug` — rendered in
 * DEVELOPMENT, always in the server log; PRODUCTION collapses), and a
 * non-`Html` return is rejected. The most common failure in this layer
 * is a data/template mismatch reading `undefined` fields — this is
 * where it surfaces legibly instead of as a bare 500.
 */
function renderChecked<D>(
  tpl: RapidTemplate<D>,
  data: D,
  view: RapidView,
  what: string,
): Html {
  let out: unknown;
  try {
    out = tpl.render(data, view);
  } catch (cause) {
    throw templateRenderError(what, cause, tpl.name);
  }
  return assertHtml(out, what);
}

/** The RAPID_TEMPLATE_RENDER build shared by every render-layer callback. */
function templateRenderError(
  what: string,
  cause: unknown,
  template?: string,
): RapidError {
  const err = cause instanceof Error ? cause : undefined;
  return new RapidError('RAPID_TEMPLATE_RENDER', {
    message: `${what} threw while rendering`,
    ...(template ? { details: { template } } : {}),
    // WHY it threw would otherwise be invisible at every layer: the
    // payload renders code/message/details/debug only, and the
    // transport log spreads context.debug — a cause chained but not
    // copied here reaches neither.
    debug: {
      cause: err?.message ?? String(cause),
      ...(err?.stack !== undefined ? { stack: err.stack } : {}),
    },
    cause: err,
  });
}

/**
 * Run a route's `title`/`meta` CALLBACK under the same diagnostics as a
 * template render — these run in the render layer and a throw would
 * otherwise escape as a bare 500 without the template-layer label.
 */
function callChecked<T>(fn: () => T, what: string): T {
  try {
    return fn();
  } catch (cause) {
    throw templateRenderError(what, cause);
  }
}

/**
 * Represent one handler reply for one request — SYNCHRONOUS, so the
 * zero-middleware sync fast path stays promise-free. Returns the reply
 * unchanged for the JSON outcome; otherwise replaces ONLY `content`
 * (rendered HTML) and sets `content-type` without clobbering handler
 * headers — `status`/`cookies`/`redirect` pass through untouched. Adds
 * the swap header (and every `swapUnless` name) to `Vary` on every
 * templated response so an intermediary cache never serves a fragment
 * to a navigation (or vice versa).
 *
 * @throws {RapidError} RAPID_RESPONSE_INVALID when an HTML
 *   representation is asked of a stream/`Uint8Array` content — a
 *   template consumes data, not bytes.
 */
export function represent<S extends RapidContextState>(
  returned: RapidContextResponse,
  template: RapidRouteTemplate,
  ctx: HTTPContext<S>,
): RapidContextResponse {
  const appUi = uiOf(ctx);
  const vary = stampVary(ctx, appUi, returned);

  const swap = isSwap(ctx, appUi);
  if (returned.redirect !== undefined) {
    // A redirect has no body to template. A navigation keeps the
    // ordinary 301/302; a swap gets `200` + the redirect header instead
    // — fetch() follows 3xx transparently and would hand the runtime the
    // TARGET's body, the wrong thing to swap (D8). The bundled runtime
    // follows it same-origin only; htmx honours its own `HX-Redirect`
    // natively when `redirectHeader` names it.
    if (!swap) return returned;
    const { redirect: _redirect, status: _status, ...rest } = returned;
    const url = typeof returned.redirect === 'string'
      ? returned.redirect
      : returned.redirect.url;
    ctx.setHeader(appUi?.redirectHeader ?? 'rapid-redirect', url);
    // `ctx.redirect()` embeds `headers.location` too — a 200 swap reply
    // must not leak it beside the redirect header.
    const headers = new Headers(
      rest.headers instanceof Headers
        ? rest.headers
        : (rest.headers as Record<string, string> | undefined),
    );
    headers.delete('location');
    headers.set('vary', vary);
    return { ...rest, status: 200, content: '', headers };
  }
  if (!swap && (template.prefer ?? appUi?.prefer ?? 'json') === 'json') {
    // The reply goes out as-is — but when it carries its OWN headers
    // with a `vary`, hand back a copy carrying the merged value (reply
    // headers overwrite ctx's at finalize).
    if (replyHeader(returned.headers, 'vary') === null) return returned;
    const headers = new Headers(
      returned.headers instanceof Headers
        ? returned.headers
        : (returned.headers as Record<string, string>),
    );
    headers.set('vary', vary);
    return { ...returned, headers };
  }
  if (
    returned.content instanceof Uint8Array || isStreamBody(returned.content)
  ) {
    if (isStreamBody(returned.content)) {
      // Release the source (a file stream's fd, a generator's finally)
      // — the representation error must not leak it.
      void toReadableStream(returned.content).cancel();
    }
    throw new RapidError('RAPID_RESPONSE_INVALID', {
      message:
        'a templated route returned bytes/stream content — a template consumes data',
    });
  }

  const view = buildView(ctx);
  // An identity-bearing view — a csrf token, or the app's `view`
  // projection (which typically reads ctx.auth) — makes the rendered
  // HTML per-user: a shared cache must never hand one user's page (and
  // token) to another.
  const personal = view.csrfToken !== undefined || appUi?.view !== undefined;
  let markup = renderChecked(
    template.render,
    returned.content,
    view,
    `template '${template.render.name || 'for this route'}'`,
  );
  const titleOf = template.title;
  const title = typeof titleOf === 'function'
    ? callChecked(() => titleOf(returned.content), 'the route title callback')
    : titleOf;
  if (!swap) {
    // THE TWO WRAPPER TIERS (pages only — a swap is always the bare
    // fragment). Module tier: route → @Module → app default, `false`
    // opting out; its output nests inside the CORE (the document tier,
    // app-level, never overridden below) when one is configured. `title`
    // is handed to BOTH tiers; `meta` reaches only the core.
    const layout = template.layout === false
      ? undefined
      : template.layout ?? appUi?.layout;
    if (layout !== undefined) {
      markup = renderChecked(
        layout,
        { body: markup, ...(title !== undefined ? { title } : {}) },
        view,
        `layout '${layout.name || 'for this route'}'`,
      );
    }
    const core = appUi?.core;
    if (core !== undefined) {
      const metaOf = template.meta;
      const meta = typeof metaOf === 'function'
        ? callChecked(() => metaOf(returned.content), 'the route meta callback')
        : metaOf;
      markup = renderChecked(
        core,
        {
          body: markup,
          ...(title !== undefined ? { title } : {}),
          ...(meta !== undefined ? { meta } : {}),
        },
        view,
        `core '${core.name || ''}'`,
      );
    }
  } else if (title !== undefined) {
    // Swap replies carry the page title as a header so the history
    // module can sync document.title on pushed navigations — the swap
    // itself skips the core, which is where <title> lives.
    ctx.setHeader('rapid-title', encodeURIComponent(title));
  }
  const headers = new Headers(
    returned.headers instanceof Headers
      ? returned.headers
      : (returned.headers as Record<string, string> | undefined),
  );
  if (!headers.has('content-type')) {
    headers.set('content-type', 'text/html; charset=UTF-8');
  }
  let finalVary = vary;
  if (personal) {
    finalVary = mergeVary(vary, 'Cookie');
    ctx.setHeader('vary', finalVary);
    // `private` (not no-store): the user's own browser may cache; shared
    // caches must not. A handler's explicit cache policy wins.
    if (
      !headers.has('cache-control') &&
      ctx.responseHeaders.get('cache-control') === null
    ) {
      headers.set('cache-control', 'private');
    }
  }
  headers.set('vary', finalVary);
  return { ...returned, content: render(markup), headers };
}

/**
 * The HTML error representation (D9) — called from the post-onion
 * disclosure path, AFTER `app.onError` declined to override. Returns
 * `undefined` (JSON envelope as always) unless the representation
 * resolves to HTML: a swap, a matched route / app `prefer` of `'html'`,
 * or — on an UNMATCHED request with `errorTemplates` configured — an
 * `Accept` that explicitly prefers `text/html` (the one place Accept is
 * consulted, so a browser hitting an unknown URL gets the 404 page
 * while API clients keep the envelope; Accept joins `Vary` when read;
 * matched routes, templated or not, keep their declared shape).
 * The page template resolves through the CLOSED
 * `errorTemplates` registry (exact status → '4xx'/'5xx' → 'default' →
 * the built-in `DefaultErrorPage`); a swap renders the bare fragment, a
 * page wraps in the CORE only (module tier skipped). The disclosure
 * rules are the caller's: `payload` is exactly what the JSON envelope
 * would have carried (PRODUCTION-collapsed, `requestId` included), with
 * `status` and `mode` joined for template branching.
 */
export function representError<S extends RapidContextState>(
  status: number,
  payload: Record<string, unknown>,
  ctx: HTTPContext<S>,
  mode: 'DEVELOPMENT' | 'PRODUCTION' = 'PRODUCTION',
): RapidContextResponse | undefined {
  const appUi = uiOf(ctx);
  if (appUi === undefined) return undefined;
  const route = ctx.routeTemplate;
  const swap = isSwap(ctx, appUi);
  const prefer = route?.prefer ?? appUi.prefer ?? 'json';
  // An UNMATCHED request (the commonest error: a browser navigating to
  // an unknown URL) has no route `prefer` to consult — when the app
  // configured `errorTemplates`, the client's Accept decides instead
  // (the one place Accept is read: an explicit `text/html` earns the
  // error page, `*/*`/JSON clients keep the envelope). MATCHED routes —
  // templated or not — keep their declared representation: a JSON API
  // route's errors stay JSON no matter what a browser's Accept says.
  const negotiated = !ctx.matched && appUi.errorTemplates !== undefined;
  // Same cache rule as the success path: with HTML errors in play this
  // URL's error serves TWO representations, so the stamp lands BEFORE
  // the JSON bail — errors (a heuristically-cacheable 404 included)
  // must say so in both shapes, or a shared cache would hand a stored
  // JSON 404 to a swap. The ctx header survives into the JSON envelope
  // at finalize. When Accept was consulted it joins Vary for the same
  // reason.
  let vary = stampVary(ctx, appUi);
  if (negotiated) {
    vary = mergeVary(vary, 'Accept');
    ctx.setHeader('vary', vary);
  }
  const wantsHtml = swap || prefer === 'html' ||
    (negotiated &&
      negotiate(
          ctx.headers.get('accept'),
          ['application/json', 'text/html'],
        ) === 'text/html');
  if (!wantsHtml) return undefined;
  // The CLOSED registry, fixed resolution: exact status → class
  // ('4xx'/'5xx') → 'default' → the built-in DefaultErrorPage — so a
  // UI-configured app never shows a browser a raw JSON envelope.
  const templates = appUi.errorTemplates;
  const errorTemplate = templates?.[status] ??
    templates?.[status >= 500 ? '5xx' : '4xx'] ??
    templates?.default ?? DefaultErrorPage;
  const view = buildView(ctx);
  // Same personal-view rule as the success path (see represent()).
  const personal = view.csrfToken !== undefined || appUi.view !== undefined;
  if (personal) {
    vary = mergeVary(vary, 'Cookie');
    ctx.setHeader('vary', vary);
  }
  // The payload is the already-mode-collapsed disclosure — nothing
  // extra can leak; `status`/`mode` join it so one template can branch
  // without inferring from field absence.
  const data = { ...payload, status, mode };
  let markup = renderChecked(
    errorTemplate,
    data,
    view,
    `errorTemplate '${errorTemplate.name || ''}'`,
  );
  // Error pages wrap in the CORE only — the module tier is skipped
  // (errors are not module-scoped, and a module layout may depend on
  // the very data that failed). The core's title: "{status} {message}".
  if (!swap && appUi.core !== undefined) {
    const message = typeof payload.message === 'string' ? payload.message : '';
    markup = renderChecked(
      appUi.core,
      { body: markup, title: `${status} ${message}`.trim() },
      view,
      `core '${appUi.core.name || ''}'`,
    );
  }
  return {
    status: status as RapidContextResponse['status'],
    content: render(markup),
    headers: {
      'content-type': 'text/html; charset=UTF-8',
      vary,
      // Same guard as the success path: `private` only when nothing
      // stricter was already set — these reply headers overwrite ctx's
      // at finalize, and downgrading an explicit `no-store` would let a
      // browser disk-cache an authenticated error page.
      ...(personal && ctx.responseHeaders.get('cache-control') === null
        ? { 'cache-control': 'private' }
        : {}),
    },
  };
}
