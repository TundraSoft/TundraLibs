/**
 * @fileoverview `@tundralibs/rapid/ui` — the opt-in UI layer: escaping
 * render primitives and the template factory routes reference via
 * `{ template }`. The root barrel re-exports NOTHING from here — an
 * API-only app pays nothing at runtime. See docs/Rapid-UI.md (the
 * consumer contract; design record in DESIGN-ui.md).
 *
 * @module
 */

export { Html, html, htmlDocument, raw, render, template } from './html.ts';
export { UI_LIVE, UI_LIVE_ETAG } from './live.ts';
export { UI_RUNTIME, UI_RUNTIME_ETAG } from './ui.ts';
export { withQuery } from './withQuery.ts';
export type {
  RapidRouteTemplate,
  RapidTemplate,
  RapidUiOptions,
  RapidView,
} from '../types/mod.ts';
