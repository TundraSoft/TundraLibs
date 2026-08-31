/**
 * @fileoverview The representer — the innermost-onion step that turns a
 * templated route's data reply into HTML when the request asks for it.
 * Two deterministic signals decide (never `Accept`): the `rapid-swap`
 * request header (our client runtime) → the FRAGMENT, always; otherwise
 * the route's `prefer` → JSON unchanged (default) or the layout-wrapped
 * page. Runs before every middleware's post-`next()` view, so `etag`/
 * `compress`/loggers see the final HTML, not the data object.
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
import { escapeRegExp } from '../utils/mod.ts';
import { isStreamBody, toReadableStream } from '../utils/streams.ts';
import { type Html, html, isHtml, render, template } from './html.ts';

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
    ...(given?.layout ?? layout) !== undefined
      ? { layout: given?.layout ?? layout }
      : {},
    ...(given?.title !== undefined ? { title: given.title } : {}),
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
  if (config.layout !== undefined && !isTemplate(config.layout)) {
    throw new RapidError('RAPID_CONFIG', {
      message: `route '${label}': layout is not a RapidTemplate`,
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
 * `app.ui({ view })` projection (a later build step).
 */
export function buildView<S extends RapidContextState>(
  ctx: HTTPContext<S>,
): RapidView {
  const url = new URL(ctx.url);
  const csrfToken = ctx.cookies[ctx.app.uiOptions?.csrfCookie ?? 'csrf'];
  // The opt-in identity projection (`app.ui({ view })`) merges OVER the
  // defaults — its fields, and only its fields, cross from ctx into
  // template reach.
  const extra = ctx.app.uiOptions?.view?.(ctx as never);
  const assets = ctx.app.uiOptions?.assets;
  return Object.freeze({
    requestId: ctx.requestId,
    runtimePath: ctx.app.uiOptions?.runtimePath ?? '/__rapid/ui.js',
    // Unmapped paths pass through unchanged, so templates never branch.
    asset: (p: string): string => {
      const version = assets?.[p];
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
    if (vary === null) vary = name;
    else if (
      !new RegExp(`(^|,)\\s*${escapeRegExp(name)}\\s*(,|$)`, 'i').test(vary)
    ) {
      vary = `${vary}, ${name}`;
    }
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
    const err = cause instanceof Error ? cause : undefined;
    throw new RapidError('RAPID_TEMPLATE_RENDER', {
      message: `${what} threw while rendering`,
      ...(tpl.name ? { details: { template: tpl.name } } : {}),
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
  return assertHtml(out, what);
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
  let markup = renderChecked(
    template.render,
    returned.content,
    view,
    `template '${template.render.name || 'for this route'}'`,
  );
  const layout = template.layout ?? appUi?.layout;
  if (!swap && layout !== undefined) {
    const title = typeof template.title === 'function'
      ? template.title(returned.content)
      : template.title;
    markup = renderChecked(
      layout,
      { body: markup, ...(title !== undefined ? { title } : {}) },
      view,
      `layout '${layout.name || 'for this route'}'`,
    );
  }
  const headers = new Headers(
    returned.headers instanceof Headers
      ? returned.headers
      : (returned.headers as Record<string, string> | undefined),
  );
  if (!headers.has('content-type')) {
    headers.set('content-type', 'text/html; charset=UTF-8');
  }
  headers.set('vary', vary);
  return { ...returned, content: render(markup), headers };
}

/**
 * The HTML error representation (D9) — called from the post-onion
 * disclosure path, AFTER `app.onError` declined to override. Returns
 * `undefined` (JSON envelope as always) unless an `errorTemplate` is
 * configured AND the representation resolves to HTML: a swap, or a
 * matched route / app `prefer` of `'html'`. A swap renders the bare
 * fragment; a page wraps in the route's layout (the app's as fallback).
 * The disclosure rules are the caller's: `payload` is exactly what the
 * JSON envelope would have carried (PRODUCTION-collapsed, `requestId`
 * included).
 */
export function representError<S extends RapidContextState>(
  status: number,
  payload: Record<string, unknown>,
  ctx: HTTPContext<S>,
  mode: 'DEVELOPMENT' | 'PRODUCTION' = 'PRODUCTION',
): RapidContextResponse | undefined {
  const appUi = uiOf(ctx);
  if (appUi === undefined) return undefined;
  // No errorTemplate: PRODUCTION keeps the JSON envelope; DEVELOPMENT
  // gets a built-in escaped <pre> so a failed swap shows its failure
  // IN the page instead of a silent rapid:error toast. The payload is
  // the already-mode-collapsed disclosure — nothing extra leaks.
  const errorTemplate = appUi.errorTemplate ??
    (mode === 'DEVELOPMENT'
      ? template<Record<string, unknown>>((data) =>
        html`
          <pre class="rapid-error"
            style="background:#450a0a;color:#fecaca;padding:1rem;border-radius:8px;overflow:auto"
          >${JSON.stringify(data, null, 2)}</pre>
        `, 'rapid-dev-error')
      : undefined);
  if (errorTemplate === undefined) return undefined;
  const route = ctx.routeTemplate;
  const swap = isSwap(ctx, appUi);
  const prefer = route?.prefer ?? appUi.prefer ?? 'json';
  // Same cache rule as the success path: with an errorTemplate in play
  // this URL's error serves TWO representations, so the stamp lands
  // BEFORE the JSON bail — errors (a heuristically-cacheable 404
  // included) must say so in both shapes, or a shared cache would hand
  // a stored JSON 404 to a swap. The ctx header survives into the JSON
  // envelope at finalize.
  const vary = stampVary(ctx, appUi);
  if (!swap && prefer !== 'html') return undefined;
  const view = buildView(ctx);
  let markup = renderChecked(
    errorTemplate,
    payload,
    view,
    `errorTemplate '${errorTemplate.name || ''}'`,
  );
  const layout = route?.layout ?? appUi.layout;
  if (!swap && layout !== undefined) {
    markup = renderChecked(
      layout,
      { body: markup },
      view,
      `layout '${layout.name || ''}'`,
    );
  }
  return {
    status: status as RapidContextResponse['status'],
    content: render(markup),
    headers: { 'content-type': 'text/html; charset=UTF-8', vary },
  };
}
