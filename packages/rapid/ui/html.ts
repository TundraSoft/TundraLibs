/**
 * @fileoverview The UI rendering primitives — `html` (auto-escaping
 * tagged template), `raw` (the ONLY escape hatch, and therefore the
 * single audit point for unsafe markup), `render` (unwrap for the wire
 * and for tests), `template` (the typed factory routes reference), and
 * the {@link Html} trusted-markup box.
 *
 * Synchronous only, by design: async work belongs in the handler — a
 * template that needs to await is a handler that returned too little.
 *
 * @module
 */

import type { RapidTemplate, RapidView } from '../types/mod.ts';

/**
 * Module-private brand. An `Html` is recognized by this symbol-keyed
 * property, NOT a string key like `__html` — an object literal parsed
 * from a JSON body can never carry a symbol, so untrusted data cannot
 * impersonate trusted markup.
 */
const BRAND: unique symbol = Symbol('rapid.ui.Html');

/**
 * Trusted markup: a string that has already been escaped (built by
 * `html`) or explicitly vouched for (`raw`). Interpolating an `Html`
 * into `html` composes WITHOUT double-escaping; anything else is
 * escaped.
 */
export class Html {
  private readonly __value: string;

  /** Prefer `html` / `raw` — this is their shared box. */
  constructor(value: string) {
    this.__value = value;
    Object.defineProperty(this, BRAND, { value: true, enumerable: false });
  }
}

/**
 * Whether `value` is trusted `Html` (the symbol brand) — the guard the
 * representer uses to reject non-`Html` template returns loudly instead
 * of serializing garbage. Exported for the framework; apps rarely need
 * it.
 */
export const isHtml = (value: unknown): value is Html =>
  typeof value === 'object' && value !== null &&
  (value as Record<PropertyKey, unknown>)[BRAND] === true;

const unwrap = (markup: Html): string =>
  (markup as unknown as { __value: string }).__value;

const ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (c) => ESCAPES[c]!);

/**
 * One interpolated value → its markup string: `Html` passes through
 * un-re-escaped; arrays resolve element-wise and join with `''`;
 * `null` / `undefined` / `false` render as `''` (so `cond && html\`…\``
 * works for BOOLEAN conditions); everything else — `0` and `''`
 * included — goes through `String()` then escaping, which is why a
 * value-truthiness branch belongs in `when()`, not `&&`.
 */
const resolve = (value: unknown): string => {
  if (value === null || value === undefined || value === false) return '';
  if (isHtml(value)) return unwrap(value);
  if (Array.isArray(value)) return value.map(resolve).join('');
  return escapeHtml(String(value));
};

/**
 * Auto-escaping tagged template — EVERY interpolated value is escaped
 * (`& < > " '`) unless it is itself an `Html` (see {@link resolve} for
 * the full value rules).
 *
 * @example
 * ```ts
 * import { html, render } from '@tundralibs/rapid/ui';
 *
 * const items = ['a<b', 'c'];
 * const list = html`<ul>${items.map((i) => html`<li>${i}</li>`)}</ul>`;
 * render(list); // '<ul><li>a&lt;b</li><li>c</li></ul>'
 * ```
 */
export function html(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Html {
  let out = strings[0]!;
  for (let i = 0; i < values.length; i++) {
    out += resolve(values[i]) + strings[i + 1]!;
  }
  return new Html(out);
}

/**
 * Mark `value` as trusted markup, bypassing escaping — the ONLY opt-out,
 * for markup you already trust (e.g. a sanitized rich-text field). Never
 * used internally by the representer; grep for `raw(` to audit an app.
 */
export function raw(value: string): Html {
  return new Html(value);
}

/** Unwrap `markup` to its wire string — for the transport and for tests. */
export function render(markup: Html): string {
  return unwrap(markup);
}

/**
 * Wrap page content in a minimal, standards-mode HTML document —
 * doctype, `lang`, charset, viewport, `<title>` — the preamble every
 * layout otherwise hand-writes (and, when skipped, quirks-modes the
 * page). `head` extends `<head>` (styles, meta); everything is built
 * from `html` pieces, so interpolations stay escaped and no file is
 * ever read (Workers-safe).
 *
 * @example
 * ```ts
 * import { html, htmlDocument, template } from '@tundralibs/rapid/ui';
 *
 * const Shell = template<{ body: unknown; title?: string }>((data, view) =>
 *   htmlDocument({
 *     title: data.title ?? 'My app',
 *     head: html`<style>body { margin: 0 }</style>`,
 *     body: html`<main>${data.body}</main>
 *       <script src="${view.runtimePath}"></script>`,
 *   })
 * );
 * ```
 */
export function htmlDocument(
  doc: {
    lang?: string;
    title?: string;
    /**
     * Per-page metadata: `canonical` renders `<link rel="canonical">`,
     * an `og:`/`twitter:`-prefixed key renders `<meta property>`, and
     * every other key `<meta name>` — all values escaped. This is where
     * a core layout forwards the route's `meta` option.
     */
    meta?: Readonly<Record<string, string>>;
    head?: Html;
    body: Html;
  },
): Html {
  // Built from SHORT pieces: a formatter reflowing a long template
  // literal would otherwise inject whitespace into the emitted document
  // (before the doctype included).
  const meta = '<meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">';
  const pageMeta = Object.entries(doc.meta ?? {}).map(([key, value]) =>
    key === 'canonical'
      ? html`${raw('<link rel="canonical" href="')}${value}${raw('">')}`
      : key.startsWith('og:') || key.startsWith('twitter:')
      ? html`${raw('<meta property="')}${key}${raw('" content="')}${value}${
        raw('">')
      }`
      : html`${raw('<meta name="')}${key}${raw('" content="')}${value}${
        raw('">')
      }`
  );
  return html`${raw('<!doctype html><html lang="')}${doc.lang ?? 'en'}${
    raw('"><head>' + meta)
  }<title>${doc.title ?? ''}</title>${pageMeta}${doc.head ?? ''}${
    raw('</head><body>')
  }${doc.body}${raw('</body></html>')}`;
}

/**
 * Declare a template: a pure `(data, view) => Html` with a diagnostic
 * `name` (the variable name is not knowable at runtime; when omitted,
 * errors fall back to the route path). Templates never see `ctx` — the
 * frozen `view` bag is their only per-request context, and most ignore
 * it.
 */
export function template<
  D = unknown,
  Extra extends Record<string, unknown> = Record<never, never>,
>(
  renderFn: (data: D, view: RapidView<Extra>) => Html,
  name = '',
): RapidTemplate<D> {
  // Method bivariance on RapidTemplate.render accepts the narrower
  // Extra-typed view — the app's `view` projection is what actually
  // supplies those fields at request time.
  return { name, render: renderFn as (data: D, view: RapidView) => Html };
}
